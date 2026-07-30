#!/usr/bin/env node
/**
 * Seed a COMMITTED set of representative orders, so the database can be looked at.
 *
 * WHY THIS IS SEPARATE FROM THE CHECKS. Every integration check runs inside a transaction that
 * always rolls back — that is what makes 217 of them independent of each other and re-runnable
 * against a shared database. It also means the suite leaves nothing behind to inspect. Making the
 * checks commit instead would be the wrong fix twice over: they would start seeing each other's
 * rows, and the result would be 217 fragments rather than anything a person can read.
 *
 * So this walks the SAME engine over a deliberately chosen set of scenarios and commits them. Each
 * one exists to make a different part of the pipeline visible in the data:
 *
 *   1  a plain sale                 the baseline — one line, one company, one journal entry
 *   2  a two-company order          per-line company resolution, and two ledgers from one order
 *   3  a subscription               Subscription + SubscriptionTerm, deferred revenue
 *   4  an event ticket              a service period taken from the EVENT, not the line
 *   5  the everything-order         line promo + order promo + shipping + layered tax, together
 *   6  a return against (1)         the reversal path: mirrored entry, tax given back
 *   7  a paid order                 PaymentHeader/PaymentLine and the rollups they drive
 *   8  an overpayment               a negative balance, then spent as account credit on (9)
 *
 * Everything is tagged with a run marker (printed at the end) so it can be found and deleted.
 *
 * Usage:  node test-harnesses/seed-review-data.mjs                 (clears earlier runs first)
 *         node test-harnesses/seed-review-data.mjs --keep-existing (adds to what is there)
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import sql from 'mssql';
import { randomUUID } from 'node:crypto';

const here = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(here, '..', '.env'), quiet: true });

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

await import('@mj-biz-apps/accounting-server').then((m) => m.LoadBizAppsAccountingServer?.());
await import('@mj-biz-apps/orders-server').then((m) => m.LoadBizAppsOrdersServer?.());

const it = await import('@mj-biz-apps/orders-integration-tests');
const { CreateOrdersFixture, PurgeAllFixtureData, ORDERS_SCHEMA, ACCT_SCHEMA } = it;
const { ConfirmOrder } = it;

const ctx = {
    User: user,
    Provider: provider,
    Pool: pool,
    Schema: process.env.MJ_CORE_SCHEMA || '__mj',
    Storage: undefined,
};

const q = (text) => pool.request().query(text);
const say = (n, what) => console.log(`  ${String(n).padStart(2)}. ${what}`);

console.log('\nSeeding review data — this COMMITS, unlike the checks.\n');

// CLEAN FIRST, unless told not to. Each run mints its own companies, so a second run without this
// leaves two overlapping sets of orders under different owners — technically fine, unreadable in
// practice, and the point of this script is that somebody can read it.
if (!process.argv.includes('--keep-existing')) {
    const purged = await PurgeAllFixtureData(ctx);
    if (purged) console.log(`Removed ${purged} companies' worth of earlier fixture data.\n`);
}

// The fixture is already committed reference data (companies, GL links, products, tax geography).
const f = await CreateOrdersFixture(ctx);
console.log(`Fixture: ${f.Run}\n`);

// ── Reference data the scenarios need ──────────────────────────────────────────────────────────
const price = (productID, amount) =>
    q(`INSERT INTO ${ORDERS_SCHEMA}.ProductPrice
         (ID, ProductID, PricingModel, FeeType, Amount, EffectiveFrom, Priority, Status)
       VALUES ('${randomUUID()}','${productID}','PerUnit','Standard',${amount},'2020-01-01',0,'Active')`);

const nexus = async (key) => {
    const jid = f.Tax.JurisdictionIDs.get(key);
    if (!jid) return;
    await q(`IF NOT EXISTS (SELECT 1 FROM ${ACCT_SCHEMA}.CompanyTaxNexus
                             WHERE CompanyID='${f.CoA.ID}' AND TaxJurisdictionID='${jid}')
             INSERT INTO ${ACCT_SCHEMA}.CompanyTaxNexus
               (ID, CompanyID, TaxJurisdictionID, NexusType, RegisteredFrom, Status)
             VALUES ('${randomUUID()}','${f.CoA.ID}','${jid}','Economic','2020-01-01','Active')`);
};

const promotion = async ({ kind = 'PercentOff', value, appliesAt = 'Order', targetProductID = null }) => {
    const code = `REVIEW-${randomUUID().slice(0, 5).toUpperCase()}`;
    const id = randomUUID();
    const t = await q(`SELECT ID FROM ${ORDERS_SCHEMA}.PromotionType WHERE Code='${kind}'`);
    await q(`INSERT INTO ${ORDERS_SCHEMA}.Promotion (ID, Code, Name, PromotionTypeID, Value, AppliesAt, Status)
             VALUES ('${id}','${code}','${code}','${t.recordset[0].ID}',${value},'${appliesAt}','Active');
             INSERT INTO ${ORDERS_SCHEMA}.PromotionCode (ID, PromotionID, Code, Status)
             VALUES ('${randomUUID()}','${id}','${code}','Active')`);
    if (targetProductID) {
        await q(`INSERT INTO ${ORDERS_SCHEMA}.PromotionTarget (ID, PromotionID, ProductID, IncludeDescendants)
                 VALUES ('${randomUUID()}','${id}','${targetProductID}',1)`);
    }
    return code;
};

await price(f.Products.WidgetA, 300);
await price(f.Products.WidgetB, 100);
await price(f.Products.SubRolling, 1200);
await price(f.Products.EventTicket, 450);
await nexus('CA');
await nexus('CA-SANTACLARA');

// Intercompany pairs, so a payment across two companies can settle each one's own receivable.
const DUE_TO = '21900';
const DUE_FROM = '13900';
for (const co of [f.CoA, f.CoB]) {
    for (const [code, name, type] of [
        [DUE_TO, 'Due To Affiliates', 'Liability'],
        [DUE_FROM, 'Due From Affiliates', 'Asset'],
    ]) {
        await q(`IF NOT EXISTS (SELECT 1 FROM ${ACCT_SCHEMA}.GLAccount WHERE CompanyID='${co.ID}' AND Code='${code}')
                 INSERT INTO ${ACCT_SCHEMA}.GLAccount (ID, CompanyID, Code, Name, AccountType, IsActive)
                 VALUES ('${randomUUID()}','${co.ID}','${code}','${name}','${type}',1)`);
    }
}
for (const [source, target] of [[f.CoA.ID, f.CoB.ID], [f.CoB.ID, f.CoA.ID]]) {
    await q(`IF NOT EXISTS (SELECT 1 FROM ${ACCT_SCHEMA}.IntercompanyAccountMatch
                             WHERE SourceCompanyID='${source}' AND TargetCompanyID='${target}' AND Status='Active')
             INSERT INTO ${ACCT_SCHEMA}.IntercompanyAccountMatch
               (ID, SourceCompanyID, TargetCompanyID, DueToGLAccountID, DueFromGLAccountID, Status)
             SELECT '${randomUUID()}','${source}','${target}',
                    (SELECT ID FROM ${ACCT_SCHEMA}.GLAccount WHERE CompanyID='${source}' AND Code='${DUE_TO}'),
                    (SELECT ID FROM ${ACCT_SCHEMA}.GLAccount WHERE CompanyID='${target}' AND Code='${DUE_FROM}'),
                    'Active'`);
}

const paymentType = [...f.PaymentTypeIDs.entries()].find(([c]) => c !== 'AccountCredit')?.[1];

// ── The scenarios ──────────────────────────────────────────────────────────────────────────────
const seeded = [];
const confirm = async (label, spec) => {
    const order = await ConfirmOrder(user, spec);
    if (!order.Saved) throw new Error(`${label} failed to confirm: ${order.Message}`);
    seeded.push({ label, number: order.Order.OrderNumber, id: order.Order.ID });
    say(seeded.length, `${order.Order.OrderNumber}  ${label}`);
    return order;
};

const buyer = { CompanyID: f.CoA.ID, BillToOrganizationID: f.Customers.OrganizationID };

// Ship-to Santa Clara so this one is TAXED — which is what makes scenario 6 (its return) show the
// tax coming back rather than a return of a zero.
const plain = await confirm('a plain sale, taxed — 2 × WidgetA shipped to Santa Clara', {
    ...buyer,
    ShipToAddressID: f.Tax.AddressIDs.get('SantaClara'),
    Lines: [{ ProductID: f.Products.WidgetA, Quantity: 2 }],
});

await confirm('two companies on one order — WidgetA (Co A) + WidgetB (Co B)', {
    ...buyer,
    Lines: [
        { ProductID: f.Products.WidgetA, Quantity: 1 },
        { ProductID: f.Products.WidgetB, Quantity: 3 },
    ],
});

await confirm('an annual subscription — creates a Subscription and its first Term', {
    ...buyer,
    Lines: [{ ProductID: f.Products.SubRolling, Quantity: 1 }],
});

await confirm('an event ticket — service period comes from the EVENT', {
    ...buyer,
    Lines: [{ ProductID: f.Products.EventTicket, Quantity: 2 }],
});

const linePromo = await promotion({ value: 0.1, appliesAt: 'Line', targetProductID: f.Products.WidgetA });
const orderPromo = await promotion({ kind: 'AmountOff', value: 50, appliesAt: 'Order' });
await confirm('the everything-order — both promotion levels, shipping, layered CA tax', {
    ...buyer,
    ShipToAddressID: f.Tax.AddressIDs.get('SantaClara'),
    Lines: [
        { ProductID: f.Products.WidgetA, Quantity: 1 },
        { ProductID: f.Products.WidgetB, Quantity: 1 },
    ],
    PromotionCodes: [linePromo, orderPromo],
    Charges: [{ Code: 'Shipping', Amount: 60 }],
});

await confirm('a RETURN of one unit from the plain sale — mirrored entry, tax back', {
    ...buyer,
    OrderType: 'Return',
    ShipToAddressID: f.Tax.AddressIDs.get('SantaClara'),
    Lines: [
        {
            ProductID: f.Products.WidgetA,
            Quantity: -1,
            ReversesOrderLineID: plain.Lines[0].ID,
        },
    ],
});

if (paymentType) {
    await confirm('a PAID order — payment header, line, and the rollups they drive', {
        ...buyer,
        Lines: [{ ProductID: f.Products.WidgetA, Quantity: 1 }],
        InitialPaymentTypeID: paymentType,
        InitialPaymentAmount: 300,
    });

    await confirm('an OVERPAID order — leaves a negative balance, i.e. account credit', {
        ...buyer,
        Lines: [{ ProductID: f.Products.WidgetA, Quantity: 1 }],
        InitialPaymentTypeID: paymentType,
        InitialPaymentAmount: 400,
    });
} else {
    console.log('  ·· skipped the payment scenarios — no ordinary PaymentType is seeded');
}

console.log(`\nSeeded ${seeded.length} orders. Fixture marker: ${f.Run}`);
console.log(`\nStart here:\n`);
console.log(`  SELECT h.OrderNumber, h.OrderType, h.Status, h.TotalGross, h.AmountPaid, h.Balance, h.PaymentStatus,`);
console.log(`         (SELECT SUM(LineTotalNet) FROM ${ORDERS_SCHEMA}.OrderLine WHERE OrderHeaderID = h.ID) AS Net,`);
console.log(`         (SELECT SUM(LineTax)      FROM ${ORDERS_SCHEMA}.OrderLine WHERE OrderHeaderID = h.ID) AS Tax`);
console.log(`    FROM ${ORDERS_SCHEMA}.OrderHeader h ORDER BY h.OrderNumber;\n`);
console.log(`See docs/reviewing-the-data.md for the rest.\n`);

await pool.close();
process.exit(0);
