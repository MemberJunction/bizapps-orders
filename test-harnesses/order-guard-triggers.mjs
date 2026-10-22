#!/usr/bin/env node
/**
 * Exercise the confirmed-order guard checks in trg_OrderHeader_ImmutableAfterConfirm
 * (51013, 51014, 51017) and trg_OrderLine_ImmutableAfterConfirm (51002, 51003, 51008) against a
 * real database, and the order they run in (golive #288). The address checks, 51015 and 51016,
 * have their own harness: address-snapshot-triggers.mjs.
 *
 *   node test-harnesses/order-guard-triggers.mjs
 *
 * Reads the connection from .env like the other harnesses. Needs one existing Product, two Users
 * and one Journal Entry Type (any seeded database has them). Every row it writes carries a fixed ID
 * in the 6A4D… range and is deleted before and after the run, so it can be re-run.
 * Exits 1 if any case does not behave as expected.
 *
 * Each case is its own statement: the triggers ROLLBACK, which ends any surrounding transaction,
 * so the cases cannot share one.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import sql from 'mssql';

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
    // `mssql` defaults `requestTimeout` to 15s. The first journal entry insert runs accounting's
    // journal entry triggers cold, which can take longer than that on a loaded local container.
    requestTimeout: 60_000,
    pool: { max: 1, min: 1 },
}).connect();

const O = '__mj_BizAppsOrders';
const ACC = '__mj_BizAppsAccounting';

const G1 = '6A4D0000-0000-4000-8000-0000000000C1'; // draft, then confirmed
const G2 = '6A4D0000-0000-4000-8000-0000000000C2'; // created Confirmed, not yet booked (conversion)
const G3 = '6A4D0000-0000-4000-8000-0000000000C3'; // stays draft
const G4 = '6A4D0000-0000-4000-8000-0000000000C4'; // draft that carries a ConfirmedAt
const GL1 = '6A4D0000-0000-4000-8000-0000000000D1'; // G1
const GL3 = '6A4D0000-0000-4000-8000-0000000000D3'; // G3, already linked to a journal entry
const GL3B = '6A4D0000-0000-4000-8000-0000000000D4'; // G3, no journal entry
const JE1 = '6A4D0000-0000-4000-8000-0000000000E1';
const JE2 = '6A4D0000-0000-4000-8000-0000000000E2';
const ORDERS = [G1, G2, G3, G4].map((id) => `'${id}'`).join(',');

/** Every guard check each trigger must carry. A redefinition that drops one fails the first cases. */
const HEADER_CHECKS = ['51013', '51014', '51015', '51017'];
const LINE_CHECKS = ['51002', '51003', '51008', '51016'];

async function run(text) {
    return pool.request().query(text);
}

/** Every error number SQL Server reported for a failed statement. */
function errorNumbers(err) {
    return [err.number, ...(err.precedingErrors ?? []).map((e) => e.number)].filter((n) => n != null);
}

async function cleanup() {
    // The line trigger refuses deleting a confirmed order's lines (51002).
    await run(`DISABLE TRIGGER ${O}.trg_OrderLine_ImmutableAfterConfirm ON ${O}.OrderLine`);
    try {
        await run(`DELETE FROM ${O}.OrderLine WHERE OrderHeaderID IN (${ORDERS})`);
        await run(`DELETE FROM ${O}.OrderHeader WHERE ID IN (${ORDERS})`);
        await run(`DELETE FROM ${ACC}.JournalEntry WHERE ID IN ('${JE1}','${JE2}')`);
    } finally {
        await run(`ENABLE TRIGGER ${O}.trg_OrderLine_ImmutableAfterConfirm ON ${O}.OrderLine`);
    }
}

async function setup() {
    const product = (await run(`SELECT TOP 1 ID, CompanyID FROM ${O}.Product`)).recordset[0];
    const users = (await run(`SELECT TOP 2 ID FROM __mj.[User] ORDER BY ID`)).recordset;
    const entryType = (await run(`SELECT TOP 1 ID FROM ${ACC}.JournalEntryType`)).recordset[0];
    if (!product || users.length < 2 || !entryType) {
        throw new Error('This harness needs a database with a Product, two Users and a Journal Entry Type.');
    }
    const { ID: productID, CompanyID: companyID } = product;
    await run(`
        INSERT ${ACC}.JournalEntry (ID, EntryNumber, CompanyID, EffectiveDate, EntryTypeID) VALUES
          ('${JE1}', 'GUARD-JE-1', '${companyID}', '2026-09-29', '${entryType.ID}'),
          ('${JE2}', 'GUARD-JE-2', '${companyID}', '2026-09-29', '${entryType.ID}');
        INSERT ${O}.OrderHeader (ID, OrderNumber, OrderDate, CompanyID, Status, ConfirmedAt, ConfirmedByUserID) VALUES
          ('${G1}', 'GUARD-1', '2026-09-23', '${companyID}', 'Draft',     NULL, NULL),
          ('${G2}', 'GUARD-2', '2026-09-23', '${companyID}', 'Confirmed', NULL, NULL),
          ('${G3}', 'GUARD-3', '2026-09-23', '${companyID}', 'Draft',     NULL, NULL),
          ('${G4}', 'GUARD-4', '2026-09-23', '${companyID}', 'Draft',     SYSDATETIMEOFFSET(), '${users[0].ID}');
        INSERT ${O}.OrderLine (ID, OrderHeaderID, ProductID, CompanyID, LineNumber, Quantity, UnitPrice, JournalEntryID) VALUES
          ('${GL1}',  '${G1}', '${productID}', '${companyID}', 1, 1, 10, NULL),
          ('${GL3}',  '${G3}', '${productID}', '${companyID}', 1, 1, 10, '${JE1}'),
          ('${GL3B}', '${G3}', '${productID}', '${companyID}', 2, 1, 10, NULL);`);
    return { U1: users[0].ID, U2: users[1].ID };
}

const results = [];

/** Run one statement and record whether it passed or was refused with the expected error. */
async function expectOutcome(name, expected, text) {
    let got = 'ok';
    try {
        await run(text);
    } catch (err) {
        const numbers = errorNumbers(err);
        got = numbers.find((n) => n >= 50000) ?? numbers[0] ?? 'error';
    }
    results.push({ name, expected, got, pass: String(got) === String(expected) });
}

/** Record a check on stored state. */
async function expectValue(name, expected, text) {
    const got = (await run(text)).recordset[0]?.v ?? null;
    results.push({ name, expected, got, pass: String(got) === String(expected) });
}

/** The checks a trigger's definition is missing, as a comma list, or 'none'. */
const missingChecks = (trigger, codes) => `
    SELECT ISNULL(STRING_AGG(c.code, ','), 'none') AS v
    FROM (VALUES ${codes.map((c) => `('${c}')`).join(',')}) c(code)
    WHERE OBJECT_DEFINITION(OBJECT_ID('${O}.${trigger}')) NOT LIKE '%THROW ' + c.code + ',%'`;

/** The table's hand-written triggers, excluding CodeGen's trgUpdate* timestamp trigger. */
const guardTriggers = (table) => `
    SELECT STRING_AGG(name, ',') WITHIN GROUP (ORDER BY name) AS v
    FROM sys.triggers
    WHERE parent_id = OBJECT_ID('${O}.${table}') AND name NOT LIKE 'trgUpdate%'`;

const H = (id, set) => `UPDATE ${O}.OrderHeader SET ${set} WHERE ID = '${id}'`;
const L = (id, set) => `UPDATE ${O}.OrderLine SET ${set} WHERE ID = '${id}'`;

try {
    // One guard trigger per table, carrying every check.
    await expectValue('Header: one guard trigger', 'trg_OrderHeader_ImmutableAfterConfirm', guardTriggers('OrderHeader'));
    await expectValue('Line: one guard trigger beside the rollup', 'trg_OrderLine_ImmutableAfterConfirm,trg_OrderLine_RollupTotals', guardTriggers('OrderLine'));
    await expectValue('Header trigger carries every check', 'none', missingChecks('trg_OrderHeader_ImmutableAfterConfirm', HEADER_CHECKS));
    await expectValue('Line trigger carries every check', 'none', missingChecks('trg_OrderLine_ImmutableAfterConfirm', LINE_CHECKS));

    await cleanup();
    const { U1, U2 } = await setup();

    // A draft order is writable.
    await expectOutcome('Draft: change OrderDate', 'ok', H(G1, `OrderDate = '2026-09-24'`));
    await expectOutcome('Draft: change line Quantity', 'ok', L(GL1, 'Quantity = 2'));

    // Booking: the confirming write sets Status, ConfirmedAt and ConfirmedByUserID together.
    await expectOutcome('Confirm, stamping who confirmed', 'ok',
        H(G1, `Status = 'Confirmed', ConfirmedAt = SYSDATETIMEOFFSET(), ConfirmedByUserID = '${U1}'`));
    await expectOutcome('Confirmed: stamp the line journal entry', 'ok', L(GL1, `JournalEntryID = '${JE1}'`));

    // Header checks.
    await expectOutcome('Confirmed: leave Confirmed', 51014, H(G1, `Status = 'Draft'`));
    await expectOutcome('Confirmed: change OrderDate', 51013, H(G1, `OrderDate = '2026-09-25'`));
    await expectOutcome('Confirmed: change ConfirmedByUserID', 51017, H(G1, `ConfirmedByUserID = '${U2}'`));
    await expectOutcome('Confirmed: clear ConfirmedByUserID', 51017, H(G1, 'ConfirmedByUserID = NULL'));
    await expectOutcome('Confirmed: edit Notes', 'ok', H(G1, `Notes = 'called customer'`));

    // One write that breaks several rules is refused by the first check in the trigger's order.
    await expectOutcome('Order: 51014 before 51013 and 51017', 51014,
        H(G1, `Status = 'Draft', OrderDate = '2026-09-25', ConfirmedByUserID = '${U2}'`));
    await expectOutcome('Order: 51013 before 51017', 51013, H(G1, `OrderDate = '2026-09-25', ConfirmedByUserID = '${U2}'`));

    // 51017 keys on ConfirmedAt, not Status.
    await expectOutcome('Created Confirmed: booking stamps who confirmed', 'ok',
        H(G2, `ConfirmedAt = SYSDATETIMEOFFSET(), ConfirmedByUserID = '${U1}'`));
    await expectOutcome('Created Confirmed: then change it', 51017, H(G2, `ConfirmedByUserID = '${U2}'`));
    await expectOutcome('Draft with ConfirmedAt: change ConfirmedByUserID', 51017, H(G4, `ConfirmedByUserID = '${U2}'`));

    // Line checks.
    await expectOutcome('Confirmed: change line Quantity', 51003, L(GL1, 'Quantity = 3'));
    await expectOutcome('Confirmed: same-value rewrite, as spUpdate* issues', 'ok',
        L(GL1, 'Quantity = Quantity, UnitPrice = UnitPrice, JournalEntryID = JournalEntryID'));
    await expectOutcome('Confirmed: re-point line journal entry', 51008, L(GL1, `JournalEntryID = '${JE2}'`));
    await expectOutcome('Confirmed: clear line journal entry', 51008, L(GL1, 'JournalEntryID = NULL'));
    await expectOutcome('Order: 51003 before 51008', 51003, L(GL1, 'Quantity = 3, JournalEntryID = NULL'));
    await expectOutcome('Draft: clear line journal entry', 51008, L(GL3, 'JournalEntryID = NULL'));
    await expectOutcome('Draft: stamp a journal entry on an unlinked line', 'ok', L(GL3B, `JournalEntryID = '${JE2}'`));

    // Deletes.
    await expectOutcome('Confirmed: delete a line', 51002, `DELETE FROM ${O}.OrderLine WHERE ID = '${GL1}'`);
    await expectValue('Refused delete left the line in place', '1', `SELECT COUNT(*) AS v FROM ${O}.OrderLine WHERE ID = '${GL1}'`);
    await expectOutcome('Draft: delete a line', 'ok', `DELETE FROM ${O}.OrderLine WHERE ID = '${GL3B}'`);
} finally {
    await cleanup();
    await pool.close();
}

const width = Math.max(...results.map((r) => r.name.length));
for (const r of results) {
    console.log(`${r.pass ? 'PASS' : 'FAIL'}  ${r.name.padEnd(width)}  expected ${String(r.expected).padEnd(8)} got ${r.got}`);
}
const failed = results.filter((r) => !r.pass).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
