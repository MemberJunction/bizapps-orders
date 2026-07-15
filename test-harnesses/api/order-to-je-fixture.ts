/**
 * order-to-je-fixture — in-process catalog/company provisioning for the Tier-3 GraphQL harness
 * (`order-to-je-api.ts`).
 *
 * WHY A FIXTURE (mirrors accounting's `playwright/lib/batching-fixture.ts`): a functional company is
 * an `AccountingCompanyProfile` — an IsA Disjoint child of `__mj.Company` whose chart of accounts is
 * seeded by an entity-server AfterSave hook. Its GraphQL Create input exposes NO `Name` field (Name
 * lives on the parent Company row), so a company cannot be reliably stood up over pure GraphQL. This
 * fixture provisions the prerequisite catalog the SAME proven in-process way `server/order-to-je.ts`
 * does (BaseEntity + a direct SQL pool), then the API harness does the actual order→confirm→JE flow
 * purely over the GraphQL wire. This keeps the tier-3 assertions on the wire while the un-wireable
 * prerequisite stays in-process — exactly the accounting api/ split.
 *
 * Provisions (all tagged with a run tag so teardown is deterministic):
 *   coA, coB          — two AccountingCompanyProfiles (each seeds GL 11201 AR / 40100 Sales / 21301 Deferred Rev)
 *   one Product Type
 *   immA (Immediate, revenue link → coA Sales), defA (Deferred, → coA Deferred Rev),
 *   immB (Immediate, → coB Sales), unlinkedA (Immediate, NO revenue link → unresolvable)
 *   company-level AR links for coA + coB (Accounts Receivable → each company's 11201)
 *
 * Modes (run from the INSTANCE WORKTREE ROOT so `.env` resolves):
 *   npx tsx .../api/order-to-je-fixture.ts setup                      → prints one `FIXTURE_JSON {…}` line
 *   npx tsx .../api/order-to-je-fixture.ts teardown <runTag> <coA> <coB>
 *
 * Teardown is keyed on the run tag (the API harness numbers its orders `<runTag>-*`), so it also
 * removes the orders + Pending JEs the API harness booked — Tier 2 asserts ZERO stray Pending JEs at
 * bootstrap, so leaving debris would break the next run. Never pipe through `head` (SIGPIPE).
 */
import * as dotenv from 'dotenv';
import sql from 'mssql';
import path from 'node:path';
import { Metadata, RunView, UserInfo } from '@memberjunction/core';
import { setupSQLServerClient, SQLServerProviderConfigData, UserCache } from '@memberjunction/sqlserver-dataprovider';
import '@memberjunction/server-bootstrap-lite';
import '@mj-biz-apps/common-entities';
import type { mjBizAppsCommonOrganizationEntity } from '@mj-biz-apps/common-entities';
import '@mj-biz-apps/accounting-entities';
import '@mj-biz-apps/accounting-core-entities-server';
import '@mj-biz-apps/orders-entities';
import '@mj-biz-apps/orders-core-entities-server';
import type {
  mjBizAppsAccountingAccountingCompanyProfileEntity,
  mjBizAppsAccountingGLAccountLinkEntity,
} from '@mj-biz-apps/accounting-entities';
import type {
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
const ORGANIZATION_ENTITY = 'MJ_BizApps_Common: Organizations';
const COMPANIES_ENTITY = 'MJ: Companies';

/** Recognition-type union derived from the entity (rule 2c) — never hand-copied. */
type Recognition = mjBizAppsOrdersProductEntity['RevenueRecognitionType'];

/** The shape emitted on stdout as `FIXTURE_JSON {…}` and consumed by the API harness. */
export interface OrderFixture {
  runTag: string;
  coA: CompanyGL;
  coB: CompanyGL;
  products: { immA: string; defA: string; immB: string; unlinkedA: string };
  /** A real bizapps-common Organization — the order customer + the AR-line CounterpartyOrganizationID FK. */
  customerOrgId: string;
}
interface CompanyGL {
  id: string;
  arGL: string;
  revGL: string;
  defRevGL: string;
}

let pool: sql.ConnectionPool;
let teardownPool: sql.ConnectionPool;
let user: UserInfo;
const roleByName = new Map<string, string>();
let productsEntityId = '';
let companiesEntityId = '';
let companyCounter = 0;

/** Connect (read/write pool + a db_owner teardown pool for trigger toggling) + resolve the context user. */
async function connect(): Promise<void> {
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
  const u = UserCache.Users.find((x) => x?.Type?.trim().toLowerCase() === 'owner') ?? UserCache.Users[0];
  if (!u) throw new Error('No context user found.');
  user = u;
}

/** Load the metadata + role lookups the setup path needs. */
async function loadLookups(): Promise<void> {
  const md = new Metadata();
  productsEntityId = md.EntityByName(PRODUCT_ENTITY)?.ID ?? '';
  companiesEntityId = md.EntityByName(COMPANIES_ENTITY)?.ID ?? '';
  if (!productsEntityId || !companiesEntityId) throw new Error('Products / Companies entity IDs not resolved.');
  const rv = new RunView();
  const roles = await rv.RunView<{ ID: string; Name: string }>({ EntityName: ROLE_ENTITY, Fields: ['ID', 'Name'], ResultType: 'simple' }, user);
  for (const r of roles.Results ?? []) roleByName.set(r.Name, r.ID);
}

/** Create one AccountingCompanyProfile + read back its seeded AR / Sales / Deferred-Rev GL accounts. */
async function createCompany(runTag: string, currencyCode: string): Promise<CompanyGL> {
  const md = new Metadata();
  const rv = new RunView();
  const acp = await md.GetEntityObject<mjBizAppsAccountingAccountingCompanyProfileEntity>(ACP_ENTITY, user);
  acp.NewRecord();
  acp.Name = `${runTag} Co${companyCounter}`;
  acp.Description = `${runTag} order-to-je-api fixture`;
  acp.CompanyCode = `O2JA${companyCounter++}${Date.now().toString(36).slice(-5)}`.toUpperCase();
  acp.FunctionalCurrencyCode = currencyCode;
  acp.EntityType = 'Subsidiary';
  const id = acp.ID;
  if (!(await acp.Save())) throw new Error(`ACP save failed: ${acp.LatestResult?.CompleteMessage ?? 'unknown'}`);
  const glRes = await rv.RunView<{ ID: string; Code: string }>(
    { EntityName: GL_ENTITY, ExtraFilter: `CompanyID='${id}'`, Fields: ['ID', 'Code'], ResultType: 'simple' }, user);
  const byCode = new Map((glRes.Results ?? []).map((r) => [r.Code, r.ID]));
  const arGL = byCode.get('11201'), revGL = byCode.get('40100'), defRevGL = byCode.get('21301');
  if (!arGL || !revGL || !defRevGL) throw new Error('seeded GL accounts (11201/40100/21301) not found');
  return { id, arGL, revGL, defRevGL };
}

/** Create a polymorphic GLAccountLink (product-revenue or company-AR). */
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
  if (!(await link.Save())) throw new Error(`link save failed: ${link.LatestResult?.CompleteMessage ?? 'unknown'}`);
}

async function createProductType(runTag: string): Promise<string> {
  const md = new Metadata();
  const pt = await md.GetEntityObject<mjBizAppsOrdersProductTypeEntity>(PRODUCT_TYPE_ENTITY, user);
  pt.NewRecord();
  pt.Name = `${runTag}-PT`;
  pt.RequiresFulfillment = true; // F1: hold booked orders at Posted (fulfillment covered elsewhere)
  if (!(await pt.Save())) throw new Error(`product type save failed: ${pt.LatestResult?.CompleteMessage ?? 'unknown'}`);
  return pt.ID;
}

/** Create a product; when `link`, also create its revenue GLAccountLink (Sales or Deferred Revenue). */
async function createLinkedProduct(
  runTag: string, seq: number, typeId: string, company: CompanyGL, recognition: Recognition, link = true
): Promise<string> {
  const md = new Metadata();
  const p = await md.GetEntityObject<mjBizAppsOrdersProductEntity>(PRODUCT_ENTITY, user);
  p.NewRecord();
  p.Name = `${runTag}-P${seq}`;
  p.ProductTypeID = typeId;
  p.RevenueRecognitionType = recognition;
  const id = p.ID;
  if (!(await p.Save())) throw new Error(`product save failed: ${p.LatestResult?.CompleteMessage ?? 'unknown'}`);
  if (link) {
    const role = recognition === 'Deferred' ? 'Deferred Revenue' : 'Sales';
    const gl = recognition === 'Deferred' ? company.defRevGL : company.revGL;
    await createLink(productsEntityId, id, role, gl);
  }
  return id;
}

async function setup(): Promise<void> {
  await connect();
  await loadLookups();
  const runTag = `ORD2JEAPI-${Date.now()}`;
  const rv = new RunView();
  const currencyCode = (await rv.RunView<{ Code: string }>(
    { EntityName: CURRENCY_ENTITY, Fields: ['Code'], MaxRows: 1, ResultType: 'simple' }, user)).Results?.[0]?.Code;
  if (!currencyCode) throw new Error('no currency resolved');
  const coA = await createCompany(runTag, currencyCode);
  const coB = await createCompany(runTag, currencyCode);
  const typeId = await createProductType(runTag);
  const immA = await createLinkedProduct(runTag, 0, typeId, coA, 'Immediate');
  const defA = await createLinkedProduct(runTag, 1, typeId, coA, 'Deferred');
  const immB = await createLinkedProduct(runTag, 2, typeId, coB, 'Immediate');
  const unlinkedA = await createLinkedProduct(runTag, 3, typeId, coA, 'Immediate', false);
  await createLink(companiesEntityId, coA.id, 'Accounts Receivable', coA.arGL);
  await createLink(companiesEntityId, coB.id, 'Accounts Receivable', coB.arGL);
  // A real customer Organization — the order customer (F1 gate) + AR-line CounterpartyOrganizationID FK (F3).
  const customerOrg = await new Metadata().GetEntityObject<mjBizAppsCommonOrganizationEntity>(ORGANIZATION_ENTITY, user);
  customerOrg.NewRecord();
  customerOrg.Name = `${runTag}-Customer`;
  if (!(await customerOrg.Save())) throw new Error(`customer org save failed: ${customerOrg.LatestResult?.CompleteMessage ?? 'unknown'}`);
  const fixture: OrderFixture = { runTag, coA, coB, products: { immA, defA, immB, unlinkedA }, customerOrgId: customerOrg.ID };
  console.log(`FIXTURE_JSON ${JSON.stringify(fixture)}`);
}

/** Teardown: remove everything the fixture AND the API harness created, keyed on the run tag + companies. */
async function teardown(runTag: string, coAId: string, coBId: string): Promise<void> {
  await connect();
  const exec = async (q: string) => {
    try { await teardownPool.request().query(q); }
    catch (e) { console.log(`  teardown warn: ${(e instanceof Error ? e.message : String(e)).split('\n')[0]}`); }
  };
  const tag = runTag.replace(/'/g, "''");
  const orderScope = `SELECT ID FROM ${ORD_SCHEMA}.[Order] WHERE OrderNumber LIKE '${tag}%'`;
  const toggled = ['JournalEntryLine', 'JournalEntry'];
  try {
    for (const t of toggled) await exec(`DISABLE TRIGGER ALL ON ${ACC_SCHEMA}.${t}`);
    await exec(`DELETE d FROM ${ACC_SCHEMA}.JournalEntryLineDimension d JOIN ${ACC_SCHEMA}.JournalEntryLine l ON l.ID=d.JournalEntryLineID WHERE l.JournalEntryID IN (SELECT ID FROM ${ACC_SCHEMA}.JournalEntry WHERE OrderID IN (${orderScope}))`);
    await exec(`DELETE FROM ${ACC_SCHEMA}.JournalEntryLine WHERE JournalEntryID IN (SELECT ID FROM ${ACC_SCHEMA}.JournalEntry WHERE OrderID IN (${orderScope}))`);
    await exec(`DELETE FROM ${ACC_SCHEMA}.JournalEntry WHERE OrderID IN (${orderScope})`);
  } finally {
    for (const t of toggled) await exec(`ENABLE TRIGGER ALL ON ${ACC_SCHEMA}.${t}`);
  }
  // F1: Posted orders freeze their lines (delete-block trigger) — disable it for teardown.
  const ordTriggers = ['OrderLine', 'Order'];
  try {
    for (const t of ordTriggers) await exec(`DISABLE TRIGGER ALL ON ${ORD_SCHEMA}.[${t}]`);
    await exec(`DELETE FROM ${ORD_SCHEMA}.OrderLine WHERE OrderID IN (${orderScope})`);
    await exec(`DELETE FROM ${ORD_SCHEMA}.[Order] WHERE OrderNumber LIKE '${tag}%'`);
  } finally {
    for (const t of ordTriggers) await exec(`ENABLE TRIGGER ALL ON ${ORD_SCHEMA}.[${t}]`);
  }
  await exec(`DELETE FROM ${ACC_SCHEMA}.GLAccountLink WHERE RecordID IN (SELECT ID FROM ${ORD_SCHEMA}.Product WHERE Name LIKE '${tag}%') OR RecordID IN ('${coAId}','${coBId}')`);
  await exec(`DELETE FROM ${ORD_SCHEMA}.Product WHERE Name LIKE '${tag}%'`);
  await exec(`DELETE FROM ${ORD_SCHEMA}.ProductType WHERE Name LIKE '${tag}%'`);
  for (const coId of [coAId, coBId]) {
    await exec(`DELETE FROM ${ACC_SCHEMA}.AccountingCompanyProfile WHERE ID='${coId}'`);
    await exec(`DELETE FROM ${ACC_SCHEMA}.GLAccount WHERE CompanyID='${coId}'`);
    await exec(`DELETE FROM __mj.Company WHERE ID='${coId}'`);
  }
  await exec(`DELETE FROM __mj_BizAppsCommon.Organization WHERE Name LIKE '${tag}%'`);
}

async function main(): Promise<void> {
  const [mode, ...rest] = process.argv.slice(2);
  if (mode === 'setup') {
    await setup();
  } else if (mode === 'teardown') {
    const [runTag, coAId, coBId] = rest;
    if (!runTag || !coAId || !coBId) throw new Error('teardown requires <runTag> <coAId> <coBId>');
    await teardown(runTag, coAId, coBId);
  } else {
    throw new Error(`unknown mode '${mode ?? ''}' — use 'setup' or 'teardown <runTag> <coA> <coB>'`);
  }
  process.exit(0);
}

void main().catch((e) => { console.error('FIXTURE ERROR:', e instanceof Error ? (e.stack ?? e.message) : String(e)); process.exit(2); });
