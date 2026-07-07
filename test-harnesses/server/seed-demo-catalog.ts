/**
 * seed-demo-catalog — persistent demo data so the Orders Console is testable in Explorer.
 *
 * Creates (idempotent — skips if the demo company already exists): one accounting company (whose W1
 * hook seeds the starter chart of accounts), a product type, three products (two Immediate, one
 * Deferred), their revenue GLAccountLinks (Sales / Deferred Revenue), and the company's AR default
 * link. After this, open Explorer → Orders → Orders Console, pick a product, and Confirm & Book.
 *
 * Run from the instance worktree root:
 *   npx tsx packages/dev-apps/bizapps-orders/test-harnesses/server/seed-demo-catalog.ts
 *
 * This is DEMO data (not a test) — it deliberately does NOT tear down. Delete via the company's
 * AccountingCompanyProfile + its GLAccounts + the products/links if you want a clean slate.
 */
import * as dotenv from 'dotenv';
import sql from 'mssql';
import path from 'path';
import { Metadata, RunView, UserInfo } from '@memberjunction/core';
import { setupSQLServerClient, SQLServerProviderConfigData, UserCache } from '@memberjunction/sqlserver-dataprovider';
import '@memberjunction/server-bootstrap-lite';
import '@mj-biz-apps/common-entities';
import '@mj-biz-apps/accounting-entities';
// Registers AccountingCompanyProfileEntityServer — its W1 Save hook seeds the starter chart of
// accounts (AR 11201 / Sales 40100 / Deferred Revenue 21301) when a new company profile is saved.
import '@mj-biz-apps/accounting-core-entities-server';
import '@mj-biz-apps/orders-entities';
import type {
  mjBizAppsAccountingAccountingCompanyProfileEntity,
  mjBizAppsAccountingGLAccountLinkEntity,
} from '@mj-biz-apps/accounting-entities';
import type {
  mjBizAppsOrdersProductEntity,
  mjBizAppsOrdersProductTypeEntity,
} from '@mj-biz-apps/orders-entities';

const ACP_ENTITY = 'MJ_BizApps_Accounting: Accounting Company Profiles';
const GL_ENTITY = 'MJ_BizApps_Accounting: GL Accounts';
const LINK_ENTITY = 'MJ_BizApps_Accounting: GL Account Links';
const ROLE_ENTITY = 'MJ_BizApps_Accounting: GL Account Roles';
const CURRENCY_ENTITY = 'MJ_BizApps_Accounting: Currencies';
const PRODUCT_TYPE_ENTITY = 'MJ_BizApps_Orders: Product Types';
const PRODUCT_ENTITY = 'MJ_BizApps_Orders: Products';
const COMPANIES_ENTITY = 'MJ: Companies';

const DEMO_COMPANY = 'Demo Company (Orders)';
const DEMO_TYPE = 'General (Demo)';

let user: UserInfo;
const roleByName = new Map<string, string>();

async function main(): Promise<void> {
  dotenv.config({ path: path.resolve(process.cwd(), '.env'), quiet: true });
  const { DB_HOST: host, DB_DATABASE: database, DB_USERNAME: dbUser, DB_PASSWORD: password } = process.env;
  if (!host || !database || !dbUser || !password) throw new Error('Missing DB settings in .env (run from the instance worktree root).');
  const pool = await new sql.ConnectionPool({
    server: host, port: Number(process.env.DB_PORT ?? 1433), user: dbUser, password, database,
    options: { encrypt: false, trustServerCertificate: true },
  }).connect();
  await setupSQLServerClient(new SQLServerProviderConfigData(pool, process.env.MJ_CORE_SCHEMA || '__mj'));
  await UserCache.Instance.Refresh(pool);
  user = UserCache.Users.find(u => u?.Type?.trim().toLowerCase() === 'owner') ?? UserCache.Users[0];
  if (!user) throw new Error('No context user found.');

  const rv = new RunView();
  const existing = await rv.RunView<{ ID: string }>(
    { EntityName: PRODUCT_ENTITY, ExtraFilter: `Name LIKE '%(Demo)'`, Fields: ['ID'], ResultType: 'simple' }, user);
  if ((existing.Results ?? []).length > 0) {
    console.log('✓ Demo catalog already present — nothing to seed. Open Explorer → Orders → Orders Console.');
    process.exit(0);
  }
  await cleanupIncompleteDemoCompanies();

  const roles = await rv.RunView<{ ID: string; Name: string }>({ EntityName: ROLE_ENTITY, Fields: ['ID', 'Name'], ResultType: 'simple' }, user);
  for (const r of roles.Results ?? []) roleByName.set(r.Name, r.ID);
  const currency = (await rv.RunView<{ Code: string }>({ EntityName: CURRENCY_ENTITY, Fields: ['Code'], MaxRows: 1, ResultType: 'simple' }, user)).Results?.[0]?.Code;
  if (!currency) throw new Error('no currency found');

  const company = await seedCompany(currency);
  const typeId = await seedProductType();
  const md = new Metadata();
  const companiesEntityId = md.EntityByName(COMPANIES_ENTITY)?.ID ?? '';
  const productsEntityId = md.EntityByName(PRODUCT_ENTITY)?.ID ?? '';

  await seedProduct('Widget (Demo)', typeId, 'Immediate', productsEntityId, company.revGL);
  await seedProduct('Gadget (Demo)', typeId, 'Immediate', productsEntityId, company.revGL);
  await seedProduct('Support Plan (Demo)', typeId, 'Deferred', productsEntityId, company.defRevGL);
  await seedLink(companiesEntityId, company.id, 'Accounts Receivable', company.arGL);

  console.log('\n✅ Seeded demo catalog:');
  console.log(`   Company: ${DEMO_COMPANY} (AR 11201 / Sales 40100 / Deferred Revenue 21301)`);
  console.log('   Products: Widget (Demo), Gadget (Demo) [Immediate], Support Plan (Demo) [Deferred]');
  console.log('   → Open Explorer → Orders → Orders Console, add products, Confirm & Book.\n');
  process.exit(0);
}

/** Remove any prior incomplete demo company (e.g. a run where the COA-seed hook wasn't registered),
 *  via the entity layer (façade-respecting — never raw SQL). */
async function cleanupIncompleteDemoCompanies(): Promise<void> {
  const md = new Metadata();
  const rv = new RunView();
  const found = await rv.RunView<{ ID: string }>(
    { EntityName: ACP_ENTITY, ExtraFilter: `Name='${DEMO_COMPANY}'`, Fields: ['ID'], ResultType: 'simple' }, user);
  for (const row of found.Results ?? []) {
    const acp = await md.GetEntityObject<mjBizAppsAccountingAccountingCompanyProfileEntity>(ACP_ENTITY, user);
    if (await acp.Load(row.ID)) {
      if (await acp.Delete()) console.log(`  cleaned up incomplete demo company profile ${row.ID}`);
      else console.log(`  warn: could not delete demo company profile ${row.ID}: ${acp.LatestResult?.CompleteMessage ?? ''}`);
    }
  }
}

interface Company { id: string; arGL: string; revGL: string; defRevGL: string }

async function seedCompany(currency: string): Promise<Company> {
  const md = new Metadata();
  const acp = await md.GetEntityObject<mjBizAppsAccountingAccountingCompanyProfileEntity>(ACP_ENTITY, user);
  acp.NewRecord();
  acp.Name = DEMO_COMPANY;
  acp.Description = 'Demo selling company for the Orders Console';
  acp.CompanyCode = 'DEMOORD';
  acp.FunctionalCurrencyCode = currency;
  acp.EntityType = 'Subsidiary';
  const id = acp.ID;
  if (!(await acp.Save())) throw new Error(`company save failed: ${acp.LatestResult?.CompleteMessage ?? 'unknown'}`);
  const rv = new RunView();
  const gls = await rv.RunView<{ ID: string; Code: string }>(
    { EntityName: GL_ENTITY, ExtraFilter: `CompanyID='${id}'`, Fields: ['ID', 'Code'], ResultType: 'simple' }, user);
  const byCode = new Map((gls.Results ?? []).map(r => [r.Code, r.ID]));
  const arGL = byCode.get('11201'), revGL = byCode.get('40100'), defRevGL = byCode.get('21301');
  if (!arGL || !revGL || !defRevGL) throw new Error('seeded GL accounts (11201/40100/21301) not found');
  return { id, arGL, revGL, defRevGL };
}

async function seedProductType(): Promise<string> {
  const md = new Metadata();
  const pt = await md.GetEntityObject<mjBizAppsOrdersProductTypeEntity>(PRODUCT_TYPE_ENTITY, user);
  pt.NewRecord();
  pt.Name = DEMO_TYPE;
  const id = pt.ID;
  if (!(await pt.Save())) throw new Error(`product type save failed: ${pt.LatestResult?.CompleteMessage ?? 'unknown'}`);
  return id;
}

async function seedProduct(
  name: string,
  typeId: string,
  recognition: mjBizAppsOrdersProductEntity['RevenueRecognitionType'],
  productsEntityId: string,
  glAccountId: string
): Promise<void> {
  const md = new Metadata();
  const p = await md.GetEntityObject<mjBizAppsOrdersProductEntity>(PRODUCT_ENTITY, user);
  p.NewRecord();
  p.Name = name;
  p.ProductTypeID = typeId;
  p.RevenueRecognitionType = recognition;
  const id = p.ID;
  if (!(await p.Save())) throw new Error(`product save failed (${name}): ${p.LatestResult?.CompleteMessage ?? 'unknown'}`);
  const role = recognition === 'Deferred' ? 'Deferred Revenue' : 'Sales';
  await seedLink(productsEntityId, id, role, glAccountId);
}

async function seedLink(entityId: string, recordId: string, roleName: string, glAccountId: string): Promise<void> {
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

void main();
