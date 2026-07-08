/**
 * seed-confirmed-orders — books a few CONFIRMED demo orders so the Orders Management pipeline,
 * the Journal Entries Console, and the Batch Console all show real data in a live walkthrough.
 *
 * Idempotent: skips if 3+ DEMO- orders already exist. Depends on seed-demo-catalog.ts having run
 * first (needs the demo products + their GL-account links). Confirming an order fires
 * OrderEntityServer, which books a balanced JE via the Accounting.CreateJournalEntry op.
 *
 * Run from the instance worktree root:
 *   npx tsx packages/dev-apps/bizapps-orders/test-harnesses/server/seed-confirmed-orders.ts
 */
import * as dotenv from 'dotenv';
import sql from 'mssql';
import path from 'path';
import { Metadata, RunView, UserInfo } from '@memberjunction/core';
import { setupSQLServerClient, SQLServerProviderConfigData, UserCache } from '@memberjunction/sqlserver-dataprovider';
import '@memberjunction/server-bootstrap-lite';
import '@mj-biz-apps/common-entities';
import '@mj-biz-apps/accounting-entities';
import '@mj-biz-apps/accounting-engine-base';
// Registers the JE-booking chain: AccountingCompanyProfile W1 hook + OrderEntityServer (books the JE on Confirm).
import '@mj-biz-apps/accounting-core-entities-server';
import '@mj-biz-apps/orders-entities';
import '@mj-biz-apps/orders-core-entities-server';
import type { mjBizAppsOrdersOrderEntity, mjBizAppsOrdersOrderLineEntity } from '@mj-biz-apps/orders-entities';

const ORDER_ENTITY = 'MJ_BizApps_Orders: Orders';
const ORDER_LINE_ENTITY = 'MJ_BizApps_Orders: Order Lines';
const PRODUCT_ENTITY = 'MJ_BizApps_Orders: Products';

interface DemoProduct { ID: string; Name: string }

let user: UserInfo;

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
    { EntityName: ORDER_ENTITY, ExtraFilter: `OrderNumber LIKE 'DEMO-%'`, Fields: ['ID'], ResultType: 'simple' }, user);
  if ((existing.Results ?? []).length >= 3) {
    console.log(`✓ ${existing.Results!.length} DEMO- orders already present — nothing to seed.`);
    process.exit(0);
  }

  const products = await loadDemoProducts();
  if (products.length === 0) throw new Error('No "(Demo)" products found — run seed-demo-catalog.ts first.');

  const specs: Array<Array<{ p: DemoProduct; qty: number; price: number }>> = [
    [{ p: products[0], qty: 2, price: 100 }],
    [{ p: products[0], qty: 1, price: 100 }, { p: products[1 % products.length], qty: 3, price: 50 }],
    [{ p: products[products.length - 1], qty: 1, price: 250 }],
  ];

  let booked = 0;
  for (let i = 0; i < specs.length; i++) {
    const num = `DEMO-${Date.now().toString().slice(-8)}-${i + 1}`;
    const result = await bookOrder(num, specs[i]);
    console.log(result.ok ? `  ✓ ${num} → JE ${result.je}` : `  ✗ ${num} — ${result.msg}`);
    if (result.ok) booked++;
  }

  console.log(`\n✅ Seeded ${booked}/${specs.length} confirmed demo orders (each booked a balanced journal entry).`);
  console.log('   → Open Explorer → Orders → Orders, and Accounting → Journal Entries / Batches.\n');
  process.exit(0);
}

async function loadDemoProducts(): Promise<DemoProduct[]> {
  const rv = new RunView();
  const res = await rv.RunView<{ ID: string; Name: string }>(
    { EntityName: PRODUCT_ENTITY, ExtraFilter: `Name LIKE '%(Demo)' AND IsActive=1`, Fields: ['ID', 'Name'], OrderBy: 'Name ASC', ResultType: 'simple' }, user);
  return (res.Results ?? []).map(p => ({ ID: p.ID, Name: p.Name }));
}

async function bookOrder(orderNumber: string, lines: Array<{ p: DemoProduct; qty: number; price: number }>): Promise<{ ok: boolean; je?: string; msg?: string }> {
  const md = new Metadata();
  const order = await md.GetEntityObject<mjBizAppsOrdersOrderEntity>(ORDER_ENTITY, user);
  order.NewRecord();
  order.OrderNumber = orderNumber;
  order.OrderDate = new Date();
  order.Status = 'Draft';
  order.Description = 'Seeded demo order for the live UI walkthrough';
  if (!(await order.Save())) return { ok: false, msg: `order save failed: ${order.LatestResult?.CompleteMessage ?? 'unknown'}` };

  let n = 1;
  for (const l of lines) {
    const line = await md.GetEntityObject<mjBizAppsOrdersOrderLineEntity>(ORDER_LINE_ENTITY, user);
    line.NewRecord();
    line.OrderID = order.ID;
    line.ProductID = l.p.ID;
    line.LineNumber = n++;
    line.Quantity = l.qty;
    line.UnitPrice = l.price;
    if (!(await line.Save())) return { ok: false, msg: `line ${n - 1} save failed: ${line.LatestResult?.CompleteMessage ?? 'unknown'}` };
  }

  order.Status = 'Confirmed';
  if (!(await order.Save()) || !order.JournalEntryID) {
    return { ok: false, msg: `confirm/book failed: ${order.LatestResult?.CompleteMessage ?? 'no JournalEntryID returned'}` };
  }
  return { ok: true, je: order.JournalEntryID };
}

void main();
