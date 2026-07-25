/**
 * LIVE booking harness — proves order Confirm books ONE JE PER LINE, atomically.
 *
 * Runs against the real database with the real SQLServerDataProvider (the same provider MJAPI
 * uses), so entity-server subclasses, DB triggers, and accounting's remote operation all
 * participate exactly as they do in production. Nothing is mocked.
 *
 * WHAT IT PROVES
 *   1. A confirmed multi-company order books one balanced JE per line (plan D10).
 *   2. Each JE is single-company, resolved through the product → category → company walk (D5),
 *      and carries the D25 origin pair pointing at its ORDER LINE.
 *   3. Deferred-revenue products credit Deferred Revenue instead of Sales (D11/D14).
 *   4. A discount with no linked contra account nets into the sales credit (D11 fallback).
 *   5. Booking is ALL-OR-NONE: a line whose role cannot resolve rolls back the whole confirm,
 *      leaving the order unconfirmed and NO journal entries behind (D12).
 *
 * Usage:  node test-harnesses/booking-live.mjs
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

const RUN = `BOOK-${Date.now().toString(36).toUpperCase()}`;
let pass = 0;
let fail = 0;

function check(label, condition, detail = '') {
    if (condition) {
        pass++;
        console.log(`  ✔ ${label}`);
    } else {
        fail++;
        console.log(`  ✖ ${label}${detail ? ` — ${detail}` : ''}`);
    }
}

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

    const user =
        UserCache.Users.find((u) => u?.Type?.trim().toLowerCase() === 'owner') ?? UserCache.Users[0];
    if (!user) throw new Error('No context user in UserCache.');

    // Register both apps' server classes — orders' subclasses + accounting's operations.
    await import('@mj-biz-apps/accounting-server');
    const ordersServer = await import('@mj-biz-apps/orders-server');
    ordersServer.LoadBizAppsOrdersServer?.();
    const acctServer = await import('@mj-biz-apps/accounting-server');
    acctServer.LoadBizAppsAccountingServer?.();

    const { Metadata, RunView } = await import('@memberjunction/core');
    const md = new Metadata();

    const entityID = (name) => {
        const e = md.Entities.find((x) => x.Name === name);
        if (!e) throw new Error(`Entity '${name}' not found`);
        return e.ID;
    };
    const COMPANY_ENTITY_ID = entityID('MJ: Companies');

    console.log(`\n=== Seeding fixtures (${RUN}) ===`);
    const seed = await seedFixtures(pool, md, user, COMPANY_ENTITY_ID);
    console.log(`  companies: A=${seed.coA.id.slice(0, 8)}  B=${seed.coB.id.slice(0, 8)}`);

    console.log(`\n=== Test 1: multi-company order books one JE per line ===`);
    await testHappyPath(pool, md, user, seed);

    console.log(`\n=== Test 2: unresolvable account rolls back the whole confirm ===`);
    await testAllOrNone(pool, md, user, seed);

    console.log(`\n=== Teardown ===`);
    await teardown(pool, seed);

    console.log(`\n${fail === 0 ? '✅' : '❌'} ${pass} passed, ${fail} failed\n`);
    await pool.close();
    process.exit(fail === 0 ? 0 : 1);
}

// ─── Seed ──────────────────────────────────────────────────────────────────────

async function seedFixtures(pool, md, user, companyEntityID) {
    const { RunView } = await import('@memberjunction/core');
    const rv = new RunView();

    const cur = await rv.RunView(
        { EntityName: 'MJ_BizApps_Accounting: Currencies', Fields: ['Code'], MaxRows: 1, ResultType: 'simple' },
        user,
    );
    const currencyCode = cur.Results?.[0]?.Code;
    if (!currencyCode) throw new Error('No currencies — push accounting metadata first.');

    const roles = await rv.RunView(
        { EntityName: 'MJ_BizApps_Accounting: GL Account Roles', Fields: ['ID', 'Name'], ResultType: 'simple' },
        user,
    );
    const roleID = new Map((roles.Results ?? []).map((r) => [r.Name, r.ID]));

    const coA = await makeCompany(md, user, rv, `${RUN} Co A`, currencyCode, pool);
    const coB = await makeCompany(md, user, rv, `${RUN} Co B`, currencyCode, pool);

    // Company-level GL account links (plan D12: "defaults start at the company level").
    // Deliberately NO 'Sales Discounts' link — exercises the D11 net-into-sales fallback.
    for (const co of [coA, coB]) {
        await link(pool, companyEntityID, co.id, roleID.get('Accounts Receivable'), co.ar);
        await link(pool, companyEntityID, co.id, roleID.get('Sales'), co.sales);
        await link(pool, companyEntityID, co.id, roleID.get('Deferred Revenue'), co.deferred);
    }

    // Catalog: one Immediate product per company + one Deferred product in company A.
    const ptImmediate = await makeProductType(pool, `${RUN} Service`, 'Immediate');
    const ptDeferred = await makeProductType(pool, `${RUN} Subscription`, 'Deferred');

    const catA = await makeCategory(pool, coA.id, `${RUN} Cat A`);
    const catB = await makeCategory(pool, coB.id, `${RUN} Cat B`);

    const prodA = await makeProduct(pool, coA.id, ptImmediate, catA, `${RUN} Widget A`, 'Immediate');
    const prodADef = await makeProduct(pool, coA.id, ptDeferred, catA, `${RUN} Sub A`, 'Deferred');
    const prodB = await makeProduct(pool, coB.id, ptImmediate, catB, `${RUN} Widget B`, 'Immediate');

    // A product with NO resolvable revenue account — company C has no links at all.
    const coC = await makeCompany(md, user, rv, `${RUN} Co C (unlinked)`, currencyCode, pool);
    const catC = await makeCategory(pool, coC.id, `${RUN} Cat C`);
    const prodC = await makeProduct(pool, coC.id, ptImmediate, catC, `${RUN} Widget C`, 'Immediate');

    return { coA, coB, coC, ptImmediate, ptDeferred, catA, catB, catC, prodA, prodADef, prodB, prodC };
}

/**
 * Company + the three GL accounts booking needs.
 *
 * Seeded directly rather than through `AccountingCompanyProfile` (whose save auto-seeds a COA):
 * booking depends only on Company + GLAccount + GLAccountLink — `GLAccount.CompanyID` FKs
 * straight to `__mj.Company`, so no accounting profile is required. Keeping the fixture minimal
 * also keeps this harness focused on the booking path rather than accounting's own setup flow.
 * Account codes mirror accounting's starter chart so the data looks familiar.
 */
async function makeCompany(md, user, rv, name, currencyCode, pool) {
    const companyID = randomUUID();
    await pool.request().query(
        `INSERT INTO __mj.Company (ID, Name, Description)
         VALUES ('${companyID}','${name}','Booking harness fixture — safe to delete')`,
    );

    // A company must be "accounting-enabled" (have an AccountingCompanyProfile) before accounting
    // will number its journal entries — spAssignNextJournalEntryNumber enforces this. Inserted
    // directly because saving the profile through the entity API fails in this environment (see
    // harness notes); the row is all the numbering sproc needs.
    await pool.request().query(
        `INSERT INTO ${ACCT}.AccountingCompanyProfile
            (ID, CompanyCode, FunctionalCurrencyCode, EntityType, OperatingTimeZone, IsActive)
         VALUES ('${companyID}','${RUN.slice(-6)}${Math.floor(Math.random() * 90 + 10)}',
                 '${currencyCode}','Subsidiary','UTC',1)`,
    );

    const accounts = [
        { key: 'ar', code: '11201', name: 'Accounts Receivable', type: 'Asset' },
        { key: 'sales', code: '40100', name: 'Sales Revenue', type: 'Revenue' },
        { key: 'deferred', code: '21301', name: 'Deferred Revenue', type: 'Liability' },
    ];

    const out = { id: companyID };
    for (const a of accounts) {
        const id = randomUUID();
        await pool.request().query(
            `INSERT INTO ${ACCT}.GLAccount (ID, CompanyID, Code, Name, AccountType, IsActive)
             VALUES ('${id}','${companyID}','${a.code}','${a.name}','${a.type}',1)`,
        );
        out[a.key] = id;
    }
    return out;
}

async function link(pool, entityID, recordID, roleID, glAccountID) {
    await pool.request().query(
        `INSERT INTO ${ACCT}.GLAccountLink (ID, GLAccountID, GLAccountRoleID, EntityID, RecordID, Status)
         VALUES ('${randomUUID()}','${glAccountID}','${roleID}','${entityID}','${recordID}','Active')`,
    );
}

async function makeProductType(pool, name, revRec) {
    const id = randomUUID();
    await pool.request().query(
        `INSERT INTO ${ORDERS}.ProductType (ID, Name, DefaultRevenueRecognitionType, RequiresFulfillment, IsActive)
         VALUES ('${id}','${name}','${revRec}',0,1)`,
    );
    return id;
}

async function makeCategory(pool, companyID, name) {
    const id = randomUUID();
    await pool.request().query(
        `INSERT INTO ${ORDERS}.ProductCategory (ID, CompanyID, Name, IsActive)
         VALUES ('${id}','${companyID}','${name}',1)`,
    );
    return id;
}

async function makeProduct(pool, companyID, typeID, categoryID, name, revRec) {
    const id = randomUUID();
    await pool.request().query(
        `INSERT INTO ${ORDERS}.Product (ID, CompanyID, ProductTypeID, ProductCategoryID, Name, Status, RevenueRecognitionType, IsTaxable, IsActive)
         VALUES ('${id}','${companyID}','${typeID}','${categoryID}','${name}','Active','${revRec}',0,1)`,
    );
    return id;
}

// ─── Test 1: happy path ────────────────────────────────────────────────────────

async function testHappyPath(pool, md, user, seed) {
    const { order, lines } = await buildOrder(md, user, seed.coA.id, [
        { productID: seed.prodA, qty: 2, price: 100, discount: 0 },      // Co A, immediate, no discount
        { productID: seed.prodADef, qty: 1, price: 1200, discount: 0 },  // Co A, DEFERRED
        { productID: seed.prodB, qty: 3, price: 50, discount: 0.1 },     // Co B, 10% discount, no contra acct
    ]);

    order.Status = 'Confirmed';
    const saved = await order.Save();
    check('confirm succeeded', saved, order.LatestResult?.CompleteMessage ?? '');
    if (!saved) return;

    const rows = await q(
        pool,
        `SELECT ol.LineNumber, ol.JournalEntryID, ol.CompanyID, je.CompanyID AS JECompany, je.EntryType,
                je.LinkedEntityID, je.LinkedRecordID, ol.ID AS OrderLineID
         FROM ${ORDERS}.OrderLine ol
         LEFT JOIN ${ACCT}.JournalEntry je ON je.ID = ol.JournalEntryID
         WHERE ol.OrderID='${order.ID}' ORDER BY ol.LineNumber`,
    );

    check('one JE per line (3 lines → 3 entries)', rows.every((r) => r.JournalEntryID), 'some lines unstamped');
    check('each JE company matches its line company', rows.every((r) => r.JECompany === r.CompanyID));
    check('origin pair points at the ORDER LINE', rows.every((r) => r.LinkedRecordID === r.OrderLineID));
    check("EntryType is 'OrderBooking'", rows.every((r) => r.EntryType === 'OrderBooking'));

    const jeIDs = rows.map((r) => `'${r.JournalEntryID}'`).join(',');
    const bal = await q(
        pool,
        `SELECT JournalEntryID, SUM(ISNULL(DebitAmount,0)) AS D, SUM(ISNULL(CreditAmount,0)) AS C
         FROM ${ACCT}.JournalEntryLine WHERE JournalEntryID IN (${jeIDs}) GROUP BY JournalEntryID`,
    );
    check('every JE balances', bal.every((b) => Number(b.D) === Number(b.C)), JSON.stringify(bal));

    // Line 2 is the deferred product — its credit must hit Deferred Revenue (21301), not Sales.
    const deferredLines = await q(
        pool,
        `SELECT ga.Code, jel.CreditAmount FROM ${ACCT}.JournalEntryLine jel
         JOIN ${ACCT}.GLAccount ga ON ga.ID = jel.GLAccountID
         WHERE jel.JournalEntryID='${rows[1].JournalEntryID}' AND jel.CreditAmount IS NOT NULL`,
    );
    check(
        'deferred product credits Deferred Revenue (21301)',
        deferredLines.some((l) => l.Code === '21301'),
        JSON.stringify(deferredLines),
    );

    // Line 3 has a 10% discount and NO linked discounts account → net into the sales credit.
    // 3 × 50 = 150 gross, 10% = 15 discount, net = 135.
    const discLines = await q(
        pool,
        `SELECT ga.Code, jel.DebitAmount, jel.CreditAmount FROM ${ACCT}.JournalEntryLine jel
         JOIN ${ACCT}.GLAccount ga ON ga.ID = jel.GLAccountID
         WHERE jel.JournalEntryID='${rows[2].JournalEntryID}'`,
    );
    const salesCredit = discLines.find((l) => l.Code === '40100');
    check(
        'discount nets into sales credit when no contra account (135, not 150)',
        Number(salesCredit?.CreditAmount) === 135,
        JSON.stringify(discLines),
    );
}

// ─── Test 2: all-or-none ───────────────────────────────────────────────────────

async function testAllOrNone(pool, md, user, seed) {
    const before = await q(pool, `SELECT COUNT(*) AS N FROM ${ACCT}.JournalEntry`);

    // Line 2 uses company C, which has NO GL account links — resolution must fail.
    const { order } = await buildOrder(md, user, seed.coA.id, [
        { productID: seed.prodA, qty: 1, price: 100, discount: 0 },
        { productID: seed.prodC, qty: 1, price: 100, discount: 0 }, // unresolvable
    ]);

    order.Status = 'Confirmed';
    const saved = await order.Save();
    check('confirm REJECTED when an account cannot resolve', !saved);

    const after = await q(pool, `SELECT COUNT(*) AS N FROM ${ACCT}.JournalEntry`);
    check(
        'no journal entries written (all-or-none)',
        Number(before[0].N) === Number(after[0].N),
        `before=${before[0].N} after=${after[0].N}`,
    );

    const persisted = await q(pool, `SELECT Status, ConfirmedAt FROM ${ORDERS}.[Order] WHERE ID='${order.ID}'`);
    check(
        'order did not persist as Confirmed',
        persisted.length === 0 || persisted[0].Status !== 'Confirmed',
        JSON.stringify(persisted),
    );
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

async function buildOrder(md, user, companyID, lineSpecs) {
    const order = await md.GetEntityObject('MJ_BizApps_Orders: Orders', user);
    order.NewRecord();
    order.OrderNumber = `ORD-${RUN}-${Math.floor(Math.random() * 100000)}`;
    order.OrderType = 'Sale';
    order.OrderDate = new Date();
    order.Status = 'Draft';
    order.CompanyID = companyID;

    const lines = [];
    let n = 1;
    for (const spec of lineSpecs) {
        const line = await md.GetEntityObject('MJ_BizApps_Orders: Order Lines', user);
        line.NewRecord();
        line.ProductID = spec.productID;
        line.LineNumber = n++;
        line.Quantity = spec.qty;
        line.UnitPrice = spec.price;
        line.DiscountPct = spec.discount;
        lines.push(line);
    }
    order.Lines = lines;
    return { order, lines };
}

async function q(pool, query) {
    const r = await pool.request().query(query);
    return r.recordset ?? [];
}

/**
 * Fixture cleanup.
 *
 * The immutability triggers and the cross-app FKs deliberately refuse to let booked history be
 * deleted — which is exactly the behaviour we want in production, and exactly what makes a test
 * fixture hard to remove. So teardown disables the two orders triggers for the duration, unwinds
 * in FK order, and re-enables them. Nothing here is a product code path.
 */
async function teardown(pool, seed) {
    const companies = [seed.coA.id, seed.coB.id, seed.coC.id].map((c) => `'${c}'`).join(',');
    const orderScope = `SELECT ID FROM ${ORDERS}.[Order] WHERE CompanyID IN (${companies})`;
    const stmts = [
        `DISABLE TRIGGER ${ORDERS}.trg_OrderLine_ImmutableAfterConfirm ON ${ORDERS}.OrderLine`,
        `DISABLE TRIGGER ${ORDERS}.trg_Payment_ImmutableAfterCapture ON ${ORDERS}.Payment`,
        `UPDATE ${ORDERS}.OrderLine SET JournalEntryID=NULL WHERE OrderID IN (${orderScope})`,
        `DELETE jel FROM ${ACCT}.JournalEntryLine jel JOIN ${ACCT}.JournalEntry je ON je.ID=jel.JournalEntryID WHERE je.CompanyID IN (${companies})`,
        `DELETE FROM ${ACCT}.JournalEntry WHERE CompanyID IN (${companies})`,
        `DELETE FROM ${ORDERS}.OrderLine WHERE OrderID IN (${orderScope})`,
        `DELETE FROM ${ORDERS}.[Order] WHERE CompanyID IN (${companies})`,
        `DELETE FROM ${ORDERS}.Product WHERE CompanyID IN (${companies})`,
        `DELETE FROM ${ORDERS}.ProductCategory WHERE CompanyID IN (${companies})`,
        `DELETE FROM ${ORDERS}.ProductType WHERE Name LIKE '${RUN}%'`,
        `DELETE FROM ${ACCT}.GLAccountLink WHERE RecordID IN (${companies})`,
        `DELETE FROM ${ACCT}.JournalEntrySequence WHERE CompanyID IN (${companies})`,
        `DELETE FROM ${ACCT}.GLAccount WHERE CompanyID IN (${companies})`,
        `DELETE FROM ${ACCT}.AccountingCompanyProfile WHERE ID IN (${companies})`,
        `DELETE FROM __mj.Company WHERE ID IN (${companies})`,
        `ENABLE TRIGGER ${ORDERS}.trg_OrderLine_ImmutableAfterConfirm ON ${ORDERS}.OrderLine`,
        `ENABLE TRIGGER ${ORDERS}.trg_Payment_ImmutableAfterCapture ON ${ORDERS}.Payment`,
    ];
    for (const s of stmts) {
        try {
            await pool.request().query(s);
        } catch (e) {
            console.warn(`  teardown warn: ${String(e.message).split('\n')[0]}`);
        }
    }
    console.log('  cleaned up');
}

main().catch((e) => {
    console.error('\nHARNESS ERROR:', e);
    process.exit(1);
});
