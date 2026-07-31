/**
 * @fileoverview How a browser's draft becomes an order.
 *
 * THE PROBLEM THIS SOLVES. `OrderEntityServer.Save()` composes an order from
 * TRANSIENT collections that live on the server entity — `Lines` (an array of
 * unsaved line entities), `PromotionCodes`, `ManualDiscounts` and `Charges`. None
 * of them are columns, so none of them cross the entity-save boundary: a browser
 * calling `entity.Save()` marshals scalar fields and nothing else. That is why a
 * browser cannot compose an order through `BaseEntity` at all, and why the order
 * API is a set of remote operations rather than plain CRUD.
 *
 * This module is the bridge. It takes the plain-JSON draft the client sent and
 * rehydrates it into the exact object graph `Save()` expects — header entity,
 * unsaved line entities, and the three request collections — so every operation
 * that writes an order goes through ONE hydration path. The alternative, each
 * operation assembling entities itself, is four places for the mapping to drift
 * from the engine's expectations.
 *
 * WHAT IT DELIBERATELY DOES NOT DO. It does not price, discount, tax or resolve
 * anything. It maps fields. Every derived number is `Save()`'s to compute, and a
 * hydrator that "helpfully" filled in a unit price would be a second pricing
 * implementation wearing a mapping layer's clothes.
 *
 * @module @mj-biz-apps/orders-core-entities-server
 */

import type { BaseEntity, IMetadataProvider, UserInfo } from '@memberjunction/core';

/** MJ entity names. Centralised so a rename is one edit rather than a search. */
// 'Order Headers', NOT 'Orders'. The entity is named for its TABLE (OrderHeader), and the shorter
// name looks so much more natural that it has now been invented independently three times: here,
// in PreviewConfirm, and in the UI's MJO_ENTITIES.
//
// It fails at RUNTIME and quietly: GetEntityObject returns null and the next line throws
// "Cannot read properties of null (reading 'NewRecord')", naming neither the entity nor the lookup.
// Every operation built on this hydrator — SaveOrder, PreviewOrder, ConfirmOrder — was unusable
// because of this one string, and nothing caught it because every integration check reaches the
// engine through the order-builder rather than through the operations the UI actually calls.
export const ORDER_HEADER_ENTITY = 'MJ_BizApps_Orders: Order Headers';
export const ORDER_LINE_ENTITY = 'MJ_BizApps_Orders: Order Lines';

/**
 * The wire shapes, structurally identical to the operation contracts in
 * `metadata/remote-operations/types/` and to `OrderDraft`'s payload in
 * `@mj-biz-apps/orders-entities`.
 *
 * Declared locally because this package must build before CodeGen has emitted the
 * operation bases. Structural typing means a caller passing the generated type in
 * type-checks at the call site — which is where a drift between the two should be
 * caught, rather than silently at runtime.
 */
export interface HydratableLine {
    ClientKey?: string;
    ProductID: string;
    Quantity: number;
    UnitPrice?: number;
    DiscountPct?: number;
    ServicePeriodStart?: string | null;
    ServicePeriodEnd?: string | null;
    ShipToAddressID?: string | null;
    ShipToOrganizationID?: string | null;
    ShipToPersonID?: string | null;
    RenewsSubscriptionID?: string | null;
    ReversesOrderLineID?: string | null;
    Description?: string | null;
    Dimensions?: Array<{ DimensionID: string; DimensionValueID: string }>;
}

export interface HydratableHeader {
    OrderHeaderID?: string | null;
    OrderType?: string;
    OrderDate?: string;
    CompanyID: string;
    BillToPersonID?: string | null;
    BillToOrganizationID?: string | null;
    BillToAddressID?: string | null;
    ShipToPersonID?: string | null;
    ShipToOrganizationID?: string | null;
    ShipToAddressID?: string | null;
    SalesRepUserID?: string | null;
    PaymentTermsTypeID?: string | null;
    DueDate?: string | null;
    ExternalDocumentNumber?: string | null;
    Description?: string | null;
    Notes?: string | null;
    RequestedDeliveryDate?: string | null;
    ReversesOrderHeaderID?: string | null;
    ReversalReason?: string | null;
    OriginChannel?: string | null;
    OriginExternalID?: string | null;
    InitialPaymentTypeID?: string | null;
    InitialPaymentAmount?: number;
    SourceCustomerPaymentMethodID?: string | null;
}

export interface HydratableDraft {
    Header: HydratableHeader;
    Lines: HydratableLine[];
    PromotionCodes?: string[];
    ManualDiscounts?: Array<{ LineClientKey?: string; Percent?: number; Amount?: number; Reason: string }>;
    Charges?: Array<{ ChargeTypeID: string; Amount: number; OverrideReason?: string | null }>;
}

/**
 * A hydrated order, ready to `Save()`.
 *
 * `LineKeys` maps array position → the client's key, so an operation can hand a
 * priced result back keyed the way the client sent it. Line NUMBERS renumber when
 * a row is removed, so they cannot do that job.
 */
export interface HydratedOrder {
    /** The header entity, with the transient collections already attached. */
    Order: BaseEntity & Record<string, unknown>;
    /** The unsaved line entities, in order. Also assigned to `Order.Lines`. */
    Lines: Array<BaseEntity & Record<string, unknown>>;
    /** Parallel to `Lines`: the client key for each, or undefined if none was sent. */
    LineKeys: Array<string | undefined>;
    /**
     * Parallel to `Lines`: whether the CALLER stated the unit price, rather than
     * letting the pricing walk resolve one.
     *
     * Recorded here because this is the only place the answer is knowable. Once
     * the price is assigned to the entity, a stated $40 and a resolved $40 are
     * indistinguishable — and the difference is exactly what the price-source chip
     * on the order line reports. Deriving it later is not possible; discarding it
     * makes the UI claim every price came from a rule.
     */
    LineUnitPriceWasStated: boolean[];
}

/** Fields a caller may never set — the engine or a trigger owns each one. */
const HEADER_FIELDS_OWNED_BY_THE_ENGINE = new Set([
    'OrderNumber',      // taken from the sequence inside the confirm transaction
    'Status',           // transitioned by the operation, never by the payload
    'TotalGross',       // trigger-maintained rollup
    'AmountPaid',       // trigger-maintained rollup
    'Balance',          // trigger-maintained rollup
    'PaymentStatus',    // derived from the same trigger
    'PostedAt',
    'PostedByUserID',
    'ConfirmedAt',
]);

/**
 * Build an order and its lines from a client draft.
 *
 * Creates a new order, or loads an existing one when the draft carries an
 * `OrderHeaderID`. Loading is what makes "save the draft I have been editing"
 * work without the client resending fields it never touched.
 *
 * @param draft The client's payload.
 * @param provider The acting provider. Never `new Metadata()` — an operation runs
 *   inside a transaction, and a fresh global provider would open a second
 *   connection that blocks on this one's write locks until it times out.
 * @param user The acting user, threaded into every data call.
 *
 * @example
 * ```typescript
 * const hydrated = await HydrateOrderDraft(input.Draft, provider, user);
 * hydrated.Order.Status = 'Confirmed';
 * const ok = await hydrated.Order.Save();
 * ```
 */
export async function HydrateOrderDraft(
    draft: HydratableDraft,
    provider: IMetadataProvider,
    user: UserInfo,
): Promise<HydratedOrder> {
    const order = await provider.GetEntityObject<BaseEntity & Record<string, unknown>>(ORDER_HEADER_ENTITY, user);

    if (draft.Header.OrderHeaderID) {
        // Single-key `Load(id)` is emitted on the generated subclass, not declared
        // on `BaseEntity`, so it needs a structural cast. Same pattern as
        // `packages/IntegrationTests/src/payment-builder.ts`.
        const loaded = await (order as unknown as { Load(id: string): Promise<boolean> }).Load(
            draft.Header.OrderHeaderID,
        );
        if (!loaded) {
            throw new Error(`Order ${draft.Header.OrderHeaderID} was not found, or is not visible to this user.`);
        }
    } else {
        order.NewRecord();
    }

    applyHeader(order, draft.Header);

    const lines: Array<BaseEntity & Record<string, unknown>> = [];
    const lineKeys: Array<string | undefined> = [];
    const lineUnitPriceWasStated: boolean[] = [];
    let lineNumber = 1;

    for (const spec of draft.Lines ?? []) {
        const line = await provider.GetEntityObject<BaseEntity & Record<string, unknown>>(ORDER_LINE_ENTITY, user);
        line.NewRecord();
        line.ProductID = spec.ProductID;
        // Line numbers come from ARRAY ORDER, assigned here rather than sent, so
        // removing the second of three lines leaves 1-2-3 instead of 1-3.
        line.LineNumber = lineNumber++;
        line.Quantity = spec.Quantity;

        // The one mapping rule that matters. An absent UnitPrice must stay
        // UNTOUCHED so the engine sees a field nobody set and resolves a price.
        // Assigning 0 would look like a deliberate free line and suppress
        // resolution entirely — a silently free order.
        const unitPriceWasStated = spec.UnitPrice !== undefined && spec.UnitPrice !== null;
        lineUnitPriceWasStated.push(unitPriceWasStated);
        if (unitPriceWasStated) {
            line.UnitPrice = spec.UnitPrice;
        }

        line.DiscountPct = spec.DiscountPct ?? 0;

        if (spec.ServicePeriodStart) line.ServicePeriodStart = new Date(spec.ServicePeriodStart);
        if (spec.ServicePeriodEnd) line.ServicePeriodEnd = new Date(spec.ServicePeriodEnd);
        if (spec.ShipToAddressID) line.ShipToAddressID = spec.ShipToAddressID;
        if (spec.ShipToOrganizationID) line.ShipToOrganizationID = spec.ShipToOrganizationID;
        if (spec.ShipToPersonID) line.ShipToPersonID = spec.ShipToPersonID;
        if (spec.RenewsSubscriptionID) line.RenewsSubscriptionID = spec.RenewsSubscriptionID;
        if (spec.ReversesOrderLineID) line.ReversesOrderLineID = spec.ReversesOrderLineID;
        if (spec.Description) line.Description = spec.Description;

        lines.push(line);
        lineKeys.push(spec.ClientKey);
    }

    // The transient collections. `Save()` reads each of these; none is a column.
    order.Lines = lines;
    order.PromotionCodes = [...(draft.PromotionCodes ?? [])];
    order.ManualDiscounts = mapManualDiscounts(draft, lineKeys);
    order.Charges = [...(draft.Charges ?? [])];

    return {
        Order: order,
        Lines: lines,
        LineKeys: lineKeys,
        LineUnitPriceWasStated: lineUnitPriceWasStated,
    };
}

/** Copy the stated header fields, refusing the ones the engine owns. */
function applyHeader(order: BaseEntity & Record<string, unknown>, header: HydratableHeader): void {
    const assign = (field: string, value: unknown): void => {
        if (value === undefined) return;
        if (HEADER_FIELDS_OWNED_BY_THE_ENGINE.has(field)) return;
        order[field] = value;
    };

    assign('CompanyID', header.CompanyID);
    assign('OrderType', header.OrderType ?? 'Sale');
    // A stated order date wins; otherwise TODAY.
    //
    // The previous comment said "the engine's default stands", and there is no such default —
    // OrderDate is NOT NULL and nothing fills it, so a draft that omitted the date failed at save
    // with "Order Date cannot be null". Combined with the entity-name defect above, that meant every
    // operation built on this hydrator refused a perfectly ordinary draft.
    //
    // Backdating stays allowed and unguarded: the entry bears whatever date the order carries, which
    // is what Orders.CreateOrderInState depends on for recording something that already happened.
    assign('OrderDate', header.OrderDate ? new Date(header.OrderDate) : new Date());

    assign('BillToPersonID', header.BillToPersonID);
    assign('BillToOrganizationID', header.BillToOrganizationID);
    assign('BillToAddressID', header.BillToAddressID);
    assign('ShipToPersonID', header.ShipToPersonID);
    assign('ShipToOrganizationID', header.ShipToOrganizationID);
    assign('ShipToAddressID', header.ShipToAddressID);
    assign('SalesRepUserID', header.SalesRepUserID);
    assign('PaymentTermsTypeID', header.PaymentTermsTypeID);
    if (header.DueDate) assign('DueDate', new Date(header.DueDate));
    if (header.RequestedDeliveryDate) assign('RequestedDeliveryDate', new Date(header.RequestedDeliveryDate));
    assign('ExternalDocumentNumber', header.ExternalDocumentNumber);
    assign('Description', header.Description);
    assign('Notes', header.Notes);
    assign('ReversesOrderHeaderID', header.ReversesOrderHeaderID);
    assign('ReversalReason', header.ReversalReason);

    // Initial payment is INTENT. It becomes a real payment on confirm, and from
    // then on the payment record is the truth and these are never updated again.
    assign('InitialPaymentTypeID', header.InitialPaymentTypeID);
    if (header.InitialPaymentAmount !== undefined) assign('InitialPaymentAmount', header.InitialPaymentAmount);

    // Origin, so a self-serve purchase is never inferred from a null sales rep.
    // Guarded because the columns arrive with the OriginChannel schema wave; until
    // then a payload carrying origin is accepted and the value simply has nowhere
    // to land, rather than the whole save failing on an unknown field.
    trySetOptionalField(order, 'OriginChannel', header.OriginChannel);
    trySetOptionalField(order, 'OriginExternalID', header.OriginExternalID);
}

/**
 * Set a field that may not exist on this schema version yet.
 *
 * Deliberately silent on absence: the caller stated something the schema cannot
 * record, and refusing the whole order over it would make the UI's origin
 * tracking a hard dependency on a migration that is still in flight.
 */
function trySetOptionalField(
    order: BaseEntity & Record<string, unknown>,
    field: string,
    value: unknown,
): void {
    if (value === undefined || value === null) return;
    const exists = order.EntityInfo?.Fields?.some((f) => f.Name === field);
    if (exists) order[field] = value;
}

/**
 * Manual discounts, with a client key resolved to a line NUMBER.
 *
 * The client thinks in keys because its rows move; the engine thinks in line
 * numbers because that is what a saved line has. Translating here keeps that
 * mismatch in one function instead of at four call sites.
 */
function mapManualDiscounts(
    draft: HydratableDraft,
    lineKeys: Array<string | undefined>,
): Array<{ LineNumber?: number; Percent?: number; Amount?: number; Reason: string }> {
    return (draft.ManualDiscounts ?? []).map((discount) => {
        const index = discount.LineClientKey ? lineKeys.indexOf(discount.LineClientKey) : -1;
        return {
            // 1-based, matching the numbers assigned during hydration.
            ...(index >= 0 ? { LineNumber: index + 1 } : {}),
            ...(discount.Percent !== undefined ? { Percent: discount.Percent } : {}),
            ...(discount.Amount !== undefined ? { Amount: discount.Amount } : {}),
            Reason: discount.Reason,
        };
    });
}
