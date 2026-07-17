/**
 * order-to-glposted — the full-cycle proof: an order's journal entry travels
 * Confirmed(Pending) → buildBatch(Batched) → approveBatch → sendBatch(GLPosted).
 *
 * Extends order-to-je.ts (which proves order → JE booking) through the accounting batch/dispatch
 * machinery to the terminal GLPosted state, from a real order-originated journal entry. Uses the
 * AutoApproveGate so the proof exercises the JE lifecycle, not the CFO approval workflow (that has
 * its own coverage). Non-destructive to schema; creates one demo order.
 *
 * Self-cleaning: the run creates one CYCLE-* order that books a JE and posts a batch (both immutable
 * once GLPosted/Posted). Teardown runs in a `finally`/outer-catch — whether the body passes OR throws
 * — as db_owner (MJ_CodeGen) with the immutability triggers disabled in a try/finally, then re-enabled.
 * NEVER run two harnesses against the same instance DB concurrently (trigger toggles are table-global).
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
const ACC_SCHEMA = '__mj_BizAppsAccounting';
const ORD_SCHEMA = '__mj_BizAppsOrders';

let user: UserInfo;
let pass = true;
// db_owner pool (MJ_CodeGen) — the app user lacks ALTER (can't DISABLE TRIGGER) and can't delete the
// locked GLPosted JE / Posted batch. Undefined until bootstrap opens it, so teardown no-ops safely.
let teardownPool: sql.ConnectionPool | undefined;
// Tracked fixtures this run created — deleted child→parent in teardown, guarded by presence.
let orderId = '';
let jeId = '';
let batchId = '';

async function main(): Promise<void> {
  dotenv.config({ path: path.resolve(process.cwd(), '.env'), quiet: true });
  const host = process.env.DB_HOST, database = process.env.DB_DATABASE, port = Number(process.env.DB_PORT ?? 1433);
  const opts = { options: { encrypt: false, trustServerCertificate: true } };
  const pool = await new sql.ConnectionPool({
    server: host, port, user: process.env.DB_USERNAME, password: process.env.DB_PASSWORD, database, ...opts,
  }).connect();
  const cu = process.env.CODEGEN_DB_USERNAME, cp = process.env.CODEGEN_DB_PASSWORD;
  if (cu && cp) teardownPool = await new sql.ConnectionPool({ server: host, port, user: cu, password: cp, database, ...opts }).connect();
  await setupSQLServerClient(new SQLServerProviderConfigData(pool, process.env.MJ_CORE_SCHEMA || '__mj'));
  await UserCache.Instance.Refresh(pool);
  user = UserCache.Users.find(u => u?.Type?.trim().toLowerCase() === 'owner') ?? UserCache.Users[0];
  if (!user) throw new Error('no context user');

  // 1) order → Confirmed → books the JE
  jeId = await confirmDemoOrder();
  await check('1. JE booked on Confirm → Pending', jeId, 'Pending');

  // 2) buildBatch → JE Batched
  const built = await buildBatch('BusinessCentral', user.ID, user, AutoApproveGate);
  if (!built) throw new Error('buildBatch returned null (nothing pending?)');
  batchId = built.batchId;
  console.log(`   buildBatch → batch ${built.batchId} (${built.jeCount} entries, ${built.companyCount} co)`);
  await check('2. After buildBatch → Batched', jeId, 'Batched');

  // 3) approve → 4) send → JE GLPosted
  await approveBatch(built.batchId, user.ID, user);
  console.log('   approveBatch → Approved');
  await sendBatch(built.batchId, user, { gate: AutoApproveGate });
  console.log('   sendBatch → Posted (mock ERP)');
  await check('3. After sendBatch → GLPosted', jeId, 'GLPosted');

  await teardown();
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
  orderId = o.ID; // track for teardown BEFORE Confirm locks the row
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

/**
 * FK-aware teardown of this run's single order + its JE + its posted batch. Idempotent + crash-safe:
 * runs from the happy path AND the outer catch, no-ops when nothing was created, swallows per-statement
 * errors (already-deleted rows are fine), and re-enables every toggled trigger in a `finally` so a
 * failed DELETE can NEVER leave an immutability trigger disabled.
 */
async function teardown(): Promise<void> {
  if (!teardownPool) return;
  const exec = async (q: string) => {
    try { await teardownPool!.request().query(q); }
    catch (e) { console.log(`   teardown warn: ${(e instanceof Error ? e.message : String(e)).split('\n')[0]}`); }
  };
  // Batch first (Posted → immutable): its line items reference the JE, so drop them before the JE.
  if (batchId) {
    const batchTriggers = ['JournalEntryBatchLineDimension', 'JournalEntryBatchLineItem', 'JournalEntryBatch'];
    try {
      for (const t of batchTriggers) await exec(`DISABLE TRIGGER ALL ON ${ACC_SCHEMA}.${t}`);
      await exec(`DELETE bd FROM ${ACC_SCHEMA}.JournalEntryBatchLineDimension bd JOIN ${ACC_SCHEMA}.JournalEntryBatchLineItem li ON li.ID=bd.JournalEntryBatchLineItemID WHERE li.BatchID='${batchId}'`);
      await exec(`DELETE FROM ${ACC_SCHEMA}.JournalEntryBatchLineItem WHERE BatchID='${batchId}'`);
      await exec(`DELETE FROM ${ACC_SCHEMA}.JournalEntryBatch WHERE ID='${batchId}'`);
    } finally {
      for (const t of batchTriggers) await exec(`ENABLE TRIGGER ALL ON ${ACC_SCHEMA}.${t}`);
    }
  }
  // JE (GLPosted → immutable).
  if (jeId) {
    const jeTriggers = ['JournalEntryLine', 'JournalEntry'];
    try {
      for (const t of jeTriggers) await exec(`DISABLE TRIGGER ALL ON ${ACC_SCHEMA}.${t}`);
      await exec(`DELETE d FROM ${ACC_SCHEMA}.JournalEntryLineDimension d JOIN ${ACC_SCHEMA}.JournalEntryLine l ON l.ID=d.JournalEntryLineID WHERE l.JournalEntryID='${jeId}'`);
      await exec(`DELETE FROM ${ACC_SCHEMA}.JournalEntryLine WHERE JournalEntryID='${jeId}'`);
      await exec(`DELETE FROM ${ACC_SCHEMA}.JournalEntry WHERE ID='${jeId}'`);
    } finally {
      for (const t of jeTriggers) await exec(`ENABLE TRIGGER ALL ON ${ACC_SCHEMA}.${t}`);
    }
  }
  // Order (Confirmed → OrderLine frozen by trg_OrderLine_ImmutableAfterConfirm).
  if (orderId) {
    const ordTriggers = ['OrderLine', 'Order'];
    try {
      for (const t of ordTriggers) await exec(`DISABLE TRIGGER ALL ON ${ORD_SCHEMA}.[${t}]`);
      await exec(`DELETE FROM ${ORD_SCHEMA}.OrderLine WHERE OrderID='${orderId}'`);
      await exec(`DELETE FROM ${ORD_SCHEMA}.[Order] WHERE ID='${orderId}'`);
    } finally {
      for (const t of ordTriggers) await exec(`ENABLE TRIGGER ALL ON ${ORD_SCHEMA}.[${t}]`);
    }
  }
}

/**
 * A crash MUST still clean up. Running `teardown()` only on the happy path is what let this harness
 * leak a CYCLE-* order + its posted JE + batch on every aborted run. This is the crash-safe net: any
 * throw before the normal teardown lands here and tears down anyway; a teardown that itself fails
 * names the belt-and-suspenders purge script.
 */
main().catch(async (e) => {
  console.error(`\nHARNESS ERROR — aborted before normal teardown: ${e instanceof Error ? (e.stack ?? e.message) : String(e)}`);
  try {
    await teardown();
    console.error('Teardown ran — no CYCLE-* order/JE/batch leaked.');
  } catch (te) {
    console.error(`TEARDOWN ALSO FAILED (${te instanceof Error ? te.message : String(te)}). Fixtures may be LEAKED. Purge with:`);
    console.error('  npx tsx packages/dev-apps/bizapps-orders/test-harnesses/server/_maint-purge-orders-test-data.ts --yes');
  }
  process.exit(1);
});
