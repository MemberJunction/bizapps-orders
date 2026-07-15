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
 *   O1  single-company immediate  — ONE JE: Dr AR / Cr Sales, balanced, CompanyID + lineage stamped
 *   O2  multi-company order        — ONE JE PER COMPANY (MOD-11/F1.2), each single-company + balanced;
 *                                    Order.JournalEntryID stays NULL (lineage via JournalEntry.OrderID)
 *   O3  deferred-revenue product   — Cr Deferred Revenue (not Sales)
 *   O4  unresolvable product       — Confirm BLOCKED (Save false), no JE, order not persisted Confirmed
 *   O5  idempotency                — re-Save a booked order books no second JE SET (ConfirmedAt guard)
 *   O6  per-company numbering      — booked JEs carry JE-{CompanyCode}-{FY}-{seq} numbers
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
import type { mjBizAppsCommonOrganizationEntity } from '@mj-biz-apps/common-entities';
import '@mj-biz-apps/accounting-entities';
import { CreateJournalEntriesOperation, MaterializeScheduledEntriesOperation } from '@mj-biz-apps/accounting-core-entities-server';
import '@mj-biz-apps/orders-entities';
import { CapturePaymentOperation, ConfirmOrderOperation, CreateRevRecScheduleOperation, GrantEntitlementsOperation, OrdersEngine, ReversalOrderOperation, type ConfirmOrderOutput } from '@mj-biz-apps/orders-core-entities-server';
import type {
  mjBizAppsAccountingAccountingCompanyProfileEntity,
  mjBizAppsAccountingGLAccountLinkEntity,
} from '@mj-biz-apps/accounting-entities';
import type {
  mjBizAppsOrdersOrderEntity,
  mjBizAppsOrdersOrderLineEntity,
  mjBizAppsOrdersPaymentEntity,
  mjBizAppsOrdersPaymentLineEntity,
  mjBizAppsOrdersPaymentProviderEntity,
  mjBizAppsOrdersProductEntitlementEntity,
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
const PAYMENT_ENTITY = 'MJ_BizApps_Orders: Payments';
const PAYMENT_LINE_ENTITY = 'MJ_BizApps_Orders: Payment Lines';
const PAYMENT_PROVIDER_ENTITY = 'MJ_BizApps_Orders: Payment Providers';
const ORGANIZATION_ENTITY = 'MJ_BizApps_Common: Organizations';
const PRODUCT_ENTITLEMENT_ENTITY = 'MJ_BizApps_Orders: Product Entitlements';
const ENTITLEMENT_GRANT_ENTITY = 'MJ_BizApps_Orders: Entitlement Grants';
const COMPANIES_ENTITY = 'MJ: Companies';

const RUN_TAG = `ORD2JE-${Date.now()}`;
let seq = 0;
const uid = () => `${RUN_TAG}-${seq++}`;
// A REAL bizapps-common Organization created at bootstrap — the order's customer AND the AR-line
// CounterpartyOrganizationID (which has an FK to __mj_BizAppsCommon.Organization). Set in main().
let CUSTOMER_ORG_ID = '';

interface Outcome { Name: string; Passed: boolean; Ms: number; Error?: string }
const outcomes: Outcome[] = [];
async function test(name: string, fn: () => Promise<void>): Promise<void> {
  const start = Date.now();
  try { await fn(); outcomes.push({ Name: name, Passed: true, Ms: Date.now() - start }); console.log(`  ✓ ${name} (${Date.now() - start}ms)`); }
  catch (e) { const msg = e instanceof Error ? (e.stack ?? e.message) : String(e); outcomes.push({ Name: name, Passed: false, Ms: Date.now() - start, Error: msg }); console.log(`  ✗ ${name}\n      ${msg.split('\n')[0]}`); }
}
function assert(cond: boolean, message: string): void { if (!cond) throw new Error(message); }
const near = (a: number, b: number) => Math.abs(a - b) < 0.005;

interface Company { id: string; arGL: string; revGL: string; defRevGL: string; cashGL: string }
const createdOrderIds: string[] = [];
const createdJEIds: string[] = [];
const createdPaymentIds: string[] = [];
const createdPaymentLineIds: string[] = [];
const createdProviderIds: string[] = [];
const createdSJEIds: string[] = [];
const createdEntitlementIds: string[] = [];
const createdGrantIds: string[] = [];
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
  const arGL = byCode.get('11201'), revGL = byCode.get('40100'), defRevGL = byCode.get('21301'), cashGL = byCode.get('11101');
  if (!arGL || !revGL || !defRevGL || !cashGL) throw new Error('seeded GL accounts (11201/40100/21301/11101) not found');
  const co: Company = { id, arGL, revGL, defRevGL, cashGL };
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

async function createProductType(requiresFulfillment = true): Promise<string> {
  const md = new Metadata();
  const pt = await md.GetEntityObject<mjBizAppsOrdersProductTypeEntity>(PRODUCT_TYPE_ENTITY, user);
  pt.NewRecord();
  pt.Name = uid();
  pt.RequiresFulfillment = requiresFulfillment;
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

async function createOrder(lines: Array<{ productId: string; qty: number; price: number; discount?: number }>): Promise<string> {
  const md = new Metadata();
  const order = await md.GetEntityObject<mjBizAppsOrdersOrderEntity>(ORDER_ENTITY, user);
  order.NewRecord();
  order.OrderNumber = uid();
  order.OrderDate = new Date();
  order.Status = 'Draft';
  order.CustomerOrganizationID = CUSTOMER_ORG_ID; // F1 customer-required gate
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
    if (l.discount != null) line.DiscountPct = l.discount;
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
  if (saved) {
    // MOD-11: one JE per company — collect them all by lineage (JournalEntryID is only set single-JE).
    const jes = (await pool.request().query(`SELECT ID FROM ${ACC_SCHEMA}.JournalEntry WHERE OrderID='${orderId}'`)).recordset as Array<{ ID: string }>;
    for (const r of jes) if (!createdJEIds.includes(r.ID)) createdJEIds.push(r.ID);
  }
  return { saved, order };
}

/** Confirm an order through the Orders.ConfirmOrder remotable op (the F1.2b unit of work). */
async function confirmOrderViaOp(orderId: string): Promise<{ result: ConfirmOrderOutput; order: mjBizAppsOrdersOrderEntity }> {
  const exec = await new ConfirmOrderOperation().Execute({ OrderID: orderId }, { user });
  const result: ConfirmOrderOutput = exec.Output ?? { Success: false, Errors: [exec.ErrorMessage ?? 'no output'] };
  if (result.Success) {
    const jes = (await pool.request().query(`SELECT ID FROM ${ACC_SCHEMA}.JournalEntry WHERE OrderID='${orderId}'`)).recordset as Array<{ ID: string }>;
    for (const r of jes) if (!createdJEIds.includes(r.ID)) createdJEIds.push(r.ID);
  }
  const md = new Metadata();
  const order = await md.GetEntityObject<mjBizAppsOrdersOrderEntity>(ORDER_ENTITY, user);
  await order.Load(orderId);
  return { result, order };
}

/** All JEs booked for an order (per-company set), with header fields for assertions. */
async function readOrderJEs(orderId: string): Promise<Array<{ ID: string; CompanyID: string; EntryNumber: string }>> {
  const rows = (await pool.request().query(`SELECT ID, CompanyID, EntryNumber FROM ${ACC_SCHEMA}.JournalEntry WHERE OrderID='${orderId}' ORDER BY EntryNumber`)).recordset;
  return rows.map(r => ({ ID: r.ID as string, CompanyID: (r.CompanyID as string).toUpperCase(), EntryNumber: r.EntryNumber as string }));
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
  // A REAL customer Organization — the AR-line CounterpartyOrganizationID has an FK to it.
  const customerOrg = await new Metadata().GetEntityObject<mjBizAppsCommonOrganizationEntity>(ORGANIZATION_ENTITY, user);
  customerOrg.NewRecord();
  customerOrg.Name = `${RUN_TAG} Customer`;
  if (!(await customerOrg.Save())) throw new Error(`customer org save failed: ${customerOrg.LatestResult?.CompleteMessage}`);
  CUSTOMER_ORG_ID = customerOrg.ID;
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
  await createLink(companiesEntityId, coA.id, 'Cash', coA.cashGL); // F3 payments land here (company-level Cash role)

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
    const jes = await readOrderJEs(orderId);
    assert(jes.length === 1, `single-company order should book exactly ONE JE, got ${jes.length}`);
    assert(jes[0].CompanyID === coA.id.toUpperCase(), 'JE.CompanyID should be company A (MOD-12)');
    assert(near(debitFor(je.lines, coA.arGL), 200), `Dr AR should be 200, got ${debitFor(je.lines, coA.arGL)}`);
    assert(near(creditFor(je.lines, coA.revGL), 200), `Cr Sales should be 200, got ${creditFor(je.lines, coA.revGL)}`);
    const totDr = je.lines.reduce((s, l) => s + l.DebitAmount, 0), totCr = je.lines.reduce((s, l) => s + l.CreditAmount, 0);
    assert(near(totDr, totCr), `JE should balance overall (${totDr} vs ${totCr})`);
  });

  await test('O2 multi-company order → ONE JE PER COMPANY, each single-company + balanced (MOD-11)', async () => {
    const orderId = await createOrder([
      { productId: pImmA, qty: 1, price: 300 },
      { productId: pImmB, qty: 3, price: 50 },
    ]);
    const { saved, order } = await confirmOrder(orderId);
    assert(saved, 'confirm should succeed');
    assert(!order.JournalEntryID, 'multi-company order: JournalEntryID stays NULL (lineage via JE.OrderID)');
    assert(!!order.ConfirmedAt, 'ConfirmedAt is the order-level booked marker');
    const jes = await readOrderJEs(orderId);
    assert(jes.length === 2, `expected 2 JEs (one per company), got ${jes.length}`);
    const jeA = jes.find(j => j.CompanyID === coA.id.toUpperCase());
    const jeB = jes.find(j => j.CompanyID === coB.id.toUpperCase());
    assert(!!jeA && !!jeB, 'one JE per company, CompanyID stamped (MOD-12)');
    const a = await readJE(jeA!.ID);
    const b = await readJE(jeB!.ID);
    assert(near(debitFor(a.lines, coA.arGL), 300) && near(creditFor(a.lines, coA.revGL), 300), 'Co A JE: Dr AR 300 = Cr Sales 300');
    assert(near(debitFor(b.lines, coB.arGL), 150) && near(creditFor(b.lines, coB.revGL), 150), 'Co B JE: Dr AR 150 = Cr Sales 150');
    // single-company purity: no cross-company accounts inside either JE
    assert(near(debitFor(a.lines, coB.arGL), 0) && near(creditFor(a.lines, coB.revGL), 0), 'Co A JE contains no Co B lines');
    assert(near(debitFor(b.lines, coA.arGL), 0) && near(creditFor(b.lines, coA.revGL), 0), 'Co B JE contains no Co A lines');
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

  await test('O5 idempotency — re-saving a booked order books no second JE (order-level guard, F1)', async () => {
    const orderId = await createOrder([{ productId: pImmA, qty: 1, price: 75 }]);
    const first = await confirmOrder(orderId);
    assert(first.saved && !!first.order.JournalEntryID, 'first confirm books a JE');
    assert(!!first.order.ConfirmedAt, 'ConfirmedAt stamped on first booking');
    // F1: a booked order is Posted; re-setting Status='Confirmed' would be an ILLEGAL backward move
    // (transition gate). Idempotency = a plain RE-SAVE of the booked order books nothing new.
    const reload = await new Metadata().GetEntityObject<mjBizAppsOrdersOrderEntity>(ORDER_ENTITY, user);
    await reload.Load(orderId);
    assert(reload.Status === 'Posted', `booked order should be persisted Posted, got ${reload.Status}`);
    const resaved = await reload.Save();
    assert(resaved, 're-save of a booked order should succeed (no-op, no re-book)');
    assert(reload.JournalEntryID === first.order.JournalEntryID, 'JournalEntryID unchanged');
    assert(reload.Status === 'Posted', 'order stays Posted after re-save');
    const count = (await pool.request().query(`SELECT COUNT(*) n FROM ${ACC_SCHEMA}.JournalEntry WHERE OrderID='${orderId}'`)).recordset[0].n;
    assert(Number(count) === 1, `exactly one JE should exist for the order, got ${count}`);
  });

  await test('O6 per-company numbering — booked JEs carry JE-{CompanyCode}-{FY}-{seq} (A4.4)', async () => {
    const orderId = await createOrder([
      { productId: pImmA, qty: 1, price: 10 },
      { productId: pImmB, qty: 1, price: 20 },
    ]);
    const { saved } = await confirmOrder(orderId);
    assert(saved, 'confirm should succeed');
    const jes = await readOrderJEs(orderId);
    assert(jes.length === 2, `expected 2 JEs, got ${jes.length}`);
    const re = /^JE-[A-Z0-9_-]{2,20}-\d{4}-\d{6}$/;
    for (const je of jes) {
      assert(re.test(je.EntryNumber), `EntryNumber '${je.EntryNumber}' does not match JE-{CompanyCode}-{FY}-{seq}`);
    }
    const codes = new Set(jes.map(j => j.EntryNumber.split('-')[1]));
    assert(codes.size === 2, `the two companies' entries should carry DIFFERENT company codes, got ${[...codes].join(',')}`);
  });

  await test('O7 defensive assert — pre-existing JEs for an UNBOOKED order REFUSE the confirm (no double-book, F1.2b)', async () => {
    // F1.2b retired the any-JE-exists ADOPTION guard: with the order row + JE set now committing in
    // ONE transaction, a booked-but-unposted order can no longer occur. If JEs somehow pre-exist for
    // an unbooked order, the confirm REFUSES (rather than silently adopting) so an operator
    // reconciles — proven for BOTH entry points (direct save AND the op).
    const orderId = await createOrder([{ productId: pImmA, qty: 1, price: 55 }]);
    await OrdersEngine.Instance.Config(false, user);
    const order0 = await new Metadata().GetEntityObject<mjBizAppsOrdersOrderEntity>(ORDER_ENTITY, user);
    await order0.Load(orderId);
    const lines0 = (await new RunView().RunView<mjBizAppsOrdersOrderLineEntity>(
      { EntityName: ORDER_LINE_ENTITY, ExtraFilter: `OrderID='${orderId}'`, ResultType: 'entity_object' }, user)).Results ?? [];
    const built = OrdersEngine.Instance.buildDraftsForOrder(order0, lines0);
    assert(!!built.Drafts && built.Drafts.length === 1, 'fixture draft build failed');
    const preOp = await new CreateJournalEntriesOperation().Execute({ Drafts: built.Drafts! }, { user });
    const preId = preOp.Output?.Results?.[0]?.JournalEntryID;
    assert(!!preId, `fixture pre-booking failed: ${JSON.stringify(preOp.Output?.Errors)}`);
    createdJEIds.push(preId!);
    // Direct-save path REFUSES.
    const direct = await confirmOrder(orderId);
    assert(!direct.saved, 'direct-save confirm must REFUSE when JEs pre-exist (defensive assert, not adoption)');
    // Op path REFUSES too.
    const viaOp = await confirmOrderViaOp(orderId);
    assert(!viaOp.result.Success, 'op confirm must REFUSE when JEs pre-exist (defensive assert)');
    const count = (await pool.request().query(`SELECT COUNT(*) n FROM ${ACC_SCHEMA}.JournalEntry WHERE OrderID='${orderId}'`)).recordset[0].n;
    assert(Number(count) === 1, `exactly ONE (the pre-existing) JE must remain — no double-book, got ${count}`);
    const dbStatus = (await pool.request().query(`SELECT Status FROM ${ORD_SCHEMA}.[Order] WHERE ID='${orderId}'`)).recordset[0];
    assert(dbStatus.Status !== 'Posted', `order must NOT be Posted after a refused confirm, got ${dbStatus.Status}`);
  });

  await test('O8 ConfirmOrder op — books atomically: order → Posted + one JE in a single unit of work', async () => {
    const orderId = await createOrder([{ productId: pImmA, qty: 3, price: 100 }]);
    const { result, order } = await confirmOrderViaOp(orderId);
    assert(result.Success, `op confirm should succeed: ${JSON.stringify(result.Errors)}`);
    assert(result.Status === 'Posted', `op result Status should be Posted, got ${result.Status}`);
    assert((result.JournalEntryIDs ?? []).length === 1, `single-company order → one JE ID, got ${(result.JournalEntryIDs ?? []).length}`);
    assert(order.Status === 'Posted', `order should be PERSISTED Posted, got ${order.Status}`);
    assert(!!order.ConfirmedAt, 'ConfirmedAt stamped');
    assert(order.JournalEntryID?.toUpperCase() === result.JournalEntryIDs![0].toUpperCase(), 'order.JournalEntryID matches the booked JE (single-company)');
    const je = await readJE(order.JournalEntryID!);
    assert(near(debitFor(je.lines, coA.arGL), 300) && near(creditFor(je.lines, coA.revGL), 300), 'Dr AR 300 = Cr Sales 300');
    assert(je.header.Status === 'Pending', 'booked JE is Pending in the subledger');
  });

  await test('O9 ConfirmOrder op — JE failure rolls back the order row (unresolvable account → nothing written)', async () => {
    const orderId = await createOrder([{ productId: pUnlinked, qty: 1, price: 99 }]);
    const { result } = await confirmOrderViaOp(orderId);
    assert(!result.Success, 'op confirm must fail on an unresolvable account');
    const db = (await pool.request().query(`SELECT Status, JournalEntryID, ConfirmedAt FROM ${ORD_SCHEMA}.[Order] WHERE ID='${orderId}'`)).recordset[0];
    assert(db.Status !== 'Posted' && db.Status !== 'Confirmed', `order must NOT advance, got ${db.Status}`);
    assert(db.JournalEntryID == null && db.ConfirmedAt == null, 'order must stay unbooked (no JournalEntryID / ConfirmedAt)');
    const count = (await pool.request().query(`SELECT COUNT(*) n FROM ${ACC_SCHEMA}.JournalEntry WHERE OrderID='${orderId}'`)).recordset[0].n;
    assert(Number(count) === 0, `no JE may exist after a failed confirm, got ${count}`);
  });

  await test('O10 ConfirmOrder op — order-row failure ROLLS BACK the JEs (one transaction, both directions)', async () => {
    // The crux of F1.2b: the order row + JE set are ONE unit of work. Force the ORDER ROW update to
    // fail at commit while the JEs are valid+queued (a temp trigger THROWs when this order flips to
    // Posted). If the unit of work is truly atomic, the queued JEs MUST roll back with it → ZERO JEs.
    const orderId = await createOrder([{ productId: pImmA, qty: 1, price: 42 }]);
    const trg = `trg_test_f12b_${seq++}`;
    await teardownPool.request().query(
      `CREATE TRIGGER ${ORD_SCHEMA}.${trg} ON ${ORD_SCHEMA}.[Order] AFTER UPDATE AS BEGIN ` +
        `IF EXISTS (SELECT 1 FROM inserted WHERE ID='${orderId}' AND Status='Posted') ` +
        `THROW 50999, 'test-forced order-row failure (F1.2b O10)', 1; END`
    );
    // ⚠ MJ-CORE BUG GUARD (instance BUGS.md): a failed TransactionGroup makes each queued entity's
    // rxjs subscriber re-throw on a fresh tick → uncaughtException. The rollback + typed result are
    // CORRECT; only the out-of-band re-throw is broken. Swallow exactly that error for this test.
    const swallowTGCrash = (e: Error): void => {
      if (/Transaction rolled back due to operation failure/.test(e?.message ?? '')) return; // known MJ-core bug
      throw e;
    };
    process.on('uncaughtException', swallowTGCrash);
    let confirmSucceeded = false;
    try {
      const { result } = await confirmOrderViaOp(orderId);
      confirmSucceeded = result.Success;
      await new Promise(res => setTimeout(res, 100)); // let the deferred rxjs re-throw fire under the guard
      assert(!confirmSucceeded, 'confirm must NOT succeed when the order-row commit fails');
      const db = (await pool.request().query(`SELECT Status, ConfirmedAt, JournalEntryID FROM ${ORD_SCHEMA}.[Order] WHERE ID='${orderId}'`)).recordset[0];
      assert(db.Status !== 'Posted', `the order-row change must have rolled back, got ${db.Status}`);
      assert(db.ConfirmedAt == null && db.JournalEntryID == null, 'ConfirmedAt / JournalEntryID must not persist after rollback');
      const count = (await pool.request().query(`SELECT COUNT(*) n FROM ${ACC_SCHEMA}.JournalEntry WHERE OrderID='${orderId}'`)).recordset[0].n;
      assert(Number(count) === 0, `the JEs must roll back WITH the failed order row (ZERO JEs) — proves one transaction, got ${count}`);
    } finally {
      await teardownPool.request().query(`DROP TRIGGER ${ORD_SCHEMA}.${trg}`);
      process.removeListener('uncaughtException', swallowTGCrash);
    }
  });

  // ─── F1 lifecycle: transition gate · customer rule · totals · DueDate · fulfillment auto-advance ───
  await test('L1 transition gate — a backward move (Quoted → Draft) is REJECTED; Draft → Quoted is legal', async () => {
    const orderId = await createOrder([{ productId: pImmA, qty: 1, price: 10 }]);
    const toQuoted = await new Metadata().GetEntityObject<mjBizAppsOrdersOrderEntity>(ORDER_ENTITY, user);
    await toQuoted.Load(orderId); toQuoted.Status = 'Quoted';
    assert(await toQuoted.Save(), 'Draft → Quoted must be legal');
    const back = await new Metadata().GetEntityObject<mjBizAppsOrdersOrderEntity>(ORDER_ENTITY, user);
    await back.Load(orderId); back.Status = 'Draft';
    assert(!(await back.Save()), 'Quoted → Draft (backward) must be rejected by the transition gate');
    const db = (await pool.request().query(`SELECT Status FROM ${ORD_SCHEMA}.[Order] WHERE ID='${orderId}'`)).recordset[0];
    assert(db.Status === 'Quoted', `order should remain Quoted, got ${db.Status}`);
  });

  await test('L2 customer rule — confirming an order with NO customer is BLOCKED (no JE, not Posted)', async () => {
    const md = new Metadata();
    const order = await md.GetEntityObject<mjBizAppsOrdersOrderEntity>(ORDER_ENTITY, user);
    order.NewRecord(); order.OrderNumber = uid(); order.OrderDate = new Date(); order.Status = 'Draft';
    assert(await order.Save(), 'draft with no customer saves');
    createdOrderIds.push(order.ID);
    const line = await md.GetEntityObject<mjBizAppsOrdersOrderLineEntity>(ORDER_LINE_ENTITY, user);
    line.NewRecord(); line.OrderID = order.ID; line.ProductID = pImmA; line.LineNumber = 1; line.Quantity = 1; line.UnitPrice = 50;
    assert(await line.Save(), 'line saves');
    const conf = await md.GetEntityObject<mjBizAppsOrdersOrderEntity>(ORDER_ENTITY, user);
    await conf.Load(order.ID); conf.Status = 'Confirmed';
    assert(!(await conf.Save()), 'confirm without a CustomerOrganizationID must be blocked');
    const db = (await pool.request().query(`SELECT Status FROM ${ORD_SCHEMA}.[Order] WHERE ID='${order.ID}'`)).recordset[0];
    assert(db.Status !== 'Posted' && db.Status !== 'Fulfilled', `blocked order must not advance, got ${db.Status}`);
    const count = (await pool.request().query(`SELECT COUNT(*) n FROM ${ACC_SCHEMA}.JournalEntry WHERE OrderID='${order.ID}'`)).recordset[0].n;
    assert(Number(count) === 0, `no JE for a customer-blocked confirm, got ${count}`);
  });

  await test('L3 totals — a discounted line materializes LineTotalNet/Gross + Order TotalGross/Balance/PaymentStatus', async () => {
    const orderId = await createOrder([{ productId: pImmA, qty: 2, price: 100, discount: 0.1 }]); // net 180
    // Re-save the order (Draft) to trigger the order-level totals recompute over its lines.
    const o = await new Metadata().GetEntityObject<mjBizAppsOrdersOrderEntity>(ORDER_ENTITY, user);
    await o.Load(orderId); assert(await o.Save(), 'draft re-save recomputes totals');
    const line = (await pool.request().query(`SELECT LineTotalNet, LineTotalGross FROM ${ORD_SCHEMA}.OrderLine WHERE OrderID='${orderId}'`)).recordset[0];
    assert(near(Number(line.LineTotalNet), 180), `LineTotalNet should be 180 (2×100×0.9), got ${line.LineTotalNet}`);
    assert(near(Number(line.LineTotalGross), 180), `LineTotalGross should be 180 (tax 0), got ${line.LineTotalGross}`);
    const ord = (await pool.request().query(`SELECT TotalGross, Balance, PaymentStatus FROM ${ORD_SCHEMA}.[Order] WHERE ID='${orderId}'`)).recordset[0];
    assert(near(Number(ord.TotalGross), 180), `Order.TotalGross should be 180, got ${ord.TotalGross}`);
    assert(near(Number(ord.Balance), 180), `Order.Balance should be 180 (nothing paid), got ${ord.Balance}`);
    assert(ord.PaymentStatus === 'Unpaid', `PaymentStatus should be Unpaid, got ${ord.PaymentStatus}`);
  });

  await test('L4 DueDate — derived at Confirm from PaymentTermsType.NetDays (base + net days)', async () => {
    const terms = (await new RunView().RunView<{ ID: string; NetDays: number }>(
      { EntityName: 'MJ_BizApps_Orders: Payment Terms Types', ExtraFilter: 'NetDays > 0', Fields: ['ID', 'NetDays'], OrderBy: 'NetDays ASC', ResultType: 'simple' }, user)).Results?.[0];
    assert(!!terms, 'a seeded PaymentTermsType with NetDays>0 must exist');
    const orderDate = new Date('2026-07-01T00:00:00.000Z');
    const md = new Metadata();
    const order = await md.GetEntityObject<mjBizAppsOrdersOrderEntity>(ORDER_ENTITY, user);
    order.NewRecord(); order.OrderNumber = uid(); order.OrderDate = orderDate; order.Status = 'Draft';
    order.CustomerOrganizationID = CUSTOMER_ORG_ID; order.PaymentTermsTypeID = terms!.ID;
    assert(await order.Save(), 'draft saves'); createdOrderIds.push(order.ID);
    const l = await md.GetEntityObject<mjBizAppsOrdersOrderLineEntity>(ORDER_LINE_ENTITY, user);
    l.NewRecord(); l.OrderID = order.ID; l.ProductID = pImmA; l.LineNumber = 1; l.Quantity = 1; l.UnitPrice = 100;
    assert(await l.Save(), 'line saves');
    const { saved, order: booked } = await confirmOrder(order.ID);
    assert(saved, 'confirm should succeed');
    assert(!!booked.DueDate, 'DueDate should be derived');
    // base is PostedAt (≈ now) per the plan; assert the delta from base equals NetDays (date-only).
    const due = new Date(booked.DueDate!); const base = new Date(booked.PostedAt ?? orderDate);
    const deltaDays = Math.round((Date.UTC(due.getUTCFullYear(), due.getUTCMonth(), due.getUTCDate()) - Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate())) / 86400000);
    assert(deltaDays === terms!.NetDays, `DueDate should be base + ${terms!.NetDays}d, got Δ${deltaDays}d`);
  });

  await test('L5 fulfillment — a NO-fulfillment order auto-advances Posted → Fulfilled (no extra JE, MOD-8)', async () => {
    const noFulfillType = await createProductType(false);
    const pNoFulfill = await createLinkedProduct(noFulfillType, coA, 'Immediate');
    const orderId = await createOrder([{ productId: pNoFulfill, qty: 1, price: 60 }]);
    const { saved, order } = await confirmOrder(orderId);
    assert(saved, 'confirm should succeed');
    assert(order.Status === 'Fulfilled', `no-fulfillment order should auto-advance to Fulfilled, got ${order.Status}`);
    const db = (await pool.request().query(`SELECT Status FROM ${ORD_SCHEMA}.[Order] WHERE ID='${orderId}'`)).recordset[0];
    assert(db.Status === 'Fulfilled', `persisted status should be Fulfilled, got ${db.Status}`);
    const count = (await pool.request().query(`SELECT COUNT(*) n FROM ${ACC_SCHEMA}.JournalEntry WHERE OrderID='${orderId}'`)).recordset[0].n;
    assert(Number(count) === 1, `fulfillment adds NO JE — exactly the one booking JE, got ${count}`);
  });

  // ─── F2 reversals: reversal order books the mirror JE; partial-reversal stacking; over-reversal rejected ───
  await test('R1 reversal order — books the MIRROR JE (Cr AR / Dr revenue); the pair NETS TO ZERO', async () => {
    const srcId = await createOrder([{ productId: pImmA, qty: 2, price: 100 }]); // 200
    const src = await confirmOrder(srcId);
    assert(src.saved && !!src.order.JournalEntryID, 'source order books');
    const rev = await new ReversalOrderOperation().Execute({ SourceOrderID: srcId, OrderType: 'Return' }, { user });
    const revOrderId = rev.Output?.ReversalOrderID;
    assert(rev.Output?.Success && !!revOrderId, `reversal creation should succeed: ${JSON.stringify(rev.Output?.Errors)}`);
    createdOrderIds.push(revOrderId!);
    const revConf = await confirmOrder(revOrderId!);
    assert(revConf.saved, 'reversal order confirms + books');
    const revJEs = await readOrderJEs(revOrderId!);
    assert(revJEs.length === 1, `reversal should book exactly 1 JE, got ${revJEs.length}`);
    const revJE = await readJE(revJEs[0].ID);
    assert(near(creditFor(revJE.lines, coA.arGL), 200), `reversal Cr AR should be 200, got ${creditFor(revJE.lines, coA.arGL)}`);
    assert(near(debitFor(revJE.lines, coA.revGL), 200), `reversal Dr Sales should be 200, got ${debitFor(revJE.lines, coA.revGL)}`);
    const orig = await readJE(src.order.JournalEntryID!);
    const netAR = (debitFor(orig.lines, coA.arGL) - creditFor(orig.lines, coA.arGL)) + (debitFor(revJE.lines, coA.arGL) - creditFor(revJE.lines, coA.arGL));
    const netRev = (debitFor(orig.lines, coA.revGL) - creditFor(orig.lines, coA.revGL)) + (debitFor(revJE.lines, coA.revGL) - creditFor(revJE.lines, coA.revGL));
    assert(near(netAR, 0) && near(netRev, 0), `the original + reversal must net to ZERO per account (AR ${netAR}, Rev ${netRev})`);
  });

  await test('R2 partial reversal — stacks to the remainder; over-reversal is REJECTED', async () => {
    const srcId = await createOrder([{ productId: pImmA, qty: 5, price: 10 }]);
    assert((await confirmOrder(srcId)).saved, 'source order books');
    const srcLine = (await pool.request().query(`SELECT ID FROM ${ORD_SCHEMA}.OrderLine WHERE OrderID='${srcId}'`)).recordset[0].ID as string;
    const r1 = await new ReversalOrderOperation().Execute({ SourceOrderID: srcId, LineSlices: [{ SourceOrderLineID: srcLine, Quantity: 2 }] }, { user });
    assert(r1.Output?.Success, `partial reversal of 2 should succeed: ${JSON.stringify(r1.Output?.Errors)}`);
    createdOrderIds.push(r1.Output!.ReversalOrderID!);
    const over = await new ReversalOrderOperation().Execute({ SourceOrderID: srcId, LineSlices: [{ SourceOrderLineID: srcLine, Quantity: 4 }] }, { user });
    assert(!over.Output?.Success, 'over-reversal (4 > remaining 3) must be rejected');
    const r3 = await new ReversalOrderOperation().Execute({ SourceOrderID: srcId, LineSlices: [{ SourceOrderLineID: srcLine, Quantity: 3 }] }, { user });
    assert(r3.Output?.Success, `reversing the remaining 3 should succeed: ${JSON.stringify(r3.Output?.Errors)}`);
    createdOrderIds.push(r3.Output!.ReversalOrderID!);
  });

  await test('R3 reversal guard — an UNBOOKED (Draft) order cannot be reversed', async () => {
    const draftId = await createOrder([{ productId: pImmA, qty: 1, price: 10 }]); // never confirmed
    const rev = await new ReversalOrderOperation().Execute({ SourceOrderID: draftId, OrderType: 'Return' }, { user });
    assert(!rev.Output?.Success, 'reversing an unbooked order must be rejected');
  });

  // ─── F3 payments: capture → Cash/AR JE (customer-tagged) · provider stub · cash application · refund ───
  const newPayment = async (over: Partial<{ Amount: number; Method: mjBizAppsOrdersPaymentEntity['Method']; Status: mjBizAppsOrdersPaymentEntity['Status']; ProviderID: string }>): Promise<mjBizAppsOrdersPaymentEntity> => {
    const p = await new Metadata().GetEntityObject<mjBizAppsOrdersPaymentEntity>(PAYMENT_ENTITY, user);
    p.NewRecord();
    p.PaymentNumber = uid(); p.ReceivingCompanyID = coA.id; p.CustomerOrganizationID = CUSTOMER_ORG_ID;
    p.PaymentDate = new Date(); p.Method = over.Method ?? 'Cash'; p.Amount = over.Amount ?? 100; p.Status = over.Status ?? 'Captured';
    if (over.ProviderID) p.PaymentProviderID = over.ProviderID;
    return p;
  };

  await test('P1 payment capture (Manual) — Dr Cash / Cr A/R, customer-tagged, balanced, EntryType PaymentReceipt', async () => {
    const p = await newPayment({ Amount: 200, Method: 'Cash', Status: 'Captured' });
    assert(await p.Save(), `payment capture/book failed: ${p.LatestResult?.CompleteMessage}`);
    createdPaymentIds.push(p.ID);
    assert(!!p.JournalEntryID, 'capture should stamp JournalEntryID');
    createdJEIds.push(p.JournalEntryID!);
    const je = await readJE(p.JournalEntryID!);
    assert(near(debitFor(je.lines, coA.cashGL), 200), `Dr Cash 200, got ${debitFor(je.lines, coA.cashGL)}`);
    assert(near(creditFor(je.lines, coA.arGL), 200), `Cr AR 200, got ${creditFor(je.lines, coA.arGL)}`);
    assert(je.header.EntryType === 'PaymentReceipt', `EntryType PaymentReceipt, got ${je.header.EntryType}`);
    const arCp = (await pool.request().query(`SELECT TOP 1 CounterpartyOrganizationID cp FROM ${ACC_SCHEMA}.JournalEntryLine WHERE JournalEntryID='${p.JournalEntryID}' AND GLAccountID='${coA.arGL}'`)).recordset[0];
    assert((arCp?.cp ?? '').toUpperCase() === CUSTOMER_ORG_ID.toUpperCase(), `AR line must be tagged with the customer, got ${arCp?.cp}`);
  });

  await test('P2 CapturePaymentOperation (Stripe STUB) — captures, books, stamps a stub ProviderChargeID', async () => {
    const prov = await new Metadata().GetEntityObject<mjBizAppsOrdersPaymentProviderEntity>(PAYMENT_PROVIDER_ENTITY, user);
    prov.NewRecord(); prov.ProviderType = 'Stripe'; prov.CompanyID = coA.id; prov.Name = uid(); prov.IsActive = true;
    assert(await prov.Save(), `provider save failed: ${prov.LatestResult?.CompleteMessage}`);
    createdProviderIds.push(prov.ID);
    const p = await newPayment({ Amount: 150, Method: 'CreditCard', Status: 'Pending', ProviderID: prov.ID });
    assert(await p.Save(), 'pending payment saves');
    createdPaymentIds.push(p.ID);
    const cap = await new CapturePaymentOperation().Execute({ PaymentID: p.ID }, { user });
    assert(cap.Output?.Success, `capture should succeed: ${JSON.stringify(cap.Output?.Errors)}`);
    assert((cap.Output?.ProviderChargeID ?? '').startsWith('stub_ch_'), `Stripe stub charge id expected, got ${cap.Output?.ProviderChargeID}`);
    assert(!!cap.Output?.JournalEntryID, 'capture books a JE');
    createdJEIds.push(cap.Output!.JournalEntryID!);
  });

  await test('P3 cash application — Order AmountPaid/Balance/PaymentStatus maintained; over-application REJECTED', async () => {
    const orderId = await createOrder([{ productId: pImmA, qty: 1, price: 100 }]);
    assert((await confirmOrder(orderId)).saved, 'order books');
    const p = await newPayment({ Amount: 100, Method: 'Cash', Status: 'Captured' });
    assert(await p.Save(), 'payment books'); createdPaymentIds.push(p.ID);
    if (p.JournalEntryID) createdJEIds.push(p.JournalEntryID);
    const pl = await new Metadata().GetEntityObject<mjBizAppsOrdersPaymentLineEntity>(PAYMENT_LINE_ENTITY, user);
    pl.NewRecord(); pl.PaymentID = p.ID; pl.OrderID = orderId; pl.Amount = 100;
    assert(await pl.Save(), `application failed: ${pl.LatestResult?.CompleteMessage}`); createdPaymentLineIds.push(pl.ID);
    const ord = (await pool.request().query(`SELECT AmountPaid, Balance, PaymentStatus FROM ${ORD_SCHEMA}.[Order] WHERE ID='${orderId}'`)).recordset[0];
    assert(near(Number(ord.AmountPaid), 100), `AmountPaid 100, got ${ord.AmountPaid}`);
    assert(near(Number(ord.Balance), 0), `Balance 0, got ${ord.Balance}`);
    assert(ord.PaymentStatus === 'Paid', `PaymentStatus Paid, got ${ord.PaymentStatus}`);
    const pl2 = await new Metadata().GetEntityObject<mjBizAppsOrdersPaymentLineEntity>(PAYMENT_LINE_ENTITY, user);
    pl2.NewRecord(); pl2.PaymentID = p.ID; pl2.OrderID = orderId; pl2.Amount = 50;
    assert(!(await pl2.Save()), 'over-application (100+50 > payment 100) must be rejected');
  });

  await test('P4 refund payment (negative amount) — books the MIRROR JE (Cr Cash / Dr A/R), EntryType Refund', async () => {
    const p = await newPayment({ Amount: -80, Method: 'Refund', Status: 'Captured' });
    assert(await p.Save(), `refund book failed: ${p.LatestResult?.CompleteMessage}`); createdPaymentIds.push(p.ID);
    assert(!!p.JournalEntryID, 'refund books a JE'); createdJEIds.push(p.JournalEntryID!);
    const je = await readJE(p.JournalEntryID!);
    assert(near(creditFor(je.lines, coA.cashGL), 80), `Cr Cash 80, got ${creditFor(je.lines, coA.cashGL)}`);
    assert(near(debitFor(je.lines, coA.arGL), 80), `Dr AR 80, got ${debitFor(je.lines, coA.arGL)}`);
    assert(je.header.EntryType === 'Refund', `EntryType Refund, got ${je.header.EntryType}`);
  });

  // ─── F4 rev-rec bridge: deferred line → CreateRevRecSchedule → dated DefRev→Revenue releases → materialize ───
  await test('F4 rev-rec bridge — a deferred ServicePeriod line schedules 12 dated releases; materialize fires the due ones', async () => {
    const md = new Metadata();
    // Deferred + ServicePeriod product, linked to BOTH Deferred Revenue (booking) and Sales (release).
    const prod = await md.GetEntityObject<mjBizAppsOrdersProductEntity>(PRODUCT_ENTITY, user);
    prod.NewRecord(); prod.Name = uid(); prod.ProductTypeID = typeId; prod.RevenueRecognitionType = 'Deferred'; prod.DeferredRecognitionShape = 'ServicePeriod';
    assert(await prod.Save(), `deferred product save failed: ${prod.LatestResult?.CompleteMessage}`); createdProductIds.push(prod.ID);
    await createLink(productsEntityId, prod.ID, 'Deferred Revenue', coA.defRevGL);
    await createLink(productsEntityId, prod.ID, 'Sales', coA.revGL);
    // Order + line with a 1-year service window (12 monthly anniversaries), total 1200.
    const order = await md.GetEntityObject<mjBizAppsOrdersOrderEntity>(ORDER_ENTITY, user);
    order.NewRecord(); order.OrderNumber = uid(); order.OrderDate = new Date(); order.Status = 'Draft'; order.CustomerOrganizationID = CUSTOMER_ORG_ID;
    assert(await order.Save(), 'order saves'); createdOrderIds.push(order.ID);
    const line = await md.GetEntityObject<mjBizAppsOrdersOrderLineEntity>(ORDER_LINE_ENTITY, user);
    line.NewRecord(); line.OrderID = order.ID; line.ProductID = prod.ID; line.LineNumber = 1; line.Quantity = 1; line.UnitPrice = 1200;
    line.ServicePeriodStart = new Date('2026-01-01T00:00:00.000Z'); line.ServicePeriodEnd = new Date('2026-12-31T00:00:00.000Z');
    assert(await line.Save(), 'line saves');
    const conf = await confirmOrder(order.ID);
    assert(conf.saved, 'deferred order books (Dr AR / Cr DefRev)');
    // Bridge: build the release schedule.
    const sched = await new CreateRevRecScheduleOperation().Execute({ OrderLineID: line.ID }, { user });
    assert(sched.Output?.Success && sched.Output?.Scheduled, `rev-rec schedule should be created: ${JSON.stringify(sched.Output?.Errors)}`);
    const sjeIds = sched.Output!.ScheduledEntryIDs ?? [];
    createdSJEIds.push(...sjeIds);
    assert(sjeIds.length === 12, `expected 12 monthly releases, got ${sjeIds.length}`);
    const sum = (await pool.request().query(`SELECT SUM(TotalAmount) s FROM ${ACC_SCHEMA}.ScheduledJournalEntry WHERE ID IN (${sjeIds.map(i => `'${i}'`).join(',')})`)).recordset[0].s;
    assert(near(Number(sum), 1200), `the 12 releases must sum to 1200, got ${sum}`);
    // Each release is Dr DefRev / Cr Sales (revenue earned).
    const firstLines = (await pool.request().query(`SELECT li.GLAccountID, li.DebitAmount, li.CreditAmount FROM ${ACC_SCHEMA}.ScheduledJournalEntryLineItem li WHERE li.ScheduledJournalEntryID='${sjeIds[0]}'`)).recordset;
    assert(firstLines.some(l => (l.GLAccountID as string).toUpperCase() === coA.defRevGL.toUpperCase() && Number(l.DebitAmount) > 0), 'release debits Deferred Revenue');
    assert(firstLines.some(l => (l.GLAccountID as string).toUpperCase() === coA.revGL.toUpperCase() && Number(l.CreditAmount) > 0), 'release credits Sales/Revenue');
    // Materialize through Mar 15 → the Jan/Feb/Mar releases become Pending JEs (3 of 12).
    const mat = await new MaterializeScheduledEntriesOperation().Execute({ AsOf: '2026-03-15T00:00:00.000Z' }, { user });
    // (other tests' SJEs may exist; assert AT LEAST our 3 fired by checking our schedule's Generated count)
    const gen = (await pool.request().query(`SELECT COUNT(*) n FROM ${ACC_SCHEMA}.ScheduledJournalEntry WHERE ID IN (${sjeIds.map(i => `'${i}'`).join(',')}) AND Status='Generated'`)).recordset[0].n;
    assert(Number(gen) === 3, `Jan/Feb/Mar (3) of our releases should materialize, got ${gen}`);
    for (const r of (mat.Output?.JournalEntryIDs ?? [])) if (!createdJEIds.includes(r)) createdJEIds.push(r);
  });

  // ─── F7 entitlement grants: booking a product with entitlements issues Active grants (customer beneficiary) ───
  await test('E1 entitlement grants — issues an Active grant per product entitlement, beneficiary = customer; idempotent', async () => {
    const md = new Metadata();
    const prod = await md.GetEntityObject<mjBizAppsOrdersProductEntity>(PRODUCT_ENTITY, user);
    prod.NewRecord(); prod.Name = uid(); prod.ProductTypeID = typeId; prod.RevenueRecognitionType = 'Immediate';
    assert(await prod.Save(), 'entitlement product saves'); createdProductIds.push(prod.ID);
    await createLink(productsEntityId, prod.ID, 'Sales', coA.revGL);
    // Two active entitlements + one inactive (must be ignored).
    for (const [type, active] of [['Feature', true], ['ResourceQuantity', true], ['AccessLevel', false]] as const) {
      const ent = await md.GetEntityObject<mjBizAppsOrdersProductEntitlementEntity>(PRODUCT_ENTITLEMENT_ENTITY, user);
      ent.NewRecord(); ent.ProductID = prod.ID; ent.EntitlementType = type; ent.Code = `${uid()}`; ent.Quantity = type === 'ResourceQuantity' ? 5 : null; ent.IsActive = active;
      assert(await ent.Save(), `entitlement (${type}) saves`); createdEntitlementIds.push(ent.ID);
    }
    const orderId = await createOrder([{ productId: prod.ID, qty: 1, price: 50 }]);
    assert((await confirmOrder(orderId)).saved, 'order books');
    const lineId = (await pool.request().query(`SELECT ID FROM ${ORD_SCHEMA}.OrderLine WHERE OrderID='${orderId}'`)).recordset[0].ID as string;
    const res = await new GrantEntitlementsOperation().Execute({ OrderLineID: lineId }, { user });
    assert(res.Output?.Success, `grant should succeed: ${JSON.stringify(res.Output?.Errors)}`);
    const ids = res.Output!.GrantIDs ?? []; createdGrantIds.push(...ids);
    assert(ids.length === 2, `expected 2 grants (the active entitlements), got ${ids.length}`);
    const rows = (await pool.request().query(`SELECT Status, BeneficiaryOrganizationID FROM ${ORD_SCHEMA}.EntitlementGrant WHERE OrderLineID='${lineId}'`)).recordset;
    assert(rows.every(r => r.Status === 'Active'), 'grants are Active');
    assert(rows.every(r => (r.BeneficiaryOrganizationID ?? '').toUpperCase() === CUSTOMER_ORG_ID.toUpperCase()), 'beneficiary defaults to the order customer');
    const again = await new GrantEntitlementsOperation().Execute({ OrderLineID: lineId }, { user });
    assert(again.Output?.Success && !!again.Output?.Skipped, 're-granting is a no-op (idempotent)');
    const count = (await pool.request().query(`SELECT COUNT(*) n FROM ${ORD_SCHEMA}.EntitlementGrant WHERE OrderLineID='${lineId}'`)).recordset[0].n;
    assert(Number(count) === 2, `still exactly 2 grants after re-run, got ${count}`);
  });

  await teardown();
  const failed = outcomes.filter(o => !o.Passed);
  console.log(`\n────── Order→JE integration: ${outcomes.length - failed.length}/${outcomes.length} passed ──────`);
  if (failed.length) for (const f of failed) console.log(`   ✗ ${f.Name}: ${(f.Error ?? '').split('\n')[0]}`);
  process.exit(failed.length > 0 ? 1 : 0);
}

async function teardown(): Promise<void> {
  const exec = async (q: string) => { try { await teardownPool.request().query(q); } catch (e) { console.log(`      teardown warn: ${(e instanceof Error ? e.message : String(e)).split('\n')[0]}`); } };
  // Scheduled JEs (F4) FIRST — their GeneratedJournalEntryID FKs the materialized JE, so they must
  // be deleted BEFORE the JEs. Lock triggers block deletes; disable them.
  const sjeList = createdSJEIds.map(id => `'${id}'`).join(',');
  if (sjeList) {
    const sjeTriggers = ['ScheduledJournalEntryLineItem', 'ScheduledJournalEntry'];
    try {
      for (const t of sjeTriggers) await exec(`DISABLE TRIGGER ALL ON ${ACC_SCHEMA}.${t}`);
      await exec(`DELETE FROM ${ACC_SCHEMA}.ScheduledJournalEntryLineItem WHERE ScheduledJournalEntryID IN (${sjeList})`);
      await exec(`DELETE FROM ${ACC_SCHEMA}.ScheduledJournalEntry WHERE ID IN (${sjeList})`);
    } finally {
      for (const t of sjeTriggers) await exec(`ENABLE TRIGGER ALL ON ${ACC_SCHEMA}.${t}`);
    }
  }
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
  // Payments (F3): the capture-freeze trigger blocks deletes; disable it. PaymentLine FKs Order+Payment.
  const payTriggers = ['PaymentLine', 'Payment'];
  try {
    for (const t of payTriggers) await exec(`DISABLE TRIGGER ALL ON ${ORD_SCHEMA}.[${t}]`);
    if (createdPaymentLineIds.length) await exec(`DELETE FROM ${ORD_SCHEMA}.PaymentLine WHERE ID IN (${createdPaymentLineIds.map(id => `'${id}'`).join(',')})`);
    if (createdPaymentIds.length) await exec(`DELETE FROM ${ORD_SCHEMA}.Payment WHERE ID IN (${createdPaymentIds.map(id => `'${id}'`).join(',')})`);
  } finally {
    for (const t of payTriggers) await exec(`ENABLE TRIGGER ALL ON ${ORD_SCHEMA}.[${t}]`);
  }
  if (createdProviderIds.length) await exec(`DELETE FROM ${ORD_SCHEMA}.PaymentProvider WHERE ID IN (${createdProviderIds.map(id => `'${id}'`).join(',')})`);
  // Entitlements (F7): grants FK OrderLine (delete before orders); entitlements FK Product (before products).
  if (createdGrantIds.length) await exec(`DELETE FROM ${ORD_SCHEMA}.EntitlementGrant WHERE ID IN (${createdGrantIds.map(id => `'${id}'`).join(',')})`);
  if (createdEntitlementIds.length) await exec(`DELETE FROM ${ORD_SCHEMA}.ProductEntitlement WHERE ID IN (${createdEntitlementIds.map(id => `'${id}'`).join(',')})`);
  const orderList = createdOrderIds.map(id => `'${id}'`).join(',');
  if (orderList) {
    // Posted/Confirmed orders freeze their lines (delete-block trigger) — disable it for teardown,
    // same as the JE triggers above.
    const ordTriggers = ['OrderLine', 'Order'];
    try {
      for (const t of ordTriggers) await exec(`DISABLE TRIGGER ALL ON ${ORD_SCHEMA}.[${t}]`);
      await exec(`DELETE FROM ${ORD_SCHEMA}.OrderLine WHERE OrderID IN (${orderList})`);
      await exec(`DELETE FROM ${ORD_SCHEMA}.[Order] WHERE ID IN (${orderList})`);
    } finally {
      for (const t of ordTriggers) await exec(`ENABLE TRIGGER ALL ON ${ORD_SCHEMA}.[${t}]`);
    }
  }
  if (createdLinkIds.length) await exec(`DELETE FROM ${ACC_SCHEMA}.GLAccountLink WHERE ID IN (${createdLinkIds.map(id => `'${id}'`).join(',')})`);
  if (createdProductIds.length) await exec(`DELETE FROM ${ORD_SCHEMA}.Product WHERE ID IN (${createdProductIds.map(id => `'${id}'`).join(',')})`);
  if (createdTypeIds.length) await exec(`DELETE FROM ${ORD_SCHEMA}.ProductType WHERE ID IN (${createdTypeIds.map(id => `'${id}'`).join(',')})`);
  for (const co of companies) {
    await exec(`DELETE FROM ${ACC_SCHEMA}.AccountingCompanyProfile WHERE ID='${co.id}'`);
    await exec(`DELETE FROM ${ACC_SCHEMA}.GLAccount WHERE CompanyID='${co.id}'`);
    await exec(`DELETE FROM __mj_BizAppsAccounting.JournalEntrySequence WHERE CompanyID='${co.id}'`); // per-company JE sequence rows (MOD-12)
    await exec(`DELETE FROM __mj.Company WHERE ID='${co.id}'`);
  }
  if (CUSTOMER_ORG_ID) await exec(`DELETE FROM __mj_BizAppsCommon.Organization WHERE ID='${CUSTOMER_ORG_ID}'`);
}

void main();
