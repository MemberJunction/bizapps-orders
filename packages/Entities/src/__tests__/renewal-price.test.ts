import { describe, expect, it } from 'vitest';
import {
    PriceRenewal,
    PriorTermShare,
    RenewalCrossesAnniversary,
    ResolveRenewalIncrease,
    type RenewalPriceInput,
} from '../renewal-price.js';

const none = { Percent: 0, Source: 'None' } as const;

function input(overrides: Partial<RenewalPriceInput> = {}): RenewalPriceInput {
    return {
        PriorUnitPrice: 1000,
        PriorDiscountPct: 0.2,
        PriorPriceOverridden: false,
        PriorListPrice: 1000,
        CarryDiscount: false,
        Increase: none,
        ApplyIncrease: true,
        ...overrides,
    };
}

describe('ResolveRenewalIncrease', () => {
    const empty = { Subscription: null, Product: null, Categories: [], Company: null };

    it('is no increase when nothing is set', () => {
        expect(ResolveRenewalIncrease(empty)).toEqual({ Percent: 0, Source: 'None' });
    });

    it('takes the most specific level that is set', () => {
        const all = { Subscription: 7, Product: 6, Categories: [5, 4], Company: 3 };
        expect(ResolveRenewalIncrease(all)).toEqual({ Percent: 7, Source: 'Subscription' });
        expect(ResolveRenewalIncrease({ ...all, Subscription: null })).toEqual({ Percent: 6, Source: 'Product' });
        expect(ResolveRenewalIncrease({ ...all, Subscription: null, Product: null })).toEqual({
            Percent: 5,
            Source: 'Category',
        });
        expect(ResolveRenewalIncrease({ ...empty, Company: 3 })).toEqual({ Percent: 3, Source: 'Company' });
    });

    it('walks up the category chain to the nearest category that sets one', () => {
        expect(ResolveRenewalIncrease({ ...empty, Categories: [null, null, 4], Company: 3 })).toEqual({
            Percent: 4,
            Source: 'Category',
        });
    });

    it('treats 0 as set, so a subscription can opt out of a default', () => {
        expect(ResolveRenewalIncrease({ ...empty, Subscription: 0, Company: 5 })).toEqual({
            Percent: 0,
            Source: 'Subscription',
        });
    });
});

describe('RenewalCrossesAnniversary', () => {
    it('crosses one on every renewal of an annual term', () => {
        expect(RenewalCrossesAnniversary('2026-01-15', '2026-01-15', '2027-01-15')).toBe(true);
        expect(RenewalCrossesAnniversary('2026-01-15', '2027-01-15', '2028-01-15')).toBe(true);
    });

    it('crosses one once a year for a monthly term', () => {
        expect(RenewalCrossesAnniversary('2026-01-15', '2026-01-15', '2026-02-15')).toBe(false);
        expect(RenewalCrossesAnniversary('2026-01-15', '2026-11-15', '2026-12-15')).toBe(false);
        expect(RenewalCrossesAnniversary('2026-01-15', '2026-12-15', '2027-01-15')).toBe(true);
        expect(RenewalCrossesAnniversary('2026-01-15', '2027-01-15', '2027-02-15')).toBe(false);
    });

    it('does not cross one when a short first term runs into a calendar anchor', () => {
        expect(RenewalCrossesAnniversary('2026-03-15', '2026-03-15', '2027-01-01')).toBe(false);
        expect(RenewalCrossesAnniversary('2026-03-15', '2027-01-01', '2028-01-01')).toBe(true);
    });

    it('accepts dates as well as calendar-day strings', () => {
        expect(
            RenewalCrossesAnniversary(new Date('2026-01-15T00:00:00Z'), '2026-01-15', new Date('2027-01-15T00:00:00Z')),
        ).toBe(true);
    });
});

describe('PriceRenewal', () => {
    it('lets a first-term discount lapse and renews at the undiscounted price', () => {
        expect(PriceRenewal(input())).toEqual({
            BasePrice: 1000,
            BaseSource: 'PriorPrice',
            IncreasePercent: 0,
            IncreaseSource: 'None',
            UnitPrice: 1000,
            DiscountPct: 0,
        });
    });

    it('keeps the discount when the subscription says it continues', () => {
        expect(PriceRenewal(input({ CarryDiscount: true })).DiscountPct).toBe(0.2);
    });

    it('resets a price typed below list to the prior list price', () => {
        const priced = PriceRenewal(input({ PriorUnitPrice: 800, PriorDiscountPct: 0, PriorPriceOverridden: true }));
        expect(priced.BasePrice).toBe(1000);
        expect(priced.BaseSource).toBe('PriorList');
    });

    it('keeps a price typed below list when the discount continues', () => {
        const priced = PriceRenewal(
            input({ PriorUnitPrice: 800, PriorPriceOverridden: true, CarryDiscount: true }),
        );
        expect(priced.BasePrice).toBe(800);
        expect(priced.BaseSource).toBe('PriorPrice');
    });

    it('carries a price typed above list forward', () => {
        const priced = PriceRenewal(input({ PriorUnitPrice: 1200, PriorPriceOverridden: true }));
        expect(priced.BasePrice).toBe(1200);
        expect(priced.BaseSource).toBe('PriorPrice');
    });

    it('keeps the prior price when an overridden line has no list price to reset to', () => {
        const priced = PriceRenewal(input({ PriorUnitPrice: 800, PriorPriceOverridden: true, PriorListPrice: null }));
        expect(priced.BasePrice).toBe(800);
    });

    it('does not reset to list a renewal-priced line below the current list', () => {
        // The pass's own lines are not flagged as overridden, so a grandfathered price is kept.
        const priced = PriceRenewal(input({ PriorUnitPrice: 900, PriorDiscountPct: 0, PriorListPrice: 1100 }));
        expect(priced.BasePrice).toBe(900);
    });

    it('applies the increase on top of the base and rounds to cents', () => {
        const priced = PriceRenewal(
            input({ PriorUnitPrice: 333.33, Increase: { Percent: 5, Source: 'Company' } }),
        );
        expect(priced.IncreasePercent).toBe(5);
        expect(priced.IncreaseSource).toBe('Company');
        expect(priced.UnitPrice).toBe(350);
    });

    it('applies no increase when the term crosses no anniversary', () => {
        const priced = PriceRenewal(input({ Increase: { Percent: 5, Source: 'Product' }, ApplyIncrease: false }));
        expect(priced.IncreasePercent).toBe(0);
        expect(priced.IncreaseSource).toBe('None');
        expect(priced.UnitPrice).toBe(1000);
    });

    it('prices a successor from its own list, then the increase', () => {
        const priced = PriceRenewal(
            input({ SuccessorListPrice: 1500, Increase: { Percent: 5, Source: 'Subscription' } }),
        );
        expect(priced.BaseSource).toBe('SuccessorList');
        expect(priced.BasePrice).toBe(1500);
        expect(priced.UnitPrice).toBe(1575);
        expect(priced.DiscountPct).toBe(0);
    });

    it('refuses a successor with no price', () => {
        expect(() => PriceRenewal(input({ SuccessorListPrice: null }))).toThrow(/successor product has no price/);
    });
});

describe('a line that bought several terms renews at one term of its price (golive #338)', () => {
    const annual = 12;
    const priced = (lineMonths: number, unitPrice: number, overrides: Partial<RenewalPriceInput> = {}) =>
        PriceRenewal(
            input({
                // A whole-period price is one someone typed: the engine prices one term.
                PriorUnitPrice: unitPrice,
                PriorDiscountPct: 0,
                PriorPriceOverridden: true,
                PriorListPrice: null,
                PriorTermShare: PriorTermShare(lineMonths, annual),
                ...overrides,
            }),
        );

    it('a 24-month line at 20,000 renews a 12-month term at 10,000', () => {
        expect(PriorTermShare(24, annual)).toBe(0.5);
        const p = priced(24, 20000);
        expect(p.BaseSource).toBe('PriorPrice');
        expect(p.BasePrice).toBe(10000);
        expect(p.UnitPrice).toBe(10000);
    });

    it('a 13-month line at 11,000 renews at 12/13 of it, to the cent', () => {
        const p = priced(13, 11000);
        expect(p.BasePrice).toBe(10153.85);
        expect(p.UnitPrice).toBe(10153.85);
    });

    it('a 6-month line sold at the full-year price renews at that price', () => {
        expect(PriorTermShare(6, annual)).toBe(1);
        const p = priced(6, 11000);
        expect(p.BasePrice).toBe(11000);
        expect(p.UnitPrice).toBe(11000);
    });

    it("a line exactly the type's term, or with no stated length, is unchanged", () => {
        expect(PriorTermShare(12, annual)).toBe(1);
        expect(PriorTermShare(null, annual)).toBe(1);
        expect(PriorTermShare(24, null)).toBe(1);
        expect(PriorTermShare(0, annual)).toBe(1);
        expect(priced(12, 11000).UnitPrice).toBe(11000);
        expect(PriceRenewal(input({ PriorUnitPrice: 11000, PriorDiscountPct: 0 })).UnitPrice).toBe(11000);
    });

    it('the increase applies to the one-term price', () => {
        const p = priced(24, 20000, { Increase: { Percent: 5, Source: 'Product' } });
        expect(p.BasePrice).toBe(10000);
        expect(p.UnitPrice).toBe(10500);
    });

    it('the list price is a one-term price: a multi-term line sold below it lapses to it', () => {
        // 16,000 for 24 months is 8,000 a year against a 10,000 list.
        const p = priced(24, 16000, { PriorPriceOverridden: true, PriorListPrice: 10000 });
        expect(p.BaseSource).toBe('PriorList');
        expect(p.BasePrice).toBe(10000);
    });

    it('a multi-term line typed above list keeps one term of its own price', () => {
        const p = priced(24, 22000, { PriorPriceOverridden: true, PriorListPrice: 10000 });
        expect(p.BaseSource).toBe('PriorPrice');
        expect(p.BasePrice).toBe(11000);
    });

    it('an engine-priced multi-term line carries one term of price already, and renews at it', () => {
        // The engine charged one 10,000 term for the 24 months, so cutting it would renew at 5,000.
        const p = priced(24, 10000, { PriorPriceOverridden: false });
        expect(p.BaseSource).toBe('PriorPrice');
        expect(p.BasePrice).toBe(10000);
        expect(p.UnitPrice).toBe(10000);
    });

    it('a typed one-term discount on a multi-term line lapses to list, as a scaled one does', () => {
        const p = priced(24, 9000, { PriorListPrice: 10000 });
        expect(p.BaseSource).toBe('PriorList');
        expect(p.BasePrice).toBe(10000);
    });

    it('a successor renews at its own list, whatever the prior line covered', () => {
        const p = priced(24, 20000, { SuccessorListPrice: 12000 });
        expect(p.BaseSource).toBe('SuccessorList');
        expect(p.BasePrice).toBe(12000);
    });
});
