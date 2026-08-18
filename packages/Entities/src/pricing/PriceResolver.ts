/**
 * PriceResolver — turns (product, customer, quantity, moment) into a price, and says why.
 *
 * THE WALK IS DELIBERATELY THE SAME AS `GLAccountResolver`'s (plan D69):
 *
 *     Product  →  its ProductCategory  →  that category's ancestors  →  the line's Company  →  default
 *
 * Most specific wins; the first resolver that returns a price ends the walk. Mirroring GL resolution
 * is not decoration — anyone who understands one understands the other, the category-tree walk is
 * shared rather than reimplemented, and the two cannot drift into disagreeing about what "the
 * product's category tree" means.
 *
 * TWO LAYERS, DO NOT CONFUSE THEM
 *   - `BasePriceResolver` subclasses are PLUGINS, registered by ClassFactory key. A company with
 *     genuinely bespoke pricing registers one for its ID and owns the whole decision.
 *   - `DefaultPriceResolver` is the data-driven one everybody else gets: resolve the customer's
 *     price list, find the applicable `ProductPrice` rules, pick by priority, compute.
 *
 * WHAT THIS DOES NOT DO
 *   Adjustments (promotions) and charges are later pipeline stages. This answers exactly one
 *   question — what does the product cost — and returns the components explaining it.
 *
 * CONNECTS TO:
 *   PURE:   ./PricingBehavior.ts (applicability, tie detection, the arithmetic)
 *   CALLER: OrderEntityServer (stamps UnitPrice before lines are written)
 *   OP:     ./PreviewPriceOperation.ts — the dry run, which MUST run this same path
 *   DOC:    plans/archive/pricing-charges-and-promotions.md
 */
import { IMetadataProvider, IRunViewProvider, RunView, UserInfo } from '@memberjunction/core';
import { MJGlobal, RegisterClassEx } from '@memberjunction/global';
import {
    ComputeAmount,
    IsRuleApplicable,
    Money,
    PickPriceRule,
    type PriceRule,
    type PriceTierRule,
    type PricingModel,
} from './PricingBehavior.js';

const PRICE_LIST_ENTITY = 'MJ_BizApps_Orders: Price Lists';
const PRICE_LIST_ASSIGNMENT_ENTITY = 'MJ_BizApps_Orders: Price List Assignments';
const PRODUCT_PRICE_ENTITY = 'MJ_BizApps_Orders: Product Prices';
const PRICE_TIER_ENTITY = 'MJ_BizApps_Orders: Price Tiers';
const PRODUCT_ENTITY = 'MJ_BizApps_Orders: Products';
const PRODUCT_CATEGORY_ENTITY = 'MJ_BizApps_Orders: Product Categories';

/** Raised when a line cannot be priced. Refusal, never a silent zero (D12's precedent). */
export class PriceResolutionError extends Error {
    constructor(
        public readonly ProductID: string,
        message: string,
    ) {
        super(message);
        this.name = 'PriceResolutionError';
    }
}

/** One line of the "how we got here" decomposition, before it becomes a row. */
export interface PriceComponentDraft {
    ComponentType: 'Base' | 'Rule' | 'Adjustment' | 'Charge' | 'Tax';
    Label: string;
    Amount: number;
    RunningTotal: number;
    SourceEntityName?: string;
    SourceRecordID?: string;
}

/** Everything a resolver is told. */
export interface PriceResolutionContext {
    ProductID: string;
    ProductCategoryID: string | null;
    /** The company that owns the product — the line's company (D6). */
    CompanyID: string;
    Quantity: number;
    /** Already in the owning company's local terms. */
    AsOf: Date;
    /** Who is buying — drives price-list assignment. Either may be null. */
    OrganizationID: string | null;
    PersonID: string | null;
    /** Explicit list, overriding the customer's assignment. */
    PriceListID?: string | null;
    FeeType?: string;
}

export interface ResolvedPrice {
    /** Per-unit, for stamping `OrderLine.UnitPrice`. */
    UnitPrice: number;
    /** The whole line — what Quantity actually costs, which is NOT always UnitPrice × Quantity. */
    ExtendedAmount: number;
    ProductPriceID: string | null;
    PriceListID: string | null;
    /** ClassFactory key of the resolver that answered, for the audit trail. */
    ResolvedBy: string;
    Components: PriceComponentDraft[];
}

/**
 * Base class for pricing plugins. Register a subclass to take over pricing for a product, a
 * category, a company, or globally:
 *
 *     @RegisterClass(BasePriceResolver, `Company:${someCompanyId}`)
 *     export class AcmeResolver extends BasePriceResolver { ... }
 *
 * Return `null` to decline and let the walk continue to the next level.
 */
export abstract class BasePriceResolver {
    public abstract Resolve(
        ctx: PriceResolutionContext,
        provider: IMetadataProvider,
        user: UserInfo,
    ): Promise<ResolvedPrice | null>;
}

interface ProductPriceRow {
    ID: string;
    ProductID: string;
    PriceListID: string | null;
    PricingModel: string;
    FeeType: string;
    Amount: number;
    PackageQuantity: number | null;
    MinQuantity: number | null;
    MaxQuantity: number | null;
    EffectiveFrom: Date;
    EffectiveTo: Date | null;
    RecurrenceMonths: string | null;
    RecurrenceDaysOfWeek: string | null;
    RecurrenceDayOfMonthMin: number | null;
    RecurrenceDayOfMonthMax: number | null;
    TimeOfDayStart: string | null;
    TimeOfDayEnd: string | null;
    Priority: number;
    Status: string;
    Description: string | null;
}

interface TierRow {
    ProductPriceID: string;
    MinQuantity: number;
    MaxQuantity: number | null;
    Amount: number;
    SortOrder: number;
}

const uuidKey = (id: string | null | undefined): string => (id ?? '').trim().toLowerCase();

/**
 * The data-driven resolver everyone gets unless a plugin overrides them.
 *
 * Registered with NO key, which makes it the fallback the walk ends at.
 * `skipNullKeyWarning` is required — a null key is the designed default, not a missing plugin.
 */
@RegisterClassEx(BasePriceResolver, { skipNullKeyWarning: true })
export class DefaultPriceResolver extends BasePriceResolver {
    public async Resolve(
        ctx: PriceResolutionContext,
        provider: IMetadataProvider,
        user: UserInfo,
    ): Promise<ResolvedPrice | null> {
        const priceListID = ctx.PriceListID !== undefined
            ? ctx.PriceListID
            : await ResolvePriceListForCustomer(ctx, provider, user);

        const rows = await this.loadRules(ctx, priceListID, provider, user);
        if (!rows.length) return null;

        const tiers = await this.loadTiers(rows.map((r) => r.ID), provider, user);
        const rules: PriceRule[] = rows.map((r) => ({
            ID: r.ID,
            PricingModel: r.PricingModel as PricingModel,
            Amount: Number(r.Amount),
            PackageQuantity: r.PackageQuantity == null ? null : Number(r.PackageQuantity),
            MinQuantity: r.MinQuantity == null ? null : Number(r.MinQuantity),
            MaxQuantity: r.MaxQuantity == null ? null : Number(r.MaxQuantity),
            EffectiveFrom: new Date(r.EffectiveFrom),
            EffectiveTo: r.EffectiveTo == null ? null : new Date(r.EffectiveTo),
            RecurrenceMonths: r.RecurrenceMonths,
            RecurrenceDaysOfWeek: r.RecurrenceDaysOfWeek,
            RecurrenceDayOfMonthMin: r.RecurrenceDayOfMonthMin,
            RecurrenceDayOfMonthMax: r.RecurrenceDayOfMonthMax,
            TimeOfDayStart: r.TimeOfDayStart,
            TimeOfDayEnd: r.TimeOfDayEnd,
            Priority: r.Priority,
            Status: r.Status,
            Tiers: tiers.get(uuidKey(r.ID)) ?? [],
        }));

        const pick = PickPriceRule(rules, { Quantity: ctx.Quantity, AsOf: ctx.AsOf });

        if (pick.AmbiguousWith) {
            // REFUSE rather than choose. Two equally-applicable rules would otherwise resolve by
            // whatever order the database returned — arbitrary, and invisible because a wrong price
            // still looks like a price.
            const names = pick.AmbiguousWith.map((i) => `${rows[i].ID} (${rows[i].Description ?? 'no description'})`);
            throw new PriceResolutionError(
                ctx.ProductID,
                `Pricing is ambiguous: ${pick.AmbiguousWith.length} rules apply to quantity ${ctx.Quantity} ` +
                    `on ${ctx.AsOf.toISOString().slice(0, 10)} and share priority ${rules[pick.Index].Priority} — ` +
                    `${names.join(', ')}. Give one of them a higher priority; resolving this automatically ` +
                    `would pick whichever the database happened to return first.`,
            );
        }

        if (pick.Index === -1) {
            // Nothing applied, but rules EXIST — say why the nearest one did not, because "no price
            // found" is far less useful than "there is a winter rate and it starts in November".
            const why = rules
                .map((r, i) => `${rows[i].Description ?? rows[i].ID}: ${IsRuleApplicable(r, { Quantity: ctx.Quantity, AsOf: ctx.AsOf })}`)
                .slice(0, 4);
            throw new PriceResolutionError(
                ctx.ProductID,
                `No price rule applies to quantity ${ctx.Quantity} on ${ctx.AsOf.toISOString().slice(0, 10)}. ` +
                    `${rules.length} rule(s) were considered — ${why.join('; ')}.`,
            );
        }

        const winner = rules[pick.Index];
        const row = rows[pick.Index];
        const extended = ComputeAmount(winner, ctx.Quantity);
        const unit = ctx.Quantity > 0 ? Money(extended / ctx.Quantity) : Money(extended);

        const label = row.Description?.trim()
            ? row.Description.trim()
            : `${row.PricingModel} price${row.PriceListID ? ' (list)' : ' (base)'}`;

        return {
            UnitPrice: unit,
            ExtendedAmount: extended,
            ProductPriceID: row.ID,
            PriceListID: row.PriceListID,
            ResolvedBy: 'default',
            Components: [
                {
                    ComponentType: 'Base',
                    Label: label,
                    Amount: extended,
                    RunningTotal: extended,
                    SourceEntityName: PRODUCT_PRICE_ENTITY,
                    SourceRecordID: row.ID,
                },
            ],
        };
    }

    /**
     * Rules for this product on the resolved list, PLUS the product's base rules.
     *
     * Both are loaded because a list need not price every product: a wholesale list may set a rate
     * for ten SKUs and leave the rest at base. Loading only the list's rows would make those SKUs
     * unpriceable for exactly the customers who buy the most.
     */
    private async loadRules(
        ctx: PriceResolutionContext,
        priceListID: string | null,
        provider: IMetadataProvider,
        user: UserInfo,
    ): Promise<ProductPriceRow[]> {
        const rv = new RunView(provider as unknown as IRunViewProvider);
        const listClause = priceListID
            ? `(PriceListID = '${priceListID}' OR PriceListID IS NULL)`
            : `PriceListID IS NULL`;
        const feeClause = `FeeType = '${(ctx.FeeType ?? 'Standard').replace(/'/g, "''")}'`;

        const res = await rv.RunView<ProductPriceRow>(
            {
                EntityName: PRODUCT_PRICE_ENTITY,
                ExtraFilter: `ProductID = '${ctx.ProductID}' AND Status = 'Active' AND ${listClause} AND ${feeClause}`,
                ResultType: 'simple',
                BypassCache: true,
            },
            user,
        );
        if (!res?.Success) {
            throw new PriceResolutionError(ctx.ProductID, `Could not read price rules: ${res?.ErrorMessage ?? 'unknown error'}`);
        }
        const rows = res.Results ?? [];

        // A LIST rule beats a BASE rule of equal priority — otherwise assigning a customer to a list
        // would leave them on base pricing half the time, decided by row order. Nudging the list
        // rule's effective priority keeps that intent in the data rather than in a sort comparator.
        if (priceListID) {
            for (const r of rows) {
                if (r.PriceListID) r.Priority = r.Priority + 1;
            }
        }
        return rows;
    }

    private async loadTiers(
        priceIDs: string[],
        provider: IMetadataProvider,
        user: UserInfo,
    ): Promise<Map<string, PriceTierRule[]>> {
        const out = new Map<string, PriceTierRule[]>();
        if (!priceIDs.length) return out;
        const rv = new RunView(provider as unknown as IRunViewProvider);
        const quoted = priceIDs.map((id) => `'${id}'`).join(',');
        const res = await rv.RunView<TierRow>(
            {
                EntityName: PRICE_TIER_ENTITY,
                ExtraFilter: `ProductPriceID IN (${quoted})`,
                ResultType: 'simple',
                BypassCache: true,
            },
            user,
        );
        for (const t of res?.Results ?? []) {
            const key = uuidKey(t.ProductPriceID);
            const list = out.get(key) ?? [];
            list.push({
                MinQuantity: Number(t.MinQuantity),
                MaxQuantity: t.MaxQuantity == null ? null : Number(t.MaxQuantity),
                Amount: Number(t.Amount),
                SortOrder: t.SortOrder,
            });
            out.set(key, list);
        }
        return out;
    }
}

/**
 * Which price list applies to this customer, as of this moment?
 *
 * The person's own assignment and their organization's may both apply; `Priority` breaks the tie,
 * and a person's assignment wins an equal priority because it is the more specific statement about
 * who is buying. Returns null when nobody has assigned one — which is not an error: the product's
 * base price is exactly what an unassigned customer should get.
 */
export async function ResolvePriceListForCustomer(
    ctx: PriceResolutionContext,
    provider: IMetadataProvider,
    user: UserInfo,
): Promise<string | null> {
    if (!ctx.OrganizationID && !ctx.PersonID) return null;

    const clauses: string[] = [];
    if (ctx.OrganizationID) clauses.push(`OrganizationID = '${ctx.OrganizationID}'`);
    if (ctx.PersonID) clauses.push(`PersonID = '${ctx.PersonID}'`);

    const rv = new RunView(provider as unknown as IRunViewProvider);
    const res = await rv.RunView<{
        PriceListID: string;
        PersonID: string | null;
        Priority: number;
        StartedAt: Date | null;
        EndedAt: Date | null;
    }>(
        {
            EntityName: PRICE_LIST_ASSIGNMENT_ENTITY,
            ExtraFilter: `Status = 'Active' AND (${clauses.join(' OR ')})`,
            ResultType: 'simple',
            BypassCache: true,
        },
        user,
    );
    if (!res?.Success) return null;

    const now = ctx.AsOf.getTime();
    const live = (res.Results ?? []).filter((a) => {
        const from = a.StartedAt ? new Date(a.StartedAt).getTime() : null;
        const to = a.EndedAt ? new Date(a.EndedAt).getTime() : null;
        if (from !== null && now < from) return false;
        if (to !== null && now > to) return false;
        return true;
    });
    if (!live.length) return null;

    live.sort((a, b) => {
        if (b.Priority !== a.Priority) return b.Priority - a.Priority;
        // Equal priority: the assignment naming a PERSON is the more specific statement.
        return (b.PersonID ? 1 : 0) - (a.PersonID ? 1 : 0);
    });

    // The list itself must still be in force — an expired list should not price anything.
    const listRes = await rv.RunView<{ ID: string; EffectiveFrom: Date | null; EffectiveTo: Date | null; Status: string }>(
        {
            EntityName: PRICE_LIST_ENTITY,
            ExtraFilter: `ID IN (${live.map((a) => `'${a.PriceListID}'`).join(',')})`,
            ResultType: 'simple',
            BypassCache: true,
        },
        user,
    );
    const usable = new Map((listRes?.Results ?? []).map((l) => [uuidKey(l.ID), l]));
    for (const a of live) {
        const list = usable.get(uuidKey(a.PriceListID));
        if (!list || list.Status !== 'Active') continue;
        const from = list.EffectiveFrom ? new Date(list.EffectiveFrom).getTime() : null;
        const to = list.EffectiveTo ? new Date(list.EffectiveTo).getTime() : null;
        if (from !== null && now < from) continue;
        if (to !== null && now > to) continue;
        return a.PriceListID;
    }
    return null;
}

/**
 * Run the resolver walk: product → category → ancestors → company → default.
 *
 * The first resolver returning a price ends it. Nothing resolving is the caller's decision to
 * refuse or to accept a directly-entered price — this function reports, it does not decide.
 */
export async function ResolvePrice(
    ctx: PriceResolutionContext,
    provider: IMetadataProvider,
    user: UserInfo,
): Promise<ResolvedPrice | null> {
    const keys: string[] = [`Product:${ctx.ProductID}`];
    for (const cat of await categoryChain(ctx.ProductCategoryID, provider, user)) {
        keys.push(`Category:${cat}`);
    }
    keys.push(`Company:${ctx.CompanyID}`);

    for (const key of keys) {
        // Probe first. CreateInstance falls back to the no-key default and warns when the
        // Product/Category/Company key has no plugin — which is the common case.
        if (!isRegistered(key)) continue;
        const plugin = MJGlobal.Instance.ClassFactory.CreateInstance<BasePriceResolver>(BasePriceResolver, key);
        if (!plugin) continue;
        const hit = await plugin.Resolve(ctx, provider, user);
        if (hit) return { ...hit, ResolvedBy: key };
    }

    const fallback = MJGlobal.Instance.ClassFactory.CreateInstance<BasePriceResolver>(BasePriceResolver);
    if (!fallback) return null;
    return fallback.Resolve(ctx, provider, user);
}

/** Whether a ClassFactory registration exists for this exact key. */
function isRegistered(key: string): boolean {
    const reg = MJGlobal.Instance.ClassFactory.GetAllRegistrations(BasePriceResolver) ?? [];
    return reg.some((r) => (r.Key ?? '').toLowerCase() === key.toLowerCase());
}

/** The category and its ancestors, nearest first — the same chain GLAccountResolver walks. */
async function categoryChain(
    startCategoryID: string | null,
    provider: IMetadataProvider,
    user: UserInfo,
): Promise<string[]> {
    if (!startCategoryID) return [];
    const rv = new RunView(provider as unknown as IRunViewProvider);
    const res = await rv.RunView<{ ID: string; ParentProductCategoryID: string | null }>(
        {
            EntityName: PRODUCT_CATEGORY_ENTITY,
            Fields: ['ID', 'ParentProductCategoryID'],
            ResultType: 'simple',
        },
        user,
    );
    const parent = new Map((res?.Results ?? []).map((c) => [uuidKey(c.ID), c.ParentProductCategoryID]));

    const chain: string[] = [];
    const seen = new Set<string>();
    let current: string | null = startCategoryID;
    while (current && !seen.has(uuidKey(current))) {
        seen.add(uuidKey(current)); // cycle guard — the DB blocks self-parenting, not longer loops
        chain.push(current);
        current = parent.get(uuidKey(current)) ?? null;
    }
    return chain;
}

/** Tree-shaking anchor so the default resolver's registration survives bundling. */
export function LoadDefaultPriceResolver(): void {
    // intentionally empty
}

export { PRODUCT_ENTITY, PRODUCT_PRICE_ENTITY };
