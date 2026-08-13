/**
 * fixture.ts — the shared catalog every orders bundle books against, plus the transaction
 * discipline that makes the suite re-runnable.
 *
 * ISOLATION MODEL (integration-testing-plan §2, validated by the Phase 0 probe)
 * ----------------------------------------------------------------------------
 * MJ's own suite uses prefix-and-sweep teardown because its client-transport bundles have no
 * transaction surface. Every check we care about is SERVER transport, so that constraint doesn't
 * bind us and we take the stronger option:
 *
 *   - The WORLD (companies, GL, people, orgs, catalog, prices) is the committed ORD-WORLD loaded
 *     from CSV by ORD-00 / {@link CreateOrdersFixture}. Natural keys, no IT-ORD prefix.
 *   - Every MUTATING check runs inside its own provider transaction and ROLLS BACK. Orders, journal
 *     entries, payments and subscription terms never reach disk, so teardown never has to fight the
 *     immutability triggers or the cross-app FKs. The booking path opens its own transaction and
 *     accounting's CreateJournalEntries opens another inside that; the probe confirmed the resulting
 *     3-deep savepoint nesting commits and rolls back correctly.
 *   - Teardown of the world is a no-op: the catalog is shared with Explorer and the rest of the suite.
 *
 * THE ONE RULE THAT FOLLOWS: **every query goes through the provider** ({@link TxQuery}), never
 * through `ctx.Pool`. Two independent reasons, either sufficient:
 *   1. The pool is a DIFFERENT connection. Under READ COMMITTED it BLOCKS on an open check
 *      transaction's write locks until the request times out — the probe hung 15s on exactly that.
 *   2. `ctx.Pool` is only populated when the driver owned the bootstrap. Under `mj test` the CLI
 *      installs the instrumented cache first, so it arrives undefined.
 *
 * CONNECTS TO:
 *   TABLES: __mj.Company, __mj_BizAppsAccounting.{GLAccount,GLAccountLink,AccountingCompanyProfile},
 *           __mj_BizAppsOrders.{ProductType,ProductCategory,Product}
 *   USED BY: every bundle under ./checks
 */
import { randomUUID } from 'node:crypto';
import { BaseEntity, CompositeKey, Metadata } from '@memberjunction/core';
import type { IMetadataProvider } from '@memberjunction/core';
import { Assert, type IntegrationCheckContext } from '@memberjunction/testing-integration';
import { LoadWorld } from './world/load-world.js';
import { SetWorld } from './world/world.js';
import { FindId, FindRows, Quote } from './world/entity-io.js';

export const ORDERS_SCHEMA = '__mj_BizAppsOrders';
export const ACCT_SCHEMA = '__mj_BizAppsAccounting';
export const COMMON_SCHEMA = '__mj_BizAppsCommon';

import {
    PRODUCT_TYPE_ENTITY,
    PRODUCT_CATEGORY_ENTITY,
    PRODUCT_ENTITY,
    PRODUCT_ENTITLEMENT_ENTITY,
    EVENT_PRODUCT_ENTITY,
    PRODUCT_PRICE_ENTITY,
    PRODUCT_BUNDLE_ITEM_ENTITY,
    PROMOTION_ENTITY,
    PROMOTION_CODE_ENTITY,
    PROMOTION_TARGET_ENTITY,
    GL_ACCOUNT_ENTITY,
    INTERCOMPANY_ACCOUNT_MATCH_ENTITY,
    COMPANY_TAX_NEXUS_ENTITY,
} from './entity-names.js';

// Entity names live in ./entity-names.js — one definition each, so a typo is wrong in one place
// rather than silently wrong in fifteen. Re-exported here because callers have always imported
// PRODUCT_TYPE_ENTITY from the fixture.
export {
    PRODUCT_TYPE_ENTITY,
    PRODUCT_CATEGORY_ENTITY,
    PRODUCT_ENTITY,
    PRODUCT_ENTITLEMENT_ENTITY,
    EVENT_PRODUCT_ENTITY,
    PRODUCT_PRICE_ENTITY,
    PRODUCT_BUNDLE_ITEM_ENTITY,
    PROMOTION_ENTITY,
    PROMOTION_CODE_ENTITY,
    PROMOTION_TARGET_ENTITY,
} from './entity-names.js';

export interface FixtureCompany {
    ID: string;
    Name: string;
    /** GL account IDs by role key. */
    Accounts: Record<string, string>;
}

export interface OrdersFixture {
    /** Per-run marker, e.g. `IT-ORD-M3K9Z`. Every fixture row's Name starts with it. */
    Run: string;
    CurrencyCode: string;
    /** `__mj.Company` entity ID — GLAccountLink is polymorphic and needs it. */
    CompanyEntityID: string;
    /** Fully linked: AR + Sales + Deferred. Deliberately NO 'Sales Discounts' link, so the D11 net-into-sales fallback is exercised. */
    CoA: FixtureCompany;
    /** Second linked company — proves per-line company resolution on a multi-company order (D10). */
    CoB: FixtureCompany;
    /** Has GL accounts but NO links at all — the unresolvable case that must roll the whole confirm back (D12). */
    CoC: FixtureCompany;
    /**
     * REAL US tax geography (D73). Seeded HERE, in the integration fixture, and deliberately NOT in
     * `metadata/` — these are test facts, not application seed data, and shipping a US rate table
     * with the app would be a maintenance promise nobody made (Amith 2026-07-28).
     *
     * The set is chosen to exercise the four shapes that actually occur:
     *   - COUNTY VARIATION inside one state: Santa Clara 9.125% vs San Mateo 9.375%
     *   - a FLAT state with no locals: Maryland 6%, DC 6%
     *   - a REGIONAL add-on: Northern Virginia 6% vs 5.3% elsewhere
     *   - CITY + DISTRICT layering: NYC is state 4% + city 4.5% + MCTD 0.375%
     * Rates are approximate and dated; they are here to prove resolution, not to file returns.
     */
    Tax: {
        /** TaxJurisdiction IDs by short key. */
        JurisdictionIDs: Map<string, string>;
        /** Ship-to Address IDs by short key — the input to jurisdiction matching. */
        AddressIDs: Map<string, string>;
    };
    /** RevenueRecognitionType IDs by Code. */
    RevRecTypeIDs: Map<string, string>;
    /** SubscriptionType IDs by Code. */
    SubscriptionTypeIDs: Map<string, string>;
    /** PaymentType IDs by Code. */
    PaymentTypeIDs: Map<string, string>;
    ProductTypeIDs: { Simple: string; Subscription: string; Event: string; GiftCard: string };
    /** The event a ticket product is for — its dates drive the line's service period (D-EVENT). */
    Event: { StartsAt: Date; EndsAt: Date };
    /**
     * Who buys. Subscriptions are scoped to a subscriber, and `SubscriberScope` on the type decides
     * WHICH of these is legal — so we need both an organization and an individual to prove the
     * organization-only type rejects a person and the Either types accept both.
     */
    Customers: { OrganizationID: string; SecondOrganizationID: string; PersonID: string };
    /** Products by mnemonic — see {@link CreateOrdersFixture} for what each one is for. */
    Products: Record<string, string>;
    /**
     * `ProductEntitlement` template IDs by mnemonic (D27/D76). Chosen to cover all four validity
     * modes and both quantity shapes, because the modes are where the interesting behaviour is:
     * a perpetual download, a term-scoped seat count, an event window, and a fixed duration.
     */
    Entitlements: Record<string, string>;
}

// ─── Fixture handoff ───────────────────────────────────────────────────────────────────────────
//
// `IntegrationCheckContext` is a CLOSED interface owned by @memberjunction/testing-integration —
// it enumerates MJ's own bundle fixtures as named optional fields, so an external adopter has no
// slot to assign to. We keep ours in a module-scoped holder instead. That is safe here for the same
// reason MJ's own model is: the driver runs one bundle at a time in a dedicated, short-lived
// process, and Setup → checks → Teardown is strictly serial.

let currentFixture: OrdersFixture | undefined;

/** The fixture for the running bundle. Throws when Setup didn't run — a wiring bug, not a test failure. */
export function Fx(): OrdersFixture {
    Assert(currentFixture != null, 'orders fixture missing — the bundle lifecycle Setup did not run');
    return currentFixture!;
}

// ─── SQL helpers ───────────────────────────────────────────────────────────────────────────────

/**
 * Query on the PROVIDER's connection — the one a check's transaction lives on. Use this for every
 * read and write inside a check. See the header: `ctx.Pool` would block on the transaction's locks.
 */
export async function TxQuery<T = Record<string, unknown>>(
    ctx: IntegrationCheckContext,
    query: string,
): Promise<T[]> {
    const provider = ctx.Provider as unknown as { ExecuteSQL(q: string): Promise<unknown> };
    const rows = await provider.ExecuteSQL(query);
    return (Array.isArray(rows) ? rows : []) as T[];
}

/** The single row a query is expected to return; throws with the query when it returns none. */
export async function TxOne<T = Record<string, unknown>>(
    ctx: IntegrationCheckContext,
    query: string,
): Promise<T> {
    const rows = await TxQuery<T>(ctx, query);
    Assert(rows.length > 0, `expected a row from: ${query}`);
    return rows[0];
}

/**
 * The row, or `null` when there is none.
 *
 * `TxOne` ASSERTS a row exists, which is right when the caller's logic depends on one and wrong for
 * an EXISTENCE check — "does this company already have a nexus row?" has `no` as a perfectly good
 * answer. Using TxOne for that turns the common case into a thrown assertion, which is exactly how
 * an idempotency guard becomes a hard failure.
 */
export async function TxMaybeOne<T = Record<string, unknown>>(
    ctx: IntegrationCheckContext,
    query: string,
): Promise<T | null> {
    const rows = await TxQuery<T>(ctx, query);
    return rows.length > 0 ? rows[0] : null;
}

/**
 * Compare two GUIDs. SQL Server returns `UNIQUEIDENTIFIER` uppercased while `randomUUID()` produces
 * lowercase, so a bare `===` between a fixture ID and a queried one is always false — a trap that
 * silently turns a real assertion into one that can never pass.
 */
export function SameID(a: string | null | undefined, b: string | null | undefined): boolean {
    return a != null && b != null && a.toLowerCase() === b.toLowerCase();
}

/** Normalized GUID for set membership and sorting. */
export const NormID = (v: string) => v.toLowerCase();

/**
 * Fixture setup/teardown query. Same connection as {@link TxQuery} — the distinct name marks
 * INTENT: these run with no check transaction open, and the rows they write are COMMITTED.
 *
 * Deliberately NOT `ctx.Pool`. The driver only populates that field when it owned the bootstrap
 * itself; on the `mj test` path the CLI installs the instrumented cache first, so `Pool` arrives
 * undefined and a pool-based fixture fails at setup with a message that sounds like a platform
 * problem ("SQL-Server-only") when it is really a transport-plumbing difference. The provider is
 * present on every path, so routing through it makes the suite work identically under `mj test`
 * and under the standalone dispatcher.
 */
async function PoolQuery<T = Record<string, unknown>>(
    ctx: IntegrationCheckContext,
    query: string,
): Promise<T[]> {
    return TxQuery<T>(ctx, query);
}

const provider = (ctx: IntegrationCheckContext) =>
    ctx.Provider as unknown as IMetadataProvider & {
        BeginTransaction(): Promise<void>;
        RollbackTransaction(): Promise<void>;
    };

/**
 * Run `body` inside a transaction that ALWAYS rolls back — the isolation primitive every mutating
 * check is written against.
 *
 * A check that fails still rolls back (the rollback is in `finally`), so one failure never poisons
 * the checks after it. The body's own error propagates so the driver reports the real failure and
 * not a teardown artifact.
 */
export async function InRolledBackTransaction(
    ctx: IntegrationCheckContext,
    body: () => Promise<void>,
): Promise<void> {
    const p = provider(ctx);
    await p.BeginTransaction();
    try {
        await body();
    } finally {
        try {
            await p.RollbackTransaction();
        } catch (e) {
            // "Transaction has been aborted" means SQL Server already rolled it back — a
            // severity-16 error inside a trigger dooms the whole transaction, savepoints included,
            // so by the time we ask, there is nothing left to roll back. Isolation still held.
            // What does NOT hold is the provider's depth counter: RollbackTransaction throws before
            // clearing it, so the next check's BeginTransaction would nest a savepoint onto a dead
            // transaction and cascade failures through the rest of the bundle. Reset it.
            const aborted = /transaction has been aborted|no active transaction/i.test(
                String((e as Error).message),
            );
            if (!aborted) throw e;
            resetTransactionState(p);
        }
    }
}

/**
 * Clear the provider's transaction bookkeeping after SQL Server killed the transaction underneath
 * it. Reaching into private state is not something to do lightly — it is here because the provider
 * has no public recovery path for a server-side abort, and the alternative is one doomed transaction
 * poisoning every check after it. Prefer {@link OutsideTransaction} for checks that EXPECT to
 * trigger a database guard; this is the safety net, not the plan.
 */
function resetTransactionState(p: unknown): void {
    const internals = p as { _transaction?: unknown; _transactionDepth?: number; _savepointStack?: unknown[] };
    internals._transaction = null;
    internals._transactionDepth = 0;
    internals._savepointStack = [];
}

/**
 * Run a check WITHOUT the shared transaction, cleaning up explicitly afterwards.
 *
 * For checks whose whole point is to trip a database guard. A trigger that raises a severity-16
 * error dooms its enclosing transaction — that is correct behaviour and exactly what we want to
 * prove — but it makes rollback-based isolation impossible for that check. `cleanup` runs in a
 * `finally` and is best-effort, so a failed assertion still tidies up.
 */
export async function OutsideTransaction(
    body: () => Promise<void>,
    cleanup: () => Promise<void>,
): Promise<void> {
    try {
        await body();
    } finally {
        await cleanup().catch((e) => console.warn(`      cleanup warn: ${(e as Error).message}`));
    }
}

// ─── Setup ─────────────────────────────────────────────────────────────────────────────────────

/**
 * Build the shared catalog. Committed, because it is inert reference data — every check that books
 * against it does so inside a transaction that rolls back.
 *
 * Companies are seeded directly rather than through `AccountingCompanyProfile`'s auto-seeding COA
 * save: booking depends only on Company + GLAccount + GLAccountLink, so the minimal fixture keeps
 * these checks about the ORDERS path rather than accounting's own setup flow.
 */
export async function CreateOrdersFixture(ctx: IntegrationCheckContext): Promise<OrdersFixture> {
    const world = await LoadWorld(ctx);
    SetWorld(world);

    const requireProduct = (mnemonic: string): string => {
        const id = world.ProductMnemonics[mnemonic];
        Assert(id != null, `ORD-WORLD product mnemonic '${mnemonic}' was not loaded`);
        return id;
    };

    const fixture: OrdersFixture = {
        Run: 'ORD-WORLD',
        CurrencyCode: world.CurrencyCode,
        CompanyEntityID: world.CompanyEntityID,
        CoA: {
            ID: world.Companies.BCP.ID,
            Name: world.Companies.BCP.Name,
            Accounts: world.Companies.BCP.Accounts,
        },
        CoB: {
            ID: world.Companies.HH.ID,
            Name: world.Companies.HH.Name,
            Accounts: world.Companies.HH.Accounts,
        },
        CoC: {
            ID: world.Companies.ORPHAN.ID,
            Name: world.Companies.ORPHAN.Name,
            Accounts: world.Companies.ORPHAN.Accounts,
        },
        RevRecTypeIDs: world.RevRecTypeIDs,
        SubscriptionTypeIDs: world.SubscriptionTypeIDs,
        PaymentTypeIDs: world.PaymentTypeIDs,
        ProductTypeIDs: {
            Simple: world.ProductTypeIDs.Service,
            Subscription: world.ProductTypeIDs.Membership,
            Event: world.ProductTypeIDs.Event,
            GiftCard: world.ProductTypeIDs.GiftCard,
        },
        Event: world.Event,
        Customers: {
            OrganizationID: world.Organizations.RIV,
            SecondOrganizationID: world.Organizations.NGS,
            PersonID: world.People['jordan.blake@example.com'],
        },
        Products: {
            WidgetA: requireProduct('WidgetA'),
            GiftCardA: requireProduct('GiftCardA'),
            BundleA: requireProduct('BundleA'),
            BundlePartX: requireProduct('BundlePartX'),
            BundlePartY: requireProduct('BundlePartY'),
            WidgetB: requireProduct('WidgetB'),
            WidgetC: requireProduct('WidgetC'),
            EventA: requireProduct('EventA'),
            DeferredA: requireProduct('DeferredA'),
            SubRolling: requireProduct('SubRolling'),
            SubCalendar: requireProduct('SubCalendar'),
            SubFiscal: requireProduct('SubFiscal'),
            SubSeat: requireProduct('SubSeat'),
            SubMonthly: requireProduct('SubMonthly'),
            EventTicket: requireProduct('EventTicket'),
            EventTicketB: requireProduct('EventTicketB'),
        },
        Entitlements: { ...world.Entitlements },
        Tax: {
            JurisdictionIDs: new Map(Object.entries(world.Jurisdictions)),
            AddressIDs: new Map(Object.entries(world.Addresses)),
        },
    };

    currentFixture = fixture;
    return fixture;
}

export async function CreateProductPrice(
    ctx: IntegrationCheckContext,
    productID: string,
    amount: number,
    opts: {
        PricingModel?: string;
        FeeType?: string;
        Priority?: number;
        PriceListID?: string | null;
        MinQuantity?: number | null;
        MaxQuantity?: number | null;
        EffectiveFrom?: string;
        EffectiveTo?: string | null;
        PackageQuantity?: number | null;
    } = {},
): Promise<string | null> {
    const feeType = opts.FeeType ?? 'Standard';
    const priority = opts.Priority ?? 0;
    const listClause = opts.PriceListID
        ? `PriceListID = '${Quote(opts.PriceListID)}'`
        : 'PriceListID IS NULL';
    const existing = await FindRows<{ ID: string }>(
        ctx,
        PRODUCT_PRICE_ENTITY,
        `ProductID = '${Quote(productID)}' AND Status = 'Active' AND FeeType = '${Quote(feeType)}' AND Priority = ${priority} AND ${listClause}`,
        ['ID'],
    );
    if (existing.length) {
        // Update the amount inside this transaction so a check that says "price this at 100"
        // actually gets 100. Rollback restores the committed world price.
        return upsertViaEntity(ctx, PRODUCT_PRICE_ENTITY, existing[0].ID, { Amount: amount });
    }

    return createViaEntity(ctx, PRODUCT_PRICE_ENTITY, {
        ProductID: productID,
        PricingModel: opts.PricingModel ?? 'PerUnit',
        FeeType: opts.FeeType ?? 'Standard',
        Amount: amount,
        EffectiveFrom: opts.EffectiveFrom ?? '2020-01-01',
        EffectiveTo: opts.EffectiveTo ?? null,
        Priority: opts.Priority ?? 0,
        Status: 'Active',
        PriceListID: opts.PriceListID ?? null,
        MinQuantity: opts.MinQuantity ?? null,
        MaxQuantity: opts.MaxQuantity ?? null,
        PackageQuantity: opts.PackageQuantity ?? null,
    });
}

/**
 * A promotion, its redeemable code and any product target — through the object model.
 *
 * `Promotion` is the offer and `PromotionCode` is the string a customer presents (D70); they are
 * separate rows because one offer can have many codes. Returns the code, since that is what an order
 * actually carries.
 */
export async function CreatePromotion(
    ctx: IntegrationCheckContext,
    opts: {
        Kind?: string;
        Value: number;
        AppliesAt?: string;
        TargetProductID?: string | null;
        TargetProductCategoryID?: string | null;
        Code?: string;
        MinimumOrderAmount?: number | null;
        StackingMode?: string | null;
    },
): Promise<string> {
    const code = opts.Code ?? `IT-${randomUUID().slice(0, 6).toUpperCase()}`;
    const typeID = await FindId(
        ctx,
        'MJ_BizApps_Orders: Promotion Types',
        `Code = '${Quote(opts.Kind ?? 'PercentOff')}'`,
    );
    Assert(!!typeID, `Promotion Type '${opts.Kind ?? 'PercentOff'}' missing — push orders metadata`);

    const promotionID = await createViaEntity(ctx, PROMOTION_ENTITY, {
        Code: code,
        Name: code,
        PromotionTypeID: typeID,
        Value: opts.Value,
        AppliesAt: opts.AppliesAt ?? 'Either',
        Status: 'Active',
        MinimumOrderAmount: opts.MinimumOrderAmount ?? null,
    });

    await createViaEntity(ctx, PROMOTION_CODE_ENTITY, {
        PromotionID: promotionID,
        Code: code,
        Status: 'Active',
    });

    if (opts.TargetProductID || opts.TargetProductCategoryID) {
        await createViaEntity(ctx, PROMOTION_TARGET_ENTITY, {
            PromotionID: promotionID,
            ProductID: opts.TargetProductID ?? null,
            ProductCategoryID: opts.TargetProductCategoryID ?? null,
            IncludeDescendants: true,
        });
    }
    return code;
}

/**
 * Create one row THROUGH THE OBJECT MODEL and return its id.
 *
 * WHY THE CATALOG IS BUILT THIS WAY AND NOT WITH `INSERT`.
 *
 * Creating a product IS part of the product. A fixture that inserts one by hand skips every
 * validation, default and Save-override the application would run, so the suite proves that ORDERS
 * work against a catalog that never went through our software — and any defect in the catalog path is
 * invisible by construction. `ProductPriceEntityServer` is the sharpest case: it enforces the
 * price-ambiguity guard (no two active rules sharing product, list, fee type and priority), and every
 * raw-SQL price in this suite walked straight past it. That is why ambiguity kept surfacing at CONFIRM
 * time, far from the rule that caused it, instead of loudly at creation.
 *
 * THE BOUNDARY MOVED (Amith 2026-07-30). This used to say that rows we do not own — accounting's
 * `GLAccount`/`GLAccountLink`, common's `Person` — stay on SQL, because creating them through their
 * own entity APIs tests THEIR software rather than ours. That reasoning is sound for rows we merely
 * reference, and wrong for the ones our own logic depends on.
 *
 * GL accounts and GL account LINKS are the case in point. The resolution walk — product → category →
 * ancestors → company/type → default — is ours, and it reads exactly those link rows. Fabricating
 * them with `INSERT` means the walk is exercised against data no application ever validated, so a
 * link that our own resolver would consider malformed still produces a plausible-looking journal
 * entry. Building them through the object model makes the seeding pass itself a test of the walk: a
 * missing or mis-scoped link now fails loudly at creation instead of quietly booking to the wrong
 * account.
 *
 * What stays on SQL is genuinely inert infrastructure — `__mj.Company` and the tax geography rows —
 * which nothing of ours resolves THROUGH; they are only ever pointed at.
 *
 * Failures are loud and name the entity: a fixture that half-builds leaves every check in the bundle
 * failing for a reason that has nothing to do with what it was testing.
 */
export async function createViaEntity(
    ctx: IntegrationCheckContext,
    entityName: string,
    fields: Record<string, unknown>,
): Promise<string> {
    const md = new Metadata();
    // GENERIC BY DESIGN — `entityName` and the field names are runtime values, so there is no typed
    // property to reach for and `Set` is the correct tool. Plain `BaseEntity`, not the old
    // `& Record<string, unknown>`: that intersection bought nothing here and hid `InnerLoad`.
    const entity = await md.GetEntityObject<BaseEntity>(entityName, ctx.User);
    entity.NewRecord();
    for (const [key, value] of Object.entries(fields)) {
        if (value !== undefined) entity.Set(key, value);
    }
    if (!(await entity.Save())) {
        // `CompleteMessage` is often empty on a validation failure — the detail lives in `Errors`, one
        // entry per offending field. Reporting only the message turns a precise "Field X is required"
        // into "unknown error", which is how a fixture failure becomes a twenty-minute hunt.
        const result = entity.LatestResult;
        const detail =
            (result?.Errors ?? [])
                .map((e) => (typeof e === 'string' ? e : JSON.stringify(e)))
                .join('; ') || result?.CompleteMessage || 'no reason given';
        throw new Error(`Fixture could not create a '${entityName}' through the object model: ${detail}`);
    }
    return entity.Get('ID') as string;  // generic: the PK column name is not known statically
}

/**
 * Create-or-update one row THROUGH THE OBJECT MODEL, keyed on its primary key.
 *
 * Some fixture rows are singletons rather than new records — `OrderCompanyPolicy` is keyed BY the
 * company, so a bundle that sets a stacking policy twice is updating one row, not creating a second.
 * The SQL version expressed that as DELETE-then-INSERT, which is not the same thing: it destroys and
 * recreates the row, so anything referencing it, and any Save-override that distinguishes a create
 * from an update, sees the wrong event. Loading first and saving over it is what the application
 * itself would do.
 */
export async function upsertViaEntity(
    ctx: IntegrationCheckContext,
    entityName: string,
    primaryKey: string,
    fields: Record<string, unknown>,
): Promise<string> {
    const md = new Metadata();
    // Generic by design, as in `createViaEntity` above.
    const entity = await md.GetEntityObject<BaseEntity>(entityName, ctx.User);

    // Absent row → false, which is the create path, not an error. `InnerLoad` is BaseEntity's own
    // key-based load; the typed `Load(id)` overload only exists on generated subclasses, and this
    // function does not know which subclass it has.
    const existed = await entity.InnerLoad(CompositeKey.FromID(primaryKey));
    if (!existed) {
        entity.NewRecord();
        entity.Set('ID', primaryKey);
    }
    for (const [key, value] of Object.entries(fields)) {
        if (value !== undefined) entity.Set(key, value);
    }
    if (!(await entity.Save())) {
        const result = entity.LatestResult;
        const detail =
            (result?.Errors ?? [])
                .map((e) => (typeof e === 'string' ? e : JSON.stringify(e)))
                .join('; ') || result?.CompleteMessage || 'no reason given';
        throw new Error(
            `Fixture could not ${existed ? 'update' : 'create'} '${entityName}' (${primaryKey}) ` +
            `through the object model: ${detail}`,
        );
    }
    return entity.Get('ID') as string;  // generic: the PK column name is not known statically
}

/** Intercompany account codes. Shared so the two bundles that provision them cannot drift apart. */
export const DUE_TO_CODE = '21900';
export const DUE_FROM_CODE = '11900';

/** Create a company's GL account for a code, or return the existing one. */
export async function EnsureGLAccount(
    ctx: IntegrationCheckContext,
    companyID: string,
    code: string,
    name: string,
    accountType: string,
): Promise<string> {
    const existing = await TxMaybeOne<{ ID: string }>(
        ctx,
        `SELECT ID FROM ${ACCT_SCHEMA}.GLAccount WHERE CompanyID='${companyID}' AND Code='${code}'`,
    );
    if (existing?.ID) return existing.ID;
    return createViaEntity(ctx, GL_ACCOUNT_ENTITY, {
        CompanyID: companyID,
        Code: code,
        Name: name,
        AccountType: accountType,
        IsActive: 1,
    });
}

/**
 * Provision Due To / Due From accounts for each company and the ordered pairs between them.
 *
 * WHY THIS IS SHARED. `intercompany` and `account-credit` both need it, and they had two separate
 * copies of the same SQL. Two copies of the setup for a feature whose whole hazard is DIRECTION —
 * a mis-oriented pair still balances, so the ledger looks healthy either way — is exactly the kind
 * of duplication that lets one copy drift into being wrong without any check failing.
 *
 * The DUE TO belongs to the SOURCE company and the DUE FROM to the TARGET. Both are resolved
 * explicitly rather than by a correlated subquery, which reads identically whichever way round the
 * pair is and therefore cannot catch a reversal.
 *
 * CoC is deliberately left UNPAIRED so the missing-pair case has something genuine to exercise.
 */
export async function EnsureIntercompanyAccounts(
    ctx: IntegrationCheckContext,
    companies: Array<{ ID: string }>,
    pairs: Array<[string, string]>,
): Promise<void> {
    for (const co of companies) {
        await EnsureGLAccount(ctx, co.ID, DUE_TO_CODE, 'Due To Affiliates', 'Liability');
        await EnsureGLAccount(ctx, co.ID, DUE_FROM_CODE, 'Due From Affiliates', 'Asset');
    }

    for (const [source, target] of pairs) {
        const existing = await TxMaybeOne<{ ID: string }>(
            ctx,
            `SELECT ID FROM ${ACCT_SCHEMA}.IntercompanyAccountMatch
              WHERE SourceCompanyID='${source}' AND TargetCompanyID='${target}' AND Status='Active'`,
        );
        if (existing?.ID) continue;

        const dueTo = await EnsureGLAccount(ctx, source, DUE_TO_CODE, 'Due To Affiliates', 'Liability');
        const dueFrom = await EnsureGLAccount(ctx, target, DUE_FROM_CODE, 'Due From Affiliates', 'Asset');
        await createViaEntity(ctx, INTERCOMPANY_ACCOUNT_MATCH_ENTITY, {
            SourceCompanyID: source,
            TargetCompanyID: target,
            DueToGLAccountID: dueTo,
            DueFromGLAccountID: dueFrom,
            Status: 'Active',
        });
    }
}

/**
 * Register a company as having tax nexus in the given jurisdictions.
 *
 * Four bundles carried byte-identical copies of this INSERT. Nexus decides whether tax is charged
 * at all, so a bundle whose copy drifted would silently start proving the wrong thing: zero tax
 * because the company was never registered reads exactly like zero tax because the product is
 * exempt. Asserting the REASON is what tax.checks does; sharing the setup is what stops the reason
 * from differing between bundles in the first place.
 *
 * Idempotent per (company, jurisdiction) so bundles that call it repeatedly do not stack rows.
 */
export async function EnsureTaxNexus(
    ctx: IntegrationCheckContext,
    companyID: string,
    jurisdictionIDs: Iterable<string>,
): Promise<void> {
    for (const jid of jurisdictionIDs) {
        if (!jid) continue;
        const existing = await TxMaybeOne<{ ID: string }>(
            ctx,
            `SELECT ID FROM ${ACCT_SCHEMA}.CompanyTaxNexus
              WHERE CompanyID='${companyID}' AND TaxJurisdictionID='${jid}'`,
        );
        if (existing?.ID) continue;
        await createViaEntity(ctx, COMPANY_TAX_NEXUS_ENTITY, {
            CompanyID: companyID,
            TaxJurisdictionID: jid,
            NexusType: 'Economic',
            RegisteredFrom: '2020-01-01',
            Status: 'Active',
        });
    }
}

/**
 * Attach a component to a bundle product (D32/D41).
 *
 * Through the object model like everything else: `UQ_ProductBundleItem_Pair` and the
 * no-self-bundle CHECK are guards a raw INSERT would walk past, and a bundle that contains
 * itself expands forever.
 */
export async function CreateBundleItem(
    ctx: IntegrationCheckContext,
    bundleProductID: string,
    componentProductID: string,
    opts: { Quantity?: number; PricingMode?: 'Bundled' | 'SumOfParts'; SortOrder?: number } = {},
): Promise<string> {
    return createViaEntity(ctx, PRODUCT_BUNDLE_ITEM_ENTITY, {
        BundleProductID: bundleProductID,
        ComponentProductID: componentProductID,
        Quantity: opts.Quantity ?? 1,
        PricingMode: opts.PricingMode ?? 'Bundled',
        SortOrder: opts.SortOrder ?? 0,
    });
}

export async function TeardownOrdersFixture(_ctx: IntegrationCheckContext): Promise<void> {
    // The world stays. ORD-WORLD is shared by every bundle and by Explorer.
    currentFixture = undefined;
}

/**
 * Remove EVERY fixture run's data, not just the current one.
 *
 * `TeardownOrdersFixture` is scoped to the companies of the run that is finishing, which is right
 * for a test run and wrong for housekeeping: each run mints new companies, so an interrupted run —
 * or the review-data seeder, which commits on purpose — leaves rows nothing later will reach.
 *
 * Finds every company the fixture has ever created (they are all named `IT-ORD-…`) and sweeps them.
 * Safe to run against a development database and nowhere else; it deletes orders.
 */
export async function PurgeAllFixtureData(ctx: IntegrationCheckContext): Promise<number> {
    const runs = await PoolQuery<{ ID: string; Name: string }>(
        ctx,
        `SELECT ID, Name FROM __mj.Company WHERE Name LIKE 'IT-ORD-%'`,
    );
    if (!runs.length) return 0;

    // One sweep over ALL of them: the runs share products and tax geography only by coincidence of
    // naming, but orders can reference any of it, so deleting run by run would hit FK failures in
    // whichever order it happened to pick.
    const ids = runs.map((r) => r.ID);
    const marks = [...new Set(runs.map((r) => r.Name.split(' ')[0]))];

    for (const mark of marks) {
        for (const statement of teardownStatements(ids, mark)) {
            try {
                await PoolQuery(ctx, statement);
            } catch (e) {
                // The WHOLE error. mssql puts the useful part ('The DELETE statement conflicted
                // with the REFERENCE constraint …') in `originalError`, and the first line of the
                // outer message is the useless 'Error executing SQL'.
                const err = e as Error & { originalError?: Error };
                const detail = err.originalError?.message ?? err.message;
                console.warn(`      purge warn: ${String(detail).split('\n')[0]}`);
                console.warn(`        ↳ ${statement.replace(/\s+/g, ' ').slice(0, 140)}`);
            }
        }
    }
    currentFixture = undefined;
    return runs.length;
}

/** The delete order, shared by the per-run teardown and the whole-database purge. */
function teardownStatements(companyIDs: string[], run: string): string[] {
    const companies = companyIDs.map((c) => `'${c}'`).join(',');
    const orderScope = `SELECT ID FROM ${ORDERS_SCHEMA}.OrderHeader WHERE CompanyID IN (${companies})`;

    return [
        // ── THE IMMUTABILITY TRIGGERS COME OFF FIRST ────────────────────────────────────────────
        // A confirmed line's JournalEntryID cannot be cleared and a captured PaymentLine cannot be
        // deleted — correctly, because in the application a correction is a reversal, never an
        // edit. Housekeeping is the one caller that is genuinely removing history rather than
        // rewriting it, so it disables them and puts them back.
        //
        // This was invisible until the review-data seeder committed orders: every check rolls back,
        // so teardown had only ever been asked to delete rows that were not there, and it "worked"
        // by having nothing to do.
        `DISABLE TRIGGER ${ORDERS_SCHEMA}.trg_OrderLine_ImmutableAfterConfirm ON ${ORDERS_SCHEMA}.OrderLine`,
        `DISABLE TRIGGER ${ORDERS_SCHEMA}.trg_PaymentLine_ImmutableAfterCapture ON ${ORDERS_SCHEMA}.PaymentLine`,
        `DISABLE TRIGGER ${ORDERS_SCHEMA}.trg_PaymentHeader_ImmutableAfterCapture ON ${ORDERS_SCHEMA}.PaymentHeader`,
        `DISABLE TRIGGER ${ORDERS_SCHEMA}.trg_PaymentDetail_Immutable ON ${ORDERS_SCHEMA}.PaymentDetail`,

        // ENTITLEMENT GRANTS FIRST, before anything they point at.
        //
        // A grant references an OrderLine, a Subscription, a SubscriptionTerm and a
        // ProductEntitlement — four FKs into rows this sweep is about to remove. Missing it does not
        // fail loudly: the deletes are individually caught, so the FIRST conflict silently aborts
        // the REST of the cascade and the whole fixture run survives. That is how two runs' worth of
        // review data ended up in the database looking like one, with the seeder reporting success.
        //
        // Scoped by ORDER LINE rather than by company, because that is the link a grant always has —
        // the subscription and term references are optional.
        `DELETE FROM ${ORDERS_SCHEMA}.EntitlementGrant WHERE OrderLineID IN
            (SELECT ID FROM ${ORDERS_SCHEMA}.OrderLine WHERE OrderHeaderID IN (${orderScope}))`,
        // And any left pointing at this run's subscriptions or templates by another path.
        `DELETE FROM ${ORDERS_SCHEMA}.EntitlementGrant WHERE SubscriptionID IN
            (SELECT ID FROM ${ORDERS_SCHEMA}.Subscription WHERE CompanyID IN (${companies}))`,
        `DELETE FROM ${ORDERS_SCHEMA}.EntitlementGrant WHERE ProductEntitlementID IN
            (SELECT ID FROM ${ORDERS_SCHEMA}.ProductEntitlement WHERE ProductID IN
                (SELECT ID FROM ${ORDERS_SCHEMA}.Product WHERE CompanyID IN (${companies})))`,

        // Money DETAIL that hangs off the lines — price components, adjustments and charges with
        // their allocations. These are what a line is made of, so they go before it.
        `DELETE FROM ${ORDERS_SCHEMA}.OrderLinePriceComponent WHERE OrderLineID IN
            (SELECT ID FROM ${ORDERS_SCHEMA}.OrderLine WHERE OrderHeaderID IN (${orderScope}))`,
        `DELETE FROM ${ORDERS_SCHEMA}.OrderAdjustmentAllocation WHERE OrderAdjustmentID IN
            (SELECT ID FROM ${ORDERS_SCHEMA}.OrderAdjustment WHERE OrderHeaderID IN (${orderScope}))`,
        `DELETE FROM ${ORDERS_SCHEMA}.OrderAdjustment WHERE OrderHeaderID IN (${orderScope})`,
        `DELETE FROM ${ORDERS_SCHEMA}.OrderChargeAllocation WHERE OrderChargeID IN
            (SELECT ID FROM ${ORDERS_SCHEMA}.OrderCharge WHERE OrderHeaderID IN (${orderScope}))`,
        `DELETE FROM ${ORDERS_SCHEMA}.OrderCharge WHERE OrderHeaderID IN (${orderScope})`,

        // Stored-value rows hang off the order line that issued them, so they go before the lines do.
        `DELETE FROM ${ORDERS_SCHEMA}.StoredValueTransaction WHERE StoredValueAccountID IN
            (SELECT ID FROM ${ORDERS_SCHEMA}.StoredValueAccount WHERE IssuedFromOrderLineID IN
                (SELECT ID FROM ${ORDERS_SCHEMA}.OrderLine WHERE OrderHeaderID IN (${orderScope})))`,
        `DELETE FROM ${ORDERS_SCHEMA}.StoredValueTransaction WHERE RelatedOrderHeaderID IN (${orderScope})`,
        `DELETE FROM ${ORDERS_SCHEMA}.StoredValueAccount WHERE IssuedFromOrderLineID IN
            (SELECT ID FROM ${ORDERS_SCHEMA}.OrderLine WHERE OrderHeaderID IN (${orderScope}))`,
        `UPDATE ${ORDERS_SCHEMA}.OrderLine SET JournalEntryID=NULL WHERE OrderHeaderID IN (${orderScope})`,
        // Break the bundle self-reference (D45) before the rows go. Strictly this is belt and
        // braces: parent and children always share an OrderHeaderID, so one DELETE removes both
        // and SQL Server checks the self-FK at statement end, which is why ReversesOrderLineID
        // has never needed the same treatment. It matters when the scope is ever narrowed to a
        // subset of an order's lines, where the delete would otherwise trip its own FK — a
        // failure that would surface as an unrelated-looking cleanup error.
        `UPDATE ${ORDERS_SCHEMA}.OrderLine SET ParentOrderLineID=NULL WHERE OrderHeaderID IN (${orderScope})`,
        `DELETE jel FROM ${ACCT_SCHEMA}.JournalEntryLine jel
            JOIN ${ACCT_SCHEMA}.JournalEntry je ON je.ID=jel.JournalEntryID WHERE je.CompanyID IN (${companies})`,
        `DELETE FROM ${ACCT_SCHEMA}.JournalEntry WHERE CompanyID IN (${companies})`,
        `UPDATE ${ORDERS_SCHEMA}.OrderHeader SET InitialPaymentDetailID=NULL WHERE CompanyID IN (${companies})`,
        `DELETE FROM ${ORDERS_SCHEMA}.PaymentLine WHERE OrderHeaderID IN (${orderScope})`,
        `DELETE FROM ${ORDERS_SCHEMA}.PaymentHeader WHERE ReceivingCompanyID IN (${companies})`,
        `DELETE FROM ${ORDERS_SCHEMA}.PaymentDetail WHERE CompanyID IN (${companies})`,
        // The renewal pointer lives on the LINE now and carries no FK (D61), so nothing needs
        // clearing before Subscriptions go — deleting the lines takes it with them.
        `DELETE FROM ${ORDERS_SCHEMA}.SubscriptionTerm WHERE SubscriptionID IN
            (SELECT ID FROM ${ORDERS_SCHEMA}.Subscription WHERE CompanyID IN (${companies}))`,
        `DELETE FROM ${ORDERS_SCHEMA}.SubscriptionEvent WHERE SubscriptionID IN
            (SELECT ID FROM ${ORDERS_SCHEMA}.Subscription WHERE CompanyID IN (${companies}))`,
        `DELETE FROM ${ORDERS_SCHEMA}.Subscription WHERE CompanyID IN (${companies})`,
        // IsA children go before their parents: same PK, but the FK points child → parent.
        `DELETE FROM ${ORDERS_SCHEMA}.EventOrderLine WHERE ID IN
            (SELECT ID FROM ${ORDERS_SCHEMA}.OrderLine WHERE OrderHeaderID IN (${orderScope}))`,
        `DELETE FROM ${ORDERS_SCHEMA}.OrderLine WHERE OrderHeaderID IN (${orderScope})`,
        `DELETE FROM ${ORDERS_SCHEMA}.OrderHeader WHERE CompanyID IN (${companies})`,
        // ── the catalog ─────────────────────────────────────────────────────────────────────────
        // Everything that hangs off a Product goes first. This list is not guesswork: it is every
        // FK pointing at Product / ProductPrice / ProductCategory, read out of sys.foreign_keys.
        // The self-references (Product.SuccessorProductID, ProductCategory.Parent…) are cleared
        // rather than deleted, because a row cannot be deleted before itself.
        `DELETE FROM ${ORDERS_SCHEMA}.PriceTier WHERE ProductPriceID IN
            (SELECT ID FROM ${ORDERS_SCHEMA}.ProductPrice WHERE ProductID IN
              (SELECT ID FROM ${ORDERS_SCHEMA}.Product WHERE CompanyID IN (${companies})))`,
        `DELETE FROM ${ORDERS_SCHEMA}.ProductPrice WHERE ProductID IN
            (SELECT ID FROM ${ORDERS_SCHEMA}.Product WHERE CompanyID IN (${companies}))`,
        `DELETE FROM ${ORDERS_SCHEMA}.PromotionTarget WHERE ProductID IN
            (SELECT ID FROM ${ORDERS_SCHEMA}.Product WHERE CompanyID IN (${companies}))
              OR ProductCategoryID IN (SELECT ID FROM ${ORDERS_SCHEMA}.ProductCategory WHERE CompanyID IN (${companies}))`,
        `DELETE FROM ${ORDERS_SCHEMA}.ProductBundleItem WHERE BundleProductID IN
            (SELECT ID FROM ${ORDERS_SCHEMA}.Product WHERE CompanyID IN (${companies}))
              OR ComponentProductID IN (SELECT ID FROM ${ORDERS_SCHEMA}.Product WHERE CompanyID IN (${companies}))`,
        `DELETE FROM ${ORDERS_SCHEMA}.ProductEntitlement WHERE ProductID IN
            (SELECT ID FROM ${ORDERS_SCHEMA}.Product WHERE CompanyID IN (${companies}))`,
        `UPDATE ${ORDERS_SCHEMA}.Product SET SuccessorProductID = NULL WHERE CompanyID IN (${companies})`,
        `DELETE FROM ${ORDERS_SCHEMA}.EventProduct WHERE ID IN
            (SELECT ID FROM ${ORDERS_SCHEMA}.Product WHERE CompanyID IN (${companies}))`,
        `DELETE FROM ${ORDERS_SCHEMA}.Product WHERE CompanyID IN (${companies})`,
        `UPDATE ${ORDERS_SCHEMA}.ProductCategory SET ParentProductCategoryID = NULL WHERE CompanyID IN (${companies})`,
        `DELETE FROM ${ORDERS_SCHEMA}.ProductCategory WHERE CompanyID IN (${companies})`,
        `DELETE FROM ${ORDERS_SCHEMA}.ProductType WHERE Name LIKE '${run}%'`,
        `DELETE FROM ${ACCT_SCHEMA}.GLAccountLink WHERE RecordID IN (${companies})`,
        // Tax geography (D73), inner-to-outer so the FKs hold.
        `DELETE FROM ${ACCT_SCHEMA}.CompanyTaxNexus WHERE CompanyID IN (${companies})`,
        `DELETE FROM ${ACCT_SCHEMA}.TaxRate WHERE TaxJurisdictionID IN
           (SELECT ID FROM ${ACCT_SCHEMA}.TaxJurisdiction WHERE Code LIKE '${run}-%')`,
        `DELETE FROM ${ACCT_SCHEMA}.TaxJurisdiction WHERE Code LIKE '${run}-%'`,
        `DELETE FROM ${ACCT_SCHEMA}.TaxAuthority WHERE Code LIKE '${run}-%'`,
        `DELETE FROM ${ORDERS_SCHEMA}.CustomerTaxExemption
          WHERE OrganizationID IN (SELECT ID FROM ${COMMON_SCHEMA}.Organization WHERE Name LIKE '${run}%')
             OR PersonID IN (SELECT ID FROM ${COMMON_SCHEMA}.Person WHERE LastName LIKE '${run}%')`,
        // Charge-type links are keyed by CHARGE TYPE, not by company, so the company sweep above
        // does not reach them.
        `DELETE FROM ${ACCT_SCHEMA}.GLAccountLink
          WHERE RecordID IN (SELECT CAST(ID AS NVARCHAR(400)) FROM ${ORDERS_SCHEMA}.ChargeType)`,
        `DELETE FROM ${ACCT_SCHEMA}.JournalEntrySequence WHERE CompanyID IN (${companies})`,
        `DELETE FROM ${ACCT_SCHEMA}.IntercompanyAccountMatch
          WHERE SourceCompanyID IN (${companies}) OR TargetCompanyID IN (${companies})
             OR DueToGLAccountID IN (SELECT ID FROM ${ACCT_SCHEMA}.GLAccount WHERE CompanyID IN (${companies}))
             OR DueFromGLAccountID IN (SELECT ID FROM ${ACCT_SCHEMA}.GLAccount WHERE CompanyID IN (${companies}))`,
        `UPDATE ${ACCT_SCHEMA}.GLAccount SET ParentGLAccountID = NULL WHERE CompanyID IN (${companies})`,
        `DELETE FROM ${ACCT_SCHEMA}.GLAccount WHERE CompanyID IN (${companies})`,
        `DELETE FROM ${ACCT_SCHEMA}.AccountingCompanyProfile WHERE ID IN (${companies})`,
        `DELETE FROM __mj.Company WHERE ID IN (${companies})`,
        `DELETE FROM ${COMMON_SCHEMA}.Organization WHERE Name LIKE '${run}%'`,
        `DELETE FROM ${COMMON_SCHEMA}.Person WHERE LastName = '${run}'`,

        // Back on, unconditionally. Leaving them off would let the NEXT run edit booked history
        // silently, and every check that proves a correction is refused would pass having proved
        // the opposite.
        `ENABLE TRIGGER ${ORDERS_SCHEMA}.trg_OrderLine_ImmutableAfterConfirm ON ${ORDERS_SCHEMA}.OrderLine`,
        `ENABLE TRIGGER ${ORDERS_SCHEMA}.trg_PaymentLine_ImmutableAfterCapture ON ${ORDERS_SCHEMA}.PaymentLine`,
        `ENABLE TRIGGER ${ORDERS_SCHEMA}.trg_PaymentHeader_ImmutableAfterCapture ON ${ORDERS_SCHEMA}.PaymentHeader`,
        `ENABLE TRIGGER ${ORDERS_SCHEMA}.trg_PaymentDetail_Immutable ON ${ORDERS_SCHEMA}.PaymentDetail`,
    ];

}
