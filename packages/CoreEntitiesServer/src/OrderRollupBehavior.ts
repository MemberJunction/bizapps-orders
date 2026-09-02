/**
 * Which OrderHeader columns the database owns, and who wins when memory disagrees with the row.
 *
 * WHAT A ROLLUP IS HERE. `TotalGross`, `AmountPaid`, `Balance` and `FulfillmentStatus` are
 * maintained by `__mj_BizAppsOrders.spRecalcOrderHeaderTotals`, which the OrderLine and PaymentLine
 * triggers fire. No caller authors them. They are cross-table aggregates a computed column cannot
 * express (D41), which is why they are stored rather than derived per reader — and why a process
 * that writes lines has to go back and ask what the aggregate became.
 *
 * THE DIRECTION MATTERS, AND GETTING IT BACKWARDS IS THE BUG. An order header is written BEFORE its
 * lines exist, so at that moment `Balance` is legitimately NULL and the in-memory value is not a
 * stale copy of something better — it is the absence of an answer. Once the lines land, the ROW is
 * the only thing that knows. Preferring the entity's own value there is how a freshly-confirmed $895
 * order reported a NULL balance, displayed it as a dash, and then erased the stored total on the
 * next save (issue #147).
 *
 * So the row wins, unconditionally, whenever it has anything to say. Memory is a fallback for one
 * case only: the read came back empty because there is no row yet.
 *
 * CONNECTS TO:
 *   CODE: OrderEntityServer.refreshRolledUpTotals · spRecalcOrderHeaderTotals
 *   SQL:  migrations/V202609021530__v0.1.x__Repair_OrderHeader_Rollups.sql
 */

/**
 * The rollup columns, in the order they appear on the table.
 *
 * Read as a set by the entity server — to reset the fields before writing them, and as the `Fields`
 * list of the read that fetches them — so adding a trigger-maintained column here is the whole
 * change on the TypeScript side.
 */
export const ORDER_ROLLUP_FIELDS = ['TotalGross', 'AmountPaid', 'Balance', 'FulfillmentStatus'] as const;

/** One of the rollup column names. */
export type OrderRollupField = (typeof ORDER_ROLLUP_FIELDS)[number];

/**
 * The rollup columns as some source holds them. Every one is optional and nullable because both
 * sources are partial: a row read can come back empty, and an unsaved entity has no totals at all.
 */
export type OrderRollups = {
    TotalGross?: number | null;
    AmountPaid?: number | null;
    Balance?: number | null;
    FulfillmentStatus?: string | null;
};

/** Resolved rollups — every column present, `null` meaning "not computed yet". */
export type ResolvedOrderRollups = {
    TotalGross: number | null;
    AmountPaid: number | null;
    Balance: number | null;
    FulfillmentStatus: string | null;
};

/**
 * Settle each rollup column between the database row and what the entity currently holds.
 *
 * `row` is authoritative for any column it reports, INCLUDING a null one — a row that says the
 * balance is null is telling us the trigger has not run yet, which is a different and more current
 * fact than an entity's leftover guess. `current` is consulted only for columns the row did not
 * report at all, which happens when the read found no row.
 *
 * @param row - What the database returned, or null/undefined when the read found nothing.
 * @param current - The entity's present values, used only to fill columns the row omitted.
 * @returns Every rollup column, resolved.
 *
 * @example
 * ```typescript
 * // The row has computed the total; the entity's pre-line NULL loses.
 * MergeOrderRollups({ TotalGross: 895, AmountPaid: 0, Balance: 895, FulfillmentStatus: 'Pending' },
 *                   { TotalGross: null, Balance: null })
 * // → { TotalGross: 895, AmountPaid: 0, Balance: 895, FulfillmentStatus: 'Pending' }
 *
 * // No row came back — keep what we have rather than inventing nulls.
 * MergeOrderRollups(null, { TotalGross: 240, AmountPaid: 0, Balance: 240 })
 * // → { TotalGross: 240, AmountPaid: 0, Balance: 240, FulfillmentStatus: null }
 * ```
 */
export function MergeOrderRollups(
    row: OrderRollups | null | undefined,
    current: OrderRollups,
): ResolvedOrderRollups {
    const resolve = <K extends OrderRollupField>(field: K): ResolvedOrderRollups[K] => {
        const fromRow = row?.[field];
        // `in` rather than a null check: the row reporting null is an answer, not a gap.
        if (row && field in row && fromRow !== undefined) {
            return fromRow as ResolvedOrderRollups[K];
        }
        return (current[field] ?? null) as ResolvedOrderRollups[K];
    };

    return {
        TotalGross: resolve('TotalGross'),
        AmountPaid: resolve('AmountPaid'),
        Balance: resolve('Balance'),
        FulfillmentStatus: resolve('FulfillmentStatus'),
    };
}
