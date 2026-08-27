/**
 * @fileoverview Allocation arithmetic — pure, no Angular.
 *
 * The rules the payment screen depends on. Separate from the component for the
 * same reason the lifecycle rules are: they are the part that can be silently
 * WRONG, and they should be checkable without a rendering environment.
 *
 * One idea runs through all of it: **a payment must equal what it settles.**
 * There is no such thing as unapplied cash in this system — surplus becomes a
 * negative balance on an order, and that negative balance IS the customer's
 * credit. Every function here preserves that invariant.
 *
 * @module @mj-biz-apps/orders-ng
 */

/** The minimum an order must expose to take an allocation. */
export interface MJOAllocatableOrderLike {
    ID: string;
    Balance: number;
    /** Either representation: an entity carries a `Date`, a wire row an ISO string. */
    DueDate?: Date | string | null;
}

/** Order ID → amount applied. */
export type MJOAllocationMapLike = Record<string, number>;

/** Round to cents. Every function here rounds, so remainders reach exactly zero. */
function cents(value: number): number {
    return Math.round((value + Number.EPSILON) * 100) / 100;
}

/**
 * A due date as a sortable number. **No due date sorts FIRST** — open longest, most easily
 * forgotten — which is why the fallback is `-Infinity` rather than 0 or `Infinity`.
 *
 * This compared `(a.DueDate ?? '').localeCompare(...)`, which only ordered correctly while every
 * value was an ISO string in the same format. A `Date` stringifies to `Mon Aug 01 2026 …`, so a
 * mixed list sorted alphabetically by weekday name — and the oldest debt quietly stopped being paid
 * first, with every allocation still summing to the payment.
 */
function dueMillis(value: Date | string | null | undefined): number {
    if (!value) return -Infinity;
    const time = value instanceof Date ? value.getTime() : new Date(String(value)).getTime();
    return Number.isNaN(time) ? -Infinity : time;
}

/**
 * Total applied.
 *
 * Rounds the SUM rather than trusting float addition: thirty allocations of
 * 33.33 add up to 999.9000000000001, and an unallocated figure that never quite
 * reaches zero is a payment that can never be captured.
 */
export function SumAllocations(allocations: MJOAllocationMapLike): number {
    return cents(Object.values(allocations).reduce((sum, value) => sum + value, 0));
}

/** What is left to apply. Zero means capturable; negative means over-applied. */
export function UnallocatedRemainder(amount: number, allocations: MJOAllocationMapLike): number {
    return cents(amount - SumAllocations(allocations));
}

/**
 * Spread a payment across open orders, oldest first.
 *
 * Two decisions worth stating:
 *
 * - **An order with no due date sorts oldest.** It has been open longest without
 *   ever being billed on terms, so it is the one most likely to be forgotten.
 * - **Surplus lands on the LAST order rather than being left unapplied.** Unapplied
 *   cash is not a concept here; the surplus drives that order's balance negative,
 *   which is precisely how a customer credit is represented. Leaving it unapplied
 *   would produce a payment that cannot capture.
 *
 * @param amount What was received.
 * @param orders Open orders. Only positive balances are considered.
 *
 * @example
 * ```typescript
 * AllocateOldestFirst(500, [
 *   { ID: 'a', Balance: 300, DueDate: '2026-01-01' },
 *   { ID: 'b', Balance: 400, DueDate: '2026-06-01' },
 * ]);
 * // { a: 300, b: 200 }
 * ```
 */
export function AllocateOldestFirst(
    amount: number,
    orders: MJOAllocatableOrderLike[],
): MJOAllocationMapLike {
    const allocations: MJOAllocationMapLike = {};
    if (amount <= 0) return allocations;

    const owing = orders
        .filter((order) => order.Balance > 0)
        .slice()
        .sort((a, b) => dueMillis(a.DueDate) - dueMillis(b.DueDate));

    if (!owing.length) return allocations;

    let remaining = cents(amount);
    for (const order of owing) {
        if (remaining <= 0) break;
        const take = cents(Math.min(remaining, order.Balance));
        allocations[order.ID] = take;
        remaining = cents(remaining - take);
    }

    // Everything settled and cash still in hand: park it on the last order so the
    // payment balances. That turns the surplus into credit rather than into an
    // uncapturable payment.
    if (remaining > 0) {
        const last = owing[owing.length - 1];
        allocations[last.ID] = cents((allocations[last.ID] ?? 0) + remaining);
    }

    return allocations;
}
