/**
 * Unit tests for the PURE pricing engine (plan D69). No database.
 *
 * The two areas worth the effort:
 *   - VOLUME vs TIERED. The industry uses these words inconsistently, so the tests pin the
 *     definitions rather than merely exercising the code. Getting them the wrong way round produces
 *     a plausible number for every input, which is exactly the kind of wrong nothing notices.
 *   - AMBIGUITY. `PickPriceRule` must REPORT a priority tie rather than resolve it. A silent winner
 *     decided by array order is stable in a test and liable to flip in production.
 */
import { describe, it, expect } from 'vitest';
import {
    AllocateProRata,
    ComputeAmount,
    IsRuleApplicable,
    Money,
    PickPriceRule,
    type PriceRule,
    type PriceTierRule,
} from '../PricingBehavior.js';

const d = (iso: string): Date => new Date(iso);

const rule = (over: Partial<PriceRule> = {}): PriceRule => ({
    ID: 'r1',
    PricingModel: 'PerUnit',
    Amount: 10,
    PackageQuantity: null,
    MinQuantity: null,
    MaxQuantity: null,
    EffectiveFrom: d('2026-01-01T00:00:00'),
    EffectiveTo: null,
    RecurrenceMonths: null,
    RecurrenceDaysOfWeek: null,
    RecurrenceDayOfMonthMin: null,
    RecurrenceDayOfMonthMax: null,
    TimeOfDayStart: null,
    TimeOfDayEnd: null,
    Priority: 0,
    Status: 'Active',
    ...over,
});

const tier = (min: number, max: number | null, amount: number, sort = 0): PriceTierRule => ({
    MinQuantity: min,
    MaxQuantity: max,
    Amount: amount,
    SortOrder: sort,
});

// ── applicability ────────────────────────────────────────────────────────────

describe('IsRuleApplicable', () => {
    const ctx = { Quantity: 10, AsOf: d('2026-07-15T12:00:00') };

    it('applies an open rule', () => {
        expect(IsRuleApplicable(rule(), ctx)).toBeNull();
    });

    it('rejects an inactive rule regardless of everything else', () => {
        expect(IsRuleApplicable(rule({ Status: 'Inactive' }), ctx)).toBe('Inactive');
    });

    it('honours the quantity band at both ends', () => {
        expect(IsRuleApplicable(rule({ MinQuantity: 20 }), ctx)).toBe('QuantityBelowMin');
        expect(IsRuleApplicable(rule({ MaxQuantity: 5 }), ctx)).toBe('QuantityAboveMax');
        expect(IsRuleApplicable(rule({ MinQuantity: 10, MaxQuantity: 10 }), ctx)).toBeNull();
    });

    it('honours the absolute window, inclusively on both bounds', () => {
        expect(IsRuleApplicable(rule({ EffectiveFrom: d('2026-08-01') }), ctx)).toBe('NotYetEffective');
        expect(IsRuleApplicable(rule({ EffectiveTo: d('2026-06-30') }), ctx)).toBe('Expired');
        expect(IsRuleApplicable(rule({ EffectiveFrom: d('2026-07-15'), EffectiveTo: d('2026-07-15') }), ctx)).toBeNull();
    });

    it('compares the absolute window by DAY, not by instant', () => {
        // EffectiveFrom/To are SQL DATE columns, which arrive as midnight UTC — and JS parses a bare
        // '2026-07-15' as UTC while parsing '2026-07-15T12:00' as LOCAL. Reading the bound with local
        // getters would shift it a day back for anyone west of UTC and expire rules a day early, so
        // the bound is read in UTC terms and the moment in local terms. These two assertions are what
        // catch that, and they only bite in a non-UTC timezone.
        const justAfterMidnight = { Quantity: 1, AsOf: d('2026-07-15T00:01:00') };
        expect(IsRuleApplicable(rule({ EffectiveFrom: d('2026-07-15') }), justAfterMidnight)).toBeNull();

        const lateEvening = { Quantity: 1, AsOf: d('2026-07-15T23:59:00') };
        expect(IsRuleApplicable(rule({ EffectiveTo: d('2026-07-15') }), lateEvening)).toBeNull();
    });

    it('honours a seasonal month list', () => {
        expect(IsRuleApplicable(rule({ RecurrenceMonths: '11,12' }), ctx)).toBe('MonthExcluded');
        expect(IsRuleApplicable(rule({ RecurrenceMonths: '7' }), ctx)).toBeNull();
    });

    it('honours a weekday list, with Monday as 1', () => {
        // 2026-07-15 is a Wednesday -> ISO 3.
        expect(IsRuleApplicable(rule({ RecurrenceDaysOfWeek: '1,2' }), ctx)).toBe('DayOfWeekExcluded');
        expect(IsRuleApplicable(rule({ RecurrenceDaysOfWeek: '3' }), ctx)).toBeNull();
    });

    it('treats Sunday as 7 rather than 0', () => {
        const sunday = { Quantity: 1, AsOf: d('2026-07-19T12:00:00') }; // a Sunday
        expect(IsRuleApplicable(rule({ RecurrenceDaysOfWeek: '7' }), sunday)).toBeNull();
        expect(IsRuleApplicable(rule({ RecurrenceDaysOfWeek: '1' }), sunday)).toBe('DayOfWeekExcluded');
    });

    it('honours a day-of-month window', () => {
        expect(IsRuleApplicable(rule({ RecurrenceDayOfMonthMin: 20 }), ctx)).toBe('DayOfMonthExcluded');
        expect(IsRuleApplicable(rule({ RecurrenceDayOfMonthMax: 10 }), ctx)).toBe('DayOfMonthExcluded');
        expect(IsRuleApplicable(rule({ RecurrenceDayOfMonthMin: 1, RecurrenceDayOfMonthMax: 15 }), ctx)).toBeNull();
    });

    it('honours a time-of-day window', () => {
        expect(IsRuleApplicable(rule({ TimeOfDayStart: '14:00' }), ctx)).toBe('TimeOfDayExcluded');
        expect(IsRuleApplicable(rule({ TimeOfDayEnd: '11:00' }), ctx)).toBe('TimeOfDayExcluded');
        expect(IsRuleApplicable(rule({ TimeOfDayStart: '09:00', TimeOfDayEnd: '17:00' }), ctx)).toBeNull();
    });

    it('handles an OVERNIGHT window that wraps midnight', () => {
        // 22:00–02:00 is a real happy-hour shape. Treated as a plain range it would never match.
        const lateNight = rule({ TimeOfDayStart: '22:00', TimeOfDayEnd: '02:00' });
        expect(IsRuleApplicable(lateNight, { Quantity: 1, AsOf: d('2026-07-15T23:30:00') })).toBeNull();
        expect(IsRuleApplicable(lateNight, { Quantity: 1, AsOf: d('2026-07-15T01:30:00') })).toBeNull();
        expect(IsRuleApplicable(lateNight, { Quantity: 1, AsOf: d('2026-07-15T12:00:00') })).toBe('TimeOfDayExcluded');
    });
});

// ── which rule wins ──────────────────────────────────────────────────────────

describe('PickPriceRule', () => {
    const ctx = { Quantity: 10, AsOf: d('2026-07-15T12:00:00') };

    it('returns -1 when nothing applies', () => {
        expect(PickPriceRule([rule({ Status: 'Inactive' })], ctx).Index).toBe(-1);
    });

    it('picks the only applicable rule', () => {
        const pick = PickPriceRule([rule({ MinQuantity: 100 }), rule({ ID: 'r2' })], ctx);
        expect(pick.Index).toBe(1);
        expect(pick.AmbiguousWith).toBeUndefined();
    });

    it('highest priority wins', () => {
        const pick = PickPriceRule(
            [rule({ ID: 'a', Priority: 10 }), rule({ ID: 'b', Priority: 50 }), rule({ ID: 'c', Priority: 20 })],
            ctx,
        );
        expect(pick.Index).toBe(1);
    });

    it('REPORTS a tie rather than resolving it', () => {
        // The whole point: two equally-applicable rules must not silently produce a winner.
        const pick = PickPriceRule([rule({ ID: 'a', Priority: 10 }), rule({ ID: 'b', Priority: 10 })], ctx);
        expect(pick.AmbiguousWith).toEqual([0, 1]);
    });

    it('does not report a tie among rules that lost on priority', () => {
        const pick = PickPriceRule(
            [rule({ ID: 'a', Priority: 5 }), rule({ ID: 'b', Priority: 5 }), rule({ ID: 'c', Priority: 9 })],
            ctx,
        );
        expect(pick.Index).toBe(2);
        expect(pick.AmbiguousWith).toBeUndefined();
    });

    it('ignores inapplicable rules when detecting a tie', () => {
        const pick = PickPriceRule(
            [rule({ ID: 'a', Priority: 7 }), rule({ ID: 'b', Priority: 7, Status: 'Inactive' })],
            ctx,
        );
        expect(pick.Index).toBe(0);
        expect(pick.AmbiguousWith).toBeUndefined();
    });
});

// ── the money ────────────────────────────────────────────────────────────────

describe('ComputeAmount', () => {
    it('Flat charges the same however many units', () => {
        expect(ComputeAmount(rule({ PricingModel: 'Flat', Amount: 250 }), 1)).toBe(250);
        expect(ComputeAmount(rule({ PricingModel: 'Flat', Amount: 250 }), 40)).toBe(250);
    });

    it('PerUnit multiplies', () => {
        expect(ComputeAmount(rule({ PricingModel: 'PerUnit', Amount: 12.5 }), 4)).toBe(50);
    });

    // VOLUME vs TIERED — the definitions, pinned. Same bands, same quantity, different answers.
    const bands = [tier(1, 50, 10), tier(51, null, 8)];

    it('VOLUME prices the WHOLE quantity at the band it lands in', () => {
        const r = rule({ PricingModel: 'Volume', Amount: 10, Tiers: bands });
        expect(ComputeAmount(r, 100)).toBe(800); // 100 x 8
        expect(ComputeAmount(r, 30)).toBe(300); // 30 x 10
    });

    it('TIERED prices each band separately and sums them', () => {
        const r = rule({ PricingModel: 'Tiered', Amount: 10, Tiers: bands });
        expect(ComputeAmount(r, 100)).toBe(900); // (50 x 10) + (50 x 8)
        expect(ComputeAmount(r, 30)).toBe(300); // wholly inside the first band
    });

    it('the two models DIFFER on the same inputs — the distinction is real', () => {
        const vol = ComputeAmount(rule({ PricingModel: 'Volume', Amount: 10, Tiers: bands }), 100);
        const tie = ComputeAmount(rule({ PricingModel: 'Tiered', Amount: 10, Tiers: bands }), 100);
        expect(vol).not.toBe(tie);
    });

    it('TIERED keeps the top band rate past the last bound rather than falling off a cliff', () => {
        const r = rule({ PricingModel: 'Tiered', Amount: 10, Tiers: [tier(1, 50, 10), tier(51, 100, 8)] });
        // 150 units: 50@10 + 50@8 + 50 more still at 8
        expect(ComputeAmount(r, 150)).toBe(500 + 400 + 400);
    });

    it('VOLUME below the lowest band falls back to the rule amount, not to free', () => {
        const r = rule({ PricingModel: 'Volume', Amount: 15, Tiers: [tier(10, null, 8)] });
        expect(ComputeAmount(r, 5)).toBe(75); // 5 x 15, NOT 0
    });

    it('Package prices whole packs plus a pro-rata remainder', () => {
        const r = rule({ PricingModel: 'Package', Amount: 120, PackageQuantity: 12 });
        expect(ComputeAmount(r, 12)).toBe(120);
        expect(ComputeAmount(r, 24)).toBe(240);
        // 13 must NOT cost the same as 24 — that is what a naive ceil() would do.
        expect(ComputeAmount(r, 13)).toBe(130);
    });

    it('Package without a quantity is an error, not a divide by zero', () => {
        expect(() => ComputeAmount(rule({ PricingModel: 'Package', Amount: 100 }), 5)).toThrow(/PackageQuantity/);
    });

    it('Usage REFUSES rather than silently resolving', () => {
        expect(() => ComputeAmount(rule({ PricingModel: 'Usage', Amount: 1 }), 5)).toThrow(/not implemented/i);
    });

    it('rejects a negative quantity', () => {
        expect(() => ComputeAmount(rule(), -1)).toThrow(/negative/);
    });
});

// ── allocation ───────────────────────────────────────────────────────────────

describe('AllocateProRata', () => {
    it('splits proportionally', () => {
        expect(AllocateProRata(100, [300, 100])).toEqual([75, 25]);
    });

    it('ALWAYS sums to the total, with the largest weight absorbing the remainder', () => {
        const parts = AllocateProRata(100, [1, 1, 1]);
        expect(Money(parts.reduce((a, b) => a + b, 0))).toBe(100);
    });

    it('puts the rounding drift on the LARGEST share, where it distorts least', () => {
        // 100 across three equal weights is 33.333... — the parts round to 99.99 and a penny of
        // drift has to land somewhere.
        const parts = AllocateProRata(100, [1, 1, 1]);
        expect(Money(parts.reduce((a, b) => a + b, 0))).toBe(100);
        expect(parts).toEqual([33.34, 33.33, 33.33]);

        // With unequal weights the penny lands on the biggest share, not the first.
        const skewed = AllocateProRata(100, [1, 1, 4]);
        expect(Money(skewed.reduce((a, b) => a + b, 0))).toBe(100);
        expect(skewed[2]).toBeGreaterThan(skewed[0]);
    });

    it('spreads evenly when there is no basis to weight by', () => {
        const parts = AllocateProRata(9, [0, 0, 0]);
        expect(Money(parts.reduce((a, b) => a + b, 0))).toBe(9);
    });

    it('returns nothing for no weights', () => {
        expect(AllocateProRata(50, [])).toEqual([]);
    });
});
