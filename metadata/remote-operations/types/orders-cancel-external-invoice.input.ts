/**
 * Input for `Orders.CancelExternalInvoice`.
 *
 * Withdraw an UNPAID invoice from the external rail (Bill.com archives it). Blocked when any payment
 * has been applied to the unit here, or when the rail shows money applied that has not been polled
 * yet — a paid invoice follows the refund path, not this one (golive #147).
 *
 * NO import statements — definitions are emitted verbatim.
 */
export interface OrdersCancelExternalInvoiceInput {
    /** The Sent ExternalInvoice row to withdraw. */
    ExternalInvoiceID: string;
    /** Why, in the person's words. Recorded on the row. */
    Reason: string;
}
