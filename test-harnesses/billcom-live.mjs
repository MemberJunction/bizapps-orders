/**
 * billcom-live.mjs — probes against a BILL sandbox, through the same connector path the rail uses.
 * NEVER CI. Answers the plan's spikes S1–S5 (docs/superpowers/plans/2026-09-20-billcom-integration.md,
 * Task 1) and, once a provider row exists, runs the rail end to end.
 *
 * Environment (from ../.env, like invoice-live.mjs): DB_HOST, DB_PORT, DB_DATABASE, DB_USERNAME, DB_PASSWORD,
 * MJ_CORE_SCHEMA; plus
 *   BILLCOM_COMPANY_INTEGRATION_ID   the MJ: Company Integrations row whose credential is the SANDBOX Bill.com Session
 *   BILLCOM_PROBE                    login | customer | invoice | archive-put | payments | send-default | rail-issue | rail-poll
 *   BILLCOM_CUSTOMER_ID              (invoice probe) a 0cu… id from the customer probe
 *   BILLCOM_INVOICE_ID               (archive-put / send-default) a 00e… id from the invoice probe
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
    const ordersServer = await import('@mj-biz-apps/orders-server');
    ordersServer.LoadBizAppsOrdersServer?.();

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
