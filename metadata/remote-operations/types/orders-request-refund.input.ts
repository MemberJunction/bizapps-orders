/**
 * Input for `Orders.RequestRefund`.
 *
 * A request to refund a captured payment. Nothing moves until it is approved through the task this
 * raises, and then the requester issues it with `Orders.RefundPayment` for exactly this amount.
 *
 * NO import statements — definitions are emitted verbatim.
 */
export interface RequestRefundInput {
    PaymentHeaderID: string;
    /** The amount to refund. Greater than zero, no more than what remains refundable. */
    Amount: number;
    /** Why the refund is needed. Required. */
    Reason: string;
}
