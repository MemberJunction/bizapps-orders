/**
 * Output of `Orders.CheckOrderLinesEditable`.
 *
 * One answer per kind of edit: the refusal the save would give, in the vetoer's own words, or null
 * when the vetoer allows it. All three are null on a host where nothing is registered. A vetoer that
 * fails counts as a refusal, and its text names the fault.
 *
 * The question is asked of the order, not of a line, so the vetoer is told no line id.
 *
 * NO import statements — definitions are emitted verbatim.
 */
export interface OrdersCheckOrderLinesEditableOutput {
    /** Adding a line. */
    CreateRefusal: string | null;
    /** Changing a line already saved. */
    UpdateRefusal: string | null;
    /** Removing a line. */
    DeleteRefusal: string | null;
}
