/**
 * Output of `Orders.RecordRefundRequestDecision` and `Orders.WithdrawRefundRequest`.
 *
 * NO import statements — definitions are emitted verbatim.
 */
export interface RefundRequestDecisionOutput {
    Success: boolean;
    Message?: string;
    /** The request's status after the call. */
    Status?: string;
}
