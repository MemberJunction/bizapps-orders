import { BaseEntity } from '@memberjunction/core';

/**
 * True when any of the named fields has unsaved changes.
 *
 * `BaseEntity` exposes dirtiness per field (`GetFieldByName(name).Dirty`) and for the record as a
 * whole (`entity.Dirty`), but nothing that asks the question across a named subset — which is what
 * the money-field guards need: "did anything that affects price change on this save?".
 *
 * An unknown field name yields false rather than throwing. The callers pass field-name constants
 * (`ORDER_LINE_MONEY_FIELDS`, `ORDER_HEADER_MONEY_FIELDS`), so a name that no longer exists means
 * the column was renamed or dropped — in which case it cannot have been edited on this save, and
 * treating it as "not dirty" is both true and the safe direction: the caller does less, rather
 * than wrongly asserting a change.
 */
export function anyFieldIsDirty(entity: BaseEntity, fieldNames: readonly string[]): boolean {
    return fieldNames.some((name) => entity.GetFieldByName(name)?.Dirty === true);
}
