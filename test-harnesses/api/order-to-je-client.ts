/**
 * Tier-3 API harness — order → Confirm → JE, driven through the app's REAL clients + real entity path
 * (NOT hand-rolled `fetch`, which the old order-to-je-api.ts uses). This is the production path the
 * Order Editor screen takes:
 *   - create Order + OrderLines via `Metadata.GetEntityObject(...).Save()`  → real GraphQLDataProvider
 *   - Confirm via `OrderEditorClient.Confirm(provider, id)` → `provider.RouteOperation('Orders.ConfirmOrder')`
 *     (the remote op that composes the atomic order-row + per-company JE unit of work server-side —
 *      the old harness's `Update(Status:'Confirmed')` mutation is NOT the client path the UI uses)
 *   - read the booked JE via `RunView`  → real client
 *   - `OverdueWorklistClient.Get(provider)` → the real dunning read the rail badge + worklist share
 * Overlaps order-to-je-api.ts on purpose — this is the regression path, so it must use the real client.
 *
 * Fixture: the tsx `order-to-je-fixture` subprocess (direct SQL) provisions coA/coB + GL + products +
 * a customer org, torn down in `finally`. Run from the INSTANCE WORKTREE ROOT:
 *   npx tsx packages/dev-apps/bizapps-orders/test-harnesses/api/order-to-je-client.ts
 * Exit: 0 pass · 1 assertion failures · 2 bootstrap error.
 */
import { execSync, execFileSync } from 'node:child_process';
import path from 'node:path';
import { Metadata, RunView, UserInfo, IRemoteOperationProvider } from '@memberjunction/core';
import { setupGraphQLClient, GraphQLProviderConfigData, GraphQLDataProvider } from '@memberjunction/graphql-dataprovider';
import '@memberjunction/core-entities';
import '@mj-biz-apps/common-entities';
import '@mj-biz-apps/orders-entities';
import '@mj-biz-apps/accounting-entities'; // GLAccountLink subclass must register or field-sets don't stick
import { OrderEditorClient } from '../../packages/Angular/src/lib/custom/shell/pages/order-editor.client.js';
import { OverdueWorklistClient } from '../../packages/Angular/src/lib/custom/shell/pages/overdue-worklist.client.js';
import { PaymentEntryClient } from '../../packages/Angular/src/lib/custom/shell/pages/payment-entry.client.js';

const PAYMENT_ENTITY = 'MJ_BizApps_Orders: Payments';
const GL_ENTITY = 'MJ_BizApps_Accounting: GL Accounts';

const LAUNCHER = process.env.MJDEV_BIN ?? '/Users/marcelotorres/MJDev/bin/mjdev';
const SLUG = process.env.MJDEV_SLUG ?? 'accounting-engine-dev';
const WORKTREE_ROOT = process.cwd();
const TSX = path.resolve(WORKTREE_ROOT, 'node_modules', '.bin', 'tsx');
const FIXTURE = path.resolve(WORKTREE_ROOT, 'packages/dev-apps/bizapps-orders/test-harnesses/api/order-to-je-fixture.ts');
const ORDER_ENTITY = 'MJ_BizApps_Orders: Orders';
const ORDER_LINE_ENTITY = 'MJ_BizApps_Orders: Order Lines';
const JE_ENTITY = 'MJ_BizApps_Accounting: Journal Entries';
const JE_LINE_ENTITY = 'MJ_BizApps_Accounting: Journal Entry Lines';

interface CompanyGL { id: string; arGL: string; revGL: string; defRevGL: string; }
interface OrderFixture { runTag: string; coA: CompanyGL; coB: CompanyGL; products: { immA: string; defA: string; immB: string; unlinkedA: string }; customerOrgId: string; }

let passed = 0, failed = 0;
const check = (l: string, ok: boolean, d?: string) => { if (ok) { passed++; console.log(`  ✓ ${l}`); } else { failed++; console.log(`  ✗ ${l}${d ? ` — ${d}` : ''}`); } };
const near = (a: number, b: number) => Math.abs(a - b) < 0.005;
const up = (s: string) => (s ?? '').toUpperCase();
function failBootstrap(r: string): never { console.error(`\nBOOTSTRAP ERROR: ${r}`); process.exit(2); }

function fixtureSetup(): OrderFixture {
  const out = execFileSync(TSX, [FIXTURE, 'setup'], { cwd: WORKTREE_ROOT, encoding: 'utf8', timeout: 180_000 });
  const line = out.split('\n').find((l) => l.startsWith('FIXTURE_JSON '));
  if (!line) failBootstrap(`fixture setup emitted no FIXTURE_JSON:\n${out.slice(-500)}`);
  return JSON.parse(line.slice('FIXTURE_JSON '.length));
}
function fixtureTeardown(fx: OrderFixture): void {
  try { execFileSync(TSX, [FIXTURE, 'teardown', fx.runTag, fx.coA.id, fx.coB.id], { cwd: WORKTREE_ROOT, encoding: 'utf8', timeout: 180_000 }); console.log('  (fixture torn down)'); }
  catch (e) { console.log(`  [teardown warning] ${e instanceof Error ? e.message.split('\n')[0] : String(e)}`); }
}

async function createOrder(md: Metadata, user: UserInfo, fx: OrderFixture, seq: number, lines: Array<{ productId: string; qty: number; price: number; description?: string }>): Promise<string> {
  const o = await md.GetEntityObject(ORDER_ENTITY, user);
  o.NewRecord();
  (o as unknown as Record<string, unknown>).OrderNumber = `${fx.runTag}-C${seq}`;
  (o as unknown as Record<string, unknown>).OrderDate = new Date();
  (o as unknown as Record<string, unknown>).Status = 'Draft';
  (o as unknown as Record<string, unknown>).CustomerOrganizationID = fx.customerOrgId;
  (o as unknown as Record<string, unknown>).Description = `${fx.runTag} real-client harness`;
  if (!(await o.Save())) throw new Error(`order create failed: ${o.LatestResult?.CompleteMessage}`);
  const orderId = (o as unknown as { ID: string }).ID;
  let n = 1;
  for (const l of lines) {
    const ln = await md.GetEntityObject(ORDER_LINE_ENTITY, user);
    ln.NewRecord();
    (ln as unknown as Record<string, unknown>).OrderID = orderId;
    (ln as unknown as Record<string, unknown>).ProductID = l.productId;
    (ln as unknown as Record<string, unknown>).LineNumber = n++;
    (ln as unknown as Record<string, unknown>).Quantity = l.qty;
    (ln as unknown as Record<string, unknown>).UnitPrice = l.price;
    if (l.description) (ln as unknown as Record<string, unknown>).Description = l.description;
    if (!(await ln.Save())) throw new Error(`order line create failed: ${ln.LatestResult?.CompleteMessage}`);
  }
  return orderId;
}

interface JELine { GLAccountID: string; DebitAmount: number | null; CreditAmount: number | null; CounterpartyOrganizationID: string | null; }
async function jeLines(user: UserInfo, jeId: string): Promise<JELine[]> {
  const r = await new RunView().RunView<JELine>({ EntityName: JE_LINE_ENTITY, ExtraFilter: `JournalEntryID='${jeId}'`, Fields: ['GLAccountID', 'DebitAmount', 'CreditAmount', 'CounterpartyOrganizationID'], ResultType: 'simple' }, user);
  return r.Results ?? [];
}
const dr = (ls: JELine[], gl: string) => ls.filter((l) => up(l.GLAccountID) === up(gl)).reduce((s, l) => s + Number(l.DebitAmount ?? 0), 0);
const cr = (ls: JELine[], gl: string) => ls.filter((l) => up(l.GLAccountID) === up(gl)).reduce((s, l) => s + Number(l.CreditAmount ?? 0), 0);
const sumDr = (ls: JELine[]) => ls.reduce((s, l) => s + Number(l.DebitAmount ?? 0), 0);
const sumCr = (ls: JELine[]) => ls.reduce((s, l) => s + Number(l.CreditAmount ?? 0), 0);

async function main(): Promise<void> {
  console.log('=== Tier-3 API harness: order→Confirm→JE via REAL OrderEditorClient + entity path ===');
  console.log('Provisioning fixture (coA/coB + GL + products + org)…');
  const fx = fixtureSetup();
  console.log(`  fixture ${fx.runTag}`);

  // bootstrap the real GraphQL client AFTER the fixture subprocess (avoid stale keep-alive ECONNRESET)
  const psOut = JSON.parse(execSync(`${LAUNCHER} ps ${SLUG} --json`).toString()) as { processes?: Array<{ label?: string; status?: string; port?: number }> };
  const api = (psOut.processes ?? []).find((p) => p.label === 'MJAPI' && p.status === 'running');
  if (!api?.port) failBootstrap(`MJAPI not running for ${SLUG}`);
  const key = execSync(`${LAUNCHER} key ${SLUG}`).toString().trim();
  const provider: GraphQLDataProvider = await setupGraphQLClient(new GraphQLProviderConfigData('', `http://localhost:${api.port}`, '', async () => '', '__mj', undefined, undefined, undefined, key));
  const user = provider.CurrentUser;
  const md = new Metadata();
  const editor = new OrderEditorClient();
  const worklist = new OverdueWorklistClient();
  const payments = new PaymentEntryClient();
  console.log(`  real client on http://localhost:${api.port}, user ${user?.Email ?? '?'}`);

  try {
    // O1 — single-company immediate: Dr AR 200 / Cr Sales 200, order → Posted, JE stamped.
    console.log('\nO1 single-company immediate (via OrderEditorClient.Confirm):');
    const o1 = await createOrder(md, user, fx, 1, [{ productId: fx.products.immA, qty: 2, price: 100, description: `${fx.runTag} line-memo` }]);
    const r1 = await editor.Confirm(provider as unknown as IRemoteOperationProvider, o1);
    check('O1: Confirm Success', r1.Success === true, JSON.stringify(r1.Errors));
    check('O1: Status Posted', r1.Status === 'Posted', `got ${r1.Status}`);
    check('O1: exactly 1 JE booked', (r1.JournalEntryIDs?.length ?? 0) === 1, JSON.stringify(r1.JournalEntryIDs));
    const l1 = await jeLines(user, r1.JournalEntryIDs![0]);
    check('O1: JE balances', near(sumDr(l1), sumCr(l1)), `Dr ${sumDr(l1)} / Cr ${sumCr(l1)}`);
    check('O1: Dr AR === 200', near(dr(l1, fx.coA.arGL), 200), `got ${dr(l1, fx.coA.arGL)}`);
    check('O1: Cr Sales === 200', near(cr(l1, fx.coA.revGL), 200), `got ${cr(l1, fx.coA.revGL)}`);
    // NEW FIELD — OrderLine.Description persists via the order save path (real entity Save, same
    // mechanism the editor's queueLines uses inside its TransactionGroup).
    const o1lines = (await new RunView().RunView<{ Description: string | null }>({ EntityName: ORDER_LINE_ENTITY, ExtraFilter: `OrderID='${o1}'`, Fields: ['Description'], ResultType: 'simple' }, user)).Results ?? [];
    check('O1: OrderLine.Description persisted (NEW UI field → order save)', o1lines.some((l) => l.Description === `${fx.runTag} line-memo`), JSON.stringify(o1lines));

    // O2 — multi-company: ONE JE PER COMPANY, each single-company + balanced (coA 300 / coB 150).
    console.log('\nO2 multi-company → one JE per company (MOD-11):');
    const o2 = await createOrder(md, user, fx, 2, [{ productId: fx.products.immA, qty: 1, price: 300 }, { productId: fx.products.immB, qty: 3, price: 50 }]);
    const r2 = await editor.Confirm(provider as unknown as IRemoteOperationProvider, o2);
    check('O2: Confirm Success + Posted', r2.Success === true && r2.Status === 'Posted', JSON.stringify(r2));
    check('O2: exactly 2 JEs (one per company)', (r2.JournalEntryIDs?.length ?? 0) === 2, JSON.stringify(r2.JournalEntryIDs));
    const jeRows = (await new RunView().RunView<{ ID: string; CompanyID: string }>({ EntityName: JE_ENTITY, ExtraFilter: `OrderID='${o2}'`, Fields: ['ID', 'CompanyID'], ResultType: 'simple' }, user)).Results ?? [];
    const rowA = jeRows.find((r) => up(r.CompanyID) === up(fx.coA.id));
    const rowB = jeRows.find((r) => up(r.CompanyID) === up(fx.coB.id));
    check('O2: one JE per company, CompanyID stamped', !!rowA && !!rowB, JSON.stringify(jeRows));
    if (rowA && rowB) {
      const la = await jeLines(user, rowA.ID), lb = await jeLines(user, rowB.ID);
      check('O2: coA Dr AR 300 / Cr Sales 300', near(dr(la, fx.coA.arGL), 300) && near(cr(la, fx.coA.revGL), 300), `AR ${dr(la, fx.coA.arGL)} / Sales ${cr(la, fx.coA.revGL)}`);
      check('O2: coB Dr AR 150 / Cr Sales 150', near(dr(lb, fx.coB.arGL), 150) && near(cr(lb, fx.coB.revGL), 150), `AR ${dr(lb, fx.coB.arGL)} / Sales ${cr(lb, fx.coB.revGL)}`);
      check('O2: coA JE single-company pure (no coB lines)', near(dr(la, fx.coB.arGL), 0) && near(cr(la, fx.coB.revGL), 0), 'coB leaked into coA JE');
    }

    // O3 — deferred-revenue product: credits Deferred Revenue, not Sales.
    console.log('\nO3 deferred-revenue product:');
    const o3 = await createOrder(md, user, fx, 3, [{ productId: fx.products.defA, qty: 1, price: 120 }]);
    const r3 = await editor.Confirm(provider as unknown as IRemoteOperationProvider, o3);
    check('O3: Confirm Success', r3.Success === true, JSON.stringify(r3.Errors));
    const l3 = await jeLines(user, r3.JournalEntryIDs![0]);
    check('O3: Cr Deferred Revenue === 120', near(cr(l3, fx.coA.defRevGL), 120), `got ${cr(l3, fx.coA.defRevGL)}`);
    check('O3: Sales not credited (0)', near(cr(l3, fx.coA.revGL), 0), `got ${cr(l3, fx.coA.revGL)}`);
    check('O3: Dr AR === 120', near(dr(l3, fx.coA.arGL), 120), `got ${dr(l3, fx.coA.arGL)}`);

    // O4 — unresolvable product → Confirm BLOCKED (Success:false + Errors, or throws). No JE.
    console.log('\nO4 unresolvable product → Confirm blocked (the §13.1 loud-banner path):');
    const o4 = await createOrder(md, user, fx, 4, [{ productId: fx.products.unlinkedA, qty: 1, price: 99 }]);
    let blocked = false, o4err = '';
    try {
      const r4 = await editor.Confirm(provider as unknown as IRemoteOperationProvider, o4);
      blocked = r4.Success === false; o4err = JSON.stringify(r4.Errors);
    } catch (e) { blocked = true; o4err = e instanceof Error ? e.message : String(e); }
    check('O4: Confirm was BLOCKED (unresolvable account)', blocked, `expected a block; ${o4err}`);
    const o4jes = (await new RunView().RunView<{ ID: string }>({ EntityName: JE_ENTITY, ExtraFilter: `OrderID='${o4}'`, Fields: ['ID'], ResultType: 'simple' }, user)).Results ?? [];
    check('O4: no JE booked for the blocked order', o4jes.length === 0, `got ${o4jes.length}`);

    // OverdueWorklist — the real dunning read (drift-proof: every returned row is genuinely overdue).
    console.log('\nOverdueWorklistClient.Get (real dunning read):');
    const overdue = await worklist.Get(provider as unknown as IRemoteOperationProvider);
    check('OverdueWorklist: returns an array (op reachable, no throw)', Array.isArray(overdue), typeof overdue);
    check('OverdueWorklist: every row is genuinely overdue (DaysOverdue > 0, drift-proof)', overdue.every((r) => Number(r.DaysOverdue) > 0), JSON.stringify(overdue.slice(0, 3)));
    check('OverdueWorklist: every row well-formed (OrderID + OrderNumber)', overdue.every((r) => !!r.OrderID && !!r.OrderNumber), 'a row is missing OrderID/OrderNumber');

    // P — Payment capture via the REAL PaymentEntryClient → Dr Cash / Cr AR, EntryType PaymentReceipt.
    console.log('\nP payment capture (PaymentEntryClient.Capture → Dr Cash / Cr AR):');
    const cashRes = await new RunView().RunView<{ ID: string }>({ EntityName: GL_ENTITY, ExtraFilter: `CompanyID='${fx.coA.id}' AND Code='11101'`, Fields: ['ID'], ResultType: 'simple' }, user);
    const cashGL = cashRes.Results?.[0]?.ID ?? '';
    check('P: coA Cash GL (11101) resolvable', !!cashGL, 'no 11101 in coA COA');
    // The fixture only makes AR links; the capture booking needs a company-level Cash link to resolve.
    const companiesEntityId = md.EntityByName('MJ: Companies')?.ID ?? '';
    const cashRole = (await new RunView().RunView<{ ID: string }>({ EntityName: 'MJ_BizApps_Accounting: GL Account Roles', ExtraFilter: "Name='Cash'", Fields: ['ID'], ResultType: 'simple' }, user)).Results?.[0]?.ID ?? '';
    if (cashGL && cashRole && companiesEntityId) {
      const link = await md.GetEntityObject('MJ_BizApps_Accounting: GL Account Links', user);
      link.NewRecord();
      const L = link as unknown as Record<string, unknown>;
      L.GLAccountID = cashGL; L.GLAccountRoleID = cashRole; L.EntityID = companiesEntityId; L.RecordID = fx.coA.id; L.Status = 'Active';
      const linkSaved = await link.Save();
      check('P: Cash GLAccountLink created via the real client', linkSaved === true, link.LatestResult?.CompleteMessage);
    } else {
      check('P: Cash link prerequisites resolved', false, `cashGL=${!!cashGL} role=${!!cashRole} companiesEntity=${!!companiesEntityId}`);
    }
    const pay = await md.GetEntityObject(PAYMENT_ENTITY, user);
    pay.NewRecord();
    const P = pay as unknown as Record<string, unknown>;
    P.PaymentNumber = `${fx.runTag}-PAY1`; P.ReceivingCompanyID = fx.coA.id; P.CustomerOrganizationID = fx.customerOrgId;
    P.PaymentDate = new Date(); P.Method = 'Cash'; P.Amount = 200; P.Status = 'Pending';
    P.Notes = `${fx.runTag} payment note`;
    const paySaved = await pay.Save();
    check('P: pending payment created via the real entity path', paySaved === true, pay.LatestResult?.CompleteMessage);
    if (paySaved) {
      // NEW FIELD — Payment.Notes persists via the payment write path (same entity Save the
      // payment-entry writePaymentAndLines TransactionGroup uses).
      const pn = (await new RunView().RunView<{ Notes: string | null }>({ EntityName: PAYMENT_ENTITY, ExtraFilter: `ID='${(pay as unknown as { ID: string }).ID}'`, Fields: ['Notes'], ResultType: 'simple' }, user)).Results?.[0];
      check('P: Payment.Notes persisted (NEW UI field → payment write)', pn?.Notes === `${fx.runTag} payment note`, JSON.stringify(pn));
      const cap = await payments.Capture(provider as unknown as IRemoteOperationProvider, (pay as unknown as { ID: string }).ID);
      check('P: Capture Success', cap.Success === true, JSON.stringify(cap.Errors));
      check('P: capture books a JournalEntryID', !!cap.JournalEntryID, JSON.stringify(cap));
      if (cap.JournalEntryID) {
        const cl = await jeLines(user, cap.JournalEntryID);
        check('P: Dr Cash === 200', near(dr(cl, cashGL), 200), `got ${dr(cl, cashGL)}`);
        check('P: Cr AR === 200 (balanced)', near(cr(cl, fx.coA.arGL), 200) && near(sumDr(cl), sumCr(cl)), `AR ${cr(cl, fx.coA.arGL)} · Dr ${sumDr(cl)}/Cr ${sumCr(cl)}`);
        // NEW FIELD PATH — the AR line carries CounterpartyOrganizationID (set by PaymentEntityServer
        // → CreateJournalEntry contract → engine's atomic write: the SAME path the manual-JE workspace's
        // new counterparty picker feeds). Proves counterparty persists through the real op, not just the UI.
        const arLine = cl.find((l) => up(l.GLAccountID) === up(fx.coA.arGL));
        check('P: capture JE AR line carries CounterpartyOrganizationID === customer (NEW field path)', !!arLine && up(arLine.CounterpartyOrganizationID ?? '') === up(fx.customerOrgId), `AR line counterparty=${arLine?.CounterpartyOrganizationID}, expected ${fx.customerOrgId}`);
      }
    }
  } catch (e) {
    check('flow completed without throwing', false, e instanceof Error ? (e.stack ?? e.message) : String(e));
  } finally {
    console.log('\nTearing down the fixture…');
    fixtureTeardown(fx);
  }

  console.log(`\norder-to-je tier-3 (real client): ${passed}/${passed + failed} passed`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => failBootstrap(e instanceof Error ? (e.stack ?? e.message) : String(e)));
