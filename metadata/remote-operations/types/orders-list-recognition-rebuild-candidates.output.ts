/**
 * Output for `Orders.ListRecognitionRebuildCandidates`.
 *
 * NO import statements — definitions are emitted verbatim.
 */
export interface OrdersRecognitionRebuildCandidate {
    OrderLineID: string;
    OrderHeaderID: string;
    OrderNumber: string;
    LineNumber: number;
    /** How many of the line's RevenueRecognition entries are still Pending in no batch. */
    PendingEntries: number;
}

export interface OrdersListRecognitionRebuildCandidatesOutput {
    Success: boolean;
    Message?: string;
    /** Oldest order first. */
    Lines?: OrdersRecognitionRebuildCandidate[];
}
