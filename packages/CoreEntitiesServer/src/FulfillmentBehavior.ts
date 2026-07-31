/**
 * Fulfilment decisions, with no database in sight.
 *
 * WHAT FULFILMENT IS HERE, AND WHAT IT IS NOT (D15). It is a LOGISTICS fact: the thing left the
 * building. It is emphatically not an accounting event — no journal entry fires on
 * Posted → Fulfilled. Revenue was settled at booking and released on its own schedule; whether the
 * box has shipped changes none of it.
 *
 * That disconnection is deliberate and worth restating, because "revenue on delivery" is the
 * intuition everyone brings. Coupling them would make a warehouse delay silently restate a closed
 * period.
 *
 * THE PART THAT NEEDS CARE. An order auto-advances to Fulfilled when NO line requires fulfilment —
 * a subscription, a download, a donation. If even one line does, the order waits for a person. The
 * hazard is the middle case: an order where some lines are fulfillable and some are not. Counting
 * "all lines fulfilled" would hold such an order open forever, because the non-fulfillable lines
 * never flip. Only the lines that CAN be fulfilled are allowed to hold it.
 *
 * CONNECTS TO:
 *   CODE: FulfillmentEngine · FulfillOrderLinesOperation · GetFulfillmentQueueOperation
 *   DOC:  plans/bizapps-orders-master.md D15
 */

/** The per-line fulfilment states (schema: CK_OrderLine_FulfillmentStatus). */
export type FulfillmentStatus = 'Pending' | 'Fulfilled' | 'Returned';

/** What a line has to say for itself. */
export interface FulfillableLine {
    ID: string;
    /** From the line's product TYPE. False for a subscription, a download, a donation. */
    RequiresFulfillment: boolean;
    /** Null when the type does not require fulfilment — the column is only meaningful when it does. */
    FulfillmentStatus: FulfillmentStatus | null;
    /** A reversal line is a return, not something to ship. */
    ReversesOrderLineID: string | null;
    /** A rollup parent is a display row; its children are the real goods (D45). */
    IsRollupParent: boolean;
}

/**
 * Does this line hold the order open?
 *
 * Four exclusions, each for its own reason:
 *   · the product type does not require fulfilment — nothing to ship;
 *   · it is a REVERSAL — goods coming back, tracked by the origin line's status, not this one;
 *   · it is a ROLLUP PARENT — a bundle's display row, whose children carry the actual goods;
 *   · it is already Fulfilled or Returned.
 */
export function IsAwaitingFulfillment(line: FulfillableLine): boolean {
    if (!line.RequiresFulfillment) return false;
    if (line.ReversesOrderLineID) return false;
    if (line.IsRollupParent) return false;
    return (line.FulfillmentStatus ?? 'Pending') === 'Pending';
}

/** Every line still holding the order open. */
export function AwaitingFulfillment(lines: FulfillableLine[]): FulfillableLine[] {
    return lines.filter(IsAwaitingFulfillment);
}

/**
 * Should the order advance to Fulfilled?
 *
 * TRUE when nothing is awaiting fulfilment — which covers both the auto-advance case (no line ever
 * required it) and the ordinary case (the last fulfillable line was just flipped).
 *
 * Deliberately NOT "every line is Fulfilled". On a mixed order the subscription line never flips,
 * so that test would hold it open forever while the warehouse insists it shipped everything.
 */
export function ShouldAdvanceToFulfilled(lines: FulfillableLine[]): boolean {
    return AwaitingFulfillment(lines).length === 0;
}

/**
 * Would this order auto-advance without anyone touching it (D15)?
 *
 * Distinct from `ShouldAdvanceToFulfilled` in INTENT rather than result: this asks whether the order
 * needs a fulfiller AT ALL, which is what decides whether it appears in the queue. An order that
 * auto-advances should never show up there, and an order that has simply been fully worked should.
 */
export function AutoAdvances(lines: FulfillableLine[]): boolean {
    return !lines.some((l) => l.RequiresFulfillment && !l.ReversesOrderLineID && !l.IsRollupParent);
}

export type FlipRefusal =
    | 'LineNotFound'
    | 'DoesNotRequireFulfillment'
    | 'AlreadyFulfilled'
    | 'IsReversal'
    | 'IsRollupParent'
    | 'OrderNotPosted';

/** The statuses from which a line may be flipped to Fulfilled. */
const ORDER_STATES_ALLOWING_FULFILLMENT = new Set(['Confirmed', 'Posted', 'Fulfilled']);

/**
 * May this line be flipped to Fulfilled right now?
 *
 * Returns null when it may, or the reason when it may not. A refusal is a normal outcome — a
 * fulfiller double-clicking a already-shipped line should be told so, not have it counted twice.
 */
export function RefuseFlip(
    line: FulfillableLine | null,
    orderStatus: string,
): FlipRefusal | null {
    if (!line) return 'LineNotFound';
    // Before Confirmed nothing is owed, so nothing can ship. Voided orders are out entirely.
    if (!ORDER_STATES_ALLOWING_FULFILLMENT.has(orderStatus)) return 'OrderNotPosted';
    if (!line.RequiresFulfillment) return 'DoesNotRequireFulfillment';
    if (line.ReversesOrderLineID) return 'IsReversal';
    if (line.IsRollupParent) return 'IsRollupParent';
    if ((line.FulfillmentStatus ?? 'Pending') !== 'Pending') return 'AlreadyFulfilled';
    return null;
}

/** Human wording for a refusal, so the caller does not have to invent one. */
export function ExplainRefusal(reason: FlipRefusal, lineID: string): string {
    switch (reason) {
        case 'LineNotFound':
            return `Order line ${lineID} does not exist.`;
        case 'OrderNotPosted':
            return (
                `Order line ${lineID} cannot be fulfilled because its order is not Confirmed or later. ` +
                `Nothing is owed until an order is confirmed, so nothing can ship.`
            );
        case 'DoesNotRequireFulfillment':
            return (
                `Order line ${lineID} is for a product type that requires no fulfilment — a subscription, ` +
                `a download, a donation. There is nothing to ship, so there is nothing to mark.`
            );
        case 'IsReversal':
            return (
                `Order line ${lineID} is a reversal. Goods coming BACK are tracked on the line they ` +
                `reverse, not by fulfilling the credit.`
            );
        case 'IsRollupParent':
            return (
                `Order line ${lineID} is a bundle's parent row, which carries no goods of its own. ` +
                `Fulfil its component lines instead.`
            );
        case 'AlreadyFulfilled':
            return `Order line ${lineID} has already been fulfilled or returned.`;
    }
}

/** One order's position in the fulfilment queue. */
export interface QueueGrouping {
    OrderHeaderID: string;
    AwaitingLineIDs: string[];
    /** Every fulfillable line, whether or not still pending — the denominator for "3 of 5". */
    FulfillableCount: number;
}

/**
 * Group pending lines by order, in the shape a queue screen wants.
 *
 * Orders with nothing awaiting are omitted rather than listed as complete: a queue is work to do,
 * and a screen full of finished orders is how a real backlog gets missed.
 */
export function GroupForQueue(
    lines: Array<FulfillableLine & { OrderHeaderID: string }>,
): QueueGrouping[] {
    const byOrder = new Map<string, QueueGrouping>();

    for (const line of lines) {
        const fulfillable = line.RequiresFulfillment && !line.ReversesOrderLineID && !line.IsRollupParent;
        if (!fulfillable) continue;

        let group = byOrder.get(line.OrderHeaderID);
        if (!group) {
            group = { OrderHeaderID: line.OrderHeaderID, AwaitingLineIDs: [], FulfillableCount: 0 };
            byOrder.set(line.OrderHeaderID, group);
        }
        group.FulfillableCount++;
        if (IsAwaitingFulfillment(line)) group.AwaitingLineIDs.push(line.ID);
    }

    return [...byOrder.values()].filter((g) => g.AwaitingLineIDs.length > 0);
}

/**
 * The initial `FulfillmentStatus` a line should be created with.
 *
 * NULL — not 'Pending' — when the type requires no fulfilment. The column's own documentation says
 * null means "does not apply", and writing 'Pending' on a subscription would put it in the queue
 * forever waiting for a shipment that does not exist.
 */
export function InitialFulfillmentStatus(requiresFulfillment: boolean): FulfillmentStatus | null {
    return requiresFulfillment ? 'Pending' : null;
}
