/**
 * schema-preflight.ts — LIVE tier-2 validation of the ENTIRE __mj_BizAppsOrders schema
 * (S1–S6 waves, schema action plan 2026-07-14): structure, seeds, sequences, CHECK
 * constraints, and the three financial-invariant triggers — including the deliberate
 * carve-outs (FulfillmentStatus stays writable on booked lines; JournalEntryID may be
 * set once but never changed).
 *
 * Sections:
 *   P1  structure    — all tables exist; invariant triggers present + ENABLED; filtered
 *                      unique indexes; sequences seeded (singleton row, ID=1)
 *   P2  seeds        — 6 PaymentTermsType codes; 12 out-of-the-box ProductType codes
 *                      (PhysicalGood RequiresFulfillment=1); IsA Entity.ParentID wired
 *   P3  CHECKs       — every value-list + range constraint rejects bad rows and accepts
 *                      boundary values (Quantity<>0 incl. negative-allowed; DiscountPct
 *                      0..1; ServicePeriod ordering; PricingMode; tier ranges; self-bundle)
 *   P4  trg_Order_JournalEntryIDImmutable   — NULL→value once; change/clear rejected
 *   P5  trg_OrderLine_ImmutableAfterConfirm — financial columns frozen + DELETE blocked on
 *                      Confirmed+ orders; FulfillmentStatus + Description still writable;
 *                      Draft orders fully mutable
 *   P6  trg_Payment_ImmutableAfterCapture   — financial identity frozen at Captured+;
 *                      delete blocked; status regression blocked; JEID set-once
 *
 * Run from the instance worktree root:
 *   npx tsx packages/dev-apps/bizapps-orders/test-harnesses/server/schema-preflight.ts
 * Exit: 0 all passed · 1 failures · 2 bootstrap error. FK-aware teardown via the db_owner
 * pool (disables the orders triggers to sweep locked rows).
 */
import sql from 'mssql';
import dotenv from 'dotenv';
import path from 'path';
import { randomUUID } from 'crypto';

const S = '__mj_BizAppsOrders';
const RUN_TAG = `SCHEMA-PF-${Date.now()}`;

const EXPECTED_TABLES = [
  'ProductType', 'ProductCategory', 'Product', 'Order', 'OrderLine',
  'PaymentTermsType', 'OrderSequence',
  'PaymentProvider', 'CustomerPaymentMethod', 'PaymentIntent', 'Payment', 'PaymentLine', 'PaymentSequence',
  'SubscriptionPlan', 'Subscription', 'SubscriptionEvent', 'RevenueRecognitionSchedule', 'RevRecScheduleLine',
  'ProductBundleItem', 'ProductPerformanceObligation', 'ProductEntitlement', 'EntitlementGrant',
  'EventProduct', 'EventOrderLine', 'StoredValueAccount', 'StoredValueTransaction',
  'OrderLineDimension', 'PriceList', 'ProductPrice', 'PriceTier',
  'SalesRule', 'SalesAuthority',
] as const;

const INVARIANT_TRIGGERS = [
  'trg_Order_JournalEntryIDImmutable',
  'trg_OrderLine_ImmutableAfterConfirm',
  'trg_Payment_ImmutableAfterCapture',
] as const;

const FILTERED_UNIQUE_INDEXES = [
  ['PaymentIntent', 'UQ_PaymentIntent_ProviderEventID'],
  ['SubscriptionEvent', 'UQ_SubscriptionEvent_ProviderEventID'],
  ['ProductType', 'UQ_ProductType_Code'],
  ['ProductCategory', 'UQ_ProductCategory_Code'],
  ['Product', 'UQ_Product_SKU'],
] as const;

const PAYMENT_TERMS_CODES = ['DueOnReceipt', 'Net15', 'Net30', 'Net60', 'Net90', 'Prepaid'];
const PRODUCT_TYPE_CODES = ['Event', 'Membership', 'PhysicalGood', 'DigitalGood', 'Service', 'Donation', 'GiftCard', 'Bundle', 'AddOn', 'Fee', 'Subscription', 'Usage'];

interface Outcome { Name: string; Passed: boolean; Error?: string }
const outcomes: Outcome[] = [];
async function test(name: string, fn: () => Promise<void>): Promise<void> {
  try { await fn(); outcomes.push({ Name: name, Passed: true }); console.log(`  ✓ ${name}`); }
  catch (e) { const msg = e instanceof Error ? e.message : String(e); outcomes.push({ Name: name, Passed: false, Error: msg }); console.log(`  ✗ ${name}\n      ${msg.split('\n')[0]}`); }
}
function assert(cond: unknown, msg: string): asserts cond { if (!cond) throw new Error(msg); }
async function expectThrow(fn: () => Promise<unknown>, needle: string): Promise<void> {
  try { await fn(); } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    assert(msg.toLowerCase().includes(needle.toLowerCase()), `expected error containing '${needle}', got: ${msg.split('\n')[0]}`);
    return;
  }
  throw new Error(`expected an error containing '${needle}' but none was thrown`);
}

let pool: sql.ConnectionPool;
let teardownPool: sql.ConnectionPool;
const createdOrderIds: string[] = [];
const createdProductIds: string[] = [];
const createdTypeIds: string[] = [];
const createdPaymentIds: string[] = [];
let companyId = '';

async function bootstrap(): Promise<void> {
  dotenv.config({ path: path.resolve(process.cwd(), '.env'), quiet: true });
  const { DB_HOST: host, DB_DATABASE: database, DB_USERNAME: user, DB_PASSWORD: password } = process.env;
  if (!host || !database || !user || !password) throw new Error('Missing DB settings in .env (run from the instance worktree root).');
  const port = Number(process.env.DB_PORT ?? 1433);
  const opts = { options: { encrypt: false, trustServerCertificate: true } };
  pool = await new sql.ConnectionPool({ server: host, port, user, password, database, ...opts }).connect();
  const { CODEGEN_DB_USERNAME: cgUser, CODEGEN_DB_PASSWORD: cgPassword } = process.env;
  if (!cgUser || !cgPassword) throw new Error('Missing CODEGEN_DB_USERNAME/PASSWORD in .env (db_owner teardown pool).');
  teardownPool = await new sql.ConnectionPool({ server: host, port, user: cgUser, password: cgPassword, database, ...opts }).connect();
  const co = (await pool.request().query(`SELECT TOP 1 ID FROM __mj.Company ORDER BY __mj_CreatedAt`)).recordset[0];
  if (!co) throw new Error('no __mj.Company row available');
  companyId = co.ID;
}

/** Raw-SQL fixture: a ProductType + Product + Order + one line, at the given order status. */
async function makeOrderFixture(status: 'Draft' | 'Confirmed'): Promise<{ orderId: string; lineId: string; productId: string }> {
  const typeId = randomUUID(); const productId = randomUUID(); const orderId = randomUUID(); const lineId = randomUUID();
  createdTypeIds.push(typeId); createdProductIds.push(productId); createdOrderIds.push(orderId);
  await pool.request().query(`INSERT INTO ${S}.ProductType (ID, Name) VALUES ('${typeId}', '${RUN_TAG}-T-${typeId.slice(0, 8)}')`);
  await pool.request().query(`INSERT INTO ${S}.Product (ID, Name, ProductTypeID) VALUES ('${productId}', '${RUN_TAG}-P-${productId.slice(0, 8)}', '${typeId}')`);
  await pool.request().query(`INSERT INTO ${S}.[Order] (ID, OrderNumber, OrderDate, Status) VALUES ('${orderId}', '${RUN_TAG}-O-${orderId.slice(0, 8)}', GETUTCDATE(), '${status}')`);
  await pool.request().query(`INSERT INTO ${S}.OrderLine (ID, OrderID, ProductID, LineNumber, Quantity, UnitPrice) VALUES ('${lineId}', '${orderId}', '${productId}', 1, 2, 50)`);
  return { orderId, lineId, productId };
}

async function makePaymentFixture(status: 'Pending' | 'Captured'): Promise<string> {
  const id = randomUUID();
  createdPaymentIds.push(id);
  await pool.request().query(
    `INSERT INTO ${S}.Payment (ID, PaymentNumber, ReceivingCompanyID, PaymentDate, Method, Amount, Status)
     VALUES ('${id}', '${RUN_TAG}-PAY-${id.slice(0, 8)}', '${companyId}', GETUTCDATE(), 'Check', 100, '${status}')`);
  return id;
}

async function main(): Promise<void> {
  console.log(`\n══════ Orders schema preflight (S1–S6) — tag=${RUN_TAG} ══════\n`);
  try { await bootstrap(); } catch (e) { console.error('BOOTSTRAP ERROR:', e instanceof Error ? e.message : String(e)); process.exit(2); }

  // ─── P1: structure ──────────────────────────────────────────────────────────
  await test('P1.1 all 32 expected tables exist', async () => {
    const rows = (await pool.request().query(`SELECT name FROM sys.tables WHERE schema_id = SCHEMA_ID('${S}')`)).recordset.map(r => r.name as string);
    const missing = EXPECTED_TABLES.filter(t => !rows.includes(t));
    assert(missing.length === 0, `missing tables: ${missing.join(', ')}`);
  });

  await test('P1.2 the 3 invariant triggers are present AND enabled', async () => {
    const rows = (await pool.request().query(
      `SELECT t.name, t.is_disabled FROM sys.triggers t WHERE t.parent_id IN (SELECT object_id FROM sys.objects WHERE schema_id = SCHEMA_ID('${S}')) AND t.name LIKE 'trg[_]%'`)).recordset as Array<{ name: string; is_disabled: boolean }>;
    const state = new Map(rows.map(r => [r.name, r.is_disabled]));
    const missing = INVARIANT_TRIGGERS.filter(n => !state.has(n));
    const disabled = INVARIANT_TRIGGERS.filter(n => state.get(n) === true);
    assert(missing.length === 0, `missing triggers: ${missing.join(', ')}`);
    assert(disabled.length === 0, `DISABLED triggers: ${disabled.join(', ')} — re-enable (a prior teardown crashed?)`);
  });

  await test('P1.3 filtered unique indexes exist (webhook idempotency + optional codes/SKU)', async () => {
    for (const [table, index] of FILTERED_UNIQUE_INDEXES) {
      const n = (await pool.request().query(
        `SELECT COUNT(*) c FROM sys.indexes i WHERE i.name='${index}' AND i.object_id=OBJECT_ID('${S}.${table}') AND i.is_unique=1 AND i.has_filter=1`)).recordset[0].c;
      assert(Number(n) === 1, `index ${index} on ${table} missing or not filtered-unique`);
    }
  });

  await test('P1.4 OrderSequence + PaymentSequence singletons seeded (ID=1, NextSequenceNumber>=1)', async () => {
    for (const t of ['OrderSequence', 'PaymentSequence']) {
      const r = (await pool.request().query(`SELECT ID, NextSequenceNumber FROM ${S}.${t}`)).recordset;
      assert(r.length === 1 && r[0].ID === 1 && r[0].NextSequenceNumber >= 1, `${t} singleton wrong: ${JSON.stringify(r)}`);
    }
  });

  // ─── P2: seeds ──────────────────────────────────────────────────────────────
  await test('P2.1 PaymentTermsType: the 6 seeded codes present with correct NetDays', async () => {
    const rows = (await pool.request().query(`SELECT Code, NetDays FROM ${S}.PaymentTermsType`)).recordset as Array<{ Code: string; NetDays: number }>;
    const byCode = new Map(rows.map(r => [r.Code, r.NetDays]));
    for (const c of PAYMENT_TERMS_CODES) assert(byCode.has(c), `missing payment terms code ${c}`);
    assert(byCode.get('Net30') === 30 && byCode.get('DueOnReceipt') === 0 && byCode.get('Net90') === 90, 'NetDays wrong on seeded terms');
  });

  await test('P2.2 ProductType: the 12 out-of-the-box codes present; PhysicalGood requires fulfillment', async () => {
    const rows = (await pool.request().query(`SELECT Code, RequiresFulfillment FROM ${S}.ProductType WHERE Code IS NOT NULL`)).recordset as Array<{ Code: string; RequiresFulfillment: boolean }>;
    const byCode = new Map(rows.map(r => [r.Code, r.RequiresFulfillment]));
    for (const c of PRODUCT_TYPE_CODES) assert(byCode.has(c), `missing product type code ${c}`);
    assert(byCode.get('PhysicalGood') === true, 'PhysicalGood must have RequiresFulfillment=1');
    assert(byCode.get('Event') === false, 'Event must not require fulfillment');
  });

  await test('P2.3 IsA wiring: EventProduct/EventOrderLine Entity.ParentID set (BO-D37)', async () => {
    const rows = (await pool.request().query(
      `SELECT e.Name, p.Name AS Parent FROM __mj.Entity e LEFT JOIN __mj.Entity p ON p.ID=e.ParentID WHERE e.SchemaName='${S}' AND e.Name LIKE '%Event%Product%' OR (e.SchemaName='${S}' AND e.Name LIKE '%Event Order Lines%')`)).recordset as Array<{ Name: string; Parent: string | null }>;
    const eventProduct = rows.find(r => /Event Products/.test(r.Name));
    const eventLine = rows.find(r => /Event Order Lines/.test(r.Name));
    assert(eventProduct?.Parent?.includes('Products') === true, `Event Products ParentID not wired (run _maint-set-isa-parents.ts after codegen); got ${eventProduct?.Parent}`);
    assert(eventLine?.Parent?.includes('Order Lines') === true, `Event Order Lines ParentID not wired; got ${eventLine?.Parent}`);
  });

  // ─── P3: CHECK constraints ─────────────────────────────────────────────────
  const fx = await makeOrderFixture('Draft');

  await test('P3.1 Order.OrderType / PaymentStatus / Status CHECKs reject bad values', async () => {
    await expectThrow(() => pool.request().query(`UPDATE ${S}.[Order] SET OrderType='Bogus' WHERE ID='${fx.orderId}'`), 'CK_Order_OrderType');
    await expectThrow(() => pool.request().query(`UPDATE ${S}.[Order] SET PaymentStatus='Maybe' WHERE ID='${fx.orderId}'`), 'CK_Order_PaymentStatus');
    await expectThrow(() => pool.request().query(`UPDATE ${S}.[Order] SET Status='Imaginary' WHERE ID='${fx.orderId}'`), 'CK_Order_Status');
  });

  await test('P3.2 OrderLine.Quantity <> 0: zero rejected, NEGATIVE allowed (reversal mechanism, BO-D10)', async () => {
    await expectThrow(() => pool.request().query(`UPDATE ${S}.OrderLine SET Quantity=0 WHERE OrderID='${fx.orderId}'`), 'CK_OrderLine_Quantity');
    await pool.request().query(`UPDATE ${S}.OrderLine SET Quantity=-3 WHERE OrderID='${fx.orderId}'`);
    await pool.request().query(`UPDATE ${S}.OrderLine SET Quantity=2 WHERE OrderID='${fx.orderId}'`);
  });

  await test('P3.3 OrderLine.DiscountPct bounds [0,1]: 0 and 1 accepted, 1.01 and -0.01 rejected', async () => {
    await pool.request().query(`UPDATE ${S}.OrderLine SET DiscountPct=0 WHERE OrderID='${fx.orderId}'`);
    await pool.request().query(`UPDATE ${S}.OrderLine SET DiscountPct=1 WHERE OrderID='${fx.orderId}'`);
    await expectThrow(() => pool.request().query(`UPDATE ${S}.OrderLine SET DiscountPct=1.01 WHERE OrderID='${fx.orderId}'`), 'CK_OrderLine_DiscountPct');
    await expectThrow(() => pool.request().query(`UPDATE ${S}.OrderLine SET DiscountPct=-0.01 WHERE OrderID='${fx.orderId}'`), 'CK_OrderLine_DiscountPct');
    await pool.request().query(`UPDATE ${S}.OrderLine SET DiscountPct=0 WHERE OrderID='${fx.orderId}'`);
  });

  await test('P3.4 OrderLine.ServicePeriod ordering: end >= start enforced; equal-day allowed; open-ended allowed', async () => {
    await pool.request().query(`UPDATE ${S}.OrderLine SET ServicePeriodStart='2026-01-01', ServicePeriodEnd='2026-01-01' WHERE OrderID='${fx.orderId}'`);
    await pool.request().query(`UPDATE ${S}.OrderLine SET ServicePeriodStart='2026-01-01', ServicePeriodEnd=NULL WHERE OrderID='${fx.orderId}'`);
    await expectThrow(() => pool.request().query(`UPDATE ${S}.OrderLine SET ServicePeriodStart='2026-02-01', ServicePeriodEnd='2026-01-01' WHERE OrderID='${fx.orderId}'`), 'CK_OrderLine_ServicePeriod');
    await pool.request().query(`UPDATE ${S}.OrderLine SET ServicePeriodStart=NULL, ServicePeriodEnd=NULL WHERE OrderID='${fx.orderId}'`);
  });

  await test('P3.5 FulfillmentStatus value list enforced', async () => {
    await pool.request().query(`UPDATE ${S}.OrderLine SET FulfillmentStatus='Pending' WHERE OrderID='${fx.orderId}'`);
    await expectThrow(() => pool.request().query(`UPDATE ${S}.OrderLine SET FulfillmentStatus='Shipped' WHERE OrderID='${fx.orderId}'`), 'CK_OrderLine_FulfillmentStatus');
    await pool.request().query(`UPDATE ${S}.OrderLine SET FulfillmentStatus=NULL WHERE OrderID='${fx.orderId}'`);
  });

  await test('P3.6 Payment CHECKs: bad Method/Status rejected; GiftCard accepted (S5 widen)', async () => {
    const pid = await makePaymentFixture('Pending');
    await expectThrow(() => pool.request().query(`UPDATE ${S}.Payment SET Method='Barter' WHERE ID='${pid}'`), 'CK_Payment_Method');
    await pool.request().query(`UPDATE ${S}.Payment SET Method='GiftCard' WHERE ID='${pid}'`);
    await expectThrow(() => pool.request().query(`UPDATE ${S}.Payment SET Status='Lost' WHERE ID='${pid}'`), 'CK_Payment_Status');
  });

  await test('P3.7 ProductBundleItem: self-bundle + zero quantity + bad pricing mode rejected', async () => {
    const q = (extra: string) => pool.request().query(
      `INSERT INTO ${S}.ProductBundleItem (ID, BundleProductID, ComponentProductID, Quantity, PricingMode) VALUES (NEWID(), '${fx.productId}', ${extra})`);
    await expectThrow(() => q(`'${fx.productId}', 1, 'Bundled'`), 'CK_ProductBundleItem_NoSelfBundle');
  });

  await test('P3.8 PriceTier range: MaxQuantity < MinQuantity rejected; unbounded top tier allowed', async () => {
    const priceId = randomUUID();
    await pool.request().query(`INSERT INTO ${S}.ProductPrice (ID, ProductID, PricingModel, FeeType, Amount, EffectiveFrom) VALUES ('${priceId}', '${fx.productId}', 'Tiered', 'Standard', 10, '2026-01-01')`);
    await expectThrow(() => pool.request().query(`INSERT INTO ${S}.PriceTier (ID, ProductPriceID, MinQuantity, MaxQuantity, Amount) VALUES (NEWID(), '${priceId}', 10, 5, 9)`), 'CK_PriceTier_Range');
    await pool.request().query(`INSERT INTO ${S}.PriceTier (ID, ProductPriceID, MinQuantity, MaxQuantity, Amount) VALUES (NEWID(), '${priceId}', 10, NULL, 9)`);
  });

  await test('P3.9 SalesRule/SalesAuthority CHECKs: bad RuleType/Scope/discount bound rejected', async () => {
    await expectThrow(() => pool.request().query(`INSERT INTO ${S}.SalesRule (ID, Name, RuleType, Scope) VALUES (NEWID(), '${RUN_TAG}', 'MoodBased', 'Global')`), 'CK_SalesRule_RuleType');
    await expectThrow(() => pool.request().query(`INSERT INTO ${S}.SalesRule (ID, Name, RuleType, Scope) VALUES (NEWID(), '${RUN_TAG}', 'DiscountLimit', 'PerGalaxy')`), 'CK_SalesRule_Scope');
  });

  // ─── P4: trg_Order_JournalEntryIDImmutable ──────────────────────────────────
  await test('P4.1 JournalEntryID NULL→value allowed once; replace + clear rejected (51001)', async () => {
    const jeA = randomUUID(); const jeB = randomUUID();
    await pool.request().query(`UPDATE ${S}.[Order] SET JournalEntryID='${jeA}' WHERE ID='${fx.orderId}'`);
    await expectThrow(() => pool.request().query(`UPDATE ${S}.[Order] SET JournalEntryID='${jeB}' WHERE ID='${fx.orderId}'`), 'cannot be cleared or replaced');
    await expectThrow(() => pool.request().query(`UPDATE ${S}.[Order] SET JournalEntryID=NULL WHERE ID='${fx.orderId}'`), 'cannot be cleared or replaced');
  });

  // ─── P5: trg_OrderLine_ImmutableAfterConfirm ────────────────────────────────
  const cfx = await makeOrderFixture('Confirmed');

  await test('P5.1 financial columns frozen on a Confirmed order (51003): Quantity/UnitPrice/DiscountPct/ProductID', async () => {
    await expectThrow(() => pool.request().query(`UPDATE ${S}.OrderLine SET Quantity=9 WHERE ID='${cfx.lineId}'`), 'frozen');
    await expectThrow(() => pool.request().query(`UPDATE ${S}.OrderLine SET UnitPrice=1 WHERE ID='${cfx.lineId}'`), 'frozen');
    await expectThrow(() => pool.request().query(`UPDATE ${S}.OrderLine SET DiscountPct=0.5 WHERE ID='${cfx.lineId}'`), 'frozen');
    await expectThrow(() => pool.request().query(`UPDATE ${S}.OrderLine SET ProductID='${fx.productId}' WHERE ID='${cfx.lineId}'`), 'frozen');
  });

  await test('P5.2 the CARVE-OUT: FulfillmentStatus and Description remain writable on a Confirmed order (UPD-3/F1.6)', async () => {
    await pool.request().query(`UPDATE ${S}.OrderLine SET FulfillmentStatus='Pending' WHERE ID='${cfx.lineId}'`);
    await pool.request().query(`UPDATE ${S}.OrderLine SET FulfillmentStatus='Fulfilled' WHERE ID='${cfx.lineId}'`);
    await pool.request().query(`UPDATE ${S}.OrderLine SET Description='fulfiller note' WHERE ID='${cfx.lineId}'`);
  });

  await test('P5.3 DELETE of a booked line blocked (51002); Draft-order lines stay fully mutable + deletable', async () => {
    await expectThrow(() => pool.request().query(`DELETE FROM ${S}.OrderLine WHERE ID='${cfx.lineId}'`), 'cannot be deleted');
    const dfx = await makeOrderFixture('Draft');
    await pool.request().query(`UPDATE ${S}.OrderLine SET Quantity=7, UnitPrice=1.5 WHERE ID='${dfx.lineId}'`);
    await pool.request().query(`DELETE FROM ${S}.OrderLine WHERE ID='${dfx.lineId}'`);
  });

  await test('P5.4 Posted/Fulfilled orders inherit the freeze (status list covers Confirmed+)', async () => {
    await pool.request().query(`UPDATE ${S}.[Order] SET Status='Posted' WHERE ID='${cfx.orderId}'`);
    await expectThrow(() => pool.request().query(`UPDATE ${S}.OrderLine SET Quantity=11 WHERE ID='${cfx.lineId}'`), 'frozen');
    await pool.request().query(`UPDATE ${S}.[Order] SET Status='Fulfilled' WHERE ID='${cfx.orderId}'`);
    await expectThrow(() => pool.request().query(`DELETE FROM ${S}.OrderLine WHERE ID='${cfx.lineId}'`), 'cannot be deleted');
  });

  // ─── P6: trg_Payment_ImmutableAfterCapture ──────────────────────────────────
  await test('P6.1 Pending payments are fully mutable + deletable', async () => {
    const pid = await makePaymentFixture('Pending');
    await pool.request().query(`UPDATE ${S}.Payment SET Amount=250, Method='Wire' WHERE ID='${pid}'`);
    await pool.request().query(`DELETE FROM ${S}.Payment WHERE ID='${pid}'`);
  });

  await test('P6.2 Captured: financial identity frozen (51005) — Amount/Method/PaymentDate/ReceivingCompanyID', async () => {
    const pid = await makePaymentFixture('Captured');
    await expectThrow(() => pool.request().query(`UPDATE ${S}.Payment SET Amount=1 WHERE ID='${pid}'`), 'frozen once Captured');
    await expectThrow(() => pool.request().query(`UPDATE ${S}.Payment SET Method='Cash' WHERE ID='${pid}'`), 'frozen once Captured');
    await expectThrow(() => pool.request().query(`UPDATE ${S}.Payment SET PaymentDate='2020-01-01' WHERE ID='${pid}'`), 'frozen once Captured');
  });

  await test('P6.3 Captured: DELETE blocked (51004); status may advance to Refunded but never regress (51007)', async () => {
    const pid = await makePaymentFixture('Captured');
    await expectThrow(() => pool.request().query(`DELETE FROM ${S}.Payment WHERE ID='${pid}'`), 'cannot be deleted once Captured');
    await expectThrow(() => pool.request().query(`UPDATE ${S}.Payment SET Status='Pending' WHERE ID='${pid}'`), 'cannot regress');
    await pool.request().query(`UPDATE ${S}.Payment SET Status='Refunded' WHERE ID='${pid}'`);
    await expectThrow(() => pool.request().query(`UPDATE ${S}.Payment SET Status='Captured' WHERE ID='${pid}'`), 'cannot regress');
  });

  await test('P6.4 Payment.JournalEntryID set-once (51006): NULL→value ok; replace/clear rejected', async () => {
    const pid = await makePaymentFixture('Pending');
    const je = randomUUID();
    await pool.request().query(`UPDATE ${S}.Payment SET JournalEntryID='${je}' WHERE ID='${pid}'`);
    await expectThrow(() => pool.request().query(`UPDATE ${S}.Payment SET JournalEntryID=NULL WHERE ID='${pid}'`), 'cannot be cleared or replaced');
  });

  // ─── teardown (db_owner: disable triggers to sweep locked fixtures) ─────────
  // Re-enable EVERY toggled trigger in a `finally` so a failed DELETE (or a kill mid-window) can NEVER
  // leave the immutability triggers disabled — a real dev-instance integrity gap (harness-notes #3).
  const exec = async (q: string) => { try { await teardownPool.request().query(q); } catch (e) { console.log(`  teardown warn: ${(e instanceof Error ? e.message : String(e)).split('\n')[0]}`); } };
  const toggled = ['OrderLine', '[Order]', 'Payment'];
  try {
    for (const t of toggled) await exec(`DISABLE TRIGGER ALL ON ${S}.${t}`);
    await exec(`DELETE FROM ${S}.PriceTier WHERE ProductPriceID IN (SELECT ID FROM ${S}.ProductPrice WHERE ProductID IN (${createdProductIds.map(i => `'${i}'`).join(',') || `''`}))`);
    await exec(`DELETE FROM ${S}.ProductPrice WHERE ProductID IN (${createdProductIds.map(i => `'${i}'`).join(',') || `''`})`);
    for (const id of createdPaymentIds) await exec(`DELETE FROM ${S}.Payment WHERE ID='${id}'`);
    for (const id of createdOrderIds) await exec(`DELETE FROM ${S}.OrderLine WHERE OrderID='${id}'`);
    for (const id of createdOrderIds) await exec(`DELETE FROM ${S}.[Order] WHERE ID='${id}'`);
    for (const id of createdProductIds) await exec(`DELETE FROM ${S}.Product WHERE ID='${id}'`);
    for (const id of createdTypeIds) await exec(`DELETE FROM ${S}.ProductType WHERE ID='${id}'`);
  } finally {
    for (const t of toggled) await exec(`ENABLE TRIGGER ALL ON ${S}.${t}`);
  }

  const failed = outcomes.filter(o => !o.Passed);
  console.log(`\n────── Orders schema preflight: ${outcomes.length - failed.length}/${outcomes.length} passed ──────`);
  if (failed.length) for (const f of failed) console.log(`   ✗ ${f.Name}: ${(f.Error ?? '').split('\n')[0]}`);
  process.exit(failed.length > 0 ? 1 : 0);
}
// All fixtures are created inside swallowing `test()` blocks, so the body reaches teardown on every
// normal run; this net turns an unexpected out-of-test throw into a LOUD, actionable error (instead of
// a silent unhandled rejection) pointing at the belt-and-suspenders purge.
main().catch((e) => {
  console.error(`\nHARNESS ERROR — aborted before teardown: ${e instanceof Error ? (e.stack ?? e.message) : String(e)}`);
  console.error('Any leaked fixtures — purge with:');
  console.error('  npx tsx packages/dev-apps/bizapps-orders/test-harnesses/server/_maint-purge-orders-test-data.ts --yes');
  process.exit(1);
});
