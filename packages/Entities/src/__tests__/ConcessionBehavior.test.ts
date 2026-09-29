import { describe, expect, it } from 'vitest';
import {
    AssessConcession,
    ConcessionValue,
    DaysAdded,
    InclusiveDays,
    TermDateChangeDays,
    type ConcessionAuthority,
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
