/**
 * Which instalments `Orders.IssueInstalmentInvoice` is issuing right now (D91).
 *
 * Invoicing an instalment is the act that creates the receivable: it freezes the document number
 * the customer's AP department will match on, and it posts the billing entry. Both have to happen
 * together, and only the operation does both. Nothing stopped a user from doing HALF of it — the
 * schedule row is an ordinary entity, so a `Status` of `Invoiced` with a hand-typed number saves
 * perfectly well through Explorer, and the immutability trigger then freezes that row forever with
 * no journal entry behind it and no way to tell after the fact.
 *
 * So the entity refuses the transition unless the operation is the one making it, and this is how
 * it knows. The operation registers the row id immediately before the save and clears it in a
 * `finally`; `OrderHeaderPaymentScheduleEntityServer.Save` asks.
 *
 * ponytail: a module-level set, not a column and not a transaction-scoped context. It is in-process
 * only, which is all it needs to be — the thing being distinguished is one call stack, not one
 * user. Two MJAPI processes never share a save. If the guard ever has to survive a process hop
 * (a queued save, an external writer), the honest upgrade is a `JournalEntryID`-is-required check
 * in the trigger, not a bigger registry here.
 */

const issuing = new Set<string>();

/** Called by the operation immediately before it stamps the row. */
export function BeginInstalmentIssue(scheduleID: string): void {
    issuing.add(scheduleID.toLowerCase());
}

/** Called by the operation in a `finally`, whether the save succeeded or threw. */
export function EndInstalmentIssue(scheduleID: string): void {
    issuing.delete(scheduleID.toLowerCase());
}

/** True while the operation is mid-issue on this row. */
export function IsInstalmentIssueInProgress(scheduleID: string | null | undefined): boolean {
    return !!scheduleID && issuing.has(scheduleID.toLowerCase());
}
