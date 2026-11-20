import { describe, expect, it } from 'vitest';
import { MixedEntitlementConditions, ReadWidgetScope } from '../ProductOptionRules';
import { OverlaySuccessorPicks, type LineChoiceRow } from '../renewal-choices';

const options = new Map([
    ['opt-tier', { ID: 'opt-tier', Code: 'TIER', Name: 'Tier' }],
    ['opt-size', { ID: 'opt-size', Code: 'SIZE', Name: 'Size' }],
]);
const values = new Map([
    ['tier-pro', { ID: 'tier-pro', Code: 'PRO', Label: 'Pro' }],
    ['tier-ent', { ID: 'tier-ent', Code: 'ENTERPRISE', Label: 'Enterprise' }],
    ['size-m', { ID: 'size-m', Code: 'MEDIUM', Label: 'Medium' }],
]);
const catalog = { OptionByID: (id: string) => options.get(id), ValueByID: (id: string) => values.get(id) };

const widgetChoice: LineChoiceRow = {
    GroupKey: 'SESSION',
    GroupLabel: 'Session',
    OptionValue: 'A',
    OptionLabel: 'Track A',
    ProductOptionID: null,
    ProductOptionValueID: null,
};

describe('OverlaySuccessorPicks', () => {
    it('gives a retired per-combination product the tier and size it stood for', () => {
        const out = OverlaySuccessorPicks(
            [widgetChoice],
            ['hosting-pro-medium', 'hosting'],
            [
                { ProductID: 'hosting-pro-medium', ProductOptionID: 'opt-tier', ProductOptionValueID: 'tier-pro' },
                { ProductID: 'hosting-pro-medium', ProductOptionID: 'opt-size', ProductOptionValueID: 'size-m' },
            ],
            new Set(['opt-tier', 'opt-size']),
            catalog,
        );
        expect(out.map((c) => [c.GroupKey, c.OptionValue, c.OptionLabel])).toEqual([
            ['SESSION', 'A', 'Track A'],
            ['TIER', 'PRO', 'Pro'],
            ['SIZE', 'MEDIUM', 'Medium'],
        ]);
    });

    it('lets a later hop replace an earlier pick, and drops picks the final product does not offer', () => {
        const source: LineChoiceRow = { ...widgetChoice, GroupKey: 'SIZE', OptionValue: 'MEDIUM', ProductOptionID: 'opt-size', ProductOptionValueID: 'size-m' };
        const out = OverlaySuccessorPicks(
            [source],
            ['a', 'b', 'c'],
            [
                { ProductID: 'a', ProductOptionID: 'opt-tier', ProductOptionValueID: 'tier-pro' },
                { ProductID: 'b', ProductOptionID: 'opt-tier', ProductOptionValueID: 'tier-ent' },
            ],
            new Set(['opt-tier']),
            catalog,
        );
        expect(out.map((c) => [c.GroupKey, c.OptionValue])).toEqual([['TIER', 'ENTERPRISE']]);
    });

    it('ignores picks of the final product itself', () => {
        const out = OverlaySuccessorPicks([], ['a', 'b'], [{ ProductID: 'b', ProductOptionID: 'opt-tier', ProductOptionValueID: 'tier-pro' }], new Set(['opt-tier']), catalog);
        expect(out).toEqual([]);
    });
});

describe('MixedEntitlementConditions', () => {
    it('accepts one code per value of one option, and one unconditional code', () => {
        expect(
            MixedEntitlementConditions([
                { ID: '1', Code: 'SSO', ChoiceGroupKey: 'TIER' },
                { ID: '2', Code: 'SSO', ChoiceGroupKey: 'TIER' },
                { ID: '3', Code: 'SUPPORT', ChoiceGroupKey: null },
            ]),
        ).toEqual([]);
    });

    it('names a code granted both unconditionally and on a pick, or on two options', () => {
        expect(
            MixedEntitlementConditions([
                { ID: '1', Code: 'SSO', ChoiceGroupKey: 'TIER' },
                { ID: '2', Code: 'sso', ChoiceGroupKey: null },
                { ID: '3', Code: 'QUOTA', ChoiceGroupKey: 'TIER' },
                { ID: '4', Code: 'QUOTA', ChoiceGroupKey: 'SIZE' },
            ]),
        ).toEqual(['sso', 'QUOTA']);
    });
});

describe('ReadWidgetScope', () => {
    it('reads the products and choice-group keys a widget names', () => {
        const scope = ReadWidgetScope(
            JSON.stringify({ productId: 'p1', allowedProductIds: ['p2', ''], choiceGroups: [{ key: 'SESSION' }, { label: 'no key' }] }),
        );
        expect(scope).toEqual({ ProductIDs: ['p1', 'p2'], AllCompany: false, GroupKeys: ['SESSION'] });
    });

    it('names nothing for malformed configuration', () => {
        expect(ReadWidgetScope('{not json')).toEqual({ ProductIDs: [], AllCompany: false, GroupKeys: [] });
    });
});
