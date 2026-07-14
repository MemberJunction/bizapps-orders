/**
 * _maint-set-isa-parents.ts — MAINTENANCE: stamp __mj.Entity.ParentID for the IsA Disjoint
 * extension entities (BO-D37): Event Products ⊂ Products, Event Order Lines ⊂ Order Lines.
 *
 * Why: codegen creates the Entity rows for new tables but does NOT infer IsA parentage from the
 * shared-PK FK — accounting set ACP's ParentID via an explicit UPDATE folded into its baseline,
 * which orders cannot do (its Entity rows are minted by codegen AFTER migrate). Run this after
 * every `mjdev app codegen` in the collapse-into-baseline loop. At codegen-migration recapture
 * the ParentID serializes into the regenerated migration (PR #3004) and this script retires.
 *
 * Run from the instance worktree root:
 *   npx tsx packages/dev-apps/bizapps-orders/test-harnesses/server/_maint-set-isa-parents.ts
 */
import sql from 'mssql';
import dotenv from 'dotenv';
import path from 'path';
import { Metadata } from '@memberjunction/core';
import type { EntityEntity } from '@memberjunction/core-entities';
import { setupSQLServerClient, SQLServerProviderConfigData, UserCache } from '@memberjunction/sqlserver-dataprovider';
import '@memberjunction/server-bootstrap-lite';

const ISA_PAIRS: ReadonlyArray<{ child: string; parent: string }> = [
  { child: 'MJ_BizApps_Orders: Event Products', parent: 'MJ_BizApps_Orders: Products' },
  { child: 'MJ_BizApps_Orders: Event Order Lines', parent: 'MJ_BizApps_Orders: Order Lines' },
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
  // The core "entity of entities" — resolve its NAME from metadata rather than hardcoding.
  const entityEntity = md.Entities.find(e => e.SchemaName === (process.env.MJ_CORE_SCHEMA || '__mj') && e.BaseTable === 'Entity');
  if (!entityEntity) throw new Error('could not resolve the core Entity entity');

  let failures = 0;
  for (const pair of ISA_PAIRS) {
    const child = md.EntityByName(pair.child);
    const parent = md.EntityByName(pair.parent);
    if (!child || !parent) { console.log(`SKIP ${pair.child}: child/parent entity not registered yet`); continue; }
    const rec = await md.GetEntityObject<EntityEntity>(entityEntity.Name, user);
    if (!(await rec.Load(child.ID))) { failures++; console.error(`FAILED to load Entity row ${child.ID}`); continue; }
    if (rec.ParentID && rec.ParentID.toLowerCase() === parent.ID.toLowerCase()) {
      console.log(`OK ${pair.child} already parented to ${pair.parent}`);
      continue;
    }
    rec.ParentID = parent.ID;
    const ok = await rec.Save();
    if (!ok) { failures++; console.error(`FAILED to set ParentID for ${pair.child}: ${rec.LatestResult?.CompleteMessage ?? 'unknown'}`); }
    else console.log(`SET ${pair.child} → ParentID = ${pair.parent} (${parent.ID})`);
  }
  await pool.close();
  process.exit(failures === 0 ? 0 : 1);
}
main().catch(e => { console.error(e); process.exit(1); });
