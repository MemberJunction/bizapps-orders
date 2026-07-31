/**
 * Output for `Orders.GetOverdueWorklist`.
 *
 * A worklist, not a report: each row carries what is needed to decide what to do
 * next without a second round trip — including the credit the customer is already
 * holding, because spending that comes before chasing cash.
 *
 * NO import statements — definitions are emitted verbatim.
 */
export interface OverdueWorklistRow {
    OrderHeaderID: string;
    OrderNumber: string;
    OrderDate: string;
    DueDate: string;
    DaysOverdue: number;
    CompanyID: string;
    CompanyName: string;
    /** Whichever party the order bills — organization wins, else the person. */
    CustomerName: string;
    BillToOrganizationID?: string | null;
    BillToPersonID?: string | null;
    TotalGross: number;
    AmountPaid: number;
    Balance: number;
    Description?: string | null;
    SalesRepUserID?: string | null;
    SalesRepName?: string | null;
    /** Where the order came from — a self-serve purchase is chased differently. */
    OriginChannel?: string | null;
    /**
     * Credit this customer already holds, as a positive magnitude, summed from their
     * negative-balance orders. Offering it is almost always the cheapest collection.
     */
    AvailableCredit: number;
    /**
     * Set when a failed subscription renewal put this into grace. Grace extends
     * ACCESS, never revenue — the two are different dates.
     */
    GraceThroughDate?: string | null;
    SubscriptionID?: string | null;
    SubscriptionNumber?: string | null;
}

export interface OrdersGetOverdueWorklistOutput {
    Success: boolean;
    Message?: string;
    /** Oldest first — the order a person should work them in. */
    Rows: OverdueWorklistRow[];
    /** Totals over the returned set, for the header chips. */
    TotalOverdue: number;
    RowCount: number;
    /** True when `MaxCount` clipped the result, so the UI can say so rather than imply completeness. */
    Truncated: boolean;
    /** Aging buckets over the returned set. */
    Buckets: { Current: number; Days1To30: number; Days31To60: number; Days61Plus: number };
}
