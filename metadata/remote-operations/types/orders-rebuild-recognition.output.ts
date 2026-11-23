/**
 * Output for `Orders.RebuildRecognition`.
 *
 * What the rebuild voids, keeps and creates, returned whether or not anything was written.
 *
 * NO import statements — definitions are emitted verbatim.
 */
export interface OrdersRebuildRecognitionEntry {
    /** Null for an entry a preview would create. */
    JournalEntryID?: string | null;
    /** Null for an entry a preview would create. */
    EntryNumber?: string | null;
    /** YYYY-MM-DD. */
    EffectiveDate: string;
    /** What the entry releases from Deferred Revenue. */
    Amount: number;
    /** The entry's status: Pending, Batched or GLPosted. Null for a new entry. */
    Status?: string | null;
}

export interface OrdersRebuildRecognitionOutput {
    Success: boolean;
    Message?: string;
    /** True when `Preview` was set: nothing was written. */
    Preview: boolean;
    OrderNumber?: string;
    LineNumber?: number;
    ProductName?: string;
    /** The product's current recognition type, which the new schedule follows. */
    RevenueRecognitionTypeName?: string;
    /** Entries already batched or posted: left as they are. */
    Kept?: OrdersRebuildRecognitionEntry[];
    /** Entries still Pending in no batch: voided. */
    Voided?: OrdersRebuildRecognitionEntry[];
    /** The new schedule. */
    Created?: OrdersRebuildRecognitionEntry[];
    /** What the voided entries were going to recognize, and so what the new schedule recognizes. */
    AmountReplaced?: number;
    /** The OrderLineRecognitionRebuild row. Null on a preview. */
    OrderLineRecognitionRebuildID?: string | null;
}
