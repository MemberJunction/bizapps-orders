// The component's import graph reaches `@angular/common`, whose partially-compiled
// injectables fall back to JIT. Loading the compiler is all that costs; nothing here
// bootstraps Angular or instantiates the component.
import '@angular/compiler';
import { describe, expect, it } from 'vitest';
import type { mjBizAppsOrdersOrderLineEntity } from '@mj-biz-apps/orders-entities';
import { MJOOrderLinesEditorComponent } from '../order-lines-editor.component';

/**
 * The `Default` row of the price-override dropdown (golive #194, the disclosure half).
 *
 * Every OTHER option in that select names its rule and carries a currency symbol. The
 * one entry that is actually in force read `Default · 195.00` — no name, no symbol — so
 * the dropdown answered "what else could I pick" but not "what am I on now".
 *
 * Called off the prototype with a stand-in `this`: the two collaborators are methods on
 * the component, and binding them here keeps the test out of Angular's DI entirely.
 */
function defaultLabel(defaultUnit: number | null, priceSource: string | null): string {
    const stub = {
        DefaultUnit: () => defaultUnit,
        PricedLine: () => (priceSource === null ? undefined : { PriceSource: priceSource }),
    } as unknown as MJOOrderLinesEditorComponent;
    const line = {} as mjBizAppsOrdersOrderLineEntity;
    return MJOOrderLinesEditorComponent.prototype.DefaultLabel.call(stub, line);
}

describe('MJOOrderLinesEditorComponent.DefaultLabel', () => {
    it('names the rule in force and carries the currency symbol', () => {
        expect(defaultLabel(195, 'Member 195')).toBe('Default (Member 195) · $195.00');
    });

    it('still shows the symbol when the walk named no rule', () => {
        expect(defaultLabel(275, 'base price')).toBe('Default (base price) · $275.00');
        expect(defaultLabel(275, null)).toBe('Default · $275.00');
    });

    // 'stated' means the user typed this price. Presenting their own entry back as the
    // rule that resolved it would be circular, and it is not a rule name.
    it('does not present a typed price as the rule that resolved it', () => {
        expect(defaultLabel(150, 'stated')).toBe('Default · $150.00');
    });

    it('says nothing about money when there is no default price to state', () => {
        expect(defaultLabel(null, 'Member 195')).toBe('Default price');
    });

    it('formats with separators rather than a bare fixed-point number', () => {
        expect(defaultLabel(1621.5, 'Enterprise')).toBe('Default (Enterprise) · $1,621.50');
    });
});
