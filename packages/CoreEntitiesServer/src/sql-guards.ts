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

const UUID = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

/** Raised when caller-supplied input cannot safely reach a filter. */
export class InvalidOperationInputError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'InvalidOperationInputError';
    }
}

/**
 * Require a UUID, or throw.
 *
 * @param value The caller-supplied value.
 * @param field Field name, used in the error so the caller can find their mistake.
 * @returns The value, unchanged, once it is known to be a UUID.
 * @throws {InvalidOperationInputError} If it is not a UUID.
 */
export function RequireUUID(value: string, field: string): string {
    if (typeof value !== 'string' || !UUID.test(value)) {
        throw new InvalidOperationInputError(`${field} must be a UUID.`);
    }
    return value;
}

/**
 * Require a UUID when present. Absent stays absent — many id inputs are optional
 * filters, and an omitted filter is not an invalid one.
 */
export function RequireOptionalUUID<T extends string | null | undefined>(value: T, field: string): T {
    if (value === undefined || value === null || value === '') return value;
    RequireUUID(value as string, field);
    return value;
}

/** Require every element of an id list to be a UUID. */
export function RequireUUIDs(values: string[] | null | undefined, field: string): string[] {
    if (!values?.length) return [];
    return values.map((v) => RequireUUID(v, field));
}

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
    return whole.slice(0, 10);
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
