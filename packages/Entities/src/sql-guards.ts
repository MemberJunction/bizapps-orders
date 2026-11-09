/**
 * @fileoverview UUID guards for values that reach SQL filter text.
 *
 * These live here rather than in `CoreEntitiesServer/src/sql-guards.ts` because the pricing
 * engines in this package compose filters too, and this package runs on both tiers. The server
 * package depends on this one, so it re-exports these: one copy, importable from either side.
 *
 * Rejecting rather than escaping is deliberate: a non-UUID where a UUID belongs is a bug, and a
 * query that silently returns nothing (or the wrong rows) reads as working software while being
 * wrong. Free-text values go through `EscapeSQLString` from `@memberjunction/global` instead.
 *
 * @module @mj-biz-apps/orders-entities
 */

const UUID = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

/** Raised when caller-supplied input cannot safely reach a filter. */
export class InvalidOperationInputError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'InvalidOperationInputError';
    }
}

/** Whether `value` is a UUID — for input that may legitimately not be one, where `RequireUUID` would throw. */
export function IsUUID(value: unknown): value is string {
    return typeof value === 'string' && UUID.test(value);
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
        throw new InvalidOperationInputError(`${field} must be a valid ID (a UUID).`);
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
