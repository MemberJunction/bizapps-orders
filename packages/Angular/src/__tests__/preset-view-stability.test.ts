import '@angular/compiler';
import { readFileSync, readdirSync } from 'node:fs';
import { basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect, vi } from 'vitest';
import { PresetViewRef } from '../lib/data/preset-view';
import { MJOCustomerARPageComponent } from '../lib/pages/receivables/customer-ar.page';
import { MJOAccountCreditPageComponent } from '../lib/pages/payments/account-credit.page';
import { MJOOverduePageComponent } from '../lib/pages/receivables/overdue.page';
import { MJOFulfillmentPageComponent } from '../lib/pages/orders/fulfillment.page';
import { Today } from '@mj-biz-apps/orders-entities';

/**
 * A PRESET VIEW MUST KEEP ITS IDENTITY (bc-aidp-next-golive#362).
 *
 * `mj-entity-viewer` takes its view as an `@Input()`, and Angular compares those by REFERENCE. A
 * getter that builds a fresh object therefore runs the viewer's `ViewEntity` setter on every
 * change-detection pass, and that setter's last branch reloads whenever `!this._records` -- which is
 * exactly the state a load that has not finished is in. Each pass restarts it, the response triggers
 * the next pass, and the grid never settles: "Loading MJ_BizApps_Orders: Order Headers..." forever.
 *
 * Reproduced before fixing: ~2,800 API calls, every one returning the correct rows, nothing rendered.
 *
 * So these assert IDENTITY, not equality. `toEqual` would pass against the bug.
 */
describe('PresetViewRef hands back the same object until its key changes', () => {
    it('builds once and returns that object again', () => {
        const ref = new PresetViewRef();
        const build = vi.fn(() => ({ ID: 'preset-x' }) as never);
        const first = ref.For('k1', build);
        const second = ref.For('k1', build);
        expect(second).toBe(first);
        expect(build).toHaveBeenCalledTimes(1);
    });

    it('rebuilds when the key changes, and keeps the new one', () => {
        const ref = new PresetViewRef();
        const build = vi.fn((): never => ({ ID: 'preset-x' }) as never);
        const first = ref.For('k1', build);
        const second = ref.For('k2', build);
        expect(second).not.toBe(first);
        expect(ref.For('k2', build)).toBe(second);
        expect(build).toHaveBeenCalledTimes(2);
    });

    it('does not leak one instance into another', () => {
        const a = new PresetViewRef();
        const b = new PresetViewRef();
        expect(a.For('k', () => ({ ID: 'a' }) as never)).not.toBe(b.For('k', () => ({ ID: 'b' }) as never));
    });
});

/**
 * The four pages that hand the viewer a synthetic view. Two were reported (#362); the other two
 * share the pattern and so shared the defect, waiting on timing rather than on being reported.
 */
describe('every preset view getter is reference-stable across change detection', () => {
    const entity = { ID: 'E1', Name: 'MJ_BizApps_Orders: Order Headers' };

    /**
     * `Object.create` does not run field initialisers, so the component's own `PresetViewRef` is
     * supplied here the way the constructor would. `ref` names the private field each page holds;
     * getting it wrong makes the getter throw rather than quietly pass, which is the right way round.
     */
    const make = <T>(proto: object, ref: string, fields: Record<string, unknown>): T => {
        const page = Object.create(proto) as T;
        for (const [k, v] of Object.entries({ ...fields, [ref]: new PresetViewRef() })) {
            Object.defineProperty(page, k, { value: v, writable: true });
        }
        return page;
    };

    it('Customer A/R: Open items', () => {
        const page = make<MJOCustomerARPageComponent>(MJOCustomerARPageComponent.prototype, 'openOrdersView', {
            OrderEntityInfo: entity,
            Selected: { Key: 'ORG1', Name: 'Cascade', IsOrganization: true },
        });
        expect(page.CustomerOpenOrdersView).toBe(page.CustomerOpenOrdersView);
    });

    it('Customer A/R: and it DOES rebuild when another customer is picked', () => {
        const selected = { Key: 'ORG1', Name: 'Cascade', IsOrganization: true };
        const page = make<MJOCustomerARPageComponent>(MJOCustomerARPageComponent.prototype, 'openOrdersView', {
            OrderEntityInfo: entity,
            Selected: selected,
        });
        const first = page.CustomerOpenOrdersView;
        (page as unknown as { Selected: unknown }).Selected = { Key: 'ORG2', Name: 'Northwind', IsOrganization: true };
        const second = page.CustomerOpenOrdersView;
        expect(second).not.toBe(first);
        expect((second as unknown as { WhereClause: string }).WhereClause).toContain('ORG2');
    });

    it('Account credits', () => {
        const page = make<MJOAccountCreditPageComponent>(MJOAccountCreditPageComponent.prototype, 'creditOrdersView', { OrderEntityInfo: entity });
        expect(page.CreditOrdersView).toBe(page.CreditOrdersView);
    });

    it('Overdue worklist', () => {
        const page = make<MJOOverduePageComponent>(MJOOverduePageComponent.prototype, 'overdueView', { OrderEntityInfo: entity });
        expect(page.OverdueView).toBe(page.OverdueView);
    });

    /**
     * The ONE key component here that moves with nobody touching anything. A collections worklist
     * left open overnight must pick up the orders that fell due at midnight, so the day belongs in
     * the key -- and the viewer must be handed a NEW object when it turns, or the grid keeps
     * filtering on yesterday.
     */
    it('Overdue worklist: and it DOES rebuild when the business day rolls over', () => {
        vi.useFakeTimers();
        try {
            vi.setSystemTime(new Date('2026-03-10T12:00:00Z'));
            const page = make<MJOOverduePageComponent>(MJOOverduePageComponent.prototype, 'overdueView', { OrderEntityInfo: entity });
            const yesterday = Today();
            const first = page.OverdueView;

            vi.setSystemTime(new Date('2026-03-11T12:00:00Z'));
            // Guard: if the clock move did not reach the business calendar there is nothing to assert.
            expect(Today()).not.toBe(yesterday);

            const second = page.OverdueView;
            expect(second).not.toBe(first);
            expect((first as unknown as { WhereClause: string }).WhereClause).toContain(yesterday);
            expect((second as unknown as { WhereClause: string }).WhereClause).toContain(Today());
        } finally {
            vi.useRealTimers();
        }
    });

    it('Fulfillment queue', () => {
        const page = make<MJOFulfillmentPageComponent>(MJOFulfillmentPageComponent.prototype, 'queueView', {
            OrderLineEntityInfo: { ID: 'E2', Name: 'MJ_BizApps_Orders: Order Lines' },
            Preset: 'pending',
        });
        expect(page.FulfillmentQueueView).toBe(page.FulfillmentQueueView);
    });

    // 'pending' and 'done' are two of the three real tab keys ('all' is the third). A key that is
    // not one of them still exercises the rebuild, but names a tab that cannot exist at runtime.
    it('Fulfillment queue: rebuilds when the preset changes', () => {
        const page = make<MJOFulfillmentPageComponent>(MJOFulfillmentPageComponent.prototype, 'queueView', {
            OrderLineEntityInfo: { ID: 'E2', Name: 'MJ_BizApps_Orders: Order Lines' },
            Preset: 'pending',
        });
        const first = page.FulfillmentQueueView;
        (page as unknown as { Preset: string }).Preset = 'done';
        expect(page.FulfillmentQueueView).not.toBe(first);
    });
});

/**
 * THE CASES ABOVE NAME FOUR PAGES, AND THE FIFTH ONE IS THE PROBLEM.
 *
 * Each was written against a binding that exists today. A page added later that binds `[ViewEntity]`
 * to a getter building its object inline reintroduces #362 exactly, and every case above still
 * passes, because none of them knows the new page exists.
 *
 * So this walks the page sources rather than trusting the list: every `[ViewEntity]` in the package
 * must bind a getter that goes through `PresetViewRef`, and the set of bindings must be the set
 * covered above -- which makes adding a page a test failure until a case here names it.
 */
describe('every [ViewEntity] in the package is covered, not just the four named above', () => {
    const PAGES_DIR = fileURLToPath(new URL('../lib/pages/', import.meta.url));

    function SourceFiles(dir: string): string[] {
        const out: string[] = [];
        for (const entry of readdirSync(dir, { withFileTypes: true })) {
            const full = join(dir, entry.name);
            if (entry.isDirectory()) out.push(...SourceFiles(full));
            else if (entry.name.endsWith('.ts')) out.push(full);
        }
        return out;
    }

    /** A getter's text, from its `get X(` to the next member at class indent. */
    function GetterBody(text: string, name: string): string {
        const at = text.indexOf(`get ${name}(`);
        if (at === -1) return '';
        const rest = text.slice(at);
        const end = rest.search(/\n {4}(?:public|private|protected|\/\*\*)/);
        return end === -1 ? rest : rest.slice(0, end);
    }

    const BINDINGS = SourceFiles(PAGES_DIR)
        .map((file) => {
            const text = readFileSync(file, 'utf8');
            return { file, text, names: [...text.matchAll(/\[ViewEntity\]="([A-Za-z0-9_]+)"/g)].map((m) => m[1]) };
        })
        .filter((b) => b.names.length > 0);

    /** The getters the cases above exercise by name. */
    const COVERED: ReadonlySet<string> = new Set([
        'CustomerOpenOrdersView',
        'CreditOrdersView',
        'OverdueView',
        'FulfillmentQueueView',
    ]);

    it('walked the sources and found bindings, so a green run is not an empty walk', () => {
        expect(BINDINGS.flatMap((b) => b.names).length).toBeGreaterThan(0);
    });

    it('binds every one of them to a getter that goes through PresetViewRef', () => {
        const loose: string[] = [];
        for (const { file, text, names } of BINDINGS) {
            for (const name of names) {
                if (!GetterBody(text, name).includes('.For(')) {
                    loose.push(`${basename(file)}: ${name}`);
                }
            }
        }
        expect(loose, 'these build a fresh view on every change-detection pass, which is #362').toEqual([]);
    });

    it('and covers every one of them above, so a new page forces a case here', () => {
        const found = [...new Set(BINDINGS.flatMap((b) => b.names))].sort();
        expect(found, 'a binding with no case above is an untested reload loop').toEqual([...COVERED].sort());
    });
});
