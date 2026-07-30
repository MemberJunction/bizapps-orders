/**
 * Output for `Orders.SpawnRenewals`.
 *
 * Every candidate comes back whether or not an order was placed, with the reason it
 * was skipped — an unattended job that silently does nothing is indistinguishable
 * from one that is broken.
 *
 * NO import statements — definitions are emitted verbatim.
 */
export interface RenewalCandidate {
    SubscriptionID: string;
    SubscriptionNumber: string;
    ProductID: string;
    /** End of the term that is expiring. */
    CurrentTermEnd: string;
    /** Lead days actually applied, after the subscription's override of the type's default. */
    LeadDays: number;
    /** Set when the renewal was placed (absent on a preview, or when placing failed). */
    OrderID?: string;
    OrderNumber?: string;
    /** Set when this candidate was skipped, with the reason. */
    SkippedReason?: string;
}

export interface SpawnRenewalsOutput {
    Success: boolean;
    Message?: string;
    /** Every subscription considered due, whether or not an order was placed. */
    Candidates: RenewalCandidate[];
    Placed: number;
    Skipped: number;
}
