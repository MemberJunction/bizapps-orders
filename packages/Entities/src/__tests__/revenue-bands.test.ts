import { describe, expect, it } from 'vitest';
import {
    ApplicabilityNeedsRevenue,
    BuildRevenueBandApplicability,
    ComparePriceRows,
    DEFAULT_REVENUE_BAND_EDGES,
    DescribeRevenueLadder,
    DescribeRevenueLadderIssue,
    OlderOrdersCutoff,
    ORDER_CREATED_FIELD,
    ParseRevenueBand,
    REVENUE_BAND_FIELD,
    RevenueBandName,
    RevenueBandRangeText,
    RevenueBandsFromEdges,
    RevenueBandsOverlap,
    UniquePriceName,
} from '../pricing/revenueBands.js';
import { priceApplies } from '../pricing/applicability.js';

const M = 1_000_000;

describe('ParseRevenueBand', () => {
    it('reads the shape the editor writes, both edges', () => {
        const json = BuildRevenueBandApplicability({ Min: 2 * M, Max: 5 * M });
        expect(ParseRevenueBand(json)).toEqual({ Min: 2 * M, Max: 5 * M });
    });

    it('reads an open lower or upper edge', () => {
        expect(ParseRevenueBand(BuildRevenueBandApplicability({ Min: null, Max: 2 * M }))).toEqual({ Min: null, Max: 2 * M });
        expect(ParseRevenueBand(BuildRevenueBandApplicability({ Min: 250 * M, Max: null }))).toEqual({ Min: 250 * M, Max: null });
    });

    it('reads a single rule without a composite wrapper', () => {
        const json = JSON.stringify({ field: REVENUE_BAND_FIELD, operator: 'gte', value: 100 * M });
        expect(ParseRevenueBand(json)).toEqual({ Min: 100 * M, Max: null });
    });

    it('reads numeric strings, as a hand-edited row may hold', () => {
        const json = JSON.stringify({
            logic: 'and',
            filters: [
                { field: REVENUE_BAND_FIELD, operator: 'gte', value: '2000000' },
                { field: REVENUE_BAND_FIELD, operator: 'lt', value: '5000000' },
            ],
        });
        expect(ParseRevenueBand(json)).toEqual({ Min: 2 * M, Max: 5 * M });
    });

    it('is null for empty, blank and invalid JSON', () => {
        expect(ParseRevenueBand(null)).toBeNull();
        expect(ParseRevenueBand('')).toBeNull();
        expect(ParseRevenueBand('   ')).toBeNull();
        expect(ParseRevenueBand('{not json')).toBeNull();
    });

    it('is null for a When that is not a pure band', () => {
        // another field alongside revenue
        expect(
            ParseRevenueBand(
                JSON.stringify({
                    logic: 'and',
                    filters: [
                        { field: REVENUE_BAND_FIELD, operator: 'gte', value: 0 },
                        { field: 'BillToOrganization.Status', operator: 'eq', value: 'Active' },
                    ],
                }),
            ),
        ).toBeNull();
        // OR logic
        expect(
            ParseRevenueBand(
                JSON.stringify({
                    logic: 'or',
                    filters: [{ field: REVENUE_BAND_FIELD, operator: 'gte', value: 0 }],
                }),
            ),
        ).toBeNull();
        // operators the band contract does not use
        expect(ParseRevenueBand(JSON.stringify({ field: REVENUE_BAND_FIELD, operator: 'gt', value: 5 }))).toBeNull();
        expect(ParseRevenueBand(JSON.stringify({ field: REVENUE_BAND_FIELD, operator: 'lte', value: 5 }))).toBeNull();
        // nested composite
        expect(
            ParseRevenueBand(
                JSON.stringify({
                    logic: 'and',
                    filters: [{ logic: 'and', filters: [{ field: REVENUE_BAND_FIELD, operator: 'gte', value: 0 }] }],
                }),
            ),
        ).toBeNull();
        // two lower edges, inverted edges, non-numeric value
        expect(
            ParseRevenueBand(
                JSON.stringify({
                    logic: 'and',
                    filters: [
                        { field: REVENUE_BAND_FIELD, operator: 'gte', value: 0 },
                        { field: REVENUE_BAND_FIELD, operator: 'gte', value: 5 },
                    ],
                }),
            ),
        ).toBeNull();
        expect(ParseRevenueBand(BuildRevenueBandApplicability({ Min: 5 * M, Max: 2 * M }))).toBeNull();
        expect(ParseRevenueBand(JSON.stringify({ field: REVENUE_BAND_FIELD, operator: 'gte', value: 'lots' }))).toBeNull();
    });
});

describe('BuildRevenueBandApplicability', () => {
    it('writes what the resolver evaluates: lower inclusive, upper exclusive', () => {
        const json = BuildRevenueBandApplicability({ Min: 2 * M, Max: 5 * M });
        const applies = (revenue: number) => priceApplies(json, { BillToOrganizationRevenue: { AnnualRevenue: revenue } });
        expect(applies(2 * M)).toBe(true);
        expect(applies(4_999_999)).toBe(true);
        expect(applies(5 * M)).toBe(false);
        expect(applies(1_999_999)).toBe(false);
    });

    it('is null for a band open at both ends', () => {
        expect(BuildRevenueBandApplicability({ Min: null, Max: null })).toBeNull();
    });

    it('does not apply when the revenue is unknown', () => {
        const json = BuildRevenueBandApplicability({ Min: 0, Max: 2 * M });
        expect(priceApplies(json, { BillToOrganizationRevenue: null })).toBe(false);
    });
});

describe('RevenueBandName / RevenueBandRangeText', () => {
    it('names the three band shapes', () => {
        expect(RevenueBandName({ Min: 0, Max: 2 * M })).toBe('Under $2M rev');
        expect(RevenueBandName({ Min: null, Max: 2 * M })).toBe('Under $2M rev');
        expect(RevenueBandName({ Min: 2 * M, Max: 5 * M })).toBe('$2M-$5M rev');
        expect(RevenueBandName({ Min: 250 * M, Max: null })).toBe('$250M+ rev');
        expect(RevenueBandName({ Min: 500_000, Max: 1_500_000 })).toBe('$500K-$1.5M rev');
    });

    it('describes the range for the editor', () => {
        expect(RevenueBandRangeText({ Min: 0, Max: 2 * M })).toBe('Under $2M');
        expect(RevenueBandRangeText({ Min: 2 * M, Max: 5 * M })).toBe('$2M – $5M');
        expect(RevenueBandRangeText({ Min: 250 * M, Max: null })).toBe('$250M and up');
        expect(RevenueBandRangeText({ Min: null, Max: null })).toBe('Any revenue');
    });
});

describe('RevenueBandsOverlap', () => {
    it('treats adjacent half-open bands as disjoint', () => {
        expect(RevenueBandsOverlap({ Min: 0, Max: 2 * M }, { Min: 2 * M, Max: 5 * M })).toBe(false);
    });

    it('sees an overlap of any width', () => {
        expect(RevenueBandsOverlap({ Min: 0, Max: 2 * M + 1 }, { Min: 2 * M, Max: 5 * M })).toBe(true);
        expect(RevenueBandsOverlap({ Min: 0, Max: null }, { Min: 250 * M, Max: null })).toBe(true);
        expect(RevenueBandsOverlap({ Min: null, Max: 2 * M }, { Min: 0, Max: 1 * M })).toBe(true);
    });

    it('is symmetric', () => {
        const a = { Min: 5 * M, Max: 10 * M };
        const b = { Min: 10 * M, Max: null };
        expect(RevenueBandsOverlap(a, b)).toBe(RevenueBandsOverlap(b, a));
    });
});

describe('DescribeRevenueLadder', () => {
    it('reports nothing for a contiguous ladder that covers everything', () => {
        expect(DescribeRevenueLadder(RevenueBandsFromEdges(DEFAULT_REVENUE_BAND_EDGES))).toEqual([]);
    });

    it('reports a gap between bands, below the first and above the last', () => {
        const issues = DescribeRevenueLadder([
            { Min: 1 * M, Max: 2 * M },
            { Min: 5 * M, Max: 10 * M },
        ]);
        expect(issues).toEqual([
            { Kind: 'gap', From: 0, To: 1 * M },
            { Kind: 'gap', From: 2 * M, To: 5 * M },
            { Kind: 'gap', From: 10 * M, To: null },
        ]);
        expect(issues.map(DescribeRevenueLadderIssue)).toEqual(['Gap: Under $1M', 'Gap: $2M – $5M', 'Gap: $10M and up']);
    });

    it('reports an overlap, including one with an open band', () => {
        expect(
            DescribeRevenueLadder([
                { Min: 0, Max: 5 * M },
                { Min: 2 * M, Max: 10 * M },
                { Min: 10 * M, Max: null },
            ]),
        ).toEqual([{ Kind: 'overlap', From: 2 * M, To: 5 * M }]);
        expect(
            DescribeRevenueLadder([
                { Min: 0, Max: null },
                { Min: 50 * M, Max: null },
            ]),
        ).toEqual([{ Kind: 'overlap', From: 50 * M, To: null }]);
    });

    it('accepts bands in any order', () => {
        const ladder = RevenueBandsFromEdges([0, 2 * M, 5 * M]).reverse();
        expect(DescribeRevenueLadder(ladder)).toEqual([]);
    });
});

describe('RevenueBandsFromEdges', () => {
    it('builds contiguous bands and ends open', () => {
        expect(RevenueBandsFromEdges([0, 2 * M, 5 * M])).toEqual([
            { Min: 0, Max: 2 * M },
            { Min: 2 * M, Max: 5 * M },
            { Min: 5 * M, Max: null },
        ]);
    });

    it('sorts, de-duplicates and drops negative or non-finite edges', () => {
        expect(RevenueBandsFromEdges([5 * M, 0, 2 * M, 2 * M, -1, Number.NaN])).toEqual([
            { Min: 0, Max: 2 * M },
            { Min: 2 * M, Max: 5 * M },
            { Min: 5 * M, Max: null },
        ]);
        expect(RevenueBandsFromEdges([])).toEqual([]);
    });
});

describe('UniquePriceName', () => {
    it('keeps a name nobody holds', () => {
        expect(UniquePriceName('Under $2M rev', ['Base', '$2M-$5M rev'])).toBe('Under $2M rev');
        expect(UniquePriceName('  Under $2M rev ', [])).toBe('Under $2M rev');
    });

    it('takes the first free numbered suffix, ignoring case, so a deactivated band with the same range does not block a new one', () => {
        expect(UniquePriceName('Under $2M rev', ['under $2m rev'])).toBe('Under $2M rev (2)');
        expect(UniquePriceName('Under $2M rev', ['Under $2M rev', 'Under $2M rev (2)', null, undefined, ''])).toBe('Under $2M rev (3)');
    });
});

describe('ComparePriceRows', () => {
    const band = (min: number | null, max: number | null) => BuildRevenueBandApplicability({ Min: min, Max: max });

    it('puts the highest priority first, then bands lowest first, then names', () => {
        const rows = [
            { Name: 'Zeta', Priority: 10, Applicability: null },
            { Name: '$5M+ rev', Priority: 10, Applicability: band(5 * M, null) },
            { Name: 'Alpha', Priority: 10, Applicability: null },
            { Name: 'Under $2M rev', Priority: 10, Applicability: band(0, 2 * M) },
            { Name: 'Override', Priority: 50, Applicability: null },
        ];
        expect([...rows].sort(ComparePriceRows).map((r) => r.Name)).toEqual(['Override', 'Alpha', 'Zeta', 'Under $2M rev', '$5M+ rev']);
    });

    it('reads a missing name from the description and a missing priority as zero', () => {
        const rows = [
            { Name: null, Description: 'b', Priority: null, Applicability: null },
            { Name: '', Description: 'a', Priority: undefined, Applicability: null },
        ];
        expect([...rows].sort(ComparePriceRows).map((r) => r.Description)).toEqual(['a', 'b']);
    });
});

describe('ApplicabilityNeedsRevenue', () => {
    it('is true for a pure band and for revenue tested together with another field, at any depth', () => {
        expect(ApplicabilityNeedsRevenue(BuildRevenueBandApplicability({ Min: 0, Max: 2 * M }))).toBe(true);
        const mixed = JSON.stringify({
            logic: 'and',
            filters: [
                { field: 'BillToOrganization.OrganizationType', operator: 'eq', value: 'Member' },
                { logic: 'or', filters: [{ field: REVENUE_BAND_FIELD, operator: 'gte', value: 2 * M }] },
            ],
        });
        expect(ApplicabilityNeedsRevenue(mixed)).toBe(true);
        expect(ParseRevenueBand(mixed)).toBeNull();
    });

    it('is false for a When on other fields, an empty When and broken JSON', () => {
        expect(ApplicabilityNeedsRevenue(JSON.stringify({ logic: 'and', filters: [{ field: 'Order.OrderType', operator: 'eq', value: 'Renewal' }] }))).toBe(false);
        expect(ApplicabilityNeedsRevenue(null)).toBe(false);
        expect(ApplicabilityNeedsRevenue('  ')).toBe(false);
        expect(ApplicabilityNeedsRevenue('{not json')).toBe(false);
    });
});

describe('OlderOrdersCutoff', () => {
    const cut = Date.UTC(2026, 10, 10, 19, 8);
    const band = [
        { field: REVENUE_BAND_FIELD, operator: 'gte', value: 2 * M },
        { field: REVENUE_BAND_FIELD, operator: 'lt', value: 5 * M },
    ];

    it('reads the cutover from a band kept for older orders, and from a plain row', () => {
        const kept = JSON.stringify({ logic: 'and', filters: [...band, { field: ORDER_CREATED_FIELD, operator: 'lt', value: cut }] });
        expect(OlderOrdersCutoff(kept)?.getTime()).toBe(cut);
        expect(ParseRevenueBand(kept)).toBeNull();
        const plain = JSON.stringify({ logic: 'and', filters: [{ field: ORDER_CREATED_FIELD, operator: 'lt', value: cut }] });
        expect(OlderOrdersCutoff(plain)?.getTime()).toBe(cut);
        expect(OlderOrdersCutoff(JSON.stringify({ field: ORDER_CREATED_FIELD, operator: 'lt', value: '2026-11-10T19:08:00Z' }))?.getTime()).toBe(cut);
    });

    it('is null for a plain band, another operator, an or, an empty When and broken JSON', () => {
        expect(OlderOrdersCutoff(BuildRevenueBandApplicability({ Min: 2 * M, Max: 5 * M }))).toBeNull();
        expect(OlderOrdersCutoff(JSON.stringify({ logic: 'and', filters: [{ field: ORDER_CREATED_FIELD, operator: 'gte', value: cut }] }))).toBeNull();
        expect(OlderOrdersCutoff(JSON.stringify({ logic: 'or', filters: [{ field: ORDER_CREATED_FIELD, operator: 'lt', value: cut }] }))).toBeNull();
        expect(OlderOrdersCutoff(null)).toBeNull();
        expect(OlderOrdersCutoff('{not json')).toBeNull();
    });

    it('matches what pricing applies: older orders yes, newer orders no', () => {
        const kept = JSON.stringify({ logic: 'and', filters: [{ field: ORDER_CREATED_FIELD, operator: 'lt', value: cut }] });
        expect(priceApplies(kept, { Order: { __mj_CreatedAt: new Date(cut - 1000) } })).toBe(true);
        expect(priceApplies(kept, { Order: { __mj_CreatedAt: new Date(cut + 1000) } })).toBe(false);
        expect(priceApplies(kept, { Order: null })).toBe(false);
    });
});
