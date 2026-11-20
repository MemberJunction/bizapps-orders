/**
 * Unit tests for the journal entry's per-line split (bizapps-orders#579). No database.
 *
 * Net is the line's stored total; the discount is split off the line's gross. For a Flat price
 * that gross is the rule's stored figure, not quantity × the rounded unit price.
 */
import { describe, it, expect } from 'vitest';
import type { mjBizAppsOrdersOrderLineEntity } from '@mj-biz-apps/orders-entities';
import { LineAmounts } from '../OrderJournalEntryFactory.js';

const line = (over: Partial<Record<string, number | null>>): mjBizAppsOrdersOrderLineEntity =>
    ({
        Quantity: 1,
        UnitPrice: 100,
        ExtendedAmount: null,
        DiscountPct: 0,
        DiscountAmount: 0,
        LineTotalNet: 100,
        LineTax: 0,
        ChargeAmount: 0,
        ...over,
    }) as unknown as mjBizAppsOrdersOrderLineEntity;

describe('LineAmounts', () => {
    it('splits a discounted Flat line off the stored figure', () => {
        // Flat 100 at qty 3, 90% off: the line nets 10.00. Off 3 × 33.33 = 99.99 the discount was
        // 89.99 and the booked gross 99.99, a cent short of what the customer was quoted.
        const amounts = LineAmounts(line({ Quantity: 3, UnitPrice: 33.33, ExtendedAmount: 100, DiscountPct: 0.9, LineTotalNet: 10 }));
        expect(amounts.Discount).toBe(90);
        expect(amounts.Gross).toBe(100);
        expect(amounts.Net).toBe(10);
    });

    it('books an undiscounted Flat line at its stored total', () => {
        const amounts = LineAmounts(line({ Quantity: 7, UnitPrice: 14.29, ExtendedAmount: 100, LineTotalNet: 100 }));
        expect(amounts.Discount).toBe(0);
        expect(amounts.Gross).toBe(100);
    });

    it('mirrors a reversal as absolute amounts', () => {
        const amounts = LineAmounts(line({ Quantity: -3, UnitPrice: 33.33, ExtendedAmount: -100, DiscountPct: 0.1, LineTotalNet: -90 }));
        expect(amounts.Discount).toBe(10);
        expect(amounts.Gross).toBe(100);
    });

    it('keeps quantity × unit price for a stated price', () => {
        const amounts = LineAmounts(line({ Quantity: 3, UnitPrice: 33.33, DiscountPct: 0.1, LineTotalNet: 89.99 }));
        expect(amounts.Discount).toBe(10);
        expect(amounts.Gross).toBe(99.99);
    });
});
