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
import { ListApplicablePrices, ResolvePrice, type PriceResolutionContext, type ResolvedPrice } from './PriceResolver.js';
import { LoadOrdersEngine, OrdersEngine } from './OrdersEngine.js';
import { AsDateValue, TodayAsDateValue } from '../date-cell';

/** The line fields the context depends on. */
export interface PricedLineFacts {
    ProductID: string;
    OrderHeaderID: string | null;
    Quantity: number | null;
    UnitPrice: number | null;
    ProductPriceID: string | null;
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
            },
            provider,
            user,
        ),
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
 */
export async function ResolveLinePriceStanding(
    line: PricedLineFacts,
    provider: IMetadataProvider,
    user: UserInfo,
): Promise<LinePriceStanding | null> {
    const ctx = await BuildLinePriceContext(line, provider, user);
    if (!ctx) return null;
    const engine: ResolvedPrice | null = await ResolvePrice(ctx, provider, user);
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
            ExtraFilter: `ID = '${orderHeaderID}'`,
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
