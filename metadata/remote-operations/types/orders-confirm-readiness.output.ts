/**
 * Output of `Orders.ConfirmReadiness`.
 *
 * Empty when confirm would pass the concession gate, and for an order that is already booked or
 * voided.
 *
 * NO import statements — definitions are emitted verbatim.
 */
export interface ConfirmReadinessOutput {
    /**
     * One sentence per problem, in the wording confirm refuses with, e.g. "Line 1 is discounted 10%,
     * a concession worth 1000.00 with no approved Price concession recorded for it."
     */
    ConcessionProblems: string[];
    /**
     * One sentence per thing the gate let through on the order as a whole, which does not hold confirm,
     * e.g. "Line 2 is priced 2012.00 below its engine price, made up for by line 1, priced 5012.00 above
     * its own, so the order as a whole gives nothing away by price." (golive #499).
     */
    ConcessionNotes: string[];
}
