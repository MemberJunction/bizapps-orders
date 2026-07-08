/**
 * order-to-je — LIVE integration harness: an Order Confirmed → a balanced JournalEntry booked into
 * BizApps Accounting through the real OrderEntityServer + Accounting.CreateJournalEntry op.
 *
 * This is the end-to-end proof for AM-7 step 5. It drives the EXACT production path: create catalog
 * + GLAccountLinks, create an order, flip Status→Confirmed and Save() — which fires OrderEntityServer,
 * resolves accounts via OrdersEngine, books the JE via the in-process op — then verifies the JE header
 * + lines against the DB (balanced overall AND per company, correct accounts, EntryType, OrderID).
 *
 * Tiers/cases:
 *   O1  single-company immediate  — Dr AR / Cr Sales, balanced, EntryType=OrderBooking, lineage stamped
 *   O2  multi-company order        — balanced within EACH company (AM-4)
 *   O3  deferred-revenue product   — Cr Deferred Revenue (not Sales)
 *   O4  unresolvable product       — Confirm BLOCKED (Save false), no JE, order not persisted Confirmed
 *   O5  idempotency                — re-Save a booked order books no second JE
 *
 * Run from the instance worktree root:
 *   npx tsx packages/dev-apps/bizapps-orders/test-harnesses/server/order-to-je.ts
 * Never pipe through `head` (SIGPIPE kills pre-teardown). Asserts ZERO stray Pending JEs at bootstrap.
 */
import * as dotenv from 'dotenv';
import sql from 'mssql';
import path from 'path';
import { Metadata, RunView, UserInfo } from '@memberjunction/core';
import { setupSQLServerClient, SQLServerProviderConfigData, UserCache } from '@memberjunction/sqlserver-dataprovider';
import '@memberjunction/server-bootstrap-lite';
import '@mj-biz-apps/common-entities';
import '@mj-biz-apps/accounting-entities';
import '@mj-biz-apps/accounting-core-entities-server';
import '@mj-biz-apps/orders-entities';
import '@mj-biz-apps/orders-core-entities-server';
import type {
  mjBizAppsAccountingAccountingCompanyProfileEntity,
  mjBizAppsAccountingGLAccountLinkEntity,
} from '@mj-biz-apps/accounting-entities';
import type {
  mjBizAppsOrdersOrderEntity,
  mjBizAppsOrdersOrderLineEntity,
  mjBizAppsOrdersProductEntity,
  mjBizAppsOrdersProductTypeEntity,
} from '@mj-biz-apps/orders-entities';

const ACC_SCHEMA = '__mj_BizAppsAccounting';
const ORD_SCHEMA = '__mj_BizAppsOrders';
const ACP_ENTITY = 'MJ_BizApps_Accounting: Accounting Company Profiles';
const GL_ENTITY = 'MJ_BizApps_Accounting: GL Accounts';
const LINK_ENTITY = 'MJ_BizApps_Accounting: GL Account Links';
const ROLE_ENTITY = 'MJ_BizApps_Accounting: GL Account Roles';
const CURRENCY_ENTITY = 'MJ_BizApps_Accounting: Currencies';
const PRODUCT_TYPE_ENTITY = 'MJ_BizApps_Orders: Product Types';
const PRODUCT_ENTITY = 'MJ_BizApps_Orders: Products';
const ORDER_ENTITY = 'MJ_BizApps_Orders: Orders';
const ORDER_LINE_ENTITY = 'MJ_BizApps_Orders: Order Lines';
const COMPANIES_ENTITY = 'MJ: Companies';

const RUN_TAG = `ORD2JE-${Date.now()}`;
let seq = 0;
const uid = () => `${RUN_TAG}-${seq++}`;

interface Outcome { Name: string; Passed: boolean; Ms: number; Error?: string }
const outcomes: Outcome[] = [];
async function test(name: string, fn: () => Promise<void>): Promise<void> {
  const start = Date.now();
  try { await fn(); outcomes.push({ Name: name, Passed: true, Ms: Date.now() - start }); console.log(`  ✓ ${name} (${Date.now() - start}ms)`); }
  catch (e) { const msg = e instanceof Error ? (e.stack ?? e.message) : String(e); outcomes.push({ Name: name, Passed: false, Ms: Date.now() - start, Error: msg }); console.log(`  ✗ ${name}\n      ${msg.split('\n')[0]}`); }
}
function assert(cond: boolean, message: string): void { if (!cond) throw new Error(message); }
const near = (a: number, b: number) => Math.abs(a - b) < 0.005;

interface Company { id: string; arGL: string; revGL: string; defRevGL: string }
const createdOrderIds: string[] = [];
const createdJEIds: string[] = [];
const createdLinkIds: string[] = [];
const createdProductIds: string[] = [];
const createdTypeIds: string[] = [];
const companies: Company[] = [];
let pool: sql.ConnectionPool;
let teardownPool: sql.ConnectionPool;
let user: UserInfo;
const roleByName = new Map<string, string>();
let productsEntityId = '';
let companiesEntityId = '';

let companyCounter = 0;
async function createCompany(currencyCode: string): Promise<Company> {
  const md = new Metadata();
  const rv = new RunView();
  const acp = await md.GetEntityObject<mjBizAppsAccountingAccountingCompanyProfileEntity>(ACP_ENTITY, user);
  acp.NewRecord();
  acp.Name = `${RUN_TAG} Co${companyCounter}`;
  acp.Description = `${RUN_TAG} order-to-je test`;
  acp.CompanyCode = `O2J${companyCounter++}${Date.now().toString(36).slice(-5)}`.toUpperCase();
  acp.FunctionalCurrencyCode = currencyCode;
  acp.EntityType = 'Subsidiary';
  const id = acp.ID;
  if (!(await acp.Save())) throw new Error(`ACP save failed: ${JSON.stringify(acp.LatestResult)}`);
  const glRes = await rv.RunView<{ ID: string; Code: string }>(
    { EntityName: GL_ENTITY, ExtraFilter: `CompanyID='${id}'`, Fields: ['ID', 'Code'], ResultType: 'simple' }, user);
  const byCode = new Map((glRes.Results ?? []).map(r => [r.Code, r.ID]));
  const arGL = byCode.get('11201'), revGL = byCode.get('40100'), defRevGL = byCode.get('21301');
  if (!arGL || !revGL || !defRevGL) throw new Error('seeded GL accounts (11201/40100/21301) not found');
  const co: Company = { id, arGL, revGL, defRevGL };
  companies.push(co);
  return co;
}

async function createLink(entityId: string, recordId: string, roleName: string, glAccountId: string): Promise<void> {
  const md = new Metadata();
  const roleId = roleByName.get(roleName);
  if (!roleId) throw new Error(`role '${roleName}' not found`);
  const link = await md.GetEntityObject<mjBizAppsAccountingGLAccountLinkEntity>(LINK_ENTITY, user);
  link.NewRecord();
  link.GLAccountID = glAccountId;
  link.GLAccountRoleID = roleId;
  link.EntityID = entityId;
  link.RecordID = recordId;
  link.Status = 'Active';
  const id = link.ID;
  if (!(await link.Save())) throw new Error(`link save failed: ${link.LatestResult?.CompleteMessage ?? 'unknown'}`);
  createdLinkIds.push(id);
}

async function createProductType(): Promise<string> {
  const md = new Metadata();
  const pt = await md.GetEntityObject<mjBizAppsOrdersProductTypeEntity>(PRODUCT_TYPE_ENTITY, user);
  pt.NewRecord();
  pt.Name = uid();
  const id = pt.ID;
  if (!(await pt.Save())) throw new Error(`product type save failed: ${pt.LatestResult?.CompleteMessage ?? 'unknown'}`);
  createdTypeIds.push(id);
  return id;
}

/** Create a product + its revenue GLAccountLink (Sales for Immediate, Deferred Revenue for Deferred). */
async function createLinkedProduct(
  typeId: string,
  company: Company,
  recognition: mjBizAppsOrdersProductEntity['RevenueRecognitionType'],
  link = true
): Promise<string> {
  const md = new Metadata();
  const p = await md.GetEntityObject<mjBizAppsOrdersProductEntity>(PRODUCT_ENTITY, user);
  p.NewRecord();
  p.Name = uid();
  p.ProductTypeID = typeId;
  p.RevenueRecognitionType = recognition;
  const id = p.ID;
  if (!(await p.Save())) throw new Error(`product save failed: ${p.LatestResult?.CompleteMessage ?? 'unknown'}`);
  createdProductIds.push(id);
  if (link) {
    const role = recognition === 'Deferred' ? 'Deferred Revenue' : 'Sales';
    const gl = recognition === 'Deferred' ? company.defRevGL : company.revGL;
    await createLink(productsEntityId, id, role, gl);
  }
  return id;
}

async function createOrder(lines: Array<{ productId: string; qty: number; price: number }>): Promise<string> {
  const md = new Metadata();
  const order = await md.GetEntityObject<mjBizAppsOrdersOrderEntity>(ORDER_ENTITY, user);
  order.NewRecord();
  order.OrderNumber = uid();
  order.OrderDate = new Date();
  order.Status = 'Draft';
  const id = order.ID;
  if (!(await order.Save())) throw new Error(`order save failed: ${order.LatestResult?.CompleteMessage ?? 'unknown'}`);
  createdOrderIds.push(id);
  let n = 1;
  for (const l of lines) {
    const line = await md.GetEntityObject<mjBizAppsOrdersOrderLineEntity>(ORDER_LINE_ENTITY, user);
    line.NewRecord();
    line.OrderID = id;
    line.ProductID = l.productId;
    line.LineNumber = n++;
    line.Quantity = l.qty;
    line.UnitPrice = l.price;
    if (!(await line.Save())) throw new Error(`line save failed: ${line.LatestResult?.CompleteMessage ?? 'unknown'}`);
  }
  return id;
}

/** Flip an order to Confirmed and Save — returns the Save() boolean + the reloaded order. */
async function confirmOrder(orderId: string): Promise<{ saved: boolean; order: mjBizAppsOrdersOrderEntity }> {
  const md = new Metadata();
  const order = await md.GetEntityObject<mjBizAppsOrdersOrderEntity>(ORDER_ENTITY, user);
  await order.Load(orderId);
  order.Status = 'Confirmed';
  const saved = await order.Save();
  if (saved && order.JournalEntryID) createdJEIds.push(order.JournalEntryID);
  return { saved, order };
}

interface JELineRow { GLAccountID: string; DebitAmount: number; CreditAmount: number }
async function readJE(jeId: string): Promise<{ header: { EntryType: string; OrderID: string | null; Status: string }; lines: JELineRow[] }> {
  const h = (await pool.request().query(`SELECT EntryType, OrderID, Status FROM ${ACC_SCHEMA}.JournalEntry WHERE ID='${jeId}'`)).recordset[0];
  const lines = (await pool.request().query(`SELECT GLAccountID, ISNULL(DebitAmount,0) DebitAmount, ISNULL(CreditAmount,0) CreditAmount FROM ${ACC_SCHEMA}.JournalEntryLine WHERE JournalEntryID='${jeId}' ORDER BY LineNumber`)).recordset;
  return { header: h, lines: lines.map(r => ({ GLAccountID: (r.GLAccountID as string).toUpperCase(), DebitAmount: Number(r.DebitAmount), CreditAmount: Number(r.CreditAmount) })) };
}
const debitFor = (lines: JELineRow[], gl: string) => lines.filter(l => l.GLAccountID === gl.toUpperCase()).reduce((s, l) => s + l.DebitAmount, 0);
const creditFor = (lines: JELineRow[], gl: string) => lines.filter(l => l.GLAccountID === gl.toUpperCase()).reduce((s, l) => s + l.CreditAmount, 0);

async function bootstrap(): Promise<void> {
  dotenv.config({ path: path.resolve(process.cwd(), '.env'), quiet: true });
  const { DB_HOST: host, DB_DATABASE: database, DB_USERNAME: dbUser, DB_PASSWORD: password } = process.env;
  if (!host || !database || !dbUser || !password) throw new Error('Missing DB settings in .env (run from the instance worktree root).');
  const port = Number(process.env.DB_PORT ?? 1433);
  const opts = { options: { encrypt: false, trustServerCertificate: true } };
  pool = await new sql.ConnectionPool({ server: host, port, user: dbUser, password, database, ...opts }).connect();
  const { CODEGEN_DB_USERNAME: cgUser, CODEGEN_DB_PASSWORD: cgPassword } = process.env;
  if (!cgUser || !cgPassword) throw new Error('Missing CODEGEN_DB_USERNAME/PASSWORD in .env (db_owner teardown pool).');
  teardownPool = await new sql.ConnectionPool({ server: host, port, user: cgUser, password: cgPassword, database, ...opts }).connect();
  await setupSQLServerClient(new SQLServerProviderConfigData(pool, process.env.MJ_CORE_SCHEMA || '__mj'));
  await UserCache.Instance.Refresh(pool);
  const u = UserCache.Users.find(x => x?.Type?.trim().toLowerCase() === 'owner') ?? UserCache.Users[0];
  if (!u) throw new Error('No context user found.');
  user = u;
  const stray = (await pool.request().query(`SELECT COUNT(*) n FROM ${ACC_SCHEMA}.JournalEntry WHERE Status='Pending'`)).recordset[0].n;
  if (Number(stray) > 0) throw new Error(`${stray} stray Pending JE(s) exist — clean them up before running order-to-je.`);
  const md = new Metadata();
  productsEntityId = md.EntityByName(PRODUCT_ENTITY)?.ID ?? '';
  companiesEntityId = md.EntityByName(COMPANIES_ENTITY)?.ID ?? '';
  if (!productsEntityId || !companiesEntityId) throw new Error('Products / Companies entity IDs not resolved.');
  const rv = new RunView();
  const roles = await rv.RunView<{ ID: string; Name: string }>({ EntityName: ROLE_ENTITY, Fields: ['ID', 'Name'], ResultType: 'simple' }, user);
  for (const r of roles.Results ?? []) roleByName.set(r.Name, r.ID);
}

async function main(): Promise<void> {
  console.log('\n══════ Order → Journal Entry integration (bizapps-orders → bizapps-accounting) ══════');
  await bootstrap();
  const rv = new RunView();
  const currencyCode = (await rv.RunView<{ Code: string }>({ EntityName: CURRENCY_ENTITY, Fields: ['Code'], MaxRows: 1, ResultType: 'simple' }, user)).Results?.[0]?.Code;
  if (!currencyCode) throw new Error('no currency resolved');
  const coA = await createCompany(currencyCode);
  const coB = await createCompany(currencyCode);
  const typeId = await createProductType();
  // Company A: an Immediate product + a Deferred product. Company B: an Immediate product. + one unlinked.
  const pImmA = await createLinkedProduct(typeId, coA, 'Immediate');
  const pDefA = await createLinkedProduct(typeId, coA, 'Deferred');
  const pImmB = await createLinkedProduct(typeId, coB, 'Immediate');
  const pUnlinked = await createLinkedProduct(typeId, coA, 'Immediate', false);
  // Company AR defaults (company-level links).
  await createLink(companiesEntityId, coA.id, 'Accounts Receivable', coA.arGL);
  await createLink(companiesEntityId, coB.id, 'Accounts Receivable', coB.arGL);

  await test('O1 single-company immediate → Dr AR / Cr Sales, balanced, lineage stamped', async () => {
    const orderId = await createOrder([{ productId: pImmA, qty: 2, price: 100 }]);
    const { saved, order } = await confirmOrder(orderId);
    assert(saved, 'confirm Save should succeed');
    assert(!!order.JournalEntryID, 'order.JournalEntryID should be stamped');
    assert(!!order.ConfirmedAt, 'order.ConfirmedAt should be stamped');
    assert(order.Status === 'Posted', `order should advance to Posted after booking, got ${order.Status}`);
    const dbStatus = (await pool.request().query(`SELECT Status FROM ${ORD_SCHEMA}.[Order] WHERE ID='${orderId}'`)).recordset[0];
    assert(dbStatus.Status === 'Posted', `order should be PERSISTED Posted, got ${dbStatus.Status}`);
    const je = await readJE(order.JournalEntryID!);
    assert(je.header.EntryType === 'OrderBooking', `EntryType should be OrderBooking, got ${je.header.EntryType}`);
    assert((je.header.OrderID ?? '').toUpperCase() === orderId.toUpperCase(), 'JE.OrderID should be the order');
    assert(near(debitFor(je.lines, coA.arGL), 200), `Dr AR should be 200, got ${debitFor(je.lines, coA.arGL)}`);
    assert(near(creditFor(je.lines, coA.revGL), 200), `Cr Sales should be 200, got ${creditFor(je.lines, coA.revGL)}`);
    const totDr = je.lines.reduce((s, l) => s + l.DebitAmount, 0), totCr = je.lines.reduce((s, l) => s + l.CreditAmount, 0);
    assert(near(totDr, totCr), `JE should balance overall (${totDr} vs ${totCr})`);
  });

  await test('O2 multi-company order → balanced within EACH company (AM-4)', async () => {
    const orderId = await createOrder([
      { productId: pImmA, qty: 1, price: 300 },
      { productId: pImmB, qty: 3, price: 50 },
    ]);
    const { saved, order } = await confirmOrder(orderId);
    assert(saved && !!order.JournalEntryID, 'confirm should book a JE');
    const je = await readJE(order.JournalEntryID!);
    assert(near(debitFor(je.lines, coA.arGL), 300) && near(creditFor(je.lines, coA.revGL), 300), 'Co A: Dr AR 300 = Cr Sales 300');
    assert(near(debitFor(je.lines, coB.arGL), 150) && near(creditFor(je.lines, coB.revGL), 150), 'Co B: Dr AR 150 = Cr Sales 150');
  });

  await test('O3 deferred-revenue product → credits Deferred Revenue, not Sales', async () => {
    const orderId = await createOrder([{ productId: pDefA, qty: 1, price: 120 }]);
    const { saved, order } = await confirmOrder(orderId);
    assert(saved && !!order.JournalEntryID, 'confirm should book a JE');
    const je = await readJE(order.JournalEntryID!);
    assert(near(creditFor(je.lines, coA.defRevGL), 120), `Cr Deferred Revenue should be 120, got ${creditFor(je.lines, coA.defRevGL)}`);
    assert(near(creditFor(je.lines, coA.revGL), 0), 'Sales should not be credited');
    assert(near(debitFor(je.lines, coA.arGL), 120), 'Dr AR should be 120');
  });

  await test('O4 unresolvable product → Confirm BLOCKED, no JE, not persisted Confirmed', async () => {
    const orderId = await createOrder([{ productId: pUnlinked, qty: 1, price: 99 }]);
    const { saved } = await confirmOrder(orderId);
    assert(!saved, 'Save should return false (booking blocked)');
    const dbStatus = (await pool.request().query(`SELECT Status, JournalEntryID FROM ${ORD_SCHEMA}.[Order] WHERE ID='${orderId}'`)).recordset[0];
    assert(dbStatus.Status !== 'Confirmed', `order should NOT be persisted Confirmed, got ${dbStatus.Status}`);
    assert(dbStatus.JournalEntryID == null, 'order should have no JournalEntryID');
  });

  await test('O5 idempotency — re-Save a booked order books no second JE', async () => {
    const orderId = await createOrder([{ productId: pImmA, qty: 1, price: 75 }]);
    const first = await confirmOrder(orderId);
    assert(first.saved && !!first.order.JournalEntryID, 'first confirm books a JE');
    const again = await confirmOrder(orderId);
    assert(again.saved, 're-save should succeed');
    assert(again.order.JournalEntryID === first.order.JournalEntryID, 'JournalEntryID unchanged');
    const count = (await pool.request().query(`SELECT COUNT(*) n FROM ${ACC_SCHEMA}.JournalEntry WHERE OrderID='${orderId}'`)).recordset[0].n;
    assert(Number(count) === 1, `exactly one JE should exist for the order, got ${count}`);
  });

  await teardown();
  const failed = outcomes.filter(o => !o.Passed);
  console.log(`\n────── Order→JE integration: ${outcomes.length - failed.length}/${outcomes.length} passed ──────`);
  if (failed.length) for (const f of failed) console.log(`   ✗ ${f.Name}: ${(f.Error ?? '').split('\n')[0]}`);
  process.exit(failed.length > 0 ? 1 : 0);
}

async function teardown(): Promise<void> {
  const exec = async (q: string) => { try { await teardownPool.request().query(q); } catch (e) { console.log(`      teardown warn: ${(e instanceof Error ? e.message : String(e)).split('\n')[0]}`); } };
  const jeList = createdJEIds.map(id => `'${id}'`).join(',');
  const toggled = ['JournalEntryLine', 'JournalEntry'];
  try {
    for (const t of toggled) await exec(`DISABLE TRIGGER ALL ON ${ACC_SCHEMA}.${t}`);
    if (jeList) {
      await exec(`DELETE d FROM ${ACC_SCHEMA}.JournalEntryLineDimension d JOIN ${ACC_SCHEMA}.JournalEntryLine l ON l.ID=d.JournalEntryLineID WHERE l.JournalEntryID IN (${jeList})`);
      await exec(`DELETE FROM ${ACC_SCHEMA}.JournalEntryLine WHERE JournalEntryID IN (${jeList})`);
      await exec(`DELETE FROM ${ACC_SCHEMA}.JournalEntry WHERE ID IN (${jeList})`);
    }
  } finally {
    for (const t of toggled) await exec(`ENABLE TRIGGER ALL ON ${ACC_SCHEMA}.${t}`);
  }
  const orderList = createdOrderIds.map(id => `'${id}'`).join(',');
  if (orderList) {
    await exec(`DELETE FROM ${ORD_SCHEMA}.OrderLine WHERE OrderID IN (${orderList})`);
    await exec(`DELETE FROM ${ORD_SCHEMA}.[Order] WHERE ID IN (${orderList})`);
  }
  if (createdLinkIds.length) await exec(`DELETE FROM ${ACC_SCHEMA}.GLAccountLink WHERE ID IN (${createdLinkIds.map(id => `'${id}'`).join(',')})`);
  if (createdProductIds.length) await exec(`DELETE FROM ${ORD_SCHEMA}.Product WHERE ID IN (${createdProductIds.map(id => `'${id}'`).join(',')})`);
  if (createdTypeIds.length) await exec(`DELETE FROM ${ORD_SCHEMA}.ProductType WHERE ID IN (${createdTypeIds.map(id => `'${id}'`).join(',')})`);
  for (const co of companies) {
    await exec(`DELETE FROM ${ACC_SCHEMA}.AccountingCompanyProfile WHERE ID='${co.id}'`);
    await exec(`DELETE FROM ${ACC_SCHEMA}.GLAccount WHERE CompanyID='${co.id}'`);
    await exec(`DELETE FROM __mj.Company WHERE ID='${co.id}'`);
  }
}

void main();
