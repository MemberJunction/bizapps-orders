/**
 * Output for `Orders.AdoptExternalInvoice`.
 *
 * `TIE_FAILED` is the important refusal: the reference the person supplied points at an invoice whose
 * total is not this unit's amount, so adopting it would tie our receivable to the customer's document
 * for a different figure. Refused rather than recorded.
 *
 * NO import statements — definitions are emitted verbatim.
 */
export type OrdersAdoptExternalInvoiceResultCode =
    | 'ADOPTED'
    | 'PREVIEWED'
    | 'NOT_CLAIMED'
    | 'NOT_FOUND_ON_RAIL'
    | 'TIE_FAILED'
    | 'ALREADY_ADOPTED'
    | 'ERROR';

export interface OrdersAdoptExternalInvoiceOutput {
    Success: boolean;
    Message?: string;
    ResultCode: OrdersAdoptExternalInvoiceResultCode;
    ExternalInvoiceID?: string | null;
    ExternalInvoiceRef?: string | null;
    DocumentNumber?: string | null;
    /** What the rail says this invoice totals, when it could be read. */
    ExternalTotal?: number | null;
    /** What the unit is worth here. The two must agree to the cent. */
    Amount?: number | null;
}
