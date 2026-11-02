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
}
