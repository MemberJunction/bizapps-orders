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
    /** `Subscription.AutoRenew`. */
    AutoRenew?: boolean;
    /** How the order was, or would be, left. */
    OrderStatus?: 'Confirmed' | 'Draft';
    /** Set when the renewal was placed (absent on a preview, or when placing failed). */
    OrderID?: string;
    OrderNumber?: string;
    /**
     * Which renewal order of this pass the subscription renews on, 1-based. Members with the same number
     * share one order: same selling company, customer, term end, placement and renewal card.
     */
    OrderGroup?: number;
    /** Set when this candidate was skipped, with the reason. */
    SkippedReason?: string;
    /** The product the renewal is placed on: the subscription's own, or its successor. */
    RenewalProductID?: string;
    /**
     * The renewal's unit price before the increase. When the line that bought the expiring term was
     * longer than the renewal term (a 24-month line renewing for 12), the term's share of that line's
     * price: renewal months over line months (golive #338, golive #468).
     */
    BasePrice?: number;
    /**
     * The prior line's price, before it was cut to the renewal term's share. Set only when the line
     * that bought the expiring term was longer than the renewal term (golive #468).
     */
    PriorUnitPrice?: number;
    /** The months the prior line covered. Set when it differs from the renewal term's length (golive #468). */
    PriorLineMonths?: number;
    /** The months the renewal term covers. Set alongside `PriorLineMonths`. */
    RenewalTermMonths?: number;
    /**
     * Why a person should check this renewal's price before it bills (golive #468). Set when the prior
     * line was shorter than the renewal term: it renews at the short line's price, unscaled, since
     * that price may be a part-year price or a full-year price sold over a short first period.
     */
    PriceReview?: string;
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
    /** Seats the renewal buys. */
    Quantity?: number;
    /** First day of the term the renewal buys, `YYYY-MM-DD`, as the confirm will set it. */
    RenewalTermStart?: string;
    /** Last day of the term the renewal buys, `YYYY-MM-DD`, as the confirm will set it. */
    RenewalTermEnd?: string;
    /**
     * Promotion codes that carried into the renewal and discounted it: codes recorded on the line that
     * bought the expiring term whose promotion has `AppliesToRenewals` set. Absent when none were presented.
     */
    RenewalPromotionCodes?: string[];
    /**
     * Codes presented on the renewal that gave no discount, each with the reason: the promotion paused,
     * expired or out of its dates, or its other rules not met. The renewal is placed without them.
     */
    UnusableRenewalPromotionCodes?: Array<{ Code: string; Reason: string }>;
}

export interface SpawnRenewalsOutput {
    Success: boolean;
    Message?: string;
    /** Every subscription considered due, whether or not an order was placed. */
    Candidates: RenewalCandidate[];
    /** Renewal ORDERS placed; a candidate with an `OrderID` is a subscription renewed on one of them. */
    Placed: number;
    Skipped: number;
}
