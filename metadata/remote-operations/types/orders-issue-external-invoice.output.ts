/**
 * Output for `Orders.IssueExternalInvoice`.
 *
 * `ResultCode` says what happened in a word the UI and the sweep can branch on; `Message` says it in
 * a sentence a person can act on. Issuance never changes the order's Balance or PaymentStatus and
 * books no journal entry — payment is a separate event (golive #146).
 *
 * NO import statements — definitions are emitted verbatim.
 */
export type OrdersIssueExternalInvoiceResultCode =
    | 'SENT'
    | 'ALREADY_SENT'
    | 'PREVIEWED'
    | 'NO_RAIL'
    | 'IN_FLIGHT'
    | 'HAS_HISTORY'
    | 'NOT_CONFIRMED'
    | 'NAME_THE_INSTALMENT'
    | 'NAME_THE_COMPANY'
    | 'INSTALMENT_NOT_INVOICED'
    | 'NO_CUSTOMER_EMAIL'
    | 'TIE_FAILED'
    | 'RAIL_REFUSED'
    | 'ERROR';

export interface OrdersIssueExternalInvoiceOutput {
    Success: boolean;
    Message?: string;
    ResultCode: OrdersIssueExternalInvoiceResultCode;
    /** The ExternalInvoice row (Sent, Failed, or the pre-existing Sent row on ALREADY_SENT). */
    ExternalInvoiceID?: string | null;
    /** The rail's invoice id (Bill.com `00e…`). */
    ExternalInvoiceRef?: string | null;
    /** The rail's customer id the invoice was issued to (Bill.com `0cu…`). */
    ExternalCustomerRef?: string | null;
    /** Our frozen document number, which is the rail's invoice number. */
    DocumentNumber?: string | null;
    Amount?: number | null;
    DueDate?: string | null;
    SentAt?: string | null;
    /** On PREVIEWED: what would have been sent. */
    Payload?: unknown;
}
