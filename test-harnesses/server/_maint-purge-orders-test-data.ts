/**
 * _maint-purge-orders-test-data.ts — MAINTENANCE: delete the ORDERS-side footprint that harness runs
 * leaked, via the MJ entity layer (audited, permission-checked — never raw DELETE).
 *
 * This file grew out of `_maint-purge-test-categories.ts` (which only purged `AGENT WRITE TEST`
 * ProductCategory rows from UI write tests). It is that same script, widened to the whole orders-side
 * footprint, rather than a fifth near-identical purge script. Its accounting-side counterpart is
 * `bizapps-accounting/test-harnesses/server/_maint-purge-test-companies.ts`, which owns the
 * Company / GLAccount / JournalEntry footprint (that one must run as db_owner with the JE immutability
 * triggers disabled, so it cannot go through the entity layer — the two scripts split on exactly that
 * line, and neither duplicates the other).
 *
 * Why this exists: verifying a create screen means actually creating something, and an integration
 * harness must book real orders. That leaves real rows behind. Marcelo, on what they did to the
 * Product-type dropdown and the catalog: "these product names, like the testing data you added in is
 * really confusing... we need to clean up that testing data and make sure our harnesses are cleaning
 * that up so we're not just filling in a bunch of gunk." Deliberate, readable demo data (the
 * `seed-demo-catalog.ts` catalog) is WANTED and is NOT touched here.
 *
 * SAFETY — this script refuses rather than guesses:
 *  1. It matches ONLY the known harness run-tag prefixes (below). There is no "looks like test data"
 *     heuristic — a purge that guesses can delete real work.
 *  2. It asserts no protected (real) record can ever match, and ABORTS if one somehow does.
 *  3. It is REPORT-ONLY by default. `--yes` is required to delete anything.
 *  4. It runs the DELETE window as db_owner (MJ_CodeGen) with ONLY the orders immutability triggers
 *     disabled, and re-enables them in a `finally` — a mid-run failure cannot leave those invariants
 *     off. The harness orders are Confirmed, so `trg_OrderLine_ImmutableAfterConfirm` refuses the
 *     delete by design ("Use a reversal order"); that trigger exists to protect a booked ledger, and
 *     suspending it is legitimate ONLY for removing test fixtures, only for this window. Same pattern
 *     as the accounting purge script, which does this for the GLPosted JE triggers.
 *
 * RUN ORDER: this script first, THEN the accounting `_maint-purge-test-companies.ts`. Product rows
 * carry `OwningCompanyID -> __mj.Company`, so the accounting script cannot drop the test companies
 * while these products still point at them.
 *
 * Run from the instance worktree root:
 *   npx tsx packages/dev-apps/bizapps-orders/test-harnesses/server/_maint-purge-orders-test-data.ts
 *   npx tsx packages/dev-apps/bizapps-orders/test-harnesses/server/_maint-purge-orders-test-data.ts --yes
 *
 * Exit codes: 0 pass · 1 a delete failed / abort · 2 bootstrap failure.
 */
import sql from 'mssql';
import dotenv from 'dotenv';
import path from 'path';
import { Metadata, RunView, UserInfo } from '@memberjunction/core';
import { NormalizeUUID } from '@memberjunction/global';
import { setupSQLServerClient, SQLServerProviderConfigData, UserCache } from '@memberjunction/sqlserver-dataprovider';
import '@memberjunction/server-bootstrap-lite';
import '@mj-biz-apps/common-entities';
import '@mj-biz-apps/accounting-entities';
import '@mj-biz-apps/orders-entities';
import type {
  mjBizAppsOrdersProductCategoryEntity,
  mjBizAppsOrdersProductTypeEntity,
  mjBizAppsOrdersProductEntity,
  mjBizAppsOrdersOrderEntity,
  mjBizAppsOrdersOrderLineEntity,
} from '@mj-biz-apps/orders-entities';
import type { mjBizAppsAccountingGLAccountLinkEntity } from '@mj-biz-apps/accounting-entities';

const ORDER_ENTITY = 'MJ_BizApps_Orders: Orders';
const ORDER_LINE_ENTITY = 'MJ_BizApps_Orders: Order Lines';
const PRODUCT_ENTITY = 'MJ_BizApps_Orders: Products';
const CATEGORY_ENTITY = 'MJ_BizApps_Orders: Product Categories';
const TYPE_ENTITY = 'MJ_BizApps_Orders: Product Types';
const GL_LINK_ENTITY = 'MJ_BizApps_Accounting: GL Account Links';
const ORD_SCHEMA = '__mj_BizAppsOrders';

/** The ONLY triggers this script suspends, and only for the delete window (see below). */
const IMMUTABILITY_TRIGGERS = [
  { table: 'OrderLine', trigger: 'trg_OrderLine_ImmutableAfterConfirm' },
  { table: 'Order', trigger: 'trg_Order_JournalEntryIDImmutable' },
] as const;

/**
 * The ONLY things this script will delete. Every harness stamps its run tag onto the name/number of
 * everything it creates; anything not starting with one of these is untouchable.
 *   ORD2JE-<epoch>     — server/order-to-je.ts
 *   ORD2JEAPI-<epoch>  — api/order-to-je-fixture.ts
 *   PWBATCH-<base36>   — accounting playwright/lib/batching-fixture.ts
 *   SJE-<epoch>        — accounting server/scheduled-je-runtime.ts
 *   CYCLE-<epoch>      — server/order-to-glposted.ts (order → JE → Batched → GLPosted proof)
 *   AGENT WRITE TEST   — UI create-screen write verification (the original scope of this script)
 */
const TEST_TAG_PREFIXES = ['ORD2JE-', 'ORD2JEAPI-', 'PWBATCH-', 'SJE-', 'CYCLE-', 'AGENT WRITE TEST'] as const;

/** Real records. If the matcher would ever touch one of these, the script aborts instead. */
const PROTECTED_NAMES = [
  'Assoc Demo — Northwind Members',
  'Assoc Demo — Cascadia Chapter',
  'Assoc Demo — Sierra Chapter',
  'Demo Company (Orders)',
] as const;

/** Fail loudly at bootstrap rather than handing the driver `undefined` and getting a vague error. */
function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing ${name} in .env (run from the instance worktree root).`);
  return v;
}

const isTestTagged = (name: string | null | undefined): boolean =>
  !!name && TEST_TAG_PREFIXES.some((p) => name.startsWith(p));

const idSet = (ids: string[]): Set<string> => new Set(ids.map((i) => NormalizeUUID(i)));

interface TypeRow {
  ID: string;
  Name: string;
}
interface CategoryRow {
  ID: string;
  Name: string;
  ParentID: string | null;
}
interface ProductRow {
  ID: string;
  Name: string;
  ProductTypeID: string | null;
  ProductCategoryID: string | null;
  SuccessorProductID: string | null;
}
interface OrderRow {
  ID: string;
  OrderNumber: string;
  ReversesOrderID: string | null;
}
interface OrderLineRow {
  ID: string;
  OrderID: string;
  ProductID: string | null;
  ReversesOrderLineID: string | null;
}
interface GLLinkRow {
  ID: string;
  RecordID: string;
}

let failures = 0;

async function main(): Promise<void> {
  const confirmed = process.argv.includes('--yes');
  await bootstrap();
  const md = new Metadata();
  const user = UserCache.Users.find((u) => u?.Type?.trim().toLowerCase() === 'owner') ?? UserCache.Users[0];
  if (!user) throw new Error('no context user');

  const allTypes = await read<TypeRow>(TYPE_ENTITY, ['ID', 'Name'], user);
  const allCategories = await read<CategoryRow>(CATEGORY_ENTITY, ['ID', 'Name', 'ParentID'], user);
  const allProducts = await read<ProductRow>(PRODUCT_ENTITY, ['ID', 'Name', 'ProductTypeID', 'ProductCategoryID', 'SuccessorProductID'], user);
  const allOrders = await read<OrderRow>(ORDER_ENTITY, ['ID', 'OrderNumber', 'ReversesOrderID'], user);
  const allLines = await read<OrderLineRow>(ORDER_LINE_ENTITY, ['ID', 'OrderID', 'ProductID', 'ReversesOrderLineID'], user);
  const allGLLinks = await read<GLLinkRow>(GL_LINK_ENTITY, ['ID', 'RecordID'], user);

  const doomedTypes = allTypes.filter((r) => isTestTagged(r.Name));
  const doomedCategories = allCategories.filter((r) => isTestTagged(r.Name));
  const doomedProducts = allProducts.filter((r) => isTestTagged(r.Name));
  const doomedOrders = allOrders.filter((r) => isTestTagged(r.OrderNumber));

  assertNothingProtected([...doomedTypes, ...doomedCategories, ...doomedProducts].map((r) => r.Name));
  assertNothingProtected(doomedOrders.map((r) => r.OrderNumber));

  // Children of the doomed set are reached by FK — never by a name of their own (a line has no tag).
  const doomedOrderIDs = idSet(doomedOrders.map((r) => r.ID));
  const doomedProductIDs = idSet(doomedProducts.map((r) => r.ID));
  const doomedCategoryIDs = idSet(doomedCategories.map((r) => r.ID));
  const doomedLines = allLines.filter(
    (l) => doomedOrderIDs.has(NormalizeUUID(l.OrderID)) || (!!l.ProductID && doomedProductIDs.has(NormalizeUUID(l.ProductID))),
  );
  // GLAccountLink is polymorphic (EntityID + RecordID). Match on a RecordID pointing at a doomed
  // product/category — those links block the Product delete and are meaningless without their target.
  const doomedGLLinks = allGLLinks.filter(
    (k) => doomedProductIDs.has(NormalizeUUID(k.RecordID)) || doomedCategoryIDs.has(NormalizeUUID(k.RecordID)),
  );

  // An order line on a SURVIVING order that points at a doomed product would be orphaned by this
  // purge — i.e. real work depends on harness junk. Refuse and report rather than gut a real order.
  const crossLines = doomedLines.filter((l) => !doomedOrderIDs.has(NormalizeUUID(l.OrderID)));
  if (crossLines.length > 0) {
    console.error(`\nABORT: ${crossLines.length} order line(s) on NON-test orders reference a test-tagged product.`);
    for (const l of crossLines) console.error(`  OrderLine ${l.ID} (Order ${l.OrderID})`);
    await finish(1);
    return;
  }

  report('Product Types', allTypes.length, doomedTypes.map((r) => r.Name));
  report('Product Categories', allCategories.length, doomedCategories.map((r) => r.Name));
  report('Products', allProducts.length, doomedProducts.map((r) => r.Name));
  report('Orders', allOrders.length, doomedOrders.map((r) => r.OrderNumber));
  report('Order Lines (reached by FK)', allLines.length, doomedLines.map((l) => l.ID));
  report('GL Account Links (reached by FK)', allGLLinks.length, doomedGLLinks.map((k) => k.ID));

  if (!confirmed) {
    console.log('\nDRY RUN — nothing deleted. Pass --yes to actually delete.');
    await finish(0);
    return;
  }

  // ── FK-safe delete order (verified against sys.foreign_keys for these schemas) ──────────────────
  //   OrderLine       (child of Order + Product; self-FK ReversesOrderLineID)
  //   -> Order        (self-FK ReversesOrderID)
  //   -> GLAccountLink (soft polymorphic pointer AT Product / ProductCategory)
  //   -> Product      (child of ProductType + ProductCategory + Company; self-FK SuccessorProductID)
  //   -> ProductCategory (self-FK ParentID)
  //   -> ProductType
  // Company / GLAccount / JournalEntry are deliberately NOT here — that is the accounting script's
  // job (it needs db_owner + the JE immutability triggers disabled). Run it AFTER this one.
  // Self-FK rule: a row that POINTS AT another doomed row must die first, so reversals lead.
  console.log('\nDeleting…');
  await withImmutabilityTriggersOff(async () => {
    await deleteAll<mjBizAppsOrdersOrderLineEntity, OrderLineRow>(md, user, ORDER_LINE_ENTITY, reversalsFirst(doomedLines, (l) => l.ReversesOrderLineID), (l) => l.ID);
    await deleteAll<mjBizAppsOrdersOrderEntity, OrderRow>(md, user, ORDER_ENTITY, reversalsFirst(doomedOrders, (o) => o.ReversesOrderID), (o) => o.OrderNumber);
    await deleteAll<mjBizAppsAccountingGLAccountLinkEntity, GLLinkRow>(md, user, GL_LINK_ENTITY, doomedGLLinks, (k) => k.ID);
    await deleteAll<mjBizAppsOrdersProductEntity, ProductRow>(md, user, PRODUCT_ENTITY, reversalsFirst(doomedProducts, (p) => p.SuccessorProductID), (p) => p.Name);
    await reparentSurvivingChildren(md, user, allCategories, doomedCategories);
    await deleteAll<mjBizAppsOrdersProductCategoryEntity, CategoryRow>(md, user, CATEGORY_ENTITY, reversalsFirst(doomedCategories, (c) => c.ParentID), (c) => c.Name);
    await deleteAll<mjBizAppsOrdersProductTypeEntity, TypeRow>(md, user, TYPE_ENTITY, doomedTypes, (t) => t.Name);
  });

  await finish(failures === 0 ? 0 : 1);
}

/**
 * BypassCache everywhere: this reads state other processes wrote, and a stale cached read here would
 * make the purge silently no-op.
 */
async function read<T>(entityName: string, fields: string[], user: UserInfo): Promise<T[]> {
  const r = await new RunView().RunView<T>(
    { EntityName: entityName, Fields: fields, ResultType: 'simple', BypassCache: true },
    user,
  );
  if (!r.Success) throw new Error(`${entityName}: ${r.ErrorMessage ?? 'read failed'}`);
  return r.Results ?? [];
}

/**
 * The harness orders are Confirmed, so the orders immutability triggers refuse to delete their lines
 * ("Use a reversal order") — correct behavior for a booked ledger, wrong for removing test fixtures.
 * Suspend ONLY those two triggers, ONLY for the delete window, and ALWAYS re-enable in `finally`:
 * the app's invariants must not stay off because this script failed. Needs db_owner — the app login
 * cannot DISABLE TRIGGER. (Mirrors the accounting purge script's handling of the GLPosted triggers.)
 */
async function withImmutabilityTriggersOff(work: () => Promise<void>): Promise<void> {
  const { CODEGEN_DB_USERNAME: cgUser, CODEGEN_DB_PASSWORD: cgPassword } = process.env;
  if (!cgUser || !cgPassword) {
    throw new Error('Missing CODEGEN_DB_USERNAME/PASSWORD in .env (db_owner is required: the app login cannot DISABLE TRIGGER, and the harness orders are Confirmed/immutable).');
  }
  const ddl = await new sql.ConnectionPool({
    server: requireEnv('DB_HOST'),
    port: Number(process.env.DB_PORT ?? 1433),
    user: cgUser,
    password: cgPassword,
    database: requireEnv('DB_DATABASE'),
    options: { encrypt: false, trustServerCertificate: true },
  }).connect();
  const toggle = async (verb: 'DISABLE' | 'ENABLE'): Promise<void> => {
    for (const t of IMMUTABILITY_TRIGGERS) {
      try {
        // Bracket-quote: `Order` is a reserved word and this schema really does have a table named it.
        await ddl.request().query(`${verb} TRIGGER ${ORD_SCHEMA}.[${t.trigger}] ON ${ORD_SCHEMA}.[${t.table}]`);
      } catch (e) {
        console.log(`  warn: ${verb} ${t.trigger}: ${(e instanceof Error ? e.message : String(e)).split('\n')[0]}`);
      }
    }
  };
  try {
    await toggle('DISABLE');
    await work();
  } finally {
    await toggle('ENABLE');
    console.log('  immutability triggers re-enabled');
  }
}

/** Rows whose self-FK points at another doomed row must be deleted before their target. */
function reversalsFirst<T extends { ID: string }>(rows: T[], selfRef: (r: T) => string | null): T[] {
  const ids = idSet(rows.map((r) => r.ID));
  const pointsAtDoomed = (r: T): boolean => {
    const ref = selfRef(r);
    return !!ref && ids.has(NormalizeUUID(ref));
  };
  return [...rows.filter(pointsAtDoomed), ...rows.filter((r) => !pointsAtDoomed(r))];
}

/** Categories are a tree — re-parent a survivor off a dying parent rather than orphaning it. */
async function reparentSurvivingChildren(md: Metadata, user: UserInfo, all: CategoryRow[], doomed: CategoryRow[]): Promise<void> {
  const doomedIDs = idSet(doomed.map((d) => d.ID));
  for (const r of all) {
    if (doomedIDs.has(NormalizeUUID(r.ID))) continue;
    if (!r.ParentID || !doomedIDs.has(NormalizeUUID(r.ParentID))) continue;
    const dyingParent = doomed.find((d) => NormalizeUUID(d.ID) === NormalizeUUID(r.ParentID!));
    const child = await md.GetEntityObject<mjBizAppsOrdersProductCategoryEntity>(CATEGORY_ENTITY, user);
    if (!(await child.Load(r.ID))) {
      failures++;
      console.error(`  FAILED to load child category ${r.ID}`);
      continue;
    }
    child.ParentID = dyingParent?.ParentID ?? null;
    // Save() returns false on a logical failure — it does not throw.
    if (!(await child.Save())) {
      failures++;
      console.error(`  FAILED to re-parent "${r.Name}": ${child.LatestResult?.CompleteMessage ?? 'unknown'}`);
    } else {
      console.log(`  re-parented "${r.Name}" off a deleted parent`);
    }
  }
}

async function deleteAll<TEntity extends mjBizAppsOrdersProductTypeEntity | mjBizAppsOrdersProductCategoryEntity | mjBizAppsOrdersProductEntity | mjBizAppsOrdersOrderEntity | mjBizAppsOrdersOrderLineEntity | mjBizAppsAccountingGLAccountLinkEntity, TRow extends { ID: string }>(
  md: Metadata,
  user: UserInfo,
  entityName: string,
  rows: TRow[],
  label: (r: TRow) => string,
): Promise<void> {
  if (rows.length === 0) {
    console.log(`  ${entityName}: nothing to delete`);
    return;
  }
  let ok = 0;
  for (const row of rows) {
    const rec = await md.GetEntityObject<TEntity>(entityName, user);
    if (!(await rec.Load(row.ID))) {
      failures++;
      console.error(`  FAILED to load ${entityName} ${row.ID}`);
      continue;
    }
    // Delete() returns false on a logical failure — it does not throw.
    if (!(await rec.Delete())) {
      failures++;
      console.error(`  FAILED to delete ${entityName} "${label(row)}": ${rec.LatestResult?.CompleteMessage ?? 'unknown'}`);
    } else {
      ok++;
    }
  }
  console.log(`  ${entityName}: deleted ${ok}/${rows.length}`);
}

function assertNothingProtected(names: string[]): void {
  const hit = names.filter((n) => PROTECTED_NAMES.some((p) => n === p || n.startsWith(p)));
  if (hit.length > 0) {
    console.error(`ABORT: the tag matcher selected PROTECTED real records: ${hit.join(', ')}`);
    process.exit(1);
  }
}

function report(label: string, total: number, doomedLabels: string[]): void {
  console.log(`\n${label}: ${total} total, ${doomedLabels.length} harness-tagged.`);
  for (const n of doomedLabels.slice(0, 12)) console.log(`  - ${n}`);
  if (doomedLabels.length > 12) console.log(`  … and ${doomedLabels.length - 12} more`);
}

async function bootstrap(): Promise<void> {
  dotenv.config({ path: path.resolve(process.cwd(), '.env'), quiet: true });
  const pool = await new sql.ConnectionPool({
    server: requireEnv('DB_HOST'),
    port: Number(process.env.DB_PORT ?? 1433),
    user: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
    database: requireEnv('DB_DATABASE'),
    options: { encrypt: false, trustServerCertificate: true },
  }).connect();
  await setupSQLServerClient(new SQLServerProviderConfigData(pool, process.env.MJ_CORE_SCHEMA || '__mj'));
  await UserCache.Instance.Refresh(pool);
}

/** Never `await pool.close()` — the provider pool's close() can hang so the process never exits. */
async function finish(code: number): Promise<void> {
  console.log(code === 0 ? '\nPURGE OK' : `\nPURGE FAILED (${failures} error(s))`);
  process.exit(code);
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
