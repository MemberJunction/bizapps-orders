/**
 * order-to-glposted — the full-cycle proof: an order's journal entry travels
 * Confirmed(Pending) → buildBatch(Batched) → approveBatch → sendBatch(GLPosted).
 *
 * Extends order-to-je.ts (which proves order → JE booking) through the accounting batch/dispatch
 * machinery to the terminal GLPosted state, from a real order-originated journal entry. Uses the
 * AutoApproveGate so the proof exercises the JE lifecycle, not the CFO approval workflow (that has
 * its own coverage). Non-destructive to schema; creates one demo order.
 *
 * Run from the instance worktree root:
 *   npx tsx packages/dev-apps/bizapps-orders/test-harnesses/server/order-to-glposted.ts
 */
import * as dotenv from 'dotenv';
import sql from 'mssql';
import path from 'path';
import { Metadata, RunView, UserInfo } from '@memberjunction/core';
import { setupSQLServerClient, SQLServerProviderConfigData, UserCache } from '@memberjunction/sqlserver-dataprovider';
import '@memberjunction/server-bootstrap-lite';
import '@mj-biz-apps/common-entities';
import '@mj-biz-apps/accounting-entities';
import { buildBatch, approveBatch, sendBatch, AutoApproveGate } from '@mj-biz-apps/accounting-core-entities-server';
import '@mj-biz-apps/orders-entities';
import '@mj-biz-apps/orders-core-entities-server';
import type { mjBizAppsOrdersOrderEntity, mjBizAppsOrdersOrderLineEntity } from '@mj-biz-apps/orders-entities';

const ORDER = 'MJ_BizApps_Orders: Orders';
const LINE = 'MJ_BizApps_Orders: Order Lines';
const PRODUCT = 'MJ_BizApps_Orders: Products';
const JE = 'MJ_BizApps_Accounting: Journal Entries';

let user: UserInfo;
let pass = true;

async function main(): Promise<void> {
  dotenv.config({ path: path.resolve(process.cwd(), '.env'), quiet: true });
  const pool = await new sql.ConnectionPool({
    server: process.env.DB_HOST, port: Number(process.env.DB_PORT ?? 1433), user: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD, database: process.env.DB_DATABASE, options: { encrypt: false, trustServerCertificate: true },
  }).connect();
  await setupSQLServerClient(new SQLServerProviderConfigData(pool, process.env.MJ_CORE_SCHEMA || '__mj'));
  await UserCache.Instance.Refresh(pool);
  user = UserCache.Users.find(u => u?.Type?.trim().toLowerCase() === 'owner') ?? UserCache.Users[0];
  if (!user) throw new Error('no context user');

  // 1) order → Confirmed → books the JE
  const jeId = await confirmDemoOrder();
  await check('1. JE booked on Confirm → Pending', jeId, 'Pending');

  // 2) buildBatch → JE Batched
  const built = await buildBatch('BusinessCentral', user.ID, user, AutoApproveGate);
  if (!built) throw new Error('buildBatch returned null (nothing pending?)');
  console.log(`   buildBatch → batch ${built.batchId} (${built.jeCount} entries, ${built.companyCount} co)`);
  await check('2. After buildBatch → Batched', jeId, 'Batched');

  // 3) approve → 4) send → JE GLPosted
  await approveBatch(built.batchId, user.ID, user);
  console.log('   approveBatch → Approved');
  await sendBatch(built.batchId, user, { gate: AutoApproveGate });
  console.log('   sendBatch → Posted (mock ERP)');
  await check('3. After sendBatch → GLPosted', jeId, 'GLPosted');

  console.log(`\n${pass ? '✅ PASS' : '❌ FAIL'} — order → JE → Batched → GLPosted full cycle`);
  process.exit(pass ? 0 : 1);
}

/** Create + confirm one demo order; returns its stamped JournalEntryID. */
async function confirmDemoOrder(): Promise<string> {
  const rv = new RunView();
  const prod = (await rv.RunView<{ ID: string }>(
    { EntityName: PRODUCT, ExtraFilter: `Name LIKE '%(Demo)' AND IsActive=1`, Fields: ['ID'], MaxRows: 1, ResultType: 'simple' }, user)).Results?.[0];
  if (!prod) throw new Error('no demo product — run seed-demo-catalog.ts first');
  const md = new Metadata();
  const o = await md.GetEntityObject<mjBizAppsOrdersOrderEntity>(ORDER, user);
  o.NewRecord();
  o.OrderNumber = `CYCLE-${Date.now().toString().slice(-9)}`;
  o.OrderDate = new Date();
  o.Status = 'Draft';
  o.Description = 'Full-cycle proof order';
  if (!(await o.Save())) throw new Error(`order save failed: ${o.LatestResult?.CompleteMessage ?? '?'}`);
  const line = await md.GetEntityObject<mjBizAppsOrdersOrderLineEntity>(LINE, user);
  line.NewRecord();
  line.OrderID = o.ID; line.ProductID = prod.ID; line.LineNumber = 1; line.Quantity = 1; line.UnitPrice = 125;
  if (!(await line.Save())) throw new Error(`line save failed: ${line.LatestResult?.CompleteMessage ?? '?'}`);
  o.Status = 'Confirmed';
  if (!(await o.Save()) || !o.JournalEntryID) throw new Error(`confirm/book failed: ${o.LatestResult?.CompleteMessage ?? 'no JournalEntryID'}`);
  console.log(`   order ${o.OrderNumber} confirmed → JE ${o.JournalEntryID}`);
  return o.JournalEntryID;
}

async function check(label: string, jeId: string, expected: string): Promise<void> {
  const rv = new RunView();
  const status = (await rv.RunView<{ Status: string }>(
    { EntityName: JE, ExtraFilter: `ID='${jeId}'`, Fields: ['Status'], MaxRows: 1, ResultType: 'simple' }, user)).Results?.[0]?.Status;
  const ok = status === expected;
  if (!ok) pass = false;
  console.log(`   ${ok ? '✓' : '✗'} ${label} (got: ${status})`);
}

void main().catch(e => { console.error('HARNESS ERROR:', e instanceof Error ? e.message : String(e)); process.exit(1); });
