/**
 * @fileoverview SQL-safety guards for filter text composed inside this package.
 *
 * WHY THIS FILE EXISTS HERE AS WELL AS IN `CoreEntitiesServer`. The repo rule
 * (CLAUDE.md, "SQL Safety") bans inline `.replace(/'/g, "''")` in `ExtraFilter`
 * construction and points at `packages/CoreEntitiesServer/src/sql-guards.ts` —
 * but `@mj-biz-apps/orders-core-entities-server` DEPENDS ON this package, so the
 * pricing engines here cannot import that module without a dependency cycle.
 * This is a deliberate mirror of the subset those engines need. Both copies are
 * temporary: they retire together once `@memberjunction/global` publishes
 * `EscapeSQLString`, at which point every call site re-points at the package.
 *
 * Keep the semantics identical to the `CoreEntitiesServer` copy — divergent
 * sanitization is exactly the failure mode this module exists to prevent.
 *
 * @module @mj-biz-apps/orders-entities
 */

const UUID = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

/** Raised when a value that must be an id cannot safely reach a filter. */
export class InvalidOperationInputError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'InvalidOperationInputError';
    }
}

/**
 * Require a UUID, or throw.
 *
 * Rejecting rather than escaping is deliberate: a non-UUID where a UUID belongs
 * is a bug, and a query that silently returns nothing (or the wrong rows) reads
 * as working software while being wrong.
 */
export function RequireUUID(value: string, field: string): string {
    if (typeof value !== 'string' || !UUID.test(value)) {
        throw new InvalidOperationInputError(`${field} must be a UUID.`);
    }
    return value;
}

/** Require every element of an id list to be a UUID. */
export function RequireUUIDs(values: string[] | null | undefined, field: string): string[] {
    if (!values?.length) return [];
    return values.map((v) => RequireUUID(v, field));
}

/**
 * Escape a free-text value for a SQL string literal.
 *
 * Doubles the quote (the SQL Server escape), maps `null`/`undefined` to an empty
 * string rather than the literal text `"null"`, and strips embedded null bytes —
 * SQL Server truncates at `\0`, so a value carrying one can end a quoted literal
 * early and leave the remainder of the input parsed as SQL.
 */
export function EscapeSQLString(value: string | null | undefined): string {
    if (value === null || value === undefined) {
        return '';
    }
    return String(value).replace(/\0/g, '').replace(/'/g, "''");
}
