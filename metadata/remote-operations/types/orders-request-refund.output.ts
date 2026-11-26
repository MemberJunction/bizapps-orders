/**
 * Output of `Orders.RequestRefund`.
 *
 * NO import statements — definitions are emitted verbatim.
 */
export interface RequestRefundOutput {
    Success: boolean;
    Message?: string;
    RefundRequestID?: string;
    ApprovalTaskID?: string;
}
