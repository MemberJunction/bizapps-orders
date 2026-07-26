/**
 * Seed a COMMITTED demo dataset for hands-on review.
 *
 * The integration suite deliberately leaves nothing behind — every check runs inside a transaction
 * that rolls back (D48), which is what makes it re-runnable but also why the database looks empty
 * after a green run. This script is the opposite: it drives the same engine paths and COMMITS, so
 * there is a coherent dataset to click through in Explorer and to test against by hand.
 *
 * It is a demo seed, not a test. Nothing here asserts; it prints what it created so you can find it.
 * Every path it exercises is covered by the suite — the point of this file is to leave the results
 * where a human can see them.
 *
 * WHAT IT BUILDS
 *   One company ("Demo Publishing Co") with a real chart-of-accounts subset: AR, Sales, Deferred
 *   Revenue, Cash. Two customers. A product catalog spanning every revenue behaviour we support.
 *   Then a set of orders in deliberately different states, so each screen has something to show:
 *
 *     ORD-1  a plain sale, unpaid                       → open receivable
 *     ORD-2  a plain sale, paid in full at confirm      → AR nets to zero, cash in
 *     ORD-3  a two-line sale, partially paid            → PartiallyPaid, split tender
 *     ORD-4  an event ticket (AllBackEnd)               → deferred until the event date
 *     ORD-5  an annual membership (rolling)             → subscription + 12 monthly releases
 *     ORD-6  a calendar-anchored membership, prorated   → short first term, prorated price
 *     ORD-7  a membership later CANCELLED               → mirrored reversal + refund
 *     ORD-8  a membership RENEWED by the engine         → contiguous term 2
 *
 * Usage:
 *   node test-harnesses/seed-demo-data.mjs           # add a demo dataset
 *   node test-harnesses/seed-demo-data.mjs --reset   # remove previous demo data first
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import dotenv from 'dotenv';
import sql from 'mssql';

const here = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(here, '..', '.env'), quiet: true });

const ORDERS = '__mj_BizAppsOrders';
const ACCT = '__mj_BizAppsAccounting';
const COMMON = '__mj_BizAppsCommon';

/** Everything this script creates carries this marker, so --reset can find it. */
const DEMO_TAG = 'DEMO';

const args = process.argv.slice(2);
const doReset = args.includes('--reset');

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
const provider = await setupSQLServerClient(
    new SQLServerProviderConfigData(pool, process.env.MJ_CORE_SCHEMA || '__mj'),
);
await UserCache.Instance.Refresh(pool);
const user = UserCache.Users.find((u) => u?.Type?.trim().toLowerCase() === 'owner') ?? UserCache.Users[0];
if (!user) throw new Error('No context user in UserCache.');

// Both apps' server classes — orders' subclasses book, accounting's operation writes the ledger.
await import('@mj-biz-apps/accounting-server').then((m) => m.LoadBizAppsAccountingServer?.());
await import('@mj-biz-apps/orders-server').then((m) => m.LoadBizAppsOrdersServer?.());

const { Metadata, RunView, BaseRemotableOperation } = await import('@memberjunction/core');
const { MJGlobal } = await import('@memberjunction/global');
const md = new Metadata();

const q = async (text) => (await pool.request().query(text)).recordset ?? [];
const entityID = (name) => {
    const e = md.Entities.find((x) => x.Name === name);
    if (!e) throw new Error(`Entity '${name}' not found — has CodeGen run?`);
    return e.ID;
};

const say = (msg) => console.log(msg);
const step = (msg) => console.log(`\n\x1b[1m${msg}\x1b[0m`);

// ─── Reset ─────────────────────────────────────────────────────────────────────

if (doReset) {
    step('Removing previous demo data');
    const scope = `SELECT ID FROM __mj.Company WHERE Name LIKE '${DEMO_TAG}%'`;
    const orders = `SELECT ID FROM ${ORDERS}.OrderHeader WHERE CompanyID IN (${scope})`;
    // FK-ordered, and the immutability triggers must be stood down: they exist precisely to stop
    // booked history being deleted, which is right in production and inconvenient for a demo reset.
    const statements = [
        `DISABLE TRIGGER ${ORDERS}.trg_OrderLine_ImmutableAfterConfirm ON ${ORDERS}.OrderLine`,
        `DISABLE TRIGGER ${ORDERS}.trg_PaymentHeader_ImmutableAfterCapture ON ${ORDERS}.PaymentHeader`,
        `UPDATE ${ORDERS}.OrderLine SET JournalEntryID=NULL WHERE OrderHeaderID IN (${orders})`,
        `UPDATE ${ORDERS}.PaymentHeader SET JournalEntryID=NULL WHERE ReceivingCompanyID IN (${scope})`,
        `DELETE jel FROM ${ACCT}.JournalEntryLine jel JOIN ${ACCT}.JournalEntry je ON je.ID=jel.JournalEntryID WHERE je.CompanyID IN (${scope})`,
        `DELETE FROM ${ACCT}.JournalEntry WHERE CompanyID IN (${scope})`,
        `UPDATE ${ORDERS}.OrderHeader SET InitialPaymentDetailID=NULL WHERE CompanyID IN (${scope})`,
        `DELETE FROM ${ORDERS}.PaymentLine WHERE OrderHeaderID IN (${orders})`,
        `DELETE FROM ${ORDERS}.PaymentHeader WHERE ReceivingCompanyID IN (${scope})`,
        `DELETE FROM ${ORDERS}.PaymentDetail WHERE CompanyID IN (${scope})`,
        `DELETE FROM ${ORDERS}.SubscriptionEvent WHERE SubscriptionID IN (SELECT ID FROM ${ORDERS}.Subscription WHERE CompanyID IN (${scope}))`,
        `DELETE FROM ${ORDERS}.SubscriptionTerm WHERE SubscriptionID IN (SELECT ID FROM ${ORDERS}.Subscription WHERE CompanyID IN (${scope}))`,
        `DELETE FROM ${ORDERS}.Subscription WHERE CompanyID IN (${scope})`,
        `DELETE FROM ${ORDERS}.OrderLine WHERE OrderHeaderID IN (${orders})`,
        `DELETE FROM ${ORDERS}.OrderHeader WHERE CompanyID IN (${scope})`,
        `DELETE FROM ${ORDERS}.Product WHERE CompanyID IN (${scope})`,
        `DELETE FROM ${ORDERS}.ProductCategory WHERE CompanyID IN (${scope})`,
        `DELETE FROM ${ORDERS}.ProductType WHERE Name LIKE '${DEMO_TAG}%'`,
        `DELETE FROM ${ACCT}.GLAccountLink WHERE RecordID IN (${scope})`,
        `DELETE FROM ${ACCT}.JournalEntrySequence WHERE CompanyID IN (${scope})`,
        `DELETE FROM ${ACCT}.GLAccount WHERE CompanyID IN (${scope})`,
        `DELETE FROM ${ACCT}.AccountingCompanyProfile WHERE ID IN (${scope})`,
        `DELETE FROM __mj.Company WHERE Name LIKE '${DEMO_TAG}%'`,
        `DELETE FROM ${COMMON}.Organization WHERE Name LIKE '${DEMO_TAG}%'`,
        `DELETE FROM ${COMMON}.Person WHERE LastName LIKE '${DEMO_TAG}%'`,
        `ENABLE TRIGGER ${ORDERS}.trg_OrderLine_ImmutableAfterConfirm ON ${ORDERS}.OrderLine`,
        `ENABLE TRIGGER ${ORDERS}.trg_PaymentHeader_ImmutableAfterCapture ON ${ORDERS}.PaymentHeader`,
    ];
    for (const s of statements) {
        try {
            const r = await pool.request().query(s);
            if (r.rowsAffected?.[0]) say(`  ${r.rowsAffected[0]} × ${s.split(' WHERE')[0].replace(/^(DELETE|UPDATE)\s+(FROM\s+)?/, '')}`);
        } catch (e) {
            console.warn(`  warn: ${String(e.message).split('\n')[0]}`);
        }
    }
}

// ─── Company + chart of accounts ───────────────────────────────────────────────

step('Company and chart of accounts');

const currency = (await q(`SELECT TOP 1 Code FROM ${ACCT}.Currency`))[0]?.Code;
if (!currency) throw new Error('No currencies — push the accounting app metadata first.');

const companyID = randomUUID();
const companyName = `${DEMO_TAG} Publishing Co`;
await q(`INSERT INTO __mj.Company (ID, Name, Description)
         VALUES ('${companyID}','${companyName}','Demo data for hands-on review — safe to delete')`);
await q(`INSERT INTO ${ACCT}.AccountingCompanyProfile
            (ID, CompanyCode, FunctionalCurrencyCode, EntityType, OperatingTimeZone, IsActive)
         VALUES ('${companyID}','${companyID.slice(0, 8).toUpperCase()}','${currency}','Subsidiary','UTC',1)`);

const COA = [
    { role: 'Cash', code: '10100', name: 'Cash — Operating', type: 'Asset' },
    { role: 'Accounts Receivable', code: '11201', name: 'Accounts Receivable', type: 'Asset' },
    { role: 'Deferred Revenue', code: '21301', name: 'Deferred Revenue', type: 'Liability' },
    { role: 'Sales', code: '40100', name: 'Sales Revenue', type: 'Revenue' },
];
const roleIDs = new Map((await q(`SELECT ID, Name FROM ${ACCT}.GLAccountRole`)).map((r) => [r.Name, r.ID]));
const accounts = {};
for (const a of COA) {
    const id = randomUUID();
    await q(`INSERT INTO ${ACCT}.GLAccount (ID, CompanyID, Code, Name, AccountType, IsActive)
             VALUES ('${id}','${companyID}','${a.code}','${a.name}','${a.type}',1)`);
    await q(`INSERT INTO ${ACCT}.GLAccountLink (ID, GLAccountID, GLAccountRoleID, EntityID, RecordID, Status)
             VALUES ('${randomUUID()}','${id}','${roleIDs.get(a.role)}','${entityID('MJ: Companies')}','${companyID}','Active')`);
    accounts[a.role] = id;
    say(`  ${a.code} ${a.name} → role '${a.role}'`);
}

// The engine caches accounts and links, so it must re-read them before anything books.
const { AccountingEngineBase } = await import('@mj-biz-apps/accounting-engine-base');
await AccountingEngineBase.Instance.Config(true, user, provider);

// ─── Customers ─────────────────────────────────────────────────────────────────

step('Customers');
const orgID = randomUUID();
await q(`INSERT INTO ${COMMON}.Organization (ID, Name) VALUES ('${orgID}','${DEMO_TAG} Riverside Library')`);
const org2ID = randomUUID();
await q(`INSERT INTO ${COMMON}.Organization (ID, Name) VALUES ('${org2ID}','${DEMO_TAG} Northgate Schools')`);
const personID = randomUUID();
await q(`INSERT INTO ${COMMON}.Person (ID, FirstName, LastName) VALUES ('${personID}','Dana','${DEMO_TAG}')`);
say(`  Riverside Library, Northgate Schools, Dana ${DEMO_TAG}`);

// ─── Catalog ───────────────────────────────────────────────────────────────────

step('Product catalog');
const revRec = new Map((await q(`SELECT ID, Code FROM ${ORDERS}.RevenueRecognitionType`)).map((r) => [r.Code, r.ID]));
const subTypes = new Map((await q(`SELECT ID, Code FROM ${ORDERS}.SubscriptionType`)).map((r) => [r.Code, r.ID]));
const payTypes = new Map((await q(`SELECT ID, Code FROM ${ORDERS}.PaymentType`)).map((r) => [r.Code, r.ID]));

const goodsTypeID = randomUUID();
await q(`INSERT INTO ${ORDERS}.ProductType (ID, Name, RequiresFulfillment, IsActive)
         VALUES ('${goodsTypeID}','${DEMO_TAG} Goods',1,1)`);
const servicesTypeID = randomUUID();
await q(`INSERT INTO ${ORDERS}.ProductType (ID, Name, RequiresFulfillment, IsActive)
         VALUES ('${servicesTypeID}','${DEMO_TAG} Services',0,1)`);

const catalogCatID = randomUUID();
await q(`INSERT INTO ${ORDERS}.ProductCategory (ID, CompanyID, Name, IsActive)
         VALUES ('${catalogCatID}','${companyID}','${DEMO_TAG} Catalog',1)`);

async function product(name, revRecCode, subTypeCode = null, typeID = servicesTypeID) {
    const id = randomUUID();
    await q(`INSERT INTO ${ORDERS}.Product
                (ID, CompanyID, ProductTypeID, ProductCategoryID, Name, Status, RevenueRecognitionTypeID, SubscriptionTypeID, IsTaxable)
             VALUES ('${id}','${companyID}','${typeID}','${catalogCatID}','${name}','Active',
                     '${revRec.get(revRecCode)}',${subTypeCode ? `'${subTypes.get(subTypeCode)}'` : 'NULL'},0)`);
    say(`  ${name}  (${revRecCode}${subTypeCode ? `, ${subTypeCode}` : ''})`);
    return id;
}

const products = {
    handbook: await product(`${DEMO_TAG} Style Handbook`, 'UpFront', null, goodsTypeID),
    workshop: await product(`${DEMO_TAG} Editing Workshop Seat`, 'UpFront'),
    conference: await product(`${DEMO_TAG} Annual Conference Ticket`, 'AllBackEnd'),
    membership: await product(`${DEMO_TAG} Individual Membership`, 'EvenOverTime', 'AnnualRolling'),
    calendarMembership: await product(`${DEMO_TAG} Institutional Membership`, 'EvenOverTime', 'CalendarYear'),
};

// ─── Orders ────────────────────────────────────────────────────────────────────

async function confirmOrder({ lines, customer, orderDate, initialPayment, note }) {
    const order = await md.GetEntityObject('MJ_BizApps_Orders: Order Headers', user);
    order.NewRecord();
    order.OrderType = 'Sale';
    order.OrderDate = orderDate ?? new Date();
    order.Status = 'Draft';
    order.CompanyID = companyID;
    if (customer?.org) order.CustomerOrganizationID = customer.org;
    if (customer?.person) order.CustomerPersonID = customer.person;
    if (note) order.Notes = note;
    if (initialPayment) {
        order.InitialPaymentTypeID = payTypes.get(initialPayment.type);
        order.InitialPaymentAmount = initialPayment.amount;
    }

    const built = [];
    let n = 1;
    for (const spec of lines) {
        const line = await md.GetEntityObject('MJ_BizApps_Orders: Order Lines', user);
        line.NewRecord();
        line.ProductID = spec.product;
        line.LineNumber = n++;
        line.Quantity = spec.qty;
        line.UnitPrice = spec.price;
        line.DiscountPct = spec.discount ?? 0;
        if (spec.from) line.ServicePeriodStart = new Date(spec.from);
        if (spec.to) line.ServicePeriodEnd = new Date(spec.to);
        built.push(line);
    }
    order.Lines = built;
    order.Status = 'Confirmed';

    if (!(await order.Save())) {
        throw new Error(`confirm failed: ${order.LatestResult?.CompleteMessage ?? 'unknown'}`);
    }
    const row = (await q(`SELECT OrderNumber, TotalGross, AmountPaid, Balance, PaymentStatus
                          FROM ${ORDERS}.OrderHeader WHERE ID='${order.ID}'`))[0];
    say(`  ${row.OrderNumber}  gross ${row.TotalGross}  paid ${row.AmountPaid}  balance ${row.Balance}  ${row.PaymentStatus}`);
    return order;
}

/**
 * Capture a payment and apply it to an order AFTER the fact.
 *
 * Needed because the D42 initial-payment intent is stated at order ENTRY, before the total is known
 * — and a prorated subscription's price is only computed at confirm. So "pay this order in full"
 * cannot be pre-declared for those; it has to read the balance the order actually landed on. The
 * over-application guard rejects a guess, which is how this got noticed.
 */
async function payOrder(orderID, typeCode, amount) {
    const balance = amount ?? Number((await q(`SELECT Balance FROM ${ORDERS}.OrderHeader WHERE ID='${orderID}'`))[0].Balance);
    const payment = await md.GetEntityObject('MJ_BizApps_Orders: Payment Headers', user);
    payment.NewRecord();
    payment.PaymentNumber = `DEMO-${randomUUID().slice(0, 8).toUpperCase()}`;
    payment.ReceivingCompanyID = companyID;
    payment.PaymentTypeID = payTypes.get(typeCode);
    payment.Amount = balance;
    payment.PaymentDate = new Date();
    payment.Status = 'Captured';
    if (!(await payment.Save())) {
        throw new Error(`payment failed: ${payment.LatestResult?.CompleteMessage ?? 'unknown'}`);
    }
    const line = await md.GetEntityObject('MJ_BizApps_Orders: Payment Lines', user);
    line.NewRecord();
    line.PaymentHeaderID = payment.ID;
    line.OrderHeaderID = orderID;
    line.Amount = balance;
    line.AllocatedAt = new Date();
    if (!(await line.Save())) {
        throw new Error(`apply failed: ${line.LatestResult?.CompleteMessage ?? 'unknown'}`);
    }
    say(`  paid ${balance} via ${typeCode} → ${payment.PaymentNumber}`);
    return payment;
}

step('Orders');

const o1 = await confirmOrder({
    lines: [{ product: products.handbook, qty: 3, price: 45 }],
    customer: { org: orgID },
    note: 'Unpaid — an open receivable to look at',
});

const o2 = await confirmOrder({
    lines: [{ product: products.workshop, qty: 2, price: 150 }],
    customer: { org: org2ID },
    initialPayment: { type: 'Check', amount: 300 },
    note: 'Paid in full at confirm — AR nets to zero and the cash leg is booked',
});

const o3 = await confirmOrder({
    lines: [
        { product: products.handbook, qty: 10, price: 45, discount: 0.1 },
        { product: products.workshop, qty: 1, price: 150 },
    ],
    customer: { org: orgID },
    initialPayment: { type: 'ACH', amount: 200 },
    note: 'Partially paid — a discounted line plus split tender',
});

const o4 = await confirmOrder({
    lines: [{ product: products.conference, qty: 4, price: 275, from: '2027-04-12', to: '2027-04-14' }],
    customer: { org: org2ID },
    note: 'Event tickets — nothing is earned until the conference happens',
});

const o5 = await confirmOrder({
    lines: [{ product: products.membership, qty: 1, price: 240 }],
    customer: { person: personID },
    initialPayment: { type: 'CreditCard', amount: 240 },
    note: 'Annual membership — 12 monthly recognition entries already in the ledger',
});

const o6 = await confirmOrder({
    lines: [{ product: products.calendarMembership, qty: 1, price: 1200 }],
    customer: { org: orgID },
    orderDate: new Date('2026-07-01T00:00:00Z'),
    note: 'Calendar-year membership bought mid-year — short first term at a prorated price',
});

// ─── Cancellation ──────────────────────────────────────────────────────────────

step('Cancellation');
const toCancel = await confirmOrder({
    lines: [{ product: products.calendarMembership, qty: 1, price: 1200 }],
    customer: { org: org2ID },
    orderDate: new Date('2026-07-01T00:00:00Z'),
    note: 'This membership gets cancelled below',
});
// Paid after the fact, for the reason payOrder documents: the prorated total is not knowable at
// order entry, so the intent amount cannot be stated up front for this product.
await payOrder(toCancel.ID, 'CreditCard');
const cancelSub = (await q(`SELECT s.ID, s.SubscriptionNumber FROM ${ORDERS}.Subscription s
                            JOIN ${ORDERS}.SubscriptionTerm t ON t.SubscriptionID = s.ID
                            JOIN ${ORDERS}.OrderLine ol ON ol.ID = t.OrderLineID
                            WHERE ol.OrderHeaderID='${toCancel.ID}'`))[0];

const cancelOp = MJGlobal.Instance.ClassFactory.CreateInstance(BaseRemotableOperation, 'Orders.CancelSubscription');
const cancelled = await cancelOp.Execute(
    { SubscriptionID: cancelSub.ID, RequestDate: '2026-10-01', Reason: 'Institution merged' },
    { provider, user },
);
say(`  ${cancelSub.SubscriptionNumber}: ${cancelled.Output?.Message ?? cancelled.ErrorMessage}`);

// ─── Renewal ───────────────────────────────────────────────────────────────────

step('Renewal');
const toRenew = await confirmOrder({
    lines: [{ product: products.membership, qty: 1, price: 240 }],
    customer: { org: orgID },
    orderDate: new Date('2026-01-01T00:00:00Z'),
    note: 'This membership is renewed by the engine below',
});
const renewSub = (await q(`SELECT s.ID, s.SubscriptionNumber, t.EndDate FROM ${ORDERS}.Subscription s
                           JOIN ${ORDERS}.SubscriptionTerm t ON t.SubscriptionID = s.ID
                           JOIN ${ORDERS}.OrderLine ol ON ol.ID = t.OrderLineID
                           WHERE ol.OrderHeaderID='${toRenew.ID}'`))[0];

const renewOp = MJGlobal.Instance.ClassFactory.CreateInstance(BaseRemotableOperation, 'Orders.SpawnRenewals');
const renewed = await renewOp.Execute(
    { SubscriptionID: renewSub.ID, AsOfDate: '2026-12-01' },
    { provider, user },
);
say(`  ${renewSub.SubscriptionNumber}: ${renewed.Output?.Message ?? renewed.ErrorMessage}`);

// ─── Refund ────────────────────────────────────────────────────────────────────

step('Refund');
const paidPayment = (await q(`SELECT ph.ID, ph.PaymentNumber, ph.Amount
                              FROM ${ORDERS}.PaymentHeader ph
                              JOIN ${ORDERS}.PaymentLine pl ON pl.PaymentHeaderID = ph.ID
                              WHERE pl.OrderHeaderID='${o2.ID}' AND ph.Status='Captured'`))[0];
if (paidPayment) {
    const refundOp = MJGlobal.Instance.ClassFactory.CreateInstance(BaseRemotableOperation, 'Orders.RefundPayment');
    const refunded = await refundOp.Execute(
        { PaymentHeaderID: paidPayment.ID, Amount: 150, Reason: 'One seat released' },
        { provider, user },
    );
    say(`  ${paidPayment.PaymentNumber}: ${refunded.Output?.Message ?? refunded.ErrorMessage}`);
}

// ─── Summary ───────────────────────────────────────────────────────────────────

step(`Done — everything below is COMMITTED under company '${companyName}'`);

const counts = await q(`
    SELECT 'Orders'              AS Thing, COUNT(*) AS N FROM ${ORDERS}.OrderHeader   WHERE CompanyID='${companyID}'
    UNION ALL SELECT 'Order lines',        COUNT(*) FROM ${ORDERS}.OrderLine ol JOIN ${ORDERS}.OrderHeader o ON o.ID=ol.OrderHeaderID WHERE o.CompanyID='${companyID}'
    UNION ALL SELECT 'Payments',           COUNT(*) FROM ${ORDERS}.PaymentHeader      WHERE ReceivingCompanyID='${companyID}'
    UNION ALL SELECT 'Payment lines',      COUNT(*) FROM ${ORDERS}.PaymentLine pl JOIN ${ORDERS}.OrderHeader o ON o.ID=pl.OrderHeaderID WHERE o.CompanyID='${companyID}'
    UNION ALL SELECT 'Subscriptions',      COUNT(*) FROM ${ORDERS}.Subscription       WHERE CompanyID='${companyID}'
    UNION ALL SELECT 'Subscription terms', COUNT(*) FROM ${ORDERS}.SubscriptionTerm t JOIN ${ORDERS}.Subscription s ON s.ID=t.SubscriptionID WHERE s.CompanyID='${companyID}'
    UNION ALL SELECT 'Lifecycle events',   COUNT(*) FROM ${ORDERS}.SubscriptionEvent e JOIN ${ORDERS}.Subscription s ON s.ID=e.SubscriptionID WHERE s.CompanyID='${companyID}'
    UNION ALL SELECT 'Journal entries',    COUNT(*) FROM ${ACCT}.JournalEntry         WHERE CompanyID='${companyID}'
    UNION ALL SELECT 'Journal lines',      COUNT(*) FROM ${ACCT}.JournalEntryLine jel JOIN ${ACCT}.JournalEntry je ON je.ID=jel.JournalEntryID WHERE je.CompanyID='${companyID}'`);
for (const row of counts) say(`  ${String(row.N).padStart(4)}  ${row.Thing}`);

step('Ledger position');
const trial = await q(`
    SELECT gl.Code, gl.Name,
           SUM(ISNULL(jel.DebitAmount,0))  AS Debits,
           SUM(ISNULL(jel.CreditAmount,0)) AS Credits,
           SUM(ISNULL(jel.DebitAmount,0)) - SUM(ISNULL(jel.CreditAmount,0)) AS Net
    FROM ${ACCT}.JournalEntryLine jel
    JOIN ${ACCT}.GLAccount gl ON gl.ID = jel.GLAccountID
    JOIN ${ACCT}.JournalEntry je ON je.ID = jel.JournalEntryID
    WHERE je.CompanyID='${companyID}'
    GROUP BY gl.Code, gl.Name ORDER BY gl.Code`);
for (const r of trial) {
    say(`  ${r.Code}  ${String(r.Name).padEnd(22)} Dr ${String(r.Debits).padStart(10)}  Cr ${String(r.Credits).padStart(10)}  net ${String(r.Net).padStart(10)}`);
}
const totalDr = trial.reduce((s, r) => s + Number(r.Debits), 0);
const totalCr = trial.reduce((s, r) => s + Number(r.Credits), 0);
say(`\n  Trial balance: debits ${totalDr.toFixed(2)} vs credits ${totalCr.toFixed(2)} — ${Math.abs(totalDr - totalCr) < 0.005 ? 'BALANCED' : 'OUT OF BALANCE'}`);

say(`\nFind it in Explorer by filtering any orders entity on company '${companyName}'.`);
say(`Re-run with --reset to clear and rebuild.\n`);

await pool.close();
