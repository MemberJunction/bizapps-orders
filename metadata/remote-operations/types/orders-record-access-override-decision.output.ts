/**
 * Output of `Orders.RecordAccessOverrideDecision`.
 *
 * NO import statements — definitions are emitted verbatim.
 */
export interface AccessOverrideDecisionOutput {
    Success: boolean;
    Message?: string;
    /** The override's status after the call. */
    Status?: string;
    /** Grants whose status changed because the override was approved. */
    GrantsChanged?: number;
}
