#!/usr/bin/env node
/**
 * Exercise trg_OrderHeader_AddressFrozenAfterConfirm (51015) and
 * trg_OrderLine_AddressFrozenAfterConfirm (51016) against a real database (golive #263).
 *
 *   node test-harnesses/address-snapshot-triggers.mjs
 *
 * Reads the connection from .env like the other harnesses. Needs one existing Product (any
 * seeded database has one); its company is used for the test orders. Every row it writes carries
 * a fixed ID in the ADD5… range and is deleted before and after the run, so it can be re-run.
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
    pool: { max: 1, min: 1 },
}).connect();

const O = '__mj_BizAppsOrders';
const C = '__mj_BizAppsCommon';

const A1 = 'ADD50000-0000-4000-8000-0000000000A1';
const A2 = 'ADD50000-0000-4000-8000-0000000000A2';
const A3 = 'ADD50000-0000-4000-8000-0000000000A3';
const O1 = 'ADD50000-0000-4000-8000-0000000000C1'; // confirmed with addresses
const O2 = 'ADD50000-0000-4000-8000-0000000000C2'; // confirmed with no address
const O3 = 'ADD50000-0000-4000-8000-0000000000C3'; // stays draft
const O4 = 'ADD50000-0000-4000-8000-0000000000C4'; // created Confirmed, not yet booked (conversion)
const L1 = 'ADD50000-0000-4000-8000-0000000000D1'; // O1, own ship-to
const L2 = 'ADD50000-0000-4000-8000-0000000000D2'; // O1, inherits the header's ship-to
const ORDERS = [O1, O2, O3, O4].map((id) => `'${id}'`).join(',');

const snap = (id, line1, city, state, zip) =>
    `N'${JSON.stringify({ AddressID: id, Line1: line1, Line2: null, Line3: null, City: city, StateProvince: state, PostalCode: zip, Country: 'US' })}'`;
const SNAP_A1 = snap(A1, '1 Billing Way', 'Chicago', 'IL', '60601');
const SNAP_A2 = snap(A2, '2 Shipping Rd', 'Austin', 'TX', '73301');
const SNAP_A3 = snap(A3, '3 Moved St', 'Seattle', 'WA', '98101');

async function run(text) {
    return pool.request().query(text);
}

/** Every error number SQL Server reported for a failed statement. */
function errorNumbers(err) {
    return [err.number, ...(err.precedingErrors ?? []).map((e) => e.number)].filter((n) => n != null);
}

async function cleanup() {
    // trg_OrderLine_ImmutableAfterConfirm refuses deleting a confirmed order's lines (51002).
    await run(`DISABLE TRIGGER ${O}.trg_OrderLine_ImmutableAfterConfirm ON ${O}.OrderLine`);
    try {
        await run(`DELETE FROM ${O}.OrderLine WHERE OrderHeaderID IN (${ORDERS})`);
        await run(`DELETE FROM ${O}.OrderHeader WHERE ID IN (${ORDERS})`);
        await run(`DELETE FROM ${C}.Address WHERE ID IN ('${A1}','${A2}','${A3}')`);
    } finally {
        await run(`ENABLE TRIGGER ${O}.trg_OrderLine_ImmutableAfterConfirm ON ${O}.OrderLine`);
    }
}

async function setup() {
    const product = (await run(`SELECT TOP 1 ID, CompanyID FROM ${O}.Product`)).recordset[0];
    if (!product) throw new Error('This harness needs a database with at least one Product.');
    const { ID: productID, CompanyID: companyID } = product;
    await run(`
        INSERT ${C}.Address (ID, Line1, City, StateProvince, PostalCode, Country) VALUES
          ('${A1}', '1 Billing Way', 'Chicago', 'IL', '60601', 'US'),
          ('${A2}', '2 Shipping Rd', 'Austin',  'TX', '73301', 'US'),
          ('${A3}', '3 Moved St',    'Seattle', 'WA', '98101', 'US');
        INSERT ${O}.OrderHeader (ID, OrderNumber, OrderDate, CompanyID, Status, ConfirmedAt, BillToAddressID, ShipToAddressID) VALUES
          ('${O1}', 'ADDR-SNAP-1', '2026-09-23', '${companyID}', 'Draft',     NULL, '${A1}', '${A2}'),
          ('${O2}', 'ADDR-SNAP-2', '2026-09-23', '${companyID}', 'Draft',     NULL, NULL,    NULL),
          ('${O3}', 'ADDR-SNAP-3', '2026-09-23', '${companyID}', 'Draft',     NULL, NULL,    NULL),
          ('${O4}', 'ADDR-SNAP-4', '2026-09-23', '${companyID}', 'Confirmed', NULL, '${A1}', NULL);
        INSERT ${O}.OrderLine (ID, OrderHeaderID, ProductID, CompanyID, LineNumber, Quantity, UnitPrice, ShipToAddressID) VALUES
          ('${L1}', '${O1}', '${productID}', '${companyID}', 1, 1, 10, '${A2}'),
          ('${L2}', '${O1}', '${productID}', '${companyID}', 2, 1, 10, NULL);`);
}

const results = [];

/** Run one statement and record whether it passed or was refused with the expected error. */
async function expectOutcome(name, expected, text) {
    let got = 'ok';
    try {
        await run(text);
    } catch (err) {
        const numbers = errorNumbers(err);
        got = numbers.find((n) => n === 547 || n >= 50000) ?? numbers[0] ?? 'error';
    }
    results.push({ name, expected, got, pass: String(got) === String(expected) });
}

/** Record a check on stored state. */
async function expectValue(name, expected, text) {
    const got = (await run(text)).recordset[0]?.v ?? null;
    results.push({ name, expected, got, pass: String(got) === String(expected) });
}

const H = (id, set) => `UPDATE ${O}.OrderHeader SET ${set} WHERE ID = '${id}'`;
const L = (id, set) => `UPDATE ${O}.OrderLine SET ${set} WHERE ID = '${id}'`;
const confirm = (id, set = '') => H(id, `Status = 'Confirmed', ConfirmedAt = SYSDATETIMEOFFSET()${set}`);

try {
    await cleanup();
    await setup();

    // Draft orders follow the live address.
    await expectOutcome('Draft: change header ship-to', 'ok', H(O1, `ShipToAddressID = '${A3}'`));
    await expectOutcome('Draft: change it back', 'ok', H(O1, `ShipToAddressID = '${A2}'`));
    await expectOutcome('Draft: change line ship-to and back', 'ok', `${L(L1, `ShipToAddressID = '${A3}'`)}; ${L(L1, `ShipToAddressID = '${A2}'`)}`);
    await expectOutcome('Draft: non-JSON snapshot refused by CHECK', 547, H(O1, `BillToAddressSnapshot = N'not json'`));

    // The confirm path: line snapshots while the header is Draft, then the confirming header write.
    await expectOutcome('Line snapshot written while header is Draft', 'ok', L(L1, `ShipToAddressSnapshot = ${SNAP_A2}`));
    await expectOutcome('Confirm, writing header snapshots', 'ok', confirm(O1, `, BillToAddressSnapshot = ${SNAP_A1}, ShipToAddressSnapshot = ${SNAP_A2}`));

    // The customer moves.
    await expectOutcome("Edit the customer's Address row", 'ok',
        `UPDATE ${C}.Address SET Line1 = '9 New Pl', City = 'Seattle', StateProvince = 'WA', PostalCode = '98101' WHERE ID = '${A1}'`);
    await expectValue('Order still reports the state and postal code it was sold to', 'IL 60601',
        `SELECT CONCAT(JSON_VALUE(BillToAddressSnapshot, '$.StateProvince'), ' ', JSON_VALUE(BillToAddressSnapshot, '$.PostalCode')) AS v FROM ${O}.OrderHeader WHERE ID = '${O1}'`);

    // A set address, and any written snapshot, is final.
    await expectOutcome('Confirmed: replace BillToAddressID', 51015, H(O1, `BillToAddressID = '${A3}'`));
    await expectOutcome('Confirmed: clear ShipToAddressID', 51015, H(O1, 'ShipToAddressID = NULL'));
    await expectOutcome('Confirmed: rewrite bill-to snapshot', 51015, H(O1, `BillToAddressSnapshot = ${SNAP_A3}`));
    await expectOutcome('Confirmed: clear ship-to snapshot', 51015, H(O1, 'ShipToAddressSnapshot = NULL'));
    await expectOutcome('Confirmed: replace line ship-to', 51016, L(L1, `ShipToAddressID = '${A3}'`));
    await expectOutcome('Confirmed: rewrite line snapshot', 51016, L(L1, `ShipToAddressSnapshot = ${SNAP_A1}`));

    // An empty address may be filled once, with its snapshot.
    await expectOutcome('Confirmed: fill an empty line ship-to without a snapshot', 51016, L(L2, `ShipToAddressID = '${A3}'`));
    await expectOutcome('Confirmed: fill an empty line ship-to with its snapshot', 'ok', L(L2, `ShipToAddressID = '${A3}', ShipToAddressSnapshot = ${SNAP_A3}`));
    await expectOutcome('Confirmed: then replace it', 51016, L(L2, `ShipToAddressID = '${A2}'`));
    await expectOutcome('Confirm an order with no address', 'ok', confirm(O2));
    await expectOutcome('Confirmed: fill empty bill-to without a snapshot', 51015, H(O2, `BillToAddressID = '${A3}'`));
    await expectOutcome('Confirmed: fill empty bill-to with its snapshot', 'ok', H(O2, `BillToAddressID = '${A3}', BillToAddressSnapshot = ${SNAP_A3}`));
    await expectOutcome('Confirmed: then replace it', 51015, H(O2, `BillToAddressID = '${A1}'`));

    // A confirmed order with no snapshot yet: created Confirmed and booked later.
    await expectOutcome('Created Confirmed: booking writes the missing snapshot', 'ok', H(O4, `ConfirmedAt = SYSDATETIMEOFFSET(), BillToAddressSnapshot = ${SNAP_A1}`));

    // What stays writable.
    await expectOutcome('Confirmed: edit Notes', 'ok', H(O1, `Notes = 'called customer'`));
    await expectOutcome('Confirmed: same-value rewrite, as spUpdate* issues', 'ok',
        `${H(O1, 'BillToAddressID = BillToAddressID, ShipToAddressID = ShipToAddressID, BillToAddressSnapshot = BillToAddressSnapshot, ShipToAddressSnapshot = ShipToAddressSnapshot')};
         UPDATE ${O}.OrderLine SET ShipToAddressID = ShipToAddressID, ShipToAddressSnapshot = ShipToAddressSnapshot WHERE OrderHeaderID = '${O1}'`);

    // A refused multi-row write refuses the whole statement.
    await expectOutcome('Multi-row: draft change with a confirmed change', 51015,
        `UPDATE ${O}.OrderHeader SET ShipToAddressID = '${A3}' WHERE ID IN ('${O1}', '${O3}')`);
    await expectValue('Draft in the refused statement is unchanged', 'none',
        `SELECT ISNULL(CONVERT(varchar(36), ShipToAddressID), 'none') AS v FROM ${O}.OrderHeader WHERE ID = '${O3}'`);

    // A written snapshot is final on any status.
    await expectOutcome('Draft: set a snapshot by direct SQL', 'ok', H(O3, `BillToAddressSnapshot = ${SNAP_A1}`));
    await expectOutcome('Draft: rewrite it', 51015, H(O3, `BillToAddressSnapshot = ${SNAP_A2}`));
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
