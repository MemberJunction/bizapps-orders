/**
 * Input for `Orders.AdvanceOrderState`.
 *
 * WHAT THIS IS FOR. Back-office entry of something that has ALREADY happened — a sale taken at a
 * counter, a shipment that went out before anyone opened the system, a migration from whatever came
 * before. The order needs to land in its final state without a human clicking through
 * Confirmed → Posted → Fulfilled.
 *
 * WHAT IT IS NOT. A way to create an order. Composing one and booking it is `order.Save()` through
 * the entity graph — set the header's `Status` to 'Confirmed', attach the lines, save, and the
 * server subclass runs the real booking walk: per-line journal entries, subscription materialisation,
 * entitlement grants. This operation starts where that finishes.
 *
 * WHY IT TAKES AN ID AND NOT AN ORDER. The order exists by the time this runs, by construction — it
 * had to be booked to be advanceable. An earlier version took an `OrderDraft`, a hand-maintained
 * mirror of the order entity, and created the order on the way past; the mirror drifted from the
 * entity silently, in both directions, and it is gone.
 *
 * NO import statements — definitions are emitted verbatim.
 */
export interface OrdersAdvanceOrderStateInput {
    /** The booked order to advance. */
    OrderHeaderID: string;

    /**
     * Where it should end up: 'Posted' or 'Fulfilled'.
     *
     * 'Draft', 'Quoted' and 'Confirmed' are not accepted — those are reached by saving the order
     * itself, and Confirmed runs the booking walk on the way through, which is where that belongs.
     * 'Voided' is not accepted either: voiding is a separate decision about an existing order, not a
     * rung on this ladder.
     */
    TargetStatus: string;

    /**
     * Advance to Fulfilled even when some fulfillable lines could not be marked — a migration where
     * the shipment records are incomplete. Default false, because an order marked Fulfilled with
     * unshipped lines is a promise the system now claims to have kept.
     */
    ForceFulfillment?: boolean;

    /** Recorded on the order, so the row says why it skipped the usual path. */
    Reason?: string | null;
}
