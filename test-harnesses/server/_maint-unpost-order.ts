/**
 * _maint-unpost-order.ts — TEST FIXTURE: flip ONE Posted order (that has a booked JournalEntryID) back to
 * Confirmed, so it becomes a genuinely "stuck" Confirmed-with-JE order for validating the kanban nudge. The
 * nudge ("Recheck & post") should then advance it back to Posted (self-healing). Run from the instance worktree root:
 *   npx tsx packages/dev-apps/bizapps-orders/test-harnesses/server/_maint-unpost-order.ts
 */
import sql from 'mssql';
import dotenv from 'dotenv';
import path from 'path';
import { Metadata, RunView } from '@memberjunction/core';
import { setupSQLServerClient, SQLServerProviderConfigData, UserCache } from '@memberjunction/sqlserver-dataprovider';
import '@memberjunction/server-bootstrap-lite';
import '@mj-biz-apps/common-entities';
import '@mj-biz-apps/orders-entities';
import '@mj-biz-apps/accounting-entities';
import type { mjBizAppsOrdersOrderEntity } from '@mj-biz-apps/orders-entities';

const ORDER_ENTITY = 'MJ_BizApps_Orders: Orders';

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

  const res = await new RunView().RunView<{ ID: string; OrderNumber: string }>(
    { EntityName: ORDER_ENTITY, ExtraFilter: `Status='Posted' AND JournalEntryID IS NOT NULL`, Fields: ['ID', 'OrderNumber'], OrderBy: '__mj_CreatedAt DESC', MaxRows: 1, ResultType: 'simple', BypassCache: true }, user);
  const pick = (res.Results ?? [])[0];
  if (!pick) { console.log('No Posted order with a JournalEntryID found — nothing to flip.'); await pool.close(); process.exit(0); }

  const order = await new Metadata().GetEntityObject<mjBizAppsOrdersOrderEntity>(ORDER_ENTITY, user);
  await order.Load(pick.ID);
  order.Status = 'Confirmed'; // JournalEntryID stays set → a "stuck" Confirmed-with-JE fixture
  const ok = await order.Save();
  console.log(ok ? `Flipped order ${pick.OrderNumber} → Confirmed (JE kept). Nudge should re-advance it to Posted.`
                 : `FAILED to flip ${pick.OrderNumber}: ${order.LatestResult?.CompleteMessage ?? 'unknown'}`);
  await pool.close();
  process.exit(ok ? 0 : 1);
}
main().catch(e => { console.error(e); process.exit(1); });
