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
 *   TWO companies ("Demo Publishing Co" and "Demo Partner Press"), each with a real
 *   chart-of-accounts subset (AR, Sales, Deferred Revenue, Cash) plus Due To/Due From accounts and
 *   the ORDERED intercompany pairs between them. Two customers. A product catalog spanning every
 *   revenue behaviour we support, including a real event whose dates drive recognition.
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
 *     ORD-9  a TWO-COMPANY order, paid in one cheque     → intercompany Due To/Due From legs
 *
 * Usage:
 *   node test-harnesses/seed-demo-data.mjs           # add a demo dataset
 *   node test-harnesses/seed-demo-data.mjs --reset   # remove previous demo data first
 */
import path from 'node:path';
import { importAccountingPackage } from './resolve-app-packages.mjs';
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

const { setupSQLServerClient, SQLServerProviderConfigData } = await import(
    '@memberjunction/sqlserver-dataprovider'
);
// UserCache moved packages in MJ #3734 (no re-export left behind).
const { UserCache } = await import('@memberjunction/generic-database-provider');
const provider = await setupSQLServerClient(
    new SQLServerProviderConfigData(pool, process.env.MJ_CORE_SCHEMA || '__mj'),
);
await UserCache.Instance.Refresh(pool);
const user = UserCache.Users.find((u) => u?.Type?.trim().toLowerCase() === 'owner') ?? UserCache.Users[0];
if (!user) throw new Error('No context user in UserCache.');

// Both apps' server classes — orders' subclasses book, accounting's operation writes the ledger.
await importAccountingPackage('@mj-biz-apps/accounting-server').then((m) => m.LoadBizAppsAccountingServer?.());
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

    // THE RESET NEEDS A DDL-CAPABLE LOGIN, AND SILENTLY DID NOT HAVE ONE. Two statements below are
    // `DISABLE TRIGGER`, which requires ALTER on the table. `MJ_Connect` — the login everything else
    // here uses, correctly — does not have it, and SQL Server reports a missing permission as
    // "Cannot find the object ... or you do not have permissions": indistinguishable from a renamed
    // trigger. Every failure in this block is caught and warned, so the run continued with the
    // immutability triggers still armed, deleted the chart of accounts and the profiles (which they
    // do not guard) and left the orders, payments and journal entries (which they do) — an
    // incoherent database, then a duplicate-key crash on the very next insert. It presented as
    // "--reset does not work"; it was a permissions failure wearing a not-found message.
    //
    // So the reset gets its own pool on the CodeGen login. If that credential is absent, say so and
    // carry on with the main pool rather than failing outright — the data deletes still work; only
    // rows the triggers guard will refuse, and now the reason is on screen.
    const resetPool = process.env.CODEGEN_DB_USERNAME
        ? await new sql.ConnectionPool({
              server: DB_HOST,
              port: Number(DB_PORT ?? 1433),
              database: DB_DATABASE,
              user: process.env.CODEGEN_DB_USERNAME,
              password: process.env.CODEGEN_DB_PASSWORD,
              options: { trustServerCertificate: true, encrypt: false },
              pool: { max: 4, min: 1 },
          }).connect()
        : (say(
              '  note: CODEGEN_DB_USERNAME is not set — the immutability triggers cannot be stood down,\n' +
                  '        so confirmed orders and captured payments from a previous run will NOT be removed.',
          ),
          pool);

    const scope = `SELECT ID FROM __mj.Company WHERE Name LIKE '${DEMO_TAG}%'`;
    const orders = `SELECT ID FROM ${ORDERS}.OrderHeader WHERE CompanyID IN (${scope})`;
    // FK-ordered, and the immutability triggers must be stood down: they exist precisely to stop
    // booked history being deleted, which is right in production and inconvenient for a demo reset.
    const statements = [
        `DISABLE TRIGGER ${ORDERS}.trg_OrderLine_ImmutableAfterConfirm ON ${ORDERS}.OrderLine`,
        `DISABLE TRIGGER ${ORDERS}.trg_PaymentHeader_ImmutableAfterCapture ON ${ORDERS}.PaymentHeader`,
        `DISABLE TRIGGER ${ORDERS}.trg_PaymentLine_ImmutableAfterCapture ON ${ORDERS}.PaymentLine`,
        `UPDATE ${ORDERS}.OrderLine SET JournalEntryID=NULL WHERE OrderHeaderID IN (${orders})`,
        `UPDATE ${ORDERS}.PaymentHeader SET JournalEntryID=NULL WHERE ReceivingCompanyID IN (${scope})`,
        `UPDATE ${ORDERS}.PaymentLine SET BookedAt=NULL WHERE OrderHeaderID IN (${orders})`,
        `DELETE FROM ${ACCT}.JournalEntryLineDimension WHERE JournalEntryLineID IN (SELECT jel.ID FROM ${ACCT}.JournalEntryLine jel JOIN ${ACCT}.JournalEntry je ON je.ID=jel.JournalEntryID WHERE je.CompanyID IN (${scope}))`,
        `DELETE jel FROM ${ACCT}.JournalEntryLine jel JOIN ${ACCT}.JournalEntry je ON je.ID=jel.JournalEntryID WHERE je.CompanyID IN (${scope})`,
        `DELETE FROM ${ACCT}.JournalEntry WHERE CompanyID IN (${scope})`,
        `UPDATE ${ORDERS}.OrderHeader SET InitialPaymentDetailID=NULL WHERE CompanyID IN (${scope})`,
        `DELETE FROM ${ORDERS}.PaymentLine WHERE OrderHeaderID IN (${orders})`,
        `DELETE FROM ${ORDERS}.PaymentHeader WHERE ReceivingCompanyID IN (${scope})`,
        `DELETE FROM ${ORDERS}.PaymentDetail WHERE CompanyID IN (${scope})`,
        // OrderLine and Subscription reference EACH OTHER — OrderLine.SubscriptionID (nullable) and
        // Subscription.OrderLineID (NOT NULL). Neither table can be deleted first, so the cycle has
        // to be cut on the nullable side before either delete is attempted. Without this the
        // Subscription delete fails, and every later delete that waits on it fails too: products,
        // categories, types, the organization, the person and finally the company — nine cascading
        // FK warnings that all look like independent problems and are one.
        `UPDATE ${ORDERS}.OrderLine SET SubscriptionID=NULL WHERE OrderHeaderID IN (${orders})`,
        `DELETE FROM ${ORDERS}.SubscriptionEvent WHERE SubscriptionID IN (SELECT ID FROM ${ORDERS}.Subscription WHERE CompanyID IN (${scope}))`,
        `DELETE FROM ${ORDERS}.SubscriptionTerm WHERE SubscriptionID IN (SELECT ID FROM ${ORDERS}.Subscription WHERE CompanyID IN (${scope}))`,
        `DELETE FROM ${ORDERS}.Subscription WHERE CompanyID IN (${scope})`,
        // EVERY child of OrderLine and OrderHeader, enumerated from sys.foreign_keys rather than
        // discovered one failed run at a time. The list used to name EventOrderLine alone, so the
        // first demo order that picked up a resolved price (and therefore an
        // OrderLinePriceComponent row) made the whole reset unrunnable. The self-references —
        // OrderLine.ReversesOrderLineID / .ParentOrderLineID and OrderHeader.ReversesOrderHeaderID —
        // are nulled rather than ordered, because a return and its origin are mutually reachable
        // and no delete order satisfies both.
        `DELETE FROM ${ORDERS}.EventOrderLine WHERE ID IN (SELECT ID FROM ${ORDERS}.OrderLine WHERE OrderHeaderID IN (${orders}))`,
        `DELETE FROM ${ORDERS}.OrderLinePriceComponent WHERE OrderLineID IN (SELECT ID FROM ${ORDERS}.OrderLine WHERE OrderHeaderID IN (${orders}))`,
        `DELETE FROM ${ORDERS}.OrderLineDimension WHERE OrderLineID IN (SELECT ID FROM ${ORDERS}.OrderLine WHERE OrderHeaderID IN (${orders}))`,
        `DELETE FROM ${ORDERS}.OrderChargeAllocation WHERE OrderLineID IN (SELECT ID FROM ${ORDERS}.OrderLine WHERE OrderHeaderID IN (${orders}))`,
        `DELETE FROM ${ORDERS}.OrderAdjustmentAllocation WHERE OrderLineID IN (SELECT ID FROM ${ORDERS}.OrderLine WHERE OrderHeaderID IN (${orders}))`,
        `DELETE FROM ${ORDERS}.OrderAdjustment WHERE OrderHeaderID IN (${orders}) OR OrderLineID IN (SELECT ID FROM ${ORDERS}.OrderLine WHERE OrderHeaderID IN (${orders}))`,
        `DELETE FROM ${ORDERS}.OrderCharge WHERE OrderHeaderID IN (${orders})`,
        `DELETE FROM ${ORDERS}.EntitlementGrant WHERE OrderLineID IN (SELECT ID FROM ${ORDERS}.OrderLine WHERE OrderHeaderID IN (${orders}))`,
        `DELETE FROM ${ORDERS}.StoredValueTransaction WHERE RelatedOrderHeaderID IN (${orders})`,
        `DELETE FROM ${ORDERS}.StoredValueAccount WHERE IssuedFromOrderLineID IN (SELECT ID FROM ${ORDERS}.OrderLine WHERE OrderHeaderID IN (${orders}))`,
        `DELETE FROM ${ORDERS}.PaymentIntent WHERE OrderHeaderID IN (${orders})`,
        `UPDATE ${ORDERS}.OrderLine SET ReversesOrderLineID=NULL, ParentOrderLineID=NULL WHERE OrderHeaderID IN (${orders})`,
        `UPDATE ${ORDERS}.OrderHeader SET ReversesOrderHeaderID=NULL WHERE CompanyID IN (${scope})`,
        `DELETE FROM ${ORDERS}.OrderLine WHERE OrderHeaderID IN (${orders})`,
        `DELETE FROM ${ORDERS}.OrderHeader WHERE CompanyID IN (${scope})`,
        `DELETE FROM ${ACCT}.IntercompanyAccountMatchDimension WHERE IntercompanyAccountMatchID IN (SELECT ID FROM ${ACCT}.IntercompanyAccountMatch WHERE SourceCompanyID IN (${scope}) OR TargetCompanyID IN (${scope}))`,
        `DELETE FROM ${ACCT}.IntercompanyAccountMatch WHERE SourceCompanyID IN (${scope}) OR TargetCompanyID IN (${scope})`,
        // Every child of Product, enumerated from sys.foreign_keys rather than guessed — the list was
        // previously EventProduct alone, so a demo product that had picked up a price row could never
        // be deleted. `SuccessorProductID` is Product referencing itself, hence the null-out.
        `DELETE FROM ${ORDERS}.EventProduct WHERE ID IN (SELECT ID FROM ${ORDERS}.Product WHERE CompanyID IN (${scope}))`,
        `DELETE FROM ${ORDERS}.ProductPrice WHERE ProductID IN (SELECT ID FROM ${ORDERS}.Product WHERE CompanyID IN (${scope}))`,
        `DELETE FROM ${ORDERS}.ProductEntitlement WHERE ProductID IN (SELECT ID FROM ${ORDERS}.Product WHERE CompanyID IN (${scope}))`,
        `DELETE FROM ${ORDERS}.ProductBundleItem WHERE BundleProductID IN (SELECT ID FROM ${ORDERS}.Product WHERE CompanyID IN (${scope})) OR ComponentProductID IN (SELECT ID FROM ${ORDERS}.Product WHERE CompanyID IN (${scope}))`,
        `DELETE FROM ${ORDERS}.PromotionTarget WHERE ProductID IN (SELECT ID FROM ${ORDERS}.Product WHERE CompanyID IN (${scope})) OR ProductCategoryID IN (SELECT ID FROM ${ORDERS}.ProductCategory WHERE CompanyID IN (${scope}))`,
        `UPDATE ${ORDERS}.Product SET SuccessorProductID=NULL WHERE CompanyID IN (${scope})`,
        `DELETE FROM ${ORDERS}.Product WHERE CompanyID IN (${scope})`,
        `DELETE FROM ${ORDERS}.ProductCategory WHERE CompanyID IN (${scope})`,
        `DELETE FROM ${ORDERS}.ProductType WHERE Name LIKE '${DEMO_TAG}%'`,
        `DELETE FROM ${ACCT}.GLAccountLinkDimension WHERE GLAccountLinkID IN (SELECT ID FROM ${ACCT}.GLAccountLink WHERE RecordID IN (${scope}))`,
        `DELETE FROM ${ACCT}.GLAccountLink WHERE RecordID IN (${scope})`,
        `DELETE FROM ${ACCT}.CompanyTaxNexus WHERE CompanyID IN (${scope})`,
        `DELETE FROM ${ACCT}.JournalEntrySequence WHERE CompanyID IN (${scope})`,
        `DELETE FROM ${ACCT}.JournalEntryBatchSequence WHERE CompanyID IN (${scope})`,
        `DELETE FROM ${ACCT}.GLAccount WHERE CompanyID IN (${scope})`,
        `DELETE FROM ${ACCT}.AccountingCompanyProfile WHERE ID IN (${scope})`,
        `DELETE FROM __mj.Company WHERE Name LIKE '${DEMO_TAG}%'`,
        `DELETE FROM ${COMMON}.Organization WHERE Name LIKE '${DEMO_TAG}%'`,
        `DELETE FROM ${COMMON}.Person WHERE LastName LIKE '${DEMO_TAG}%'`,
        `ENABLE TRIGGER ${ORDERS}.trg_OrderLine_ImmutableAfterConfirm ON ${ORDERS}.OrderLine`,
        `ENABLE TRIGGER ${ORDERS}.trg_PaymentHeader_ImmutableAfterCapture ON ${ORDERS}.PaymentHeader`,
        `ENABLE TRIGGER ${ORDERS}.trg_PaymentLine_ImmutableAfterCapture ON ${ORDERS}.PaymentLine`,
    ];
    const warnings = [];
    for (const s of statements) {
        try {
            const r = await resetPool.request().query(s);
            if (r.rowsAffected?.[0]) say(`  ${r.rowsAffected[0]} × ${s.split(' WHERE')[0].replace(/^(DELETE|UPDATE)\s+(FROM\s+)?/, '')}`);
        } catch (e) {
            const message = String(e.message).split('\n')[0];
            warnings.push(message);
            console.warn(`  warn: ${message}`);
        }
    }
    if (resetPool !== pool) await resetPool.close();

    // ASSERT THE RESET ACTUALLY RESET. Warnings alone are not a result: the failure mode this block
    // exists to prevent is a half-deleted dataset that then crashes on a duplicate key twenty lines
    // later, with the real cause scrolled off the top. If a demo company survived, stop here and say
    // what went wrong instead of seeding on top of it.
    const survivors = await q(`${scope} `);
    if (survivors.length) {
        console.error(
            `\n  ${survivors.length} demo company row(s) survived the reset. Not seeding on top of a` +
                ` partial dataset.\n  The deletes that failed:\n` +
                warnings.map((w) => `    - ${w}`).join('\n') +
                `\n\n  If these are FK conflicts from rows the immutability triggers refused to release,` +
                ` the reset\n  is running without a DDL-capable login — set CODEGEN_DB_USERNAME /` +
                ` CODEGEN_DB_PASSWORD.\n`,
        );
        process.exit(1);
    }
}

// ─── Company + chart of accounts ───────────────────────────────────────────────

step('Company and chart of accounts');

const currency = (await q(`SELECT TOP 1 Code FROM ${ACCT}.Currency`))[0]?.Code;
if (!currency) throw new Error('No currencies — push the accounting app metadata first.');

const COA = [
    { role: 'Cash', code: '10100', name: 'Cash — Operating', type: 'Asset' },
    { role: 'Accounts Receivable', code: '11201', name: 'Accounts Receivable', type: 'Asset' },
    { role: 'Deferred Revenue', code: '21301', name: 'Deferred Revenue', type: 'Liability' },
    { role: 'Sales', code: '40100', name: 'Sales Revenue', type: 'Revenue' },
    // ── The two below were MISSING, and their absence only shows up at booking. ──
    //
    // `GLAccountResolver` throws "No GL account is linked for role 'X'" and the whole
    // confirm rolls back. Both are reachable from ordinary order entry, so a demo
    // dataset without them is a demo that fails on the second thing anyone tries:
    //
    //   Sales Discounts  — any line with a DiscountPct, and the discount control is
    //                      right there on the order editor's line row.
    //   Processing Fee   — any payment carrying a ProcessingFeeAmount, which is every
    //                      card capture through a provider that charges one.
    //
    // Found 2026-08-07 by reading the seeded links against `GLAccountRole` and noticing
    // four of nine roles were linked. Cost nothing to add; costs a demo to leave out.
    { role: 'Sales Discounts', code: '40900', name: 'Sales Discounts', type: 'Revenue' },
    { role: 'Processing Fee', code: '60300', name: 'Payment Processing Fees', type: 'Expense' },
];
/**
 * Intercompany accounts. Not role-linked: an intercompany account is per-company-PAIR, which a
 * per-record role lookup cannot express, so `IntercompanyAccountMatch` is the only path to them
 * (accounting BA-D28).
 */
const IC_ACCOUNTS = [
    { key: 'DueTo', code: '21900', name: 'Due To Affiliates', type: 'Liability' },
    { key: 'DueFrom', code: '11900', name: 'Due From Affiliates', type: 'Asset' },
];

const roleIDs = new Map((await q(`SELECT ID, Name FROM ${ACCT}.GLAccountRole`)).map((r) => [r.Name, r.ID]));

/** Create a company with the demo chart of accounts, role links, and its intercompany accounts. */
async function createCompany(label) {
    const id = randomUUID();
    const name = `${DEMO_TAG} ${label}`;
    await q(`INSERT INTO __mj.Company (ID, Name, Description)
             VALUES ('${id}','${name}','Demo data for hands-on review — safe to delete')`);
    await q(`INSERT INTO ${ACCT}.AccountingCompanyProfile
                (ID, CompanyCode, FunctionalCurrencyCode, EntityType, OperatingTimeZone, IsActive)
             VALUES ('${id}','${id.slice(0, 8).toUpperCase()}','${currency}','Subsidiary','UTC',1)`);

    const accounts = {};
    for (const a of COA) {
        const accountID = randomUUID();
        await q(`INSERT INTO ${ACCT}.GLAccount (ID, CompanyID, Code, Name, AccountType, IsActive)
                 VALUES ('${accountID}','${id}','${a.code}','${a.name}','${a.type}',1)`);
        await q(`INSERT INTO ${ACCT}.GLAccountLink (ID, GLAccountID, GLAccountRoleID, EntityID, RecordID, Status)
                 VALUES ('${randomUUID()}','${accountID}','${roleIDs.get(a.role)}','${entityID('MJ: Companies')}','${id}','Active')`);
        accounts[a.role] = accountID;
    }
    for (const a of IC_ACCOUNTS) {
        const accountID = randomUUID();
        await q(`INSERT INTO ${ACCT}.GLAccount (ID, CompanyID, Code, Name, AccountType, IsActive)
                 VALUES ('${accountID}','${id}','${a.code}','${a.name}','${a.type}',1)`);
        accounts[a.key] = accountID;
    }
    say(`  ${name}  (${COA.length} role-linked accounts + Due To/Due From)`);
    return { ID: id, Name: name, Accounts: accounts };
}

const publisher = await createCompany('Publishing Co');
const press = await createCompany('Partner Press');
const companyID = publisher.ID;
const companyName = publisher.Name;
const accounts = publisher.Accounts;

// The ORDERED intercompany pairs (accounting BA-D27): one row per direction. A row means
// "Source collected cash on Target's behalf, so Source owes Target" — reading it backwards would
// still BALANCE, which is exactly why the direction is explicit and trigger-enforced.
for (const [source, target] of [[publisher, press], [press, publisher]]) {
    await q(`INSERT INTO ${ACCT}.IntercompanyAccountMatch
                (ID, SourceCompanyID, TargetCompanyID, DueToGLAccountID, DueFromGLAccountID, Status)
             VALUES ('${randomUUID()}','${source.ID}','${target.ID}',
                     '${source.Accounts.DueTo}','${target.Accounts.DueFrom}','Active')`);
    say(`  intercompany pair: ${source.Name} owes ${target.Name}`);
}

// The engine caches accounts and links, so it must re-read them before anything books.
const { AccountingEngineBase } = await importAccountingPackage('@mj-biz-apps/accounting-engine-base');
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

/**
 * Create a product, and — when a list price is given — the ProductPrice rule that lets the
 * ENGINE price it.
 *
 * WHY THE PRICE MATTERS: every order below states its own `line.UnitPrice`, so this seed used to
 * create no ProductPrice rows at all. That is fine for the seeded orders and useless for anything
 * driven by hand: Fast entry adds a line WITHOUT a price and asks `Orders.PreviewPrice` to resolve
 * one, which refuses with "No price is configured for <product>". The line then shows that refusal
 * instead of a number. (Before 2026-08-07 it was worse: the confirm button was GATED on a preview
 * result, so an unpriced line made the whole order unconfirmable. It no longer is — the engine
 * decides — but a catalog you cannot price is still a catalog you cannot sell from.)
 *
 * Pass `listPrice: null` to leave a product unpriced. NOTHING IN THE DEMO SET DOES ANY
 * MORE. `consulting` used to, to demonstrate the price-it-by-hand path — but an unpriced
 * product in the picker is indistinguishable from a broken one, and it produced $0.00
 * lines that read as a bug in every hands-on session. The manual path is still
 * demonstrable and always was: a typed price WINS over a resolved one (the hydrator
 * leaves a stated `UnitPrice` alone), so type over the resolved figure on any line.
 * (Ruled by Marcelo, 2026-08-07: "add a price rule for each of these".)
 */
async function product(name, revRecCode, subTypeCode = null, typeID = servicesTypeID, listPrice = null) {
    const id = randomUUID();
    await q(`INSERT INTO ${ORDERS}.Product
                (ID, CompanyID, ProductTypeID, ProductCategoryID, Name, Status, RevenueRecognitionTypeID, SubscriptionTypeID, IsTaxable)
             VALUES ('${id}','${companyID}','${typeID}','${catalogCatID}','${name}','Active',
                     '${revRec.get(revRecCode)}',${subTypeCode ? `'${subTypes.get(subTypeCode)}'` : 'NULL'},0)`);
    if (listPrice !== null) {
        await q(`INSERT INTO ${ORDERS}.ProductPrice
                    (ID, ProductID, Name, PricingModel, FeeType, Amount, EffectiveFrom, Priority, Status)
                 VALUES ('${randomUUID()}','${id}','Base','PerUnit','Standard',${listPrice},'2020-01-01',100,'Active')`);
    }
    say(`  ${name}  (${revRecCode}${subTypeCode ? `, ${subTypeCode}` : ''})${listPrice !== null ? `  list ${listPrice}` : '  — no list price (priced by hand)'}`);
    return id;
}

// An EVENT product type. The extension pointers are what make it an event type rather than a
// label — they name the IsA children that carry event data (BO-D37).
const eventTypeID = randomUUID();
await q(`INSERT INTO ${ORDERS}.ProductType
            (ID, Name, RequiresFulfillment, IsActive, ProductExtensionEntity, OrderLineExtensionEntity, DefaultRevenueRecognitionTypeID)
         VALUES ('${eventTypeID}','${DEMO_TAG} Event',0,1,
                 'MJ_BizApps_Orders: Event Products','MJ_BizApps_Orders: Event Order Lines','${revRec.get('AllBackEnd')}')`);

// List prices match the amounts the orders below state, so a hand-built order prices the same as
// a seeded one. EVERY product carries one — see the note on `product()` above.
const products = {
    handbook: await product(`${DEMO_TAG} Style Handbook`, 'UpFront', null, goodsTypeID, 45),
    workshop: await product(`${DEMO_TAG} Editing Workshop Seat`, 'UpFront', null, servicesTypeID, 150),
    conference: await product(`${DEMO_TAG} Annual Conference Ticket`, 'AllBackEnd', null, eventTypeID, 275),
    membership: await product(`${DEMO_TAG} Individual Membership`, 'EvenOverTime', 'AnnualRolling', servicesTypeID, 240),
    calendarMembership: await product(`${DEMO_TAG} Institutional Membership`, 'EvenOverTime', 'CalendarYear', servicesTypeID, 1200),
    consulting: await product(`${DEMO_TAG} Editorial Consulting (hourly)`, 'UpFront', null, servicesTypeID, 120),
};

// The conference is a REAL event: its dates live on the EventProduct row, so a ticket line needs
// none and still recognizes on the day (D-EVENT).
const CONFERENCE = { StartsAt: '2027-05-12T09:00:00Z', EndsAt: '2027-05-14T17:00:00Z' };
await q(`INSERT INTO ${ORDERS}.EventProduct
            (ID, EventStartsAt, EventEndsAt, VenueName, Capacity, RequiresAttendeeInfo)
         VALUES ('${products.conference}','${CONFERENCE.StartsAt}','${CONFERENCE.EndsAt}',
                 '${DEMO_TAG} Riverside Convention Center', 400, 1)`);
say(`  conference runs ${CONFERENCE.StartsAt.slice(0, 10)} → ${CONFERENCE.EndsAt.slice(0, 10)} (revenue deferred until then)`);

// A product owned by the OTHER company, so an order can span both and produce intercompany legs.
const pressCatID = randomUUID();
await q(`INSERT INTO ${ORDERS}.ProductCategory (ID, CompanyID, Name, IsActive)
         VALUES ('${pressCatID}','${press.ID}','${DEMO_TAG} Press Catalog',1)`);
products.pressAnthology = randomUUID();
await q(`INSERT INTO ${ORDERS}.Product
            (ID, CompanyID, ProductTypeID, ProductCategoryID, Name, Status, RevenueRecognitionTypeID, IsTaxable)
         VALUES ('${products.pressAnthology}','${press.ID}','${goodsTypeID}','${pressCatID}',
                 '${DEMO_TAG} Partner Press Anthology','Active','${revRec.get('UpFront')}',0)`);
// 210 matches the amount the seeded order below states for this line, so picking it by hand
// prices identically to the seeded order. It is written out rather than going through
// `product()` because that helper hard-codes the PRIMARY company; this product is the other
// company's, which is the whole reason it exists.
await q(`INSERT INTO ${ORDERS}.ProductPrice
            (ID, ProductID, Name, PricingModel, FeeType, Amount, EffectiveFrom, Priority, Status)
         VALUES ('${randomUUID()}','${products.pressAnthology}','Base','PerUnit','Standard',210,'2020-01-01',100,'Active')`);

// A SUBSCRIPTION on the other company too, not just a one-off good.
//
// Without this the catalog could not express the case the per-line booking rule
// exists for: an order carrying recurring revenue for TWO different companies at
// once. Every subscription sat on the primary company, so a mixed order proved
// only that a one-off good could belong elsewhere — the harder question, whether
// two subscriptions land in two different companies' ledgers with their own
// terms, was unaskable. (The BOOK-MSCV* products named "Sub A" are integration
// fixtures with a null SubscriptionTypeID; they are not subscriptions and their
// names mislead.)
products.pressMembership = randomUUID();
await q(`INSERT INTO ${ORDERS}.Product
            (ID, CompanyID, ProductTypeID, ProductCategoryID, Name, Status, RevenueRecognitionTypeID, SubscriptionTypeID, IsTaxable)
         VALUES ('${products.pressMembership}','${press.ID}','${servicesTypeID}','${pressCatID}',
                 '${DEMO_TAG} Partner Press Membership','Active','${revRec.get('EvenOverTime')}',
                 '${subTypes.get('AnnualRolling')}',0)`);
await q(`INSERT INTO ${ORDERS}.ProductPrice
            (ID, ProductID, Name, PricingModel, FeeType, Amount, EffectiveFrom, Priority, Status)
         VALUES ('${randomUUID()}','${products.pressMembership}','Base','PerUnit','Standard',180,'2020-01-01',100,'Active')`);
say(`  ${DEMO_TAG} Partner Press Membership  (EvenOverTime, AnnualRolling)  list 180  — on the OTHER company`);
say(`  ${DEMO_TAG} Partner Press Anthology  (UpFront, owned by ${press.Name})  list 210`);

// ─── Orders ────────────────────────────────────────────────────────────────────

async function confirmOrder({ lines, customer, orderDate, initialPayment, note }) {
    const order = await md.GetEntityObject('MJ_BizApps_Orders: Order Headers', user);
    order.NewRecord();
    order.OrderType = 'Sale';
    order.OrderDate = orderDate ?? new Date();
    order.Status = 'Draft';
    order.CompanyID = companyID;
    if (customer?.org) order.BillToOrganizationID = customer.org;
    if (customer?.person) order.BillToPersonID = customer.person;
    if (note) order.Notes = note;
    if (initialPayment) {
        const paymentTypeID = payTypes.get(initialPayment.type);
        order.InitialPaymentTypeID = paymentTypeID;
        order.InitialPaymentAmount = initialPayment.amount;

        // A TENDER THAT REQUIRES A REFERENCE MUST CARRY ONE — and the reference is an
        // INSTRUMENT, not an order field. There is no `ReferenceNumber` column on
        // OrderHeader; it lives on a `PaymentDetail` the order points at, which
        // `createInitialPayment` then COPIES onto the payment (D39) so the payment's
        // record of the check cannot drift if the intent row is later edited. That is
        // the same thing `OrderDraftHydrator.createReferenceInstrument` does for the UI.
        //
        // This seed did not do it, and the whole run died at the SECOND order once the
        // reference rule landed (`requireReferenceWhenTenderDemandsOne`, 2026-08-07):
        //   "Check payments need a reference number ... Enter it on the order, or
        //    invoice on terms instead."
        // The rule is right and the seed was stale. Fixed here rather than by weakening
        // the rule or switching the demo order to terms — a paid-by-check order is
        // exactly what the demo needs to show.
        if (initialPayment.reference) {
            const detailID = randomUUID();
            await q(`INSERT INTO ${ORDERS}.PaymentDetail (ID, CompanyID, PaymentTypeID, ReferenceNumber)
                     VALUES ('${detailID}','${companyID}','${paymentTypeID}','${initialPayment.reference}')`);
            order.InitialPaymentDetailID = detailID;
        }
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
    for (const line of built) {
        order.Lines.Add(line);
    }
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
 * cannot be pre-declared for those; it has to read the balance the order actually landed on.
 * Guessing is no longer REJECTED — over-paying is legitimate now (D68) and would simply leave a
 * credit — so reading the real balance is what keeps the demo data saying what it means.
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

    // Header + allocation in ONE save (D68). A captured payment's Amount must equal the sum of its
    // lines, so capturing first and allocating second passes through a state the invariant forbids —
    // which is exactly how this script failed the first time it ran after that rule landed.
    const line = await md.GetEntityObject('MJ_BizApps_Orders: Payment Lines', user);
    line.NewRecord();
    line.OrderHeaderID = orderID;
    line.Amount = balance;
    line.AllocatedAt = new Date();
    payment.Lines.Add(line);

    if (!(await payment.Save())) {
        throw new Error(`payment failed: ${payment.LatestResult?.CompleteMessage ?? 'unknown'}`);
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
    initialPayment: { type: 'Check', amount: 300, reference: 'CHK-20481' },
    note: 'Paid in full at confirm — AR nets to zero and the cash leg is booked',
});

const o3 = await confirmOrder({
    lines: [
        { product: products.handbook, qty: 10, price: 45, discount: 0.1 },
        { product: products.workshop, qty: 1, price: 150 },
    ],
    customer: { org: orgID },
    initialPayment: { type: 'ACH', amount: 200, reference: 'ACH-77310' },
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

// ─── Intercompany ──────────────────────────────────────────────────────────────

step('Intercompany order (two companies, one payment)');

// The order carries a line from EACH company. Line ownership is the PRODUCT's company (D6), so
// this is a two-company order even though one company placed it.
const o9 = await confirmOrder({
    lines: [
        { product: products.handbook, qty: 2, price: 45 },          // Publishing Co — 90
        { product: products.pressAnthology, qty: 1, price: 210 },   // Partner Press — 210
    ],
    customer: { org: orgID },
    note: 'Two companies on one order — paying it raises the intercompany legs',
});

// Cash lands with the Publishing Co, but 210 of it settles the Partner Press's line. Without the
// intercompany legs this would credit the WRONG receivable and leave the Press's open forever —
// balanced, posted, and invisible (D13).
const icPayment = await md.GetEntityObject('MJ_BizApps_Orders: Payment Headers', user);
icPayment.NewRecord();
icPayment.PaymentNumber = `${DEMO_TAG}-IC-${randomUUID().slice(0, 6).toUpperCase()}`;
icPayment.ReceivingCompanyID = publisher.ID;
icPayment.PaymentTypeID = payTypes.get('Check');
icPayment.Amount = 300;
icPayment.Status = 'Captured';
icPayment.PaymentDate = new Date();
icPayment.BillToOrganizationID = orgID;

const icLine = await md.GetEntityObject('MJ_BizApps_Orders: Payment Lines', user);
icLine.NewRecord();
icLine.OrderHeaderID = o9.ID;
icLine.Amount = 300;
icLine.AllocatedAt = new Date();
icPayment.Lines.Add(icLine);

if (!(await icPayment.Save())) throw new Error(`IC capture failed: ${icPayment.LatestResult?.CompleteMessage}`);

const icEntries = await q(`
    SELECT je.EntryNumber, c.Name AS Company, gl.Code, gl.Name AS Account,
           jel.DebitAmount AS Dr, jel.CreditAmount AS Cr
    FROM ${ORDERS}.PaymentLine pl
    JOIN ${ACCT}.JournalEntry je ON LOWER(je.LinkedRecordID) = LOWER(CAST(pl.ID AS NVARCHAR(400)))
    JOIN ${ACCT}.JournalEntryLine jel ON jel.JournalEntryID = je.ID
    JOIN ${ACCT}.GLAccount gl ON gl.ID = jel.GLAccountID
    JOIN __mj.Company c ON c.ID = gl.CompanyID
    WHERE pl.ID='${icLine.ID}'
    ORDER BY c.Name, gl.Code`);
say(`  one payment of 300 produced ${new Set(icEntries.map((r) => r.EntryNumber)).size} journal entries:`);
for (const r of icEntries) {
    const amount = r.Dr ? `Dr ${String(r.Dr).padStart(8)}` : `Cr ${String(r.Cr).padStart(8)}`;
    say(`    ${String(r.Company).padEnd(24)} ${r.Code} ${String(r.Account).padEnd(22)} ${amount}`);
}

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

// ─── Account credit: over-pay one order, spend the surplus on another (D68) ───

step('Account credit');

// A customer sends more than the order is worth. This is an ordinary event — and until D68 it could
// not be recorded at all, because the allocation guard refused it while the money sat in the bank.
const creditOrder = await confirmOrder({
    lines: [{ product: products.handbook, qty: 4, price: 50 }],
    customer: { org: orgID },
    note: 'Over-paid — the surplus becomes a spendable credit (D68)',
});
const overPayment = await md.GetEntityObject('MJ_BizApps_Orders: Payment Headers', user);
overPayment.NewRecord();
overPayment.PaymentNumber = `${DEMO_TAG}-OVER-${randomUUID().slice(0, 6).toUpperCase()}`;
overPayment.ReceivingCompanyID = companyID;
overPayment.PaymentTypeID = payTypes.get('Check');
overPayment.Amount = 250;
overPayment.PaymentDate = new Date();
overPayment.Status = 'Captured';
overPayment.BillToOrganizationID = orgID;

const overLine = await md.GetEntityObject('MJ_BizApps_Orders: Payment Lines', user);
overLine.NewRecord();
overLine.OrderHeaderID = creditOrder.ID;
overLine.Amount = 250;          // 50 more than the order — the surplus becomes the credit
overLine.AllocatedAt = new Date();
overPayment.Lines.Add(overLine);

if (!(await overPayment.Save())) {
    throw new Error(`over-payment failed: ${overPayment.LatestResult?.CompleteMessage}`);
}
const credited = (await q(`SELECT OrderNumber, TotalGross, AmountPaid, Balance FROM ${ORDERS}.OrderHeader WHERE ID='${creditOrder.ID}'`))[0];
say(`  ${credited.OrderNumber}: gross ${credited.TotalGross}, paid ${credited.AmountPaid}, balance ${credited.Balance} — the negative balance IS the credit`);

// Now spend it. No new cash: a zero-amount transfer whose two lines move A/R between the orders.
const spendTarget = await confirmOrder({
    lines: [{ product: products.workshop, qty: 1, price: 120 }],
    customer: { org: orgID },
    note: 'Settled partly by the credit sitting on the over-paid order',
});
const creditOp = MJGlobal.Instance.ClassFactory.CreateInstance(BaseRemotableOperation, 'Orders.ApplyAccountCredit');
const applied = await creditOp.Execute(
    { SourceOrderHeaderID: creditOrder.ID, TargetOrderHeaderID: spendTarget.ID, Amount: 50 },
    { provider, user },
);
say(`  ${applied.Output?.Message ?? applied.ErrorMessage}`);

const creditLedger = await q(`
    SELECT c.Name AS Company, gl.Code, gl.Name AS Account,
           SUM(ISNULL(jel.DebitAmount,0)) AS Dr, SUM(ISNULL(jel.CreditAmount,0)) AS Cr
      FROM ${ORDERS}.PaymentLine pl
      JOIN ${ACCT}.JournalEntry je ON je.LinkedRecordID = CAST(pl.ID AS NVARCHAR(400))
      JOIN ${ACCT}.JournalEntryLine jel ON jel.JournalEntryID = je.ID
      JOIN ${ACCT}.GLAccount gl ON gl.ID = jel.GLAccountID
      JOIN __mj.Company c ON c.ID = gl.CompanyID
     WHERE pl.PaymentHeaderID = '${applied.Output?.PaymentHeaderID}'
     GROUP BY c.Name, gl.Code, gl.Name ORDER BY gl.Code`);
for (const l of creditLedger) {
    say(`    ${String(l.Company).padEnd(22)} ${l.Code}  ${String(l.Account).padEnd(22)} Dr ${String(l.Dr).padStart(6)}  Cr ${String(l.Cr).padStart(6)}`);
}
say('    cash nets to zero — this re-attributes money already received, it does not receive more');

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
    SELECT c.Name AS Company, gl.Code, gl.Name,
           SUM(ISNULL(jel.DebitAmount,0))  AS Debits,
           SUM(ISNULL(jel.CreditAmount,0)) AS Credits,
           SUM(ISNULL(jel.DebitAmount,0)) - SUM(ISNULL(jel.CreditAmount,0)) AS Net
    FROM ${ACCT}.JournalEntryLine jel
    JOIN ${ACCT}.GLAccount gl ON gl.ID = jel.GLAccountID
    JOIN ${ACCT}.JournalEntry je ON je.ID = jel.JournalEntryID
    JOIN __mj.Company c ON c.ID = je.CompanyID
    WHERE je.CompanyID IN ('${publisher.ID}','${press.ID}')
    GROUP BY c.Name, gl.Code, gl.Name ORDER BY c.Name, gl.Code`);
let currentCompany = null;
for (const r of trial) {
    if (r.Company !== currentCompany) {
        currentCompany = r.Company;
        say(`\n  ${currentCompany}`);
    }
    say(`    ${r.Code}  ${String(r.Name).padEnd(22)} Dr ${String(r.Debits).padStart(10)}  Cr ${String(r.Credits).padStart(10)}  net ${String(r.Net).padStart(10)}`);
}
const totalDr = trial.reduce((s, r) => s + Number(r.Debits), 0);
const totalCr = trial.reduce((s, r) => s + Number(r.Credits), 0);
say(`\n  Trial balance: debits ${totalDr.toFixed(2)} vs credits ${totalCr.toFixed(2)} — ${Math.abs(totalDr - totalCr) < 0.005 ? 'BALANCED' : 'OUT OF BALANCE'}`);

say(`\nFind it in Explorer by filtering any orders entity on company '${companyName}'.`);
say(`Re-run with --reset to clear and rebuild.\n`);

await pool.close();
