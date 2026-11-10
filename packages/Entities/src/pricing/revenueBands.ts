/**
 * Revenue bands as price rows: read and write the `Applicability` a band row carries, and reason
 * about a product's ladder of bands.
 *
 * A band row's Applicability is one shape, the one the Pricing panel's band editor writes and the
 * resolver reads (`docs/HOW_THE_SYSTEM_WORKS.md` §6):
 *
 *     {"logic":"and","filters":[
 *       {"field":"BillToOrganizationRevenue.AnnualRevenue","operator":"gte","value":2000000},
 *       {"field":"BillToOrganizationRevenue.AnnualRevenue","operator":"lt","value":5000000}]}
 *
 * Lower edge inclusive, upper edge exclusive, either edge open. `ParseRevenueBand` recognises that
 * shape and nothing else: a When that tests revenue together with another field, or with another
 * operator, is a When, not a band, and callers treat it as one (the collision check stays
 * conservative, the editor shows it as a card). Each product keeps its own edges; nothing here
 * assumes a shared band list.
 */
import { FormatRevenue, ORGANIZATION_REVENUE_SOURCE } from './organizationRevenue.js';
import { IsCompositeFilter, type CompositeFilterDescriptor, type FilterDescriptor } from './mj-filter-eval.js';

/** The one field a band row tests. */
export const REVENUE_BAND_FIELD = `${ORGANIZATION_REVENUE_SOURCE}.AnnualRevenue`;

/** A band's revenue range in USD: `Min` inclusive, `Max` exclusive, null for an open edge. */
export interface RevenueBandRange {
    Min: number | null;
    Max: number | null;
}

/**
 * The band a row's Applicability describes, or null when the row is not a (pure) revenue band.
 * Invalid JSON is null too: the catalog check that refuses broken JSON lives elsewhere.
 */
export function ParseRevenueBand(applicabilityJson: string | null | undefined): RevenueBandRange | null {
    if (applicabilityJson == null || String(applicabilityJson).trim() === '') return null;
    let filter: CompositeFilterDescriptor | FilterDescriptor;
    try {
        filter = JSON.parse(String(applicabilityJson)) as CompositeFilterDescriptor | FilterDescriptor;
    } catch {
        return null;
    }
    const leaves: FilterDescriptor[] = [];
    if (IsCompositeFilter(filter)) {
        if (filter.logic !== 'and') return null;
        for (const f of filter.filters ?? []) {
            if (f == null || IsCompositeFilter(f)) return null;
            leaves.push(f);
        }
    } else if (filter && typeof filter === 'object') {
        leaves.push(filter);
    } else {
        return null;
    }
    if (leaves.length === 0 || leaves.length > 2) return null;

    let min: number | null = null;
    let max: number | null = null;
    for (const leaf of leaves) {
        if ((leaf.field ?? '').trim() !== REVENUE_BAND_FIELD) return null;
        const value = Number(leaf.value);
        if (!Number.isFinite(value)) return null;
        if (leaf.operator === 'gte') {
            if (min != null) return null;
            min = value;
        } else if (leaf.operator === 'lt') {
            if (max != null) return null;
            max = value;
        } else {
            return null;
        }
    }
    if (min != null && max != null && min >= max) return null;
    return { Min: min, Max: max };
}

/** The Applicability JSON for a band, or null for a band open at both ends (which applies to everyone). */
export function BuildRevenueBandApplicability(range: RevenueBandRange): string | null {
    const filters: FilterDescriptor[] = [];
    if (range.Min != null) filters.push({ field: REVENUE_BAND_FIELD, operator: 'gte', value: range.Min });
    if (range.Max != null) filters.push({ field: REVENUE_BAND_FIELD, operator: 'lt', value: range.Max });
    if (filters.length === 0) return null;
    const composite: CompositeFilterDescriptor = { logic: 'and', filters };
    return JSON.stringify(composite);
}

/**
 * The name a band row gets by default: `Under $2M rev`, `$2M-$5M rev`, `$250M+ rev`. A row's Name
 * is the rep-facing label in the price picker and the price trail, and `UX_ProductPrice_Product_Name`
 * keeps it unique per product, so the editor only proposes this; the person may change it.
 */
export function RevenueBandName(range: RevenueBandRange): string {
    const min = range.Min ?? 0;
    if (range.Max == null) return min <= 0 ? 'Any revenue' : `${FormatRevenue(min)}+ rev`;
    if (min <= 0) return `Under ${FormatRevenue(range.Max)} rev`;
    return `${FormatRevenue(min)}-${FormatRevenue(range.Max)} rev`;
}

/**
 * `name` if no row already uses it, else `name (2)`, `name (3)`, …: the first free one.
 * `UX_ProductPrice_Product_Name` is unique on (ProductID, Name) whatever the price list or status, so
 * the same ladder on a second price list, or a band re-added where a deactivated one with the same
 * range still exists, would otherwise fail on the index. Comparison ignores case and surrounding
 * whitespace, as the index's collation does.
 */
export function UniquePriceName(name: string, taken: Iterable<string | null | undefined>): string {
    const used = new Set<string>();
    for (const t of taken) {
        if (t != null && String(t).trim() !== '') used.add(String(t).trim().toLowerCase());
    }
    const base = name.trim();
    if (!used.has(base.toLowerCase())) return base;
    for (let n = 2; ; n++) {
        const candidate = `${base} (${n})`;
        if (!used.has(candidate.toLowerCase())) return candidate;
    }
}

/** The columns the one price order reads. A `ProductPrice` entity or a `simple` row both fit. */
export interface PriceOrderRow {
    Priority?: number | string | null;
    Applicability?: string | null;
    Name?: string | null;
    Description?: string | null;
}

/**
 * The one order prices are listed in everywhere they are listed (the Pricing panel's cards and
 * simulation, the product Overview): highest priority first, since that is what wins; within a
 * priority, revenue bands lowest band first so a ladder reads top to bottom, ahead of rows that are
 * not bands; then by name. Save order, which is what rows come back in, means nothing to a reader.
 */
export function ComparePriceRows(a: PriceOrderRow, b: PriceOrderRow): number {
    const byPriority = (Number(b.Priority) || 0) - (Number(a.Priority) || 0);
    if (byPriority !== 0) return byPriority;
    const am = ParseRevenueBand(a.Applicability)?.Min ?? null;
    const bm = ParseRevenueBand(b.Applicability)?.Min ?? null;
    if (am != null || bm != null) return (am ?? -Infinity) - (bm ?? -Infinity);
    return priceOrderName(a).localeCompare(priceOrderName(b));
}

function priceOrderName(row: PriceOrderRow): string {
    return row.Name?.trim() || row.Description?.trim() || 'Price';
}

/**
 * Whether a row's Applicability tests the bill-to organization's revenue anywhere, alone or together
 * with other fields, at any depth. A row that does cannot be decided for a customer with no revenue on
 * file, whether or not it is a pure band (`ParseRevenueBand` recognises only the pure shape). Invalid
 * JSON is false: the catalog check that refuses it lives elsewhere.
 */
export function ApplicabilityNeedsRevenue(applicabilityJson: string | null | undefined): boolean {
    if (applicabilityJson == null || String(applicabilityJson).trim() === '') return false;
    let filter: CompositeFilterDescriptor | FilterDescriptor;
    try {
        filter = JSON.parse(String(applicabilityJson)) as CompositeFilterDescriptor | FilterDescriptor;
    } catch {
        return false;
    }
    const prefix = `${ORGANIZATION_REVENUE_SOURCE}.`;
    const walk = (f: CompositeFilterDescriptor | FilterDescriptor | null | undefined): boolean => {
        if (f == null || typeof f !== 'object') return false;
        if (IsCompositeFilter(f)) return (f.filters ?? []).some(walk);
        return (f.field ?? '').trim().startsWith(prefix);
    };
    return walk(filter);
}

/** The order field a price limited to orders created before a moment tests. */
export const ORDER_CREATED_FIELD = 'Order.__mj_CreatedAt';

/**
 * When a row applies only to orders created before some moment, that moment; otherwise null.
 *
 * This is how a price change keeps what was already quoted: the old row stays Active, limited by
 * `Order.__mj_CreatedAt lt <cutover>` (alongside its band, if any), at a priority above the row that
 * replaces it. Every order created before the cutover keeps resolving the old price, at confirm too,
 * where a won deal's order is re-priced as of its close date. No order created later can match it, so
 * once the cutover has passed the row is closed to new sales and the catalog screens treat it as
 * retired. Read at the top level only (a bare rule, or an `and` of rules), which is the shape the
 * row is written in; anything else is null, so an unusual rule is shown rather than hidden.
 */
export function OlderOrdersCutoff(applicabilityJson: string | null | undefined): Date | null {
    if (applicabilityJson == null || String(applicabilityJson).trim() === '') return null;
    let filter: CompositeFilterDescriptor | FilterDescriptor;
    try {
        filter = JSON.parse(String(applicabilityJson)) as CompositeFilterDescriptor | FilterDescriptor;
    } catch {
        return null;
    }
    let leaves: FilterDescriptor[];
    if (IsCompositeFilter(filter)) {
        if (filter.logic !== 'and') return null;
        leaves = (filter.filters ?? []).filter((f): f is FilterDescriptor => f != null && !IsCompositeFilter(f));
    } else {
        leaves = [filter];
    }
    const rule = leaves.find((f) => (f.field ?? '').trim() === ORDER_CREATED_FIELD && f.operator === 'lt');
    if (!rule) return null;
    const value = rule.value as unknown;
    const at = value instanceof Date ? value : typeof value === 'number' ? new Date(value) : typeof value === 'string' ? new Date(value) : null;
    return at && !Number.isNaN(at.getTime()) ? at : null;
}

/** `$2M – $5M`, `Under $2M`, `$250M and up`: the range as the band editor shows it. */
export function RevenueBandRangeText(range: RevenueBandRange): string {
    const min = range.Min ?? 0;
    if (range.Max == null) return min <= 0 ? 'Any revenue' : `${FormatRevenue(min)} and up`;
    if (min <= 0) return `Under ${FormatRevenue(range.Max)}`;
    return `${FormatRevenue(min)} – ${FormatRevenue(range.Max)}`;
}

/** Can an organization's revenue fall in both bands? Half-open ranges, so `[0,2M)` and `[2M,5M)` do not overlap. */
export function RevenueBandsOverlap(a: RevenueBandRange, b: RevenueBandRange): boolean {
    const lo = Math.max(a.Min ?? -Infinity, b.Min ?? -Infinity);
    const hi = Math.min(a.Max ?? Infinity, b.Max ?? Infinity);
    return lo < hi;
}

/** A hole or a double cover in a ladder, as the editor reports it. */
export interface RevenueLadderIssue {
    Kind: 'gap' | 'overlap';
    /** Revenue from which the issue starts. */
    From: number;
    /** Revenue at which it ends, null when it runs to the top. */
    To: number | null;
}

/**
 * Where a ladder leaves revenue unpriced or priced twice. Bands sort by lower edge; a ladder whose
 * first band does not start at zero leaves small organizations unpriced, which is a gap too. A
 * ladder that ends with a closed band leaves large organizations unpriced, reported as a gap to the
 * top. These are warnings for the person editing, not refusals: a product may price only part of
 * the market on purpose.
 */
export function DescribeRevenueLadder(ranges: readonly RevenueBandRange[]): RevenueLadderIssue[] {
    const sorted = [...ranges].sort((a, b) => (a.Min ?? -Infinity) - (b.Min ?? -Infinity));
    const issues: RevenueLadderIssue[] = [];
    if (sorted.length === 0) return issues;
    const first = sorted[0].Min ?? 0;
    if (first > 0) issues.push({ Kind: 'gap', From: 0, To: first });
    let coveredTo: number | null = sorted[0].Max; // null = open above
    for (let i = 1; i < sorted.length; i++) {
        const band = sorted[i];
        const start = band.Min ?? 0;
        if (coveredTo == null) {
            issues.push({ Kind: 'overlap', From: start, To: band.Max });
        } else if (start > coveredTo) {
            issues.push({ Kind: 'gap', From: coveredTo, To: start });
        } else if (start < coveredTo) {
            issues.push({ Kind: 'overlap', From: start, To: band.Max == null ? coveredTo : Math.min(coveredTo, band.Max) });
        }
        if (coveredTo != null && (band.Max == null || band.Max > coveredTo)) coveredTo = band.Max;
    }
    if (coveredTo != null) issues.push({ Kind: 'gap', From: coveredTo, To: null });
    return issues;
}

/** `Gap: $5M – $10M`, `Overlap: $2M – $5M`, `Gap: $250M and up`. */
export function DescribeRevenueLadderIssue(issue: RevenueLadderIssue): string {
    const label = issue.Kind === 'gap' ? 'Gap' : 'Overlap';
    return `${label}: ${RevenueBandRangeText({ Min: issue.From, Max: issue.To })}`;
}

/**
 * Edges the band editor proposes for a new ladder, in USD. Ten bands from "Under $2M" to "$250M+":
 * the ladder AIDP Next's price book uses across its offerings. A default for the editor's setup
 * form, not a rule: the person edits the edges before any row is written.
 */
export const DEFAULT_REVENUE_BAND_EDGES: readonly number[] = [
    0, 2_000_000, 5_000_000, 10_000_000, 25_000_000, 50_000_000, 75_000_000, 100_000_000, 150_000_000, 250_000_000,
];

/**
 * Contiguous half-open bands from ascending lower edges: `[0, 2M, 5M]` gives `[0,2M)`, `[2M,5M)`,
 * `[5M, ∞)`. Edges are sorted and de-duplicated first; fewer than one edge gives no band.
 */
export function RevenueBandsFromEdges(edges: readonly number[]): RevenueBandRange[] {
    const sorted = [...new Set(edges.filter((e) => Number.isFinite(e) && e >= 0))].sort((a, b) => a - b);
    return sorted.map((min, i) => ({ Min: min, Max: i + 1 < sorted.length ? sorted[i + 1] : null }));
}
