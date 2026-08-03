/**
 * @fileoverview What an order's status MEANS, and which statuses it may move to — stated once.
 *
 * WHY THIS EXISTS. The database enforces the legal SET (`CK_OrderHeader_Status`) and nothing enforced
 * the legal MOVES. `Fulfilled → Draft` saved. `Voided → Confirmed` saved. A voided order could come
 * back to life, keep its journal entries, and be shipped — every row individually valid, the CHECK
 * constraint satisfied, and no test looking.
 *
 * The second half of the problem was quieter. Six modules each held their own opinion about what a
 * status permits, written as ad-hoc string sets that had drifted apart:
 *
 *   `GetOverdueWorklist`   excludes Draft, Quoted, Voided
 *   `DeliveryBehavior`     excludes Draft, Voided, Cancelled, Canceled
 *   `InvoiceBehavior`      refuses Voided
 *   `FulfillmentBehavior`  nothing before Confirmed
 *   `ReversalResolver`     skips Draft, Voided
 *
 * `Cancelled` and `Canceled` are not legal `OrderHeader.Status` values at all — that set guards
 * against states which cannot occur, which is proof these were written from memory rather than from a
 * shared definition. Harmless there; not harmless as a pattern, because the next one written from
 * memory omits a status that CAN occur and the omission looks like every other line of the set.
 *
 * So the statuses, the transitions and the predicates live here, pure and testable, and the entity
 * server enforces them on the one path every write goes through.
 *
 * @module @mj-biz-apps/orders-core-entities-server
 */

/** The six values `CK_OrderHeader_Status` permits. */
export const ORDER_STATUSES = ['Draft', 'Quoted', 'Confirmed', 'Posted', 'Fulfilled', 'Voided'] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];

export function IsOrderStatus(value: string | null | undefined): value is OrderStatus {
    return !!value && (ORDER_STATUSES as readonly string[]).includes(value);
}

/**
 * Where each status may go.
 *
 * THE SHAPE OF THE LIFECYCLE. `Draft` and `Quoted` are the two editable states and may move to each
 * other freely — quoting a draft and pulling a quote back for edit are both ordinary. `Confirmed` is
 * the irreversible step: it books journal entries (D8), which is why nothing returns to an editable
 * state from there. After it the order advances forward only, and the sole way back out is `Voided`.
 *
 * `Voided` IS TERMINAL, and that is the entry that matters most. A voided order has given back what
 * it took — the reversal exists as its own record (D53) — so re-confirming it would book a second
 * time against a reversal that already stands. There is no legitimate route out, and offering one
 * would make "voided" mean "voided for now".
 *
 * `Fulfilled` is terminal-but-voidable: goods can be returned after they ship, and that is a void
 * plus a return order, not an edit of the original.
 *
 * A status may always be re-saved as itself — an ordinary row update that touches other columns.
 */
const TRANSITIONS: Record<OrderStatus, readonly OrderStatus[]> = {
    Draft: ['Quoted', 'Confirmed', 'Voided'],
    Quoted: ['Draft', 'Confirmed', 'Voided'],
    // Posted is the accounting-period step; Fulfilled is reachable directly because an order with
    // nothing to ship auto-advances past it (see FulfillmentBehavior).
    Confirmed: ['Posted', 'Fulfilled', 'Voided'],
    Posted: ['Fulfilled', 'Voided'],
    Fulfilled: ['Voided'],
    Voided: [],
};

export interface TransitionVerdict {
    Allowed: boolean;
    /** Present when refused — says what was attempted and why it is not a move. */
    Reason?: string;
}

/**
 * May this order move from `from` to `to`?
 *
 * AN UNKNOWN STATUS IS REFUSED, not ignored. The CHECK constraint would catch it a moment later with
 * a message naming a constraint rather than a status, and a caller that mistyped 'Complete' deserves
 * to be told that is not one of the six.
 */
export function CanTransition(from: string | null | undefined, to: string | null | undefined): TransitionVerdict {
    // A new order has no previous status; it may be created in any legal state. Creating one directly
    // as Confirmed is exactly what `Orders.CreateOrderInState` does for back-office entry (D17).
    if (from == null || from === '') {
        return IsOrderStatus(to)
            ? { Allowed: true }
            : { Allowed: false, Reason: `'${to}' is not an order status. Use one of: ${ORDER_STATUSES.join(', ')}.` };
    }

    if (!IsOrderStatus(from)) {
        return { Allowed: false, Reason: `'${from}' is not an order status, so nothing can move from it.` };
    }
    if (!IsOrderStatus(to)) {
        return { Allowed: false, Reason: `'${to}' is not an order status. Use one of: ${ORDER_STATUSES.join(', ')}.` };
    }

    // Re-saving a row without changing its status is not a transition.
    if (from === to) return { Allowed: true };

    if (TRANSITIONS[from].includes(to)) return { Allowed: true };

    const onward = TRANSITIONS[from];
    return {
        Allowed: false,
        Reason: onward.length
            ? `An order cannot go from ${from} to ${to}. From ${from} it may only become: ${onward.join(', ')}.`
            : `${from} is final. An order cannot leave it, so it cannot become ${to}.`,
    };
}

/** Every status reachable from this one, excluding staying put. Empty for a terminal status. */
export function NextStatuses(from: OrderStatus): readonly OrderStatus[] {
    return TRANSITIONS[from];
}

// ── What a status PERMITS ────────────────────────────────────────────────────────────────────────
//
// The predicates the rest of the app used to spell out as inline string sets. Each names the question
// it answers rather than the statuses it happens to match, so a new status is one edit here instead
// of five greps.

/** Editable: lines may be added, repriced and removed. Booking has not happened. */
export function IsEditable(status: string): boolean {
    return status === 'Draft' || status === 'Quoted';
}

/**
 * The order has booked — journal entries exist and the receivable is real.
 *
 * This is the test for "does this order owe money", used by the collections worklist and by anything
 * reconciling against the ledger.
 */
export function IsBooked(status: string): boolean {
    return status === 'Confirmed' || status === 'Posted' || status === 'Fulfilled';
}

/** Nothing further will happen to this order of its own accord. */
export function IsTerminal(status: string): boolean {
    return IsOrderStatus(status) && TRANSITIONS[status].length === 0;
}

/**
 * May a document for this order be SENT to a customer as a bill?
 *
 * A quote is deliverable — it is simply not a bill, which is the document kind's problem and not
 * this one. A draft is nobody's business yet, and a voided order still RENDERS (so somebody can look
 * at what was voided) but must never be emailed: a bill for money nobody owes is indistinguishable
 * from a real one once it is in an inbox.
 */
export function IsDeliverable(status: string): boolean {
    return status !== 'Draft' && status !== 'Voided';
}

/** Does this order count toward what a customer owes? */
export function CountsTowardReceivable(status: string): boolean {
    return IsBooked(status);
}
