/**
 * Tier-3 API harness — the order → JournalEntry integration over the GraphQL / MJAPI boundary.
 *
 * The wire-level counterpart to `server/order-to-je.ts` (which drives the same path in-process via
 * BaseEntity + a DB pool). This proves the integration is shippable at the EXACT transport the
 * Explorer + any external client use: pure HTTP/GraphQL with an `X-API-Key`. It closes the Tier-3
 * gap flagged in `test-harnesses/testing.md` ("full create→confirm-over-GraphQL harness = follow-up").
 *
 * What runs OVER THE WIRE (the tier-3 surface being proven):
 *   • create an Order (Draft) + its OrderLines           — CreatemjBizAppsOrdersOrder / …OrderLine
 *   • confirm it (Status → Confirmed)                    — UpdatemjBizAppsOrdersOrder; this fires
 *       OrderEntityServer.Save() server-side → OrdersEngine resolution → Accounting.CreateJournalEntry
 *   • read the booked JournalEntry header + lines        — the generic RunDynamicView query
 *
 * What is provisioned IN-PROCESS (un-wireable prerequisite): the companies + seeded charts of
 * accounts + product catalog + GL links, via the companion `order-to-je-fixture.ts` (see its header
 * for WHY — AccountingCompanyProfile is an IsA child of __mj.Company with no `Name` in its GraphQL
 * Create input). Exactly the accounting api/ split (its harnesses exec `batching-fixture.ts`).
 *
 * Scenarios (mirror server/order-to-je.ts O1–O5, asserted on EXACT values over the wire):
 *   O1 single-company immediate — Dr AR 200 / Cr Sales 200, balanced, JE Pending, EntryType
 *      OrderBooking, JE.OrderID == the order, order advances to Posted + stamped JournalEntryID.
 *   O2 multi-company           — balanced within EACH company (coA 300/300, coB 150/150) (AM-4).
 *   O3 deferred-revenue product — credits Deferred Revenue (120), not Sales; Dr AR 120.
 *   O4 unresolvable product     — Confirm BLOCKED over the wire; order NOT persisted Confirmed/Posted; no JE.
 *   O5 idempotency              — re-Confirm books no second JE; JournalEntryID unchanged; exactly 1 JE.
 *
 * Run from the INSTANCE WORKTREE ROOT (so `.env` + the launcher resolve):
 *   cd ~/MJDev/instances/accounting-engine-dev/mj
 *   npx tsx packages/dev-apps/bizapps-orders/test-harnesses/api/order-to-je-api.ts
 * Env overrides: MJ_API_URL (default http://localhost:4050) · MJ_API_KEY · MJDEV_SLUG (default accounting-engine-dev).
 * Exit codes: 0 all passed · 1 assertion failures · 2 bootstrap/connection error.
 */
import { execFileSync, execSync } from 'node:child_process';
import path from 'node:path';

// ─── config ────────────────────────────────────────────────────────────────────
const API_URL = (process.env.MJ_API_URL ?? 'http://localhost:4050').replace(/\/+$/, '');
const GRAPHQL_URL = `${API_URL}/`;
const MJDEV_LAUNCHER = '/Users/marcelotorres/MJDev/bin/mjdev';
const INSTANCE_SLUG = process.env.MJDEV_SLUG ?? 'accounting-engine-dev';
const WORKTREE_ROOT = process.cwd();
const TSX = path.resolve(WORKTREE_ROOT, 'node_modules', '.bin', 'tsx');
const FIXTURE = path.resolve(WORKTREE_ROOT, 'packages/dev-apps/bizapps-orders/test-harnesses/api/order-to-je-fixture.ts');

const JE_ENTITY = 'MJ_BizApps_Accounting: Journal Entries';
const JE_LINE_ENTITY = 'MJ_BizApps_Accounting: Journal Entry Lines';
const ORDER_ENTITY = 'MJ_BizApps_Orders: Orders';

// ─── tiny assert harness ──────────────────────────────────────────────────────
let passed = 0, failed = 0;
function check(label: string, ok: boolean, detail?: string): void {
  if (ok) { passed++; console.log(`  ✓ ${label}`); }
  else { failed++; console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`); }
}
function failBootstrap(reason: string): never {
  console.error(`\nBOOTSTRAP ERROR: ${reason}`);
  console.error(`Fix: ${MJDEV_LAUNCHER} run ${INSTANCE_SLUG} api  (and run from the instance worktree root)`);
  process.exit(2);
}
const near = (a: number, b: number): boolean => Math.abs(a - b) < 0.005;
const upper = (s: string): string => s.toUpperCase();
const num = (v: unknown): number => (v == null ? 0 : Number(v));

// ─── fixture (in-process catalog provisioning) ───────────────────────────────────
interface CompanyGL { id: string; arGL: string; revGL: string; defRevGL: string }
interface OrderFixture { runTag: string; coA: CompanyGL; coB: CompanyGL; products: { immA: string; defA: string; immB: string; unlinkedA: string } }

function fixtureSetup(): OrderFixture {
  const out = execFileSync(TSX, [FIXTURE, 'setup'], { cwd: WORKTREE_ROOT, encoding: 'utf8', timeout: 300_000 });
  const line = out.split('\n').find((l) => l.startsWith('FIXTURE_JSON '));
  if (!line) failBootstrap(`order-to-je-fixture setup did not emit FIXTURE_JSON. Output:\n${out.slice(-600)}`);
  return JSON.parse(line.slice('FIXTURE_JSON '.length)) as OrderFixture;
}
function fixtureTeardown(runTag: string, coAId: string, coBId: string): void {
  try {
    execFileSync(TSX, [FIXTURE, 'teardown', runTag, coAId, coBId], { cwd: WORKTREE_ROOT, encoding: 'utf8', timeout: 300_000 });
    console.log('  (fixture torn down)');
  } catch (e) {
    console.log(`  [teardown warning] ${e instanceof Error ? e.message.split('\n')[0] : String(e)}`);
  }
}

// ─── API key resolution (env or mint via the launcher) ───────────────────────────
function resolveApiKey(): string {
  const fromEnv = process.env.MJ_API_KEY?.trim();
  if (fromEnv) return fromEnv;
  const out = execSync(`${MJDEV_LAUNCHER} key ${INSTANCE_SLUG}`, { encoding: 'utf8' });
  const key = out.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.startsWith('mj_sk_')).pop();
  if (!key) failBootstrap('launcher produced no mj_sk_ key');
  return key;
}

// ─── gql helpers ─────────────────────────────────────────────────────────────────
interface GqlResponse<T> { data?: T; errors?: Array<{ message: string }> }

/** POST a GraphQL doc; return the raw {data, errors} envelope (does NOT throw on GraphQL errors). */
async function gqlRaw<T>(apiKey: string, query: string, variables?: Record<string, unknown>): Promise<GqlResponse<T>> {
  const res = await fetch(GRAPHQL_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-API-Key': apiKey },
    body: JSON.stringify(variables ? { query, variables } : { query }),
  });
  if (res.status !== 200) throw new Error(`HTTP ${res.status}: ${(await res.text().catch(() => '')).slice(0, 300)}`);
  return (await res.json()) as GqlResponse<T>;
}

/** POST a GraphQL doc; throw on transport/GraphQL errors and return the typed data. */
async function gql<T>(apiKey: string, query: string, variables?: Record<string, unknown>): Promise<T> {
  const json = await gqlRaw<T>(apiKey, query, variables);
  if (json.errors?.length) throw new Error(`GraphQL errors: ${JSON.stringify(json.errors).slice(0, 400)}`);
  if (json.data == null) throw new Error(`missing data: ${JSON.stringify(json).slice(0, 300)}`);
  return json.data;
}

// ─── domain operations over the wire ─────────────────────────────────────────────
interface OrderRow { ID: string; Status: string; JournalEntryID?: string | null; ConfirmedAt?: string | null }
interface OrderLineSpec { productId: string; qty: number; price: number }

/** Create a Draft order + its lines over GraphQL; returns the new order ID. */
async function createOrder(apiKey: string, runTag: string, seq: number, lines: OrderLineSpec[]): Promise<string> {
  const orderNumber = `${runTag}-O${seq}`;
  const orderDate = new Date().toISOString();
  const created = await gql<{ CreatemjBizAppsOrdersOrder: OrderRow }>(
    apiKey,
    `mutation Create($input: CreatemjBizAppsOrdersOrderInput!) { CreatemjBizAppsOrdersOrder(input: $input) { ID Status } }`,
    { input: { OrderNumber: orderNumber, OrderDate: orderDate, Status: 'Draft', Description: `${runTag} api harness` } },
  );
  const orderId = created.CreatemjBizAppsOrdersOrder.ID;
  let n = 1;
  for (const l of lines) {
    await gql<{ CreatemjBizAppsOrdersOrderLine: { ID: string } }>(
      apiKey,
      `mutation Create($input: CreatemjBizAppsOrdersOrderLineInput!) { CreatemjBizAppsOrdersOrderLine(input: $input) { ID } }`,
      { input: { OrderID: orderId, ProductID: l.productId, LineNumber: n++, Quantity: l.qty, UnitPrice: l.price } },
    );
  }
  return orderId;
}

/** Flip an order to Confirmed over GraphQL. Returns the raw envelope so callers can inspect failures. */
async function confirmOrder(apiKey: string, orderId: string): Promise<GqlResponse<{ UpdatemjBizAppsOrdersOrder: OrderRow }>> {
  return gqlRaw<{ UpdatemjBizAppsOrdersOrder: OrderRow }>(
    apiKey,
    `mutation Update($input: UpdatemjBizAppsOrdersOrderInput!) { UpdatemjBizAppsOrdersOrder(input: $input) { ID Status JournalEntryID ConfirmedAt } }`,
    { input: { ID: orderId, Status: 'Confirmed' } },
  );
}

/** Generic RunDynamicView read → parsed rows (Data is a JSON string per row). */
async function runView<T>(apiKey: string, entityName: string, extraFilter: string, fields: string[]): Promise<T[]> {
  const data = await gql<{ RunDynamicView: { Results: Array<{ Data: string }>; RowCount: number } }>(
    apiKey,
    `query Run($input: RunDynamicViewInput!) { RunDynamicView(input: $input) { Results { Data } RowCount } }`,
    { input: { EntityName: entityName, ExtraFilter: extraFilter, Fields: fields } },
  );
  return data.RunDynamicView.Results.map((r) => JSON.parse(r.Data) as T);
}

interface JEHeader { EntryType: string; OrderID: string | null; Status: string; EntryNumber: string }
interface JELine { GLAccountID: string; DebitAmount: number | null; CreditAmount: number | null }
interface JEView { header: JEHeader; lines: JELine[] }

async function readJE(apiKey: string, jeId: string): Promise<JEView> {
  const headers = await runView<JEHeader>(apiKey, JE_ENTITY, `ID='${jeId}'`, ['EntryType', 'OrderID', 'Status', 'EntryNumber']);
  const lines = await runView<JELine>(apiKey, JE_LINE_ENTITY, `JournalEntryID='${jeId}'`, ['GLAccountID', 'DebitAmount', 'CreditAmount']);
  if (!headers[0]) throw new Error(`JE ${jeId} not found over the API`);
  return { header: headers[0], lines };
}
const debitFor = (lines: JELine[], gl: string): number => lines.filter((l) => upper(l.GLAccountID) === upper(gl)).reduce((s, l) => s + num(l.DebitAmount), 0);
const creditFor = (lines: JELine[], gl: string): number => lines.filter((l) => upper(l.GLAccountID) === upper(gl)).reduce((s, l) => s + num(l.CreditAmount), 0);
const totalDebits = (lines: JELine[]): number => lines.reduce((s, l) => s + num(l.DebitAmount), 0);
const totalCredits = (lines: JELine[]): number => lines.reduce((s, l) => s + num(l.CreditAmount), 0);

/** Assert the invariants every order-booked JE must satisfy: OrderBooking, Pending, linked, balanced. */
function assertJECore(label: string, je: JEView, orderId: string): void {
  check(`${label}: EntryType === OrderBooking`, je.header.EntryType === 'OrderBooking', je.header.EntryType);
  check(`${label}: JE Status === Pending`, je.header.Status === 'Pending', je.header.Status);
  check(`${label}: JE.OrderID === the order`, upper(je.header.OrderID ?? '') === upper(orderId), `${je.header.OrderID} vs ${orderId}`);
  check(`${label}: EntryNumber matches JE-{CompanyCode}-{FY}-{seq}`, /^JE-[A-Z0-9_-]{2,20}-\d{4}-\d{6}$/.test(je.header.EntryNumber ?? ''), `got '${je.header.EntryNumber}'`);
  check(`${label}: JE balances (Σ debits === Σ credits)`, near(totalDebits(je.lines), totalCredits(je.lines)), `Dr ${totalDebits(je.lines)} / Cr ${totalCredits(je.lines)}`);
}

// ─── scenarios ───────────────────────────────────────────────────────────────────
async function scenarioO1(apiKey: string, fx: OrderFixture): Promise<void> {
  console.log('\nO1 single-company immediate → Dr AR / Cr Sales, balanced, Pending, lineage stamped:');
  const orderId = await createOrder(apiKey, fx.runTag, 1, [{ productId: fx.products.immA, qty: 2, price: 100 }]);
  const res = await confirmOrder(apiKey, orderId);
  const order = res.data?.UpdatemjBizAppsOrdersOrder;
  check('O1: confirm mutation succeeded (no GraphQL errors)', !res.errors?.length && !!order, JSON.stringify(res.errors));
  check('O1: order.JournalEntryID stamped', !!order?.JournalEntryID, JSON.stringify(order));
  check('O1: order advanced to Posted', order?.Status === 'Posted', `got ${order?.Status}`);
  check('O1: order.ConfirmedAt stamped', !!order?.ConfirmedAt, JSON.stringify(order));
  if (!order?.JournalEntryID) return;
  const je = await readJE(apiKey, order.JournalEntryID);
  assertJECore('O1', je, orderId);
  check('O1: Dr AR === 200', near(debitFor(je.lines, fx.coA.arGL), 200), `got ${debitFor(je.lines, fx.coA.arGL)}`);
  check('O1: Cr Sales === 200', near(creditFor(je.lines, fx.coA.revGL), 200), `got ${creditFor(je.lines, fx.coA.revGL)}`);
}

async function scenarioO2(apiKey: string, fx: OrderFixture): Promise<void> {
  console.log('\nO2 multi-company order → ONE JE PER COMPANY, each single-company + balanced (MOD-11):');
  const orderId = await createOrder(apiKey, fx.runTag, 2, [
    { productId: fx.products.immA, qty: 1, price: 300 },
    { productId: fx.products.immB, qty: 3, price: 50 },
  ]);
  const res = await confirmOrder(apiKey, orderId);
  const order = res.data?.UpdatemjBizAppsOrdersOrder;
  check('O2: confirm mutation succeeded + order Posted', !res.errors?.length && order?.Status === 'Posted', JSON.stringify(res.errors ?? order));
  check('O2: multi-company → order.JournalEntryID stays NULL (lineage via JE.OrderID)', order != null && (order.JournalEntryID == null || order.JournalEntryID === ''), `got ${order?.JournalEntryID}`);
  const jeRows = await runView<{ ID: string; CompanyID: string }>(apiKey, JE_ENTITY, `OrderID='${orderId}'`, ['ID', 'CompanyID']);
  check('O2: exactly 2 JEs booked (one per company)', jeRows.length === 2, `got ${jeRows.length}`);
  const rowA = jeRows.find((r) => upper(r.CompanyID) === upper(fx.coA.id));
  const rowB = jeRows.find((r) => upper(r.CompanyID) === upper(fx.coB.id));
  check('O2: one JE per company, CompanyID stamped (MOD-12)', !!rowA && !!rowB, JSON.stringify(jeRows));
  if (!rowA || !rowB) return;
  const jeA = await readJE(apiKey, rowA.ID);
  const jeB = await readJE(apiKey, rowB.ID);
  assertJECore('O2-coA', jeA, orderId);
  assertJECore('O2-coB', jeB, orderId);
  check('O2: coA Dr AR 300 === Cr Sales 300', near(debitFor(jeA.lines, fx.coA.arGL), 300) && near(creditFor(jeA.lines, fx.coA.revGL), 300), `AR ${debitFor(jeA.lines, fx.coA.arGL)} / Sales ${creditFor(jeA.lines, fx.coA.revGL)}`);
  check('O2: coB Dr AR 150 === Cr Sales 150', near(debitFor(jeB.lines, fx.coB.arGL), 150) && near(creditFor(jeB.lines, fx.coB.revGL), 150), `AR ${debitFor(jeB.lines, fx.coB.arGL)} / Sales ${creditFor(jeB.lines, fx.coB.revGL)}`);
  check('O2: coA JE contains no coB lines (single-company purity)', near(debitFor(jeA.lines, fx.coB.arGL), 0) && near(creditFor(jeA.lines, fx.coB.revGL), 0), 'coB lines leaked into coA JE');
}

async function scenarioO3(apiKey: string, fx: OrderFixture): Promise<void> {
  console.log('\nO3 deferred-revenue product → credits Deferred Revenue, not Sales:');
  const orderId = await createOrder(apiKey, fx.runTag, 3, [{ productId: fx.products.defA, qty: 1, price: 120 }]);
  const res = await confirmOrder(apiKey, orderId);
  const je = await bookedJE(apiKey, res, 'O3');
  if (!je) return;
  assertJECore('O3', je, orderId);
  check('O3: Cr Deferred Revenue === 120', near(creditFor(je.lines, fx.coA.defRevGL), 120), `got ${creditFor(je.lines, fx.coA.defRevGL)}`);
  check('O3: Sales not credited (0)', near(creditFor(je.lines, fx.coA.revGL), 0), `got ${creditFor(je.lines, fx.coA.revGL)}`);
  check('O3: Dr AR === 120', near(debitFor(je.lines, fx.coA.arGL), 120), `got ${debitFor(je.lines, fx.coA.arGL)}`);
}

async function scenarioO4(apiKey: string, fx: OrderFixture): Promise<void> {
  console.log('\nO4 unresolvable product → Confirm BLOCKED over the wire, no JE, not persisted Confirmed:');
  const orderId = await createOrder(apiKey, fx.runTag, 4, [{ productId: fx.products.unlinkedA, qty: 1, price: 99 }]);
  // Blocked booking → Save() returns false. This surfaces as EITHER a 200-with-GraphQL-errors, an
  // order that did not advance (no JournalEntryID / not Posted), OR a thrown transport error — all
  // of which mean "the confirm did not succeed". Assert that robustly regardless of the surfacing.
  try {
    const res = await confirmOrder(apiKey, orderId);
    const order = res.data?.UpdatemjBizAppsOrdersOrder;
    const confirmedOk = !res.errors?.length && !!order?.JournalEntryID && order?.Status === 'Posted';
    check('O4: confirm did NOT succeed (blocked)', !confirmedOk, JSON.stringify(res.errors ?? order));
  } catch (e) {
    check('O4: confirm did NOT succeed (blocked)', true, `blocked via transport error: ${e instanceof Error ? e.message.split('\n')[0] : String(e)}`);
  }
  // Independently read the persisted order — it must NOT be Confirmed/Posted and must have no JE.
  const rows = await runView<OrderRow>(apiKey, ORDER_ENTITY, `ID='${orderId}'`, ['ID', 'Status', 'JournalEntryID']);
  const persisted = rows[0];
  check('O4: order NOT persisted Confirmed/Posted', !!persisted && persisted.Status !== 'Confirmed' && persisted.Status !== 'Posted', `got ${persisted?.Status}`);
  check('O4: order has no JournalEntryID', !!persisted && (persisted.JournalEntryID == null || persisted.JournalEntryID === ''), `got ${persisted?.JournalEntryID}`);
}

async function scenarioO5(apiKey: string, fx: OrderFixture): Promise<void> {
  console.log('\nO5 idempotency → re-Confirm books no second JE:');
  const orderId = await createOrder(apiKey, fx.runTag, 5, [{ productId: fx.products.immA, qty: 1, price: 75 }]);
  const first = await confirmOrder(apiKey, orderId);
  const firstJEID = first.data?.UpdatemjBizAppsOrdersOrder?.JournalEntryID;
  check('O5: first confirm books a JE', !!firstJEID, JSON.stringify(first.errors ?? first.data));
  const again = await confirmOrder(apiKey, orderId);
  const againOrder = again.data?.UpdatemjBizAppsOrdersOrder;
  check('O5: re-confirm succeeds without error', !again.errors?.length && !!againOrder, JSON.stringify(again.errors));
  check('O5: JournalEntryID unchanged', !!firstJEID && againOrder?.JournalEntryID === firstJEID, `${firstJEID} vs ${againOrder?.JournalEntryID}`);
  const jes = await runView<{ ID: string }>(apiKey, JE_ENTITY, `OrderID='${orderId}'`, ['ID']);
  check('O5: exactly one JE exists for the order', jes.length === 1, `got ${jes.length}`);
}

/** Shared: pull the booked JE from a confirm response, asserting the confirm succeeded first. */
async function bookedJE(apiKey: string, res: GqlResponse<{ UpdatemjBizAppsOrdersOrder: OrderRow }>, label: string): Promise<JEView | null> {
  const order = res.data?.UpdatemjBizAppsOrdersOrder;
  check(`${label}: confirm books a JE`, !res.errors?.length && !!order?.JournalEntryID, JSON.stringify(res.errors ?? order));
  if (!order?.JournalEntryID) return null;
  return readJE(apiKey, order.JournalEntryID);
}

// ─── main ─────────────────────────────────────────────────────────────────────────
async function main(): Promise<void> {
  console.log('=== Tier-3 API harness: order → JournalEntry over GraphQL (bizapps-orders → bizapps-accounting) ===');
  try {
    const res = await fetch(GRAPHQL_URL, { method: 'GET' });
    if (!(res.status >= 200 && res.status < 500)) failBootstrap(`MJAPI at ${API_URL} returned HTTP ${res.status}`);
    console.log(`Preflight: MJAPI serving at ${API_URL} (HTTP ${res.status}).`);
  } catch (e) { failBootstrap(`MJAPI not reachable at ${API_URL} (${e instanceof Error ? e.message : String(e)})`); }

  const apiKey = resolveApiKey();
  console.log(`Auth: X-API-Key ${apiKey.slice(0, 10)}… (resolved)`);

  console.log('Provisioning companies + catalog via order-to-je-fixture (in-process)…');
  const fx = fixtureSetup();
  console.log(`  fixture ${fx.runTag}: coA ${fx.coA.id}, coB ${fx.coB.id}`);

  try {
    await scenarioO1(apiKey, fx);
    await scenarioO2(apiKey, fx);
    await scenarioO3(apiKey, fx);
    await scenarioO4(apiKey, fx);
    await scenarioO5(apiKey, fx);
  } catch (e) {
    check('scenario flow completed without throwing', false, e instanceof Error ? (e.stack ?? e.message).split('\n').slice(0, 3).join(' ') : String(e));
  } finally {
    console.log('\nTearing down the fixture…');
    fixtureTeardown(fx.runTag, fx.coA.id, fx.coB.id);
  }

  const total = passed + failed;
  console.log(`\nAPI order-to-je harness: ${passed}/${total} passed`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => failBootstrap(e instanceof Error ? e.message : String(e)));
