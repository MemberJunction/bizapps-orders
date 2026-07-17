/**
 * _maint-purge-test-categories.ts — MAINTENANCE: delete ProductCategory rows created by UI
 * verification runs, via the MJ entity layer (audited, permission-checked — never raw DELETE).
 *
 * Why this exists: verifying a create screen means actually creating something. A UI write test is
 * only honest if it drives the real button and then proves the row landed — which leaves real rows
 * behind. Rather than leave them (Marcelo, on the harness junk already in the catalog: "we need to
 * clean up that testing data and make sure our harnesses are cleaning that up so we're not just
 * filling in a bunch of gunk"), the run that creates them owns removing them.
 *
 * Matches on the NAME PREFIX only, so it can never touch real data. Categories are a tree, so
 * children are re-parented to the deleted node's parent before the delete — orphaning them would
 * hide them from the tree (the page surfaces orphans, but that is a safety net, not a plan).
 *
 * Run from the instance worktree root:
 *   npx tsx packages/dev-apps/bizapps-orders/test-harnesses/server/_maint-purge-test-categories.ts
 *
 * Exit codes: 0 pass · 1 a delete failed · 2 bootstrap failure.
 */
import sql from 'mssql';
import dotenv from 'dotenv';
import path from 'path';
import { Metadata, RunView } from '@memberjunction/core';
import { setupSQLServerClient, SQLServerProviderConfigData, UserCache } from '@memberjunction/sqlserver-dataprovider';
import '@memberjunction/server-bootstrap-lite';
import '@mj-biz-apps/common-entities';
import '@mj-biz-apps/orders-entities';
import type { mjBizAppsOrdersProductCategoryEntity } from '@mj-biz-apps/orders-entities';

const CATEGORY_ENTITY = 'MJ_BizApps_Orders: Product Categories';
/** The one and only thing this script will delete. Anything not starting with this is untouchable. */
const TEST_NAME_PREFIX = 'AGENT WRITE TEST';

interface CategoryRow {
  ID: string;
  Name: string;
  ParentID: string | null;
}

async function main(): Promise<void> {
  dotenv.config({ path: path.resolve(process.cwd(), '.env'), quiet: true });
  const pool = await new sql.ConnectionPool({
    server: process.env.DB_HOST,
    port: Number(process.env.DB_PORT ?? 1433),
    user: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_DATABASE,
    options: { encrypt: false, trustServerCertificate: true },
  }).connect();
  await setupSQLServerClient(new SQLServerProviderConfigData(pool, process.env.MJ_CORE_SCHEMA || '__mj'));
  await UserCache.Instance.Refresh(pool);
  const user = UserCache.Users.find((u) => u?.Type?.trim().toLowerCase() === 'owner') ?? UserCache.Users[0];
  if (!user) throw new Error('no context user');

  const md = new Metadata();

  // BypassCache: this reads state a UI session just wrote, and a stale cached read here would make
  // the purge silently no-op — the same class of staleness the write test exposed.
  const all = await new RunView().RunView<CategoryRow>(
    { EntityName: CATEGORY_ENTITY, Fields: ['ID', 'Name', 'ParentID'], ResultType: 'simple', BypassCache: true },
    user,
  );
  if (!all.Success) throw new Error(all.ErrorMessage ?? 'could not read categories');

  const rows = all.Results ?? [];
  const doomed = rows.filter((r) => r.Name?.startsWith(TEST_NAME_PREFIX));
  const doomedIDs = new Set(doomed.map((r) => r.ID.toLowerCase()));
  console.log(`${rows.length} categor(ies) total; ${doomed.length} match "${TEST_NAME_PREFIX}".`);
  if (doomed.length === 0) {
    await finish(0);
    return;
  }

  let failures = 0;

  // Re-parent any survivor whose parent is about to disappear, so nothing is orphaned.
  for (const r of rows) {
    if (doomedIDs.has(r.ID.toLowerCase())) continue;
    if (!r.ParentID || !doomedIDs.has(r.ParentID.toLowerCase())) continue;
    const dyingParent = doomed.find((d) => d.ID.toLowerCase() === r.ParentID!.toLowerCase());
    const child = await md.GetEntityObject<mjBizAppsOrdersProductCategoryEntity>(CATEGORY_ENTITY, user);
    if (!(await child.Load(r.ID))) {
      failures++;
      console.error(`  FAILED to load child ${r.ID}`);
      continue;
    }
    child.ParentID = dyingParent?.ParentID ?? null;
    if (!(await child.Save())) {
      failures++;
      console.error(`  FAILED to re-parent ${r.Name}: ${child.LatestResult?.CompleteMessage ?? 'unknown'}`);
    } else {
      console.log(`  re-parented "${r.Name}" off a deleted parent`);
    }
  }

  for (const d of doomed) {
    const rec = await md.GetEntityObject<mjBizAppsOrdersProductCategoryEntity>(CATEGORY_ENTITY, user);
    if (!(await rec.Load(d.ID))) {
      failures++;
      console.error(`  FAILED to load ${d.ID}`);
      continue;
    }
    // Delete() returns false on a logical failure — it does not throw.
    if (!(await rec.Delete())) {
      failures++;
      console.error(`  FAILED to delete "${d.Name}": ${rec.LatestResult?.CompleteMessage ?? 'unknown'}`);
    } else {
      console.log(`  deleted "${d.Name}" (${d.ID})`);
    }
  }

  await finish(failures === 0 ? 0 : 1);

  /** Never `await pool.close()` — the provider pool's close() can hang so the process never exits. */
  async function finish(code: number): Promise<void> {
    console.log(code === 0 ? 'PURGE OK' : `PURGE FAILED (${failures} error(s))`);
    process.exit(code);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
