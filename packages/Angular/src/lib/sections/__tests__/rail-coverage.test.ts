/**
 * Drift guard: every rail item must open a real page.
 *
 * WHY THIS IS A SOURCE-LEVEL TEST. The rail is data (`section-nav.model.ts`) and
 * the resolver is a `switch` inside an Angular component. Nothing makes the two
 * agree — a page id can be renamed in one and not the other, and the only symptom
 * is a rail item that silently renders "not built yet" for a page that exists.
 * That is a bug nobody reports, because it looks exactly like work in progress.
 *
 * This caught a real one: the receivables rail declared `subscriptions` while the
 * resolver matched `subs`.
 *
 * Reading the source rather than importing the component is deliberate — importing
 * it drags Angular's runtime into a plain node test for no benefit, and the thing
 * being checked is textual agreement between two files.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const here = import.meta.dirname;
const navSource = readFileSync(join(here, '..', 'section-nav.model.ts'), 'utf8');
const sectionSource = readFileSync(join(here, '..', 'orders-sections.component.ts'), 'utf8');

/** Page ids declared in the rails. */
const railIds = [...navSource.matchAll(/Id: '([a-z-]+)'/g)].map((m) => m[1]);

/** Page ids the resolver handles. */
const resolvedIds = new Set([...sectionSource.matchAll(/case '([a-z-]+)':/g)].map((m) => m[1]));

describe('rail coverage', () => {
    it('declares rail items at all', () => {
        // Guards the guard: a regex that silently matches nothing would make every
        // assertion below vacuously true.
        expect(railIds.length).toBeGreaterThan(10);
    });

    it('resolves a page for every rail item', () => {
        const missing = railIds.filter((id) => !resolvedIds.has(id));
        expect(missing, `rail items with no resolver: ${missing.join(', ')}`).toEqual([]);
    });

    it('has no resolver case for a page no rail offers', () => {
        // The reverse drift: a resolver arm for an id that was renamed or removed
        // is dead code that looks like coverage.
        const orphans = [...resolvedIds].filter((id) => !railIds.includes(id));
        expect(orphans, `resolver arms no rail reaches: ${orphans.join(', ')}`).toEqual([]);
    });

    it('gives every rail item a unique id within its own rail', () => {
        // Ids only need to be unique per rail — 'dashboard' and 'list' legitimately
        // appear in several — so uniqueness is checked per declared array.
        const arrays = [...navSource.matchAll(/const (\w+_SUB_PAGES)[^=]*=\s*\[([\s\S]*?)\n\];/g)];
        expect(arrays.length).toBe(4);
        for (const [, name, body] of arrays) {
            const ids = [...body.matchAll(/Id: '([a-z-]+)'/g)].map((m) => m[1]);
            expect(new Set(ids).size, `${name} has duplicate ids`).toBe(ids.length);
        }
    });
});
