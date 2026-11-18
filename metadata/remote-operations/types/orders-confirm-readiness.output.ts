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
     * Why this order's lines cannot be changed, when another app freezes them (the order of a closed
     * sales deal): the refusal the line save would give, e.g. "This deal is closed. Set the status
     * back to Open before changing what was sold." Null or absent when nothing freezes them. The form
     * shows a stated term start read-only with this as its hint rather than offering an edit the save
     * refuses (golive #393).
     */
    LineEditRefusal?: string | null;
}
