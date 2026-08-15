import { describe, expect, it } from 'vitest';
import {
    FormatCoverageWindow,
    IsPaymentReversal,
    PaymentStatusChipClass,
    ProductAvatarIcon,
    ProductStatusChipClass,
    PromotionStatusChipClass,
    PromotionValueLabel,
    RecalculatePriceListSim,
    SubscriptionStatusChipClass,
    TermColorClass,
} from '../document-form.helpers';

describe('document-form helpers', () => {
    it('marks a negative payment as a reversal', () => {
        expect(IsPaymentReversal({ Amount: -10 })).toBe(true);
        expect(IsPaymentReversal({ Amount: 10 })).toBe(false);
    });

    it('maps payment and subscription statuses to chip classes', () => {
        expect(PaymentStatusChipClass('Captured')).toContain('--ok');
        expect(PaymentStatusChipClass('Failed')).toContain('--error');
        expect(SubscriptionStatusChipClass('Paused')).toContain('--warn');
        expect(SubscriptionStatusChipClass('Active')).toContain('--ok');
    });

    it('formats an open-ended coverage window', () => {
        expect(FormatCoverageWindow(null, null)).toBe('—');
        expect(FormatCoverageWindow(new Date('2026-01-15'), null)).toContain('Open-ended');
    });

    it('cycles term tone classes', () => {
        expect(TermColorClass(0)).toBe('mjo-term-tone--1');
        expect(TermColorClass(5)).toBe('mjo-term-tone--1');
    });

    it('picks a product avatar from type name', () => {
        expect(ProductAvatarIcon('Annual Summit Ticket')).toContain('ticket');
        expect(ProductAvatarIcon('SaaS Pro Monthly')).toContain('repeat');
        expect(ProductStatusChipClass('Active')).toContain('--ok');
        expect(ProductStatusChipClass('Draft')).toContain('--draft');
    });

    it('labels a percent promotion and maps status', () => {
        expect(PromotionValueLabel(20, 'Percentage Discount')).toBe('20% Off');
        expect(PromotionValueLabel(50, 'Fixed Amount')).toContain('$50.00');
        expect(PromotionStatusChipClass('Paused')).toContain('--warn');
    });

    it('calculates volume and graduated price-list simulations', () => {
        const volume = RecalculatePriceListSim(100, 25, 'volume');
        expect(volume.EffectiveUnitPrice).toBe(85);
        expect(volume.TotalOrderAmount).toBe(2125);
        expect(volume.DiscountPercent).toBe(15);

        const tiered = RecalculatePriceListSim(100, 25, 'tiered');
        expect(tiered.TotalOrderAmount).toBe(2410);
        expect(tiered.EffectiveUnitPrice).toBeCloseTo(96.4, 1);
        expect(tiered.SavingsAmount).toBe(90);
    });
});
