import { describe, expect, it } from 'vitest';
import { ReadPricedLineAmounts } from '../pricing/PricingBehavior';

/**
 * #405 — the browser's pricing read-back never read the charge and tax the walk stamped on a line,
 * so its gross was the net and the order header's Total left out what Balance included. Both
 * pricing paths now read back through this one function.
 */
describe('ReadPricedLineAmounts', () => {
    it('reports gross as net plus charges plus tax', () => {
        const amounts = ReadPricedLineAmounts({
            Quantity: 2,
            UnitPrice: 50,
            DiscountPct: 0,
            DiscountAmount: 10,
            ChargeAmount: 5,
            LineTax: 7.25,
        });
        expect(amounts).toEqual({
            UnitPrice: 50,
            DiscountAmount: 10,
            ChargeAmount: 5,
            LineTax: 7.25,
            LineTotalNet: 90,
            LineTotalGross: 102.25,
        });
    });

    it('applies the percentage concession and the allocated amount together', () => {
        const amounts = ReadPricedLineAmounts({ Quantity: 1, UnitPrice: 100, DiscountPct: 0.1, DiscountAmount: 5, LineTax: 8.5 });
        expect(amounts.LineTotalNet).toBe(85);
        expect(amounts.DiscountAmount).toBe(15);
        expect(amounts.LineTotalGross).toBe(93.5);
    });

    it('treats absent charge and tax as zero, so gross equals net', () => {
        const amounts = ReadPricedLineAmounts({ Quantity: 3, UnitPrice: 12.5 });
        expect(amounts.LineTotalNet).toBe(37.5);
        expect(amounts.LineTotalGross).toBe(37.5);
    });
});
