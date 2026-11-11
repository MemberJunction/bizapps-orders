/**
 * Input for `Orders.GetRenewalWorklist`.
 *
 * The Renewals page: every subscription whose coverage ends inside a window, with the order that
 * bought the expiring term, the renewal order if one exists, and otherwise what the renewal would
 * be placed at and when the scheduled pass would place it. Computed at read time, because "ending
 * inside the window" moves with the calendar and the price moves with the catalog.
 *
 * NO import statements — definitions are emitted verbatim.
 */
export interface OrdersGetRenewalWorklistInput {
    /** Treat this as "today", `YYYY-MM-DD`. Defaults to the business day. */
    AsOfDate?: string;
    /** How far ahead to look, in days. Defaults to 90. */
    WindowDays?: number;
    /**
     * How far back to look, in days, for terms that ended and were not renewed. Defaults to 30. Zero
     * means "ending today or later" only.
     */
    LookbackDays?: number;
    /** Restrict to subscriptions sold by these companies. Omit for everything in scope. */
    CompanyIDs?: string[];
    /** Cap the result. Defaults to 500. */
    MaxCount?: number;
    /**
     * Price the renewal for each row that has none yet (the `Projected*` fields). Defaults to true.
     * Off, the list reads faster and says nothing about price.
     */
    Project?: boolean;
}
