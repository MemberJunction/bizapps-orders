/**
 * orders-isa.checks.ts — the `orders-isa` bundle (IS1–IS10).
 *
 * THE NAME CARRIES THE APP. Accounting and Sales have IS-A bundles too, and the check registry is one
 * process-wide map that REPLACES a check or a lifecycle registered under a name it already holds. A
 * plain `isa` in two of them (or in MemberJunction, which has none yet) would silently swap one app's
 * checks and fixture for the other's.
 *
 * IS-A AGAINST A REAL DATABASE. Orders declares two Table-Per-Type pairs, both DISJOINT: an Event
 * Product IS-A Product, and an Event Order Line IS-A Order Line (`codegen-schema-info.json`). Each
 * pair is two tables under ONE primary key, and MemberJunction's IS-A machinery is what keeps them
 * one record: it routes every column to the table that owns it, writes the parent before the child
 * inside one transaction, finds the subtype again when only the parent is loaded, and deletes both
 * together. MemberJunction has no IS-A entity of its own, so its tests prove that machinery against
 * mocks. This bundle is where the contract meets SQL Server — through this app's entities, and with
 * `OrderLineEntityServer.Save()` sitting in the middle of the Event Order Line chain.
 *
 * WHAT IT PROVES
 *   IS1   a new Event Product saved through the child writes a Product row and an EventProduct row
 *         under one key, each column in the table that owns it; the Product the child built links
 *         back to it (MJ#4870)
 *   IS2   the Event Products view carries the Product's columns — RunView filters and sorts on them
 *   IS3   loading a PRODUCT finds its subtype: ISAChild and LeafEntity are the Event Product, loaded
 *   IS4   a Product column changed through a loaded Event Product updates the Product row itself
 *   IS5   Save() on a loaded Product hands the save to its Event Product, and both levels persist
 *   IS6   AttachToParent promotes an existing Product in place — one Product row, its values kept —
 *         and a key with no Product row returns false and leaves the chain fresh (MJ#4870)
 *   IS7   a failed chain save leaves no row at either level: a parent refusal is reported on the
 *         child, and a child the database refuses takes the parent row written before it back
 *   IS8   deleting an Event Product deletes its Product row as well
 *   IS9   Delete() on a loaded Product with its Event Product linked removes both rows and RETURNS
 *         (MJ#4850 — it used to wait on itself forever)
 *   IS10  an order line's Event Order Line, saved with the order, is found again by loading the line
 *
 * WHY IS7 COMMITS. Proving a rollback means the rollback has to be MemberJunction's. Inside a check
 * transaction the chain save only holds a savepoint, and the check's own rollback would erase the
 * parent row whether MJ's scope did its job or not. Worse, the provider saves through `INSERT … EXEC`,
 * and an error inside a procedure run that way can doom the whole open transaction, after which
 * nothing could be asserted at all. So IS7 runs outside any transaction, where the chain's own scope
 * is the outermost one, and deletes the draft order it hangs its line on — the `OutsideTransaction`
 * model RU5 uses. Every other check runs inside a rolled-back transaction.
 */
import { randomUUID } from 'node:crypto';
import { CompositeKey, DatabaseProviderBase, RunView, type BaseEntity } from '@memberjunction/core';
import {
    Assert,
    AssertEqual,
    IntegrationCheckRegistry,
    type IntegrationCheckContext,
    type NamedCheck,
} from '@memberjunction/testing-integration';
import type {
    mjBizAppsOrdersEventOrderLineEntity,
    mjBizAppsOrdersEventProductEntity,
    mjBizAppsOrdersProductEntity,
    OrderLineEntity,
} from '@mj-biz-apps/orders-entities';
import {
    CreateOrdersFixture,
    Fx,
    InRolledBackTransaction,
    ORDERS_SCHEMA,
    OutsideTransaction,
    SameID,
    TeardownOrdersFixture,
    TxMaybeOne,
    TxQuery,
} from '../fixture.js';
import {
    EVENT_ORDER_LINE_ENTITY,
    EVENT_PRODUCT_ENTITY,
    ORDER_LINE_ENTITY,
    PRODUCT_ENTITY,
} from '../entity-names.js';
import { BuildOrder } from '../order-builder.js';
import { World } from '../world/world.js';

/** When every fixture event runs. Any future window will do — nothing here books revenue. */
const EVENT_STARTS = new Date('2027-05-10T15:00:00Z');
const EVENT_ENDS = new Date('2027-05-11T22:00:00Z');
const VENUE = 'IS-A Test Hall';
const CAPACITY = 120;

/** The price the `events` bundle sells a ticket at, so both bundles state a line's price the same way. */
const TICKET_PRICE = 500;
const ATTENDEE_NOTE = 'Aisle seat, step-free access';

/**
 * How long a delete may take before it counts as hung. A real one on a development database returns
 * in well under a second; MJ#4850's never returned at all, and with no deadline that would have
 * stalled the entire run instead of failing one check.
 */
const DELETE_DEADLINE_MS = 30_000;

interface ProductRow {
    ID: string;
    Name: string | null;
    SKU: string | null;
    Description: string | null;
}

interface EventProductRow {
    ID: string;
    VenueName: string | null;
    Capacity: number | null;
}

interface EventProductViewRow {
    ID: string;
    Name: string;
    SKU: string;
    CompanyID: string;
    VenueName: string | null;
    Capacity: number | null;
}

// ─── Narrowing an IS-A link ─────────────────────────────────────────────────────────────────────
//
// `ISAParent`, `ISAChild` and `EnsureISAChild()` hand back a plain `BaseEntity`. What a subtype IS is
// its metadata name, so that is what narrows it — not `instanceof`, which a second copy of the entity
// package would silently defeat. Each helper throws with what the link actually held, so a missing or
// wrong subtype fails right there instead of as a null reference three lines later.

const linkedName = (entity: BaseEntity | null | undefined): string => entity?.EntityInfo?.Name ?? 'nothing';

function isEntity(entity: BaseEntity | null | undefined, entityName: string): boolean {
    return linkedName(entity).trim().toLowerCase() === entityName.trim().toLowerCase();
}

const isProduct = (entity: BaseEntity | null | undefined): entity is mjBizAppsOrdersProductEntity =>
    isEntity(entity, PRODUCT_ENTITY);

const isEventProduct = (entity: BaseEntity | null | undefined): entity is mjBizAppsOrdersEventProductEntity =>
    isEntity(entity, EVENT_PRODUCT_ENTITY);

const isEventOrderLine = (entity: BaseEntity | null | undefined): entity is mjBizAppsOrdersEventOrderLineEntity =>
    isEntity(entity, EVENT_ORDER_LINE_ENTITY);

function productOf(entity: BaseEntity | null | undefined, what: string): mjBizAppsOrdersProductEntity {
    if (isProduct(entity)) return entity;
    throw new Error(`${what}: expected the Product, got '${linkedName(entity)}'`);
}

function eventProductOf(entity: BaseEntity | null | undefined, what: string): mjBizAppsOrdersEventProductEntity {
    if (isEventProduct(entity)) return entity;
    throw new Error(`${what}: expected its Event Product, got '${linkedName(entity)}'`);
}

function eventOrderLineOf(entity: BaseEntity | null | undefined, what: string): mjBizAppsOrdersEventOrderLineEntity {
    if (isEventOrderLine(entity)) return entity;
    throw new Error(`${what}: expected its Event Order Line, got '${linkedName(entity)}'`);
}

/** Every check here asserts the DISJOINT contract. If the metadata ever changes, say so plainly. */
function requireDisjoint(parent: BaseEntity, what: string): void {
    Assert(
        !parent.EntityInfo.AllowMultipleSubtypes,
        `${what}: '${parent.EntityInfo.Name}' must be a DISJOINT IS-A parent (AllowMultipleSubtypes = false) — ` +
            `this bundle asserts the disjoint contract`,
    );
}

/** What went wrong, wherever the chain recorded it: a save a parent hands to its leaf reports on the leaf. */
function chainMessage(entity: BaseEntity): string {
    const messages = [entity.LatestResult?.CompleteMessage, entity.LeafEntity?.LatestResult?.CompleteMessage];
    return [...new Set(messages.filter((m) => !!m))].join(' | ') || 'no message was recorded';
}

// ─── Fixture products ───────────────────────────────────────────────────────────────────────────

/** Every product a check builds carries its own SKU, so each assertion finds ITS row — never a count of the world. */
const freshSku = (check: string): string => `ISA-${check}-${randomUUID().slice(0, 8).toUpperCase()}`;

/** The catalog columns every fixture product needs: a BCP conference, in BCP's own category tree. */
function catalogColumns() {
    const f = Fx();
    const category = World().Categories['BCP:CONFERENCES'];
    const revRec = f.RevRecTypeIDs.get('AllBackEnd');
    Assert(!!category, "ORD-WORLD has no 'BCP:CONFERENCES' category — see world/data/product-categories.csv");
    Assert(!!revRec, "RevenueRecognitionType 'AllBackEnd' missing — push the orders app metadata");
    Assert(!!f.ProductTypeIDs.Event, "ProductType 'Event' missing — push the orders app metadata");
    return {
        CompanyID: f.CoA.ID,
        ProductTypeID: f.ProductTypeIDs.Event,
        ProductCategoryID: category,
        RevenueRecognitionTypeID: revRec!,
    };
}

/** EventProduct's own columns. */
function setEventColumns(target: mjBizAppsOrdersEventProductEntity): void {
    target.EventStartsAt = EVENT_STARTS;
    target.EventEndsAt = EVENT_ENDS;
    target.VenueName = VENUE;
    target.Capacity = CAPACITY;
    target.RequiresAttendeeInfo = false;
}

/**
 * How a check names its product. Omit either to take a default; `Name: null` leaves Product.Name — a
 * NOT NULL column — unset, which is how IS7 gets a parent that refuses to save.
 */
interface ProductNames {
    Name?: string | null;
    SKU?: string;
}

/**
 * Both levels' columns, set on the ONE child object. The Product's columns are routed to the Product
 * by `BaseEntity.Set` (they are in `EntityInfo.ParentEntityFieldNames`); the rest stay on the child.
 */
function fillEventProduct(target: mjBizAppsOrdersEventProductEntity, check: string, names: ProductNames = {}): void {
    const catalog = catalogColumns();
    target.CompanyID = catalog.CompanyID;
    target.ProductTypeID = catalog.ProductTypeID;
    target.ProductCategoryID = catalog.ProductCategoryID;
    target.RevenueRecognitionTypeID = catalog.RevenueRecognitionTypeID;
    if (names.Name !== null) target.Name = names.Name ?? `ISA ${check} Summit`;
    target.SKU = names.SKU ?? freshSku(check);
    target.Status = 'Active';
    target.IsTaxable = false;
    setEventColumns(target);
}

/** A NEW Event Product with both levels filled in and nothing saved. */
async function newEventProduct(
    ctx: IntegrationCheckContext,
    check: string,
    names: ProductNames = {},
): Promise<mjBizAppsOrdersEventProductEntity> {
    const eventProduct = await ctx.Provider.GetEntityObject<mjBizAppsOrdersEventProductEntity>(
        EVENT_PRODUCT_ENTITY,
        ctx.User,
    );
    eventProduct.NewRecord();
    fillEventProduct(eventProduct, check, names);
    return eventProduct;
}

/** The same, saved — where every check starts that is about something other than the create. */
async function savedEventProduct(
    ctx: IntegrationCheckContext,
    check: string,
    names: ProductNames = {},
): Promise<mjBizAppsOrdersEventProductEntity> {
    const eventProduct = await newEventProduct(ctx, check, names);
    Assert(
        await eventProduct.Save(),
        `${check}: the fixture Event Product must save — ${chainMessage(eventProduct)}`,
    );
    return eventProduct;
}

/** A plain Product with NO EventProduct row — the thing IS6 promotes. */
async function newPlainProduct(
    ctx: IntegrationCheckContext,
    check: string,
    sku: string,
): Promise<mjBizAppsOrdersProductEntity> {
    const catalog = catalogColumns();
    const product = await ctx.Provider.GetEntityObject<mjBizAppsOrdersProductEntity>(PRODUCT_ENTITY, ctx.User);
    product.NewRecord();
    product.CompanyID = catalog.CompanyID;
    product.ProductTypeID = catalog.ProductTypeID;
    product.ProductCategoryID = catalog.ProductCategoryID;
    product.RevenueRecognitionTypeID = catalog.RevenueRecognitionTypeID;
    product.Name = `ISA ${check} Workshop`;
    product.SKU = sku;
    product.Status = 'Active';
    product.IsTaxable = false;
    return product;
}

async function loadProduct(ctx: IntegrationCheckContext, id: string, what: string): Promise<mjBizAppsOrdersProductEntity> {
    const product = await ctx.Provider.GetEntityObject<mjBizAppsOrdersProductEntity>(PRODUCT_ENTITY, ctx.User);
    Assert(await product.Load(id), `${what}: the Product row must load by the shared key`);
    return product;
}

async function loadEventProduct(
    ctx: IntegrationCheckContext,
    id: string,
    what: string,
): Promise<mjBizAppsOrdersEventProductEntity> {
    const eventProduct = await ctx.Provider.GetEntityObject<mjBizAppsOrdersEventProductEntity>(
        EVENT_PRODUCT_ENTITY,
        ctx.User,
    );
    Assert(await eventProduct.Load(id), `${what}: the Event Product must load by the shared key`);
    return eventProduct;
}

// ─── Reading the tables themselves ──────────────────────────────────────────────────────────────
//
// The VIEWS join the two levels back together, so they cannot say which table a column landed in.
// Only the base tables can, which is why these read them directly.

/** Every Product row carrying a SKU. A list, because "exactly one" is itself the assertion. */
const productRowsWithSku = (ctx: IntegrationCheckContext, sku: string) =>
    TxQuery<ProductRow>(ctx, `SELECT ID, Name, SKU, Description FROM ${ORDERS_SCHEMA}.Product WHERE SKU = '${sku}'`);

const productRow = (ctx: IntegrationCheckContext, id: string) =>
    TxMaybeOne<ProductRow>(ctx, `SELECT ID, Name, SKU, Description FROM ${ORDERS_SCHEMA}.Product WHERE ID = '${id}'`);

const eventProductRow = (ctx: IntegrationCheckContext, id: string) =>
    TxMaybeOne<EventProductRow>(ctx, `SELECT ID, VenueName, Capacity FROM ${ORDERS_SCHEMA}.EventProduct WHERE ID = '${id}'`);

const orderLineRow = (ctx: IntegrationCheckContext, id: string) =>
    TxMaybeOne<{ ID: string }>(ctx, `SELECT ID FROM ${ORDERS_SCHEMA}.OrderLine WHERE ID = '${id}'`);

const eventOrderLineRow = (ctx: IntegrationCheckContext, id: string) =>
    TxMaybeOne<{ ID: string; PersonID: string; Comments: string | null }>(
        ctx,
        `SELECT ID, PersonID, Comments FROM ${ORDERS_SCHEMA}.EventOrderLine WHERE ID = '${id}'`,
    );

// ─── Deletes, against a clock ───────────────────────────────────────────────────────────────────

/**
 * Run a delete against {@link DELETE_DEADLINE_MS}, failing with a message that names the defect instead
 * of hanging the suite. MJ#4850 (fixed in MJ#4891): `Delete()` on a loaded parent that hands the
 * delete to its IS-A child waited on its OWN pending delete when the child called back up the chain,
 * and never returned.
 */
async function deleteWithinDeadline(ctx: IntegrationCheckContext, entity: BaseEntity, what: string): Promise<boolean> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const deadline = new Promise<'timed-out'>((resolve) => {
        timer = setTimeout(() => resolve('timed-out'), DELETE_DEADLINE_MS);
    });
    try {
        const outcome = await Promise.race([entity.Delete(), deadline]);
        if (outcome === 'timed-out') {
            await releaseStrandedScope(ctx);
            throw new Error(
                `${what} did not return within ${DELETE_DEADLINE_MS / 1000}s — ` +
                    `the IS-A parent delete that waits on itself (MJ#4850, fixed in MJ#4891) is back`,
            );
        }
        return outcome;
    } finally {
        if (timer) clearTimeout(timer);
    }
}

/**
 * A delete that never returns strands the transaction scope its leaf opened, one level above this
 * check's own. Roll that level back, so the check's own rollback — and every check after it — settles
 * where it should. Best-effort, and it only ever runs once the check has already failed.
 */
async function releaseStrandedScope(ctx: IntegrationCheckContext): Promise<void> {
    const provider = ctx.Provider;
    if (!(provider instanceof DatabaseProviderBase)) {
        console.warn('      orders-isa: the provider is not a DatabaseProviderBase; the stranded delete scope stays open');
        return;
    }
    try {
        await provider.RollbackTransaction();
    } catch (e) {
        console.warn(`      orders-isa: could not release the stranded delete scope: ${e instanceof Error ? e.message : String(e)}`);
    }
}

export const IsaChecks: NamedCheck[] = [
    {
        Id: 'orders-isa.IS1',
        Name: 'IS1: an Event Product saved through the child writes a Product row and an EventProduct row under ONE key',
        RequiresMutation: true,
        Fn: async (ctx) =>
            InRolledBackTransaction(ctx, async () => {
                const sku = freshSku('IS1');
                const eventProduct = await newEventProduct(ctx, 'IS1', { SKU: sku });

                // Before anything is saved the chain is already one record. GetEntityObject built a
                // Product for this child, and that Product links BACK to it — MJ#4870, fixed in MJ#4891;
                // without the back-link the parent's LeafEntity was the parent, not the child.
                const parent = productOf(eventProduct.ISAParent, "IS1: the new child's ISAParent");
                requireDisjoint(parent, 'IS1');
                Assert(parent.ISAChild === eventProduct, 'IS1: the Product the child built must link back to it (MJ#4870)');
                Assert(parent.LeafEntity === eventProduct, "IS1: the Product's LeafEntity is the Event Product");
                // A Product column set on the CHILD lands on the Product object, and GetAll() on the
                // child carries it.
                AssertEqual(parent.SKU, sku, 'IS1: SKU set on the child is routed to the Product');
                const merged: Record<string, unknown> = eventProduct.GetAll();
                AssertEqual(merged['SKU'], sku, "IS1: GetAll() on the child includes the Product's columns");

                Assert(await eventProduct.Save(), `IS1: save failed — ${chainMessage(eventProduct)}`);

                // Find the row by the SKU only this check used, then assert about it.
                const products = await productRowsWithSku(ctx, sku);
                AssertEqual(products.length, 1, 'IS1: exactly one Product row carries the fixture SKU');
                Assert(SameID(products[0].ID, eventProduct.ID), 'IS1: the Product row has the key the chain minted');
                AssertEqual(products[0].Name, 'ISA IS1 Summit', 'IS1: Product.Name is in the Product table');

                const row = await eventProductRow(ctx, products[0].ID);
                Assert(row != null, 'IS1: an EventProduct row exists under the SAME key');
                AssertEqual(row?.VenueName, VENUE, 'IS1: EventProduct.VenueName is in the EventProduct table');
                AssertEqual(Number(row?.Capacity), CAPACITY, 'IS1: EventProduct.Capacity is in the EventProduct table');
            }),
    },
    {
        Id: 'orders-isa.IS2',
        Name: "IS2: the Event Products view carries the Product's columns — RunView filters and sorts on them",
        RequiresMutation: true,
        Fn: async (ctx) =>
            InRolledBackTransaction(ctx, async () => {
                // Two products, saved in the WRONG order, so a sort on a Product column has work to do.
                const batch = freshSku('IS2');
                for (const suffix of ['B', 'A']) {
                    const eventProduct = await newEventProduct(ctx, 'IS2', {
                        Name: `ISA IS2 Summit ${suffix}`,
                        SKU: `${batch}-${suffix}`,
                    });
                    Assert(await eventProduct.Save(), `IS2: saving ${suffix} failed — ${chainMessage(eventProduct)}`);
                }

                // SKU, CompanyID and Name live on Product. CodeGen joins Product into the child's base
                // view and mirrors those columns as fields of the child, which is what lets a view of
                // the CHILD filter and sort on them.
                const result = await RunView.FromMetadataProvider(ctx.Provider).RunView<EventProductViewRow>(
                    {
                        EntityName: EVENT_PRODUCT_ENTITY,
                        ExtraFilter: `SKU LIKE '${batch}-%' AND CompanyID = '${Fx().CoA.ID}'`,
                        OrderBy: 'Name',
                        Fields: ['ID', 'Name', 'SKU', 'CompanyID', 'VenueName', 'Capacity'],
                        ResultType: 'simple',
                    },
                    ctx.User,
                );
                Assert(result.Success, `IS2: RunView on the child failed — ${result.ErrorMessage}`);
                const rows = result.Results ?? [];
                AssertEqual(
                    rows.map((r) => r.SKU).join(', '),
                    `${batch}-A, ${batch}-B`,
                    'IS2: filtered on SKU and CompanyID and sorted on Name — all three Product columns',
                );
                for (const row of rows) {
                    Assert(SameID(row.CompanyID, Fx().CoA.ID), `IS2: ${row.SKU} carries the Product's CompanyID`);
                    AssertEqual(row.VenueName, VENUE, `IS2: ${row.SKU} carries its own VenueName in the same row`);
                    AssertEqual(Number(row.Capacity), CAPACITY, `IS2: ${row.SKU} carries its own Capacity in the same row`);
                }
            }),
    },
    {
        Id: 'orders-isa.IS3',
        Name: 'IS3: loading a Product finds its subtype — ISAChild and LeafEntity are the Event Product, loaded',
        RequiresMutation: true,
        Fn: async (ctx) =>
            InRolledBackTransaction(ctx, async () => {
                const saved = await savedEventProduct(ctx, 'IS3');

                // Load the PARENT. Nothing tells it what it is: discovery asks each child table for a
                // row under this key (FindISAChildEntity) and links the one that answers.
                const product = await loadProduct(ctx, saved.ID, 'IS3');
                requireDisjoint(product, 'IS3');
                const child = eventProductOf(product.ISAChild, "IS3: the loaded Product's ISAChild");
                Assert(product.LeafEntity === child, 'IS3: LeafEntity is the Event Product — the deepest level');
                Assert(
                    child.ISAParent === product,
                    'IS3: the discovered child hangs off THIS Product object — one chain, not two',
                );
                AssertEqual(child.VenueName, VENUE, "IS3: the child's own columns are loaded");
                AssertEqual(Number(child.Capacity), CAPACITY, "IS3: the child's Capacity is loaded");
            }),
    },
    {
        Id: 'orders-isa.IS4',
        Name: 'IS4: a Product column changed through a loaded Event Product updates the Product row',
        RequiresMutation: true,
        Fn: async (ctx) =>
            InRolledBackTransaction(ctx, async () => {
                const sku = freshSku('IS4');
                const saved = await savedEventProduct(ctx, 'IS4', { SKU: sku });
                const eventProduct = await loadEventProduct(ctx, saved.ID, 'IS4');

                // Name belongs to Product. Set on the child it is routed to the parent, and the chain
                // save writes the parent first — an UPDATE of the row that exists, never a second one.
                eventProduct.Name = 'ISA IS4 Summit (renamed)';
                Assert(await eventProduct.Save(), `IS4: save failed — ${chainMessage(eventProduct)}`);

                const products = await productRowsWithSku(ctx, sku);
                AssertEqual(products.length, 1, 'IS4: still exactly one Product row for the SKU');
                AssertEqual(products[0].Name, 'ISA IS4 Summit (renamed)', 'IS4: the rename landed on the Product row');
                AssertEqual(
                    (await eventProductRow(ctx, products[0].ID))?.VenueName,
                    VENUE,
                    'IS4: the EventProduct row is still there, untouched',
                );
            }),
    },
    {
        Id: 'orders-isa.IS5',
        Name: 'IS5: Save() on a loaded Product hands the save to its Event Product, and both levels persist',
        RequiresMutation: true,
        Fn: async (ctx) =>
            InRolledBackTransaction(ctx, async () => {
                const saved = await savedEventProduct(ctx, 'IS5');
                const product = await loadProduct(ctx, saved.ID, 'IS5');
                requireDisjoint(product, 'IS5');
                const child = eventProductOf(product.ISAChild, "IS5: the loaded Product's ISAChild");

                // One edit on each level, then Save() on the PARENT. A disjoint parent with its child
                // linked hands the save to the leaf, and the leaf writes the whole chain, Product first.
                product.Description = 'IS5: edited on the Product';
                child.VenueName = 'IS-A Annex';
                Assert(await product.Save(), `IS5: save failed — ${chainMessage(product)}`);

                AssertEqual(
                    (await productRow(ctx, saved.ID))?.Description,
                    'IS5: edited on the Product',
                    "IS5: the Product's own edit persisted",
                );
                AssertEqual(
                    (await eventProductRow(ctx, saved.ID))?.VenueName,
                    'IS-A Annex',
                    "IS5: the Event Product's edit persisted through the Product's Save()",
                );
            }),
    },
    {
        Id: 'orders-isa.IS6',
        Name: 'IS6: AttachToParent promotes an existing Product in place, and a key with no Product leaves a fresh chain',
        RequiresMutation: true,
        Fn: async (ctx) =>
            InRolledBackTransaction(ctx, async () => {
                // ── A key with no Product row: false, and the record is exactly what NewRecord() built ──
                const fresh = await ctx.Provider.GetEntityObject<mjBizAppsOrdersEventProductEntity>(
                    EVENT_PRODUCT_ENTITY,
                    ctx.User,
                );
                fresh.NewRecord();
                const minted = fresh.ID;
                const missing = randomUUID();
                Assert(
                    !(await fresh.AttachToParent(CompositeKey.FromID(missing))),
                    'IS6: there is no Product under a random key — AttachToParent must return false',
                );
                Assert(SameID(fresh.ID, minted), 'IS6: a failed attach keeps the key NewRecord() minted');
                const freshParent = productOf(fresh.ISAParent, "IS6: the fresh chain's ISAParent");
                requireDisjoint(freshParent, 'IS6');
                Assert(!freshParent.IsSaved, 'IS6: the parent is still NEW, so it will INSERT rather than UPDATE');
                // Restoring the fresh chain re-seeds the parent, which drops its back-link; MJ#4870
                // (fixed in MJ#4891) puts it back.
                Assert(freshParent.ISAChild === fresh, 'IS6: the restored Product still links back to the child (MJ#4870)');
                fillEventProduct(fresh, 'IS6');
                Assert(await fresh.Save(), `IS6: the fresh chain must still save — ${chainMessage(fresh)}`);
                Assert((await productRow(ctx, minted)) != null, 'IS6: it saved as a fresh chain, under its own key');
                Assert((await productRow(ctx, missing)) == null, 'IS6: and nothing was written under the missing key');

                // ── An existing Product: promoted in place ──
                const sku = freshSku('IS6');
                const plain = await newPlainProduct(ctx, 'IS6', sku);
                Assert(await plain.Save(), `IS6: the plain Product must save — ${chainMessage(plain)}`);
                const name = plain.Name;

                const promoted = await ctx.Provider.GetEntityObject<mjBizAppsOrdersEventProductEntity>(
                    EVENT_PRODUCT_ENTITY,
                    ctx.User,
                );
                promoted.NewRecord();
                Assert(
                    await promoted.AttachToParent(CompositeKey.FromID(plain.ID)),
                    'IS6: AttachToParent must find the existing Product row',
                );
                Assert(SameID(promoted.ID, plain.ID), 'IS6: the child adopted the existing key');
                AssertEqual(promoted.Name, name, "IS6: the loaded Product's values show through the child");
                // A Product column too, so the parent's half of the save is an UPDATE of the existing row.
                promoted.Description = 'IS6: promoted to an event';
                setEventColumns(promoted);
                Assert(await promoted.Save(), `IS6: the promotion must save — ${chainMessage(promoted)}`);

                const products = await productRowsWithSku(ctx, sku);
                AssertEqual(products.length, 1, 'IS6: promotion updates the existing Product — never a second row');
                Assert(SameID(products[0].ID, plain.ID), 'IS6: under the original key');
                AssertEqual(products[0].Name, name, 'IS6: the Product keeps its own values');
                AssertEqual(products[0].Description, 'IS6: promoted to an event', 'IS6: and takes the edit made through the child');
                Assert(
                    (await eventProductRow(ctx, plain.ID)) != null,
                    'IS6: the EventProduct row was inserted under the existing key',
                );
            }),
    },
    {
        Id: 'orders-isa.IS7',
        Name: 'IS7: a failed chain save leaves no row at either level — the child reports a parent refusal, and a child refusal rolls the parent back',
        RequiresMutation: true,
        Fn: async (ctx) => {
            const f = Fx();
            const incompleteSku = freshSku('IS7');
            let draftID: string | null = null;

            // NOT rolled back — see the header. The chain's own scope has to be the outermost
            // transaction, or a rolled-back parent row proves nothing about who rolled it back.
            await OutsideTransaction(
                async () => {
                    // ── The PARENT refuses: its failure is reported on the child, and nothing is written ──
                    // Product.Name is NOT NULL, and it is the PRODUCT's column — so the parent refuses.
                    const incomplete = await newEventProduct(ctx, 'IS7', { Name: null, SKU: incompleteSku });
                    Assert(!(await incomplete.Save()), 'IS7: a Product with no Name must be refused');
                    const refusal = incomplete.LatestResult?.CompleteMessage ?? '';
                    Assert(
                        refusal.includes(`Failed to save parent entity '${PRODUCT_ENTITY}'`) &&
                            /Name cannot be null/.test(refusal),
                        `IS7: the child's own result must carry the Product's refusal, got: ${refusal}`,
                    );
                    AssertEqual(
                        (await productRowsWithSku(ctx, incompleteSku)).length,
                        0,
                        'IS7: a parent refusal writes no Product row',
                    );

                    // ── The CHILD is refused by the database, after its parent's row was written ──
                    // The line needs an order to hang off (OrderLine.OrderHeaderID is a real FK). Writing
                    // it inside an outer transaction would demote the chain's scope to a savepoint, which
                    // is exactly what this check avoids — so the draft commits, and the cleanup removes it.
                    const draft = await BuildOrder(ctx.User, { CompanyID: f.CoA.ID, Lines: [] });
                    Assert(await draft.Order.Save(), `IS7: the fixture draft must save — ${chainMessage(draft.Order)}`);
                    const headerID = draft.Order.ID;
                    draftID = headerID;

                    const attendee = await ctx.Provider.GetEntityObject<mjBizAppsOrdersEventOrderLineEntity>(
                        EVENT_ORDER_LINE_ENTITY,
                        ctx.User,
                    );
                    attendee.NewRecord();
                    const lineID = attendee.ID;
                    // The Order Line's columns, set on the child and routed to the parent. Its parent is
                    // OrderLineEntityServer, so the app's own Save() override runs inside the chain.
                    attendee.OrderHeaderID = headerID;
                    attendee.ProductID = f.Products.EventTicket;
                    attendee.LineNumber = 1;
                    attendee.Quantity = 1;
                    attendee.UnitPrice = TICKET_PRICE;
                    attendee.DiscountPct = 0;
                    // A Person that does not exist. Nothing client-side checks a foreign key, so the
                    // EventOrderLine INSERT is the first thing to refuse it — and the chain writes the
                    // OrderLine row before that INSERT runs.
                    attendee.PersonID = randomUUID();

                    Assert(!(await attendee.Save()), 'IS7: an attendee who is not a Person must be refused');
                    const message = attendee.LatestResult?.CompleteMessage ?? '';
                    // A refusal naming the CHILD's constraint also proves the parent had been written:
                    // the child's own write only runs once its parent's save has succeeded.
                    Assert(
                        /FK_EventOrderLine_Person/.test(message),
                        `IS7: the child's own result must name the constraint that refused it, got: ${message}`,
                    );
                    Assert(
                        (await orderLineRow(ctx, lineID)) == null,
                        'IS7: the OrderLine row the chain wrote first must be rolled back with the refused child',
                    );
                    Assert((await eventOrderLineRow(ctx, lineID)) == null, 'IS7: and there is no EventOrderLine row');
                    Assert(!attendee.IsSaved, 'IS7: the Event Order Line object does not report itself saved');
                    // The Order Line OBJECT is deliberately not asserted. After the rollback MJ still marks
                    // it saved under a key whose row no longer exists (nothing restores a parent's in-memory
                    // state when the chain's scope rolls back), so saving the same object again would fail.
                    // That is a defect to fix in MemberJunction, not a contract to pin here.
                    const onDraft = await TxQuery<{ ID: string }>(
                        ctx,
                        `SELECT ID FROM ${ORDERS_SCHEMA}.OrderLine WHERE OrderHeaderID = '${headerID}'`,
                    );
                    AssertEqual(onDraft.length, 0, 'IS7: the committed draft is left with no line on it');
                },
                async () => {
                    await TxQuery(
                        ctx,
                        `DELETE FROM ${ORDERS_SCHEMA}.EventProduct WHERE ID IN
                            (SELECT ID FROM ${ORDERS_SCHEMA}.Product WHERE SKU = '${incompleteSku}')`,
                    );
                    await TxQuery(ctx, `DELETE FROM ${ORDERS_SCHEMA}.Product WHERE SKU = '${incompleteSku}'`);
                    if (!draftID) return;
                    await TxQuery(
                        ctx,
                        `DELETE FROM ${ORDERS_SCHEMA}.EventOrderLine WHERE ID IN
                            (SELECT ID FROM ${ORDERS_SCHEMA}.OrderLine WHERE OrderHeaderID = '${draftID}')`,
                    );
                    await TxQuery(ctx, `DELETE FROM ${ORDERS_SCHEMA}.OrderLine WHERE OrderHeaderID = '${draftID}'`);
                    await TxQuery(ctx, `DELETE FROM ${ORDERS_SCHEMA}.OrderHeader WHERE ID = '${draftID}'`);
                },
            );
        },
    },
    {
        Id: 'orders-isa.IS8',
        Name: 'IS8: deleting an Event Product deletes its Product row too',
        RequiresMutation: true,
        Fn: async (ctx) =>
            InRolledBackTransaction(ctx, async () => {
                const saved = await savedEventProduct(ctx, 'IS8');
                const id = saved.ID;
                const eventProduct = await loadEventProduct(ctx, id, 'IS8');
                requireDisjoint(productOf(eventProduct.ISAParent, "IS8: the loaded child's ISAParent"), 'IS8');

                // The child deletes its own row, then — its parent being disjoint — the Product's, in one
                // transaction. This direction never had MJ#4850, but a chain delete that stops returning
                // would stall every bundle after this one, so it runs against the same deadline as IS9.
                Assert(
                    await deleteWithinDeadline(ctx, eventProduct, 'IS8: EventProduct.Delete()'),
                    `IS8: delete failed — ${chainMessage(eventProduct)}`,
                );
                Assert((await eventProductRow(ctx, id)) == null, 'IS8: the EventProduct row is gone');
                Assert(
                    (await productRow(ctx, id)) == null,
                    'IS8: and so is the Product row — a disjoint parent always goes with its child',
                );
            }),
    },
    {
        Id: 'orders-isa.IS9',
        Name: 'IS9: Delete() on a loaded Product with its Event Product linked removes both rows and returns (MJ#4850)',
        RequiresMutation: true,
        Fn: async (ctx) =>
            InRolledBackTransaction(ctx, async () => {
                const saved = await savedEventProduct(ctx, 'IS9');
                const id = saved.ID;
                const product = await loadProduct(ctx, id, 'IS9');
                requireDisjoint(product, 'IS9');
                // The shape MJ#4850 hung on: the child is LINKED, so the parent hands the delete to it.
                // Unlinked, the delete would take a different path and prove something else.
                eventProductOf(product.ISAChild, "IS9: the loaded Product's ISAChild");

                // MJ#4850, fixed in MJ#4891: the Product hands its Delete() to the leaf, the leaf deletes
                // its own row and calls back up the chain — and the Product's second Delete() used to
                // wait on the first one's pending result, which was waiting on it. It never returned.
                Assert(
                    await deleteWithinDeadline(ctx, product, 'IS9: Product.Delete()'),
                    `IS9: delete failed — ${chainMessage(product)}`,
                );
                Assert((await eventProductRow(ctx, id)) == null, 'IS9: the EventProduct row is gone');
                Assert((await productRow(ctx, id)) == null, 'IS9: and the Product row with it');
            }),
    },
    {
        Id: 'orders-isa.IS10',
        Name: "IS10: an order line's Event Order Line, saved with the order, is found again by loading the line",
        RequiresMutation: true,
        Fn: async (ctx) =>
            InRolledBackTransaction(ctx, async () => {
                const f = Fx();
                const built = await BuildOrder(ctx.User, {
                    CompanyID: f.CoA.ID,
                    Lines: [{ ProductID: f.Products.EventTicket, Quantity: 1, UnitPrice: TICKET_PRICE }],
                });
                const ticket = built.Lines[0];

                // EnsureISAChild on a NEW line — the call CheckoutSessionService and the order-lines
                // editor make. The line has no row yet, so the child copies its key instead of reading
                // one; MJ#4859 (fixed in MJ#4891) stopped that path logging the miss. A check cannot
                // see a log line, so this exercises the fixed path without guarding it.
                const attendee = eventOrderLineOf(
                    await ticket.EnsureISAChild(EVENT_ORDER_LINE_ENTITY),
                    'IS10: the new ticket line',
                );
                Assert(
                    ticket.ISAChild === attendee && attendee.ISAParent === ticket,
                    'IS10: EnsureISAChild links the child both ways',
                );
                Assert(
                    (await ticket.EnsureISAChild(EVENT_ORDER_LINE_ENTITY)) === attendee,
                    'IS10: asking again returns the SAME child — EnsureISAChild is idempotent',
                );
                attendee.PersonID = f.Customers.PersonID;
                attendee.Comments = ATTENDEE_NOTE;

                // The ORDER saves the line (OrderLineEntityServer.Save, with its Extension companion's
                // persistence hook), and the line hands the save to its leaf, which writes both rows.
                Assert(await built.Order.Save(), `IS10: the draft must save — ${chainMessage(built.Order)}`);
                const row = await eventOrderLineRow(ctx, ticket.ID);
                Assert(row != null, "IS10: the order save wrote an EventOrderLine row under the line's own key");

                // Load the LINE, knowing nothing about events: discovery finds the subtype, and the
                // line's Extension companion reads the same child the chain holds.
                const line = await ctx.Provider.GetEntityObject<OrderLineEntity>(ORDER_LINE_ENTITY, ctx.User);
                Assert(await line.Load(ticket.ID), 'IS10: the order line loads');
                requireDisjoint(line, 'IS10');
                const found = eventOrderLineOf(line.ISAChild, "IS10: the reloaded order line's ISAChild");
                Assert(line.LeafEntity === found, 'IS10: LeafEntity is the Event Order Line');
                Assert(line.Extension.Entity === found, "IS10: the line's Extension companion exposes the discovered child");
                Assert(SameID(found.PersonID, f.Customers.PersonID), 'IS10: the attendee came back with the line');
                AssertEqual(found.Comments, ATTENDEE_NOTE, "IS10: and so did the attendee's note");
            }),
    },
];

for (const check of IsaChecks) {
    IntegrationCheckRegistry.Instance.Register(check);
}

IntegrationCheckRegistry.Instance.RegisterLifecycle('orders-isa', {
    Setup: async (ctx) => {
        await CreateOrdersFixture(ctx);
    },
    Teardown: TeardownOrdersFixture,
});
