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
 * ## Which day is "due" — the next unpaid instalment's (AIDP-24)
 *
 * An order billed in instalments is overdue when ANY unpaid instalment is past due, which is the same
 * as saying its EARLIEST unpaid instalment is. So the day this rule reads is the order's
 * `NextDueDate` — a virtual column of `vwOrderHeaders` that is the earliest due date among live,
 * unpaid schedule rows, or the header's own `DueDate` when the order has no schedule. That fallback
 * is what keeps an order without a schedule reading exactly as it always has: for it, `NextDueDate`
 * IS `DueDate`. Nothing here asks whether a schedule exists.
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
    /**
     * The NEXT UNPAID due day as `YYYY-MM-DD`, already normalized — the entity's `NextDueDate`, which
     * is the header's `DueDate` for an order without a schedule. Null means no terms were ever set.
     */
    DueDateISO?: string | null;
}

/**
 * Whether an order is overdue as of a given day.
 *
 * @param order - The order, in any shape carrying the three fields.
 * @param asOfDay - The reference day as `YYYY-MM-DD`. Pass the business day (`Today()`), not a UTC
 *   instant and not the viewer's local day: an order due today is not overdue at 8pm UTC just because
 *   the calendar has already turned over in UTC, or in whichever zone the browser happens to be in —
 *   only the configured business time zone's calendar decides when "today" ends.
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
 * How many whole days an order is past due as of a given day — 0 when it is not overdue at all.
 *
 * Built on {@link IsOverdue} rather than beside it, so "3 days past due" can never be reported for
 * an order the rule says is not overdue (a voided one, or one whose balance has cleared).
 *
 * @param order - The order, with `DueDateISO` already normalized to `YYYY-MM-DD`.
 * @param asOfDay - The business day as `YYYY-MM-DD`.
 */
export function DaysOverdue(order: OverdueFacts, asOfDay: string): number {
    if (!IsOverdue(order, asOfDay)) return 0;
    const day = (iso: string): number => {
        const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
        return Date.UTC(y, (m ?? 1) - 1, d ?? 1);
    };
    return Math.round((day(asOfDay) - day(order.DueDateISO as string)) / 86_400_000);
}

/**
 * The same rule as a T-SQL boolean expression, for the layered base view.
 *
 * "Today" is `bt.Today` from `[__mj_BizAppsCommon].[fnBusinessToday]()`, which the view CROSS JOINs
 * once ({@link OverdueViewSQL}): the calendar day it is in the business time zone, not the UTC day
 * `GETUTCDATE()` gives, which is already tomorrow for the whole American evening.
 *
 * @param alias - The table/view alias the columns hang off, e.g. `g` in `SELECT g.* FROM ... g`.
 * @param dueDateExpression - The SQL expression for the day that is due. The view passes
 *   `nd.NextDueDate` (its CROSS APPLY over the schedule rows); the default is the header's own column.
 * @param todayExpression - The SQL expression for the business day; the default is the joined function.
 */
export function OverdueSQL(alias: string, dueDateExpression: string = `${alias}.DueDate`, todayExpression: string = 'bt.Today'): string {
    const quoted = NON_OWING_STATUSES.map((s) => `'${s}'`).join(',');
    return (
        `${alias}.Balance > 0 ` +
        `AND ${dueDateExpression} IS NOT NULL ` +
        `AND ${dueDateExpression} < ${todayExpression} ` +
        `AND ${alias}.Status NOT IN (${quoted})`
    );
}

/**
 * The whole outer view, ready to paste into a migration. The migration is a COPY of this text and
 * `overdue.test.ts` asserts the newest one still matches, so the predicate cannot be retyped by hand.
 *
 * Two joins, one per rule: `nd` (CROSS APPLY) is the next unpaid instalment's due date, falling back
 * to the header's own (AIDP-24); `bt` (CROSS JOIN) is the business day from bizapps-common's
 * `fnBusinessToday()` (#168). An order without a schedule reads exactly as it always did.
 */
export function OverdueViewSQL(): string {
    return (
        'CREATE OR ALTER VIEW [${flyway:defaultSchema}].[vwOrderHeaders]\n' +
        'AS\n' +
        'SELECT\n' +
        '    g.*,\n' +
        '    nd.NextDueDate,\n' +
        `    CASE WHEN ${OverdueSQL('g', 'nd.NextDueDate')}\n` +
        '         THEN 1 ELSE 0 END AS IsOverdue\n' +
        'FROM [${flyway:defaultSchema}].[vwOrderHeadersGenerated] g\n' +
        'CROSS APPLY (\n' +
        '    SELECT COALESCE(\n' +
        '        (SELECT MIN(s.DueDate)\n' +
        '           FROM [${flyway:defaultSchema}].[OrderHeaderPaymentSchedule] s\n' +
        '          WHERE s.OrderHeaderID = g.ID\n' +
        "            AND s.Status IN ('Scheduled','Invoiced')\n" +
        '            AND s.Balance > 0),\n' +
        '        g.DueDate) AS NextDueDate\n' +
        ') nd\n' +
        'CROSS JOIN [__mj_BizAppsCommon].[fnBusinessToday]() AS bt;'
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
    return `Status NOT IN (${quoted}) AND NextDueDate IS NOT NULL AND NextDueDate < '${asOfDay}' AND Balance > 0`;
}
