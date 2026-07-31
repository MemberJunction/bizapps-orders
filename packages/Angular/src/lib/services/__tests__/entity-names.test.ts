/**
 * Every entity name the UI looks up must actually exist.
 *
 * WHY THIS IS WORTH A TEST. `MJO_ENTITIES` holds STRINGS resolved at runtime
 * against MJ's metadata. A wrong one compiles, type-checks, and throws nowhere
 * near where it was written: `RunView` rejects it inside the provider with
 * "Entity ... not found in metadata", the call returns no rows, and the screen
 * renders its empty state. An empty state is indistinguishable from a database
 * with no data, so the failure looks exactly like a quiet afternoon.
 *
 * That is not hypothetical — `Orders` and `Payments` sat here instead of `Order
 * Headers` and `Payment Headers` through every unit test and every mockup, and
 * were only caught by loading the app against a live database and noticing that
 * every dashboard tile read zero.
 *
 * The generated entity subclasses are the source of truth and are checked into
 * the repo, so this needs no database: CodeGen writes one
 * `@RegisterClass(BaseEntity, '<name>')` per entity.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { MJO_ENTITIES } from '../orders-data.service';

const generated = readFileSync(
    join(
        import.meta.dirname,
        '..', '..', '..', '..', '..',
        'Entities', 'src', 'generated', 'entity_subclasses.ts',
    ),
    'utf8',
);

/** Entity names CodeGen registered. */
const registered = new Set(
    [...generated.matchAll(/@RegisterClass\(BaseEntity, '([^']+)'\)/g)].map((m) => m[1]),
);

describe('MJO_ENTITIES', () => {
    it('reads the generated registrations at all', () => {
        // Guards the guard: an empty set would make every name below "missing",
        // or — if inverted — make the check vacuous.
        expect(registered.size).toBeGreaterThan(20);
    });

    it.each(Object.entries(MJO_ENTITIES))('%s -> %s is a real entity', (_key, name) => {
        expect(
            registered.has(name),
            `"${name}" is not a registered entity. RunView will return no rows and the ` +
                `screen will render an empty state that looks like real "no data".`,
        ).toBe(true);
    });

    it('uses the schema prefix consistently', () => {
        for (const name of Object.values(MJO_ENTITIES)) {
            expect(name.startsWith('MJ_BizApps_Orders: ')).toBe(true);
        }
    });
});
