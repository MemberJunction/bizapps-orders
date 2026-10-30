/**
 * Input for `Orders.CheckOrderLinesEditable`.
 *
 * Whether another app's registered order-line veto would refuse an edit to this order's lines. The
 * order editor asks this when an order loads and after each save, so it can show the lines read-only
 * instead of letting someone type changes the save will refuse.
 *
 * Read-only.
 *
 * NO import statements — definitions are emitted verbatim.
 */
export interface OrdersCheckOrderLinesEditableInput {
    /** A saved order. */
    OrderHeaderID: string;
}
