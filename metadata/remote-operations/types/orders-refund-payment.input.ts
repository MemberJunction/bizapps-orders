/**
 * Input for `Orders.RefundPayment`.
 *
 * A refund is a NEW payment, never an edit of the capture — the capture happened,
 * it has an entry, and rewriting it would destroy the trail of money that moved.
 *
 * NO import statements — definitions are emitted verbatim.
 */
export interface RefundPaymentInput {
    PaymentHeaderID: string;
    /** Omit for a full refund of whatever remains refundable. */
    Amount?: number;
    Reason?: string;
    /** Provider's refund id, when the money moved through one. */
    ProviderRefundID?: string;
    /** Compute and validate without writing — for a confirmation screen. */
    Preview?: boolean;
}
