/**
 * The pricing context for one order line, built from what the line and its order say.
 *
 * Two questions need it: whether a stated price is one the engine or a named list would give
 * (the price-override gate on `OrderLineEntity`), and what a line was charged below that price
 * (the concession gate). They must ask about the same context, so it is built here once.
 *
 * @module @mj-biz-apps/orders-entities
 */
import { RunView, type IMetadataProvider, type IRunViewProvider, type UserInfo } from '@memberjunction/core';
import { loadApplicabilityContext } from './applicability.js';
import { isEnginePrice, isNamedListPick } from './priceOverride.js';
import {
    ListApplicablePrices,
    NoApplicablePriceRuleError,
    ResolvePrice,
    RevenueBandRequiredError,
    type PriceResolutionContext,
    type ResolvedPrice,
} from './PriceResolver.js';
import { LoadOrdersEngine, OrdersEngine } from './OrdersEngine.js';
import { RequireUUID } from '../sql-guards.js';
import { AsDateValue, TodayAsDateValue } from '../date-cell';
import { OptionPicksOnly, type OptionPick } from '../product-options.js';

/** The line fields the context depends on. */
export interface PricedLineFacts {
    ProductID: string;
    OrderHeaderID: string | null;
    Quantity: number | null;
    UnitPrice: number | null;
    ProductPriceID: string | null;
    /**
     * The line's option picks, when the caller already has them (a line not saved yet, a renewal
     * priced onto a successor product). Otherwise they are read from the line: its `Choices`
     * collection when loaded, else the saved rows for its `ID`.
     */
    OptionPicks?: readonly OptionPick[] | null;
    ID?: string | null;
}

interface HeaderPricingFacts {
    CompanyID: string;
    OrderDate: Date | string | null;
    BillToPersonID: string | null;
    BillToOrganizationID: string | null;
    ShipToPersonID: string | null;
    ShipToOrganizationID: string | null;
    BillToAddressID: string | null;
    ShipToAddressID: string | null;
}

/** Null when the line's product or company cannot be resolved. */
export async function BuildLinePriceContext(
    line: PricedLineFacts,
    provider: IMetadataProvider,
    user: UserInfo,
): Promise<PriceResolutionContext | null> {
    await LoadOrdersEngine(provider, user);
    const product = OrdersEngine.Instance.ProductByID(line.ProductID);
    const header = await loadHeader(line.OrderHeaderID, provider, user);
    const companyID = product?.CompanyID ?? header?.CompanyID ?? '';
    if (!companyID) return null;

    return {
        ProductID: line.ProductID,
        ProductCategoryID: product?.ProductCategoryID ?? null,
        CompanyID: companyID,
        Quantity: Number(line.Quantity ?? 0),
        // A calendar day: price applicability is bounded by `EffectiveFrom`/`EffectiveTo`, both
        // `date` columns, and an instant answers the UTC day.
        AsOf: AsDateValue(header?.OrderDate) ?? TodayAsDateValue(),
        OrganizationID: header?.BillToOrganizationID ?? null,
        PersonID: header?.BillToPersonID ?? null,
        ApplicabilityContext: await loadApplicabilityContext(
            {
                OrderHeaderID: line.OrderHeaderID,
                ProductID: line.ProductID,
                BillToPersonID: header?.BillToPersonID ?? null,
                BillToOrganizationID: header?.BillToOrganizationID ?? null,
                ShipToPersonID: header?.ShipToPersonID ?? null,
                ShipToOrganizationID: header?.ShipToOrganizationID ?? null,
                BillToAddressID: header?.BillToAddressID ?? null,
                ShipToAddressID: header?.ShipToAddressID ?? null,
                OptionPicks: await LineOptionPicks(line, provider, user),
            },
            provider,
            user,
        ),
    };
}

interface ChoiceRow {
    ProductOptionID: string | null;
    ProductOptionValueID: string | null;
    GroupKey: string;
    OptionValue: string;
}

interface ChoicesCollection {
    IsLoaded: boolean;
    Items: readonly ChoiceRow[];
}

/**
 * The option picks a line carries, saved or not.
 *
 * - `OptionPicks` passed by the caller win (unsaved lines, renewal pricing).
 * - A line entity's `Choices` collection, when loaded, holds unsaved edits.
 * - Otherwise the saved picks for the line's ID; none for a line not saved yet.
 */
export async function LineOptionPicks(
    line: PricedLineFacts | (PricedLineFacts & { Choices?: ChoicesCollection }),
    provider: IMetadataProvider,
    user: UserInfo,
): Promise<OptionPick[]> {
    if (line.OptionPicks) return OptionPicksOnly(line.OptionPicks);
    const choices = (line as { Choices?: ChoicesCollection }).Choices;
    // A line not saved yet has nothing in the database: what it holds in memory is all of it, even
    // though its collection was never loaded.
    const unsaved = (line as { IsSaved?: boolean }).IsSaved === false;
    if (choices && (choices.IsLoaded || unsaved)) return OptionPicksOnly(choices.Items.map(toPick));
    if (!line.ID) return [];
    // A product the cached catalog knows and that offers no options has no picks worth a query:
    // every line of an order without options is priced without one.
    const engine = OrdersEngine.Instance;
    if (engine.ProductByID(line.ProductID) && engine.EffectiveOptions(line.ProductID).length === 0) return [];
    const rv = new RunView(provider as unknown as IRunViewProvider);
    const res = await rv.RunView<ChoiceRow>(
        {
            EntityName: 'MJ_BizApps_Orders: Order Line Choices',
            ExtraFilter: `OrderLineID = '${RequireUUID(line.ID, 'OrderLineID')}' AND ProductOptionID IS NOT NULL`,
            Fields: ['ProductOptionID', 'ProductOptionValueID', 'GroupKey', 'OptionValue'],
            ResultType: 'simple',
        },
        user,
    );
    return OptionPicksOnly((res?.Results ?? []).map(toPick));
}

function toPick(c: ChoiceRow): OptionPick {
    return {
        ProductOptionID: c.ProductOptionID,
        ProductOptionValueID: c.ProductOptionValueID,
        GroupKey: c.GroupKey,
        OptionValue: c.OptionValue,
    };
}

/** How a line's stated price relates to the prices its context allows. */
export interface LinePriceStanding {
    /** What the engine would charge per unit, or null when nothing resolves. */
    EngineUnitPrice: number | null;
    /** The stated price is the engine's own answer. */
    IsEnginePrice: boolean;
    /** The stated price is another named price that applies to this customer. */
    IsNamedListPick: boolean;
}

/**
 * Where a line's stated price stands against its engine price. Null when no context can be built.
 * A named list pick is a configured price, not a concession; only a typed amount below the engine's
 * is one.
 *
 * Price rules that exist but are not in force on the order date give no engine price, as a product
 * with no price does (bc-aidp-next-golive#437): a price entered today for a product sold on an
 * earlier-dated order has nothing to measure a stated price against. Every other refusal still
 * throws, and the pricing pass for a line with no stated price still refuses.
 *
 * A revenue band the rep picked because the buyer has no revenue on record is the rules' price
 * (golive #470): the rules could not choose the band, and the rep's choice stands in for theirs, as
 * the save-time override gate already reads it (`OrderLineEntity`). So a line on such a band reads as
 * on its engine price, measured at the band's price. A line on a band product that carries anything
 * else (a typed amount, a band at a different price) still throws, since nothing can value it.
 */
export async function ResolveLinePriceStanding(
    line: PricedLineFacts,
    provider: IMetadataProvider,
    user: UserInfo,
): Promise<LinePriceStanding | null> {
    const ctx = await BuildLinePriceContext(line, provider, user);
    if (!ctx) return null;
    let engine: ResolvedPrice | null;
    try {
        engine = await resolveEngineForStatedPrice(ctx, provider, user);
    } catch (err) {
        if (!(err instanceof RevenueBandRequiredError)) throw err;
        const applicable = await ListApplicablePrices(ctx, provider, user);
        const band = PickedUndecidedBand(line, applicable);
        if (!band) throw err;
        return { EngineUnitPrice: band.UnitPrice, IsEnginePrice: true, IsNamedListPick: false };
    }
    if (engine && isEnginePrice(line, engine)) {
        return { EngineUnitPrice: engine.UnitPrice, IsEnginePrice: true, IsNamedListPick: false };
    }
    const applicable = await ListApplicablePrices(ctx, provider, user);
    return {
        EngineUnitPrice: engine?.UnitPrice ?? null,
        IsEnginePrice: false,
        IsNamedListPick: isNamedListPick(line, applicable),
    };
}

/**
 * The revenue band a line is on when that band was offered for the rep to pick (the buyer's revenue
 * is unknown), at the band's own price; null otherwise. The one test both the save-time override gate
 * and the confirm-time standing apply, so a band accepted on save is accepted on confirm (golive #470).
 */
export function PickedUndecidedBand<T extends { ID: string; UnitPrice: number; BandUndecided?: boolean }>(
    line: Pick<PricedLineFacts, 'UnitPrice' | 'ProductPriceID'>,
    applicable: readonly T[],
): T | null {
    const bands = applicable.filter((p) => p.BandUndecided === true);
    if (!isNamedListPick(line, bands)) return null;
    const id = String(line.ProductPriceID ?? '').trim().toLowerCase();
    return bands.find((p) => p.ID.trim().toLowerCase() === id) ?? null;
}

async function resolveEngineForStatedPrice(
    ctx: PriceResolutionContext,
    provider: IMetadataProvider,
    user: UserInfo,
): Promise<ResolvedPrice | null> {
    try {
        return await ResolvePrice(ctx, provider, user);
    } catch (err) {
        if (err instanceof NoApplicablePriceRuleError && err.NoneInForce) return null;
        throw err;
    }
}

async function loadHeader(
    orderHeaderID: string | null,
    provider: IMetadataProvider,
    user: UserInfo,
): Promise<HeaderPricingFacts | null> {
    if (!orderHeaderID) return null;
    const rv = new RunView(provider as unknown as IRunViewProvider);
    const res = await rv.RunView<HeaderPricingFacts>(
        {
            EntityName: 'MJ_BizApps_Orders: Order Headers',
            // The id can come from an UNSAVED, client-populated line during ValidateAsync. A non-UUID
            // throws `InvalidOperationInputError` (reject, don't escape — see sql-guards.ts); the
            // price-override gate's catch defers the line, and the FK refuses the bad id at save.
            ExtraFilter: `ID = '${RequireUUID(orderHeaderID, 'OrderHeaderID')}'`,
            Fields: [
                'CompanyID',
                'OrderDate',
                'BillToPersonID',
                'BillToOrganizationID',
                'ShipToPersonID',
                'ShipToOrganizationID',
                'BillToAddressID',
                'ShipToAddressID',
            ],
            ResultType: 'simple',
        },
        user,
    );
    return res?.Results?.[0] ?? null;
}
