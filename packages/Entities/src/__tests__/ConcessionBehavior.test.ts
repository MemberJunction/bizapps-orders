import { describe, expect, it } from 'vitest';
import {
    AssessConcession,
    ConcessionAlwaysEscalates,
    ConcessionShare,
    ConcessionValue,
    DaysAdded,
    PaymentTermsDaysChange,
    InclusiveDays,
    TermDateChangeDays,
    ConcessionTierMet,
    PickConcessionTier,
    type ConcessionAuthority,
    type ConcessionTierRule,
} from '../pricing/ConcessionBehavior';

/**
 * A concession's value, whatever form it was delivered in — golive #222.
 *
 * The guardrails valued a concession only as a percentage off price, so a term extended at no
 * charge was worth 0% and cleared every check. These pin that each form resolves to the same kind
 * of figure, and that authority is judged on it.
 */
const authority = (overrides: Partial<ConcessionAuthority> = {}): ConcessionAuthority => ({
    ID: 'auth-1',
    MaxDiscountPct: 0.1,
    MaxConcessionValue: 5000,
    MaxTermExtensionDays: 31,
    MaxConcessionPctOfContract: null,
    ...overrides,
});

describe('ConcessionValue', () => {
    it('values a no-charge term extension at the term\'s own rate', () => {
        // A 56,000 annual term (365 days) extended by 90 days at no charge. At 0% off it used to be
        // worth nothing; at the term's rate it is 90/365 of the year.
        const term = InclusiveDays(new Date('2026-01-01'), new Date('2026-12-31'));
        expect(term).toBe(365);
        const added = DaysAdded(new Date('2026-12-31'), new Date('2027-03-31'));
        expect(added).toBe(90);
        expect(ConcessionValue({ Form: 'Duration', TermAmount: 56000, TermDays: term, AddedDays: added }))
            .toEqual({ Value: 13808.22, Percent: null });
    });

    it('values a price concession as the reduction from the reference price', () => {
        const v = ConcessionValue({ Form: 'Price', ReferenceUnitPrice: 1000, ChargedUnitPrice: 800, Quantity: 3 });
        expect(v.Value).toBe(600);
        expect(v.Percent).toBeCloseTo(0.2, 9);
    });

    it('values a product added at no charge at its full reference price', () => {
        expect(ConcessionValue({ Form: 'Scope', ReferenceUnitPrice: 250, ChargedUnitPrice: 0, Quantity: 2 }))
            .toEqual({ Value: 500, Percent: 1 });
    });

    it('values added seats at the line\'s unit price', () => {
        expect(ConcessionValue({ Form: 'Seats', UnitPrice: 120, AddedQuantity: 5 })).toEqual({ Value: 600, Percent: null });
    });

    it('treats a price above the reference as no concession', () => {
        expect(ConcessionValue({ Form: 'Price', ReferenceUnitPrice: 100, ChargedUnitPrice: 120, Quantity: 1 }).Value).toBe(0);
    });

    it('does not divide by a term with no length', () => {
        expect(ConcessionValue({ Form: 'Duration', TermAmount: 1000, TermDays: 0, AddedDays: 10 }).Value).toBe(0);
    });
});

describe('AssessConcession', () => {
    const extension = ConcessionValue({ Form: 'Duration', TermAmount: 56000, TermDays: 365, AddedDays: 90 });

    it('escalates the extension a percentage cap never saw', () => {
        const result = AssessConcession('Duration', extension, authority(), 90);
        expect(result.WithinAuthority).toBe(false);
        expect(result.Breaches).toHaveLength(2);
        expect(result.Breaches.join(' ')).toMatch(/concession limit/);
        expect(result.Breaches.join(' ')).toMatch(/90-day change to the term's dates is at or above the 31-day limit/);
    });

    it('lets a rep grant an extension inside both limits', () => {
        const small = ConcessionValue({ Form: 'Duration', TermAmount: 12000, TermDays: 365, AddedDays: 14 });
        expect(AssessConcession('Duration', small, authority(), 14)).toEqual({ WithinAuthority: true, Breaches: [] });
    });

    it('escalates an extension at the day limit, and passes one a day short of it', () => {
        const limit = authority({ MaxTermExtensionDays: 30 });
        const at = ConcessionValue({ Form: 'Duration', TermAmount: 1200, TermDays: 365, AddedDays: 30 });
        const under = ConcessionValue({ Form: 'Duration', TermAmount: 1200, TermDays: 365, AddedDays: 29 });
        expect(AssessConcession('Duration', at, limit, 30).Breaches).toEqual([
            "a 30-day change to the term's dates is at or above the 30-day limit",
        ]);
        expect(AssessConcession('Duration', under, limit, 29).WithinAuthority).toBe(true);
    });

    it('treats an unset extension or value limit as no authority, not as unlimited', () => {
        const small = ConcessionValue({ Form: 'Duration', TermAmount: 1200, TermDays: 365, AddedDays: 1 });
        const noLimits = authority({ MaxConcessionValue: null, MaxTermExtensionDays: null });
        const result = AssessConcession('Duration', small, noLimits, 1);
        expect(result.WithinAuthority).toBe(false);
        expect(result.Breaches).toHaveLength(2);
    });

    describe('any change to a term\'s dates, not only days added — #307', () => {
        // A 12-month term, and the same term extended, shortened and shifted by `days`.
        const term = { StartDate: new Date('2026-01-01'), EndDate: new Date('2026-12-31') };
        const moved = (startDays: number, endDays: number) => ({
            StartDate: new Date(term.StartDate.getTime() + startDays * 86_400_000),
            EndDate: new Date(term.EndDate.getTime() + endDays * 86_400_000),
        });
        const changes = {
            extension: (days: number) => moved(0, days),
            shortening: (days: number) => moved(0, -days),
            shift: (days: number) => moved(days, days),
        };
        const limit = authority({ MaxTermExtensionDays: 30 });
        const none = { Value: 0, Percent: null };

        for (const [name, change] of Object.entries(changes)) {
            it(`measures a ${name} of N days as N`, () => {
                expect(TermDateChangeDays(term, change(30))).toBe(30);
            });

            it(`escalates a ${name} of N days at a limit of N, and passes one of N − 1`, () => {
                expect(AssessConcession('Duration', none, limit, TermDateChangeDays(term, change(30))).Breaches).toEqual([
                    "a 30-day change to the term's dates is at or above the 30-day limit",
                ]);
                expect(AssessConcession('Duration', none, limit, TermDateChangeDays(term, change(29))).WithinAuthority).toBe(true);
            });
        }

        it('measures a change as the larger of how far the start and the end move', () => {
            expect(TermDateChangeDays(term, moved(-10, 25))).toBe(25);
            expect(TermDateChangeDays(term, moved(-40, 5))).toBe(40);
        });

        it('checks a date change made through a concession of another form', () => {
            const price = { Value: 0, Percent: 0 };
            expect(AssessConcession('Price', price, limit, 30).WithinAuthority).toBe(false);
            expect(AssessConcession('Price', price, limit, 0).WithinAuthority).toBe(true);
        });
    });

    it('escalates a price concession on EITHER the percentage or the absolute value', () => {
        // 5% off a very large line: inside the percentage cap, outside the value limit.
        const big = ConcessionValue({ Form: 'Price', ReferenceUnitPrice: 200000, ChargedUnitPrice: 190000, Quantity: 1 });
        const result = AssessConcession('Price', big, authority(), null);
        expect(result.WithinAuthority).toBe(false);
        expect(result.Breaches).toEqual(['a value of 10000.00 exceeds the 5000.00 concession limit']);
    });

    it('keeps an unset value limit meaning "percentage cap only" for price concessions', () => {
        const v = ConcessionValue({ Form: 'Price', ReferenceUnitPrice: 200000, ChargedUnitPrice: 190000, Quantity: 1 });
        expect(AssessConcession('Price', v, authority({ MaxConcessionValue: null }), null).WithinAuthority).toBe(true);
    });

    it('holds a no-charge product to the percentage cap, which it always exceeds', () => {
        const v = ConcessionValue({ Form: 'Scope', ReferenceUnitPrice: 50, ChargedUnitPrice: 0, Quantity: 1 });
        const result = AssessConcession('Scope', v, authority(), null);
        expect(result.WithinAuthority).toBe(false);
        expect(result.Breaches).toEqual(['100.0% off is above the 10.0% cap']);
    });

    it('grants nothing to a requester with no SalesAuthority', () => {
        expect(AssessConcession('Seats', { Value: 1, Percent: null }, null, null).WithinAuthority).toBe(false);
    });
});

describe('a change of payment terms (#309)', () => {
    it('is worth the change in days to payment, positive when the customer pays later', () => {
        expect(PaymentTermsDaysChange(30, 60)).toBe(30);
        expect(PaymentTermsDaysChange(60, 30)).toBe(-30);
    });

    it('reads terms with no NetDays, or no terms at all, as due on receipt', () => {
        expect(PaymentTermsDaysChange(null, 45)).toBe(45);
        expect(PaymentTermsDaysChange(30, null)).toBe(-30);
    });

    it('always escalates, unlike every other form', () => {
        expect(ConcessionAlwaysEscalates('Terms')).toBe(true);
        for (const form of ['Price', 'Duration', 'Scope', 'Seats'] as const) {
            expect(ConcessionAlwaysEscalates(form)).toBe(false);
        }
    });
});

/**
 * Concessions as a share of the order they are given on (#306). A currency limit treats a small
 * order and a large one alike; the share limit measures every concession on the order, together,
 * against the order's net total.
 */
describe('share of the order', () => {
    const roomy = (share: number | null) =>
        authority({ MaxConcessionValue: 1_000_000, MaxTermExtensionDays: 366, MaxDiscountPct: 1, MaxConcessionPctOfContract: share });

    it('divides every concession on the order by its net total', () => {
        expect(ConcessionShare(500, 10000)).toBeCloseTo(0.05, 9);
        expect(ConcessionShare(0, 10000)).toBe(0);
    });

    it('has no share when the order has no net total', () => {
        expect(ConcessionShare(100, 0)).toBeNull();
        expect(ConcessionShare(100, -5)).toBeNull();
    });

    it('escalates a Duration concession at the share limit and passes one just below it', () => {
        // A 12,000 annual order. 5% of it is 600, about 18 days at the term's own rate.
        const limit = roomy(0.05);
        const at = ConcessionValue({ Form: 'Duration', TermAmount: 12000, TermDays: 365, AddedDays: 19 });
        const under = ConcessionValue({ Form: 'Duration', TermAmount: 12000, TermDays: 365, AddedDays: 18 });
        expect(AssessConcession('Duration', at, limit, 19, ConcessionShare(at.Value, 12000)).Breaches).toEqual([
            'concessions on the order come to 5.2% of its net total, at or above the 5.0% limit',
        ]);
        expect(AssessConcession('Duration', under, limit, 18, ConcessionShare(under.Value, 12000)).WithinAuthority).toBe(true);
    });

    it('treats a share exactly at the limit as at or above it', () => {
        expect(AssessConcession('Seats', { Value: 500, Percent: null }, roomy(0.05), null, ConcessionShare(500, 10000)).WithinAuthority)
            .toBe(false);
    });

    it('escalates the same value on a small order and passes it on a large one', () => {
        const seats = ConcessionValue({ Form: 'Seats', UnitPrice: 100, AddedQuantity: 10 });
        expect(AssessConcession('Seats', seats, roomy(0.05), null, ConcessionShare(seats.Value, 8000)).WithinAuthority).toBe(false);
        expect(AssessConcession('Seats', seats, roomy(0.05), null, ConcessionShare(seats.Value, 80000)).WithinAuthority).toBe(true);
    });

    it('applies to Price and Scope concessions as well', () => {
        const price = ConcessionValue({ Form: 'Price', ReferenceUnitPrice: 1000, ChargedUnitPrice: 950, Quantity: 2 });
        const scope = ConcessionValue({ Form: 'Scope', ReferenceUnitPrice: 300, ChargedUnitPrice: 0, Quantity: 1 });
        expect(AssessConcession('Price', price, roomy(0.05), null, ConcessionShare(price.Value, 1900)).WithinAuthority).toBe(false);
        expect(AssessConcession('Price', price, roomy(0.05), null, ConcessionShare(price.Value, 19000)).WithinAuthority).toBe(true);
        expect(AssessConcession('Scope', scope, roomy(0.05), null, ConcessionShare(scope.Value, 5000)).WithinAuthority).toBe(false);
        expect(AssessConcession('Scope', scope, roomy(0.05), null, ConcessionShare(scope.Value, 7000)).WithinAuthority).toBe(true);
    });

    it('counts the concessions already on the order, so splitting one does not get under the limit', () => {
        // Two 300 concessions on a 10,000 order: 3% each, 6% together.
        const each = { Value: 300, Percent: null };
        expect(AssessConcession('Seats', each, roomy(0.05), null, ConcessionShare(300, 10000)).WithinAuthority).toBe(true);
        expect(AssessConcession('Seats', each, roomy(0.05), null, ConcessionShare(300 + 300, 10000)).WithinAuthority).toBe(false);
    });

    it('breaches a set limit when the order has no net total to measure against', () => {
        expect(AssessConcession('Seats', { Value: 10, Percent: null }, roomy(0.05), null, null).Breaches).toEqual([
            'the order has no net total to measure its concessions against the 5.0% share limit',
        ]);
    });

    it('sets no limit when MaxConcessionPctOfContract is unset, or when nothing was measured', () => {
        expect(AssessConcession('Seats', { Value: 900, Percent: null }, roomy(null), null, 0.9).WithinAuthority).toBe(true);
        expect(AssessConcession('Seats', { Value: 900, Percent: null }, roomy(0.05), null).WithinAuthority).toBe(true);
    });
});

describe('approval tiers (#308)', () => {
    const tier = (overrides: Partial<ConcessionTierRule> = {}): ConcessionTierRule => ({
        ID: 'rule-base',
        Name: 'Manager',
        ApprovalRequiredRoleID: 'role-manager',
        ConcessionTier: null,
        MinConcessionValue: null,
        MinConcessionPctOfContract: null,
        MinTermExtensionDays: null,
        RequiresDecisionWithinAuthority: false,
        ...overrides,
    });
    const manager = tier();
    const director = tier({ ID: 'rule-senior', Name: 'Director', ApprovalRequiredRoleID: 'role-director', ConcessionTier: 1, MinConcessionValue: 1000 });

    it('keeps a single rule with no tier or thresholds taking every concession', () => {
        expect(PickConcessionTier([manager], { Value: 5 }).Rule?.ID).toBe('rule-base');
        expect(PickConcessionTier([manager], { Value: 1_000_000, CumulativeShare: 0.9, TermDateChangeDays: 400 }).Rule?.ID).toBe('rule-base');
    });

    it('routes below the thresholds to the lower tier, and at or above them to the higher tier', () => {
        expect(PickConcessionTier([director, manager], { Value: 999.99 }).Rule?.ID).toBe('rule-base');
        expect(PickConcessionTier([director, manager], { Value: 1000 }).Rule?.ID).toBe('rule-senior');
        expect(PickConcessionTier([manager, director], { Value: 5000 }).Rule?.ID).toBe('rule-senior');
    });

    it('meets a tier on any one threshold it sets', () => {
        const senior = tier({ ConcessionTier: 1, MinConcessionValue: 1000, MinConcessionPctOfContract: 0.1, MinTermExtensionDays: 60 });
        expect(ConcessionTierMet(senior, { Value: 10, CumulativeShare: 0.1 })).toBe(true);
        expect(ConcessionTierMet(senior, { Value: 10, TermDateChangeDays: 60 })).toBe(true);
        expect(ConcessionTierMet(senior, { Value: 10, TermDateChangeDays: -60 })).toBe(true);
        expect(ConcessionTierMet(senior, { Value: 10, CumulativeShare: 0.0999, TermDateChangeDays: 59 })).toBe(false);
    });

    it('meets a share threshold when the order has no net total, as a share limit is breached', () => {
        const senior = tier({ ConcessionTier: 1, MinConcessionPctOfContract: 0.1 });
        expect(ConcessionTierMet(senior, { Value: 10, CumulativeShare: null })).toBe(true);
        expect(ConcessionTierMet(senior, { Value: 10 })).toBe(false);
    });

    it('does not meet a term-date threshold when the dates do not move, even one of 0 days', () => {
        expect(ConcessionTierMet(tier({ MinTermExtensionDays: 0 }), { Value: 10, TermDateChangeDays: 0 })).toBe(false);
        expect(ConcessionTierMet(tier({ MinTermExtensionDays: 0 }), { Value: 10, TermDateChangeDays: 1 })).toBe(true);
    });

    it('chooses no tier when the concession meets none', () => {
        expect(PickConcessionTier([director], { Value: 10 })).toEqual({ Rule: null, Conflict: null });
        expect(PickConcessionTier([], { Value: 10 })).toEqual({ Rule: null, Conflict: null });
    });

    it('reports two met tiers of one rank instead of picking one', () => {
        const other = tier({ ID: 'rule-other', Name: 'Finance' });
        const choice = PickConcessionTier([manager, other], { Value: 10 });
        expect(choice.Rule).toBeNull();
        expect(choice.Conflict).toContain("'Manager', 'Finance' share tier 0");
    });

    it('ignores a rank tie between tiers the concession does not meet', () => {
        const otherSenior = tier({ ID: 'rule-other', Name: 'Finance', ConcessionTier: 1, MinConcessionValue: 50_000 });
        expect(PickConcessionTier([manager, director, otherSenior], { Value: 2000 }).Rule?.ID).toBe('rule-senior');
    });
});
