/**
 * @fileoverview What an order's status MEANS, and which statuses it may move to — stated once.
 *
 * WHY THIS EXISTS. The database enforces the legal SET (`CK_OrderHeader_Status`) and nothing enforced
 * the legal MOVES. `Voided → Confirmed` saved. A voided order could come back to life, keep its journal
 * entries, and be shipped — every row individually valid, the CHECK constraint satisfied, and no test looking.
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
 * So the statuses, the transitions and the predicates live here, pure and testable, and the entity
 * server enforces them on the one path every write goes through.
 *
 * 3-WAY ORTHOGONAL LIFECYCLE MODEL:
 * 1. `Status`: Pure commercial contract state (Draft <-> Quoted -> Confirmed; Voided <-> Draft/Quoted).
 * 2. `FulfillmentStatus`: Operational delivery state (Pending | PartiallyFulfilled | Fulfilled | NotApplicable | Returned).
 * 3. Financial/Payment Progress: Pure numeric facts (TotalGross, AmountPaid, Balance, IsOverdue).
 *
 * @module @mj-biz-apps/orders-entities
 */
import type { mjBizAppsOrdersOrderHeaderEntity } from './generated/entity_subclasses';

/** The four values `CK_OrderHeader_Status` permits. */
export const ORDER_STATUSES = ['Draft', 'Quoted', 'Confirmed', 'Voided'] as const;

export type OrderStatus = mjBizAppsOrdersOrderHeaderEntity['Status'];

export const ORDER_FULFILLMENT_STATUSES = [
    'Pending',
    'PartiallyFulfilled',
    'Fulfilled',
    'NotApplicable',
    'Returned',
] as const;

export type OrderFulfillmentStatus = mjBizAppsOrdersOrderHeaderEntity['FulfillmentStatus'];

export function IsOrderStatus(value: string | null | undefined): value is OrderStatus {
    return !!value && (ORDER_STATUSES as readonly string[]).includes(value);
}

export function IsOrderFulfillmentStatus(value: string | null | undefined): value is OrderFulfillmentStatus {
    return !!value && (ORDER_FULFILLMENT_STATUSES as readonly string[]).includes(value);
}

/**
 * Where each commercial status may go.
 *
 * THE SHAPE OF THE LIFECYCLE.
 * - `Draft` and `Quoted` are the two pre-booking editable states. They may move to each other
 *   freely, or be moved to `Voided` (pre-booking void), or advance to `Confirmed` (booking gate).
 * - `Voided` (unconfirmed): An unconfirmed order in `Voided` may be reopened back to `Draft` or
 *   `Quoted`. Direct transition from `Voided` to `Confirmed` is blocked (must reopen as Draft/Quote first).
 * - `Confirmed` is the irreversible booking gate: it books journal entries (D8), which is why
 *   nothing returns to an editable state or moves to `Voided` from there.
 * - Post-booking cancellations/corrections go through **Reversal Orders** (D16/D53) rather than in-place
 *   status changes to `Voided`, ensuring correcting journal entries are properly recorded.
 *
 * A status may always be re-saved as itself — an ordinary row update that touches other columns.
 */
const TRANSITIONS: Record<OrderStatus, readonly OrderStatus[]> = {
    Draft: ['Quoted', 'Confirmed', 'Voided'],
    Quoted: ['Draft', 'Confirmed', 'Voided'],
    Confirmed: [],
    Voided: ['Draft', 'Quoted'],
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
 * a message naming a constraint rather than a status.
 */
export function CanTransition(from: string | null | undefined, to: string | null | undefined): TransitionVerdict {
    // A new order has no previous status; it may be created in any legal state. Creating one directly
    // as Confirmed is exactly what back-office entry does: save at Confirmed (D17).
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

    if (IsBooked(from) && to === 'Voided') {
        return {
            Allowed: false,
            Reason: `A booked order (${from}) cannot be voided in-place. Create a reversal order to cancel or refund lines (D53).`,
        };
    }

    if (from === 'Voided' && to === 'Confirmed') {
        return {
            Allowed: false,
            Reason: `A voided order cannot be confirmed directly. Reopen it as Draft or Quoted first.`,
        };
    }

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

/** Editable: lines may be added, repriced and removed. Booking has not happened. */
export function IsEditable(status: string): boolean {
    return status === 'Draft' || status === 'Quoted';
}

/**
 * May the Confirm *verb* be offered from this status?
 *
 * Separate from `CanTransition(from, 'Confirmed')` because a brand-new row may be
 * *created* as Confirmed (back-office entry) but the on-screen verb is only for
 * Draft and Quoted — the two states a person is still composing.
 */
export function CanOfferConfirm(status: string | null | undefined): TransitionVerdict {
    if (status == null || status === '') {
        return { Allowed: true };
    }
    if (IsBooked(status)) {
        return { Allowed: false, Reason: 'This order is already booked.' };
    }
    if (status === 'Voided') {
        return { Allowed: false, Reason: 'Reopen this voided order as a Draft or Quote before confirming.' };
    }
    return CanTransition(status, 'Confirmed');
}

/**
 * The order has booked — journal entries exist and the receivable is real.
 */
export function IsBooked(status: string): boolean {
    return status === 'Confirmed';
}

/** Nothing further will happen to this order of its own accord. */
export function IsTerminal(status: string): boolean {
    return IsOrderStatus(status) && TRANSITIONS[status].length === 0;
}

/**
 * May a document for this order be SENT to a customer as a bill?
 */
export function IsDeliverable(status: string): boolean {
    return status !== 'Draft' && status !== 'Voided';
}

/** Does this order count toward what a customer owes? */
export function CountsTowardReceivable(status: string): boolean {
    return IsBooked(status);
}

export interface FulfillableLineLike {
    RequiresFulfillment?: boolean | null;
    ReversesOrderLineID?: string | null;
    IsRollupParent?: boolean | null;
    FulfillmentStatus?: string | null;
}

/**
 * Computes the header FulfillmentStatus rolled up across its order lines.
 */
export function DeriveHeaderFulfillmentStatus(lines: readonly FulfillableLineLike[]): OrderFulfillmentStatus {
    const fulfillable = lines.filter(
        (l) => !!l.RequiresFulfillment && !l.ReversesOrderLineID && !l.IsRollupParent
    );
    if (fulfillable.length === 0) {
        return 'NotApplicable';
    }
    const fulfilledCount = fulfillable.filter((l) => l.FulfillmentStatus === 'Fulfilled').length;
    if (fulfilledCount === fulfillable.length) {
        return 'Fulfilled';
    }
    if (fulfilledCount > 0) {
        return 'PartiallyFulfilled';
    }
    return 'Pending';
}

export type DerivedPaymentStatus = 'Unpaid' | 'PartiallyPaid' | 'Paid';

/**
 * Derives payment status purely from numeric financial totals.
 */
export function DerivePaymentStatus(
    totalGross: number | null | undefined,
    amountPaid: number | null | undefined,
    balance: number | null | undefined
): DerivedPaymentStatus {
    const gross = Number(totalGross ?? 0);
    const paid = Number(amountPaid ?? 0);
    const bal = balance != null ? Number(balance) : gross - paid;

    if (bal <= 0 && gross > 0) return 'Paid';
    if (paid > 0) return 'PartiallyPaid';
    return 'Unpaid';
}
