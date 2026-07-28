/**
 * order-builder.ts — one way to construct an order across every bundle.
 *
 * Orders are built through the ENTITY API (not raw SQL) on purpose: that is the path
 * `OrderEntityServer.Save` intercepts, so numbering, subscription materialization, booking and the
 * auto initial payment all fire exactly as they do in production. A check that inserted rows
 * directly would test the schema and nothing else.
 */
import { Metadata } from '@memberjunction/core';
import type { BaseEntity, UserInfo } from '@memberjunction/core';

/**
 * A line to put on the order. Only `ProductID` and `Quantity` are required.
 *
 * `UnitPrice` became OPTIONAL when the pricing engine landed (D69): omitting it is how a check asks
 * the engine to resolve the price, and stating it is how a check asserts that direct entry still
 * wins. Both are behaviours worth exercising, so neither can be the only option.
 */
export interface LineSpec {
    ProductID: string;
    Quantity: number;
    UnitPrice?: number;
    /** 0–1. A discount with no linked contra account nets into the sales credit (D11). */
    DiscountPct?: number;
    /** Coverage window for deferred lines that have no subscription (events, plain deferred services). */
    ServicePeriodStart?: string;
    ServicePeriodEnd?: string;
    /**
     * Ship-to (D61): where a physical line goes, or WHO an intangible line is for. Each side falls
     * back to the order header independently.
     */
    ShipToOrganizationID?: string;
    ShipToPersonID?: string;
    ShipToAddressID?: string;
    /** Renew this exact subscription rather than letting the engine resolve one (D61). */
    RenewsSubscriptionID?: string;
}

export interface OrderSpec {
    CompanyID: string;
    Lines: LineSpec[];
    /** Defaults to today; set explicitly whenever a check asserts dates. */
    OrderDate?: Date;
    /** WHO PAYS (D65). Either side, or both. Falls through as the last tier of subscriber resolution. */
    BillToOrganizationID?: string;
    BillToPersonID?: string;
    /** Order-level ship-to — the default every line inherits unless it overrides (D61). */
    ShipToOrganizationID?: string;
    ShipToPersonID?: string;
    /** D42 initial-payment intent, captured at order entry and turned into a real payment at confirm. */
    InitialPaymentTypeID?: string;
    InitialPaymentAmount?: number;
    InitialPaymentDetailID?: string;
    /** Promotion codes the customer presented (D70). Resolved after the lines are priced. */
    PromotionCodes?: string[];
    /** Ad-hoc discounts, each gated by the applying user's SalesAuthority (D70). */
    ManualDiscounts?: Array<{ OrderLineID?: string | null; Amount: number; Reason: string }>;
    /** Charges to apply — shipping, handling, tax layers (D71). Computed after promotions. */
    Charges?: Array<Record<string, unknown>>;
}

export interface BuiltOrder {
    Order: BaseEntity & Record<string, unknown>;
    Lines: Array<BaseEntity & Record<string, unknown>>;
}

/** Build a DRAFT order in memory. Nothing is saved until the caller sets Status and calls Save(). */
export async function BuildOrder(user: UserInfo, spec: OrderSpec): Promise<BuiltOrder> {
    const md = new Metadata();
    const order = await md.GetEntityObject<BaseEntity & Record<string, unknown>>(
        'MJ_BizApps_Orders: Order Headers',
        user,
    );
    order.NewRecord();
    order.OrderType = 'Sale';
    order.OrderDate = spec.OrderDate ?? new Date();
    order.Status = 'Draft';
    order.CompanyID = spec.CompanyID;
    if (spec.BillToOrganizationID) order.BillToOrganizationID = spec.BillToOrganizationID;
    if (spec.BillToPersonID) order.BillToPersonID = spec.BillToPersonID;
    if (spec.ShipToOrganizationID) order.ShipToOrganizationID = spec.ShipToOrganizationID;
    if (spec.ShipToPersonID) order.ShipToPersonID = spec.ShipToPersonID;
    if (spec.InitialPaymentTypeID) order.InitialPaymentTypeID = spec.InitialPaymentTypeID;
    if (spec.InitialPaymentAmount != null) order.InitialPaymentAmount = spec.InitialPaymentAmount;
    if (spec.InitialPaymentDetailID) order.InitialPaymentDetailID = spec.InitialPaymentDetailID;
    // Promotions ride the header the same way lines do — set here, resolved inside Save (D70).
    if (spec.PromotionCodes) {
        (order as unknown as { PromotionCodes: string[] }).PromotionCodes = spec.PromotionCodes;
    }
    if (spec.ManualDiscounts) {
        (order as unknown as { ManualDiscounts: unknown[] }).ManualDiscounts = spec.ManualDiscounts;
    }
    if (spec.Charges) {
        (order as unknown as { Charges: unknown[] }).Charges = spec.Charges;
    }

    const lines: Array<BaseEntity & Record<string, unknown>> = [];
    let lineNumber = 1;
    for (const ls of spec.Lines) {
        const line = await md.GetEntityObject<BaseEntity & Record<string, unknown>>(
            'MJ_BizApps_Orders: Order Lines',
            user,
        );
        line.NewRecord();
        line.ProductID = ls.ProductID;
        line.LineNumber = lineNumber++;
        line.Quantity = ls.Quantity;
        // Left UNSET when the caller omitted it, so the engine sees an untouched field. Assigning
        // 0 would look like a deliberate free line and suppress resolution entirely.
        if (ls.UnitPrice !== undefined) line.UnitPrice = ls.UnitPrice;
        line.DiscountPct = ls.DiscountPct ?? 0;
        if (ls.ServicePeriodStart) line.ServicePeriodStart = new Date(ls.ServicePeriodStart);
        if (ls.ServicePeriodEnd) line.ServicePeriodEnd = new Date(ls.ServicePeriodEnd);
        if (ls.ShipToOrganizationID) line.ShipToOrganizationID = ls.ShipToOrganizationID;
        if (ls.ShipToPersonID) line.ShipToPersonID = ls.ShipToPersonID;
        if (ls.ShipToAddressID) line.ShipToAddressID = ls.ShipToAddressID;
        if (ls.RenewsSubscriptionID) line.RenewsSubscriptionID = ls.RenewsSubscriptionID;
        lines.push(line);
    }

    // `Lines` is the transient collection OrderEntityServer.Save persists after the header exists.
    (order as unknown as { Lines: unknown }).Lines = lines;
    return { Order: order, Lines: lines };
}

/**
 * Build and confirm in one step, returning the saved order.
 * `Save()` returning false is the normal failure signal — the caller decides whether that's the
 * expected outcome (all-or-none checks) or a failure.
 */
export async function ConfirmOrder(
    user: UserInfo,
    spec: OrderSpec,
): Promise<BuiltOrder & { Saved: boolean; Message: string }> {
    const built = await BuildOrder(user, spec);
    built.Order.Status = 'Confirmed';
    const saved = await built.Order.Save();
    return {
        ...built,
        Saved: saved,
        Message: (built.Order.LatestResult?.CompleteMessage as string) ?? '',
    };
}
