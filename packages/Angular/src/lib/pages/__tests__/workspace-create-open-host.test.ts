/**
 * Every `mj-view-workspace` grid must hand New and row-open to something that acts on them.
 *
 * WHY THIS EXISTS. `mj-view-workspace` does not create or open records. Its New button raises
 * `CreateNewRecordRequested` and a row double-click raises `OpenRecordRequested`; routing either to
 * a form is the host page's job. A page that leaves one unbound shows a working New button that
 * does nothing: no form, no URL change, no console error. Pricing, Promotions and Charges & tax
 * shipped that way while Products, the one tab that bound both, worked.
 *
 * Source-level on purpose, like `manage-columns-host.test.ts`: mounting AG Grid to click New and
 * assert a subscription costs far more than reading the template. That the page's outputs reach the
 * section is `sections/__tests__/output-wiring.test.ts`'s job.
 */
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const PAGES = join(import.meta.dirname, '..');

/** Every `*.page.ts` under `pages/`, keyed `<folder>/<file>`. */
const sources = new Map<string, string>();
for (const dir of readdirSync(PAGES, { withFileTypes: true })) {
    if (!dir.isDirectory() || dir.name === '__tests__') continue;
    for (const file of readdirSync(join(PAGES, dir.name))) {
        if (file.endsWith('.page.ts')) sources.set(`${dir.name}/${file}`, readFileSync(join(PAGES, dir.name, file), 'utf8'));
    }
}

/** Each `<mj-view-workspace ...>` element in a page, as `{ page, index, markup }`. */
const workspaces = [...sources.entries()].flatMap(([page, source]) =>
    [...source.matchAll(/<mj-view-workspace\b[\s\S]*?<\/mj-view-workspace>/g)].map((m, index) => ({
        page,
        index,
        markup: m[0],
    })),
);

describe('every view-workspace grid routes New and row-open', () => {
    it('finds the grids', () => {
        // Guards the guard: an empty list makes every assertion below vacuous. Four catalog tabs,
        // the order and payment lists and dashboards, and subscriptions host one each at least.
        expect(workspaces.length).toBeGreaterThanOrEqual(10);
        expect(workspaces.some((w) => w.page.startsWith('catalog/'))).toBe(true);
    });

    it.each(workspaces.map((w) => [`${w.page} #${w.index + 1}`, w.markup]))('%s binds both events', (_label, markup) => {
        expect(
            markup.includes('(CreateNewRecordRequested)='),
            'This grid shows a New button that emits into nothing. Bind (CreateNewRecordRequested) ' +
                'and relay it, e.g. as RecordCreateRequested with the entity name, which the section routes.',
        ).toBe(true);
        expect(
            markup.includes('(OpenRecordRequested)='),
            'Double-clicking a row in this grid opens nothing. Bind (OpenRecordRequested) and relay it, ' +
                'e.g. as RecordOpenRequested built with ToRecordOpenRequest.',
        ).toBe(true);
    });
});
