import { describe, it, expect } from 'vitest';
import { collapseInheritedPrices } from '../pricing/inheritPrices.js';

const PRODUCT = '11111111-1111-1111-1111-111111111111';
const NEAR = '22222222-2222-2222-2222-222222222222';
const FAR = '33333333-3333-3333-3333-333333333333';
const OTHER = '44444444-4444-4444-4444-444444444444';

describe('collapseInheritedPrices', () => {
    it('keeps a product row over the same Name on a category', () => {
        const rows = [
            { ID: 'cat', Name: 'Member', ProductID: null, ProductCategoryID: NEAR, Amount: 10 },
            { ID: 'prod', Name: 'Member', ProductID: PRODUCT, ProductCategoryID: null, Amount: 8 },
        ];
        const kept = collapseInheritedPrices(rows, PRODUCT, [NEAR, FAR]);
        expect(kept).toHaveLength(1);
        expect(kept[0].ID).toBe('prod');
    });

    it('does not fall through to the category Name when the product When would fail — override is by Name, not by applicability', () => {
        // Applicability is a later filter. Inheritance already dropped category Member.
        const rows = [
            { ID: 'cat-member', Name: 'Member', ProductID: null, ProductCategoryID: NEAR },
            { ID: 'prod-member', Name: 'Member', ProductID: PRODUCT, ProductCategoryID: null },
            { ID: 'cat-non', Name: 'Non-member', ProductID: null, ProductCategoryID: NEAR },
        ];
        const kept = collapseInheritedPrices(rows, PRODUCT, [NEAR]);
        expect(kept.map((r) => r.ID).sort()).toEqual(['cat-non', 'prod-member']);
    });

    it('takes the nearest category when the product has no row of that Name', () => {
        const rows = [
            { ID: 'far', Name: 'Member', ProductID: null, ProductCategoryID: FAR },
            { ID: 'near', Name: 'Member', ProductID: null, ProductCategoryID: NEAR },
        ];
        const kept = collapseInheritedPrices(rows, PRODUCT, [NEAR, FAR]);
        expect(kept).toHaveLength(1);
        expect(kept[0].ID).toBe('near');
    });

    it('ignores a category that is not on this product\'s chain', () => {
        const rows = [
            { ID: 'other', Name: 'Member', ProductID: null, ProductCategoryID: OTHER },
            { ID: 'near', Name: 'Member', ProductID: null, ProductCategoryID: NEAR },
        ];
        const kept = collapseInheritedPrices(rows, PRODUCT, [NEAR]);
        expect(kept).toHaveLength(1);
        expect(kept[0].ID).toBe('near');
    });

    it('matches Name case-insensitively', () => {
        const rows = [
            { ID: 'a', Name: 'member', ProductID: PRODUCT, ProductCategoryID: null },
            { ID: 'b', Name: 'Member', ProductID: null, ProductCategoryID: NEAR },
        ];
        const kept = collapseInheritedPrices(rows, PRODUCT, [NEAR]);
        expect(kept).toHaveLength(1);
        expect(kept[0].ID).toBe('a');
    });
});
