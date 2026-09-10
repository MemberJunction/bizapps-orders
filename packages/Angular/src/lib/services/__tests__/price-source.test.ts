import { describe, expect, it } from 'vitest';
import type { OrderHeaderEntity } from '@mj-biz-apps/orders-entities';
import { MJOPricingScheduler, WinningRuleLabel } from '../pricing-scheduler.service';

/**
 * golive #194 — the order line named every resolved price `'base price'`.
 *
 * Craig reproduced it against a product carrying two active rules (`Member 195` on a
 * member list, `Base 275` on none): resolution was CORRECT and the list rule won at
 * $195.00, but the badge still read "base price". That is not vagueness, it is a false
 * statement — someone checking an order against a signed contract reads it as proof the
 * member list did not apply.
 *
 * The name was on the client the whole time, as the winning component's `Label`.
 */

type Component = { Kind: string; Label: string; Amount: number };
type Line = { ID: string; Quantity: number; StatedPrice?: boolean; Overridden?: boolean };

/** Only the two members `summarize` reads: the line's id/quantity and its dirty state. */
function orderWith(lines: Line[]): OrderHeaderEntity {
    const items = lines.map((l) => ({
        ID: l.ID,
        Quantity: l.Quantity,
        GetFieldByName: (name: string) => {
            if (name === 'UnitPrice') return { Dirty: l.StatedPrice === true };
            if (name === 'PriceOverridden') return { Value: l.Overridden === true };
            return undefined;
        },
    }));
    return { Lines: { Items: items } } as unknown as OrderHeaderEntity;
}

/** Run one line through the private summarizer and report what the badge would show. */
function priceSourceFor(unitPrice: number, components: Component[] | undefined, line: Line = { ID: 'L1', Quantity: 1 }): string | null {
    const scheduler = new MJOPricingScheduler();
    const summarize = (scheduler as unknown as {
        summarize: (order: OrderHeaderEntity, out: unknown) => { Lines: Array<{ PriceSource: string | null }> };
    }).summarize.bind(scheduler);

    const result = summarize(orderWith([line]), {
        Lines: [{ UnitPrice: unitPrice, DiscountAmount: 0, LineTotalNet: unitPrice * line.Quantity, Components: components }],
        Totals: { Net: unitPrice, Discount: 0, Gross: unitPrice },
    });
    return result.Lines[0].PriceSource;
}

describe('WinningRuleLabel', () => {
    it('names the Base component the default resolver emits', () => {
        expect(WinningRuleLabel([{ Kind: 'Base', Label: 'Member 195', Amount: 195 }])).toBe('Member 195');
    });

    it('names a plugin Rule component the same way', () => {
        expect(WinningRuleLabel([{ Kind: 'Rule', Label: 'Wholesale tier 10+', Amount: 90 }])).toBe('Wholesale tier 10+');
    });

    // Position is the resolver's business, not a contract — select by type or a plugin
    // that prepends its own note to the walk renames every line.
    it('skips components that describe what happened TO the price, not where it came from', () => {
        expect(
            WinningRuleLabel([
                { Kind: 'Adjustment', Label: 'Loyalty 5%', Amount: -9.75 },
                { Kind: 'Base', Label: 'Member 195', Amount: 195 },
                { Kind: 'Tax', Label: 'GST', Amount: 9.75 },
            ]),
        ).toBe('Member 195');
    });

    it('reports nothing rather than an empty name', () => {
        expect(WinningRuleLabel([{ Kind: 'Base', Label: '   ', Amount: 195 }])).toBeNull();
        expect(WinningRuleLabel([{ Kind: 'Tax', Label: 'GST', Amount: 9.75 }])).toBeNull();
        expect(WinningRuleLabel([])).toBeNull();
        expect(WinningRuleLabel(undefined)).toBeNull();
    });
});

describe('MJOLinePrice.PriceSource', () => {
    // THE REPORTED DEFECT.
    it('names the price-list rule that won instead of calling it a base price', () => {
        expect(priceSourceFor(195, [{ Kind: 'Base', Label: 'Member 195', Amount: 195 }])).toBe('Member 195');
    });

    // Guards the 2026-08-07 regression documented on the field: a resolved price with
    // nothing to name it must NOT fall through to null, which the badge renders as
    // *no price rule* — an unpriced warning sitting beside a resolved number.
    it('falls back to "base price" when the walk named nothing, never to null', () => {
        expect(priceSourceFor(275, [])).toBe('base price');
        expect(priceSourceFor(275, undefined)).toBe('base price');
    });

    it('says nothing at all when no price resolved, so the badge can warn', () => {
        expect(priceSourceFor(0, [{ Kind: 'Base', Label: 'Member 195', Amount: 0 }])).toBeNull();
    });

    it('reports a typed price as stated, whatever the engine would have resolved', () => {
        const typed: Line = { ID: 'L1', Quantity: 1, StatedPrice: true };
        expect(priceSourceFor(150, [{ Kind: 'Base', Label: 'Member 195', Amount: 195 }], typed)).toBe('stated');

        const overridden: Line = { ID: 'L2', Quantity: 1, Overridden: true };
        expect(priceSourceFor(150, [{ Kind: 'Base', Label: 'Member 195', Amount: 195 }], overridden)).toBe('stated');
    });
});
