/**
 * Input for `Orders.GetPriorReturns`.
 *
 * How much of each line has ALREADY been sent back. The Return page asks this before it offers a
 * quantity, because the cap it shows has to be the cap the server will enforce — and the rule
 * behind that cap is not simple enough to restate on the client: reversals sum ACROSS orders, and
 * Draft and Voided returns do not count toward the total (a draft that never confirms would
 * otherwise hold the allowance hostage, and a voided one has already given it back).
 *
 * Read-only.
 *
 * NO import statements — definitions are emitted verbatim.
 */
export interface GetPriorReturnsInput {
    /** The ORIGIN lines being asked about — the lines a return would reverse, not reversal lines. */
    OrderLineIDs: string[];
}
