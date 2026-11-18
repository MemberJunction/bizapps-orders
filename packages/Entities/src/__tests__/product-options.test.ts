import { describe, expect, it } from 'vitest';
import {
    CheckOptionPicks,
    DefaultOptionPicks,
    IsOptionApplicability,
    MissingRequiredOptions,
    OptionApplicabilityRecord,
    OptionConditionsDisjoint,
    ResolveEffectiveOptions,
    type ProductOptionAssignmentRow,
    type ProductOptionCatalog,
    type ProductOptionScope,
} from '../product-options';

const TYPE = 'type-1';
const ROOT = 'cat-root';
const SUB = 'cat-sub';
const PRODUCT = 'prod-1';
const scope: ProductOptionScope = { ProductID: PRODUCT, ProductTypeID: TYPE, CategoryChainNearestFirst: [SUB, ROOT] };

const TIER = { ID: 'opt-tier', CompanyID: null, Code: 'TIER', Name: 'Tier', SortOrder: 1, IsActive: true };
const SIZE = { ID: 'opt-size', CompanyID: 'co-1', Code: 'SIZE', Name: 'Size', SortOrder: 2, IsActive: true };
const val = (opt: string, code: string, sort: number, IsActive = true) => ({
    ID: `${opt}-${code}`,
    ProductOptionID: opt,
    Code: code,
    Label: code[0] + code.slice(1).toLowerCase(),
    SortOrder: sort,
    IsActive,
});
const VALUES = [
    val('opt-tier', 'STANDARD', 1),
    val('opt-tier', 'PRO', 2),
    val('opt-tier', 'ENTERPRISE', 3),
    val('opt-size', 'SMALL', 1),
    val('opt-size', 'MEDIUM', 2),
    val('opt-size', 'LARGE', 3),
    val('opt-size', 'XL', 4, false),
];

let seq = 0;
function assign(at: Partial<ProductOptionAssignmentRow>): ProductOptionAssignmentRow {
    return {
        ID: `a-${++seq}`,
        ProductTypeID: null,
        ProductCategoryID: null,
        ProductID: null,
        ProductOptionID: TIER.ID,
        IsExcluded: false,
        IsRequired: false,
        DefaultProductOptionValueID: null,
        SortOrder: 0,
        Role: 'LineOption',
        ...at,
    };
}

function catalog(assignments: ProductOptionAssignmentRow[], assignmentValues: { ProductOptionAssignmentID: string; ProductOptionValueID: string }[] = []): ProductOptionCatalog {
    return { Options: [TIER, SIZE], Values: VALUES, Assignments: assignments, AssignmentValues: assignmentValues };
}

describe('ResolveEffectiveOptions', () => {
    it('offers a type-level option to every product of the type', () => {
        const eff = ResolveEffectiveOptions(scope, catalog([assign({ ProductTypeID: TYPE, IsRequired: true })]));
        expect(eff.map((e) => [e.Option.Code, e.Source, e.IsRequired])).toEqual([['TIER', 'Type', true]]);
        expect(eff[0].Values.map((v) => v.Code)).toEqual(['STANDARD', 'PRO', 'ENTERPRISE']);
    });

    it('lets a category replace the type row whole', () => {
        const type = assign({ ProductTypeID: TYPE, IsRequired: true, DefaultProductOptionValueID: 'opt-tier-PRO' });
        const root = assign({ ProductCategoryID: ROOT });
        const eff = ResolveEffectiveOptions(scope, catalog([type, root]));
        expect(eff[0].Source).toBe('Category');
        expect(eff[0].IsRequired).toBe(false);
        expect(eff[0].Default).toBeNull();
    });

    it('prefers the nearest category over its ancestors', () => {
        const root = assign({ ProductCategoryID: ROOT });
        const sub = assign({ ProductCategoryID: SUB, IsRequired: true });
        const eff = ResolveEffectiveOptions(scope, catalog([root, sub]));
        expect(eff[0].SourceID).toBe(SUB);
        expect(eff[0].IsRequired).toBe(true);
    });

    it('gives the product the final say', () => {
        const sub = assign({ ProductCategoryID: SUB, IsRequired: true });
        const prod = assign({ ProductID: PRODUCT });
        const eff = ResolveEffectiveOptions(scope, catalog([sub, prod]));
        expect(eff[0].Source).toBe('Product');
        expect(eff[0].IsRequired).toBe(false);
    });

    it('removes an option excluded below, and offers it again when re-assigned further down', () => {
        const type = assign({ ProductTypeID: TYPE });
        const excluded = assign({ ProductCategoryID: ROOT, IsExcluded: true });
        expect(ResolveEffectiveOptions(scope, catalog([type, excluded]))).toEqual([]);
        const again = assign({ ProductID: PRODUCT });
        expect(ResolveEffectiveOptions(scope, catalog([type, excluded, again])).map((e) => e.Source)).toEqual(['Product']);
    });

    it('ignores assignments for other products, categories and types', () => {
        const other = [
            assign({ ProductID: 'other-product' }),
            assign({ ProductCategoryID: 'other-cat' }),
            assign({ ProductTypeID: 'other-type' }),
        ];
        expect(ResolveEffectiveOptions(scope, catalog(other))).toEqual([]);
    });

    it('limits values to the winning row and drops inactive ones', () => {
        const prod = assign({ ProductID: PRODUCT, ProductOptionID: SIZE.ID });
        const eff = ResolveEffectiveOptions(
            scope,
            catalog(
                [prod],
                [
                    { ProductOptionAssignmentID: prod.ID, ProductOptionValueID: 'opt-size-LARGE' },
                    { ProductOptionAssignmentID: prod.ID, ProductOptionValueID: 'opt-size-XL' },
                ],
            ),
        );
        expect(eff[0].Values.map((v) => v.Code)).toEqual(['LARGE']);
    });

    it('drops a default outside the allowed values', () => {
        const prod = assign({ ProductID: PRODUCT, ProductOptionID: SIZE.ID, DefaultProductOptionValueID: 'opt-size-SMALL' });
        const eff = ResolveEffectiveOptions(
            scope,
            catalog([prod], [{ ProductOptionAssignmentID: prod.ID, ProductOptionValueID: 'opt-size-LARGE' }]),
        );
        expect(eff[0].Default).toBeNull();
    });

    it('does not offer a Variant-role option on the line', () => {
        expect(ResolveEffectiveOptions(scope, catalog([assign({ ProductID: PRODUCT, Role: 'Variant' })]))).toEqual([]);
    });
});

describe('picks', () => {
    const eff = ResolveEffectiveOptions(
        scope,
        catalog([
            assign({ ProductID: PRODUCT, IsRequired: true, DefaultProductOptionValueID: 'opt-tier-PRO' }),
            assign({ ProductID: PRODUCT, ProductOptionID: SIZE.ID, IsRequired: true }),
        ]),
    );
    const pick = (opt: string, code: string, key: string) => ({
        ProductOptionID: opt,
        ProductOptionValueID: `${opt}-${code}`,
        GroupKey: key,
        OptionValue: code,
    });

    it('accepts one allowed value per required option', () => {
        expect(CheckOptionPicks(eff, [pick('opt-tier', 'PRO', 'TIER'), pick('opt-size', 'LARGE', 'SIZE')])).toEqual([]);
    });

    it('names a missing required option', () => {
        expect(CheckOptionPicks(eff, [pick('opt-tier', 'PRO', 'TIER')])).toEqual(['Pick a Size.']);
        expect(MissingRequiredOptions(eff, [])).toEqual(['Tier', 'Size']);
    });

    it('refuses two picks for one option, an inactive value and an option not offered', () => {
        const problems = CheckOptionPicks(eff, [
            pick('opt-tier', 'PRO', 'TIER'),
            pick('opt-tier', 'ENTERPRISE', 'TIER'),
            pick('opt-size', 'XL', 'SIZE'),
            { ProductOptionID: 'opt-color', ProductOptionValueID: 'x', GroupKey: 'COLOR', OptionValue: 'RED' },
        ]);
        expect(problems).toEqual([
            'Tier has more than one pick; choose one value.',
            'XL is not an available Size for this product.',
            'COLOR is not offered on this product.',
        ]);
    });

    it('leaves widget choices alone', () => {
        const widget = { ProductOptionID: null, ProductOptionValueID: null, GroupKey: 'SESSION', OptionValue: 'A' };
        expect(OptionApplicabilityRecord([widget, pick('opt-tier', 'PRO', 'TIER')])).toEqual({ TIER: 'PRO' });
    });

    it('pre-fills defaults', () => {
        expect(DefaultOptionPicks(eff)).toEqual([pick('opt-tier', 'PRO', 'TIER')]);
    });
});

describe('option price rules', () => {
    const rule = (...pairs: [string, string][]) =>
        JSON.stringify({ logic: 'and', filters: pairs.map(([c, v]) => ({ field: `Option.${c}`, operator: 'eq', value: v })) });

    it('recognises a rule that tests a pick', () => {
        expect(IsOptionApplicability(rule(['TIER', 'PRO']))).toBe(true);
        expect(IsOptionApplicability(JSON.stringify({ field: 'Order.CompanyID', operator: 'eq', value: 'x' }))).toBe(false);
    });

    it('treats rows of a matrix as disjoint', () => {
        expect(OptionConditionsDisjoint(rule(['TIER', 'PRO'], ['SIZE', 'SMALL']), rule(['TIER', 'PRO'], ['SIZE', 'LARGE']))).toBe(true);
        expect(OptionConditionsDisjoint(rule(['TIER', 'PRO']), rule(['TIER', 'pro'], ['SIZE', 'LARGE']))).toBe(false);
        expect(OptionConditionsDisjoint(rule(['TIER', 'PRO']), rule(['SIZE', 'LARGE']))).toBe(false);
    });

    it('does not call an or-rule disjoint', () => {
        const either = JSON.stringify({
            logic: 'or',
            filters: [
                { field: 'Option.TIER', operator: 'eq', value: 'PRO' },
                { field: 'Option.TIER', operator: 'eq', value: 'ENTERPRISE' },
            ],
        });
        expect(OptionConditionsDisjoint(either, rule(['TIER', 'STANDARD']))).toBe(false);
    });
});
