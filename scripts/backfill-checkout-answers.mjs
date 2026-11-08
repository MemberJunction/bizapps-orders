#!/usr/bin/env node
/**
 * One-off backfill: write the checkout answers that orders confirmed before the fix never got
 * (bizapps-orders#540).
 *
 * WHY
 *   From 5.21.0 until the confirm wrote them, a checkout that asked questions stored the buyer's
 *   answers on its session (`CheckoutSession.MetadataJSON`, key `Answers`) and confirmed the order,
 *   but the booking save skipped the order's related collections, so no `OrderCheckoutAnswer` row
 *   was written. The session still names its order (`DraftOrderID`), so the answers can be copied.
 *
 * WHAT IT WRITES
 *   One `OrderCheckoutAnswer` per stored answer, for every order that a Confirmed session names,
 *   whose session holds at least one answer, and that has no answer rows yet. The question label
 *   is taken from the widget's Configuration as of the order's creation, read from the widget's
 *   Record Change history; when that history has no version from before the order, from the
 *   widget's current Configuration; when the question is gone from both, the question key.
 *   The answer and "Other" text are copied as stored: the checkout checked and trimmed them before
 *   storing them.
 *
 * SAFETY
 *   - Dry run by default: reads only, and reports what it would write. `--apply` writes.
 *   - `--apply` writes in one transaction and re-checks "no answer rows yet" inside it, so a re-run
 *     writes nothing and a failure writes nothing.
 *   - Plain SQL, so no Record Change rows are written for the backfilled answers.
 *   - The report names orders and question keys, never the answers.
 *
 * USAGE
 *   DB_HOST=... DB_PORT=1433 DB_DATABASE=... DB_USERNAME=... DB_PASSWORD=... \
 *     node scripts/backfill-checkout-answers.mjs            # dry run: counts and the orders it would touch
 *   ... node scripts/backfill-checkout-answers.mjs --apply  # write
 *
 *   Optional: DB_TRUST_SERVER_CERTIFICATE=1, MJ_CORE_SCHEMA (default __mj).
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sql from 'mssql';

const WIDGET_ENTITY = 'MJ_BizApps_Orders: Checkout Widgets';

/** The tables the backfill reads and writes, as SQL names. */
export function DefaultTables(coreSchema = '__mj', ordersSchema = '__mj_BizAppsOrders') {
    return {
        CheckoutSession: `[${ordersSchema}].[CheckoutSession]`,
        CheckoutWidget: `[${ordersSchema}].[CheckoutWidget]`,
        OrderHeader: `[${ordersSchema}].[OrderHeader]`,
        OrderCheckoutAnswer: `[${ordersSchema}].[OrderCheckoutAnswer]`,
        RecordChange: `[${coreSchema}].[RecordChange]`,
        Entity: `[${coreSchema}].[Entity]`,
    };
}

/** Parses as JSON or is null, so OPENJSON never sees text that would make it throw. */
const json = (expr) => `CASE WHEN ISJSON(${expr}) = 1 THEN ${expr} END`;

/**
 * The dry-run report and the write, over the same rows.
 *
 * @param {ReturnType<typeof DefaultTables>} t
 */
export function BuildBackfillSql(t) {
    // Every answer the backfill would write, one row each.
    const answersCte = `
WITH Candidate AS (
    SELECT s.ID AS SessionID, s.DraftOrderID AS OrderID, s.CheckoutWidgetID, s.MetadataJSON,
           o.__mj_CreatedAt AS OrderCreatedAt,
           -- One session per order, should two ever name the same one.
           ROW_NUMBER() OVER (PARTITION BY s.DraftOrderID ORDER BY s.__mj_UpdatedAt DESC, s.ID) AS SessionRank
    FROM ${t.CheckoutSession} s
    JOIN ${t.OrderHeader} o ON o.ID = s.DraftOrderID
    WHERE s.Status = N'Confirmed'
      AND NOT EXISTS (SELECT 1 FROM ${t.OrderCheckoutAnswer} a WHERE a.OrderHeaderID = s.DraftOrderID)
),
Stored AS (
    SELECT c.SessionID, c.OrderID, c.CheckoutWidgetID, c.OrderCreatedAt,
           ans.[key] COLLATE DATABASE_DEFAULT AS QuestionKey,
           JSON_VALUE(ans.value, '$.Value') AS Answer,
           NULLIF(JSON_VALUE(ans.value, '$.OtherText'), N'') AS OtherText
    FROM Candidate c
    CROSS APPLY OPENJSON(${json('c.MetadataJSON')}, '$.Answers') ans
    WHERE c.SessionRank = 1
      AND ans.type = 5
      AND NULLIF(JSON_VALUE(ans.value, '$.Value'), N'') IS NOT NULL
),
Labelled AS (
    SELECT st.*,
           (SELECT TOP 1 q.label
              FROM OPENJSON(${json('hist.Configuration')}, '$.questions')
                   WITH ([key] NVARCHAR(100) '$.key', label NVARCHAR(500) '$.label') q
             WHERE q.[key] = st.QuestionKey) AS LabelAtOrder,
           (SELECT TOP 1 q.label
              FROM OPENJSON(${json('w.Configuration')}, '$.questions')
                   WITH ([key] NVARCHAR(100) '$.key', label NVARCHAR(500) '$.label') q
             WHERE q.[key] = st.QuestionKey) AS LabelNow
    FROM Stored st
    JOIN ${t.CheckoutWidget} w ON w.ID = st.CheckoutWidgetID
    OUTER APPLY (
        SELECT TOP 1 cfg.Configuration
        FROM ${t.RecordChange} rc
        JOIN ${t.Entity} e ON e.ID = rc.EntityID AND e.Name = N'${WIDGET_ENTITY}'
        CROSS APPLY OPENJSON(${json('rc.FullRecordJSON')}) WITH (Configuration NVARCHAR(MAX) '$.Configuration') cfg
        WHERE UPPER(rc.RecordID) = N'ID|' + UPPER(CONVERT(NVARCHAR(36), st.CheckoutWidgetID))
          AND rc.ChangedAt <= st.OrderCreatedAt
        ORDER BY rc.ChangedAt DESC
    ) hist
),
Backfill AS (
    SELECT OrderID, SessionID, QuestionKey,
           LEFT(COALESCE(LabelAtOrder, LabelNow, QuestionKey), 500) AS QuestionLabel,
           CASE WHEN LabelAtOrder IS NOT NULL THEN N'history'
                WHEN LabelNow IS NOT NULL THEN N'current widget'
                ELSE N'question key' END AS LabelSource,
           LEFT(Answer, 1000) AS Answer,
           LEFT(OtherText, 1000) AS OtherText
    FROM Labelled
)`;

    const report = `
SET NOCOUNT ON;
-- Confirmed sessions by what their MetadataJSON holds: tells whether answers survived completion.
SELECT
    COUNT(*) AS ConfirmedSessions,
    ISNULL(SUM(CASE WHEN x.MetadataJSON IS NULL THEN 1 ELSE 0 END), 0) AS WithoutMetadata,
    ISNULL(SUM(CASE WHEN x.MetadataJSON IS NOT NULL AND ISJSON(x.MetadataJSON) = 0 THEN 1 ELSE 0 END), 0) AS UnreadableMetadata,
    ISNULL(SUM(CASE WHEN JSON_QUERY(${json('x.MetadataJSON')}, '$.Answers') IS NOT NULL
                     AND JSON_QUERY(${json('x.MetadataJSON')}, '$.Answers') <> N'{}' THEN 1 ELSE 0 END), 0) AS WithStoredAnswers,
    ISNULL(SUM(x.OrderHasAnswers), 0) AS OrderAlreadyHasAnswers
FROM (
    SELECT s.MetadataJSON,
           CASE WHEN EXISTS (SELECT 1 FROM ${t.OrderCheckoutAnswer} a WHERE a.OrderHeaderID = s.DraftOrderID)
                THEN 1 ELSE 0 END AS OrderHasAnswers
    FROM ${t.CheckoutSession} s
    WHERE s.Status = N'Confirmed'
) x;

${answersCte}
SELECT COUNT(DISTINCT b.OrderID) AS Orders, COUNT(*) AS AnswerRows,
       ISNULL(SUM(CASE WHEN b.LabelSource = N'history' THEN 1 ELSE 0 END), 0) AS LabelsFromHistory,
       ISNULL(SUM(CASE WHEN b.LabelSource = N'current widget' THEN 1 ELSE 0 END), 0) AS LabelsFromCurrentWidget,
       ISNULL(SUM(CASE WHEN b.LabelSource = N'question key' THEN 1 ELSE 0 END), 0) AS LabelsFromKey
FROM Backfill b;

${answersCte}
SELECT o.OrderNumber, o.Status AS OrderStatus, b.QuestionKey, b.LabelSource
FROM Backfill b
JOIN ${t.OrderHeader} o ON o.ID = b.OrderID
ORDER BY o.OrderNumber, b.QuestionKey;
`;

    const apply = `
SET NOCOUNT ON;
SET XACT_ABORT ON;
BEGIN TRANSACTION;
${answersCte}
INSERT INTO ${t.OrderCheckoutAnswer} (OrderHeaderID, QuestionKey, QuestionLabel, Answer, OtherText)
SELECT OrderID, QuestionKey, QuestionLabel, Answer, OtherText FROM Backfill;
SELECT @@ROWCOUNT AS Inserted;
COMMIT TRANSACTION;
`;

    return { Report: report, Apply: apply };
}

/** Runs the report, then the write when `apply` is set. Returns what it found and wrote. */
export async function RunBackfill(pool, t, apply, log = console.log) {
    const { Report, Apply } = BuildBackfillSql(t);
    const result = await pool.request().query(Report);
    const [sessions, totals, rows] = result.recordsets;
    log('\nConfirmed checkout sessions:');
    console.table(sessions);
    log('\nWould write:');
    console.table(totals);
    if (rows.length) {
        log('\nOrders and questions (answers not shown):');
        console.table(rows);
    }

    let inserted = 0;
    if (!apply) {
        log('\nDry run: nothing written. Re-run with --apply to write these rows.');
    } else if (!totals[0].AnswerRows) {
        log('\nNothing to write.');
    } else {
        const applied = await pool.request().query(Apply);
        inserted = applied.recordset?.[0]?.Inserted ?? 0;
        log(`\nWrote ${inserted} answer row(s).`);
    }
    return { Sessions: sessions[0], Totals: totals[0], Rows: rows, Inserted: inserted };
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
