/**
 * Output for `Orders.PostDueRecognition`.
 *
 * What the pass did, line by line. The per-line list is the deliverable of a preview run — it is
 * what a person reads before letting the job write anything — and on a live run it is the record of
 * which lines moved and by how much.
 *
 * NO import statements — definitions are emitted verbatim.
 */
export interface OrdersPostDueRecognitionLine {
    OrderLineID: string;
    OrderNumber?: string;
    LineNumber?: number;
    /** What the driver says is earned through AsOf, as a magnitude. */
    EarnedThrough: number;
    /** What the line had already recognised, as a magnitude. */
    RecognizedBefore: number;
    /** EarnedThrough − RecognizedBefore. Never zero: a line with nothing to post is not listed. */
    Amount: number;
    /** The RevenueRecognition entry. Null on a preview, and on a line whose posting failed. */
    JournalEntryID?: string | null;
    /** Why this line posted nothing, when it was selected but did not. */
    FailedReason?: string;
}

export interface OrdersPostDueRecognitionOutput {
    Success: boolean;
    Message?: string;
    /** True when `Preview` was set: the lines below are what WOULD post; nothing was written. */
    Preview: boolean;
    AsOf?: string;
    /** How many confirmed lines on a time-driven deferred type were examined. */
    Considered?: number;
    /** How many had a non-zero delta and were posted. Always 0 on a preview. */
    Posted?: number;
    /** How many had a delta but could not be posted. Every one carries its reason. */
    Failed?: number;
    /** Every line with a non-zero delta, posted or not. */
    Lines?: OrdersPostDueRecognitionLine[];
}
