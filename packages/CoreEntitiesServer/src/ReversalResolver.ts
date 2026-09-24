/**
 * ReversalResolver — finds the line a reversal unwinds, and how much of it is already gone.
 *
 * The server half of `ReversalBehavior`: this does the lookups, that does the judging. Same split
 * as `PriceResolver`/`PricingBehavior` and for the same reason — the rule about how much may be
 * returned is provable without a database, and only finding the rows needs one.
 *
 * ALREADY-REVERSED IS A SUM ACROSS ORDERS, not a flag on the line. A customer may send back two of
 * four units in March and two more in June, on separate return orders. Each of those is individually
 * within the original, so a guard that reads one reversal at a time passes both — and a third one
 * too. Only the running total against the origin catches it.
 *
 * DRAFT AND VOIDED RETURNS DO NOT COUNT. A draft that never confirms would otherwise hold the
 * customer's allowance hostage, and a voided one already gave it back.
 *
 * CONNECTS TO:
 *   PURE:   ./ReversalBehavior.ts
 *   CALLER: OrderEntityServer.savePendingLines (before pricing — see there for why)
 */
import { IMetadataProvider, IRunViewProvider, RunView, UserInfo } from '@memberjunction/core';
import { ToISODate } from '@mj-biz-apps/orders-entities';
import type { ReversalScheduleRow } from './ContractBalance.js';
import type { ReversalOrigin } from './ReversalBehavior.js';

const ORDER_LINE_ENTITY = 'MJ_BizApps_Orders: Order Lines';
const ORDER_HEADER_ENTITY = 'MJ_BizApps_Orders: Order Headers';
const SUBSCRIPTION_TERM_ENTITY = 'MJ_BizApps_Orders: Subscription Terms';
const ORDER_HEADER_PAYMENT_SCHEDULE_ENTITY = 'MJ_BizApps_Orders: Order Header Payment Schedules';

/** The origin line plus what prior reversals have already taken from it. */
export interface ReversalContext {
    Origin: ReversalOrigin;
    AlreadyReversed: number;
    /**
     * The origin ORDER's instalments, cancelled ones included (D92 §6). Empty for an order with no
     * schedule. The rules that act on rows skip `Canceled` themselves.
     */
    ScheduleRows: ReversalScheduleRow[];
    /**
     * The origin line's company bills this order by instalment (D92 §6) — so the reversal books a
     * credit memo, or nothing at all, and never the mirrored value entry. Read from the ORIGIN
     * order's schedule, cancelled rows included: the reversal order has no schedule of its own, and
     * a second reversal after the first withdrew every instalment is still reversing a scheduled
     * order.
     */
    OriginScheduled: boolean;
}

/**
 * Load the origin line for `reversesOrderLineID` and total the reversals already booked against it.
 *
 * Returns `null` when the origin does not exist — the caller refuses, rather than treating a
 * dangling pointer as "no constraint". A reversal pointing at nothing is the case where every
 * guard in `ReversalBehavior` would otherwise pass vacuously.
 */
export async function LoadReversalContext(
    reversesOrderLineID: string,
    provider: IMetadataProvider,
    user: UserInfo,
    /** IDs to exclude from the already-reversed total — the reversal line being validated, on a re-save. */
    excludeLineIDs: string[] = [],
): Promise<ReversalContext | null> {
    // A FORMAT CHECK ON AN INTERPOLATED ID. Everything reaching here comes from our own columns, so
    // this is not the last line of defence against injection — but it is free, it turns a malformed
    // pointer into a clear refusal instead of a SQL syntax error from inside a booking transaction,
    // and it means the filter below cannot be built from arbitrary text. Raised by Marcelo on PR #17.
    if (!/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(reversesOrderLineID)) {
        throw new Error(
            `'${reversesOrderLineID}' is not a valid order line identifier, so the line it claims to ` +
                `reverse cannot be looked up.`,
        );
    }

    const rv = new RunView(provider as unknown as IRunViewProvider);

    type LineRow = {
        ID: string;
        OrderHeaderID: string;
        ProductID: string;
        Quantity: number;
        UnitPrice: number;
        DiscountPct: number;
        DiscountAmount: number;
        ServicePeriodStart?: Date | string | null;
        ServicePeriodEnd?: Date | string | null;
        SubscriptionID?: string | null;
        LineNumber?: number | null;
        CompanyID?: string | null;
        BilledToDate?: number | null;
        RecognizedToDate?: number | null;
        LineTotalNet?: number | null;
    };

    // The origin and every reversal already pointing at it, in ONE view. Splitting them costs a
    // round trip and buys nothing — both are order lines and both are needed.
    const lines = await rv.RunView<LineRow>(
        {
            EntityName: ORDER_LINE_ENTITY,
            ExtraFilter: `ID = '${reversesOrderLineID}' OR ReversesOrderLineID = '${reversesOrderLineID}'`,
            ResultType: 'simple',
        },
        user,
    );

    const rows = lines?.Results ?? [];
    const origin = rows.find((r) => String(r.ID).toLowerCase() === reversesOrderLineID.toLowerCase());
    if (!origin) return null;
    const priors = rows.filter((r) => r !== origin);

    // The order-line view does not carry its header's Status, and the status is what decides
    // whether a prior reversal counts — so the headers have to be fetched. One view, not one per.
    // The ORIGIN's header rides along: its number is what a refusal and a credit memo have to name,
    // and fetching it separately would be a second round trip for one string.
    const statusByOrder = new Map<string, string>();
    const numberByOrder = new Map<string, string | null>();
    {
        const wanted = [...new Set([origin.OrderHeaderID, ...priors.map((p) => p.OrderHeaderID)])];
        const ids = wanted.map((id) => `'${id}'`).join(',');
        const headers = await rv.RunView<{ ID: string; Status: string; OrderNumber: string | null }>(
            {
                EntityName: ORDER_HEADER_ENTITY,
                ExtraFilter: `ID IN (${ids})`,
                ResultType: 'simple',
            },
            user,
        );
        for (const h of headers?.Results ?? []) {
            statusByOrder.set(String(h.ID).toLowerCase(), String(h.Status ?? ''));
            numberByOrder.set(String(h.ID).toLowerCase(), h.OrderNumber ?? null);
        }
    }

    // THE TERM IS THE AUTHORITY ON WHICH SUBSCRIPTION THIS LINE BOUGHT, not the line's own
    // `SubscriptionID`. That column is a FORWARD link added later for the confirm pre-flight to read,
    // and it is only populated on lines written since — an order line from before it existed, or one
    // whose subscription was attached by any path that does not stamp it, carries NULL while its term
    // sits there naming the subscription correctly. `SubscriptionTerm.OrderLineID` is NOT NULL and is
    // written by the same step that creates the term, so it is the link that is always there.
    const terms = await rv.RunView<{ SubscriptionID: string; OrderLineID: string }>(
        {
            EntityName: SUBSCRIPTION_TERM_ENTITY,
            ExtraFilter: `OrderLineID = '${reversesOrderLineID}'`,
            ResultType: 'simple',
        },
        user,
    );
    const subscriptionID = terms?.Results?.[0]?.SubscriptionID ?? origin.SubscriptionID ?? null;
    const scheduleRows = await loadScheduleRows(rv, user, origin.OrderHeaderID);

    const excluded = new Set(excludeLineIDs.map((id) => id.toLowerCase()));
    let alreadyReversed = 0;
    for (const prior of priors) {
        if (excluded.has(String(prior.ID).toLowerCase())) continue;
        // A Draft return has not taken anything yet and a Voided one has given it back. Anything
        // else — Confirmed, Posted, Fulfilled — is money the customer already has. An UNKNOWN
        // status counts: a prior reversal whose header could not be read is not evidence of room.
        const status = statusByOrder.get(String(prior.OrderHeaderID).toLowerCase()) ?? '';
        if (status === 'Draft' || status === 'Voided') continue;
        // `ABS` because reversal quantities are stored negative, and a signed sum here would let a
        // reversal and a re-sale cancel out into a fresh allowance.
        alreadyReversed += Math.abs(Number(prior.Quantity ?? 0));
    }

    return {
        Origin: {
            ID: origin.ID,
            ProductID: origin.ProductID,
            Quantity: Number(origin.Quantity ?? 0),
            UnitPrice: Number(origin.UnitPrice ?? 0),
            DiscountPct: Number(origin.DiscountPct ?? 0),
            DiscountAmount: Number(origin.DiscountAmount ?? 0),
            OrderNumber: numberByOrder.get(String(origin.OrderHeaderID).toLowerCase()) ?? null,
            // The coverage window the origin actually sold — for a subscription that is the SETTLED
            // term, which `materializeSubscriptions` stamped back onto the line, so the anchoring and
            // proration the type applied are already baked in here and need no re-deriving.
            ServicePeriodStart: origin.ServicePeriodStart ? new Date(origin.ServicePeriodStart) : null,
            ServicePeriodEnd: origin.ServicePeriodEnd ? new Date(origin.ServicePeriodEnd) : null,
            SubscriptionID: subscriptionID,
            OrderHeaderID: origin.OrderHeaderID,
            LineNumber: origin.LineNumber ?? null,
            CompanyID: origin.CompanyID ?? null,
            // The contract position the reversal has to respect (D92 §6): what this line has been
            // billed and what it has earned. Read from the ORIGIN, never from the reversing line,
            // which has neither yet.
            BilledToDate: Number(origin.BilledToDate ?? 0),
            RecognizedToDate: Number(origin.RecognizedToDate ?? 0),
            LineTotalNet: Number(origin.LineTotalNet ?? 0),
        },
        AlreadyReversed: Math.round(alreadyReversed * 1e4) / 1e4,
        ScheduleRows: scheduleRows,
        OriginScheduled: scheduleRows.some(
            (r) => r.CompanyID.toLowerCase() === String(origin.CompanyID ?? '').toLowerCase(),
        ),
    };
}

/**
 * The origin order's instalments, for the reversal rules in `ContractBalance`.
 *
 * Read for every reversal rather than only for scheduled orders: an order with no schedule returns
 * an empty array. Cancelled rows are kept, because "was this order billed by instalment" must
 * still be true after an earlier reversal withdrew them all. One view, no join.
 */
async function loadScheduleRows(
    rv: RunView,
    user: UserInfo,
    orderHeaderID: string,
): Promise<ReversalScheduleRow[]> {
    const res = await rv.RunView<ReversalScheduleRow & { DueDate: string }>(
        {
            EntityName: ORDER_HEADER_PAYMENT_SCHEDULE_ENTITY,
            ExtraFilter: `OrderHeaderID = '${orderHeaderID}'`,
            Fields: ['ID', 'CompanyID', 'InstallmentNumber', 'DueDate', 'Status', 'DocumentNumber'],
            OrderBy: 'DueDate, InstallmentNumber',
            ResultType: 'simple',
        },
        user,
    );
    return (res?.Results ?? []).map((r) => ({
        ID: String(r.ID),
        CompanyID: String(r.CompanyID),
        InstallmentNumber: Number(r.InstallmentNumber ?? 0),
        DueDate: ToISODate(r.DueDate) ?? String(r.DueDate).slice(0, 10),
        Status: String(r.Status),
        DocumentNumber: r.DocumentNumber ? String(r.DocumentNumber) : null,
    }));
}

/**
 * Every sale line on an order has been taken back in full, counting reversals already confirmed —
 * which is when a reversal may withdraw the order's unissued instalments (Andrew, #237).
 *
 * A reversal of one line of three, or 4 units of 10, leaves lines that the schedule still bills
 * for, so withdrawing the instalments would stop billing for goods the customer kept. Reads each
 * line through {@link LoadReversalContext} so "already reversed" means exactly what the quantity
 * guard means by it; the reversal being booked counts, because its header is already Confirmed.
 */
export async function IsWholeOrderReversed(
    orderHeaderID: string,
    provider: IMetadataProvider,
    user: UserInfo,
): Promise<boolean> {
    const rv = new RunView(provider as unknown as IRunViewProvider);
    const sales = await rv.RunView<{ ID: string }>(
        {
            EntityName: ORDER_LINE_ENTITY,
            ExtraFilter: `OrderHeaderID = '${orderHeaderID}' AND ReversesOrderLineID IS NULL AND Quantity > 0`,
            Fields: ['ID'],
            ResultType: 'simple',
        },
        user,
    );
    if (!sales?.Success) {
        throw new Error(`The lines of order ${orderHeaderID} could not be read: ${sales?.ErrorMessage ?? 'unknown error'}`);
    }
    for (const sale of sales.Results) {
        const context = await LoadReversalContext(String(sale.ID), provider, user);
        if (!context) throw new Error(`Order line ${sale.ID} vanished while its order was being reversed.`);
        if (context.AlreadyReversed < context.Origin.Quantity) return false;
    }
    return sales.Results.length > 0;
}
