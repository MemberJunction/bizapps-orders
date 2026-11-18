// The component's import graph reaches `@angular/common`, whose partially-compiled injectables fall
// back to JIT. Loading the compiler is all that costs; nothing here bootstraps Angular.
import '@angular/compiler';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { EffectiveProductOption, mjBizAppsOrdersOrderLineEntity } from '@mj-biz-apps/orders-entities';
import { MJOOrderLinesEditorComponent } from '../order-lines-editor.component';

/**
 * Product options on the order line editor (golive #399): a selector per option writes the line's
 * Choices row, a new line starts on each option's default, and a booked order's picks are read-only.
 */

const PRODUCT = 'c1c2c3d4-0000-4000-8000-0000000000aa';

function tierOption(): EffectiveProductOption {
    const values = ['STANDARD', 'PRO'].map((code, i) => ({
        ID: `tier-${code}`,
        ProductOptionID: 'opt-tier',
        Code: code,
        Label: code === 'PRO' ? 'Pro' : 'Standard',
        SortOrder: i,
        IsActive: true,
    }));
    return {
        Option: { ID: 'opt-tier', CompanyID: null, Code: 'TIER', Name: 'Tier', SortOrder: 0, IsActive: true },
        Assignment: {
            ID: 'a-tier',
            ProductTypeID: null,
            ProductCategoryID: null,
            ProductID: PRODUCT,
            ProductOptionID: 'opt-tier',
            IsExcluded: false,
            IsRequired: true,
            DefaultProductOptionValueID: 'tier-STANDARD',
            SortOrder: 0,
            Role: 'LineOption',
        },
        Source: 'Product',
        SourceID: PRODUCT,
        IsRequired: true,
        Values: values,
        Default: values[0],
    };
}

interface Row {
    GroupKey: string;
    GroupLabel: string;
    OptionValue: string;
    OptionLabel: string;
    ProductOptionID: string | null;
    ProductOptionValueID: string | null;
}

function line(rows: Row[] = []): mjBizAppsOrdersOrderLineEntity {
    const items = [...rows];
    return {
        ID: 'L1',
        ProductID: PRODUCT,
        Choices: {
            get Items() {
                return items;
            },
            IsLoaded: true,
            async Create() {
                const row: Row = { GroupKey: '', GroupLabel: '', OptionValue: '', OptionLabel: '', ProductOptionID: null, ProductOptionValueID: null };
                items.push(row);
                return row;
            },
            Remove(item: Row) {
                items.splice(items.indexOf(item), 1);
            },
        },
    } as unknown as mjBizAppsOrdersOrderLineEntity;
}

function editor(opts: { locked?: boolean } = {}) {
    const calls = { pricing: 0, applicable: 0 };
    const c = Object.create(MJOOrderLinesEditorComponent.prototype) as MJOOrderLinesEditorComponent;
    Object.assign(c as object, {
        EditMode: true,
        _order: { MoneyLocked: !!opts.locked },
        optionsEngineReady: true,
        optionsByProduct: new Map([[PRODUCT.toLowerCase(), [tierOption()]]]),
        cdr: { detectChanges: () => undefined },
        schedulePricing: () => {
            calls.pricing += 1;
        },
        refreshApplicable: async () => {
            calls.applicable += 1;
        },
    });
    return { c, calls };
}

class Select {
    constructor(public value: string) {}
}
const globals = globalThis as unknown as Record<string, unknown>;
let savedSelect: unknown;
beforeEach(() => {
    savedSelect = globals.HTMLSelectElement;
    globals.HTMLSelectElement = Select;
});
afterEach(() => {
    globals.HTMLSelectElement = savedSelect;
});

const pick = (value: string) => ({ target: new Select(value) }) as unknown as Event;

describe('product options on the order line editor', () => {
    it('writes the pick into the line Choices and prices the order again', async () => {
        const { c, calls } = editor();
        const l = line();
        const [tier] = c.OptionsFor(l);
        await c.OnOptionPicked(l, tier, pick('tier-PRO'));
        expect(l.Choices.Items).toEqual([
            { GroupKey: 'TIER', GroupLabel: 'Tier', OptionValue: 'PRO', OptionLabel: 'Pro', ProductOptionID: 'opt-tier', ProductOptionValueID: 'tier-PRO' },
        ]);
        expect(c.OptionPickFor(l, tier)).toBe('tier-PRO');
        expect(calls).toEqual({ pricing: 1, applicable: 1 });

        await c.OnOptionPicked(l, tier, pick('tier-PRO'));
        expect(calls.pricing).toBe(1);

        await c.OnOptionPicked(l, tier, pick(''));
        expect(l.Choices.Items).toHaveLength(0);
        expect(calls.pricing).toBe(2);
    });

    it('leaves a booked order’s picks alone and shows the picked label', async () => {
        const { c, calls } = editor({ locked: true });
        const l = line([
            { GroupKey: 'TIER', GroupLabel: 'Tier', OptionValue: 'PRO', OptionLabel: 'Pro', ProductOptionID: 'opt-tier', ProductOptionValueID: 'tier-PRO' },
        ]);
        const [tier] = c.OptionsFor(l);
        expect(c.CanEditOptions).toBe(false);
        await c.OnOptionPicked(l, tier, pick('tier-STANDARD'));
        expect(c.OptionPickFor(l, tier)).toBe('tier-PRO');
        expect(c.OptionLabelFor(l, tier)).toBe('Pro');
        expect(calls.pricing).toBe(0);
    });

    it('starts a new line on the default, which stays editable', async () => {
        const { c } = editor();
        const l = line();
        await (c as unknown as { applyOptionDefaults(l: mjBizAppsOrdersOrderLineEntity): Promise<void> }).applyOptionDefaults(l);
        const [tier] = c.OptionsFor(l);
        expect(c.OptionPickFor(l, tier)).toBe('tier-STANDARD');
        await c.OnOptionPicked(l, tier, pick('tier-PRO'));
        expect(c.OptionPickFor(l, tier)).toBe('tier-PRO');
    });

    it('offers no selectors before the option catalog loads', () => {
        const { c } = editor();
        Object.assign(c as object, { optionsEngineReady: false });
        expect(c.OptionsFor(line())).toEqual([]);
    });
});
