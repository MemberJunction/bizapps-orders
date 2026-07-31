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
 * So this walks the SAME engine over a deliberately chosen set of scenarios and commits them, using
 * the SAME fixture helpers the checks use for every piece of setup — prices, promotions, tax nexus,
 * GL accounts and intercompany pairs. Nothing here is a second implementation. Each scenario exists
 * to make a different part of the pipeline visible in the data:
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
const { CreateProductPrice, CreatePromotion, EnsureTaxNexus, EnsureIntercompanyAccounts, CreateBundleItem } = it;
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
//
// ALL OF IT THROUGH THE OBJECT MODEL, using the SAME helpers the check bundles use.
//
// The orders below were always confirmed through the engine, but everything they depend on — the
// prices, the tax nexus, the promotions, the intercompany GL accounts and pairs — used to be raw
// INSERTs local to this file. That made this a second, unvalidated implementation of setup the
// suite already had, and the two drifted exactly as you would expect: this file used 13900 for the
// Due From account while every check used 11900. A GL account code that disagrees with the checks
// does not fail loudly; it books to an account nobody is looking at, and the entry still balances.
//
// Sharing the helpers removes the second implementation. It also means the seeding pass is itself a
// test of the account-link walk: a link our resolver would consider malformed now fails here, at
// creation, instead of quietly producing a plausible journal entry.
for (const [productID, amount] of [
    [f.Products.WidgetA, 300],
    [f.Products.WidgetB, 100],
    [f.Products.SubRolling, 1200],
    [f.Products.EventTicket, 450],
]) {
    await CreateProductPrice(ctx, productID, amount);
}

await EnsureTaxNexus(ctx, f.CoA.ID,
    ['CA', 'CA-SANTACLARA'].map((k) => f.Tax.JurisdictionIDs.get(k)).filter(Boolean));

// GIFT CARDS AND BUNDLES. Both features shipped and neither appeared in this data, so anyone
// browsing the review set would conclude they did not exist — the same class of mistake as an
// empty state that reads as a quiet afternoon. The bundle's components are deliberately UNEQUAL
// (75 and 25 against a 100 bundle) so the allocation is visibly by relative value rather than an
// even split; 50/50 and 75/25 both sum to 100, and only one of them is right.
await CreateProductPrice(ctx, f.Products.GiftCardA, 50);
await CreateProductPrice(ctx, f.Products.BundlePartX, 75);
await CreateProductPrice(ctx, f.Products.BundlePartY, 25);
await CreateBundleItem(ctx, f.Products.BundleA, f.Products.BundlePartX, { Quantity: 1, SortOrder: 10 });
await CreateBundleItem(ctx, f.Products.BundleA, f.Products.BundlePartY, { Quantity: 2, SortOrder: 20 });

const promotion = ({ kind = 'PercentOff', value, appliesAt = 'Order', targetProductID = null }) =>
    CreatePromotion(ctx, {
        Kind: kind,
        Value: value,
        AppliesAt: appliesAt,
        TargetProductID: targetProductID,
        Code: `REVIEW-${randomUUID().slice(0, 5).toUpperCase()}`,
    });

// Intercompany pairs, so a payment across two companies can settle each one's own receivable.
// Codes come from the fixture (DUE_TO_CODE / DUE_FROM_CODE) rather than being restated here, which
// is what let the 13900/11900 split happen in the first place.
await EnsureIntercompanyAccounts(ctx, [f.CoA, f.CoB], [
    [f.CoA.ID, f.CoB.ID],
    [f.CoB.ID, f.CoA.ID],
]);

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

// Selling a gift card earns NOTHING — the credit leg is a liability, and revenue appears later on
// whatever order the card is spent on. Worth looking at next to scenario 1: same money in, entirely
// different entry.
await confirm('a GIFT CARD sale — books a LIABILITY, not revenue; issues 3 spendable cards', {
    ...buyer,
    Lines: [{ ProductID: f.Products.GiftCardA, Quantity: 3, UnitPrice: 50 }],
});

// The parent line is customer-facing and carries ZERO; the children carry the money, allocated by
// relative standalone selling price. Look at LineNumber ordering — children sit directly beneath
// their parent — and at ParentOrderLineID, which is what tells two of the same bundle apart.
await confirm('a BUNDLE — expands into component lines under a rollup parent that totals zero', {
    ...buyer,
    Lines: [{ ProductID: f.Products.BundleA, Quantity: 2, UnitPrice: 100 }],
});

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
