/**
 * Input for `Orders.RecordRefundRequestDecision`.
 *
 * NO import statements — definitions are emitted verbatim.
 */
export interface RecordRefundRequestDecisionInput {
    RefundRequestID: string;
    /** A Tasks decision outcome code: `Approved`, `ApprovedWithConditions` or `Rejected`. */
    Outcome: string;
    Notes?: string;
}
