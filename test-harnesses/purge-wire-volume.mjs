#!/usr/bin/env node
/**
 * Delete committed wire-volume orders (Notes LIKE 'WIRE-VOL:%'). Leaves ORD-WORLD catalog in place.
 *
 *   node test-harnesses/purge-wire-volume.mjs
 *   node test-harnesses/purge-wire-volume.mjs WIRE-VOL:20260816120000-ab12cd
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import sql from 'mssql';

const here = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(here, '..', '.env'), quiet: true });

const tag = process.argv[2] ?? 'WIRE-VOL:%';
const { DB_HOST, DB_PORT, DB_DATABASE, DB_USERNAME, DB_PASSWORD } = process.env;
const pool = await new sql.ConnectionPool({
    server: DB_HOST,
    port: Number(DB_PORT ?? 1433),
    database: DB_DATABASE,
    user: DB_USERNAME,
    password: DB_PASSWORD,
    options: { trustServerCertificate: true, encrypt: false },
    pool: { max: 4, min: 1 },
}).connect();

const ORDERS = '__mj_BizAppsOrders';
const ACCT = '__mj_BizAppsAccounting';
const like = tag.replace(/'/g, "''");
const orderScope = `SELECT ID FROM ${ORDERS}.OrderHeader WHERE Notes LIKE '${like}'`;

const statements = [
    `DISABLE TRIGGER ${ORDERS}.trg_OrderLine_ImmutableAfterConfirm ON ${ORDERS}.OrderLine`,
    `DISABLE TRIGGER ${ORDERS}.trg_PaymentLine_ImmutableAfterCapture ON ${ORDERS}.PaymentLine`,
    `DISABLE TRIGGER ${ORDERS}.trg_PaymentHeader_ImmutableAfterCapture ON ${ORDERS}.PaymentHeader`,
    `DISABLE TRIGGER ${ORDERS}.trg_PaymentDetail_Immutable ON ${ORDERS}.PaymentDetail`,

    `DELETE FROM ${ORDERS}.EntitlementGrant WHERE OrderLineID IN
        (SELECT ID FROM ${ORDERS}.OrderLine WHERE OrderHeaderID IN (${orderScope}))`,
    `DELETE FROM ${ORDERS}.EntitlementGrant WHERE SubscriptionID IN
        (SELECT s.ID FROM ${ORDERS}.Subscription s
          JOIN ${ORDERS}.OrderLine l ON l.ID = s.OrderLineID
         WHERE l.OrderHeaderID IN (${orderScope}))`,

    `DELETE FROM ${ORDERS}.OrderLinePriceComponent WHERE OrderLineID IN
        (SELECT ID FROM ${ORDERS}.OrderLine WHERE OrderHeaderID IN (${orderScope}))`,
    `DELETE FROM ${ORDERS}.OrderAdjustmentAllocation WHERE OrderAdjustmentID IN
        (SELECT ID FROM ${ORDERS}.OrderAdjustment WHERE OrderHeaderID IN (${orderScope}))`,
    `DELETE FROM ${ORDERS}.OrderAdjustment WHERE OrderHeaderID IN (${orderScope})`,
    `DELETE FROM ${ORDERS}.OrderChargeAllocation WHERE OrderChargeID IN
        (SELECT ID FROM ${ORDERS}.OrderCharge WHERE OrderHeaderID IN (${orderScope}))`,
    `DELETE FROM ${ORDERS}.OrderCharge WHERE OrderHeaderID IN (${orderScope})`,

    `IF OBJECT_ID('tempdb..#WireVolPay') IS NOT NULL DROP TABLE #WireVolPay`,
    `SELECT DISTINCT pl.PaymentHeaderID AS ID
       INTO #WireVolPay
       FROM ${ORDERS}.PaymentLine pl
      WHERE pl.OrderHeaderID IN (${orderScope})`,
    `INSERT INTO #WireVolPay (ID)
     SELECT ph.ID FROM ${ORDERS}.PaymentHeader ph
      WHERE ph.Notes LIKE '${like}'
        AND NOT EXISTS (SELECT 1 FROM #WireVolPay x WHERE x.ID = ph.ID)`,

    `IF OBJECT_ID('tempdb..#WireVolDetail') IS NOT NULL DROP TABLE #WireVolDetail`,
    `SELECT ID INTO #WireVolDetail FROM ${ORDERS}.PaymentDetail WHERE 1 = 0`,
    `INSERT INTO #WireVolDetail (ID)
     SELECT InitialPaymentDetailID FROM ${ORDERS}.OrderHeader
      WHERE ID IN (${orderScope}) AND InitialPaymentDetailID IS NOT NULL`,
    `INSERT INTO #WireVolDetail (ID)
     SELECT ph.PaymentDetailID FROM ${ORDERS}.PaymentHeader ph
      WHERE ph.ID IN (SELECT ID FROM #WireVolPay)
        AND ph.PaymentDetailID IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM #WireVolDetail d WHERE d.ID = ph.PaymentDetailID)`,

    `UPDATE ${ORDERS}.OrderLine SET JournalEntryID = NULL WHERE OrderHeaderID IN (${orderScope})`,
    `UPDATE ${ORDERS}.OrderLine SET ParentOrderLineID = NULL WHERE OrderHeaderID IN (${orderScope})`,
    `UPDATE ${ORDERS}.OrderHeader SET InitialPaymentDetailID = NULL WHERE ID IN (${orderScope})`,
    `UPDATE ${ORDERS}.PaymentHeader SET JournalEntryID = NULL, PaymentDetailID = NULL
      WHERE ID IN (SELECT ID FROM #WireVolPay)`,

    `DELETE jel FROM ${ACCT}.JournalEntryLine jel
        JOIN ${ACCT}.JournalEntry je ON je.ID = jel.JournalEntryID
       WHERE je.LinkedRecordID IN (SELECT ID FROM ${ORDERS}.OrderLine WHERE OrderHeaderID IN (${orderScope}))`,
    `DELETE FROM ${ACCT}.JournalEntry
      WHERE LinkedRecordID IN (SELECT ID FROM ${ORDERS}.OrderLine WHERE OrderHeaderID IN (${orderScope}))`,

    `DELETE FROM ${ORDERS}.PaymentLine WHERE OrderHeaderID IN (${orderScope})
        OR PaymentHeaderID IN (SELECT ID FROM #WireVolPay)`,
    `DELETE FROM ${ORDERS}.PaymentHeader WHERE ID IN (SELECT ID FROM #WireVolPay)`,
    `DELETE FROM ${ORDERS}.PaymentDetail WHERE ID IN (SELECT ID FROM #WireVolDetail)`,

    `DELETE FROM ${ORDERS}.SubscriptionTerm WHERE SubscriptionID IN
        (SELECT s.ID FROM ${ORDERS}.Subscription s
          JOIN ${ORDERS}.OrderLine l ON l.ID = s.OrderLineID
         WHERE l.OrderHeaderID IN (${orderScope}))`,
    `DELETE FROM ${ORDERS}.SubscriptionEvent WHERE SubscriptionID IN
        (SELECT s.ID FROM ${ORDERS}.Subscription s
          JOIN ${ORDERS}.OrderLine l ON l.ID = s.OrderLineID
         WHERE l.OrderHeaderID IN (${orderScope}))`,
    `DELETE FROM ${ORDERS}.Subscription WHERE OrderLineID IN
        (SELECT ID FROM ${ORDERS}.OrderLine WHERE OrderHeaderID IN (${orderScope}))`,

    `DELETE FROM ${ORDERS}.EventOrderLine WHERE ID IN
        (SELECT ID FROM ${ORDERS}.OrderLine WHERE OrderHeaderID IN (${orderScope}))`,
    `DELETE FROM ${ORDERS}.OrderLine WHERE OrderHeaderID IN (${orderScope})`,
    `DELETE FROM ${ORDERS}.OrderHeader WHERE Notes LIKE '${like}'`,

    `ENABLE TRIGGER ${ORDERS}.trg_OrderLine_ImmutableAfterConfirm ON ${ORDERS}.OrderLine`,
    `ENABLE TRIGGER ${ORDERS}.trg_PaymentLine_ImmutableAfterCapture ON ${ORDERS}.PaymentLine`,
    `ENABLE TRIGGER ${ORDERS}.trg_PaymentHeader_ImmutableAfterCapture ON ${ORDERS}.PaymentHeader`,
    `ENABLE TRIGGER ${ORDERS}.trg_PaymentDetail_Immutable ON ${ORDERS}.PaymentDetail`,
];

const before = await pool.request().query(
    `SELECT COUNT(*) AS N FROM ${ORDERS}.OrderHeader WHERE Notes LIKE '${like}'`,
);
console.log(`\nPurging ${before.recordset[0].N} WIRE-VOL headers matching '${tag}' from ${DB_DATABASE}\n`);

for (const statement of statements) {
    try {
        await pool.request().query(statement);
    } catch (e) {
        const err = e;
        const detail = err.originalError?.message ?? err.message;
        console.warn(`  warn: ${String(detail).split('\n')[0]}`);
    }
}

const after = await pool.request().query(
    `SELECT COUNT(*) AS N FROM ${ORDERS}.OrderHeader WHERE Notes LIKE '${like}'`,
);
console.log(`Remaining tagged headers: ${after.recordset[0].N}\n`);
await pool.close();
process.exit(after.recordset[0].N === 0 ? 0 : 1);
