/**
 * Input for `Orders.ConfirmReadiness`.
 *
 * What would make confirm refuse this order on the concession gate. The order form asks this so the
 * list it shows under "Before this can be confirmed" is the rule confirm enforces, not a copy of it.
 *
 * Read-only.
 *
 * NO import statements — definitions are emitted verbatim.
 */
export interface ConfirmReadinessInput {
    /** A saved order. Its saved header and lines are checked, not unsaved edits in a browser. */
    OrderHeaderID: string;
}
