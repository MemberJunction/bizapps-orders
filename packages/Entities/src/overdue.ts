/**
 * @fileoverview What "overdue" means — stated once, for every surface that asks.
 *
 * ## The problem this closes
 *
 * D32 says `IsOverdue` is "computed in the view/entity layer, never stored state". Until now it was
 * computed in **neither**, so every consumer re-derived it:
 *
 * ```text
 * GetOverdueWorklist   Status NOT IN ('Draft','Quoted','Voided') AND DueDate < asOf AND Balance > 0
 * InvoiceDisplay       Kind === 'Invoice' && AmountDue > 0 && DaysUntilDue < 0
 * the browser          Balance > 0 && DueDate < today
 * ```
 *
 * Three statements of one rule, and they do not agree. Only the first excludes a **voided** order —
 * so a voided order with a past due date and a stale balance reads as overdue on two of the three
 * surfaces. Nothing errors; a customer simply appears on a collections list for money they do not
 * owe. This is the same multiple-surfaces-disagreeing problem D83 solved for `DueDate`, one layer up.
 *
 * ## Why a function and a SQL fragment from the same module
 *
 * The layered base view has to express this rule in T-SQL, and `GetOverdueWorklist` has to express it
 * as a `RunView` filter. Those are two languages, so they cannot literally share code — but they can
 * share a **module**, so a change lands in one file and a reviewer sees both halves in one diff. That
 * is the honest limit of the guarantee: this does not make drift impossible, it makes drift visible.
 *
 * `overdue.test.ts` asserts the two agree on the same rows, which is the part that can be mechanised.
 *
 * ## It compares days; it does not parse them
 *
 * `DueDateISO` is already a `YYYY-MM-DD` calendar day. Reading a date cell — which may be a `Date` or
 * a string depending on how the row was fetched — is a separate concern with its own module, and
 * doing it here would make this the SECOND place in the repo that interprets a date. Callers
 * normalize on the way in.
 *
 * @module @mj-biz-apps/orders-entities
 */
/**
 * Statuses that owe nothing, and therefore can never be overdue.
 *
 * `Draft` and `Quoted` owe nothing **yet**; `Voided` owes nothing **ever**. Leaving `Voided` out is
 * the whole reason this list is shared rather than retyped — it is the clause every hand-rolled copy
 * forgot.
 */
export const NON_OWING_STATUSES = ['Draft', 'Quoted', 'Voided'] as const;

/** The fields the rule reads. Deliberately minimal — anything more invites a second definition. */
export interface OverdueFacts {
    Status?: string | null;
    Balance?: number | null;
    /** The due day as `YYYY-MM-DD`, already normalized. Null means no terms were ever set. */
    DueDateISO?: string | null;
}

/**
 * Whether an order is overdue as of a given day.
 *
 * @param order - The order, in any shape carrying the three fields.
 * @param asOfDay - The reference day as `YYYY-MM-DD`. Pass the operator's local day (`Today()`), not
 *   a UTC instant: an order due today is not overdue at 8pm in New York because London has ticked over.
 * @returns True only when money is genuinely owed and the date has passed.
 */
export function IsOverdue(order: OverdueFacts, asOfDay: string): boolean {
    if (order.Status != null && (NON_OWING_STATUSES as readonly string[]).includes(order.Status)) {
        return false;
    }
    if (!(Number(order.Balance ?? 0) > 0)) {
        return false;
    }
    // No due date is not overdue. An order with a balance and no terms is a question for someone,
    // but it is not a debt that has passed a date — there is no date.
    const due = order.DueDateISO;
    return due != null && due !== '' && due < asOfDay;
}

/**
 * The same rule as a T-SQL boolean expression, for the layered base view.
 *
 * @param alias - The table/view alias the columns hang off, e.g. `g` in `SELECT g.* FROM ... g`.
 */
export function OverdueSQL(alias: string): string {
    const quoted = NON_OWING_STATUSES.map((s) => `'${s}'`).join(',');
    return (
        `${alias}.Balance > 0 ` +
        `AND ${alias}.DueDate IS NOT NULL ` +
        `AND ${alias}.DueDate < CAST(GETUTCDATE() AS date) ` +
        `AND ${alias}.Status NOT IN (${quoted})`
    );
}

/**
 * The same rule as a `RunView` `ExtraFilter`, for callers that must filter in the database.
 *
 * Takes an explicit day rather than reading the clock, because a worklist is run "as of" a date the
 * caller chooses — a collections review on Monday morning is often run as of Friday.
 *
 * @param asOfDay - `YYYY-MM-DD`. Validate it before calling; it is interpolated into SQL.
 */
export function OverdueFilter(asOfDay: string): string {
    const quoted = NON_OWING_STATUSES.map((s) => `'${s}'`).join(',');
    return `Status NOT IN (${quoted}) AND DueDate IS NOT NULL AND DueDate < '${asOfDay}' AND Balance > 0`;
}
