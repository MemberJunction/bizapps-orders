/**
 * The two dimension axes that cannot come from a mapping table.
 *
 * WHY THESE ARE WORTH A TEST. ARR-Type and Vintage are the axes a product-level default cannot
 * answer — the same subscription product sells New and Renewal on the same day, and an event's
 * vintage is its own date. Both resolve by CODE against whatever the ERP sync pulled in, and every
 * way of getting that wrong is quiet:
 *
 *   - Inverting the action tags a renewal as New, which misstates new-versus-renewal ARR in the
 *     P&L and is invisible until someone runs the report.
 *   - Reading the event year in local time files a 1 January event under the previous year when the
 *     server sits west of the venue.
 *   - Inventing a value id when the code is absent sends accounting a dimension value that does not
 *     exist, failing the whole booking on an unrelated-looking error.
 *
 * A missing dimension or a missing value must yield NO tag, not a guess: the line then books
 * untagged, which is the pre-existing state and a decision for the required-dimension check to
 * refuse, not for these rules.
 */
import { describe, expect, it } from 'vitest';

import {
    ARR_TYPE_VALUE_CODE,
    DIMENSION_CODE,
    DeriveARRType,
    DeriveLineDimensions,
    DeriveVintage,
    type DimensionVocabulary,
} from '../LineDimensionRules.js';

const ARR = 'a1111111-1111-4111-8111-111111111111';
const VINTAGE = 'b2222222-2222-4222-8222-222222222222';
const NEW = 'c3333333-3333-4333-8333-333333333333';
const RENEWAL = 'd4444444-4444-4444-8444-444444444444';
const Y2026 = 'e5555555-5555-4555-8555-555555555555';

const vocabulary: DimensionVocabulary = {
    Dimensions: [
        { ID: ARR, Code: DIMENSION_CODE.ARRType, IsActive: true },
        { ID: VINTAGE, Code: DIMENSION_CODE.Vintage, IsActive: true },
    ],
    DimensionValues: [
        { ID: NEW, DimensionID: ARR, Code: ARR_TYPE_VALUE_CODE.New, IsActive: true },
        { ID: RENEWAL, DimensionID: ARR, Code: ARR_TYPE_VALUE_CODE.Renewal, IsActive: true },
        { ID: Y2026, DimensionID: VINTAGE, Code: '2026', IsActive: true },
    ],
};

describe('DeriveARRType', () => {
    it('tags a line that starts a subscription as New', () => {
        expect(DeriveARRType({ SubscriptionAction: 'CreateNew' }, vocabulary)).toEqual({
            DimensionID: ARR,
            DimensionValueID: NEW,
        });
    });

    it.each(['ExtendExisting', 'Reactivate'] as const)('tags a line that continues one (%s) as Renewal', (action) => {
        expect(DeriveARRType({ SubscriptionAction: action }, vocabulary)).toEqual({
            DimensionID: ARR,
            DimensionValueID: RENEWAL,
        });
    });

    it('tags nothing on a line that buys no subscription', () => {
        expect(DeriveARRType({}, vocabulary)).toBeNull();
        expect(DeriveARRType({ SubscriptionAction: null }, vocabulary)).toBeNull();
    });

    it('tags nothing when the subscription pass rejected the line', () => {
        // There is no term to call new or renewed, and the save is about to fail anyway.
        expect(DeriveARRType({ SubscriptionAction: 'Reject' }, vocabulary)).toBeNull();
    });

    it('tags nothing when the dimension or the value is absent from the vocabulary', () => {
        const noDimension: DimensionVocabulary = { Dimensions: [], DimensionValues: [] };
        expect(DeriveARRType({ SubscriptionAction: 'CreateNew' }, noDimension)).toBeNull();

        const noValue: DimensionVocabulary = { Dimensions: vocabulary.Dimensions, DimensionValues: [] };
        expect(DeriveARRType({ SubscriptionAction: 'CreateNew' }, noValue)).toBeNull();
    });

    it('ignores an inactive dimension or value', () => {
        const inactive: DimensionVocabulary = {
            Dimensions: [{ ID: ARR, Code: DIMENSION_CODE.ARRType, IsActive: false }],
            DimensionValues: vocabulary.DimensionValues,
        };
        expect(DeriveARRType({ SubscriptionAction: 'CreateNew' }, inactive)).toBeNull();
    });
});

describe('DeriveVintage', () => {
    it('tags the year the event starts', () => {
        expect(DeriveVintage({ EventStartsAt: '2026-06-15T09:00:00Z' }, vocabulary)).toEqual({
            DimensionID: VINTAGE,
            DimensionValueID: Y2026,
        });
    });

    it('reads the year in UTC, not the running machine\'s zone', () => {
        // 1 January 2026 00:30 UTC is still 2025 in every zone west of Greenwich. Filing it under
        // 2025 would put the event in the wrong season.
        expect(DeriveVintage({ EventStartsAt: '2026-01-01T00:30:00Z' }, vocabulary)).toEqual({
            DimensionID: VINTAGE,
            DimensionValueID: Y2026,
        });
    });

    it('tags nothing on a line whose product is not an event', () => {
        expect(DeriveVintage({}, vocabulary)).toBeNull();
        expect(DeriveVintage({ EventStartsAt: null }, vocabulary)).toBeNull();
    });

    it('tags nothing when no value exists for that year', () => {
        expect(DeriveVintage({ EventStartsAt: '2031-06-15T09:00:00Z' }, vocabulary)).toBeNull();
    });

    it('tags nothing on an unparseable date rather than throwing mid-save', () => {
        expect(DeriveVintage({ EventStartsAt: 'not a date' }, vocabulary)).toBeNull();
    });

    it('accepts a Date as well as a string', () => {
        expect(DeriveVintage({ EventStartsAt: new Date('2026-03-01T00:00:00Z') }, vocabulary)).toEqual({
            DimensionID: VINTAGE,
            DimensionValueID: Y2026,
        });
    });
});

describe('DeriveLineDimensions', () => {
    it('returns both axes for an event line that renews a subscription', () => {
        const tags = DeriveLineDimensions(
            { SubscriptionAction: 'ExtendExisting', EventStartsAt: '2026-06-15T09:00:00Z' },
            vocabulary,
        );
        expect(tags).toEqual([
            { DimensionID: ARR, DimensionValueID: RENEWAL },
            { DimensionID: VINTAGE, DimensionValueID: Y2026 },
        ]);
    });

    it('returns nothing for a plain goods line', () => {
        expect(DeriveLineDimensions({}, vocabulary)).toEqual([]);
    });
});
