/**
 * Input for `Orders.GetBillingWorklist`.
 *
 * The due-with-no-invoice control: instalments still `Scheduled` whose due date falls inside
 * the billing window. Computed at read time from the schedule rows, because "inside the window"
 * moves with the calendar rather than with a write — the same reason the overdue worklist is an
 * operation and not a stored flag.
 *
 * NO import statements — definitions are emitted verbatim.
 */
export interface OrdersGetBillingWorklistInput {
    /** Treat this as "today", `YYYY-MM-DD`. Defaults to today. */
    AsOfDate?: string;
    /** How far ahead to look, in days. Defaults to 30. Zero means "due today or earlier". */
    WindowDays?: number;
    /** Restrict to instalments billed by these companies. Omit for everything in scope. */
    CompanyIDs?: string[];
    /** Cap the result. Defaults to 500. */
    MaxCount?: number;
}
