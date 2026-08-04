/**
 * Check ONE confirmed order against the booking invariants.
 *
 *   node test-harnesses/check-order.mjs             -> the most recent order
 *   node test-harnesses/check-order.mjs ORD-000026  -> a specific one
 *
 * Prints the facts AND asserts the rules, so a run either passes or names exactly
 * which invariant broke and on which line. Written to check an order built through
 * the UI, which booking-live.mjs cannot do — that harness drives the engine
 * directly, so it cannot catch anything the UI does differently on the way in.
 *
 * WHAT IT ASSERTS
 *   - every line booked, and exactly one journal entry per line (D10)
 *   - every entry balances, and is single-company
 *   - each line's entry belongs to that LINE's company, not the order's
 *   - each subscription belongs to its line's company
 *   - the line points back at the subscription it created
 *   - a subscription PRODUCT produced a subscription
 *   - debits across all entries equal the order gross
 *
 * Subscriptions are found through Subscription.OrderLineID, the REVERSE link —
 * deliberately. An earlier version joined on OrderLine.SubscriptionID and was
 * therefore blind to the bug it most needed to catch: with that link missing it
 * found nothing, printed "no subscriptions" and passed an order whose
 * subscriptions were real and filed under the wrong company.
 */
import sql from 'mssql';
import { readFileSync } from 'node:fs';

const want = process.argv[2];
const env = Object.fromEntries(readFileSync(new URL('../../../MJAPI/.env', import.meta.url), 'utf8')
    .split('\n').filter((l) => l.includes('=') && !l.startsWith('#'))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')]; }));
const pool = await sql.connect({ server: 'localhost', port: +env.DB_PORT, database: env.DB_DATABASE,
    user: env.DB_USERNAME, password: env.DB_PASSWORD, options: { encrypt: false, trustServerCertificate: true } });
const q = async (t) => (await pool.request().query(t)).recordset ?? [];

const o = (await q(want
    ? `SELECT TOP 1 ID, OrderNumber, Status, TotalGross FROM __mj_BizAppsOrders.OrderHeader WHERE OrderNumber='${want}'`
    : `SELECT TOP 1 ID, OrderNumber, Status, TotalGross FROM __mj_BizAppsOrders.OrderHeader ORDER BY __mj_CreatedAt DESC`))[0];
if (!o) { console.log('order not found'); process.exit(1); }
console.log(`\n=== ${o.OrderNumber}  ${o.Status}  gross ${o.TotalGross} ===`);

const lines = await q(`
  SELECT l.LineNumber Ln, p.Name Product, c.Name LineCompany, l.Quantity Qty, l.LineTotalGross Gross,
         l.SubscriptionID, l.JournalEntryID
  FROM __mj_BizAppsOrders.OrderLine l
  JOIN __mj_BizAppsOrders.Product p ON p.ID=l.ProductID
  JOIN __mj.Company c ON c.ID=l.CompanyID
  WHERE l.OrderHeaderID='${o.ID}' ORDER BY l.LineNumber`);
console.table(lines.map((l) => ({ Ln: l.Ln, Product: l.Product, LineCompany: l.LineCompany, Qty: l.Qty,
    Gross: l.Gross, Sub: l.SubscriptionID ? 'yes' : '', Booked: l.JournalEntryID ? 'yes' : 'NO' })));

const jes = await q(`
  SELECT l.LineNumber Ln, j.EntryNumber, jc.Name JECompany,
         SUM(jl.DebitAmount) Dr, SUM(jl.CreditAmount) Cr, COUNT(DISTINCT ga.CompanyID) Companies
  FROM __mj_BizAppsOrders.OrderLine l
  JOIN __mj_BizAppsAccounting.JournalEntry j ON j.ID=l.JournalEntryID
  JOIN __mj.Company jc ON jc.ID=j.CompanyID
  JOIN __mj_BizAppsAccounting.JournalEntryLine jl ON jl.JournalEntryID=j.ID
  JOIN __mj_BizAppsAccounting.GLAccount ga ON ga.ID=jl.GLAccountID
  WHERE l.OrderHeaderID='${o.ID}'
  GROUP BY l.LineNumber, j.EntryNumber, jc.Name ORDER BY l.LineNumber`);
console.table(jes);

// Joined on Subscription.OrderLineID — the REVERSE link — NOT on
// OrderLine.SubscriptionID. Using the forward link made this validator blind to
// the exact bug it should catch: when the line->subscription link is missing,
// the join found nothing, the checker printed "no subscriptions" and PASSED an
// order whose subscriptions were real and in the wrong company. The reverse link
// is written by the engine at creation, so it survives that failure.
const subs = await q(`
  SELECT s.SubscriptionNumber, p.Name Product, sc.Name SubCompany, lc.Name LineCompany, s.Status,
         l.LineNumber Ln, CASE WHEN l.SubscriptionID IS NULL THEN 0 ELSE 1 END AS LinkedBack,
         (SELECT COUNT(*) FROM __mj_BizAppsOrders.SubscriptionTerm t WHERE t.SubscriptionID=s.ID) Terms
  FROM __mj_BizAppsOrders.Subscription s
  JOIN __mj_BizAppsOrders.OrderLine l ON l.ID=s.OrderLineID
  JOIN __mj_BizAppsOrders.Product p ON p.ID=s.ProductID
  JOIN __mj.Company sc ON sc.ID=s.CompanyID
  JOIN __mj.Company lc ON lc.ID=l.CompanyID
  WHERE l.OrderHeaderID='${o.ID}'`);
if (subs.length) console.table(subs); else console.log('(no subscriptions on this order)');

// ---- invariants -----------------------------------------------------------
const fails = [];
const round = (n) => Math.round(Number(n) * 100) / 100;

for (const l of lines) if (!l.JournalEntryID) fails.push(`line ${l.Ln} (${l.Product}) has NO journal entry`);
if (jes.length !== lines.length) fails.push(`expected one JE per line: ${lines.length} lines but ${jes.length} entries`);
for (const j of jes) {
    if (round(j.Dr) !== round(j.Cr)) fails.push(`JE ${j.EntryNumber} does not balance: Dr ${j.Dr} vs Cr ${j.Cr}`);
    if (j.Companies !== 1) fails.push(`JE ${j.EntryNumber} spans ${j.Companies} companies — must be single-company (D10)`);
}
// each line's JE must belong to that line's company
const lineCo = new Map(lines.map((l) => [l.Ln, l.LineCompany]));
for (const j of jes) if (lineCo.get(j.Ln) !== j.JECompany) {
    fails.push(`line ${j.Ln}: JE is ${j.JECompany} but the line's company is ${lineCo.get(j.Ln)}`);
}
// subscriptions belong to their LINE's company
for (const s of subs) if (s.SubCompany !== s.LineCompany) {
    fails.push(`subscription ${s.SubscriptionNumber} (${s.Product}) is ${s.SubCompany} but its line is ${s.LineCompany}`);
}
// and the line must point BACK at its subscription, or the pre-flight cannot show it
for (const s of subs) if (!s.LinkedBack) {
    fails.push(`line ${s.Ln} created ${s.SubscriptionNumber} but OrderLine.SubscriptionID is NULL`);
}
// a line selling a subscription PRODUCT must have produced a subscription
const subLines = await q(`
  SELECT l.LineNumber Ln, p.Name Product FROM __mj_BizAppsOrders.OrderLine l
  JOIN __mj_BizAppsOrders.Product p ON p.ID=l.ProductID
  WHERE l.OrderHeaderID='${o.ID}' AND p.SubscriptionTypeID IS NOT NULL`);
for (const sl of subLines) if (!subs.some((s) => s.Ln === sl.Ln)) {
    fails.push(`line ${sl.Ln} (${sl.Product}) is a subscription product but produced NO subscription`);
}
// debits across every entry must equal the order gross
const totalDr = round(jes.reduce((a, j) => a + Number(j.Dr), 0));
if (totalDr !== round(o.TotalGross)) fails.push(`debits ${totalDr} != order gross ${o.TotalGross}`);

console.log(fails.length ? `\nFAIL (${fails.length}):` : '\nPASS — every invariant held');
for (const f of fails) console.log(`   ✗ ${f}`);
process.exit(0);
