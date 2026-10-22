/**
 * Output for `Orders.CancelExternalInvoice`.
 *
 * Cancellation is an invoice-lifecycle act, not an accounting event: no journal entry, no change to
 * the order or the instalment. The instalment's SentAt returns to NULL so it reads as unsent again.
 *
 * NO import statements — definitions are emitted verbatim.
 */
export type OrdersCancelExternalInvoiceResultCode =
    | 'CANCELED'
    | 'NOT_SENT'
    | 'HAS_PAYMENT'
    | 'PAYMENT_PENDING_ON_RAIL'
    | 'RAIL_REFUSED'
    | 'ERROR';

export interface OrdersCancelExternalInvoiceOutput {
    Success: boolean;
    Message?: string;
    ResultCode: OrdersCancelExternalInvoiceResultCode;
    ExternalInvoiceID?: string | null;
    CanceledAt?: string | null;
}
