#!/usr/bin/env node
/**
 * One-off move: put products, and their open subscriptions, on the subscription type that carries
 * their renewal lead time (bc-aidp-next-golive#349).
 *
 * WHY
 *   The renewal job takes a subscription's lead time from the subscription, then from its
 *   subscription type. Finance needs lead times that differ by product, so each lead time gets its
 *   own type, created on the Subscription Types form. A new subscription copies its type from its
 *   product, but an existing one keeps the type it was created with, so moving a product to the new
 *   type does not move the subscriptions already sold.
 *
 * INPUT
 *   A CSV with a header row `ProductSKU,SubscriptionTypeCode`, one row per product to move. The SKU
 *   must name exactly one product, and the code an existing subscription type. No quoting: neither
 *   column may hold a comma.
 *
 * WHAT IT WRITES
 *   - `Product.SubscriptionTypeID` for each listed product whose type differs.
 *   - `Subscription.SubscriptionTypeID` for that product's subscriptions in Active, Paused or
 *     Trialing whose type differs. Canceled and Migrated subscriptions keep their type.
 *   A `RenewalLeadDays` set on a subscription is left as it is and still overrides the type.
 *
 * SAFETY
 *   - Dry run by default: reads only, and reports what it would write. `--apply` writes.
 *   - Refuses to write when any row names a missing or ambiguous SKU, a missing type, or a SKU twice.
 *   - Reports every setting other than the lead time in which the new type differs from the one a
 *     product or subscription is on now (cadence, term length, cancellation, grace and so on), since
 *     those change too. Review that list before `--apply`.
 *   - `--apply` writes in one transaction, so a failure writes nothing, and a re-run writes nothing.
 *   - Plain SQL, so no Record Change rows are written for the moved rows.
 *
 * USAGE
 *   DB_HOST=... DB_PORT=1433 DB_DATABASE=... DB_USERNAME=... DB_PASSWORD=... \
 *     node scripts/move-subscription-types.mjs map.csv            # dry run
 *   ... node scripts/move-subscription-types.mjs map.csv --apply    # write
 *
 *   Optional: DB_TRUST_SERVER_CERTIFICATE=1.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sql from 'mssql';

const ORDERS = '[__mj_BizAppsOrders]';
const OPEN_STATUSES = `N'Active', N'Paused', N'Trialing'`;

/** SubscriptionType columns that are not a behaviour: a difference in these is not reported. */
const IGNORED_TYPE_COLUMNS = new Set(['ID', 'Code', 'Name', 'Description', 'RenewalLeadDays', 'Sequence', 'IsActive']);

/** The CSV's rows, or throws with the line that could not be read. */
export function ParseMap(text) {
    const lines = text.split(/\r?\n/).filter((l) => l.trim() !== '');
    const header = (lines.shift() ?? '').split(',').map((h) => h.trim());
    if (header.join(',') !== 'ProductSKU,SubscriptionTypeCode') {
        throw new Error(`The header must be 'ProductSKU,SubscriptionTypeCode', got '${header.join(',')}'.`);
    }
    return lines.map((line, i) => {
        const cells = line.split(',').map((c) => c.trim());
        if (cells.length !== 2 || !cells[0] || !cells[1]) {
            throw new Error(`Line ${i + 2} needs exactly a SKU and a type code: '${line}'.`);
        }
        return { RowNo: i + 2, SKU: cells[0], TypeCode: cells[1] };
    });
}

/** The map as a table variable `@Map`, its values bound as parameters. */
function mapSql(request, rows) {
    const values = rows.map((r, i) => {
        request.input(`r${i}`, sql.Int, r.RowNo);
        request.input(`s${i}`, sql.NVarChar(80), r.SKU);
        request.input(`c${i}`, sql.NVarChar(40), r.TypeCode);
        return `(@r${i}, @s${i}, @c${i})`;
    });
    return `
DECLARE @Map TABLE (RowNo INT, SKU NVARCHAR(80), TypeCode NVARCHAR(40));
INSERT INTO @Map (RowNo, SKU, TypeCode) VALUES ${values.join(',\n    ')};`;
}

/** Each row with the product and type it resolves to, or why it does not. */
const RESOLVED = `
WITH Resolved AS (
    SELECT m.RowNo, m.SKU, m.TypeCode,
           (SELECT COUNT(*) FROM ${ORDERS}.Product p WHERE p.SKU = m.SKU) AS ProductMatches,
           (SELECT TOP 1 p.ID FROM ${ORDERS}.Product p WHERE p.SKU = m.SKU) AS ProductID,
           t.ID AS TypeID,
           (SELECT COUNT(*) FROM @Map d WHERE d.SKU = m.SKU) AS SkuRows
    FROM @Map m
    LEFT JOIN ${ORDERS}.SubscriptionType t ON t.Code = m.TypeCode
)`;

/** The report, then the write when `apply` is set. Returns what it found and wrote. */
export async function RunMove(pool, rows, apply, log = console.log) {
    if (!rows.length) {
        log('The map has no rows.');
        return { Problems: [], Products: [], Subscriptions: [], Differences: [], Written: null };
    }

    const req = pool.request();
    const result = await req.query(`
SET NOCOUNT ON;
${mapSql(req, rows)}
${RESOLVED}
SELECT RowNo, SKU, TypeCode,
       CASE WHEN ProductMatches = 0 THEN N'no product has this SKU'
            WHEN ProductMatches > 1 THEN N'more than one product has this SKU'
            WHEN TypeID IS NULL THEN N'no subscription type has this code'
            WHEN SkuRows > 1 THEN N'this SKU is listed more than once' END AS Problem
FROM Resolved
WHERE ProductMatches <> 1 OR TypeID IS NULL OR SkuRows > 1
ORDER BY RowNo;
${RESOLVED}
SELECT r.SKU, p.Name AS Product,
       COALESCE(own.Code, inherited.Code + N' (from product type)', N'(none)') AS CurrentType,
       t.Code AS NewType, t.RenewalLeadDays AS NewLeadDays,
       COALESCE(p.SubscriptionTypeID, pt.DefaultSubscriptionTypeID) AS CurrentTypeID, t.ID AS NewTypeID,
       CASE WHEN p.SubscriptionTypeID = t.ID THEN 0 ELSE 1 END AS ProductMoves
FROM Resolved r
JOIN ${ORDERS}.Product p ON p.ID = r.ProductID
JOIN ${ORDERS}.SubscriptionType t ON t.ID = r.TypeID
JOIN ${ORDERS}.ProductType pt ON pt.ID = p.ProductTypeID
LEFT JOIN ${ORDERS}.SubscriptionType own ON own.ID = p.SubscriptionTypeID
LEFT JOIN ${ORDERS}.SubscriptionType inherited ON inherited.ID = pt.DefaultSubscriptionTypeID
WHERE r.ProductMatches = 1
ORDER BY r.SKU;
${RESOLVED}
SELECT r.SKU, cur.Code AS CurrentType, t.Code AS NewType, s.SubscriptionTypeID AS CurrentTypeID, t.ID AS NewTypeID,
       COUNT(*) AS Subscriptions,
       SUM(CASE WHEN s.RenewalLeadDays IS NOT NULL THEN 1 ELSE 0 END) AS KeepOwnLeadDays
FROM Resolved r
JOIN ${ORDERS}.SubscriptionType t ON t.ID = r.TypeID
JOIN ${ORDERS}.Subscription s ON s.ProductID = r.ProductID
JOIN ${ORDERS}.SubscriptionType cur ON cur.ID = s.SubscriptionTypeID
WHERE r.ProductMatches = 1 AND s.Status IN (${OPEN_STATUSES}) AND s.SubscriptionTypeID <> t.ID
GROUP BY r.SKU, cur.Code, t.Code, s.SubscriptionTypeID, t.ID
ORDER BY r.SKU, cur.Code;
SELECT * FROM ${ORDERS}.SubscriptionType;
`);
    const [problems, products, subscriptions, types] = result.recordsets;

    if (problems.length) {
        log('\nRows that cannot be moved:');
        console.table(problems);
    }
    log('\nProducts:');
    console.table(products.map(({ CurrentTypeID, NewTypeID, ...shown }) => shown));
    log('\nOpen subscriptions that would move (KeepOwnLeadDays: set on the subscription, which still wins):');
    console.table(subscriptions.map(({ CurrentTypeID, NewTypeID, ...shown }) => shown));

    const differences = TypeDifferences(types, [...products, ...subscriptions]);
    if (differences.length) {
        log('\nSettings other than the lead time that change with the move. Review before --apply:');
        console.table(differences);
    }

    const productMoves = products.filter((p) => p.ProductMoves).length;
    const subscriptionMoves = subscriptions.reduce((n, s) => n + s.Subscriptions, 0);
    let written = null;
    if (!apply) {
        log(`\nDry run: nothing written. Would move ${productMoves} product(s) and ${subscriptionMoves} subscription(s). Re-run with --apply to write.`);
    } else if (problems.length) {
        log('\nNothing written: fix the rows above first.');
    } else if (!productMoves && !subscriptionMoves) {
        log('\nNothing to write.');
    } else {
        const write = pool.request();
        const applied = await write.query(`
SET NOCOUNT ON;
SET XACT_ABORT ON;
${mapSql(write, rows)}
BEGIN TRANSACTION;
UPDATE p SET p.SubscriptionTypeID = t.ID
FROM ${ORDERS}.Product p
JOIN @Map m ON m.SKU = p.SKU
JOIN ${ORDERS}.SubscriptionType t ON t.Code = m.TypeCode
WHERE p.SubscriptionTypeID IS NULL OR p.SubscriptionTypeID <> t.ID;
DECLARE @Products INT = @@ROWCOUNT;
UPDATE s SET s.SubscriptionTypeID = t.ID
FROM ${ORDERS}.Subscription s
JOIN ${ORDERS}.Product p ON p.ID = s.ProductID
JOIN @Map m ON m.SKU = p.SKU
JOIN ${ORDERS}.SubscriptionType t ON t.Code = m.TypeCode
WHERE s.Status IN (${OPEN_STATUSES}) AND s.SubscriptionTypeID <> t.ID;
DECLARE @Subscriptions INT = @@ROWCOUNT;
COMMIT TRANSACTION;
SELECT @Products AS Products, @Subscriptions AS Subscriptions;
`);
        written = applied.recordset[0];
        log(`\nMoved ${written.Products} product(s) and ${written.Subscriptions} subscription(s).`);
    }
    return { Problems: problems, Products: products, Subscriptions: subscriptions, Differences: differences, Written: written };
}

/** For each (current type, new type) pair, the behaviour columns whose values differ. */
export function TypeDifferences(types, moves) {
    const byID = new Map(types.map((t) => [String(t.ID).toUpperCase(), t]));
    const seen = new Set();
    const out = [];
    for (const m of moves) {
        if (!m.CurrentTypeID || !m.NewTypeID) continue;
        const from = byID.get(String(m.CurrentTypeID).toUpperCase());
        const to = byID.get(String(m.NewTypeID).toUpperCase());
        if (!from || !to || from === to) continue;
        const key = `${from.ID}>${to.ID}`;
        if (seen.has(key)) continue;
        seen.add(key);
        for (const column of Object.keys(from)) {
            if (IGNORED_TYPE_COLUMNS.has(column) || column.startsWith('__mj_')) continue;
            if (String(from[column] ?? '') !== String(to[column] ?? '')) {
                out.push({ From: from.Code, To: to.Code, Setting: column, Now: from[column], After: to[column] });
            }
        }
    }
    return out;
}

async function main() {
    const args = process.argv.slice(2);
    const files = args.filter((a) => !a.startsWith('--'));
    const unknown = args.filter((a) => a.startsWith('--') && a !== '--apply');
    if (unknown.length || files.length !== 1) {
        console.error('Usage: node scripts/move-subscription-types.mjs <map.csv> [--apply]');
        process.exit(2);
    }
    for (const name of ['DB_HOST', 'DB_DATABASE', 'DB_USERNAME', 'DB_PASSWORD']) {
        if (!process.env[name]) {
            console.error(`${name} is not set.`);
            process.exit(2);
        }
    }
    const rows = ParseMap(fs.readFileSync(files[0], 'utf8'));
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
        await RunMove(pool, rows, args.includes('--apply'));
    } finally {
        await pool.close();
    }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    await main();
}
