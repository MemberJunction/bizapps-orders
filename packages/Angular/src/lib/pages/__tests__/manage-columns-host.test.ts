/**
 * A grid's "Manage columns" kebab item is dead unless something above it opens the config panel.
 *
 * WHY THIS EXISTS. `mj-entity-data-grid` does not own a column-management UI. Its kebab item
 * raises `ManageColumnsRequested`, the grid renderer forwards it as `configureRequested`, and
 * `mj-entity-viewer` re-emits it as `ConfigureRequested` — and there the chain stops. A page that
 * drops `<mj-entity-viewer>` straight into its template subscribes to none of that, so the menu
 * item opens nothing and reports nothing. `mj-view-workspace` is the host that closes the chain:
 * it binds `(ConfigureRequested)` and owns `mj-view-config-panel`, where columns are actually
 * chosen.
 *
 * The failure mode is the reason this is a test rather than a comment. Nothing errors — no
 * console warning, no thrown exception, no compiler complaint. An `EventEmitter` with no
 * subscriber emits into nothing, exactly like the dead page outputs `output-wiring.test.ts`
 * guards. A user presses the item, the menu closes, and the screen is unchanged; the only
 * available reading is that they mis-clicked.
 *
 * Source-level on purpose: mounting AG Grid and opening a kebab menu to assert a subscription
 * exists costs far more than reading the template for the host element.
 */
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const PAGES = join(import.meta.dirname, '..');

/** Every `*.page.ts` under `pages/`, as `<folder>/<file>` paths relative to `pages/`. */
function pageFiles(): string[] {
    const out: string[] = [];
    for (const dir of readdirSync(PAGES, { withFileTypes: true })) {
        if (!dir.isDirectory() || dir.name === '__tests__') continue;
        for (const file of readdirSync(join(PAGES, dir.name))) {
            if (file.endsWith('.page.ts')) out.push(`${dir.name}/${file}`);
        }
    }
    return out.sort();
}

const sources = new Map(pageFiles().map((p) => [p, readFileSync(join(PAGES, p), 'utf8')]));

/**
 * Pages that still host `<mj-entity-viewer>` directly, so their grids' "Manage columns" item does
 * nothing.
 *
 * This list may only SHRINK. It is a register of dead controls, not an exemption: every entry is
 * a menu item a user can press that has no effect, and a new entry means the pattern spread. The
 * catalog pages came off it when they moved to `mj-view-workspace`; the rest follow the same way.
 */
const MANAGE_COLUMNS_DEAD = [
    'orders/fulfillment.page.ts',
    'payments/account-credit.page.ts',
    'payments/payments-dashboard.page.ts',
    'payments/payments-list.page.ts',
    'receivables/customer-ar.page.ts',
    'receivables/overdue.page.ts',
    'receivables/subscriptions.page.ts',
];

/** A page whose grids cannot reach a column-config UI: raw viewer, no `ConfigureRequested` binding. */
function leavesManageColumnsDead(source: string): boolean {
    return source.includes('<mj-entity-viewer') && !source.includes('(ConfigureRequested)');
}

describe('grid hosting reaches a column-config UI', () => {
    it('finds the pages', () => {
        // Guards the guard — an empty map makes every assertion below vacuous.
        expect(sources.size).toBeGreaterThan(5);
    });

    it('hosts every catalog grid in mj-view-workspace', () => {
        const catalog = [...sources.keys()].filter((p) => p.startsWith('catalog/'));
        expect(catalog.length).toBeGreaterThan(0);

        for (const page of catalog) {
            const source = sources.get(page)!;
            expect(
                source.includes('<mj-view-workspace'),
                `${page} renders a grid without mj-view-workspace. The catalog is the screen the ` +
                    `pin was raised against — its kebab "Manage columns" needs the workspace's ` +
                    `config panel to open.`,
            ).toBe(true);
            expect(
                leavesManageColumnsDead(source),
                `${page} still hosts <mj-entity-viewer> directly, so that grid's "Manage columns" ` +
                    `emits into nothing.`,
            ).toBe(false);
        }
    });

    it('keeps the dead-control register honest', () => {
        const dead = [...sources.entries()]
            .filter(([, source]) => leavesManageColumnsDead(source))
            .map(([page]) => page)
            .sort();

        expect(
            dead,
            `The set of pages whose "Manage columns" does nothing changed. It may only shrink — ` +
                `move the page to <mj-view-workspace> (or bind (ConfigureRequested) yourself) and ` +
                `drop it from MANAGE_COLUMNS_DEAD. If it grew, a new dead menu item just shipped.`,
        ).toEqual(MANAGE_COLUMNS_DEAD);
    });
});
