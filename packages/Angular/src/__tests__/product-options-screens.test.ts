import '@angular/compiler';
import { describe, expect, it } from 'vitest';
import type {
    EffectiveProductOption,
    ProductOptionAssignmentRow,
    ProductOptionCatalog,
    mjBizAppsOrdersProductEntity,
} from '@mj-biz-apps/orders-entities';
import { AssignableOptions, BuildOptionRows, type OptionLevelScope } from '../lib/custom/Product/widgets/product-option-rows';
import { OptionCompanyChoices, OptionDraftProblem, OptionValueDraftProblem } from '../lib/pages/catalog/product-options.page';
import { ReadEntitlementCondition } from '../lib/form-panels/entitlement-condition.panel';
import { BizAppsProductPricingWidgetComponent } from '../lib/custom/Product/widgets/product-pricing-widget.component';

/** The product options screens (golive #399): the Options panel's rows, the catalog page's checks,
 *  the entitlement condition picker and the price When builder's Option fields. */

const TYPE = 'type-1';
const ROOT = 'cat-root';
const SUB = 'cat-sub';
const PRODUCT = 'prod-1';
const CO = 'co-1';

const TIER = { ID: 'opt-tier', CompanyID: null, Code: 'TIER', Name: 'Tier', SortOrder: 1, IsActive: true };
const SIZE = { ID: 'opt-size', CompanyID: CO, Code: 'SIZE', Name: 'Size', SortOrder: 2, IsActive: true };
const COLOR = { ID: 'opt-color', CompanyID: 'co-2', Code: 'COLOR', Name: 'Color', SortOrder: 3, IsActive: true };
const val = (opt: string, code: string, sort: number) => ({ ID: `${opt}-${code}`, ProductOptionID: opt, Code: code, Label: code[0] + code.slice(1).toLowerCase(), SortOrder: sort, IsActive: true });
const VALUES = [val('opt-tier', 'STANDARD', 1), val('opt-tier', 'PRO', 2), val('opt-size', 'SMALL', 1), val('opt-size', 'LARGE', 2)];

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
    return { Options: [TIER, SIZE, COLOR], Values: VALUES, Assignments: assignments, AssignmentValues: assignmentValues };
}

const names = (level: string, id: string) => `${level}:${id}`;
const productScope: OptionLevelScope = { Level: 'Product', ID: PRODUCT, CompanyID: CO, ProductTypeID: TYPE, CategoryChainAbove: [SUB, ROOT] };

describe('the Options panel rows', () => {
    it('lists inherited options with where they come from, and this level’s own rows', () => {
        const typeTier = assign({ ProductTypeID: TYPE, IsRequired: true, DefaultProductOptionValueID: 'opt-tier-PRO' });
        const catSize = assign({ ProductCategoryID: ROOT, ProductOptionID: SIZE.ID });
        const rows = BuildOptionRows(productScope, catalog([typeTier, catSize]), names);
        expect(rows.map((r) => [r.Option.Code, r.Status, r.InheritedFrom, r.IsRequired, r.DefaultLabel])).toEqual([
            ['TIER', 'Inherited', 'from Type:type-1', true, 'Pro'],
            ['SIZE', 'Inherited', 'from Category:cat-root', false, ''],
        ]);
    });

    it('shows this level’s override in place of the inherited row, and an exclusion with its source', () => {
        const catTier = assign({ ProductCategoryID: SUB });
        const ownTier = assign({ ProductID: PRODUCT, IsRequired: true });
        const catSize = assign({ ProductCategoryID: SUB, ProductOptionID: SIZE.ID });
        const ownSizeOff = assign({ ProductID: PRODUCT, ProductOptionID: SIZE.ID, IsExcluded: true });
        const rows = BuildOptionRows(productScope, catalog([catTier, ownTier, catSize, ownSizeOff], [{ ProductOptionAssignmentID: ownTier.ID, ProductOptionValueID: 'opt-tier-PRO' }]), names);
        const tier = rows.find((r) => r.Option.Code === 'TIER');
        const size = rows.find((r) => r.Option.Code === 'SIZE');
        expect(tier).toMatchObject({ Status: 'Assigned', InheritedFrom: '', IsRequired: true, ValuesText: 'Pro' });
        expect(tier?.Inherited?.Source).toBe('Category');
        expect(size).toMatchObject({ Status: 'Excluded', InheritedFrom: 'from Category:cat-sub' });
        expect(rows).toHaveLength(2);
    });

    it('gives a product type no inherited options', () => {
        const typeTier = assign({ ProductTypeID: TYPE });
        const rows = BuildOptionRows({ Level: 'Type', ID: TYPE, CompanyID: null, ProductTypeID: null, CategoryChainAbove: [] }, catalog([typeTier]), names);
        expect(rows.map((r) => [r.Option.Code, r.Status, r.ValuesText])).toEqual([['TIER', 'Assigned', 'All values']]);
    });

    it('offers only shared options at type level, and shared or own-company ones below', () => {
        const typeScope: OptionLevelScope = { Level: 'Type', ID: TYPE, CompanyID: null, ProductTypeID: null, CategoryChainAbove: [] };
        expect(AssignableOptions(typeScope, catalog([])).map((o) => o.Code)).toEqual(['TIER']);
        expect(AssignableOptions(productScope, catalog([])).map((o) => o.Code)).toEqual(['TIER', 'SIZE']);
        expect(AssignableOptions(productScope, catalog([assign({ ProductID: PRODUCT })])).map((o) => o.Code)).toEqual(['SIZE']);
    });
});

describe('the options catalog page checks', () => {
    const options = [
        { ID: 'o1', Code: 'TIER', CompanyID: null },
        { ID: 'o2', Code: 'SIZE', CompanyID: CO },
    ];
    const draft = (over: Partial<Parameters<typeof OptionDraftProblem>[0]>) => ({
        ID: null, Code: 'X', Name: 'X', Description: '', CompanyID: '', SortOrder: 0, IsActive: true, ...over,
    });

    it('refuses a code already used in the same scope, and allows it in another', () => {
        expect(OptionDraftProblem(draft({ Code: 'tier' }), options)).toMatch(/shared option already has code tier/);
        expect(OptionDraftProblem(draft({ Code: 'TIER', CompanyID: CO }), options)).toBeNull();
        expect(OptionDraftProblem(draft({ Code: 'SIZE', CompanyID: CO }), options)).toMatch(/This company already/);
        expect(OptionDraftProblem(draft({ ID: 'o1', Code: 'TIER' }), options)).toBeNull();
        expect(OptionDraftProblem(draft({ Code: ' ' }), options)).toBe('Enter a code.');
        expect(OptionDraftProblem(draft({ Name: '' }), options)).toBe('Enter a name.');
    });

    it('refuses a value code the option already has', () => {
        const values = [{ ID: 'v1', Code: 'PRO' }];
        expect(OptionValueDraftProblem({ ID: null, Code: 'pro', Label: 'Pro', SortOrder: 0, IsActive: true }, values)).toMatch(/already has a value/);
        expect(OptionValueDraftProblem({ ID: 'v1', Code: 'PRO', Label: 'Pro', SortOrder: 0, IsActive: true }, values)).toBeNull();
        expect(OptionValueDraftProblem({ ID: null, Code: 'NEW', Label: '', SortOrder: 0, IsActive: true }, values)).toBe('Enter a label.');
    });

    it('lists each company that owns catalog rows once, by name', () => {
        expect(
            OptionCompanyChoices([
                { CompanyID: 'B', Company: 'Beta' },
                { CompanyID: 'a', Company: 'Alpha' },
                { CompanyID: 'b', Company: 'Beta again' },
                { CompanyID: null, Company: null },
            ]),
        ).toEqual([
            { ID: 'a', Name: 'Alpha' },
            { ID: 'b', Name: 'Beta' },
        ]);
    });
});

describe('the entitlement condition picker', () => {
    const tier = {
        Option: TIER,
        Values: VALUES.filter((v) => v.ProductOptionID === TIER.ID),
    } as unknown as EffectiveProductOption;

    it('reads an option code as that option and value', () => {
        expect(ReadEntitlementCondition([tier], 'tier', 'pro')).toEqual({ Mode: 'option', OptionID: TIER.ID, ValueID: 'opt-tier-PRO' });
        expect(ReadEntitlementCondition([tier], 'TIER', 'GOLD')).toEqual({ Mode: 'option', OptionID: TIER.ID, ValueID: '' });
    });

    it('keeps a widget choice group typed, and no key as no condition', () => {
        expect(ReadEntitlementCondition([tier], 'dept', 'sales').Mode).toBe('typed');
        expect(ReadEntitlementCondition([tier], null, null).Mode).toBe('none');
        expect(ReadEntitlementCondition([], null, null).Mode).toBe('typed');
    });
});

describe('the price When builder and options', () => {
    function widget(): BizAppsProductPricingWidgetComponent {
        const w = new BizAppsProductPricingWidgetComponent();
        w.Product = { ID: PRODUCT, IsSaved: true, ProductTypeID: TYPE, ProductCategoryID: null } as unknown as mjBizAppsOrdersProductEntity;
        return w;
    }
    const optionWhen = JSON.stringify({ logic: 'and', filters: [{ field: 'Option.TIER', operator: 'eq', value: 'PRO' }] });

    it('reads an Option condition in the When sentence', () => {
        expect(widget().WhenSentence({ Applicability: optionWhen } as never)).toBe('Option · TIER equals PRO');
    });

    it('keeps a stored Option field listed when the option is not effective here', () => {
        const w = widget();
        w.AllPriceRecords = [{ ID: 'p1', Applicability: optionWhen, ProductCategoryID: null }] as never[];
        w.WhenEditorPriceID = 'p1';
        // The Option part of the field list; the entity sources need loaded metadata.
        const fields = (w as unknown as { optionWhenFields(inUse: Set<string>): Array<{ name: string; displayName: string; type: string }> })
            .optionWhenFields(new Set(['Option.TIER', 'Order.Status']));
        expect(fields).toEqual([{ name: 'Option.TIER', displayName: 'Option · TIER', type: 'string' }]);
    });
});
