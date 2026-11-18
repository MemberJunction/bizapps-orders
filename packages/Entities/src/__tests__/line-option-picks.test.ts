import { describe, expect, it } from 'vitest';
import { ApplyOptionDefaults, LineOptionValueID, SetLineOptionPick, type LineChoiceRow, type LineWithChoices } from '../line-option-picks';
import {
    CheckCheckoutOptionPicks,
    CheckoutOptionDefaults,
    CheckoutProductOptions,
    MissingCheckoutOptions,
} from '../checkout-options';
import type { EffectiveProductOption, ProductOptionValueRow } from '../product-options';

const value = (opt: string, code: string, label: string): ProductOptionValueRow => ({
    ID: `${opt}-${code}`,
    ProductOptionID: opt,
    Code: code,
    Label: label,
    SortOrder: 0,
    IsActive: true,
});

function option(id: string, code: string, name: string, codes: string[], opts: { required?: boolean; def?: string } = {}): EffectiveProductOption {
    const values = codes.map((c) => value(id, c, c[0] + c.slice(1).toLowerCase()));
    return {
        Option: { ID: id, CompanyID: null, Code: code, Name: name, SortOrder: 0, IsActive: true },
        Assignment: {
            ID: `a-${id}`,
            ProductTypeID: null,
            ProductCategoryID: null,
            ProductID: 'p',
            ProductOptionID: id,
            IsExcluded: false,
            IsRequired: !!opts.required,
            DefaultProductOptionValueID: opts.def ? `${id}-${opts.def}` : null,
            SortOrder: 0,
            Role: 'LineOption',
        },
        Source: 'Product',
        SourceID: 'p',
        IsRequired: !!opts.required,
        Values: values,
        Default: opts.def ? values.find((v) => v.Code === opts.def) ?? null : null,
    };
}

const TIER = option('opt-tier', 'TIER', 'Tier', ['STANDARD', 'PRO'], { required: true, def: 'STANDARD' });
const SIZE = option('opt-size', 'SIZE', 'Size', ['SMALL', 'LARGE']);

/** A line with an in-memory Choices collection, the way a new line's collection behaves. */
function fakeLine(initial: Partial<LineChoiceRow>[] = []): LineWithChoices & { removed: LineChoiceRow[] } {
    const items: LineChoiceRow[] = initial.map((r) => ({
        GroupKey: '',
        GroupLabel: '',
        OptionValue: '',
        OptionLabel: '',
        ProductOptionID: null,
        ProductOptionValueID: null,
        ...r,
    }));
    const removed: LineChoiceRow[] = [];
    return {
        removed,
        Choices: {
            get Items() {
                return items;
            },
            async Create() {
                const row: LineChoiceRow = { GroupKey: '', GroupLabel: '', OptionValue: '', OptionLabel: '', ProductOptionID: null, ProductOptionValueID: null };
                items.push(row);
                return row;
            },
            Remove(item: LineChoiceRow | number) {
                const row = typeof item === 'number' ? items[item] : item;
                items.splice(items.indexOf(row), 1);
                removed.push(row);
            },
        },
    };
}

describe('line option picks', () => {
    it('writes a pick with the option and value codes and labels', async () => {
        const line = fakeLine();
        expect(await SetLineOptionPick(line, TIER, 'opt-tier-PRO')).toBe(true);
        expect(line.Choices.Items).toEqual([
            {
                GroupKey: 'TIER',
                GroupLabel: 'Tier',
                OptionValue: 'PRO',
                OptionLabel: 'Pro',
                ProductOptionID: 'opt-tier',
                ProductOptionValueID: 'opt-tier-PRO',
            },
        ]);
    });

    it('changes the existing row rather than adding a second, and clears it on null', async () => {
        const line = fakeLine();
        await SetLineOptionPick(line, TIER, 'opt-tier-PRO');
        expect(await SetLineOptionPick(line, TIER, 'opt-tier-PRO')).toBe(false);
        await SetLineOptionPick(line, TIER, 'opt-tier-STANDARD');
        expect(line.Choices.Items).toHaveLength(1);
        expect(LineOptionValueID(line, 'opt-tier')).toBe('opt-tier-STANDARD');
        expect(await SetLineOptionPick(line, TIER, null)).toBe(true);
        expect(line.Choices.Items).toHaveLength(0);
    });

    it('treats a value the option does not allow as clearing the pick', async () => {
        const line = fakeLine();
        await SetLineOptionPick(line, TIER, 'opt-tier-PRO');
        await SetLineOptionPick(line, TIER, 'opt-size-LARGE');
        expect(line.Choices.Items).toHaveLength(0);
    });

    it('pre-fills defaults, keeps existing picks, drops picks for options no longer offered and leaves widget choices', async () => {
        const line = fakeLine([
            { GroupKey: 'OLD', ProductOptionID: 'opt-old', ProductOptionValueID: 'opt-old-X' },
            { GroupKey: 'dept', OptionValue: 'sales' },
        ]);
        expect(await ApplyOptionDefaults(line, [TIER, SIZE])).toBe(true);
        expect(line.removed.map((r) => r.GroupKey)).toEqual(['OLD']);
        expect(line.Choices.Items.map((r) => `${r.GroupKey}=${r.OptionValue}`)).toEqual(['dept=sales', 'TIER=STANDARD']);

        await SetLineOptionPick(line, TIER, 'opt-tier-PRO');
        expect(await ApplyOptionDefaults(line, [TIER, SIZE])).toBe(false);
        expect(LineOptionValueID(line, 'opt-tier')).toBe('opt-tier-PRO');
    });
});

describe('checkout option picks', () => {
    it('describes the options for the browser without IDs', () => {
        const shown = CheckoutProductOptions([TIER, SIZE]);
        expect(shown[0]).toEqual({
            code: 'TIER',
            label: 'Tier',
            required: true,
            defaultValue: 'STANDARD',
            values: [
                { value: 'STANDARD', label: 'Standard' },
                { value: 'PRO', label: 'Pro' },
            ],
        });
        expect(CheckoutOptionDefaults(shown)).toEqual({ TIER: 'STANDARD' });
        expect(MissingCheckoutOptions(shown, {})).toEqual(['Tier']);
        expect(MissingCheckoutOptions(shown, { TIER: 'PRO' })).toEqual([]);
    });

    it('resolves codes to the rows the line records', () => {
        const check = CheckCheckoutOptionPicks([TIER, SIZE], { tier: 'pro', SIZE: 'LARGE' });
        expect(check.Error).toBeUndefined();
        expect(check.Picks.map((p) => [p.GroupKey, p.OptionValue, p.ProductOptionValueID])).toEqual([
            ['TIER', 'PRO', 'opt-tier-PRO'],
            ['SIZE', 'LARGE', 'opt-size-LARGE'],
        ]);
    });

    it('refuses an option or value the product does not offer, and a malformed body', () => {
        expect(CheckCheckoutOptionPicks([TIER], { COLOR: 'RED' }).Error).toMatch(/COLOR is not an option/);
        expect(CheckCheckoutOptionPicks([TIER], { TIER: 'GOLD' }).Error).toMatch(/GOLD is not an available Tier/);
        expect(CheckCheckoutOptionPicks([TIER], ['TIER']).Error).toBeTruthy();
        expect(CheckCheckoutOptionPicks([TIER], { TIER: 3 }).Error).toBeTruthy();
    });

    it('lets a draft leave a required option open but not the final check', () => {
        expect(CheckCheckoutOptionPicks([TIER, SIZE], {}, { partial: true }).Error).toBeUndefined();
        expect(CheckCheckoutOptionPicks([TIER, SIZE], {}).Error).toBe('Pick a Tier.');
        expect(CheckCheckoutOptionPicks([TIER, SIZE], null).Error).toBe('Pick a Tier.');
    });
});
