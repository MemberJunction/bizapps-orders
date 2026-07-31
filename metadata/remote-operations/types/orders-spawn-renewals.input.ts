/**
 * Input for `Orders.SpawnRenewals`.
 *
 * A renewal is a SCHEDULED CONTINUATION and auto-renew is the consent switch. This
 * finds subscriptions whose LATEST term expires inside their own lead window and
 * places a confirmed renewal order for each that consented.
 *
 * NO import statements — definitions are emitted verbatim.
 */
export interface SpawnRenewalsInput {
    /** Treat this as "today". Defaults to now. */
    AsOfDate?: string;
    /** Restrict to one subscription — for a targeted retry, or for a test. */
    SubscriptionID?: string;
    /** Report what WOULD be placed, without placing anything. */
    Preview?: boolean;
    /**
     * Cap on orders placed in one pass. A safety valve for the first production run, where a
     * mis-set lead time could otherwise invoice an entire book of business at once.
     */
    MaxCount?: number;
}
