/**
 * Which dimension tags reach the ledger from an order line.
 *
 * WHY THIS IS WORTH A TEST. An order line can now carry a tag two ways — the `OrderLineDimension`
 * child rows the factory has always read, and the single pair of columns on the line itself. Every
 * way of merging them wrong is expensive and quiet:
 *
 *   - Dropping the column tag puts the defect back: the line is tagged on screen and the journal
 *     entry carries nothing, which is exactly golive #236.
 *   - Emitting both values for one axis makes accounting refuse the line
 *     (`UQ_JELDimension_Line_Dimension`), so the whole confirm fails on what looks like an
 *     unrelated error.
 *   - Treating a half-set pair as a tag sends a dimension with no value, which accounting cannot
 *     record.
 *
 * The GUID case rule matters for the same reason it does everywhere else here: SQL Server returns
 * `UNIQUEIDENTIFIER` uppercased while a browser-minted id is lower case, so a case-sensitive
 * comparison would let a duplicate axis through to the refusal above.
 */
import { describe, expect, it } from 'vitest';

import { MergeDerivedTags, MergeLineDimensions } from '../LineDimensionMerge.js';

const VENTURE = 'a1111111-1111-4111-8111-111111111111';
const PRODUCT = 'b2222222-2222-4222-8222-222222222222';
const SIDECAR = 'c3333333-3333-4333-8333-333333333333';
const ASCEND = 'd4444444-4444-4444-8444-444444444444';
const MEMBERSHIP = 'e5555555-5555-4555-8555-555555555555';

describe('MergeLineDimensions', () => {
    it('returns the child rows unchanged when the line states no tag', () => {
        const child = [{ DimensionID: VENTURE, DimensionValueID: SIDECAR }];
        expect(MergeLineDimensions({}, child)).toEqual(child);
        expect(MergeLineDimensions({ DimensionID: null, DimensionValueID: null }, child)).toEqual(child);
    });

    it('ignores a half-set pair rather than sending a dimension with no value', () => {
        const child = [{ DimensionID: VENTURE, DimensionValueID: SIDECAR }];
        expect(MergeLineDimensions({ DimensionID: PRODUCT }, child)).toEqual(child);
        expect(MergeLineDimensions({ DimensionValueID: MEMBERSHIP }, child)).toEqual(child);
    });

    it('adds the line tag alongside child rows on other axes', () => {
        const result = MergeLineDimensions(
            { DimensionID: PRODUCT, DimensionValueID: MEMBERSHIP },
            [{ DimensionID: VENTURE, DimensionValueID: SIDECAR }],
        );
        expect(result).toEqual([
            { DimensionID: VENTURE, DimensionValueID: SIDECAR },
            { DimensionID: PRODUCT, DimensionValueID: MEMBERSHIP },
        ]);
    });

    it('lets the line tag win over a child row on the SAME axis', () => {
        const result = MergeLineDimensions(
            { DimensionID: VENTURE, DimensionValueID: ASCEND },
            [{ DimensionID: VENTURE, DimensionValueID: SIDECAR }],
        );
        expect(result).toEqual([{ DimensionID: VENTURE, DimensionValueID: ASCEND }]);
    });

    it('matches the axis regardless of GUID case', () => {
        const result = MergeLineDimensions(
            { DimensionID: VENTURE.toUpperCase(), DimensionValueID: ASCEND },
            [{ DimensionID: VENTURE.toLowerCase(), DimensionValueID: SIDECAR }],
        );
        expect(result).toEqual([{ DimensionID: VENTURE.toUpperCase(), DimensionValueID: ASCEND }]);
    });

    it('never mutates the caller\'s child rows', () => {
        const child = [{ DimensionID: VENTURE, DimensionValueID: SIDECAR }];
        MergeLineDimensions({ DimensionID: VENTURE, DimensionValueID: ASCEND }, child);
        expect(child).toEqual([{ DimensionID: VENTURE, DimensionValueID: SIDECAR }]);
    });

    it('works from an empty line with no child rows at all', () => {
        expect(MergeLineDimensions({}, [])).toEqual([]);
        expect(
            MergeLineDimensions({ DimensionID: PRODUCT, DimensionValueID: MEMBERSHIP }, []),
        ).toEqual([{ DimensionID: PRODUCT, DimensionValueID: MEMBERSHIP }]);
    });
});

/**
 * Which derived tag wins when the product's mapping and a line-level rule name the same axis.
 *
 * The two normally address different axes, so the interesting case is the collision: somebody sets
 * an ARR-Type default on a product category, and the line's own subscription decision says
 * otherwise. The rule was computed from this line; the mapping is a default. Getting this backwards
 * would let a stale category default overrule what the order actually did, and nothing downstream
 * would show it.
 */
describe('MergeDerivedTags', () => {
    it('keeps both when they name different axes', () => {
        expect(
            MergeDerivedTags(
                [{ DimensionID: VENTURE, DimensionValueID: SIDECAR }],
                [{ DimensionID: PRODUCT, DimensionValueID: MEMBERSHIP }],
            ),
        ).toEqual([
            { DimensionID: VENTURE, DimensionValueID: SIDECAR },
            { DimensionID: PRODUCT, DimensionValueID: MEMBERSHIP },
        ]);
    });

    it('lets the rule win over the mapping on a shared axis', () => {
        expect(
            MergeDerivedTags(
                [{ DimensionID: VENTURE, DimensionValueID: SIDECAR }],
                [{ DimensionID: VENTURE, DimensionValueID: ASCEND }],
            ),
        ).toEqual([{ DimensionID: VENTURE, DimensionValueID: ASCEND }]);
    });

    it('matches the axis regardless of GUID case', () => {
        expect(
            MergeDerivedTags(
                [{ DimensionID: VENTURE.toLowerCase(), DimensionValueID: SIDECAR }],
                [{ DimensionID: VENTURE.toUpperCase(), DimensionValueID: ASCEND }],
            ),
        ).toEqual([{ DimensionID: VENTURE.toUpperCase(), DimensionValueID: ASCEND }]);
    });

    it('handles either side being empty', () => {
        const mapping = [{ DimensionID: VENTURE, DimensionValueID: SIDECAR }];
        expect(MergeDerivedTags(mapping, [])).toEqual(mapping);
        expect(MergeDerivedTags([], mapping)).toEqual(mapping);
        expect(MergeDerivedTags([], [])).toEqual([]);
    });
});
