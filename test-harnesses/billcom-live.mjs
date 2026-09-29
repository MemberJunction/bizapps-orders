/**
 * billcom-live.mjs — probes against a BILL sandbox, through the same connector path the rail uses.
 * NEVER CI. Answers the plan's spikes S1–S5 (docs/superpowers/plans/2026-09-20-billcom-integration.md,
 * Task 1) and, once a provider row exists, runs the rail end to end.
 *
 * Environment (from ../.env, like invoice-live.mjs): DB_HOST, DB_PORT, DB_DATABASE, DB_USERNAME, DB_PASSWORD,
 * MJ_CORE_SCHEMA; plus
 *   BILLCOM_COMPANY_INTEGRATION_ID   the MJ: Company Integrations row whose credential is the SANDBOX Bill.com Session
 *   BILLCOM_PROBE                    login | customer | invoice | archive-put | payments | numbering | send-default | rail-issue | rail-poll
 *   BILLCOM_CUSTOMER_ID              (invoice probe) a 0cu… id from the customer probe
 *   BILLCOM_INVOICE_ID               (archive-put / send-default / record-payment) a 00e… id
 *   BILLCOM_AMOUNT                   (record-payment) the amount to record; BILLCOM_PAYMENT_TYPE defaults to CHECK
 *   BILLCOM_DUP_NUMBER               (invoice probe, S4) an invoiceNumber already used, to test uniqueness
 *   BILLCOM_PAYMENT_PROVIDER_ID      (rail-*) the Orders PaymentProvider row of type BillCom (IsLiveMode 0)
 *   BILLCOM_ORDER_ID                 (rail-issue) a Confirmed order for that provider's company
 *
 * Usage: BILLCOM_PROBE=login node test-harnesses/billcom-live.mjs
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import sql from 'mssql';

const here = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(here, '..', '.env'), quiet: true });

const log = (label, v) => console.log(`\n== ${label}\n${JSON.stringify(v, null, 2)}`);
const need = (name) => {
    const v = process.env[name];
    if (!v) throw new Error(`${name} is required for this probe`);
    return v;
};

async function main() {
    const { DB_HOST, DB_PORT, DB_DATABASE, DB_USERNAME, DB_PASSWORD } = process.env;
    const pool = await new sql.ConnectionPool({
        server: DB_HOST,
        port: Number(DB_PORT ?? 1433),
        database: DB_DATABASE,
        user: DB_USERNAME,
        password: DB_PASSWORD,
        options: { trustServerCertificate: true, encrypt: false },
        pool: { max: 5, min: 1 },
    }).connect();
    const { setupSQLServerClient, SQLServerProviderConfigData } = await import('@memberjunction/sqlserver-dataprovider');
    const { UserCache } = await import('@memberjunction/generic-database-provider');
    await setupSQLServerClient(new SQLServerProviderConfigData(pool, process.env.MJ_CORE_SCHEMA || '__mj'));
    await UserCache.Instance.Refresh(pool);
    const user = UserCache.Users.find((u) => u?.Type?.trim().toLowerCase() === 'owner') ?? UserCache.Users[0];
    if (!user) throw new Error('No context user in UserCache.');

    // The connector registers itself on import; the host does this through mj.config.cjs dynamicPackages.
    await import('@memberjunction/connector-bill-com').catch((e) => {
        throw new Error(`@memberjunction/connector-bill-com is not installed here (${e.message}). pnpm add it to the package that runs this, or run from the host.`);
    });
    // Register the generated entity classes of EVERY app whose rows this touches. Without them MJ
    // falls back to plain BaseEntity, every typed field reads undefined, and the accounting engine
    // silently resolves no GL account links — which looks exactly like a missing configuration.
    (await import('@mj-biz-apps/accounting-entities')).LoadGeneratedEntities?.();
    (await import('@mj-biz-apps/common-entities')).LoadGeneratedEntities?.();
    // …and accounting's SERVER classes, which register Accounting.CreateJournalEntries. Confirming an
    // order books through it, so without this the confirm fails inside the accounting call.
    (await import('@mj-biz-apps/accounting-server')).LoadBizAppsAccountingServer?.();
    const ordersServer = await import('@mj-biz-apps/orders-server');
    ordersServer.LoadBizAppsOrdersServer?.();

    // The connector's generic CRUD reads IntegrationObject metadata from this cache; the rail's gateway
    // loads it itself, but the raw connector probes below go around the gateway.
    const { IntegrationEngineBase } = await import('@memberjunction/integration-engine-base');
    await IntegrationEngineBase.Instance.Config(false, user);

    const { Metadata } = await import('@memberjunction/core');
    const { ConnectorFactory } = await import('@memberjunction/integration-engine');
    const provider = Metadata.Provider;

    const probe = process.env.BILLCOM_PROBE ?? 'login';

    if (probe.startsWith('rail-')) {
        const core = await import('@mj-biz-apps/orders-core-entities-server');
        const entities = await import('@mj-biz-apps/orders-entities');
        const providerID = need('BILLCOM_PAYMENT_PROVIDER_ID');
        if (probe === 'rail-issue') {
            const r = await new entities.OrdersIssueExternalInvoiceOperation().Execute(
                { OrderHeaderID: need('BILLCOM_ORDER_ID'), Preview: process.env.BILLCOM_PREVIEW !== 'false' },
                { provider, user },
            );
            log('Orders.IssueExternalInvoice', r.Output ?? r);
        } else if (probe === 'rail-poll') {
            const r = await new entities.OrdersPollExternalPaymentsOperation().Execute(
                { PaymentProviderID: providerID, Preview: process.env.BILLCOM_PREVIEW !== 'false', SinceWatermark: process.env.BILLCOM_SINCE ?? null },
                { provider, user },
            );
            log('Orders.PollExternalPayments', r.Output ?? r);
        } else {
            const rail = await core.ResolveInvoiceRail(providerID, provider, user);
            log('ResolveInvoiceRail', { Type: rail.constructor.name, Config: rail.Config });
        }
        await pool.close();
        return;
    }

    const ciID = need('BILLCOM_COMPANY_INTEGRATION_ID');
    const ci = await provider.GetEntityObject('MJ: Company Integrations', user);
    const { CompositeKey } = await import('@memberjunction/core');
    if (!(await ci.InnerLoad(CompositeKey.FromID(ciID)))) throw new Error(`No Company Integration ${ciID}`);
    const integration = await provider.GetEntityObject('MJ: Integrations', user);
    await integration.InnerLoad(CompositeKey.FromID(ci.IntegrationID));
    const connector = ConnectorFactory.Resolve(integration);
    const base = { CompanyIntegration: ci, ContextUser: user };

    switch (probe) {
        case 'login':
            log('TestConnection', await connector.TestConnection(ci, user));
            break;
        case 'customer': {
            const r = await connector.CreateRecord({ ...base, ObjectName: 'customers', Attributes: { name: `Probe ${Date.now()}`, email: `probe+${Date.now()}@example.com`, accountNumber: 'PROBE' } });
            log('customers.create', r);
            if (r.ExternalID) log('customers.get', await connector.GetRecord({ ...base, ObjectName: 'customers', ExternalID: r.ExternalID }));
            break;
        }
        case 'invoice': {
            const cust = need('BILLCOM_CUSTOMER_ID');
            const r = await connector.CreateRecord({ ...base, ObjectName: 'invoices', Attributes: {
                invoiceNumber: `PROBE-${Date.now()}`, invoiceDate: new Date().toISOString().slice(0, 10), dueDate: new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10),
                customer: { id: cust },
                invoiceLineItems: [{ description: 'Probe line A', quantity: 2, price: 100.0 }, { description: 'Probe line B', quantity: 1, price: 50.25 }],
            } });
            log('invoices.create (expect 201; S4: totalAmount should be 250.25 on read-back)', r);
            if (r.ExternalID) log('invoices.get', await connector.GetRecord({ ...base, ObjectName: 'invoices', ExternalID: r.ExternalID }));
            if (process.env.BILLCOM_DUP_NUMBER) {
                log('invoices.create duplicate invoiceNumber (S4: accepted or refused?)', await connector.CreateRecord({ ...base, ObjectName: 'invoices', Attributes: {
                    invoiceNumber: process.env.BILLCOM_DUP_NUMBER, customer: { id: cust }, invoiceLineItems: [{ description: 'dup', quantity: 1, price: 1 }] } }));
            }
            break;
        }
        case 'archive-put': { // S1
            const id = need('BILLCOM_INVOICE_ID');
            log('invoices.update {archived:true} (S1)', await connector.UpdateRecord({ ...base, ObjectName: 'invoices', ExternalID: id, Attributes: { archived: true } }));
            const back = await connector.GetRecord({ ...base, ObjectName: 'invoices', ExternalID: id });
            log('invoices.get after — archived must read true or U1 is blocking', { archived: back?.Fields?.archived, status: back?.Fields?.status });
            break;
        }
        case 'archive-post': { // U1 fallback — the v3 archive verb, through the connector's own session (protected helpers, JS-visible)
            const id = need('BILLCOM_INVOICE_ID');
            const auth = await connector.Authenticate(ci, user);
            const baseURL = connector.GetBaseURL(ci, auth);
            const headers = connector.BuildHeaders(auth);
            const putRaw = await connector.MakeHTTPRequest(auth, `${baseURL}/invoices/${id}`, 'PUT', headers, { archived: true });
            log('raw PUT /invoices/{id} {archived:true} — why the generic update is refused', { Status: putRaw.Status, Body: putRaw.Body });
            const post = await connector.MakeHTTPRequest(auth, `${baseURL}/invoices/${id}/archive`, 'POST', headers, undefined);
            log('raw POST /invoices/{id}/archive', { Status: post.Status, Body: post.Body });
            const again = await connector.MakeHTTPRequest(auth, `${baseURL}/invoices/${id}/archive`, 'POST', headers, undefined);
            log('raw POST /invoices/{id}/archive again — idempotent?', { Status: again.Status, Body: typeof again.Body === 'object' && again.Body ? { archived: again.Body.archived, status: again.Body.status, message: again.Body.message } : again.Body });
            const back = await connector.GetRecord({ ...base, ObjectName: 'invoices', ExternalID: id });
            log('invoices.get after', { archived: back?.Fields?.archived, status: back?.Fields?.status, recordStatus: back?.Fields?.recordStatus });
            break;
        }
        case 'record-payment': { // Proves the capture leg: money against an invoice Orders issued.
            const invoiceID = need('BILLCOM_INVOICE_ID');
            const amount = Number(need('BILLCOM_AMOUNT'));
            const auth = await connector.Authenticate(ci, user);
            const baseURL = connector.GetBaseURL(ci, auth);
            const body = {
                amount,
                paymentDate: new Date().toISOString().slice(0, 10),
                paymentType: process.env.BILLCOM_PAYMENT_TYPE ?? 'CHECK',
                description: process.env.BILLCOM_PAYMENT_MEMO ?? 'Capture-leg proof',
                invoices: [{ id: invoiceID, amount }],
            };
            if (process.env.BILLCOM_CUSTOMER_ID) body.customerId = process.env.BILLCOM_CUSTOMER_ID;
            // Version-agnostic: connector 0.3.1 returns a base ending in /connect/v3, the fixed build
            // returns /connect. Normalise, then add the version once (Integrations #390).
            const root = `${baseURL.replace(/\/+$/, '').replace(/\/v3$/, '')}/v3`;
            const r = await connector.MakeHTTPRequest(auth, `${root}/invoices/record-payment`, 'POST', connector.BuildHeaders(auth), body);
            log('POST /v3/invoices/record-payment', { Status: r.Status, Body: r.Body });
            break;
        }
        case 'payments': { // S2 / S3
            const t0 = Date.now();
            const r = await connector.FetchChanges({ ...base, ObjectName: 'receivable-payments', WatermarkValue: process.env.BILLCOM_SINCE ?? '2026-01-01T00:00:00.000Z', BatchSize: 100 });
            log('receivable-payments.fetch', {
                ms: Date.now() - t0, count: r.Records.length, hasMore: r.HasMore, nextCursor: r.NextCursor ?? null, newWatermark: r.NewWatermarkValue ?? null,
                statuses: [...new Set(r.Records.map((x) => JSON.stringify(x.Fields.status)))],
                onlinePayment: [...new Set(r.Records.map((x) => x.Fields.onlinePayment))],
                receivablesType: [...new Set(r.Records.map((x) => JSON.stringify(x.Fields.receivablesType)))],
                sample: r.Records.slice(0, 3).map((x) => x.Fields),
            });
            break;
        }
        case 'numbering': { // Re-issue suffix (golive #242, Craig) + the invoiceNumber length ceiling.
            const cust = need('BILLCOM_CUSTOMER_ID');
            const mk = async (invoiceNumber, note) => {
                const r = await connector.CreateRecord({ ...base, ObjectName: 'invoices', Attributes: {
                    invoiceNumber, invoiceDate: new Date().toISOString().slice(0, 10),
                    customer: { id: cust }, invoiceLineItems: [{ description: note, quantity: 1, price: 10 }],
                } });
                return { note, invoiceNumber, len: invoiceNumber.length, ok: !!r.Success, id: r.ExternalID ?? null, error: r.Success ? null : String(r.ErrorMessage ?? '').slice(0, 220) };
            };
            const stamp = Date.now().toString().slice(-8);
            const baseNum = `ORD-${stamp}`;

            // 1. the original, then archive it — the cancel the ruling is about.
            const first = await mk(baseNum, 'original');
            log('1. original invoice', first);
            if (first.id) {
                const auth = await connector.Authenticate(ci, user);
                const root = `${connector.GetBaseURL(ci, auth).replace(/\/+$/, '').replace(/\/v3$/, '')}/v3`;
                const arch = await connector.MakeHTTPRequest(auth, `${root}/invoices/${first.id}/archive`, 'POST', connector.BuildHeaders(auth), undefined);
                log('2. archive it', { Status: arch.Status });
            }

            // 3. THE CLAIM UNDER TEST: an archived invoice still owns its number.
            log('3. reuse the number after archiving (expect REFUSED)', await mk(baseNum, 'reuse'));

            // 4. and the suffix the ruling prescribes must be accepted.
            log('4. the -R1 suffix (expect ACCEPTED)', await mk(`${baseNum}-R1`, 're-issue'));
            log('5. the split-company form -A-R1 (expect ACCEPTED)', await mk(`${baseNum}-A-R1`, 'split re-issue'));

            // 6. where does BILL stop accepting length? Our own column is NVARCHAR(40).
            const ladder = [];
            for (const len of [20, 40, 41, 50, 51, 64, 100, 256]) {
                const n = (`L${len}-${stamp}-`).padEnd(len, 'X').slice(0, len);
                ladder.push(await mk(n, `len ${len}`));
            }
            log('6. invoiceNumber length ladder — the ceiling Andrew asked for', ladder.map(({ len, ok, error }) => ({ len, ok, error })));
            break;
        }
        case 'duplicate': { // Does an ARCHIVED invoice still own its number? S4 only ever tested a LIVE one.
            const cust = need('BILLCOM_CUSTOMER_ID');
            const auth = await connector.Authenticate(ci, user);
            const root = `${connector.GetBaseURL(ci, auth).replace(/\/+$/, '').replace(/\/v3$/, '')}/v3`;
            const mk = async (invoiceNumber) => {
                const r = await connector.CreateRecord({ ...base, ObjectName: 'invoices', Attributes: {
                    invoiceNumber, invoiceDate: new Date().toISOString().slice(0, 10),
                    customer: { id: cust }, invoiceLineItems: [{ description: 'dup probe', quantity: 1, price: 10 }],
                } });
                return { ok: !!r.Success, id: r.ExternalID ?? null, error: r.Success ? null : String(r.ErrorMessage ?? '').slice(0, 200) };
            };
            const num = `DUP-${Date.now().toString().slice(-8)}`;
            const a = await mk(num);
            log(`A. create ${num}`, a);
            log('B. SAME number while A is LIVE (S4 said refused)', await mk(num));
            const arch = await connector.MakeHTTPRequest(auth, `${root}/invoices/${a.id}/archive`, 'POST', connector.BuildHeaders(auth), undefined);
            log('C. archive A', { Status: arch.Status });
            const back = await connector.GetRecord({ ...base, ObjectName: 'invoices', ExternalID: a.id });
            log('   A now reads', { archived: back?.Fields?.archived, status: back?.Fields?.status });
            log('D. SAME number now that A is ARCHIVED — the case that was never tested', await mk(num));
            break;
        }
        case 'adopt': { // Orders.AdoptExternalInvoice against the real rail (review round 2, finding 2).
            const orderID = need('BILLCOM_ORDER_ID');
            const companyID = need('BILLCOM_COMPANY_ID');
            const providerID = need('BILLCOM_PAYMENT_PROVIDER_ID');
            const cust = need('BILLCOM_CUSTOMER_ID');
            const { AdoptExternalInvoiceOperation } = await import('@mj-biz-apps/orders-core-entities-server');
            const { Metadata } = await import('@memberjunction/core');
            const md = Metadata.Provider;

            const num = `ADOPT-${Date.now().toString().slice(-8)}`;
            const amount = 123.45;
            const mkInvoice = async (invoiceNumber, price) => {
                const r = await connector.CreateRecord({ ...base, ObjectName: 'invoices', Attributes: {
                    invoiceNumber, invoiceDate: new Date().toISOString().slice(0, 10),
                    customer: { id: cust }, invoiceLineItems: [{ description: 'adopt probe', quantity: 1, price }],
                } });
                return r.ExternalID;
            };
            // A claimed row is what a timed-out send leaves behind; this makes one to resolve.
            const claim = async () => {
                const e = await md.GetEntityObject('MJ_BizApps_Orders: External Invoices', user);
                e.NewRecord();
                e.SetMany({ PaymentProviderID: providerID, OrderHeaderID: orderID, CompanyID: companyID, OrderHeaderPaymentScheduleID: null,
                    DocumentNumber: num, Amount: amount, Status: 'Sending' }, true);
                if (!(await e.Save())) throw new Error(`could not write the claim: ${e.LatestResult?.CompleteMessage}`);
                return String(e.Get('ID'));
            };
            const run = async (id, ref) => {
                const op = new AdoptExternalInvoiceOperation();
                const r = await op.Execute({ ExternalInvoiceID: id, ExternalInvoiceRef: ref }, { provider: md, user });
                return { ResultCode: r.Output?.ResultCode, Success: r.Output?.Success, Message: r.Output?.Message?.slice(0, 200) };
            };
            const statusOf = async (id) => {
                const e = await md.GetEntityObject('MJ_BizApps_Orders: External Invoices', user);
                const { CompositeKey } = await import('@memberjunction/core');
                await e.InnerLoad(CompositeKey.FromID(id));
                return { Status: e.Get('Status'), Ref: e.Get('ExternalInvoiceRef'), ExternalTotal: e.Get('ExternalTotal') };
            };

            // 1. the rail holds a DIFFERENT document at the same figure — the wrong-row paste.
            const other = await mkInvoice(`${num}-OTHERDOC`, amount);
            const c1 = await claim();
            log('1. adopt a reference for a different document number', await run(c1, other));
            log('   row untouched', await statusOf(c1));

            // 2. the rail's invoice is ARCHIVED — the refusal the total cannot make.
            const arch = await mkInvoice(`${num}-ARCH`, amount);
            const auth = await connector.Authenticate(ci, user);
            const root = `${connector.GetBaseURL(ci, auth).replace(/\/+$/, '').replace(/\/v3$/, '')}/v3`;
            await connector.MakeHTTPRequest(auth, `${root}/invoices/${arch}/archive`, 'POST', connector.BuildHeaders(auth), undefined);
            log('2. adopt an ARCHIVED invoice', await run(c1, arch));
            log('   row untouched', await statusOf(c1));

            // 3. the figure does not tie.
            const wrong = await mkInvoice(`${num}`, amount + 10);
            log('3. adopt an invoice whose total does not tie', await run(c1, wrong));
            log('   row untouched', await statusOf(c1));

            // 4. the real thing: same number, same figure, live.
            await connector.MakeHTTPRequest(auth, `${root}/invoices/${wrong}/archive`, 'POST', connector.BuildHeaders(auth), undefined);
            const right = await mkInvoice(num, amount);
            log('4. adopt the invoice this unit actually raised', await run(c1, right));
            log('   row now', await statusOf(c1));
            break;
        }
        case 'send-default': // S5
            log('invoices.get — look for any sent/emailed indicator', await connector.GetRecord({ ...base, ObjectName: 'invoices', ExternalID: need('BILLCOM_INVOICE_ID') }));
            break;
        default:
            throw new Error(`Unknown BILLCOM_PROBE '${probe}'`);
    }
    await pool.close();
}

main().catch((err) => {
    console.error(`\nbillcom-live failed: ${err instanceof Error ? err.stack ?? err.message : String(err)}`);
    process.exit(1);
});
