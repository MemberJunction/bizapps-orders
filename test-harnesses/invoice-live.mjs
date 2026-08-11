/**
 * LIVE invoice harness — renders EVERY order in the database and checks the documents against it.
 *
 * WHY A SWEEP AND NOT MORE UNIT TESTS. The integration bundle builds the shapes it wants to check.
 * This runs the renderer over whatever is actually in the database — every status, every customer,
 * the multi-company orders, the returns, the ones with no address on file — and asserts the one
 * thing that must hold for all of them: the documents an order produces sum back to
 * `OrderHeader.TotalGross`. A presentation bug that only shows up on the fourteenth order is
 * exactly the kind nobody writes a test for in advance.
 *
 * It also writes a few documents to disk so somebody can LOOK at them. An invoice is a design
 * artefact as much as an arithmetic one, and no assertion catches a page that adds up and looks
 * like a ransom note.
 *
 * Writes nothing to the database — the renderer has nothing to write.
 *
 * Usage:  node test-harnesses/invoice-live.mjs [--out <dir>] [--demo]
 *
 * `--demo` additionally renders ONE fully-populated document through the same stored template. The
 * seeded orders carry no remit-to address, no payment terms and no due date, so every real sample
 * comes out sparse — which reads as a thin design when it is actually a thin seed. The demo passes
 * realistic content through the identical template and engine, so it shows what the template does
 * rather than what the fixture happens to contain. It is a preview, not a test: nothing asserts on it.
 */
import path from 'node:path';
import { importAccountingPackage } from './resolve-app-packages.mjs';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import sql from 'mssql';

const here = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(here, '..', '.env'), quiet: true });

const ORDERS = '__mj_BizAppsOrders';

const args = process.argv.slice(2);
const outIndex = args.indexOf('--out');
const OUT_DIR = outIndex >= 0 ? args[outIndex + 1] : path.resolve(here, '..', '.invoice-samples');
const DEMO = args.includes('--demo');

let pass = 0;
let fail = 0;
const failures = [];

function check(label, condition, detail = '') {
    if (condition) {
        pass++;
    } else {
        fail++;
        failures.push(`${label}${detail ? ` — ${detail}` : ''}`);
    }
}

const money = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

async function main() {
    const { DB_HOST, DB_PORT, DB_DATABASE, DB_USERNAME, DB_PASSWORD } = process.env;
    const pool = await new sql.ConnectionPool({
        server: DB_HOST,
        port: Number(DB_PORT ?? 1433),
        database: DB_DATABASE,
        user: DB_USERNAME,
        password: DB_PASSWORD,
        options: { trustServerCertificate: true, encrypt: false },
        pool: { max: 10, min: 1 },
    }).connect();

    const { setupSQLServerClient, SQLServerProviderConfigData, UserCache } = await import(
        '@memberjunction/sqlserver-dataprovider'
    );
    await setupSQLServerClient(new SQLServerProviderConfigData(pool, process.env.MJ_CORE_SCHEMA || '__mj'));
    await UserCache.Instance.Refresh(pool);

    const user = UserCache.Users.find((u) => u?.Type?.trim().toLowerCase() === 'owner') ?? UserCache.Users[0];
    if (!user) throw new Error('No context user in UserCache.');

    await importAccountingPackage('@mj-biz-apps/accounting-server');
    const ordersServer = await import('@mj-biz-apps/orders-server');
    ordersServer.LoadBizAppsOrdersServer?.();
    const acctServer = await importAccountingPackage('@mj-biz-apps/accounting-server');
    acctServer.LoadBizAppsAccountingServer?.();

    const { Metadata } = await import('@memberjunction/core');
    const { MJGlobal } = await import('@memberjunction/global');
    const { BaseAction } = await import('@memberjunction/actions');
    // `Metadata.Provider`, not `new Metadata()`: the latter is a facade over the provider and has no
    // RunView on it, which surfaces at the first read rather than at the hand-off.
    const provider = Metadata.Provider;

    const action = MJGlobal.Instance.ClassFactory.CreateInstance(BaseAction, 'Orders.GenerateInvoice');
    if (!action) throw new Error("'Orders.GenerateInvoice' is not registered — is the server bootstrap anchoring it?");

    const run = async (inputs) => {
        const params = {
            ContextUser: user,
            Provider: provider,
            Params: Object.entries(inputs).map(([Name, Value]) => ({ Name, Value, Type: 'Input' })),
            Filters: [],
        };
        const result = await action.Run(params);
        const out = (name) => params.Params.find((p) => p.Name === name)?.Value;
        return { result, invoices: out('Invoices') ?? [], html: out('HTML') ?? null, notes: out('Notes') ?? [] };
    };

    const orders = (
        await pool.request().query(`
            SELECT h.ID, h.OrderNumber, h.Status, h.TotalGross, h.AmountPaid,
                   (SELECT COUNT(DISTINCT l.CompanyID) FROM ${ORDERS}.OrderLine l WHERE l.OrderHeaderID = h.ID) AS Companies,
                   (SELECT COUNT(*) FROM ${ORDERS}.OrderLine l WHERE l.OrderHeaderID = h.ID) AS Lines
            FROM ${ORDERS}.OrderHeader h
            ORDER BY h.OrderNumber`)
    ).recordset;

    console.log(`\n=== Rendering ${orders.length} orders ===\n`);

    const noted = [];
    const samples = { multi: null, credit: null, paid: null, discounted: null, plain: null };
    const started = Date.now();

    for (const order of orders) {
        const { result, invoices, notes } = await run({ OrderID: order.ID, AsOfDate: '2026-07-31', ShowDiagnostics: false });

        if (order.Status === 'Voided') {
            check(`${order.OrderNumber} voided is refused`, result.Success === false && invoices.length === 0);
            continue;
        }

        if (!result.Success) {
            check(`${order.OrderNumber} renders`, false, result.Message);
            continue;
        }

        // THE INVARIANT. Everything else on the page is presentation; this is the money.
        const summed = money(invoices.reduce((s, d) => s + d.Gross, 0));
        check(
            `${order.OrderNumber} documents sum to the order`,
            summed === money(order.TotalGross),
            `documents ${summed} vs order ${money(order.TotalGross)}`,
        );

        check(
            `${order.OrderNumber} produced one document per selling company`,
            invoices.length === order.Companies,
            `${invoices.length} documents for ${order.Companies} companies`,
        );

        // Money received must not exceed money billed, per document — an over-application printed as
        // a negative amount due on one half of a split order is a refund nobody authorised.
        const paid = money(invoices.reduce((s, d) => s + (d.Data?.AmountPaid ?? 0), 0));
        check(
            `${order.OrderNumber} payments reconcile`,
            paid === money(order.AmountPaid),
            `documents ${paid} vs order ${money(order.AmountPaid)}`,
        );

        for (const doc of invoices) {
            check(`${doc.DocumentNumber} ladder walks to its total`, ladderTies(doc), ladderDetail(doc));
            check(`${doc.DocumentNumber} HTML is self-contained`, isSelfContained(doc.HTML), 'reaches outside itself');
            check(`${doc.DocumentNumber} due = gross - paid`, money(doc.Gross - (doc.Data?.AmountPaid ?? 0)) === money(doc.AmountDue));
        }

        if (notes.length) noted.push({ order: order.OrderNumber, notes });

        // Keep one of each interesting shape to look at.
        const first = invoices[0];
        if (!samples.multi && invoices.length > 1) samples.multi = invoices;
        if (!samples.credit && first?.Kind === 'Credit Memo') samples.credit = invoices;
        if (!samples.paid && first?.Data?.IsSettled) samples.paid = invoices;
        if (!samples.discounted && first?.Data?.DiscountTotal > 0) samples.discounted = invoices;
        if (!samples.plain && first?.Kind === 'Invoice' && order.Lines >= 2 && !first.Data?.IsSettled) samples.plain = invoices;
    }

    const elapsed = ((Date.now() - started) / 1000).toFixed(1);

    await fs.mkdir(OUT_DIR, { recursive: true });
    const written = [];
    for (const [name, docs] of Object.entries(samples)) {
        if (!docs) continue;
        for (const [i, doc] of docs.entries()) {
            const file = path.join(OUT_DIR, `${name}${docs.length > 1 ? `-${i + 1}` : ''}.html`);
            await fs.writeFile(file, doc.HTML ?? '');
            written.push(`${path.basename(file)}  (${doc.DocumentNumber}, ${doc.Kind})`);
        }
    }

    if (DEMO) {
        const file = path.join(OUT_DIR, 'demo.html');
        await fs.writeFile(file, await renderDemo(user, provider));
        written.push(`${path.basename(file)}  (fully-populated preview, not from the database)`);
    }

    console.log(`Rendered ${orders.length} orders in ${elapsed}s`);
    console.log(`\nSamples written to ${OUT_DIR}:`);
    for (const w of written) console.log(`  ${w}`);

    if (noted.length) {
        console.log(`\n⚠️  ${noted.length} orders carried diagnostic notes:`);
        for (const n of noted.slice(0, 10)) console.log(`  ${n.order}: ${n.notes.join(' | ')}`);
    } else {
        console.log(`\nNo diagnostic notes on any order — nothing had to be placed by judgement.`);
    }

    console.log(`\n${fail === 0 ? '✅' : '❌'} ${pass} passed, ${fail} failed`);
    for (const f of failures.slice(0, 20)) console.log(`  ✖ ${f}`);

    await pool.close();
    process.exit(fail === 0 ? 0 : 1);
}

/**
 * One fully-populated document, through the REAL template and the REAL display layer.
 *
 * Everything below is invented content, and it is built as `InvoiceOrderFacts` etc. rather than as
 * finished HTML so it goes through `BuildDocuments` and `DecorateInvoice` exactly as a database row
 * would. A preview that bypassed those would show a page the code cannot actually produce.
 */
async function renderDemo(user, provider) {
    const { BuildDocuments, DecorateInvoice } = await import('@mj-biz-apps/orders-core-entities-server');
    const { TemplateEngineServer } = await import('@memberjunction/templates');

    const CO = 'c0000000-0000-0000-0000-000000000001';
    const line = (over) => ({
        ProductSKU: null, Description: null, CompanyID: CO, CompanyName: 'Ardent Instruments',
        DiscountAmount: 0, ChargeAmount: 0, LineTax: 0, ServicePeriodStart: null, ServicePeriodEnd: null,
        ParentOrderLineID: null, IsRollupParent: false, ReversesOrderLineID: null, ...over,
    });

    // Tax is 7% (6% state + 1% county) on each line's net. The numbers are worked out rather than
    // sketched: the first draft of this preview had allocations that did not sum to their charges,
    // and the template dutifully printed the unexplained remainder as its own tax row — which is the
    // guard doing its job, and a good reminder that the demo has to be as consistent as real data.
    const lines = [
        line({ ID: 'l1', LineNumber: 1, ProductID: 'p1', ProductName: 'Benchtop spectrometer, model S-400',
               ProductSKU: 'ARD-S400', Quantity: 2, UnitPrice: 4250, LineTotalNet: 8075,
               Description: 'Includes calibration certificate and two-year warranty.',
               ChargeAmount: 62.5, LineTax: 565.25, LineTotalGross: 8702.75 }),
        line({ ID: 'l2', LineNumber: 2, ProductID: 'p2', ProductName: 'Extended service plan',
               ProductSKU: 'ARD-SVC-24', Quantity: 1, UnitPrice: 1200, LineTotalNet: 1200,
               ServicePeriodStart: '2026-08-01', ServicePeriodEnd: '2028-07-31',
               ChargeAmount: 0, LineTax: 84, LineTotalGross: 1284 }),
        line({ ID: 'l3', LineNumber: 3, ProductID: 'p3', ProductName: 'Field starter kit', Quantity: 1,
               UnitPrice: 900, LineTotalNet: 0, IsRollupParent: true, LineTotalGross: 0 }),
        line({ ID: 'l4', LineNumber: 4, ProductID: 'p4', ProductName: 'Sample cuvette set (12)',
               ProductSKU: 'ARD-CUV-12', Quantity: 1, UnitPrice: 540, LineTotalNet: 540,
               ParentOrderLineID: 'l3', ChargeAmount: 12.5, LineTax: 37.8, LineTotalGross: 590.3 }),
        line({ ID: 'l5', LineNumber: 5, ProductID: 'p5', ProductName: 'Transport case',
               ProductSKU: 'ARD-CASE', Quantity: 1, UnitPrice: 360, LineTotalNet: 360,
               ParentOrderLineID: 'l3', ChargeAmount: 12.5, LineTax: 25.2, LineTotalGross: 397.7 }),
    ];

    const gross = lines.reduce((s, l) => s + l.LineTotalGross, 0);

    const [doc] = BuildDocuments({
        Order: {
            ID: 'o1', OrderNumber: 'ORD-1041', OrderType: 'Sale', OrderDate: '2026-07-02',
            Status: 'Confirmed', CompanyID: CO, CompanyName: 'Ardent Instruments',
            TotalGross: gross, AmountPaid: 3000, Balance: gross - 3000, DueDate: '2026-08-01',
            PaymentStatus: 'Partly paid', ExternalDocumentNumber: 'PO-77213',
            ReversesOrderHeaderID: null, ReversesOrderNumber: null, ReversalReason: null,
            Description: null, PaymentTermsName: 'Net 30', PaymentTermsNetDays: 30,
        },
        Lines: lines,
        Charges: [
            { ID: 'c1', Name: 'Freight and handling', Category: 'Shipping', Amount: 87.5, Rate: null, Sequence: 10,
              Allocations: [
                { OrderLineID: 'l1', Amount: 62.5 },
                { OrderLineID: 'l4', Amount: 12.5 },
                { OrderLineID: 'l5', Amount: 12.5 },
              ] },
            { ID: 'c2', Name: 'PA state sales tax', Category: 'Tax', Amount: 610.5, Rate: 0.06, Sequence: 20,
              Allocations: [
                { OrderLineID: 'l1', Amount: 484.5 },
                { OrderLineID: 'l2', Amount: 72 },
                { OrderLineID: 'l4', Amount: 32.4 },
                { OrderLineID: 'l5', Amount: 21.6 },
              ] },
            { ID: 'c3', Name: 'Allegheny County tax', Category: 'Tax', Amount: 101.75, Rate: 0.01, Sequence: 21,
              Allocations: [
                { OrderLineID: 'l1', Amount: 80.75 },
                { OrderLineID: 'l2', Amount: 12 },
                { OrderLineID: 'l4', Amount: 5.4 },
                { OrderLineID: 'l5', Amount: 3.6 },
              ] },
        ],
        Adjustments: [
            { ID: 'a1', OrderLineID: 'l1', PromotionName: 'Instrument trade-in credit', PromotionCode: 'TRADEIN26',
              Reason: null, Amount: 425, Allocations: [{ OrderLineID: 'l1', Amount: 425 }] },
        ],
        Payments: [
            { PaymentHeaderID: 'pm1', PaymentNumber: 'PMT-2210', PaymentDate: '2026-07-08',
              PaymentTypeName: 'ACH', Amount: 3000, Allocations: [{ OrderLineID: null, Amount: 3000 }] },
        ],
        BillTo: {
            Name: 'Keystone Analytical Labs',
            AttentionOf: 'Accounts Payable',
            AddressLines: ['400 Liberty Avenue', 'Suite 1900', 'Pittsburgh, PA 15222', 'United States'],
            Email: 'ap@keystone-labs.example',
        },
        ShipTo: {
            Name: 'Keystone Analytical Labs \u2014 Bay 4',
            AttentionOf: null,
            AddressLines: ['2200 Neville Road', 'Pittsburgh, PA 15225', 'United States'],
            Email: null,
        },
        Issuers: new Map([[CO, {
            CompanyID: CO,
            Name: 'Ardent Instruments',
            AddressLines: ['1 Foundry Square', 'Philadelphia, PA 19106', 'United States'],
            Email: 'billing@ardent.example',
            Phone: '+1 215 555 0140',
            Website: 'ardent.example',
            TaxID: '47-0913318',
            CurrencyCode: 'USD',
        }]]),
        AsOf: '2026-07-10',
    });

    if (doc.Notes.length) throw new Error(`the demo document does not tie: ${doc.Notes.join(' | ')}`);

    const decorated = DecorateInvoice(doc, { Locale: 'en-US', Currency: 'USD', GeneratedOn: '2026-07-10' });

    const engine = TemplateEngineServer.Instance;
    await engine.Config(false, user, provider);
    const template = engine.FindTemplate('Orders: Standard Invoice');
    const content = template.GetHighestPriorityContent('HTML');
    const rendered = await engine.RenderTemplate(template, content, { doc: decorated, options: {} }, true, true);
    if (!rendered.Success) throw new Error(rendered.Message);
    return rendered.Output;
}

/** Subtotal, less every discount, plus every charge and tax, must reach the total row. */
function ladderTies(doc) {
    const rows = doc.Data?.Ladder ?? [];
    const subtotal = rows.find((r) => r.Kind === 'Subtotal')?.Amount ?? 0;
    const middle = rows.filter((r) => ['Discount', 'Charge', 'Tax'].includes(r.Kind)).reduce((s, r) => s + r.Amount, 0);
    const total = rows.find((r) => r.Kind === 'Total')?.Amount ?? 0;
    return money(subtotal + middle) === money(total) && money(total) === money(doc.Gross);
}

function ladderDetail(doc) {
    const rows = doc.Data?.Ladder ?? [];
    return rows.map((r) => `${r.Kind}:${r.Amount}`).join(' ');
}

/** The page is handed to a headless browser and pasted into email bodies; it must fetch nothing. */
function isSelfContained(html) {
    if (!html) return true;
    return ![/\<link[^>]+rel=["']?stylesheet/i, /\<script/i, /@import/i, /src=["']https?:/i, /url\(["']?https?:/i].some((p) =>
        p.test(html),
    );
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
