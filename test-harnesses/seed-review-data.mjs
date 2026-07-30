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
 * …then a POPULATION of ~60 more, varied across every axis the engine has: product mix, quantity,
 * discount level, ship-to jurisdiction, promotion, shipping charge, subscription, event, return and
 * payment state. Eight labelled scenarios show what each feature does one at a time; the population
 * is what you look at to see whether the invariants hold across a realistic ledger rather than a
 * demo. They are the same question the `volume` bundle asks, except these rows stay.
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

// ── A VARIED POPULATION ────────────────────────────────────────────────────────────────────────
// Deliberately NOT sixty copies of one order. Every axis the engine branches on gets varied, because
// a hundred identical rows prove roughly what one row proves — and the interesting failures live in
// the combinations (a promotion on a two-company order, tax on a discounted line, a return of a
// subscription). The mix below is weighted toward plain sales, which is what real ledgers look like.
const POPULATION = Number(process.env.SEED_POPULATION ?? 60);

const jurisdictions = ['SantaClara', 'NYC', 'SanMateo', undefined];
const bulkPromo = await promotion({ kind: 'PercentOff', value: 0.15, appliesAt: 'Line' });
const bulkAmountOff = await promotion({ kind: 'AmountOff', value: 25, appliesAt: 'Order' });

let created = 0;
let failed = 0;
const started = Date.now();
process.stdout.write(`\nPopulating ${POPULATION} more varied orders `);

for (let i = 0; i < POPULATION; i++) {
    // Deterministic rather than random: a population you cannot reproduce is a population you cannot
    // ask a question about twice. `i` drives every choice.
    const shape = i % 10;
    const addressKey = jurisdictions[i % jurisdictions.length];
    const spec = {
        CompanyID: f.CoA.ID,
        BillToOrganizationID: i % 3 === 0 ? f.Customers.SecondOrganizationID : f.Customers.OrganizationID,
        BillToPersonID: i % 7 === 0 ? f.Customers.PersonID : undefined,
        ShipToAddressID: addressKey ? f.Tax.AddressIDs.get(addressKey) : undefined,
        Lines: [],
    };

    switch (shape) {
        case 0: // two companies on one document
            spec.Lines = [
                { ProductID: f.Products.WidgetA, Quantity: (i % 4) + 1 },
                { ProductID: f.Products.WidgetB, Quantity: (i % 3) + 1 },
            ];
            break;
        case 1: // a discounted line
            spec.Lines = [{ ProductID: f.Products.WidgetA, Quantity: (i % 5) + 1, DiscountPct: 0.1 }];
            break;
        case 2: // a line promotion
            spec.Lines = [{ ProductID: f.Products.WidgetA, Quantity: (i % 3) + 2 }];
            spec.PromotionCodes = [bulkPromo];
            break;
        case 3: // an order promotion plus shipping
            spec.Lines = [{ ProductID: f.Products.WidgetA, Quantity: 2 }, { ProductID: f.Products.WidgetB, Quantity: 1 }];
            spec.PromotionCodes = [bulkAmountOff];
            spec.Charges = [{ Code: 'Shipping', Amount: 12.5 }];
            break;
        case 4: // a subscription
            spec.Lines = [{ ProductID: f.Products.SubRolling, Quantity: 1 }];
            break;
        case 5: // an event ticket
            spec.Lines = [{ ProductID: f.Products.EventTicket, Quantity: (i % 3) + 1 }];
            break;
        case 6: // paid on the spot
            spec.Lines = [{ ProductID: f.Products.WidgetA, Quantity: 1 }];
            if (paymentType) {
                spec.InitialPaymentTypeID = paymentType;
                spec.InitialPaymentAmount = 300;
            }
            break;
        case 7: // a partial payment, so PartiallyPaid appears in the data
            spec.Lines = [{ ProductID: f.Products.WidgetA, Quantity: 2 }];
            if (paymentType) {
                spec.InitialPaymentTypeID = paymentType;
                spec.InitialPaymentAmount = 250;
            }
            break;
        case 8: // an awkward quantity, so the rounding paths are represented
            spec.Lines = [{ ProductID: f.Products.WidgetA, Quantity: 3, DiscountPct: 1 / 3 }];
            break;
        default: // the plain sale — the commonest thing, so the commonest row
            spec.Lines = [{ ProductID: f.Products.WidgetA, Quantity: (i % 6) + 1 }];
    }

    try {
        const order = await ConfirmOrder(user, spec);
        if (!order.Saved) throw new Error(order.Message);
        created++;

        // Return a unit from roughly one in nine, so returns are a normal part of the ledger rather
        // than a single showcase row.
        if (i % 9 === 4 && Number(order.Lines[0].Quantity) > 1) {
            const back = await ConfirmOrder(user, {
                CompanyID: f.CoA.ID,
                OrderType: 'Return',
                BillToOrganizationID: spec.BillToOrganizationID,
                ShipToAddressID: spec.ShipToAddressID,
                Lines: [
                    {
                        ProductID: order.Lines[0].ProductID,
                        Quantity: -1,
                        ReversesOrderLineID: order.Lines[0].ID,
                    },
                ],
            });
            if (back.Saved) created++;
        }
        process.stdout.write(created % 10 === 0 ? '·' : '');
    } catch (e) {
        failed++;
        if (failed <= 3) console.log(`\n  ·· order ${i} skipped: ${String(e.message).split('\n')[0].slice(0, 120)}`);
    }
}
console.log(`\n${created} population orders committed in ${((Date.now() - started) / 1000).toFixed(1)}s${failed ? `, ${failed} skipped` : ''}.`);

console.log(`\nSeeded ${seeded.length} labelled scenarios plus ${created} population orders. Fixture marker: ${f.Run}`);
console.log(`\nStart here:\n`);
console.log(`  SELECT h.OrderNumber, h.OrderType, h.Status, h.TotalGross, h.AmountPaid, h.Balance, h.PaymentStatus,`);
console.log(`         (SELECT SUM(LineTotalNet) FROM ${ORDERS_SCHEMA}.OrderLine WHERE OrderHeaderID = h.ID) AS Net,`);
console.log(`         (SELECT SUM(LineTax)      FROM ${ORDERS_SCHEMA}.OrderLine WHERE OrderHeaderID = h.ID) AS Tax`);
console.log(`    FROM ${ORDERS_SCHEMA}.OrderHeader h ORDER BY h.OrderNumber;\n`);
console.log(`See docs/reviewing-the-data.md for the rest.\n`);

await pool.close();
process.exit(0);
