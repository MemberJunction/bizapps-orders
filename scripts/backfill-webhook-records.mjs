#!/usr/bin/env node
/**
 * One-off backfill: restore the webhook stamps and delivery rows lost before #940 (bizapps-orders#945).
 *
 * WHY
 *   Until #940, the checkout page's own save of a PaymentIntent could land a moment after the webhook
 *   stamped it and write `ProviderEventID` back to NULL, and the webhook's PaymentWebhookDelivery row
 *   could be rolled back with another request's transaction. Stripe got a 2xx both times, so it will
 *   never redeliver. Without the stamp or the row, a later redelivery of that event is not recognised
 *   as a duplicate. #940 stops new losses; this repairs the old rows.
 *
 * WHERE THE EVENT ID COMES FROM
 *   The intent's own `MJ: Record Changes` history: the newest version of the intent whose
 *   FullRecordJSON carried a ProviderEventID. That is the value the page's save erased. No gateway
 *   key is needed, and Stripe's 30-day event retention does not matter. An intent with no recoverable
 *   id is reported, not written.
 *
 * WHAT IT WRITES
 *   1. `PaymentIntent.ProviderEventID` for a Succeeded intent whose stamp is NULL and whose history
 *      holds an id, unless another intent already holds that id (it is unique; such rows are reported).
 *   2. One `PaymentWebhookDelivery` row, Outcome `Applied`, for every Succeeded intent whose event id
 *      (stamped, or recovered in step 1) has no delivery row for its provider. `Reason` says it is a
 *      backfill; `EventKind` and `OccurredAt` stay NULL because the history does not record them.
 *
 * SAFETY
 *   - Dry run by default: reads only, and reports what it would write. `--apply` writes.
 *   - `--apply` writes in one transaction and re-checks every condition inside it, so a re-run writes
 *     nothing and a failure writes nothing.
 *   - Plain SQL, so no Record Change rows are written and the engine caches are not involved (neither
 *     table is cached).
 *
 * USAGE
 *   DB_HOST=... DB_PORT=1433 DB_DATABASE=... DB_USERNAME=... DB_PASSWORD=... \
 *     node scripts/backfill-webhook-records.mjs            # dry run: counts and the orders it would touch
 *   ... node scripts/backfill-webhook-records.mjs --apply  # write
 *
 *   Optional: DB_TRUST_SERVER_CERTIFICATE=1, MJ_CORE_SCHEMA (default __mj).
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sql from 'mssql';

const INTENT_ENTITY = 'MJ_BizApps_Orders: Payment Intents';
const BACKFILL_REASON = 'Backfilled (bizapps-orders#945): this event was applied before #940, but its delivery row was lost.';

/** The tables the backfill reads and writes, as SQL names. */
export function DefaultTables(coreSchema = '__mj', ordersSchema = '__mj_BizAppsOrders') {
    return {
        PaymentIntent: `[${ordersSchema}].[PaymentIntent]`,
        PaymentWebhookDelivery: `[${ordersSchema}].[PaymentWebhookDelivery]`,
        OrderHeader: `[${ordersSchema}].[OrderHeader]`,
        RecordChange: `[${coreSchema}].[RecordChange]`,
        Entity: `[${coreSchema}].[Entity]`,
    };
}

/**
 * The dry-run report and the write, over the same rows.
 *
 * @param {ReturnType<typeof DefaultTables>} t
 */
export function BuildBackfillSql(t) {
    // Every Succeeded intent missing its stamp or its delivery row, with the id to use.
    const candidatesCte = `
WITH Recovered AS (
    SELECT pi.ID AS IntentID, pi.PaymentProviderID, pi.ProviderIntentID, pi.OrderHeaderID,
           pi.ProviderEventID AS StampedEventID,
           hist.ProviderEventID AS HistoryEventID
    FROM ${t.PaymentIntent} pi
    OUTER APPLY (
        SELECT TOP 1 j.ProviderEventID
        FROM ${t.RecordChange} rc
        JOIN ${t.Entity} e ON e.ID = rc.EntityID AND e.Name = N'${INTENT_ENTITY}'
        CROSS APPLY OPENJSON(CASE WHEN ISJSON(rc.FullRecordJSON) = 1 THEN rc.FullRecordJSON END)
             WITH (ProviderEventID NVARCHAR(100) '$.ProviderEventID') j
        WHERE UPPER(rc.RecordID) = N'ID|' + UPPER(CONVERT(NVARCHAR(36), pi.ID))
          AND NULLIF(j.ProviderEventID, N'') IS NOT NULL
        ORDER BY rc.ChangedAt DESC
    ) hist
    WHERE pi.Status = N'Succeeded'
),
Candidate AS (
    SELECT r.*,
           COALESCE(NULLIF(r.StampedEventID, N''), r.HistoryEventID) AS EventID,
           CASE WHEN NULLIF(r.StampedEventID, N'') IS NULL AND r.HistoryEventID IS NOT NULL
                     AND NOT EXISTS (SELECT 1 FROM ${t.PaymentIntent} o
                                     WHERE o.ProviderEventID = r.HistoryEventID AND o.ID <> r.IntentID)
                THEN 1 ELSE 0 END AS WillStamp,
           CASE WHEN NULLIF(r.StampedEventID, N'') IS NULL AND r.HistoryEventID IS NOT NULL
                     AND EXISTS (SELECT 1 FROM ${t.PaymentIntent} o
                                 WHERE o.ProviderEventID = r.HistoryEventID AND o.ID <> r.IntentID)
                THEN 1 ELSE 0 END AS StampHeldElsewhere
    FROM Recovered r
),
Work AS (
    SELECT c.*,
           CASE WHEN c.EventID IS NOT NULL AND c.StampHeldElsewhere = 0
                     AND NOT EXISTS (SELECT 1 FROM ${t.PaymentWebhookDelivery} d
                                     WHERE d.PaymentProviderID = c.PaymentProviderID AND d.ProviderEventID = c.EventID)
                THEN 1 ELSE 0 END AS WillAddDelivery
    FROM Candidate c
    WHERE NULLIF(c.StampedEventID, N'') IS NULL
       OR NOT EXISTS (SELECT 1 FROM ${t.PaymentWebhookDelivery} d
                      WHERE d.PaymentProviderID = c.PaymentProviderID AND d.ProviderEventID = c.EventID)
)`;

    const report = `
SET NOCOUNT ON;
${candidatesCte}
SELECT COUNT(*) AS IntentsNeedingRepair,
       ISNULL(SUM(WillStamp), 0) AS StampsToRestore,
       ISNULL(SUM(WillAddDelivery), 0) AS DeliveryRowsToAdd,
       ISNULL(SUM(CASE WHEN EventID IS NULL THEN 1 ELSE 0 END), 0) AS NoEventIDInHistory,
       ISNULL(SUM(StampHeldElsewhere), 0) AS EventIDHeldByAnotherIntent
FROM Work;

${candidatesCte}
SELECT o.OrderNumber, w.ProviderIntentID, w.EventID,
       CASE WHEN w.EventID IS NULL THEN N'no event id in history: needs the gateway'
            WHEN w.StampHeldElsewhere = 1 THEN N'event id already on another intent: check by hand'
            ELSE CONCAT(CASE WHEN w.WillStamp = 1 THEN N'restore stamp' ELSE N'' END,
                        CASE WHEN w.WillStamp = 1 AND w.WillAddDelivery = 1 THEN N' + ' ELSE N'' END,
                        CASE WHEN w.WillAddDelivery = 1 THEN N'add delivery row' ELSE N'' END) END AS Action
FROM Work w
LEFT JOIN ${t.OrderHeader} o ON o.ID = w.OrderHeaderID
ORDER BY o.OrderNumber, w.ProviderIntentID;
`;

    const apply = `
SET NOCOUNT ON;
SET XACT_ABORT ON;
BEGIN TRANSACTION;
DECLARE @Work TABLE (IntentID UNIQUEIDENTIFIER, PaymentProviderID UNIQUEIDENTIFIER, ProviderIntentID NVARCHAR(100),
                     EventID NVARCHAR(100), WillStamp BIT, WillAddDelivery BIT);
${candidatesCte}
INSERT INTO @Work (IntentID, PaymentProviderID, ProviderIntentID, EventID, WillStamp, WillAddDelivery)
SELECT IntentID, PaymentProviderID, ProviderIntentID, EventID, WillStamp, WillAddDelivery FROM Work
WHERE WillStamp = 1 OR WillAddDelivery = 1;

UPDATE pi SET ProviderEventID = w.EventID
FROM ${t.PaymentIntent} pi
JOIN @Work w ON w.IntentID = pi.ID
WHERE w.WillStamp = 1 AND pi.ProviderEventID IS NULL;
DECLARE @Stamped INT = @@ROWCOUNT;

INSERT INTO ${t.PaymentWebhookDelivery}
    (PaymentProviderID, ProviderEventID, EventKind, PaymentIntentID, ProviderIntentID, Outcome, Reason)
SELECT w.PaymentProviderID, w.EventID, NULL, w.IntentID, w.ProviderIntentID, N'Applied', N'${BACKFILL_REASON}'
FROM @Work w
WHERE w.WillAddDelivery = 1;
DECLARE @Delivered INT = @@ROWCOUNT;

SELECT @Stamped AS StampsRestored, @Delivered AS DeliveryRowsAdded;
COMMIT TRANSACTION;
`;

    return { Report: report, Apply: apply };
}

/** Runs the report, then the write when `apply` is set. Returns what it found and wrote. */
export async function RunBackfill(pool, t, apply, log = console.log) {
    const { Report, Apply } = BuildBackfillSql(t);
    const result = await pool.request().query(Report);
    const [totals, rows] = result.recordsets;
    log('\nSucceeded intents missing a stamp or a delivery row:');
    console.table(totals);
    if (rows.length) {
        log('\nBy order:');
        console.table(rows);
    }

    let written = { StampsRestored: 0, DeliveryRowsAdded: 0 };
    if (!apply) {
        log('\nDry run: nothing written. Re-run with --apply to write.');
    } else if (!totals[0].StampsToRestore && !totals[0].DeliveryRowsToAdd) {
        log('\nNothing to write.');
    } else {
        const applied = await pool.request().query(Apply);
        written = applied.recordset?.[0] ?? written;
        log(`\nRestored ${written.StampsRestored} stamp(s) and added ${written.DeliveryRowsAdded} delivery row(s).`);
    }
    return { Totals: totals[0], Rows: rows, ...written };
}

async function main() {
    const args = process.argv.slice(2);
    const unknown = args.filter((a) => a !== '--apply');
    if (unknown.length) {
        console.error(`Unknown argument(s): ${unknown.join(' ')}. The only option is --apply.`);
        process.exit(2);
    }
    const coreSchema = process.env.MJ_CORE_SCHEMA || '__mj';
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(coreSchema)) {
        console.error(`MJ_CORE_SCHEMA is not a schema name: ${coreSchema}`);
        process.exit(2);
    }
    for (const name of ['DB_HOST', 'DB_DATABASE', 'DB_USERNAME', 'DB_PASSWORD']) {
        if (!process.env[name]) {
            console.error(`${name} is not set.`);
            process.exit(2);
        }
    }

    const pool = await sql.connect({
        server: process.env.DB_HOST,
        port: Number(process.env.DB_PORT || 1433),
        database: process.env.DB_DATABASE,
        user: process.env.DB_USERNAME,
        password: process.env.DB_PASSWORD,
        options: {
            encrypt: true,
            trustServerCertificate: ['1', 'true', 'Y'].includes(String(process.env.DB_TRUST_SERVER_CERTIFICATE ?? '')),
        },
        requestTimeout: 300_000,
    });
    try {
        console.log(`Database ${process.env.DB_DATABASE} on ${process.env.DB_HOST}`);
        await RunBackfill(pool, DefaultTables(coreSchema), args.includes('--apply'));
    } finally {
        await pool.close();
    }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    await main();
}
