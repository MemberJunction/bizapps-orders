/**
 * What the Options panel of a product type, category or product shows: the options this level
 * assigns, and the ones it inherits from the levels above, each saying where it comes from.
 *
 * Pure: the rows are computed from the cached option catalog (`OrdersEngine.OptionCatalog`) and the
 * level's place in the walk, so the panel and its tests read the same answer the pricing walk does.
 *
 * @module @mj-biz-apps/orders-ng
 */
import {
    AllowedValuesFor,
    ResolveEffectiveOptions,
    type EffectiveProductOption,
    type ProductOptionAssignmentRow,
    type ProductOptionCatalog,
    type ProductOptionRow,
    type ProductOptionSourceLevel,
} from '@mj-biz-apps/orders-entities';

export type OptionLevel = ProductOptionSourceLevel;

/** Where the record the panel sits on stands in the walk. */
export interface OptionLevelScope {
    Level: OptionLevel;
    /** The product type, category or product ID. */
    ID: string;
    /** The company that owns the record; null for a product type, which every company shares. */
    CompanyID: string | null;
    /** The product's type, for a product. Categories span types, so a category has none. */
    ProductTypeID: string | null;
    /**
     * The categories above this level, nearest first: a product's own category and its ancestors,
     * or a category's parent and its ancestors. Empty for a product type.
     */
    CategoryChainAbove: readonly string[];
}

export type OptionRowStatus = 'Assigned' | 'Excluded' | 'Inherited';

export interface OptionRowView {
    Option: ProductOptionRow;
    /** The assignment at this level, if any. */
    Own: ProductOptionAssignmentRow | null;
    /** What the levels above give for this option, before this level's row. */
    Inherited: EffectiveProductOption | null;
    Status: OptionRowStatus;
    /** "from Hosting" for an inherited row or one this level excludes; '' for this level's own. */
    InheritedFrom: string;
    IsRequired: boolean;
    DefaultLabel: string;
    /** "All values" or the allowed labels. */
    ValuesText: string;
}

const key = (id: string | null | undefined): string => (id ?? '').trim().toLowerCase();

/** True when the assignment hangs on this level's record. */
export function IsOwnAssignment(a: ProductOptionAssignmentRow, scope: OptionLevelScope): boolean {
    const at = scope.Level === 'Type' ? a.ProductTypeID : scope.Level === 'Category' ? a.ProductCategoryID : a.ProductID;
    return !!at && key(at) === key(scope.ID);
}

/** The options the levels above this one give, after inheritance. */
export function InheritedOptions(scope: OptionLevelScope, catalog: ProductOptionCatalog): EffectiveProductOption[] {
    if (scope.Level === 'Type') return [];
    return ResolveEffectiveOptions(
        { ProductID: null, ProductTypeID: scope.Level === 'Product' ? scope.ProductTypeID : null, CategoryChainNearestFirst: scope.CategoryChainAbove },
        catalog,
    );
}

/**
 * The rows the panel lists: this level's own assignments (assigned or excluded) and every inherited
 * option this level does not override, in the walk's display order.
 *
 * `sourceName` names the type or category an inherited option comes from.
 */
export function BuildOptionRows(
    scope: OptionLevelScope,
    catalog: ProductOptionCatalog,
    sourceName: (level: OptionLevel, id: string) => string,
): OptionRowView[] {
    const inherited = InheritedOptions(scope, catalog);
    const inheritedByOption = new Map(inherited.map((e) => [key(e.Option.ID), e]));
    const own = catalog.Assignments.filter((a) => a.Role !== 'Variant' && IsOwnAssignment(a, scope));
    const optionByID = new Map(catalog.Options.map((o) => [key(o.ID), o]));
    const rows: OptionRowView[] = [];
    const from = (e: EffectiveProductOption | null): string => (e ? `from ${sourceName(e.Source, e.SourceID)}` : '');

    for (const a of own) {
        const option = optionByID.get(key(a.ProductOptionID));
        if (!option) continue;
        const above = inheritedByOption.get(key(option.ID)) ?? null;
        const values = AllowedValuesFor(a, catalog);
        const listed = catalog.AssignmentValues.some((av) => key(av.ProductOptionAssignmentID) === key(a.ID));
        const def = a.DefaultProductOptionValueID ? values.find((v) => key(v.ID) === key(a.DefaultProductOptionValueID)) : undefined;
        rows.push({
            Option: option,
            Own: a,
            Inherited: above,
            Status: a.IsExcluded ? 'Excluded' : 'Assigned',
            InheritedFrom: a.IsExcluded ? from(above) : '',
            IsRequired: !a.IsExcluded && !!a.IsRequired,
            DefaultLabel: a.IsExcluded ? '' : def?.Label ?? '',
            ValuesText: a.IsExcluded ? '' : listed ? values.map((v) => v.Label).join(', ') || 'No active values' : 'All values',
        });
    }
    for (const e of inherited) {
        if (own.some((a) => key(a.ProductOptionID) === key(e.Option.ID))) continue;
        const listed = catalog.AssignmentValues.some((av) => key(av.ProductOptionAssignmentID) === key(e.Assignment.ID));
        rows.push({
            Option: e.Option,
            Own: null,
            Inherited: e,
            Status: 'Inherited',
            InheritedFrom: from(e),
            IsRequired: e.IsRequired,
            DefaultLabel: e.Default?.Label ?? '',
            ValuesText: listed ? e.Values.map((v) => v.Label).join(', ') : 'All values',
        });
    }
    return rows.sort(
        (a, b) =>
            ((a.Own ?? a.Inherited?.Assignment)?.SortOrder ?? 0) - ((b.Own ?? b.Inherited?.Assignment)?.SortOrder ?? 0) ||
            (a.Option.SortOrder ?? 0) - (b.Option.SortOrder ?? 0) ||
            a.Option.Name.localeCompare(b.Option.Name),
    );
}

/**
 * The options this level may assign that it does not assign yet. A product type is shared by every
 * company, so it may assign only shared options (CompanyID null); a category or product may assign a
 * shared option or one of its own company's. Inactive options are not offered.
 */
export function AssignableOptions(scope: OptionLevelScope, catalog: ProductOptionCatalog): ProductOptionRow[] {
    const taken = new Set(catalog.Assignments.filter((a) => IsOwnAssignment(a, scope)).map((a) => key(a.ProductOptionID)));
    return catalog.Options.filter((o) => {
        if (!o.IsActive || taken.has(key(o.ID))) return false;
        if (!o.CompanyID) return true;
        return scope.Level !== 'Type' && !!scope.CompanyID && key(o.CompanyID) === key(scope.CompanyID);
    }).sort((a, b) => (a.SortOrder ?? 0) - (b.SortOrder ?? 0) || a.Name.localeCompare(b.Name));
}
