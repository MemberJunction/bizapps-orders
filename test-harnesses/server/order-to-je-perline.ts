/**
 * order-to-je-perline — LIVE integration proof of the MOD-15 PER-LINE booking (Amith 2026-07-21).
 *
 * Drives the real production path (create catalog + GLAccountLinks → create order → Status→Confirmed
 * → Save() fires OrderEntityServer → OrderJournalEntryFactory books ONE JE PER ORDER LINE via the
 * in-process accounting op) and asserts the exact per-line ledger against the DB. This is the B5
 * proof that replaces the per-company assertions of `order-to-je.ts` (which is retired — MOD-11).
 *
 * Cases (Amith's B5 list):
 *   P1  single line               — one JE: Dr AR net / Cr Sales, OrderLine.JournalEntryID stamped,
 *                                    Order has NO JournalEntryID (booked guard = ConfirmedAt)
 *   P2  same-company multi-line    — TWO SEPARATE JEs (one per line), each Dr AR / Cr Sales balanced
 *   P3  multi-company multi-line   — one JE per line, each single-company by construction
 *   P4  discount + linked contra   — Dr AR net · Cr Sales GROSS · Dr Sales-Discounts (the discount)
 *   P5  discount + UNLINKED contra — Dr AR net · Cr Sales NET (discount netted into revenue)
 *   P6  deferred-revenue product   — Cr Deferred Revenue (not Sales)
 *   P7  rollback                   — unresolvable product → Confirm BLOCKED, nothing written
 *   P8  idempotency                — re-save a booked order books no new JE; each line stays stamped
 *
 * Run from the instance worktree root (NEVER pipe through head — SIGPIPE kills teardown):
 *   npx tsx packages/dev-apps/bizapps-orders/test-harnesses/server/order-to-je-perline.ts
 */
import * as dotenv from 'dotenv';
import sql from 'mssql';
import path from 'path';
import { Metadata, RunView, UserInfo } from '@memberjunction/core';
import { setupSQLServerClient, SQLServerProviderConfigData, UserCache } from '@memberjunction/sqlserver-dataprovider';
import '@memberjunction/server-bootstrap-lite';
import '@mj-biz-apps/common-entities';
import type { mjBizAppsCommonOrganizationEntity } from '@mj-biz-apps/common-entities';
import '@mj-biz-apps/accounting-entities';
import type {
  mjBizAppsAccountingAccountingCompanyProfileEntity,
  mjBizAppsAccountingGLAccountEntity,
  mjBizAppsAccountingGLAccountLinkEntity,
} from '@mj-biz-apps/accounting-entities';
// Registers the accounting SERVER subclasses — incl. AccountingCompanyProfileEntityServer, which
// creates the IsA parent __mj.Company on ACP save (fixture needs it), and the CreateJournalEntry op.
import '@mj-biz-apps/accounting-core-entities-server';
import '@mj-biz-apps/orders-entities';
import '@mj-biz-apps/orders-core-entities-server';
import type {
  mjBizAppsOrdersOrderEntity,
  mjBizAppsOrdersOrderLineEntity,
  mjBizAppsOrdersProductEntity,
  mjBizAppsOrdersProductTypeEntity,
} from '@mj-biz-apps/orders-entities';

const ACC = '__mj_BizAppsAccounting';
const ORD = '__mj_BizAppsOrders';
const ACP_ENTITY = 'MJ_BizApps_Accounting: Accounting Company Profiles';
const GL_ENTITY = 'MJ_BizApps_Accounting: GL Accounts';
const LINK_ENTITY = 'MJ_BizApps_Accounting: GL Account Links';
const ROLE_ENTITY = 'MJ_BizApps_Accounting: GL Account Roles';
const CURRENCY_ENTITY = 'MJ_BizApps_Accounting: Currencies';
const PRODUCT_TYPE_ENTITY = 'MJ_BizApps_Orders: Product Types';
const PRODUCT_ENTITY = 'MJ_BizApps_Orders: Products';
const ORDER_ENTITY = 'MJ_BizApps_Orders: Orders';
const ORDER_LINE_ENTITY = 'MJ_BizApps_Orders: Order Lines';
const ORGANIZATION_ENTITY = 'MJ_BizApps_Common: Organizations';
const COMPANIES_ENTITY = 'MJ: Companies';

const RUN_TAG = `ORD2JE-PL-${Date.now()}`;
let seqN = 0;
const uid = () => `${RUN_TAG}-${seqN++}`;

interface Outcome { Name: string; Passed: boolean; Ms: number; Error?: string }
const outcomes: Outcome[] = [];
async function test(name: string, fn: () => Promise<void>): Promise<void> {
  const start = Date.now();
  try { await fn(); outcomes.push({ Name: name, Passed: true, Ms: Date.now() - start }); console.log(`  ✓ ${name} (${Date.now() - start}ms)`); }
  catch (e) { const msg = e instanceof Error ? (e.stack ?? e.message) : String(e); outcomes.push({ Name: name, Passed: false, Ms: Date.now() - start, Error: msg }); console.log(`  ✗ ${name}\n      ${msg.split('\n')[0]}`); }
}
function assert(cond: boolean, message: string): void { if (!cond) throw new Error(message); }
const near = (a: number, b: number) => Math.abs(a - b) < 0.005;

interface Company { id: string; code: string; arGL: string; revGL: string; defRevGL: string; discGL: string }
let pool: sql.ConnectionPool;
let user: UserInfo;
const roleByName = new Map<string, string>();
let productsEntityId = '';
let companiesEntityId = '';
let CUSTOMER_ORG_ID = '';
// teardown ledgers (FK-aware order): links, lines, orders, JEs, products, types, companies, org
const created = { links: [] as string[], orders: [] as string[], products: [] as string[], types: [] as string[], companies: [] as string[], discGLs: [] as string[] };

let companyCounter = 0;
async function createCompany(currencyCode: string): Promise<Company> {
  const md = new Metadata(); const rv = new RunView();
  const acp = await md.GetEntityObject<mjBizAppsAccountingAccountingCompanyProfileEntity>(ACP_ENTITY, user);
  acp.NewRecord();
  acp.Name = `${RUN_TAG} Co${companyCounter}`;
  acp.Description = `${RUN_TAG} per-line test`;
  const code = `PLC${companyCounter++}${Date.now().toString(36).slice(-4)}`.toUpperCase();
  acp.CompanyCode = code;
  acp.FunctionalCurrencyCode = currencyCode;
  acp.EntityType = 'Subsidiary';
  const id = acp.ID;
  if (!(await acp.Save())) throw new Error(`ACP save failed: ${JSON.stringify(acp.LatestResult)}`);
  created.companies.push(id);
  const glRes = await rv.RunView<{ ID: string; Code: string }>({ EntityName: GL_ENTITY, ExtraFilter: `CompanyID='${id}'`, Fields: ['ID', 'Code'], ResultType: 'simple' }, user);
  const byCode = new Map((glRes.Results ?? []).map(r => [r.Code, r.ID]));
  const arGL = byCode.get('11201'), revGL = byCode.get('40100'), defRevGL = byCode.get('21301');
  if (!arGL || !revGL || !defRevGL) throw new Error('seeded GL accounts (11201/40100/21301) not found');
  // A Sales-Discounts contra account is NOT in the seeded CoA — create one for the contra case.
  const disc = await md.GetEntityObject<mjBizAppsAccountingGLAccountEntity>(GL_ENTITY, user);
  disc.NewRecord();
  disc.CompanyID = id; disc.Code = '40190'; disc.Name = 'Sales Discounts'; disc.AccountType = 'Revenue'; disc.IsActive = true;
  if (!(await disc.Save())) throw new Error(`disc GL save failed: ${disc.LatestResult?.CompleteMessage}`);
  created.discGLs.push(disc.ID);
  return { id, code, arGL, revGL, defRevGL, discGL: disc.ID };
}

async function createLink(entityId: string, recordId: string, roleName: string, glAccountId: string): Promise<void> {
  const md = new Metadata();
  const roleId = roleByName.get(roleName);
  if (!roleId) throw new Error(`role '${roleName}' not found`);
  const link = await md.GetEntityObject<mjBizAppsAccountingGLAccountLinkEntity>(LINK_ENTITY, user);
  link.NewRecord();
  link.GLAccountID = glAccountId; link.GLAccountRoleID = roleId; link.EntityID = entityId; link.RecordID = recordId; link.Status = 'Active';
  const id = link.ID;
  if (!(await link.Save())) throw new Error(`link save failed: ${link.LatestResult?.CompleteMessage}`);
  created.links.push(id);
}

async function createProductType(): Promise<string> {
  const md = new Metadata();
  const pt = await md.GetEntityObject<mjBizAppsOrdersProductTypeEntity>(PRODUCT_TYPE_ENTITY, user);
  pt.NewRecord(); pt.Name = uid(); pt.RequiresFulfillment = false; // no-fulfillment keeps the order at Posted, not Fulfilled
  const id = pt.ID;
  if (!(await pt.Save())) throw new Error(`product type save failed: ${pt.LatestResult?.CompleteMessage}`);
  created.types.push(id);
  return id;
}

/** Create a product; optionally link its revenue role (Sales/DefRev) and/or a Sales-Discounts contra. */
async function createProduct(typeId: string, co: Company, recognition: mjBizAppsOrdersProductEntity['RevenueRecognitionType'], opts: { linkRevenue?: boolean; linkDiscount?: boolean } = {}): Promise<string> {
  const md = new Metadata();
  const p = await md.GetEntityObject<mjBizAppsOrdersProductEntity>(PRODUCT_ENTITY, user);
  p.NewRecord(); p.Name = uid(); p.ProductTypeID = typeId; p.RevenueRecognitionType = recognition;
  const id = p.ID;
  if (!(await p.Save())) throw new Error(`product save failed: ${p.LatestResult?.CompleteMessage}`);
  created.products.push(id);
  if (opts.linkRevenue ?? true) {
    const role = recognition === 'Deferred' ? 'Deferred Revenue' : 'Sales';
    const gl = recognition === 'Deferred' ? co.defRevGL : co.revGL;
    await createLink(productsEntityId, id, role, gl);
  }
  if (opts.linkDiscount) await createLink(productsEntityId, id, 'Sales Discounts', co.discGL);
  return id;
}

async function createOrder(lines: Array<{ productId: string; qty: number; price: number; discount?: number }>): Promise<string> {
  const md = new Metadata();
  const order = await md.GetEntityObject<mjBizAppsOrdersOrderEntity>(ORDER_ENTITY, user);
  order.NewRecord(); order.OrderNumber = uid(); order.OrderDate = new Date(); order.Status = 'Draft'; order.CustomerOrganizationID = CUSTOMER_ORG_ID;
  const id = order.ID;
  if (!(await order.Save())) throw new Error(`order save failed: ${order.LatestResult?.CompleteMessage}`);
  created.orders.push(id);
  let n = 1;
  for (const l of lines) {
    const line = await md.GetEntityObject<mjBizAppsOrdersOrderLineEntity>(ORDER_LINE_ENTITY, user);
    line.NewRecord(); line.OrderID = id; line.ProductID = l.productId; line.LineNumber = n++; line.Quantity = l.qty; line.UnitPrice = l.price;
    if (l.discount != null) line.DiscountPct = l.discount;
    if (!(await line.Save())) throw new Error(`line save failed: ${line.LatestResult?.CompleteMessage}`);
  }
  return id;
}

async function confirmOrder(orderId: string): Promise<{ saved: boolean; order: mjBizAppsOrdersOrderEntity }> {
  const md = new Metadata();
  const order = await md.GetEntityObject<mjBizAppsOrdersOrderEntity>(ORDER_ENTITY, user);
  await order.Load(orderId); order.Status = 'Confirmed';
  const saved = await order.Save();
  return { saved, order };
}

interface LineJE { orderLineId: string; jeId: string; companyId: string; entryNumber: string; lines: Array<{ GLAccountID: string; DebitAmount: number; CreditAmount: number }> }
/** Every order line's JE (by OrderLine.JournalEntryID), with its JE header + Dr/Cr lines. */
async function readLineJEs(orderId: string): Promise<LineJE[]> {
  const olRows = (await pool.request().query(`SELECT ID, LineNumber, JournalEntryID FROM ${ORD}.OrderLine WHERE OrderID='${orderId}' ORDER BY LineNumber`)).recordset;
  const out: LineJE[] = [];
  for (const ol of olRows) {
    if (!ol.JournalEntryID) continue;
    const h = (await pool.request().query(`SELECT CompanyID, EntryNumber, OrderID, EntryType FROM ${ACC}.JournalEntry WHERE ID='${ol.JournalEntryID}'`)).recordset[0];
    const jl = (await pool.request().query(`SELECT GLAccountID, ISNULL(DebitAmount,0) DebitAmount, ISNULL(CreditAmount,0) CreditAmount FROM ${ACC}.JournalEntryLine WHERE JournalEntryID='${ol.JournalEntryID}'`)).recordset;
    out.push({
      orderLineId: (ol.ID as string).toUpperCase(),
      jeId: (ol.JournalEntryID as string).toUpperCase(),
      companyId: (h.CompanyID as string).toUpperCase(),
      entryNumber: h.EntryNumber as string,
      lines: jl.map(r => ({ GLAccountID: (r.GLAccountID as string).toUpperCase(), DebitAmount: Number(r.DebitAmount), CreditAmount: Number(r.CreditAmount) })),
    });
  }
  return out;
}
const dr = (l: LineJE['lines'], gl: string) => l.filter(x => x.GLAccountID === gl.toUpperCase()).reduce((s, x) => s + x.DebitAmount, 0);
const cr = (l: LineJE['lines'], gl: string) => l.filter(x => x.GLAccountID === gl.toUpperCase()).reduce((s, x) => s + x.CreditAmount, 0);
const balances = (je: LineJE) => near(je.lines.reduce((s, x) => s + x.DebitAmount, 0), je.lines.reduce((s, x) => s + x.CreditAmount, 0));
const jeCount = async (orderId: string) => Number((await pool.request().query(`SELECT COUNT(*) n FROM ${ACC}.JournalEntry WHERE OrderID='${orderId}'`)).recordset[0].n);

async function bootstrap(): Promise<void> {
  dotenv.config({ path: path.resolve(process.cwd(), '.env'), quiet: true });
  const { DB_HOST: host, DB_DATABASE: database, DB_USERNAME: dbUser, DB_PASSWORD: password } = process.env;
  if (!host || !database || !dbUser || !password) throw new Error('Missing DB settings in .env (run from the instance worktree root).');
  const port = Number(process.env.DB_PORT ?? 1433);
  pool = await new sql.ConnectionPool({ server: host, port, user: dbUser, password, database, options: { encrypt: false, trustServerCertificate: true } }).connect();
  await setupSQLServerClient(new SQLServerProviderConfigData(pool, process.env.MJ_CORE_SCHEMA || '__mj'));
  await UserCache.Instance.Refresh(pool);
  user = UserCache.Users.find(x => x?.Type?.trim().toLowerCase() === 'owner') ?? UserCache.Users[0];
  if (!user) throw new Error('No context user found.');
  const md = new Metadata();
  productsEntityId = md.EntityByName(PRODUCT_ENTITY)?.ID ?? '';
  companiesEntityId = md.EntityByName(COMPANIES_ENTITY)?.ID ?? '';
  if (!productsEntityId || !companiesEntityId) throw new Error('Products / Companies entity IDs not resolved.');
  const roles = await new RunView().RunView<{ ID: string; Name: string }>({ EntityName: ROLE_ENTITY, Fields: ['ID', 'Name'], ResultType: 'simple' }, user);
  for (const r of roles.Results ?? []) roleByName.set(r.Name, r.ID);
}

async function main(): Promise<void> {
  console.log('\n══════ Order → PER-LINE Journal Entries (MOD-15, Amith) ══════');
  await bootstrap();
  const customerOrg = await new Metadata().GetEntityObject<mjBizAppsCommonOrganizationEntity>(ORGANIZATION_ENTITY, user);
  customerOrg.NewRecord(); customerOrg.Name = `${RUN_TAG} Customer`;
  if (!(await customerOrg.Save())) throw new Error(`customer org save failed: ${customerOrg.LatestResult?.CompleteMessage}`);
  CUSTOMER_ORG_ID = customerOrg.ID;
  const currencyCode = (await new RunView().RunView<{ Code: string }>({ EntityName: CURRENCY_ENTITY, Fields: ['Code'], MaxRows: 1, ResultType: 'simple' }, user)).Results?.[0]?.Code;
  if (!currencyCode) throw new Error('no currency resolved');
  const coA = await createCompany(currencyCode);
  const coB = await createCompany(currencyCode);
  const typeId = await createProductType();
  const pImmA = await createProduct(typeId, coA, 'Immediate');
  const pImmA2 = await createProduct(typeId, coA, 'Immediate');
  const pImmB = await createProduct(typeId, coB, 'Immediate');
  const pDefA = await createProduct(typeId, coA, 'Deferred');
  const pDiscA = await createProduct(typeId, coA, 'Immediate', { linkDiscount: true }); // Sales + Sales-Discounts linked
  const pUnlinked = await createProduct(typeId, coA, 'Immediate', { linkRevenue: false });
  // Company AR defaults (company-level).
  await createLink(companiesEntityId, coA.id, 'Accounts Receivable', coA.arGL);
  await createLink(companiesEntityId, coB.id, 'Accounts Receivable', coB.arGL);

  await test('P1 single line → one JE (Dr AR net / Cr Sales); OrderLine.JournalEntryID stamped; Order has none', async () => {
    const orderId = await createOrder([{ productId: pImmA, qty: 2, price: 100 }]);
    const { saved, order } = await confirmOrder(orderId);
    assert(saved, 'confirm Save should succeed');
    assert(!!order.ConfirmedAt, 'order.ConfirmedAt should be stamped (the order-level booked guard — Order has no JournalEntryID, MOD-15)');
    const jes = await readLineJEs(orderId);
    assert(jes.length === 1, `single line → exactly 1 JE, got ${jes.length}`);
    assert(await jeCount(orderId) === 1, 'exactly one JournalEntry rows for the order');
    const je = jes[0];
    assert(je.companyId === coA.id.toUpperCase(), 'line JE is company A');
    assert(near(dr(je.lines, coA.arGL), 200), `Dr AR should be 200, got ${dr(je.lines, coA.arGL)}`);
    assert(near(cr(je.lines, coA.revGL), 200), `Cr Sales should be 200, got ${cr(je.lines, coA.revGL)}`);
    assert(balances(je), 'line JE must balance');
  });

  await test('P2 same-company multi-line → TWO SEPARATE JEs (one per line), each balanced', async () => {
    const orderId = await createOrder([{ productId: pImmA, qty: 1, price: 300 }, { productId: pImmA2, qty: 2, price: 25 }]); // 300 + 50
    const { saved } = await confirmOrder(orderId);
    assert(saved, 'confirm should succeed');
    const jes = await readLineJEs(orderId);
    assert(jes.length === 2, `same-company 2-line order → 2 SEPARATE JEs (per line), got ${jes.length}`);
    assert(await jeCount(orderId) === 2, 'two JournalEntry rows for the order');
    assert(jes.every(j => j.companyId === coA.id.toUpperCase()), 'both line JEs are company A');
    assert(jes.every(j => j.jeId !== jes[0].jeId || j === jes[0]) && new Set(jes.map(j => j.jeId)).size === 2, 'the two lines have DISTINCT JEs');
    const amounts = jes.map(j => dr(j.lines, coA.arGL)).sort((a, b) => a - b);
    assert(near(amounts[0], 50) && near(amounts[1], 300), `per-line AR debits should be 50 and 300, got ${amounts.join(',')}`);
    assert(jes.every(balances), 'each line JE balances');
  });

  await test('P3 multi-company multi-line → one JE per line, each single-company', async () => {
    const orderId = await createOrder([{ productId: pImmA, qty: 1, price: 300 }, { productId: pImmB, qty: 3, price: 50 }]);
    const { saved } = await confirmOrder(orderId);
    assert(saved, 'confirm should succeed');
    const jes = await readLineJEs(orderId);
    assert(jes.length === 2, `2 lines → 2 JEs, got ${jes.length}`);
    const a = jes.find(j => j.companyId === coA.id.toUpperCase());
    const b = jes.find(j => j.companyId === coB.id.toUpperCase());
    assert(!!a && !!b, 'one line JE per company');
    assert(near(dr(a!.lines, coA.arGL), 300) && near(cr(a!.lines, coA.revGL), 300), 'Co A line: Dr AR 300 / Cr Sales 300');
    assert(near(dr(b!.lines, coB.arGL), 150) && near(cr(b!.lines, coB.revGL), 150), 'Co B line: Dr AR 150 / Cr Sales 150');
    assert(near(dr(a!.lines, coB.arGL), 0) && near(dr(b!.lines, coA.arGL), 0), 'each line JE is single-company (no cross-company accounts)');
  });

  await test('P4 discount + LINKED contra → Dr AR net / Cr Sales GROSS / Dr Sales-Discounts', async () => {
    const orderId = await createOrder([{ productId: pDiscA, qty: 1, price: 30, discount: 0.1667 }]); // gross 30, net ≈ 25 (discount ≈ 5)
    const { saved } = await confirmOrder(orderId);
    assert(saved, 'confirm should succeed');
    const jes = await readLineJEs(orderId);
    assert(jes.length === 1, `one line → one JE, got ${jes.length}`);
    const je = jes[0];
    const arDr = dr(je.lines, coA.arGL), salesCr = cr(je.lines, coA.revGL), discDr = dr(je.lines, coA.discGL);
    assert(near(salesCr, 30), `Cr Sales should be GROSS 30, got ${salesCr}`);
    assert(near(arDr, 30 * (1 - 0.1667)), `Dr AR should be NET ${(30 * (1 - 0.1667)).toFixed(2)}, got ${arDr}`);
    assert(near(discDr, 30 - 30 * (1 - 0.1667)), `Dr Sales-Discounts should be the discount ${(30 - 30 * (1 - 0.1667)).toFixed(2)}, got ${discDr}`);
    assert(balances(je), 'contra JE must balance (Dr AR + Dr Discounts = Cr Sales)');
  });

  await test('P5 discount + UNLINKED contra → Dr AR net / Cr Sales NET (netted into revenue)', async () => {
    const orderId = await createOrder([{ productId: pImmA, qty: 1, price: 30, discount: 0.1667 }]); // pImmA has NO discount link
    const { saved } = await confirmOrder(orderId);
    assert(saved, 'confirm should succeed');
    const je = (await readLineJEs(orderId))[0];
    const net = 30 * (1 - 0.1667);
    assert(near(cr(je.lines, coA.revGL), net), `Cr Sales should be NET ${net.toFixed(2)} (discount netted in), got ${cr(je.lines, coA.revGL)}`);
    assert(near(dr(je.lines, coA.arGL), net), `Dr AR should be NET ${net.toFixed(2)}, got ${dr(je.lines, coA.arGL)}`);
    assert(je.lines.length === 2, `no contra line when unlinked (just AR + Sales), got ${je.lines.length} lines`);
    assert(balances(je), 'JE balances');
  });

  await test('P6 deferred-revenue product → Cr Deferred Revenue, not Sales', async () => {
    const orderId = await createOrder([{ productId: pDefA, qty: 1, price: 120 }]);
    const { saved } = await confirmOrder(orderId);
    assert(saved, 'confirm should succeed');
    const je = (await readLineJEs(orderId))[0];
    assert(near(cr(je.lines, coA.defRevGL), 120), `Cr Deferred Revenue should be 120, got ${cr(je.lines, coA.defRevGL)}`);
    assert(near(cr(je.lines, coA.revGL), 0), 'Sales must not be credited');
    assert(near(dr(je.lines, coA.arGL), 120), 'Dr AR should be 120');
  });

  await test('P7 rollback — unresolvable product → Confirm BLOCKED, nothing written', async () => {
    const orderId = await createOrder([{ productId: pUnlinked, qty: 1, price: 99 }]);
    const { saved } = await confirmOrder(orderId);
    assert(!saved, 'Save should return false (booking blocked)');
    const db = (await pool.request().query(`SELECT Status, ConfirmedAt FROM ${ORD}.[Order] WHERE ID='${orderId}'`)).recordset[0];
    assert(db.Status !== 'Confirmed' && db.Status !== 'Posted', `order must not advance, got ${db.Status}`);
    assert(db.ConfirmedAt == null, 'order must stay unbooked (no ConfirmedAt)');
    assert(await jeCount(orderId) === 0, 'no JE may exist after a blocked confirm');
    const stamped = Number((await pool.request().query(`SELECT COUNT(*) n FROM ${ORD}.OrderLine WHERE OrderID='${orderId}' AND JournalEntryID IS NOT NULL`)).recordset[0].n);
    assert(stamped === 0, 'no OrderLine.JournalEntryID may be stamped after a blocked confirm');
  });

  await test('P8 idempotency — re-saving a booked order books no new JE; each line stays stamped', async () => {
    const orderId = await createOrder([{ productId: pImmA, qty: 1, price: 75 }, { productId: pImmA2, qty: 1, price: 25 }]);
    const first = await confirmOrder(orderId);
    assert(first.saved, 'first confirm books');
    const before = await readLineJEs(orderId);
    assert(before.length === 2 && await jeCount(orderId) === 2, 'two line JEs booked');
    const stampedBefore = before.map(j => j.jeId).sort();
    // Booked; our product type requires no fulfillment, so the order auto-advances Posted→Fulfilled
    // (MOD-8). A plain re-save of a booked order must not re-book.
    const reload = await new Metadata().GetEntityObject<mjBizAppsOrdersOrderEntity>(ORDER_ENTITY, user);
    await reload.Load(orderId);
    assert(reload.Status === 'Fulfilled', `booked no-fulfillment order should auto-advance to Fulfilled, got ${reload.Status}`);
    assert(!!reload.ConfirmedAt, 'ConfirmedAt is the booked guard');
    assert(await reload.Save(), 're-save of a booked order should succeed (no re-book)');
    assert(await jeCount(orderId) === 2, 'still exactly two JEs after re-save (idempotent)');
    const after = (await readLineJEs(orderId)).map(j => j.jeId).sort();
    assert(JSON.stringify(after) === JSON.stringify(stampedBefore), 'each OrderLine.JournalEntryID unchanged');
  });

  await teardown();
  const passed = outcomes.filter(o => o.Passed).length;
  console.log(`\n────── ${passed}/${outcomes.length} passed ──────`);
  for (const o of outcomes.filter(x => !x.Passed)) console.log(`  ✗ ${o.Name}\n      ${(o.Error ?? '').split('\n').slice(0, 4).join('\n      ')}`);
  await pool.close().catch(() => {});
  process.exit(passed === outcomes.length ? 0 : 1);
}

/** FK-aware teardown of everything this run created (best-effort; raw SQL on the same pool). */
async function teardown(): Promise<void> {
  const q = async (s: string) => { try { await pool.request().query(s); } catch { /* best-effort */ } };
  const inList = (ids: string[]) => ids.map(i => `'${i}'`).join(',') || `'00000000-0000-0000-0000-000000000000'`;
  // JE lines + JEs for our orders, then order lines + orders, then catalog + companies + links.
  await q(`DELETE jl FROM ${ACC}.JournalEntryLine jl JOIN ${ACC}.JournalEntry je ON je.ID=jl.JournalEntryID WHERE je.OrderID IN (${inList(created.orders)})`);
  await q(`DELETE FROM ${ACC}.JournalEntry WHERE OrderID IN (${inList(created.orders)})`);
  await q(`DELETE FROM ${ORD}.OrderLine WHERE OrderID IN (${inList(created.orders)})`);
  await q(`DELETE FROM ${ORD}.[Order] WHERE ID IN (${inList(created.orders)})`);
  await q(`DELETE FROM ${ACC}.GLAccountLink WHERE ID IN (${inList(created.links)})`);
  await q(`DELETE FROM ${ORD}.Product WHERE ID IN (${inList(created.products)})`);
  await q(`DELETE FROM ${ORD}.ProductType WHERE ID IN (${inList(created.types)})`);
  await q(`DELETE FROM ${ACC}.GLAccount WHERE ID IN (${inList(created.discGLs)})`);
  await q(`DELETE FROM ${ACC}.GLAccount WHERE CompanyID IN (${inList(created.companies)})`);
  await q(`DELETE FROM ${ACC}.AccountingCompanyProfile WHERE ID IN (${inList(created.companies)})`);
  await q(`DELETE FROM __mj.Company WHERE ID IN (${inList(created.companies)})`); // IsA parent of the ACP
  await q(`DELETE FROM __mj_BizAppsCommon.Organization WHERE ID='${CUSTOMER_ORG_ID}'`);
}

main().catch(e => { console.error('FATAL', e); process.exit(2); });
