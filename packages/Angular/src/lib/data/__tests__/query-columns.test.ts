/**
 * Every column the data service sorts or filters on must exist.
 *
 * WHY THIS IS ITS OWN GUARD. `OrderBy` and `ExtraFilter` are SQL fragments built
 * from strings. Naming a column that does not exist does not degrade gracefully —
 * SQL Server rejects the WHOLE statement, so the query returns nothing and the
 * screen renders its empty state. "No promotions" is what a healthy but empty
 * catalog looks like, so the failure reads as data rather than as a bug.
 *
 * That is not hypothetical: `GetPromotions` sorted by `StartDate`, which is not a
 * column on that entity (the window is `EffectiveFrom`/`EffectiveTo`). The
 * promotions screen was blank for the entire build and nothing flagged it — not
 * the type checker, not a unit test, not a mockup.
 *
 * The generated entity subclasses are checked in and are the source of truth, so
 * this needs no database.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { MJO_ENTITIES } from '../entity-names';

const here = import.meta.dirname;
const generated = readFileSync(
    join(here, '..', '..', '..', '..', '..', 'Entities', 'src', 'generated', 'entity_subclasses.ts'),
    'utf8',
);
const queries = readFileSync(join(here, '..', 'orders-queries.ts'), 'utf8');

/** Columns CodeGen emitted for an entity, read from its generated subclass. */
function columnsOf(entityName: string): Set<string> {
    const start = generated.indexOf(`@RegisterClass(BaseEntity, '${entityName}')`);
    if (start === -1) return new Set();
    const next = generated.indexOf('@RegisterClass(BaseEntity,', start + 1);
    const block = generated.slice(start, next === -1 ? undefined : next);
    return new Set([...block.matchAll(/get ([A-Za-z_][A-Za-z0-9_]*)\(\)/g)].map((m) => m[1]));
}

/** SQL words that are not column references. */
const KEYWORDS = new Set([
    'DESC', 'ASC', 'AND', 'OR', 'NOT', 'IN', 'IS', 'NULL', 'LIKE', 'BETWEEN',
]);

describe('orders-queries order-by columns', () => {
    it('resolves entity columns at all', () => {
        // Guards the guard — an empty set would make every check below vacuous.
        expect(columnsOf(MJO_ENTITIES.OrderHeader).size).toBeGreaterThan(10);
        expect(columnsOf(MJO_ENTITIES.Promotion).size).toBeGreaterThan(5);
    });

    // Each `run(MJO_ENTITIES.X, filters, 'orderBy', …)` call site in orders-queries.ts.
    const calls = [
        ...queries.matchAll(/MJO_ENTITIES\.(\w+),\s*(\[[\s\S]*?\]|filters),[\s\S]{0,400}?'([A-Za-z_][^']*)'/g),
    ].map((m) => ({ key: m[1], orderBy: m[3] }));

    it('finds the query call sites', () => {
        expect(calls.length).toBeGreaterThan(3);
    });

    it.each(calls)('$key sorts by a real column ($orderBy)', ({ key, orderBy }) => {
        const entity = (MJO_ENTITIES as Record<string, string>)[key];
        const cols = columnsOf(entity);
        if (!cols.size) return; // entity-names.test.ts owns that failure

        const referenced = orderBy
            .split(/[\s,]+/)
            .filter((t) => /^[A-Za-z_][A-Za-z0-9_]*$/.test(t) && !KEYWORDS.has(t.toUpperCase()));

        const missing = referenced.filter((c) => !cols.has(c));
        expect(
            missing,
            `${key} sorts by ${missing.join(', ')}, which ${entity} does not have. ` +
                `SQL Server rejects the whole query, so the screen shows an empty ` +
                `state that looks like "no data".`,
        ).toEqual([]);
    });
});
