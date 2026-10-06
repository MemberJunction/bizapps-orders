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
    /** The product the renewal is placed on: the subscription's own, or its successor. */
    RenewalProductID?: string;
    /** The renewal's unit price before the increase. */
    BasePrice?: number;
    /** Where the base price came from: the prior term's price, its list price, or the successor's list. */
    BasePriceSource?: 'PriorPrice' | 'PriorList' | 'SuccessorList';
    /** The increase applied, in percent: 0 when none is set or the new term crosses no anniversary. */
    IncreasePercent?: number;
    /** The level the increase was set at. */
    IncreaseSource?: 'Subscription' | 'Product' | 'Category' | 'Company' | 'None';
    /** The renewal line's unit price: the base plus the increase. */
    UnitPrice?: number;
    /** The renewal line's discount, as a fraction: 0 unless the subscription carries its discount into renewals. */
    DiscountPct?: number;
}

export interface SpawnRenewalsOutput {
    Success: boolean;
    Message?: string;
    /** Every subscription considered due, whether or not an order was placed. */
    Candidates: RenewalCandidate[];
    Placed: number;
    Skipped: number;
}
