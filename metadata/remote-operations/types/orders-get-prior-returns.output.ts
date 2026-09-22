/**
 * Output of `Orders.GetPriorReturns`.
 *
 * One row per line ASKED ABOUT, including lines nothing has been returned against — a caller
 * showing a cap needs an answer for every line, and an absent row is indistinguishable from a
 * lookup that quietly failed.
 *
 * NO import statements — definitions are emitted verbatim.
 */
export interface GetPriorReturnsOutput {
    Lines: {
        OrderLineID: string;
        /** Units already reversed against this line, as a positive magnitude. */
        AlreadyReturned: number;
        /** What may still come back: the line's quantity less what has already gone. */
        RemainingReturnable: number;
    }[];
}
