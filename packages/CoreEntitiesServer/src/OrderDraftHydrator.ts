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

import { RunView } from '@memberjunction/core';
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
/** The instrument row a tender's reference number lands on. */
const PAYMENT_DETAIL_ENTITY = 'MJ_BizApps_Orders: Payment Details';
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
    InitialPaymentReference?: string | null;
    InitialPaymentDetailID?: string | null;
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
    if (!order) {
        // NAME THE ENTITY. GetEntityObject returns null for an unknown name, and
        // the next line then throws "Cannot read properties of null (reading
        // 'NewRecord')" — an error that names neither the entity nor the lookup,
        // and sends the reader hunting through the whole save path.
        throw new Error(
            `Could not create an entity object for "${ORDER_HEADER_ENTITY}". ` +
                `Either the name is wrong or the entity is not registered with this provider.`,
        );
    }

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

    // A REFERENCE IS AN INSTRUMENT, NOT AN ORDER FIELD. Check numbers, wire confirmations and
    // transfer ids have no column on OrderHeader — they belong to the thing that paid. So a stated
    // reference becomes a real PaymentDetail here, and the order points at it; `createInitialPayment`
    // then COPIES that row onto the payment (D39), which is what stops the payment's record of the
    // check drifting if the intent row is later edited.
    //
    // Done before applyHeader so the id it produces is assigned with everything else, in one write.
    if (draft.Header.InitialPaymentReference?.trim() && draft.Header.InitialPaymentTypeID) {
        draft.Header.InitialPaymentDetailID = await createReferenceInstrument(
            provider,
            user,
            draft.Header.CompanyID,
            draft.Header.InitialPaymentTypeID,
            draft.Header.InitialPaymentReference.trim(),
        );
    }

    applyHeader(order, draft.Header);

    const lines: Array<BaseEntity & Record<string, unknown>> = [];
    const lineKeys: Array<string | undefined> = [];
    const lineUnitPriceWasStated: boolean[] = [];
    let lineNumber = 1;

    // AN ORDER THAT WAS SAVED AS A DRAFT ALREADY HAS LINE ROWS. Every line below used to be
    // `NewRecord()` unconditionally, so confirming a saved draft tried to INSERT line 1 a second
    // time and died on UQ_OrderLine_OrderHeader_LineNumber. The order could never be confirmed
    // again by any route — "Save draft" quietly made an order permanently unconfirmable.
    //
    // Matched on LINE NUMBER rather than on an id, because the payload has no line id to send: line
    // numbers are assigned from array order here (see below), so position is the only identity the
    // client and server share. That is exactly the identity the unique constraint is keyed on, so
    // matching on it is what makes the reconcile total.
    const existingLines = await loadExistingLines(draft.Header.OrderHeaderID ?? null, user);

    for (const spec of draft.Lines ?? []) {
        const line = await provider.GetEntityObject<BaseEntity & Record<string, unknown>>(ORDER_LINE_ENTITY, user);
        if (!line) {
            throw new Error(
                `Could not create an entity object for "${ORDER_LINE_ENTITY}". ` +
                    `Either the name is wrong or the entity is not registered with this provider.`,
            );
        }
        const existingID = existingLines.get(lineNumber);
        if (existingID) {
            // Load rather than NewRecord: this row exists, so the save must be an UPDATE.
            const loaded = await (line as unknown as { Load(id: string): Promise<boolean> }).Load(existingID);
            if (!loaded) line.NewRecord(); // vanished under us — fall back to an insert
            existingLines.delete(lineNumber);
        } else {
            line.NewRecord();
        }
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

    // WHATEVER IS LEFT WAS REMOVED IN THE UI. Deleting a line in the editor and saving again has to
    // delete the ROW, or the order silently keeps billing for something the screen no longer shows —
    // and the next save collides on its line number all over again.
    for (const [, staleID] of existingLines) {
        const stale = await provider.GetEntityObject<BaseEntity & Record<string, unknown>>(ORDER_LINE_ENTITY, user);
        if (!stale) continue;
        if (await (stale as unknown as { Load(id: string): Promise<boolean> }).Load(staleID)) {
            // A booked line refuses to delete (trigger 51003) and SHOULD — that is history, not a
            // draft edit. Report it rather than swallowing, so the user is told why it is still there.
            if (!(await stale.Delete())) {
                throw new Error(
                    `Could not remove order line: ${stale.LatestResult?.CompleteMessage ?? 'unknown error'}`,
                );
            }
        }
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
    assign('InitialPaymentDetailID', header.InitialPaymentDetailID);

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


/**
 * Create the `PaymentDetail` that carries a tender's own reference number.
 *
 * Only the three columns that matter are set: a check is not a card, so brand, last-4 and expiry
 * stay null rather than being filled with placeholders that would later read as real card data.
 */
async function createReferenceInstrument(
    provider: IMetadataProvider,
    user: UserInfo,
    companyID: string,
    paymentTypeID: string,
    reference: string,
): Promise<string> {
    const detail = await provider.GetEntityObject<BaseEntity & Record<string, unknown>>(
        PAYMENT_DETAIL_ENTITY,
        user,
    );
    if (!detail) {
        throw new Error(
            `Could not create an entity object for "${PAYMENT_DETAIL_ENTITY}" while recording the ` +
                `payment reference. Either the name is wrong or the entity is not registered.`,
        );
    }
    detail.NewRecord();
    detail.Set('CompanyID', companyID);
    detail.Set('PaymentTypeID', paymentTypeID);
    detail.Set('ReferenceNumber', reference);
    if (!(await detail.Save())) {
        throw new Error(
            `Could not record the payment reference: ${detail.LatestResult?.CompleteMessage ?? 'unknown error'}`,
        );
    }
    return detail.Get('ID') as string;
}


/**
 * The line numbers this order already has persisted, mapped to their row ids.
 *
 * Empty for an order that has never been saved, which is the common path — a brand-new draft does
 * one extra no-op call rather than branching, because the branch is where the bug would hide.
 */
async function loadExistingLines(orderHeaderID: string | null, user: UserInfo): Promise<Map<number, string>> {
    const map = new Map<number, string>();
    if (!orderHeaderID) return map;

    const result = await new RunView().RunView<{ ID: string; LineNumber: number }>(
        {
            EntityName: ORDER_LINE_ENTITY,
            ExtraFilter: `OrderHeaderID = '${orderHeaderID}'`,
            ResultType: 'simple',
        },
        user,
    );
    // RunView reports failure in its result rather than throwing. Treating a failed read as "no
    // lines" would put us straight back to inserting duplicates, so it is raised.
    if (!result.Success) {
        throw new Error(`Could not read the order's existing lines: ${result.ErrorMessage ?? 'unknown error'}`);
    }
    for (const row of result.Results ?? []) map.set(Number(row.LineNumber), String(row.ID));
    return map;
}
