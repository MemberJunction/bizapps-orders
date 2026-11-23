/**
 * Input for `Orders.RebuildRecognition`.
 *
 * Rebuild one confirmed order line's revenue recognition from its product's current recognition type
 * (golive #495). The entries still Pending in no batch are voided and staged again; entries already
 * batched or posted stay, and the new schedule covers only what they have not recognized.
 *
 * NO import statements — definitions are emitted verbatim.
 */
export interface OrdersRebuildRecognitionInput {
    /** The confirmed, non-subscription order line to rebuild. */
    OrderLineID: string;
    /** Why the schedule is rebuilt. Recorded on the rebuild and on each voided entry. Required unless previewing. */
    Reason?: string | null;
    /** Compute and return what WOULD change, writing nothing, for the confirmation step. */
    Preview?: boolean;
}
