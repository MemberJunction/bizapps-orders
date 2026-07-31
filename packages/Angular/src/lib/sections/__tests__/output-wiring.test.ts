/**
 * Every page output must be handled, or explicitly declared as notification-only.
 *
 * WHY THIS EXISTS. The section shell creates pages with
 * `ViewContainerRef.createComponent`, and a component created that way has NO
 * host template — so nothing binds its `@Output()`s. Angular does not warn: an
 * `EventEmitter` with no subscriber emits happily into nothing.
 *
 * The result was an app that looked finished and was inert. "Confirm order"
 * emitted `ConfirmRequested` at no listener, so `Orders.ConfirmOrder` — the
 * operation that writes the journal entries — could not be reached from the UI at
 * all. Dashboard tiles and list rows were the same. Every one of those outputs
 * was DOCUMENTED as wired, in a JSDoc `## Example` showing the host markup that
 * would do it. No host existed.
 *
 * So the failure mode is specific: an output is added to a page, the example in
 * its docblock shows a handler, and nobody notices the handler is fictional. This
 * asserts the shell actually names each one.
 */
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const LIB = join(import.meta.dirname, '..', '..');
const shell = readFileSync(join(LIB, 'sections', 'orders-sections.component.ts'), 'utf8');

/**
 * Outputs the shell deliberately does not handle, because the page has ALREADY
 * done the work by the time it emits. These are announcements, not requests — a
 * host may listen to close an overlay or refresh a list, and nothing breaks when
 * none does.
 */
const NOTIFICATION_ONLY = new Set([
    'Saved',          // the page called Orders.SaveOrder itself
    'Applied',        // account credit: Orders.ApplyAccountCredit already ran
    'Refunded',       // refund: Orders.RefundPayment already ran
    'ReturnCreated',  // return: Orders.ConfirmOrder already ran
    'LineOpened',     // opens an inline panel the page owns
    'OpenInAccounting', // deep link into a different app
]);

/**
 * Requests that CANNOT be wired yet, because the operation they would call does
 * not exist. Listed separately from NOTIFICATION_ONLY on purpose: these are dead
 * controls, and calling them "notifications" would bury that.
 *
 * `CaptureRequested` — taking a payment needs a PaymentHeader and its allocation
 * lines to cross the wire together. `PaymentHeaderEntityServer` exposes `Lines`
 * as a transient collection exactly like `OrderEntityServer` does, so a browser
 * `entity.Save()` cannot compose one — the same reason `Orders.SaveOrder` exists
 * for orders. There is no equivalent payment operation among the ten defined, so
 * the front end has nothing to call. Backend work; tracked, not hidden.
 */
const AWAITING_OPERATION = new Set(['CaptureRequested']);

/**
 * Outputs that are REQUESTS — the page cannot do the work and is asking the
 * section to. An unhandled one is a dead button.
 */
const pageOutputs = new Map<string, string[]>();
for (const dir of readdirSync(join(LIB, 'pages'), { withFileTypes: true })) {
    if (!dir.isDirectory() || dir.name === '__tests__') continue;
    for (const file of readdirSync(join(LIB, 'pages', dir.name))) {
        if (!file.endsWith('.page.ts')) continue;
        const source = readFileSync(join(LIB, 'pages', dir.name, file), 'utf8');
        const names = [...source.matchAll(/@Output\(\)\s+(\w+)/g)].map((m) => m[1]);
        if (names.length) pageOutputs.set(`${dir.name}/${file}`, names);
    }
}

const allOutputs = [...new Set([...pageOutputs.values()].flat())].sort();

describe('page outputs are wired to the section', () => {
    it('finds the pages and their outputs', () => {
        // Guards the guard — an empty list makes every assertion below vacuous.
        expect(pageOutputs.size).toBeGreaterThan(5);
        expect(allOutputs.length).toBeGreaterThan(5);
    });

    it.each(allOutputs)('%s is handled or declared notification-only', (name) => {
        if (NOTIFICATION_ONLY.has(name)) return;
        if (AWAITING_OPERATION.has(name)) return;
        expect(
            shell.includes(`'${name}'`),
            `No page output "${name}" is subscribed in orders-sections.component.ts. ` +
                `A component created through createComponent has no host template, so ` +
                `this emits into nothing and whatever triggers it is a dead control. ` +
                `Either handle it in wirePage(), or add it to NOTIFICATION_ONLY with a ` +
                `reason if the page already did the work.`,
        ).toBe(true);
    });

    it('keeps the blocked list honest', () => {
        // If someone adds the missing operation, this list should shrink rather
        // than quietly keep excusing a control that could now work.
        expect([...AWAITING_OPERATION]).toEqual(['CaptureRequested']);
    });

    it('points every primary button at a page that exists', () => {
        // A header button is the most prominent control on the section. Aiming it
        // at a page id the rail does not have would land on "not built yet",
        // which is the worst possible first click.
        const nav = readFileSync(join(LIB, 'sections', 'section-nav.model.ts'), 'utf8');
        const railIds = new Set([...nav.matchAll(/Id: '([a-z-]+)'/g)].map((m) => m[1]));
        const targets = [...shell.matchAll(/PageId: '([a-z-]+)'/g)].map((m) => m[1]);

        expect(targets.length).toBeGreaterThan(0);
        const missing = targets.filter((id) => !railIds.has(id));
        expect(missing, `primary actions point at unknown pages: ${missing.join(', ')}`).toEqual([]);
    });

    it('reaches ConfirmOrder from the UI', () => {
        // The specific regression: this is the only path to the operation that
        // writes journal entries, and it was unreachable.
        expect(shell).toMatch(/ConfirmRequested/);
        expect(shell).toMatch(/PreviewConfirm/);
        expect(shell).toMatch(/entry\.Confirm\(/);
    });
});
