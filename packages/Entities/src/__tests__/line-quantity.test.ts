import { describe, expect, it } from 'vitest';
import { ClampLineQuantity } from '../line-quantity.js';

describe('ClampLineQuantity', () => {
    it('floors at 1', () => {
        expect(ClampLineQuantity(0, null)).toBe(1);
        expect(ClampLineQuantity(-3, 10)).toBe(1);
        expect(ClampLineQuantity(Number.NaN, null)).toBe(1);
    });

    it('leaves quantity alone when there is no cap', () => {
        expect(ClampLineQuantity(7, null)).toBe(7);
        expect(ClampLineQuantity(7, undefined)).toBe(7);
        expect(ClampLineQuantity(7, 0)).toBe(7);
    });

    it('caps at MaxQuantityPerLine', () => {
        expect(ClampLineQuantity(5, 1)).toBe(1);
        expect(ClampLineQuantity(1, 1)).toBe(1);
        expect(ClampLineQuantity(3, 2)).toBe(2);
    });
});
