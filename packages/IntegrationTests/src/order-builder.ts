/**
 * order-builder.ts — one way to construct an order across every bundle.
 *
 * Orders are built through the ENTITY API (not raw SQL) on purpose: that is the path
 * `OrderEntityServer.Save` intercepts, so numbering, subscription materialization, booking and the
 * auto initial payment all fire exactly as they do in production. A check that inserted rows
 * directly would test the schema and nothing else.
 */
import { Metadata } from '@memberjunction/core';
import type {
    mjBizAppsOrdersOrderHeaderEntity,
    mjBizAppsOrdersOrderLineEntity,
    mjBizAppsOrdersPaymentDetailEntity,
} from '@mj-biz-apps/orders-entities';
import type {
    ManualDiscountRequest,
    OrderEntityServer,
    RequestedCharge,
} from '@mj-biz-apps/orders-core-entities-server';
import { Fx } from './fixture.js';
import type { BaseEntity, IMetadataProvider, UserInfo } from '@memberjunction/core';

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
    /**
     * Coverage window for deferred lines that have no subscription (events, plain deferred
     * services).
     *
     * On a SUBSCRIPTION line, `ServicePeriodStart` states where the TERM begins (D-TERMSTART) and
     * the type's rules compute the end from it; a stated end is ignored there, since term length,
     * anchor and proration belong to the type.
     */
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
    /**
     * The line this one UNWINDS (D16). Required for a negative quantity — `OrderLineEntityServer`
     * refuses one without it, because a negative line with no origin is indistinguishable from a
     * typo, and it books a real credit either way.
     */
    ReversesOrderLineID?: string;
}

export interface OrderSpec {
    CompanyID: string;
    /**
     * Defaults to 'Sale'. A return or cancellation carries the negative lines; reversal is what the
     * negative LINE does, not what the order is called, so the type here is descriptive only.
     */
    OrderType?: mjBizAppsOrdersOrderHeaderEntity['OrderType'];
    Lines: LineSpec[];
    /** Defaults to today; set explicitly whenever a check asserts dates. */
    OrderDate?: Date;
    /**
     * State the due date outright (D83). The terms walk treats a stated date as final and never
     * recomputes it — this is the seam a contracts app supplies an answer Orders cannot derive.
     */
    DueDate?: string;
    /** State the terms and let the walk derive the date from `NetDays` (D83). */
    PaymentTermsTypeID?: string;
    /**
     * WHO PAYS (D65). Either side, or both. Falls through as the last tier of subscriber resolution.
     *
     * Omit both and you get the fixture's buyer organization — a confirmed order must name someone.
     * Pass `null` to opt out deliberately, which is how a check proves a payer-less confirm is refused.
     */
    BillToOrganizationID?: string | null;
    BillToPersonID?: string | null;
    /** Order-level ship-to — the default every line inherits unless it overrides (D61). */
    ShipToOrganizationID?: string;
    ShipToPersonID?: string;
    /** The ship-to ADDRESS — what tax jurisdiction resolution matches on (D73). */
    ShipToAddressID?: string;
    /** D42 initial-payment intent, captured at order entry and turned into a real payment at confirm. */
    InitialPaymentTypeID?: string;
    InitialPaymentAmount?: number;
    InitialPaymentDetailID?: string;
    /** Promotion codes the customer presented (D70). Resolved after the lines are priced. */
    PromotionCodes?: string[];
    /** Ad-hoc discounts, each gated by the applying user's SalesAuthority (D70). */
    ManualDiscounts?: ManualDiscountRequest[];
    /**
     * Charges to apply — shipping, handling, tax layers (D71). Computed after promotions.
     *
     * The ENGINE's request shape, keyed on `ChargeType.Code`. Typed rather than
     * `Record<string, unknown>` so a check cannot quietly hand the engine a charge it will not
     * match — which is exactly the mismatch the client payload has today (BUGS.md Bug 5a).
     */
    Charges?: RequestedCharge[];
}

export interface BuiltOrder {
    /** The header, typed as the server subclass the class factory returns — `Lines` lives there. */
    Order: OrderEntityServer;
    Lines: mjBizAppsOrdersOrderLineEntity[];
}

/**
 * Build a DRAFT order in memory. Nothing is saved until the caller sets Status and calls Save().
 *
 * `provider` exists for the `volume` bundle only. `Metadata` delegates to the ONE global provider,
 * so every order every other bundle builds shares a single connection and two `Save()` calls can
 * never overlap. Passing a provider explicitly binds the entity objects to it — `BaseEntity`
 * resolves `ProviderToUse` from the provider that constructed it — which is what makes a genuinely
 * concurrent second session possible. Omitting it keeps the global behaviour every other bundle
 * relies on.
 */
export async function BuildOrder(
    user: UserInfo,
    spec: OrderSpec,
    provider?: IMetadataProvider,
): Promise<BuiltOrder> {
    const md = provider ?? new Metadata();
    const order = await md.GetEntityObject<OrderEntityServer>(
        'MJ_BizApps_Orders: Order Headers',
        user,
    );
    order.NewRecord();
    order.OrderType = spec.OrderType ?? 'Sale';
    order.OrderDate = spec.OrderDate ?? new Date();
    order.Status = 'Draft';
    order.CompanyID = spec.CompanyID;
    if (spec.DueDate) order.DueDate = new Date(spec.DueDate);
    if (spec.PaymentTermsTypeID) order.PaymentTermsTypeID = spec.PaymentTermsTypeID;
    // EVERY FIXTURE ORDER NAMES A CUSTOMER, because every real one does.
    //
    // This used to leave both payer fields null whenever a spec did not state one, which was most
    // of the suite — so the checks were confirming orders that no business could have: a receivable
    // owed by nobody. That went unnoticed because nothing enforced a payer (the rule lived only in
    // the order screen), and it is precisely the state
    // `OrderEntityServer.ValidateAsync` now rejects.
    //
    // Passing `null` explicitly is the opt-out, and it means "prove the rejection" — it is how the
    // checks that assert a payer-less confirm is refused build their subject. `undefined`, which is
    // what you get by simply not mentioning the field, takes the fixture's buyer organization.
    if (spec.BillToOrganizationID === undefined && spec.BillToPersonID === undefined) {
        order.BillToOrganizationID = Fx().Customers.OrganizationID;
    } else {
        if (spec.BillToOrganizationID) order.BillToOrganizationID = spec.BillToOrganizationID;
        if (spec.BillToPersonID) order.BillToPersonID = spec.BillToPersonID;
    }
    if (spec.ShipToOrganizationID) order.ShipToOrganizationID = spec.ShipToOrganizationID;
    if (spec.ShipToPersonID) order.ShipToPersonID = spec.ShipToPersonID;
    if (spec.ShipToAddressID) order.ShipToAddressID = spec.ShipToAddressID;
    if (spec.InitialPaymentTypeID) order.InitialPaymentTypeID = spec.InitialPaymentTypeID;

    // A REFERENCE-REQUIRING TENDER GETS AN INSTRUMENT, because a real one always would.
    //
    // Check, Wire and Internal Transfer carry `RequiresReference`, and `createInitialPayment` now
    // refuses them without one — a captured payment with no check number cannot be reconciled
    // against a bank statement. Two checks (RU8, PL7) were booking a Check with no number, which is
    // the same shape of fixture bug as an order with no payer: the suite asserting a state the
    // business does not permit. RU7/RU9 already supplied a detail, which is why they kept passing.
    //
    // Stated `InitialPaymentDetailID` always wins, so a check that wants to prove the refusal, or
    // to assert something about a specific instrument, is unaffected.
    if (spec.InitialPaymentTypeID && !spec.InitialPaymentDetailID && requiresReference(spec.InitialPaymentTypeID)) {
        order.InitialPaymentDetailID = await createReferenceDetail(md, user, spec.CompanyID, spec.InitialPaymentTypeID);
    }
    if (spec.InitialPaymentAmount != null) order.InitialPaymentAmount = spec.InitialPaymentAmount;
    if (spec.InitialPaymentDetailID) order.InitialPaymentDetailID = spec.InitialPaymentDetailID;
    // Promotions ride the header the same way lines do — set here, resolved inside Save (D70).
    if (spec.PromotionCodes) {
        order.PromotionCodes.Codes = spec.PromotionCodes;
    }
    if (spec.ManualDiscounts) {
        order.RequestedDiscounts = spec.ManualDiscounts;
    }
    if (spec.Charges) {
        order.RequestedCharges = spec.Charges;
    }

    const lines: mjBizAppsOrdersOrderLineEntity[] = [];
    let lineNumber = 1;
    for (const ls of spec.Lines) {
        const line = await md.GetEntityObject<mjBizAppsOrdersOrderLineEntity>(
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
        if (ls.ReversesOrderLineID) line.ReversesOrderLineID = ls.ReversesOrderLineID;
        lines.push(line);
    }

    // `Lines` is a RelatedRecordCollection on the generated class — attached through `Add()`, which
    // stamps OrderHeaderID and the LineNumber sequence, rather than assigned as an array.
    for (const line of lines) {
        order.Lines.Add(line);
    }
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
    provider?: IMetadataProvider,
): Promise<BuiltOrder & { Saved: boolean; Message: string }> {
    const built = await BuildOrder(user, spec, provider);
    built.Order.Status = 'Confirmed';
    const saved = await built.Order.Save();
    return {
        ...built,
        Saved: saved,
        Message: (built.Order.LatestResult?.CompleteMessage as string) ?? '',
    };
}


/** Tender codes whose `PaymentType.RequiresReference` is true. */
const REFERENCE_TENDER_CODES = ['Check', 'Wire', 'InternalTransfer'] as const;

/** True when this payment type cannot be captured without a reference number. */
function requiresReference(paymentTypeID: string): boolean {
    const key = (v: string | null | undefined) => (v ?? '').trim().toLowerCase();
    const ids = Fx().PaymentTypeIDs;
    return REFERENCE_TENDER_CODES.some((code) => key(ids.get(code)) === key(paymentTypeID));
}

/** The instrument row a reference-requiring tender needs, with a recognisable fixture reference. */
async function createReferenceDetail(
    md: IMetadataProvider | Metadata,
    user: UserInfo,
    companyID: string,
    paymentTypeID: string,
): Promise<string> {
    const detail = await (md as Metadata).GetEntityObject<mjBizAppsOrdersPaymentDetailEntity>(
        'MJ_BizApps_Orders: Payment Details',
        user,
    );
    detail.NewRecord();
    detail.CompanyID = companyID;
    detail.PaymentTypeID = paymentTypeID;
    detail.ReferenceNumber = `FIXTURE-${String(detail.ID ?? '').slice(0, 8) || 'REF'}`;
    if (!(await detail.Save())) {
        throw new Error(
            `fixture could not create the payment instrument: ${detail.LatestResult?.CompleteMessage ?? 'unknown'}`,
        );
    }
    return detail.ID as string;
}
