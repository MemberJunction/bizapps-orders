import { CompositeKey, type EntityInfo } from '@memberjunction/core';

/**
 * What `mj-view-workspace` emits from `OpenRecordRequested` (a grid row double-click).
 *
 * The workspace declares this shape inline rather than exporting a named type, so it is restated
 * here; the compiler still checks every binding against it.
 */
export type WorkspaceOpenEvent = { entity: EntityInfo; record: Record<string, unknown> };

/**
 * A page asking the section to open one record of any entity.
 *
 * Pages are created through `createComponent` and stay router-free, so they cannot open a form
 * themselves. A page that hosts a grid for an entity it has no dedicated output for (`OrderOpened`,
 * `ProductOpened`, ...) emits this instead, and the section routes it by entity name. A new grid
 * of a new entity then needs no change in the section.
 */
export interface RecordOpenRequest {
    EntityName: string;
    Key: CompositeKey;
}

/**
 * Build an open request from the row the workspace handed back, keyed by the entity's own primary
 * key columns. Returns `null` for a row missing any key value: it is not openable, and routing a
 * half-built key would open an empty form that looks like a new record.
 */
export function ToRecordOpenRequest(event: WorkspaceOpenEvent): RecordOpenRequest | null {
    const key = CompositeKey.FromEntityRecord(event.entity, event.record);
    const complete = key.KeyValuePairs.length > 0 && key.KeyValuePairs.every((kv) => kv.Value != null && kv.Value !== '');
    return complete ? { EntityName: event.entity.Name, Key: key } : null;
}
