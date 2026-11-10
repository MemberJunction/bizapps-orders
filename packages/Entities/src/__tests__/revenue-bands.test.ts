import { describe, expect, it } from 'vitest';
import {
    BuildRevenueBandApplicability,
    DEFAULT_REVENUE_BAND_EDGES,
    DescribeRevenueLadder,
    DescribeRevenueLadderIssue,
    ParseRevenueBand,
    REVENUE_BAND_FIELD,
    RevenueBandName,
    RevenueBandRangeText,
    RevenueBandsFromEdges,
    RevenueBandsOverlap,
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
