/**
 * Output for `Orders.AdvanceOrderState`.
 *
 * Reports how far the order actually got, rung by rung, and what the ledger behind it looks like.
 *
 * A STALLED ADVANCE IS A RESULT, NOT AN ERROR. An order that reaches Posted and stops because two
 * lines could not be marked shipped is a normal outcome of a migration against incomplete records —
 * the caller needs to know which rung it stuck on and why, not catch an exception.
 *
 * NO import statements — definitions are emitted verbatim.
 */
export interface OrdersAdvanceOrderStateOutput {
    /** True only if the order reached `RequestedStatus`. */
    Success: boolean;
    Message?: string | null;

    OrderHeaderID: string | null;
    OrderNumber: string | null;

    /** Where the order actually is now. */
    Status: string | null;
    /** Where the caller asked it to go. */
    RequestedStatus: string;

    /**
     * Each rung attempted, whether it was taken, and — when it was not — why.
     *
     * Reporting only the final status would lose the distinction between "refused at the first step"
     * and "moved two rungs and stalled on the third", which are different problems to go and fix.
     */
    Transitions: OrderStateTransition[];

    /**
     * Journal entries standing behind this order's lines, read back from the ledger rather than
     * assumed. The confirm happened on an earlier call, so this operation has no first-hand knowledge
     * of it — and an entry count of zero because nobody looked is indistinguishable from an order
     * that never booked.
     */
    EntryCount: number;
    /** False if any of those entries does not balance — a ledger defect, surfaced rather than hidden. */
    AllBalanced: boolean;

    /** Fulfillable lines that could not be marked Fulfilled. Non-zero with Success means it was forced. */
    UnfulfilledLineCount: number;

    /** Why the advance was refused outright, when it was. */
    Blockers: BlockerResult[];
}

/** One step the order actually took. Recorded even when it was a no-op, so the trail is complete. */
export interface OrderStateTransition {
    From: string;
    To: string;
    /** False when the step was refused or skipped; `Reason` then says why. */
    Applied: boolean;
    Reason?: string | null;
}

/**
 * Something that makes the operation impossible, in the words of the rule that failed.
 *
 * Declared here rather than alongside the operation that first needed it: that one was
 * `Orders.SaveOrder`, which is gone, and several operations still speak this shape. Every surface
 * that renders a refusal renders this, so it has to keep existing somewhere.
 */
export interface BlockerResult {
    Code: string;
    Message: string;
    /** Where to go to fix it, when there is somewhere. */
    ResolutionHint?: string | null;
    LineNumber?: number | null;
}
