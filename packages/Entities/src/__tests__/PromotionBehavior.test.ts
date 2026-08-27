/**
 * Unit tests for the PURE promotions engine (plan D70). No database.
 *
 * The assertions that matter are the ones about MONEY:
 *   - two 10% promotions are 19% sequentially and 20% additively, and both are asserted, because
 *     the difference is £10 per £1,000 order and the mode is configurable per company
 *   - "highest value wins" is meaningful only if both offers were priced first, so a test proves
 *     the better one wins even when it sits later in the sequence
 *   - a loser is REPORTED, not swallowed — "why didn't my code work?" must have an answer
 */
import { describe, it, expect } from 'vitest';
import {
    ApplyPromotions,
    ScreenPromotion,
    ValuePromotion,
    type PromotionContext,
    type PromotionRule,
} from '../pricing/PromotionBehavior.js';

const promo = (over: Partial<PromotionRule> = {}): PromotionRule => ({
    ID: 'p1',
    Code: 'P1',
    Name: 'Promo 1',
    Kind: 'PercentOff',
    Value: 0.1,
    AppliesAt: 'Either',
    AllowsStacking: false,
    StackSequence: 0,
    MinimumOrderAmount: null,
    MinimumQuantity: null,
    MaxRedemptions: null,
    MaxRedemptionsPerCustomer: null,
    ...over,
});

const ctx = (over: Partial<PromotionContext> = {}): PromotionContext => ({
    BaseAmount: 1000,
    Quantity: 1,
    Level: 'Line',
    StackingMode: 'Sequential',
    AllowStacking: true,
    ...over,
});

describe('ValuePromotion', () => {
    it('prices a percentage against the base', () => {
        expect(ValuePromotion(promo({ Kind: 'PercentOff', Value: 0.25 }), 200)).toBe(50);
    });

    it('never lets a fixed amount exceed the base', () => {
        // A 50 coupon on a 30 line takes 30 — it does not turn into 20 of change.
        expect(ValuePromotion(promo({ Kind: 'AmountOff', Value: 50 }), 30)).toBe(30);
    });

    it('an override price discounts down to that price', () => {
        expect(ValuePromotion(promo({ Kind: 'OverridePrice', Value: 80 }), 200)).toBe(120);
    });

    it('an override ABOVE the base takes nothing rather than adding', () => {
        expect(ValuePromotion(promo({ Kind: 'OverridePrice', Value: 300 }), 200)).toBe(0);
    });

    it('free shipping is worth nothing against a LINE base', () => {
        // It discounts a shipping charge, which is phase 3. Zero here so it neither wins a
        // collision nor changes a line total.
        expect(ValuePromotion(promo({ Kind: 'FreeShipping', Value: 1 }), 200)).toBe(0);
    });
});

describe('ScreenPromotion', () => {
    it('accepts an unrestricted promotion', () => {
        expect(ScreenPromotion(promo(), ctx())).toBeNull();
    });

    it('rejects one that does not apply at this level', () => {
        expect(ScreenPromotion(promo({ AppliesAt: 'Order' }), ctx({ Level: 'Line' }))).toBe('NotApplicableAtThisLevel');
        expect(ScreenPromotion(promo({ AppliesAt: 'Either' }), ctx({ Level: 'Order' }))).toBeNull();
    });

    it('enforces a minimum order amount', () => {
        expect(ScreenPromotion(promo({ MinimumOrderAmount: 5000 }), ctx())).toBe('BelowMinimumOrderAmount');
    });

    it('enforces a minimum quantity', () => {
        expect(ScreenPromotion(promo({ MinimumQuantity: 10 }), ctx({ Quantity: 3 }))).toBe('BelowMinimumQuantity');
    });

    it('enforces the total redemption cap', () => {
        expect(ScreenPromotion(promo({ MaxRedemptions: 100, RedemptionCount: 100 }), ctx())).toBe('RedemptionLimitReached');
        expect(ScreenPromotion(promo({ MaxRedemptions: 100, RedemptionCount: 99 }), ctx())).toBeNull();
    });

    it('enforces the per-customer cap independently of the total', () => {
        const oneEach = promo({ MaxRedemptionsPerCustomer: 1, CustomerRedemptionCount: 1, RedemptionCount: 5 });
        expect(ScreenPromotion(oneEach, ctx())).toBe('CustomerRedemptionLimitReached');
    });
});

describe('ApplyPromotions — stacking arithmetic', () => {
    const ten = promo({ ID: 'a', Code: 'TEN', Value: 0.1, AllowsStacking: true, StackSequence: 1 });
    const alsoTen = promo({ ID: 'b', Code: 'TEN2', Value: 0.1, AllowsStacking: true, StackSequence: 2 });

    it('SEQUENTIAL compounds: two tens are nineteen', () => {
        const out = ApplyPromotions([ten, alsoTen], ctx({ StackingMode: 'Sequential' }));
        expect(out.TotalDiscount).toBe(190);
        expect(out.FinalAmount).toBe(810);
    });

    it('ADDITIVE sums: two tens are twenty', () => {
        const out = ApplyPromotions([ten, alsoTen], ctx({ StackingMode: 'Additive' }));
        expect(out.TotalDiscount).toBe(200);
        expect(out.FinalAmount).toBe(800);
    });

    it('the two modes DIFFER on identical inputs — which is why it is configurable', () => {
        const seq = ApplyPromotions([ten, alsoTen], ctx({ StackingMode: 'Sequential' }));
        const add = ApplyPromotions([ten, alsoTen], ctx({ StackingMode: 'Additive' }));
        expect(seq.TotalDiscount).not.toBe(add.TotalDiscount);
    });

    it('every applied promotion is reported with a running total', () => {
        const out = ApplyPromotions([ten, alsoTen], ctx({ StackingMode: 'Sequential' }));
        expect(out.Applied).toHaveLength(2);
        expect(out.Applied[0].RunningTotal).toBe(900);
        expect(out.Applied[1].RunningTotal).toBe(810);
    });

    it('additive percentages cannot discount past zero', () => {
        const big = promo({ ID: 'x', Code: 'X', Value: 0.7, AllowsStacking: true });
        const bigger = promo({ ID: 'y', Code: 'Y', Value: 0.8, AllowsStacking: true });
        const out = ApplyPromotions([big, bigger], ctx({ StackingMode: 'Additive' }));
        expect(out.FinalAmount).toBe(0);
        expect(out.TotalDiscount).toBe(1000);
    });
});

describe('ApplyPromotions — exclusivity', () => {
    it('the HIGHEST VALUE wins a collision, even sitting later in the sequence', () => {
        // The point of valuing before resolving: you cannot know which offer is better for the
        // customer without pricing both.
        const small = promo({ ID: 'a', Code: 'SMALL', Kind: 'AmountOff', Value: 50, StackSequence: 1 });
        const big = promo({ ID: 'b', Code: 'BIG', Kind: 'PercentOff', Value: 0.2, StackSequence: 9 });
        const out = ApplyPromotions([small, big], ctx());
        expect(out.Applied).toHaveLength(1);
        expect(out.Applied[0].Promotion.Code).toBe('BIG');
        expect(out.TotalDiscount).toBe(200);
    });

    it('REPORTS the loser and what beat it', () => {
        const small = promo({ ID: 'a', Code: 'SMALL', Kind: 'AmountOff', Value: 50 });
        const big = promo({ ID: 'b', Code: 'BIG', Kind: 'PercentOff', Value: 0.2 });
        const out = ApplyPromotions([small, big], ctx());
        const loss = out.Rejected.find((r) => r.Promotion.Code === 'SMALL');
        expect(loss?.Reason).toBe('LostExclusiveCollision');
        expect(loss?.LostTo).toBe('BIG');
    });

    it('a non-stacking WINNER blocks everything else, however the others are flagged', () => {
        const exclusive = promo({ ID: 'a', Code: 'EXC', Value: 0.3, AllowsStacking: false });
        const friendly = promo({ ID: 'b', Code: 'OK', Value: 0.05, AllowsStacking: true });
        const out = ApplyPromotions([exclusive, friendly], ctx());
        expect(out.Applied.map((a) => a.Promotion.Code)).toEqual(['EXC']);
        expect(out.Rejected.find((r) => r.Promotion.Code === 'OK')?.Reason).toBe('LostExclusiveCollision');
    });

    it('company policy can forbid stacking outright, whatever the promotions say', () => {
        const a = promo({ ID: 'a', Code: 'A', Value: 0.1, AllowsStacking: true });
        const b = promo({ ID: 'b', Code: 'B', Value: 0.05, AllowsStacking: true });
        const out = ApplyPromotions([a, b], ctx({ AllowStacking: false }));
        expect(out.Applied).toHaveLength(1);
        expect(out.Applied[0].Promotion.Code).toBe('A');
        expect(out.Rejected[0].Reason).toBe('StackingNotPermitted');
    });

    it('screened-out promotions never reach the collision', () => {
        const spent = promo({ ID: 'a', Code: 'SPENT', Value: 0.9, MaxRedemptions: 1, RedemptionCount: 1 });
        const live = promo({ ID: 'b', Code: 'LIVE', Value: 0.1 });
        const out = ApplyPromotions([spent, live], ctx());
        expect(out.Applied.map((a) => a.Promotion.Code)).toEqual(['LIVE']);
        expect(out.Rejected.find((r) => r.Promotion.Code === 'SPENT')?.Reason).toBe('RedemptionLimitReached');
    });

    it('nothing eligible leaves the base untouched', () => {
        const out = ApplyPromotions([promo({ AppliesAt: 'Order' })], ctx({ Level: 'Line' }));
        expect(out.Applied).toHaveLength(0);
        expect(out.FinalAmount).toBe(1000);
        expect(out.TotalDiscount).toBe(0);
    });

    it('a sequential stack cannot discount past zero', () => {
        const a = promo({ ID: 'a', Code: 'A', Kind: 'AmountOff', Value: 800, AllowsStacking: true, StackSequence: 1 });
        const b = promo({ ID: 'b', Code: 'B', Kind: 'AmountOff', Value: 800, AllowsStacking: true, StackSequence: 2 });
        const out = ApplyPromotions([a, b], ctx());
        expect(out.FinalAmount).toBe(0);
        expect(out.TotalDiscount).toBe(1000);
    });
});
