/**
 * @fileoverview Validation for values that reach SQL text — applied at the
 * operation boundary.
 *
 * THE PROBLEM. `RunView`'s `ExtraFilter` is composed as SQL, and this codebase
 * builds filters by interpolating ids into template strings. That is safe for the
 * overwhelming majority of sites, where the id was read out of the database a
 * moment earlier and is a UUID by construction. It is NOT safe for the handful of
 * values that arrive from a REMOTE CALLER: a remote operation's input is whatever
 * the caller sent.
 *
 * WHY GUARD AT THE BOUNDARY RATHER THAN AT EVERY FILTER. An id from a caller is
 * passed down through loaders and resolvers before it reaches a filter, sometimes
 * several frames deep. Guarding each filter site would mean auditing every path a
 * value can take and re-auditing it whenever someone adds a new one. Validating
 * once, where untrusted data enters, makes everything downstream trusted by
 * construction — and it is a single line per operation that a reviewer can check.
 *
 * WHY REJECT RATHER THAN ESCAPE. Doubling quotes would let a malformed id through
 * to a query that then returns nothing, or worse, something. A caller that sends a
 * non-UUID where a UUID belongs has a bug, and the useful response is to say so.
 * Silently returning the wrong rows is the failure mode worth designing against:
 * an injected `' OR 1=1 --` in a customer filter widens a result set rather than
 * breaking it, so it reads as working software while disclosing other people's data.
 *
 * @module @mj-biz-apps/orders-core-entities-server
 */

import { InvalidOperationInputError } from '@mj-biz-apps/orders-entities';

// The UUID guards live in `orders-entities` so its pricing engines can use them without a
// dependency cycle; they are re-exported here so server code keeps one import site.
export { InvalidOperationInputError, RequireOptionalUUID, RequireUUID, RequireUUIDs } from '@mj-biz-apps/orders-entities';

// MJ publishes `EscapeSQLString` from 6.1.5, the floor this repo requires. Re-exported so
// existing server imports keep working.
export { EscapeSQLString } from '@memberjunction/global';

/**
 * Require an ISO date, returning just the `YYYY-MM-DD` portion.
 *
 * Dates are interpolated into comparisons, so they carry the same risk as ids.
 * Truncating to the date part is deliberate: these filters compare days.
 */
export function RequireDate(value: string, field: string): string {
    // Validate the WHOLE string before truncating. Truncating first would accept
    // `2026-03-04' OR '1'='1` by silently discarding the payload — safe by
    // accident, and exactly the sanitise-don't-reject behaviour this module
    // argues against: the caller never learns their input was wrong.
    const whole = String(value);
    const isDateOnly = /^\d{4}-\d{2}-\d{2}$/.test(whole);
    const isDateTime = /^\d{4}-\d{2}-\d{2}[T ][\d:.]+(Z|[+-]\d{2}:?\d{2})?$/.test(whole);
    if ((!isDateOnly && !isDateTime) || Number.isNaN(Date.parse(whole))) {
        throw new InvalidOperationInputError(`${field} must be an ISO date (YYYY-MM-DD).`);
    }
    // `Date.parse` is not enough: it ROLLS OVER, so `2026-02-30` parses happily as 2 March and
    // `2026-06-31` as 1 July. A day that does not exist is a typo in the caller's input, and
    // silently moving it is the worst of the three options — the caller is never told, and the
    // row is filed on a day they did not name. Round-tripping the day part catches exactly that.
    const day = whole.slice(0, 10);
    const roundTrip = new Date(`${day}T00:00:00.000Z`);
    if (Number.isNaN(roundTrip.getTime()) || roundTrip.toISOString().slice(0, 10) !== day) {
        throw new InvalidOperationInputError(`${field} is not a real calendar day: ${day}.`);
    }
    return day;
}

/**
 * Require a caller-supplied day in either form an operation input accepts, or throw.
 *
 * Operations type a caller's day as `Date | string`, and `CalendarDayOrToday` cannot refuse: an
 * unreadable value simply becomes today. So both forms are refused here, at the boundary. A string
 * goes through `RequireDate`. A `Date` has no text to check — `String(date)` is the long human
 * form, which no ISO pattern matches — so it is refused only when it names no instant at all
 * (`new Date('garbage')`). Checking one form and passing the other through is how the two drift.
 *
 * @param value The caller-supplied day, or nothing.
 * @param field Field name, used in the error so the caller can find their mistake.
 * @returns `null` when no day was named, so the caller's fallback to today stays explicit;
 *   otherwise the validated day, as a `YYYY-MM-DD` string or the `Date` unchanged.
 * @throws {InvalidOperationInputError} If a day was named and is not a valid one.
 */
export function RequireOptionalDay(value: Date | string | null | undefined, field: string): Date | string | null {
    if (value === undefined || value === null || value === '') return null;
    if (value instanceof Date) {
        if (Number.isNaN(value.getTime())) {
            throw new InvalidOperationInputError(`${field} is not a valid date.`);
        }
        return value;
    }
    return RequireDate(value, field);
}

/**
 * Escape a free-text value for a SQL string literal.
 *
 * For the values that are legitimately text rather than ids — a provider's refund
 * reference, a search term. Doubling the quote is the SQL Server escape.
 */
export function EscapeText(value: string): string {
    return String(value).replace(/'/g, "''");
}
