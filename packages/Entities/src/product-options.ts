/**
 * Product options: Tier, Size and other choices a buyer makes on a line.
 *
 * Which options a product offers is inherited: assignments on the product type, on each category
 * from the root down to the product's own, and on the product. For each option the most specific
 * assignment wins whole (its required flag, default and allowed values together); it does not merge
 * column by column. `IsExcluded` removes an inherited option at that level and below, until a more
 * specific assignment offers it again.
 *
 * Picks are stored in `OrderLineChoice` with `GroupKey` = option code and `OptionValue` = value code,
 * plus `ProductOptionID` / `ProductOptionValueID`. Renewals and conditional entitlement templates
 * already read that table, so they work for options unchanged.
 *
 * Everything here is pure: callers pass rows (from `OrdersEngine` or a test), so the browser and the
 * server resolve the same answer.
 *
 * @module @mj-biz-apps/orders-entities
 */
import {
    IsCompositeFilter,
    ParseFilterField,
    type CompositeFilterDescriptor,
    type FilterDescriptor,
} from './pricing/mj-filter-eval';

/** Applicability source a price rule tests picks with: `Option.<OptionCode>` eq `<ValueCode>`. */
export const OPTION_SOURCE = 'Option';

const uuidKey = (id: string | null | undefined): string => (id ?? '').trim().toLowerCase();
const codeKey = (code: string | null | undefined): string => (code ?? '').trim().toLowerCase();

export interface ProductOptionRow {
    ID: string;
    CompanyID: string | null;
    Code: string;
    Name: string;
    SortOrder: number;
    IsActive: boolean;
}

export interface ProductOptionValueRow {
    ID: string;
    ProductOptionID: string;
    Code: string;
    Label: string;
    SortOrder: number;
    IsActive: boolean;
}

export interface ProductOptionAssignmentRow {
    ID: string;
    ProductTypeID: string | null;
    ProductCategoryID: string | null;
    ProductID: string | null;
    ProductOptionID: string;
    IsExcluded: boolean;
    IsRequired: boolean;
    DefaultProductOptionValueID: string | null;
    SortOrder: number;
    Role: string;
}

export interface ProductOptionAssignmentValueRow {
    ProductOptionAssignmentID: string;
    ProductOptionValueID: string;
}

/** The option catalog, as `OrdersEngine` caches it. */
export interface ProductOptionCatalog {
    Options: readonly ProductOptionRow[];
    Values: readonly ProductOptionValueRow[];
    Assignments: readonly ProductOptionAssignmentRow[];
    AssignmentValues: readonly ProductOptionAssignmentValueRow[];
}

/** Where a product's product type and categories sit, for the walk. */
export interface ProductOptionScope {
    ProductID: string | null;
    ProductTypeID: string | null;
    /** The product's category and its ancestors, nearest first (`OrdersEngine.CategoryChain`). */
    CategoryChainNearestFirst: readonly string[];
}

export type ProductOptionSourceLevel = 'Type' | 'Category' | 'Product';

/** One option a product offers, after inheritance. */
export interface EffectiveProductOption {
    Option: ProductOptionRow;
    /** The assignment that won. */
    Assignment: ProductOptionAssignmentRow;
    /** The level the winning assignment sits on, for "inherited from" in the screens. */
    Source: ProductOptionSourceLevel;
    /** ID of the type, category or product the winning assignment hangs on. */
    SourceID: string;
    IsRequired: boolean;
    /** Allowed, active values in display order. */
    Values: ProductOptionValueRow[];
    /** The default value, when set and still allowed. */
    Default: ProductOptionValueRow | null;
}

/** A pick as recorded on a line, or passed for a line not saved yet. */
export interface OptionPick {
    ProductOptionID: string | null | undefined;
    ProductOptionValueID: string | null | undefined;
    GroupKey?: string | null;
    OptionValue?: string | null;
}

/**
 * The options a product (or, with `ProductID` null, a category or type) offers.
 *
 * Rank: product -1, category at its distance from the product's own category, type below the root.
 * The lowest rank per option wins. A winner that is excluded, is a `Variant` role (variant SKUs are
 * not picked on the line), or names an inactive option drops the option.
 */
export function ResolveEffectiveOptions(scope: ProductOptionScope, catalog: ProductOptionCatalog): EffectiveProductOption[] {
    const productKey = uuidKey(scope.ProductID);
    const typeKey = uuidKey(scope.ProductTypeID);
    const catRank = new Map(scope.CategoryChainNearestFirst.map((id, i) => [uuidKey(id), i]));
    const typeRank = scope.CategoryChainNearestFirst.length;

    const rankOf = (a: ProductOptionAssignmentRow): number => {
        if (a.ProductID) return productKey && uuidKey(a.ProductID) === productKey ? -1 : Number.POSITIVE_INFINITY;
        if (a.ProductCategoryID) return catRank.get(uuidKey(a.ProductCategoryID)) ?? Number.POSITIVE_INFINITY;
        if (a.ProductTypeID) return typeKey && uuidKey(a.ProductTypeID) === typeKey ? typeRank : Number.POSITIVE_INFINITY;
        return Number.POSITIVE_INFINITY;
    };

    const winners = new Map<string, { rank: number; row: ProductOptionAssignmentRow }>();
    for (const row of catalog.Assignments) {
        const rank = rankOf(row);
        if (!Number.isFinite(rank)) continue;
        const key = uuidKey(row.ProductOptionID);
        const current = winners.get(key);
        if (!current || rank < current.rank) winners.set(key, { rank, row });
    }

    const optionByID = new Map(catalog.Options.map((o) => [uuidKey(o.ID), o]));
    const out: EffectiveProductOption[] = [];
    for (const { row } of winners.values()) {
        if (row.IsExcluded || row.Role === 'Variant') continue;
        const option = optionByID.get(uuidKey(row.ProductOptionID));
        if (!option || !option.IsActive) continue;
        const values = AllowedValuesFor(row, catalog);
        const def = row.DefaultProductOptionValueID
            ? values.find((v) => uuidKey(v.ID) === uuidKey(row.DefaultProductOptionValueID)) ?? null
            : null;
        out.push({
            Option: option,
            Assignment: row,
            Source: row.ProductID ? 'Product' : row.ProductCategoryID ? 'Category' : 'Type',
            SourceID: (row.ProductID ?? row.ProductCategoryID ?? row.ProductTypeID) as string,
            IsRequired: !!row.IsRequired,
            Values: values,
            Default: def,
        });
    }
    return out.sort(
        (a, b) =>
            (a.Assignment.SortOrder ?? 0) - (b.Assignment.SortOrder ?? 0) ||
            (a.Option.SortOrder ?? 0) - (b.Option.SortOrder ?? 0) ||
            a.Option.Name.localeCompare(b.Option.Name),
    );
}

/** The active values an assignment allows: its listed values, or every active value of the option. */
export function AllowedValuesFor(assignment: ProductOptionAssignmentRow, catalog: ProductOptionCatalog): ProductOptionValueRow[] {
    const optionKey = uuidKey(assignment.ProductOptionID);
    const ofOption = catalog.Values.filter((v) => uuidKey(v.ProductOptionID) === optionKey && v.IsActive);
    const listed = new Set(
        catalog.AssignmentValues
            .filter((av) => uuidKey(av.ProductOptionAssignmentID) === uuidKey(assignment.ID))
            .map((av) => uuidKey(av.ProductOptionValueID)),
    );
    const allowed = listed.size ? ofOption.filter((v) => listed.has(uuidKey(v.ID))) : ofOption;
    return [...allowed].sort((a, b) => (a.SortOrder ?? 0) - (b.SortOrder ?? 0) || a.Label.localeCompare(b.Label));
}

/** Only the picks that answer a product option (widget choices have no `ProductOptionID`). */
export function OptionPicksOnly<T extends OptionPick>(picks: readonly T[] | null | undefined): T[] {
    return (picks ?? []).filter((p) => !!p.ProductOptionID);
}

/**
 * Why a line's option picks are not acceptable, one message per problem; empty when they are.
 *
 * - every required effective option has a pick;
 * - every pick is for an option the product offers, with an allowed, active value;
 * - one pick per option.
 */
export function CheckOptionPicks(effective: readonly EffectiveProductOption[], picks: readonly OptionPick[]): string[] {
    const problems: string[] = [];
    const byOption = new Map(effective.map((e) => [uuidKey(e.Option.ID), e]));
    const seen = new Set<string>();
    for (const pick of OptionPicksOnly(picks)) {
        const key = uuidKey(pick.ProductOptionID);
        const eff = byOption.get(key);
        if (!eff) {
            problems.push(`${pick.GroupKey || 'An option'} is not offered on this product.`);
            continue;
        }
        if (seen.has(key)) {
            problems.push(`${eff.Option.Name} has more than one pick; choose one value.`);
            continue;
        }
        seen.add(key);
        if (!eff.Values.some((v) => uuidKey(v.ID) === uuidKey(pick.ProductOptionValueID))) {
            problems.push(`${pick.OptionValue || 'That value'} is not an available ${eff.Option.Name} for this product.`);
        }
    }
    for (const eff of effective) {
        if (eff.IsRequired && !seen.has(uuidKey(eff.Option.ID))) problems.push(`Pick a ${eff.Option.Name}.`);
    }
    return problems;
}

/** Required options with no pick, by name. */
export function MissingRequiredOptions(effective: readonly EffectiveProductOption[], picks: readonly OptionPick[]): string[] {
    const picked = new Set(OptionPicksOnly(picks).map((p) => uuidKey(p.ProductOptionID)));
    return effective.filter((e) => e.IsRequired && !picked.has(uuidKey(e.Option.ID))).map((e) => e.Option.Name);
}

/**
 * The `Option` record of the applicability bag: option code -> picked value code.
 * Widget choices are left out; they are not product options.
 */
export function OptionApplicabilityRecord(picks: readonly OptionPick[] | null | undefined): Record<string, string> {
    const out: Record<string, string> = {};
    for (const p of OptionPicksOnly(picks)) {
        if (p.GroupKey && p.OptionValue) out[p.GroupKey] = p.OptionValue;
    }
    return out;
}

/** The picks a new line starts with: each effective option's default, when it has one. */
export function DefaultOptionPicks(effective: readonly EffectiveProductOption[]): Required<OptionPick>[] {
    return effective
        .filter((e) => e.Default)
        .map((e) => ({
            ProductOptionID: e.Option.ID,
            ProductOptionValueID: (e.Default as ProductOptionValueRow).ID,
            GroupKey: e.Option.Code,
            OptionValue: (e.Default as ProductOptionValueRow).Code,
        }));
}

/** Parsed `Applicability`, or null for empty or malformed JSON. */
function parseFilter(json: string | null | undefined): CompositeFilterDescriptor | FilterDescriptor | null {
    if (json == null || String(json).trim() === '') return null;
    try {
        return JSON.parse(String(json)) as CompositeFilterDescriptor | FilterDescriptor;
    } catch {
        return null;
    }
}

function walkLeaves(filter: CompositeFilterDescriptor | FilterDescriptor | null, visit: (leaf: FilterDescriptor) => void): void {
    if (!filter) return;
    if (IsCompositeFilter(filter)) {
        for (const f of filter.filters ?? []) walkLeaves(f, visit);
        return;
    }
    visit(filter);
}

/** Option codes a price rule's `Applicability` tests. */
export function OptionCodesInApplicability(json: string | null | undefined): string[] {
    const codes = new Set<string>();
    walkLeaves(parseFilter(json), (leaf) => {
        const { source, name } = ParseFilterField(leaf.field);
        if (source === OPTION_SOURCE && name) codes.add(name);
    });
    return [...codes];
}

/** Whether a price rule's `Applicability` tests a pick. */
export function IsOptionApplicability(json: string | null | undefined): boolean {
    return OptionCodesInApplicability(json).length > 0;
}

/**
 * The `Option.<code> eq <value>` conditions a rule requires, when every one of them is required
 * (a single leaf, or leaves under a top-level `and`). Null when the rule has an `or` at the top or
 * tests no option; such a rule cannot be proven disjoint from another by its picks.
 */
export function RequiredOptionEquals(json: string | null | undefined): Map<string, Set<string>> | null {
    const filter = parseFilter(json);
    if (!filter) return null;
    const leaves: (FilterDescriptor | CompositeFilterDescriptor)[] = IsCompositeFilter(filter)
        ? filter.logic === 'and' || (filter.filters ?? []).length === 1
            ? filter.filters ?? []
            : []
        : [filter];
    const out = new Map<string, Set<string>>();
    for (const leaf of leaves) {
        if (leaf == null || IsCompositeFilter(leaf)) continue;
        const { source, name } = ParseFilterField(leaf.field);
        if (source !== OPTION_SOURCE || leaf.operator !== 'eq' || leaf.value == null) continue;
        const key = codeKey(name);
        const values = out.get(key) ?? new Set<string>();
        values.add(codeKey(String(leaf.value)));
        out.set(key, values);
    }
    return out.size ? out : null;
}

/**
 * True when no line can satisfy both rules because they require different values of one option
 * (`TIER eq PRO` vs `TIER eq STANDARD`). Equal-priority rules that are disjoint this way are a price
 * matrix, not a collision.
 */
export function OptionConditionsDisjoint(a: string | null | undefined, b: string | null | undefined): boolean {
    const ea = RequiredOptionEquals(a);
    const eb = RequiredOptionEquals(b);
    if (!ea || !eb) return false;
    for (const [code, valuesA] of ea) {
        const valuesB = eb.get(code);
        if (!valuesB) continue;
        // Every required value of both rules must be the one picked; two different ones cannot both hold.
        const all = new Set([...valuesA, ...valuesB]);
        if (all.size > 1) return true;
    }
    return false;
}
