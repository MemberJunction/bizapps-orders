/**
 * Input for `Orders.RecordAccessOverrideDecision`.
 *
 * NO import statements — definitions are emitted verbatim.
 */
export interface RecordAccessOverrideDecisionInput {
    AccessOverrideID: string;
    /** A Tasks decision outcome code: Approved, ApprovedWithConditions or Rejected. */
    Outcome: string;
    Notes?: string;
}
