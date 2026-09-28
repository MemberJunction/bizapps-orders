/**
 * Input for `Orders.AdoptExternalInvoice`.
 *
 * Attach an invoice the rail ALREADY HOLDS to a unit whose send was never confirmed.
 *
 * WHY THIS EXISTS. A send that times out leaves the unit claimed (`Sending`) on purpose: the rail may
 * or may not have committed the invoice, and retrying blindly is how one billing unit becomes two
 * invoices in a customer's inbox. Resolving that is a person's job, and it has two answers. If the
 * rail has nothing, they re-issue with `AllowReissue`. If the rail HAS the invoice, they bring its
 * reference here — which, until this operation existed, could only be done by editing the row by hand.
 *
 * NO import statements — definitions are emitted verbatim.
 */
export interface OrdersAdoptExternalInvoiceInput {
    /** The claimed (`Sending`) ExternalInvoice row to resolve. */
    ExternalInvoiceID: string;
    /** The rail's own invoice id — Bill.com `00e…` — that this unit's send actually produced. */
    ExternalInvoiceRef: string;
    /** Report what would happen and write nothing. */
    Preview?: boolean;
}
