/**
 * golive#434 — the New product dialog's first step: what it requires, and the recognition default.
 */
import { describe, expect, it } from 'vitest';

import { EmptyNewProductDraft, RevenueRecognitionForType, ValidateNewProductDraft, type NewProductDraft } from '../new-product-draft';

const COMPANY = '11111111-1111-1111-1111-111111111111';
const CATEGORY = '22222222-2222-2222-2222-222222222222';
const TYPE = '33333333-3333-3333-3333-333333333333';
const REV_REC = '44444444-4444-4444-4444-444444444444';
const OTHER_REV_REC = '55555555-5555-5555-5555-555555555555';

function complete(overrides: Partial<NewProductDraft> = {}): NewProductDraft {
    return {
        ...EmptyNewProductDraft('2026-11-18'),
        Name: 'Setup fee',
        CompanyID: COMPANY,
        ProductCategoryID: CATEGORY,
        ProductTypeID: TYPE,
        RevenueRecognitionTypeID: REV_REC,
        ...overrides,
    };
}

describe('EmptyNewProductDraft', () => {
    it('starts with a zero base price applying from the given day', () => {
        const d = EmptyNewProductDraft('2026-11-18');
        expect(d.BasePrice).toBe(0);
        expect(d.PriceEffectiveFrom).toBe('2026-11-18');
    });
});

describe('ValidateNewProductDraft', () => {
    it('accepts a complete draft with a zero price', () => {
        expect(ValidateNewProductDraft(complete())).toEqual([]);
    });

    it('lists every missing required field of a blank draft', () => {
        expect(ValidateNewProductDraft(EmptyNewProductDraft('2026-11-18'))).toEqual([
            'Enter a name.',
            'Choose the company that sells it.',
            'Choose a category.',
            'Choose a product type.',
            'Choose how revenue is recognized.',
        ]);
    });

    it('refuses a name of only spaces', () => {
        expect(ValidateNewProductDraft(complete({ Name: '   ' }))).toEqual(['Enter a name.']);
    });

    it('refuses an emptied or negative base price', () => {
        expect(ValidateNewProductDraft(complete({ BasePrice: null }))).toEqual(['Enter a base price of zero or more.']);
        expect(ValidateNewProductDraft(complete({ BasePrice: -1 }))).toEqual(['Enter a base price of zero or more.']);
    });

    it('refuses an emptied price start date', () => {
        expect(ValidateNewProductDraft(complete({ PriceEffectiveFrom: '' }))).toEqual(['Enter the date the price applies from.']);
    });
});

describe('RevenueRecognitionForType', () => {
    const types = [
        { ID: TYPE, DefaultRevenueRecognitionTypeID: OTHER_REV_REC },
        { ID: CATEGORY, DefaultRevenueRecognitionTypeID: null },
    ];

    it("takes the type's default, matching the id in any case", () => {
        expect(RevenueRecognitionForType(types, TYPE.toUpperCase(), REV_REC)).toBe(OTHER_REV_REC);
    });

    it('keeps the current choice when the type has no default or is unknown', () => {
        expect(RevenueRecognitionForType(types, CATEGORY, REV_REC)).toBe(REV_REC);
        expect(RevenueRecognitionForType(types, '', REV_REC)).toBe(REV_REC);
    });
});
