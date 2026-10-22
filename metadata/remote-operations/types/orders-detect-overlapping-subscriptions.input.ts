/**
 * Input for `Orders.DetectOverlappingSubscriptions`.
 *
 * The nightly check behind finance exception type OVERLAPPING_SUBSCRIPTION: one exception per
 * pair of live subscriptions for one holder whose terms overlap, raised through accounting's
 * `Accounting.RaiseFinanceExceptions`. Re-running is safe — an exception already raised for a
 * pair is left as it is.
 *
 * NO import statements — definitions are emitted verbatim.
 */
export interface OrdersDetectOverlappingSubscriptionsInput {
    /**
     * The business day the exceptions are dated to (YYYY-MM-DD). Omit for today in the business
     * time zone, which is what the schedule uses.
     */
    AsOfDate?: string;
}
