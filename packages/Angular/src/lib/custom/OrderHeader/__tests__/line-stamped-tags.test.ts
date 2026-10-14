import { describe, expect, it } from 'vitest';

import { BuildStampedTags, DefaultReplacedBy, StampedOn } from '../line-stamped-tags';
import type { MJODimensionOption } from '../../../data/orders-queries';

/**
 * The panel lists what a saved line books and asks before a hand-set tag replaces a default. Getting
 * either wrong is the reported defect: a line with a stamped default read "none", and choosing a
 * value silently replaced the default.
 */

const VENTURE = 'a0000000-0000-4000-8000-000000000001';
const PRODUCT = 'a0000000-0000-4000-8000-000000000002';
const DEFAULT_VALUE = 'b0000000-0000-4000-8000-000000000001';
const OTHER_VALUE = 'b0000000-0000-4000-8000-000000000002';
const VENTURE_VALUE = 'b0000000-0000-4000-8000-000000000003';

const catalog: MJODimensionOption[] = [
    { ID: VENTURE, Code: 'VENTURE', Name: 'Venture', DisplayOrder: 1, Values: [{ ID: VENTURE_VALUE, Code: 'V1', Name: 'Venture one' }] },
    {
        ID: PRODUCT,
        Code: 'PRODUCT',
        Name: 'Product',
        DisplayOrder: 2,
        Values: [
            { ID: DEFAULT_VALUE, Code: 'P1', Name: 'Product one' },
            { ID: OTHER_VALUE, Code: 'P2', Name: 'Product two' },
        ],
    },
];

describe('BuildStampedTags', () => {
    it('lists each stored tag in catalog order, labelled from the catalog', () => {
        const tags = BuildStampedTags(
            [
                { DimensionID: PRODUCT, DimensionValueID: DEFAULT_VALUE },
                { DimensionID: VENTURE, DimensionValueID: VENTURE_VALUE },
            ],
            null,
            catalog,
        );
        expect(tags.map((t) => [t.DimensionLabel, t.ValueLabel, t.Source])).toEqual([
            ['VENTURE — Venture', 'V1 — Venture one', 'default'],
            ['PRODUCT — Product', 'P1 — Product one', 'default'],
        ]);
    });

    it('marks the axis set by hand on the line, matching ids case-insensitively', () => {
        const tags = BuildStampedTags([{ DimensionID: PRODUCT.toUpperCase(), DimensionValueID: OTHER_VALUE }], PRODUCT, catalog);
        expect(tags[0].Source).toBe('line');
    });

    it("falls back to the row's own names for a value the catalog no longer lists", () => {
        const tags = BuildStampedTags(
            [{ DimensionID: PRODUCT, DimensionValueID: 'b0000000-0000-4000-8000-0000000000ff', DimensionValue: 'Retired product' }],
            null,
            catalog,
        );
        expect(tags[0].ValueLabel).toBe('Retired product');
    });
});

describe('DefaultReplacedBy', () => {
    const stamped = BuildStampedTags(
        [
            { DimensionID: PRODUCT, DimensionValueID: DEFAULT_VALUE },
            { DimensionID: VENTURE, DimensionValueID: VENTURE_VALUE },
        ],
        VENTURE,
        catalog,
    );

    it('returns the default a different value would replace', () => {
        expect(DefaultReplacedBy(stamped, PRODUCT, OTHER_VALUE)?.ValueID).toBe(DEFAULT_VALUE);
    });

    it('does not ask when the chosen value is the default itself', () => {
        expect(DefaultReplacedBy(stamped, PRODUCT, DEFAULT_VALUE)).toBeNull();
    });

    it('does not ask when the axis was already set by hand', () => {
        expect(DefaultReplacedBy(stamped, VENTURE, OTHER_VALUE)).toBeNull();
    });

    it('does not ask for an axis with nothing stamped, or before a value is chosen', () => {
        expect(DefaultReplacedBy([], PRODUCT, OTHER_VALUE)).toBeNull();
        expect(DefaultReplacedBy(stamped, PRODUCT, '')).toBeNull();
    });
});

describe('StampedOn', () => {
    it('finds the tag on an axis, or null', () => {
        const stamped = BuildStampedTags([{ DimensionID: PRODUCT, DimensionValueID: DEFAULT_VALUE }], null, catalog);
        expect(StampedOn(stamped, PRODUCT)?.ValueLabel).toBe('P1 — Product one');
        expect(StampedOn(stamped, VENTURE)).toBeNull();
        expect(StampedOn(stamped, '')).toBeNull();
    });
});
