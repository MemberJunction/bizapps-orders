/**
 * Input for `Orders.GetOverdueWorklist`.
 *
 * Overdue is a COMPUTED surface — `Balance > 0 AND DueDate < now` — never a stored
 * flag, because it changes with the clock rather than with a write. So the worklist
 * has to be assembled server-side; a client cannot filter a column that does not
 * exist, and storing one would mean a nightly job whose only purpose is keeping it
 * honest.
 *
 * NO import statements — definitions are emitted verbatim.
 */
export interface OrdersGetOverdueWorklistInput {
    /** Treat this as "today". Defaults to now. */
    AsOfDate?: string;
    /** Restrict to orders owned by these companies. Omit for everything in scope. */
    CompanyIDs?: string[];
    /** Restrict to one customer. */
    BillToOrganizationID?: string;
    BillToPersonID?: string;
    /** Only rows at least this many days past due. */
    MinDaysOverdue?: number;
    /** Only rows carrying at least this much. */
    MinBalance?: number;
    /** Restrict to a rep's book. */
    SalesRepUserID?: string;
    /** Cap the result. Defaults to 500; the tail of an aging list is not a worklist. */
    MaxCount?: number;
}
