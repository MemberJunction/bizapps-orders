/**
 * _maint-clear-cross-app-links.ts — MAINTENANCE: delete cross-app link rows that point at
 * __mj_BizAppsOrders entities, via the MJ entity layer (audited, permission-checked).
 *
 * Why: `mjdev app drop-schema` deletes the orders rows in __mj.Entity, but OTHER apps hold
 * hard FKs into __mj.Entity — accounting's GLAccountLink.EntityID / JournalEntryLink.EntityID —
 * so demo rows pointing at orders entities block the drop with an FK conflict. This script
 * clears exactly those rows (they are regenerable demo data: GL mappings reseed with the demo
 * catalog; JE lineage links die with their demo JEs). Run BEFORE each drop-schema in the
 * collapse-into-baseline dev loop (schema action plan, 2026-07-14). Also filed as an mjdev
 * tool gap in ~/MJDev/MJDEV-ISSUES.md (drop-schema cleanup doesn't know other apps' FKs).
 *
 * Run from the instance worktree root:
 *   npx tsx packages/dev-apps/bizapps-orders/test-harnesses/server/_maint-clear-cross-app-links.ts
 */
import sql from 'mssql';
import dotenv from 'dotenv';
import path from 'path';
import { BaseEntity, Metadata, RunView } from '@memberjunction/core';
import { setupSQLServerClient, SQLServerProviderConfigData, UserCache } from '@memberjunction/sqlserver-dataprovider';
import '@memberjunction/server-bootstrap-lite';
import '@mj-biz-apps/common-entities';
import '@mj-biz-apps/orders-entities';
import '@mj-biz-apps/accounting-entities';
import '@mj-biz-apps/accounting-core-entities-server';

const ORDERS_SCHEMA = '__mj_BizAppsOrders';
const LINK_ENTITIES = [
  'MJ_BizApps_Accounting: GL Account Links',
  'MJ_BizApps_Accounting: Journal Entry Links',
];

async function main(): Promise<void> {
  dotenv.config({ path: path.resolve(process.cwd(), '.env'), quiet: true });
  const pool = await new sql.ConnectionPool({
    server: process.env.DB_HOST, port: Number(process.env.DB_PORT ?? 1433),
    user: process.env.DB_USERNAME, password: process.env.DB_PASSWORD, database: process.env.DB_DATABASE,
    options: { encrypt: false, trustServerCertificate: true },
  }).connect();
  await setupSQLServerClient(new SQLServerProviderConfigData(pool, process.env.MJ_CORE_SCHEMA || '__mj'));
  await UserCache.Instance.Refresh(pool);
  const user = UserCache.Users.find(u => u?.Type?.trim().toLowerCase() === 'owner') ?? UserCache.Users[0];
  if (!user) throw new Error('no context user');

  const md = new Metadata();
  const ordersEntityIDs = md.Entities.filter(e => e.SchemaName === ORDERS_SCHEMA).map(e => e.ID);
  if (ordersEntityIDs.length === 0) { console.log(`No ${ORDERS_SCHEMA} entities registered — nothing to clear.`); await pool.close(); process.exit(0); }
  const inList = ordersEntityIDs.map(id => `'${id}'`).join(',');

  let failures = 0;
  for (const entityName of LINK_ENTITIES) {
    const rows = await new RunView().RunView<{ ID: string }>(
      { EntityName: entityName, ExtraFilter: `EntityID IN (${inList})`, Fields: ['ID'], ResultType: 'simple', BypassCache: true }, user);
    const ids = (rows.Results ?? []).map(r => r.ID);
    console.log(`${entityName}: ${ids.length} row(s) pointing at ${ORDERS_SCHEMA} entities`);
    for (const id of ids) {
      const rec: BaseEntity = await md.GetEntityObject(entityName, user);
      await rec.Load(id);
      const ok = await rec.Delete();
      if (!ok) { failures++; console.error(`  FAILED to delete ${id}: ${rec.LatestResult?.CompleteMessage ?? 'unknown'}`); }
      else console.log(`  deleted ${id}`);
    }
  }
  await pool.close();
  process.exit(failures === 0 ? 0 : 1);
}
main().catch(e => { console.error(e); process.exit(1); });
