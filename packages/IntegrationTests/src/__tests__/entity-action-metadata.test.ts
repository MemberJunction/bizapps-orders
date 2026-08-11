/**
 * Referential guards for `metadata/entity-actions/`.
 *
 * An Entity Action binding is four cross-references held together by strings: an entity, an action,
 * an invocation type, and — for every param — an `ActionParam` belonging to that same action. Every
 * one of them is a `@lookup:` resolved at push time, and a lookup that finds nothing is the failure
 * shape this repo keeps meeting: the file reads as configured, the push reports success or fails far
 * from the cause, and the binding does nothing.
 *
 * These tests are cheap and read the same JSON `mj sync push` reads. They cannot prove a lookup
 * resolves against a live database — nothing here talks to one — but they catch the half that is
 * knowable from the repo: a param that names an action other than the one being bound, an invocation
 * type outside MJ's vocabulary, an action this app does not define.
 *
 * The vocabulary below is not a guess. `GenericDatabaseProvider.HandleEntityActions` builds the
 * invocation name as `'Validate'`, or `'Before'|'After'` + `'Create'|'Update'|'Delete'`, and matches
 * it with `InvocationTypes.find(i => i.Name === invocationType)` — exact, unspaced.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, '../../../..');

/** Exactly the names `HandleEntityActions` can construct. Anything else never fires. */
const INVOCATION_TYPES = [
    'Validate',
    'BeforeCreate',
    'BeforeUpdate',
    'BeforeDelete',
    'AfterCreate',
    'AfterUpdate',
    'AfterDelete',
] as const;

/** `EntityActionParam.ValueType`, from MJ's schema union. */
const VALUE_TYPES = ['Entity Field', 'Entity Object', 'Entity Object Data', 'Script', 'Static'] as const;

const STATUSES = ['Active', 'Disabled', 'Pending'] as const;

interface MetadataRecord {
    fields: Record<string, unknown>;
    relatedEntities?: Record<string, MetadataRecord[]>;
}

function readJSON<T>(relativePath: string): T {
    return JSON.parse(readFileSync(resolve(REPO_ROOT, relativePath), 'utf8')) as T;
}

const bindings = readJSON<MetadataRecord[]>('metadata/entity-actions/.orders-entity-actions.json');
const actions = readJSON<MetadataRecord[]>('metadata/actions/.orders-actions.json');

/** The action names this app defines, which is what an `@lookup:MJ: Actions.Name=` can resolve to. */
const actionNames = new Set(actions.map((a) => String(a.fields.Name)));

/** Every param name each action declares, so a binding cannot pass one the action never accepts. */
const paramsByAction = new Map<string, Set<string>>(
    actions.map((a) => [
        String(a.fields.Name),
        new Set((a.relatedEntities?.['MJ: Action Params'] ?? []).map((p) => String(p.fields.Name))),
    ]),
);

/** The value of a `@lookup:<Entity>.<Field>=<value>` reference, or null when it is not one. */
function lookupValue(raw: unknown): string | null {
    const text = String(raw ?? '');
    if (!text.startsWith('@lookup:')) return null;
    const eq = text.indexOf('=');
    return eq === -1 ? null : text.slice(eq + 1);
}

describe('entity-action metadata', () => {
    it('declares at least one binding, and every binding names an entity and an action', () => {
        expect(bindings.length).toBeGreaterThan(0);
        for (const b of bindings) {
            expect(String(b.fields.EntityID)).toMatch(/^@lookup:MJ: Entities\.Name=/);
            expect(String(b.fields.ActionID)).toMatch(/^@lookup:MJ: Actions\.Name=/);
        }
    });

    it('binds only to actions THIS APP defines', () => {
        // A binding to an action that does not exist pushes without complaint and never runs.
        for (const b of bindings) {
            const name = lookupValue(b.fields.ActionID);
            expect(name, 'ActionID must be a resolvable @lookup').not.toBeNull();
            expect(actionNames, `no such action: ${name}`).toContain(name as string);
        }
    });

    it('uses only invocation names the provider can construct', () => {
        for (const b of bindings) {
            const invocations = b.relatedEntities?.['MJ: Entity Action Invocations'] ?? [];
            expect(invocations.length, 'a binding with no invocation never fires').toBeGreaterThan(0);
            for (const i of invocations) {
                const name = lookupValue(i.fields.InvocationTypeID);
                expect(INVOCATION_TYPES, `not an invocation type: ${name}`).toContain(name as never);
            }
        }
    });

    it('passes only params the bound action actually declares', () => {
        // THE ONE MOST WORTH HAVING. `ActionParamID` is looked up by param name AND action, so a
        // param copied from a different action resolves to nothing and the action runs missing a
        // required input — for `Send Document` that is `OrderID`, without which it cannot know what
        // to send.
        for (const b of bindings) {
            const actionName = lookupValue(b.fields.ActionID);
            const declared = paramsByAction.get(actionName ?? '') ?? new Set<string>();
            for (const p of b.relatedEntities?.['MJ: Entity Action Params'] ?? []) {
                const raw = String(p.fields.ActionParamID);
                const paramName = raw.replace(/^@lookup:MJ: Action Params\.Name=/, '').split('&')[0];
                expect(declared, `'${actionName}' declares no param '${paramName}'`).toContain(paramName);

                // The param lookup must ALSO pin the action. Param names repeat across actions —
                // 'CompanyID' appears on three of ours — so an unpinned lookup is ambiguous.
                expect(raw, `param lookup for '${paramName}' must pin its ActionID`).toContain('&ActionID=');
            }
        }
    });

    it('uses valid ValueTypes, and never passes a live entity where data is meant', () => {
        for (const b of bindings) {
            for (const p of b.relatedEntities?.['MJ: Entity Action Params'] ?? []) {
                expect(VALUE_TYPES).toContain(String(p.fields.ValueType) as never);
                // 'Entity Object' serializes to {} because BaseEntity's fields are getters. Anything
                // that crosses a wire wants 'Entity Object Data' or a plain field.
                expect(String(p.fields.ValueType)).not.toBe('Entity Object');
            }
        }
    });

    it('uses valid statuses everywhere a status appears', () => {
        const check = (r: MetadataRecord) => {
            if (r.fields.Status !== undefined) expect(STATUSES).toContain(String(r.fields.Status) as never);
            for (const children of Object.values(r.relatedEntities ?? {})) children.forEach(check);
        };
        bindings.forEach(check);
    });

    it('ships every AfterUpdate binding with a transition filter', () => {
        // Without one, AfterUpdate fires on EVERY save of the record. An order is saved repeatedly
        // after confirmation — posting stamps JournalEntryID, payments move Balance — so an
        // unfiltered send mails the customer their invoice again each time.
        for (const b of bindings) {
            const fires = (b.relatedEntities?.['MJ: Entity Action Invocations'] ?? []).map((i) =>
                lookupValue(i.fields.InvocationTypeID),
            );
            if (!fires.includes('AfterUpdate')) continue;
            const filters = b.relatedEntities?.['MJ: Entity Action Filters'] ?? [];
            expect(filters.length, 'an unfiltered AfterUpdate binding re-fires on every save').toBeGreaterThan(0);
        }
    });

    it('is shipped inert — nothing fires until an operator scopes and enables it', () => {
        // The engine runs Active bindings only. Whether a company mails invoices automatically is an
        // operator's decision, and ScopeRecordID names a Company row whose id differs per
        // environment — so an Active, unscoped binding pushed to production would mail every
        // customer of every company at once.
        for (const b of bindings) {
            expect(b.fields.Status, 'ship bindings Pending, not Active').not.toBe('Active');
        }
    });
});
