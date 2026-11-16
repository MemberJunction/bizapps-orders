/**
 * Input for `Orders.SpawnRenewals`.
 *
 * A renewal is a SCHEDULED CONTINUATION and auto-renew is the consent switch. This
 * finds subscriptions whose LATEST term expires inside their own lead window and
 * places a confirmed renewal order for each that consented. Given `SubscriptionIDs`
 * it instead places renewals for the subscriptions a person chose, as drafts where
 * the customer has not consented to recurring billing.
 *
 * NO import statements — definitions are emitted verbatim.
 */
export interface SpawnRenewalsInput {
    /** Treat this as "today". Defaults to now. */
    AsOfDate?: string;
    /** Restrict to one subscription — for a targeted retry, or for a test. */
    SubscriptionID?: string;
    /**
     * Place renewals for exactly these subscriptions, chosen by a person (the Renewals page). The lead
     * window and the auto-renew switch do not select here; eligibility still does (Active or Trialing,
     * latest term Scheduled or Active, not billed by a gateway, no renewal already pending), and each
     * ineligible id is reported as a skipped candidate rather than silently dropped.
     */
    SubscriptionIDs?: string[];
    /**
     * How to leave each order: `Confirmed` books and invoices it; `Draft` saves it for a person to
     * confirm. Defaults to `Confirmed` for the scheduled selection, and for `SubscriptionIDs` to
     * `Confirmed` where the subscription has auto-renew on and `Draft` where it does not.
     */
    PlaceAs?: 'Confirmed' | 'Draft';
    /** Report what WOULD be placed, without placing anything. */
    Preview?: boolean;
    /**
     * Cap on orders placed in one pass. A safety valve for the first production run, where a
     * mis-set lead time could otherwise invoice an entire book of business at once.
     */
    MaxCount?: number;
}
