/**
 * @fileoverview Reading a date cell that may be a string or a `Date`, and getting the same day back.
 *
 * ## Why this is here rather than in the server package
 *
 * `ToISODate` was written in `InvoiceBuilder.ts`, got the reasoning right, and stayed there — where
 * only the server can reach it. Meanwhile fifteen other call sites, most of them in Angular pages,
 * went on doing `String(cell).slice(0, 10)` by hand. Moving it into the shared package is the whole
 * point: one statement of the rule, on both sides of the wire.
 *
 * ## The shape of the bug it prevents
 *
 * A date arrives in more than one shape depending on how it was fetched:
 *
 * ```text
 * RunView 'entity_object'   →  Date          (BaseEntity coerces on Get)
 * RunView 'simple'          →  a string historically; a Date once MJ normalizes simple rows
 * a GraphQL payload         →  string
 * ```
 *
 * `String(cell).slice(0, 10)` is exactly right on a string. On a `Date` it yields **`'Thu Jul 30'`**,
 * because `String(date)` is the long human form, not ISO. That value then goes on to be:
 *
 * ```text
 * printed        →  an invoice dated 'Thu Jul 30', with no year on it
 * compared       →  'Thu Jul 30' < '2026-07-31' is FALSE for every row, forever, because letters
 *                   sort after digits — so an overdue count reads zero and the screen looks calm
 * re-parsed      →  new Date('Thu Jul 30') is Invalid Date
 * ```
 *
 * The middle one is the dangerous one, and it is dangerous precisely because nothing fails.
 *
 * @module @mj-biz-apps/orders-entities
 */

import { BusinessTimeZoneEngine, CalendarDayIn, FromCalendarDay } from '@mj-biz-apps/common-entities';

/**
 * A date as it may actually arrive: an ISO-ish string, a `Date`, or absent.
 *
 * Deliberately NOT widened to include epoch milliseconds. `ToISODate` copes with a number at
 * runtime, but no transport in this app delivers one, and advertising it in the type forces every
 * consumer — `FormatDate`, `DaysSince` — to widen for a case that never arrives.
 *
 * Prefer this over `string` on any interface describing a row cell. A field typed `string` that
 * holds a `Date` at runtime is worse than an honest union — the compiler cheerfully certifies the
 * string operations that are about to go wrong.
 *
 * The readers below take `unknown` rather than this type, deliberately: normalizing the boundary is
 * their entire job, and a reader that demanded a pre-narrowed input would push callers back to the
 * casts it exists to remove. `DateCell` is for DECLARING a field; the readers accept whatever came.
 */
export type DateCell = string | Date | null | undefined;

/**
 * A calendar date as `YYYY-MM-DD`, whatever the data layer handed over, or `null`.
 *
 * The **UTC** components of a `Date` are read rather than the local ones, because a SQL `date`
 * column has no time and the driver materialises it at midnight UTC — `getDate()` on a machine west
 * of Greenwich returns the day before, which files an order in the wrong period while every total
 * still reconciles.
 *
 * Note this is the opposite choice from formatting a date the USER just picked, which is a local
 * midnight and must be read with local parts. The difference is where the `Date` came from, not
 * preference: {@link Today} reads the business zone for exactly that reason.
 *
 * An unparseable value is `null` rather than `'Invalid Date'` — which would print literally and
 * destroy the evidence of what the database actually held.
 */
export function ToISODate(value: unknown): string | null {
    if (value == null || value === '') return null;

    if (value instanceof Date) {
        if (Number.isNaN(value.getTime())) return null;
        return utcDay(value);
    }

    if (typeof value === 'number') {
        if (!Number.isFinite(value)) return null;
        const fromEpoch = new Date(value);
        return Number.isNaN(fromEpoch.getTime()) ? null : utcDay(fromEpoch);
    }

    const text = String(value);
    // The common case, needing no interpretation: '2026-07-30T00:00:00.000Z' and '2026-07-30' both
    // yield '2026-07-30', with no timezone reasoning available to get wrong.
    if (/^\d{4}-\d{2}-\d{2}/.test(text)) return text.slice(0, 10);

    // Anything else — '7/30/2026', a driver's own format, or a value some earlier String(date)
    // already mangled — goes to the platform parser.
    const parsed = new Date(text);
    return Number.isNaN(parsed.getTime()) ? null : utcDay(parsed);
}

/**
 * The four-digit year of a date cell, or `null`.
 *
 * Its own function because `ToISODate(x)?.slice(0, 4)` is the same lurking `String(...).slice()`
 * shape one call deeper: it happens to be correct, and it reads exactly like the thing that was not.
 */
export function ISOYear(value: unknown): string | null {
    return ToISODate(value)?.slice(0, 4) ?? null;
}

/**
 * True when the cell names a day strictly before `day`.
 *
 * The overdue test, spelled once. Safe because fixed-width ISO days sort lexically in the same order
 * they sort chronologically — the property the raw string comparisons were relying on, and the one
 * the long `Date` form silently breaks.
 *
 * A cell with no readable date is **not** overdue: absence is not evidence of lateness, and treating
 * it as such dunning-notices a customer over missing data.
 *
 * @param day - The reference day as `YYYY-MM-DD`, normally {@link Today}.
 */
export function IsBefore(value: unknown, day: string): boolean {
    const iso = ToISODate(value);
    return iso !== null && iso < day;
}

/**
 * Today on the BUSINESS calendar as `YYYY-MM-DD`.
 *
 * Not the UTC day (`toISOString().slice(0, 10)` is already tomorrow for the whole American evening)
 * and not the browser's local day (the operator may sit in Pune while the business books in Chicago).
 * The zone comes from `BusinessTimeZoneEngine`; before it loads, or where the instance has not set
 * it, this is the UTC day.
 */
export function Today(): string {
    return BusinessTimeZoneEngine.Instance.Today();
}

/**
 * The BUSINESS calendar day of an instant the code constructed itself, as `YYYY-MM-DD`.
 *
 * For bucketing by day: a loop that walks back seven days from `new Date()` carries the current
 * time of day with it, so `toISOString().slice(0, 10)` names TOMORROW for the evening. Use this
 * for instants the program built; use {@link ToISODate} for cells that came from the database.
 */
export function LocalDay(date: Date): string {
    if (Number.isNaN(date.getTime())) return '';
    return CalendarDayIn(date, BusinessTimeZoneEngine.Instance.Zone);
}

/**
 * Today's BUSINESS calendar day as a `Date` safe to ASSIGN to a `date`-typed entity field: the day,
 * pinned to midnight UTC, which every UTC-parts reader then gives back unchanged.
 */
export function TodayAsDateValue(): Date {
    return FromCalendarDay(Today());
}

/**
 * The calendar day a cell NAMES, as a `Date` safe to assign to a `date`-typed field — or `null`
 * when it names none.
 *
 * The counterpart to {@link TodayAsDateValue} for a day that came from somewhere: a form field, a
 * remote operation's input, a row already in hand. `new Date(cell)` is nearly right and quietly
 * wrong at the edges — on `'2026-08-27'` it gives midnight UTC, which is correct, but on a full
 * instant (`'2026-08-27T21:00:00-05:00'`) it keeps the time, and a `date` column then truncates
 * that in UTC and files the row on the 28th. Reading the day first and re-pinning it to midnight
 * makes both inputs behave the same.
 *
 * Returns `null` rather than today for an absent or unreadable cell, so the caller decides what
 * absence means — usually `?? TodayAsDateValue()`, occasionally a refusal.
 */
export function AsDateValue(value: unknown): Date | null {
    const day = ToISODate(value);
    return day === null ? null : FromCalendarDay(day);
}

/** The UTC calendar fields, zero-padded. */
function utcDay(date: Date): string {
    return `${String(date.getUTCFullYear()).padStart(4, '0')}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
}
