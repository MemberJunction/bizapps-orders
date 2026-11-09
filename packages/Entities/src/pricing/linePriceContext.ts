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
import { LoadApplicabilityProduct, loadApplicabilityContext, type FilterEvalContext } from './applicability.js';
import { isEnginePrice, isNamedListPick } from './priceOverride.js';
import {
    ListApplicablePrices,
    NoApplicablePriceRuleError,
    ResolvePrice,
    type PriceResolutionContext,
    type ResolvedPrice,
} from './PriceResolver.js';
import { LoadOrdersEngine, OrdersEngine } from './OrdersEngine.js';
import { RequireUUID } from '../sql-guards.js';
import { AsDateValue, TodayAsDateValue } from '../date-cell';
import { RequireUUID } from '../sql-guards.js';

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
    const header = await loadHeader(line.OrderHeaderID, provider, user);
    if (!(OrdersEngine.Instance.ProductByID(line.ProductID)?.CompanyID ?? header?.CompanyID)) return null;
    const applicability = await loadApplicabilityContext(
        { ...headerParties(header), OrderHeaderID: line.OrderHeaderID, ProductID: line.ProductID },
        provider,
        user,
    );
    return contextFor(line, header, applicability);
}

/** The header's parties, as the applicability loader takes them. */
function headerParties(header: HeaderPricingFacts | null) {
    return {
        BillToPersonID: header?.BillToPersonID ?? null,
        BillToOrganizationID: header?.BillToOrganizationID ?? null,
        ShipToPersonID: header?.ShipToPersonID ?? null,
        ShipToOrganizationID: header?.ShipToOrganizationID ?? null,
        BillToAddressID: header?.BillToAddressID ?? null,
        ShipToAddressID: header?.ShipToAddressID ?? null,
    };
}

/** Assemble one line's context from reads already made. Null when no company resolves. */
function contextFor(
    line: PricedLineFacts,
    header: HeaderPricingFacts | null,
    applicability: FilterEvalContext,
): PriceResolutionContext | null {
    const product = OrdersEngine.Instance.ProductByID(line.ProductID);
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
        ApplicabilityContext: applicability,
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
 */
export async function ResolveLinePriceStanding(
    line: PricedLineFacts,
    provider: IMetadataProvider,
    user: UserInfo,
): Promise<LinePriceStanding | null> {
    const ctx = await BuildLinePriceContext(line, provider, user);
    if (!ctx) return null;
    return standingIn(line, ctx, provider, user);
}

/**
 * {@link ResolveLinePriceStanding} for several lines at once, in input order (#1009).
 *
 * A caller showing every discounted line of an order would otherwise read the order header and its
 * parties (bill-to and ship-to people, organizations, addresses and the organization's revenue) once
 * per line. Here they are read once per order, and only the product changes from line to line. Each
 * answer is the same one `ResolveLinePriceStanding` gives for that line alone.
 */
export async function ResolveLinePriceStandings(
    lines: readonly PricedLineFacts[],
    provider: IMetadataProvider,
    user: UserInfo,
): Promise<(LinePriceStanding | null)[]> {
    if (lines.length === 0) return [];
    await LoadOrdersEngine(provider, user);

    const byOrder = new Map<string, { header: HeaderPricingFacts | null; applicability: FilterEvalContext }>();
    const orderKey = (id: string | null): string => (id ?? '').toLowerCase();
    for (const id of new Set(lines.map((l) => orderKey(l.OrderHeaderID)))) {
        const orderHeaderID = lines.find((l) => orderKey(l.OrderHeaderID) === id)?.OrderHeaderID ?? null;
        const header = await loadHeader(orderHeaderID, provider, user);
        // No product here: it is the only part of the bag that differs between the order's lines.
        const applicability = await loadApplicabilityContext(
            { ...headerParties(header), OrderHeaderID: orderHeaderID, ProductID: null },
            provider,
            user,
        );
        byOrder.set(id, { header, applicability });
    }

    const products = new Map<string, Record<string, unknown> | null>();
    const out: (LinePriceStanding | null)[] = [];
    for (const line of lines) {
        const shared = byOrder.get(orderKey(line.OrderHeaderID));
        if (!shared) {
            out.push(null);
            continue;
        }
        const productKey = line.ProductID.toLowerCase();
        if (!products.has(productKey)) {
            products.set(productKey, await LoadApplicabilityProduct(line.ProductID, provider, user));
        }
        const ctx = contextFor(line, shared.header, { ...shared.applicability, Product: products.get(productKey) ?? null });
        out.push(ctx ? await standingIn(line, ctx, provider, user) : null);
    }
    return out;
}

async function standingIn(
    line: PricedLineFacts,
    ctx: PriceResolutionContext,
    provider: IMetadataProvider,
    user: UserInfo,
): Promise<LinePriceStanding> {
    const engine = await resolveEngineForStatedPrice(ctx, provider, user);
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
