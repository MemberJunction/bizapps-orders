/**
 * Output for `Orders.GetRenewalWorklist`.
 *
 * One row per subscription whose expiring term ends inside the window, soonest first. Every date is
 * `YYYY-MM-DD`. Money is before tax; a line total is the unit price times the seats, less the line's
 * discount, and says nothing about promotions or charges.
 *
 * NO import statements — definitions are emitted verbatim.
 */
export type RenewalWorklistState =
    | 'Renewed'
    | 'RenewalPending'
    | 'DueNow'
    | 'Scheduled'
    | 'Lapsed'
    | 'WillEnd'
    | 'Ended'
    | 'ProviderBilled'
    | 'Inactive';

export interface RenewalWorklistRow {
    SubscriptionID: string;
    SubscriptionNumber: string;
    /** `Subscription.Status`. */
    Status: string;
    AutoRenew: boolean;
    /** A payment gateway bills this subscription; Orders places no renewal order for it. */
    ProviderBilled: boolean;
    /** The beneficiary: the person the service is for. */
    ContactID?: string | null;
    ContactName?: string | null;
    /** The holder: the organization that pays. */
    AccountID?: string | null;
    AccountName?: string | null;
    /** The selling company. */
    CompanyID: string;
    CompanyName: string;
    ProductID: string;
    ProductName: string;
    SubscriptionTypeName: string;
    /** `Subscription.StartDate`: when the relationship began. */
    StartDate: string;
    /** The expiring term. */
    TermNumber: number;
    TermStartDate: string;
    TermEndDate: string;
    /** Days from the as-of day to the term end; negative once it has ended. */
    DaysUntilEnd: number;
    /** Lead days in force: the subscription's own, else its type's, else 0. */
    LeadDays: number;
    /** Where the renewal stands; see the state list. */
    State: RenewalWorklistState;
    /** The day the scheduled pass would place the renewal, while it still will (`DueNow`, `Scheduled`). */
    AutoRenewOn?: string | null;

    /** The order whose line bought the expiring term. */
    CurrentOrderID?: string | null;
    CurrentOrderNumber?: string | null;
    CurrentOrderDate?: string | null;
    CurrentOrderStatus?: string | null;
    CurrentUnitPrice?: number | null;
    CurrentQuantity?: number | null;
    CurrentLineTotal?: number | null;
    /** What is still owed on the current order. */
    CurrentOrderBalance?: number | null;

    /**
     * The renewal order, when one exists: the order whose line bought the following term
     * (`RenewalBooked`), or a live renewal order that has not produced a term yet (a draft).
     */
    RenewalOrderID?: string | null;
    RenewalOrderNumber?: string | null;
    RenewalOrderDate?: string | null;
    RenewalOrderStatus?: string | null;
    RenewalUnitPrice?: number | null;
    RenewalQuantity?: number | null;
    RenewalLineTotal?: number | null;
    RenewalTermStart?: string | null;
    RenewalTermEnd?: string | null;
    /** True when the following term exists: the renewal has booked. */
    RenewalBooked: boolean;

    /** `Subscription.RenewalIncreasePercent`, the rate set on the subscription itself; null means it inherits. */
    SubscriptionIncreasePercent?: number | null;

    /** What a renewal placed now would be written with, for a row that has none. Absent when not projected. */
    ProjectedUnitPrice?: number | null;
    ProjectedQuantity?: number | null;
    ProjectedLineTotal?: number | null;
    ProjectedBasePrice?: number | null;
    ProjectedBasePriceSource?: 'PriorPrice' | 'PriorList' | 'SuccessorList' | null;
    ProjectedIncreasePercent?: number | null;
    ProjectedIncreaseSource?: 'Subscription' | 'Product' | 'Category' | 'Company' | 'None' | null;
    /**
     * The increase that IS set for this subscription (its own, or inherited), whether or not this
     * renewal applied it, and whether it did. A renewal applies the increase only when the new term
     * crosses an anniversary of the subscription's start; a monthly term crosses one once a year.
     */
    ProjectedIncreaseSetPercent?: number | null;
    ProjectedIncreaseSetSource?: 'Subscription' | 'Product' | 'Category' | 'Company' | 'None' | null;
    ProjectedIncreaseApplied?: boolean | null;
    /** The product the renewal would be placed on: the subscription's own, or its successor. */
    ProjectedProductID?: string | null;
    ProjectedProductName?: string | null;
    ProjectedTermStart?: string | null;
    ProjectedTermEnd?: string | null;
    /** Why the renewal could not be priced, in words a person can act on. */
    ProjectionProblem?: string | null;
}

export interface OrdersGetRenewalWorklistOutput {
    Success: boolean;
    Message?: string;
    Rows: RenewalWorklistRow[];
    RowCount: number;
    /** True when `MaxCount` clipped the result. */
    Truncated: boolean;
    /** The window the rows were selected in, echoed so the UI can say what it is showing. */
    AsOfDate: string;
    WindowStart: string;
    WindowEnd: string;
    /**
     * How the scheduled renewal pass is set up on this host, so the page can say whether "due for
     * renewal" rows will actually be placed: `Live` places orders; `Preview` runs nightly but only
     * reports (the shipped default until a person turns it live); `Off` is disabled or missing;
     * `Unknown` when the job could not be read.
     */
    PassMode: 'Live' | 'Preview' | 'Off' | 'Unknown';
    /** The pass's next scheduled run, as the scheduler reports it, when known. */
    PassNextRunAt?: string | null;
}
