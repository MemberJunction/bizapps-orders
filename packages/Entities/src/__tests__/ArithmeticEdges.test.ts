/**
 * Arithmetic edges — the awkward numbers every other unit test avoids.
 *
 * WHY A SEPARATE FILE. The existing suites use figures that divide cleanly: 1000 split three ways,
 * 10% of 100, bands at 50 and 100. That proves the SHAPE of each algorithm and says nothing about
 * what happens at 1/3 of a penny. This app has four independent allocators — pro-rata for order
 * promotions, pro-rata for charges, proportional refunds, and tier arithmetic — and each of them
 * separately claims "the parts always sum to the whole". Four claims, one file that tries to break
 * them.
 *
 * The invariant under test is almost always the same: **the parts sum to the total, exactly, at two
 * decimal places, for every input.** A drift of one penny is not a rounding curiosity — it is an
 * order whose lines do not add up to its own total, and downstream that becomes a journal entry
 * that does not balance.
 */
import { describe, it, expect } from 'vitest';
import { AllocateProRata, ComputeAmount, Money, type PriceRule } from '../pricing/PricingBehavior.js';
import { ApplyPromotions, type PromotionContext, type PromotionRule } from '../pricing/PromotionBehavior.js';
import { ComputeCharges, type ChargeRequest, type ChargeableLine } from '../pricing/ChargeBehavior.js';

const sum = (xs: number[]) => Money(xs.reduce((a, b) => a + b, 0));

const rule = (over: Partial<PriceRule> = {}): PriceRule => ({
    ID: 'r',
    PricingModel: 'PerUnit',
    Amount: 10,
    PackageQuantity: null,
    MinQuantity: null,
    MaxQuantity: null,
    EffectiveFrom: new Date('2020-01-01T00:00:00'),
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

const promo = (over: Partial<PromotionRule> = {}): PromotionRule => ({
    ID: 'p',
    Code: 'P',
    Name: 'P',
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

const pctx = (over: Partial<PromotionContext> = {}): PromotionContext => ({
    BaseAmount: 1000,
    Quantity: 1,
    Level: 'Line',
    StackingMode: 'Sequential',
    AllowStacking: true,
    ...over,
});

const charge = (over: Partial<ChargeRequest> = {}): ChargeRequest => ({
    ChargeTypeID: 'ct',
    Code: 'SHIP',
    Category: 'Shipping',
    Basis: 'LineNet',
    Sequence: 10,
    Amount: 100,
    ...over,
});

const line = (id: string, net: number): ChargeableLine => ({ ID: id, Net: net });

// ── the numbers that break naive allocators ──────────────────────────────────
// Chosen so at least one is guaranteed to produce a repeating decimal per weight set.
const NASTY_TOTALS = [0.01, 0.03, 0.07, 1, 9.99, 10, 33.33, 100, 100.01, 333.33, 1000, 99999.99];
const NASTY_WEIGHTS = [
    [1, 1, 1],
    [1, 2],
    [1, 1, 1, 1, 1, 1, 1],
    [333.33, 333.33, 333.34],
    [0.01, 0.01, 99.98],
    [7, 11, 13],
    [1, 999999],
    [50, 50],
    [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
];

describe('AllocateProRata — the parts always sum to the whole', () => {
    it('holds for every combination of awkward total and awkward weights', () => {
        for (const total of NASTY_TOTALS) {
            for (const weights of NASTY_WEIGHTS) {
                const parts = AllocateProRata(total, weights);
                expect(sum(parts), `total ${total} over [${weights}]`).toBe(Money(total));
            }
        }
    });

    it('never emits a fraction of a penny', () => {
        for (const total of NASTY_TOTALS) {
            for (const weights of NASTY_WEIGHTS) {
                for (const part of AllocateProRata(total, weights)) {
                    expect(Math.round(part * 100), `part ${part} of ${total}`).toBeCloseTo(part * 100, 6);
                }
            }
        }
    });

    it('allocates one penny to exactly one recipient', () => {
        const parts = AllocateProRata(0.01, [1, 1, 1]);
        expect(sum(parts)).toBe(0.01);
        expect(parts.filter((p) => p !== 0)).toHaveLength(1);
    });

    it('handles a total smaller than the number of recipients', () => {
        // 3p across 7 lines: four lines get nothing, and that is correct.
        const parts = AllocateProRata(0.03, [1, 1, 1, 1, 1, 1, 1]);
        expect(sum(parts)).toBe(0.03);
    });

    it('gives a vanishingly small weight nothing rather than a rounding artefact', () => {
        const parts = AllocateProRata(100, [1, 999999]);
        expect(sum(parts)).toBe(100);
        expect(parts[0]).toBeLessThan(0.01);
    });

    it('is stable — the same inputs always give the same split', () => {
        const a = AllocateProRata(100, [7, 11, 13]);
        const b = AllocateProRata(100, [7, 11, 13]);
        expect(a).toEqual(b);
    });

    it('never allocates a negative share from positive weights', () => {
        for (const total of NASTY_TOTALS) {
            for (const parts of NASTY_WEIGHTS.map((w) => AllocateProRata(total, w))) {
                for (const p of parts) expect(p).toBeGreaterThanOrEqual(0);
            }
        }
    });
});

describe('ComputeAmount — tiers and packages at awkward quantities', () => {
    const bands = [
        { MinQuantity: 1, MaxQuantity: 50, Amount: 10, SortOrder: 0 },
        { MinQuantity: 51, MaxQuantity: null, Amount: 8, SortOrder: 1 },
    ];

    it('prices a FRACTIONAL quantity without drifting', () => {
        // 2.5 units at 3.33 is 8.325 — which must land on a penny, not carry a half.
        const amount = ComputeAmount(rule({ Amount: 3.33 }), 2.5);
        expect(Money(amount)).toBe(amount);
    });

    it('Tiered lands exactly on a band boundary', () => {
        const r = rule({ PricingModel: 'Tiered', Tiers: bands });
        expect(ComputeAmount(r, 50)).toBe(500);
        expect(ComputeAmount(r, 51)).toBe(508);
    });

    it('Volume flips at exactly the boundary, not one either side', () => {
        const r = rule({ PricingModel: 'Volume', Tiers: bands });
        expect(ComputeAmount(r, 50)).toBe(500);
        expect(ComputeAmount(r, 51)).toBe(408);
    });

    it('Package charges a partial pack pro-rata, at penny precision', () => {
        const r = rule({ PricingModel: 'Package', Amount: 100, PackageQuantity: 3 });
        // 1 of a 3-pack: 33.333… must round, and must not compound across quantities.
        const one = ComputeAmount(r, 1);
        expect(Money(one)).toBe(one);
        expect(ComputeAmount(r, 3)).toBe(100);
        expect(ComputeAmount(r, 6)).toBe(200);
    });

    it('a quantity of zero costs nothing rather than a full flat price', () => {
        expect(ComputeAmount(rule({ PricingModel: 'PerUnit' }), 0)).toBe(0);
    });

    it('very large quantities stay exact', () => {
        const amount = ComputeAmount(rule({ Amount: 0.01 }), 1_000_000);
        expect(amount).toBe(10000);
    });
});

describe('ApplyPromotions — awkward percentages', () => {
    it('a third off never leaves a fraction of a penny', () => {
        const out = ApplyPromotions([promo({ Value: 1 / 3 })], pctx({ BaseAmount: 100 }));
        expect(Money(out.TotalDiscount)).toBe(out.TotalDiscount);
        expect(Money(out.FinalAmount)).toBe(out.FinalAmount);
        expect(Money(out.TotalDiscount + out.FinalAmount)).toBe(100);
    });

    it('discount plus remainder always reconstructs the base', () => {
        for (const base of NASTY_TOTALS) {
            for (const pct of [1 / 3, 0.075, 0.3333, 0.999, 0.0001]) {
                const out = ApplyPromotions([promo({ Value: pct })], pctx({ BaseAmount: base }));
                expect(Money(out.TotalDiscount + out.FinalAmount), `${pct} of ${base}`).toBe(Money(base));
            }
        }
    });

    it('a stacked sequence still reconstructs the base', () => {
        const stack = [
            promo({ ID: 'a', Code: 'A', Value: 1 / 3, AllowsStacking: true, StackSequence: 1 }),
            promo({ ID: 'b', Code: 'B', Value: 0.075, AllowsStacking: true, StackSequence: 2 }),
            promo({ ID: 'c', Code: 'C', Value: 0.0001, AllowsStacking: true, StackSequence: 3 }),
        ];
        for (const base of NASTY_TOTALS) {
            const out = ApplyPromotions(stack, pctx({ BaseAmount: base }));
            expect(Money(out.TotalDiscount + out.FinalAmount), `stack on ${base}`).toBe(Money(base));
            // And every reported step must itself be a real money amount.
            for (const a of out.Applied) expect(Money(a.Amount)).toBe(a.Amount);
        }
    });

    it('ADDITIVE mode also reconstructs the base', () => {
        const stack = [
            promo({ ID: 'a', Code: 'A', Value: 1 / 3, AllowsStacking: true }),
            promo({ ID: 'b', Code: 'B', Value: 0.075, AllowsStacking: true }),
        ];
        for (const base of NASTY_TOTALS) {
            const out = ApplyPromotions(stack, pctx({ BaseAmount: base, StackingMode: 'Additive' }));
            expect(Money(out.TotalDiscount + out.FinalAmount), `additive on ${base}`).toBe(Money(base));
        }
    });

    it('a penny base survives a percentage', () => {
        const out = ApplyPromotions([promo({ Value: 0.5 })], pctx({ BaseAmount: 0.01 }));
        expect(Money(out.TotalDiscount + out.FinalAmount)).toBe(0.01);
    });
});

describe('ComputeCharges — allocation across awkward lines', () => {
    it('every charge allocates exactly, for every awkward shape', () => {
        const shapes: ChargeableLine[][] = [
            [line('a', 333.33), line('b', 333.33), line('c', 333.34)],
            [line('a', 0.01), line('b', 99.99)],
            [line('a', 7), line('b', 11), line('c', 13)],
            Array.from({ length: 13 }, (_, i) => line(`l${i}`, 1)),
        ];
        for (const lines of shapes) {
            for (const amount of NASTY_TOTALS) {
                const out = ComputeCharges([charge({ Amount: amount })], lines);
                for (const c of out.Charges) {
                    const allocated = sum(c.Allocations.map((a) => a.Amount));
                    expect(allocated, `${amount} over ${lines.length} lines`).toBe(c.Amount);
                }
            }
        }
    });

    it('a rate-based charge on an awkward base stays on a penny', () => {
        const out = ComputeCharges(
            [charge({ Code: 'TAX', Category: 'Tax', Amount: null, Rate: 0.08625 })],
            [line('a', 333.33)],
        );
        const amount = out.Charges[0].Amount;
        expect(Money(amount)).toBe(amount);
    });

    it('stacked tax layers on an awkward base each stay exact and never compound', () => {
        const layers = [
            charge({ Code: 'T1', Category: 'Tax', Basis: 'LineNetPlusCharges', Sequence: 100, Amount: null, Rate: 0.0725 }),
            charge({ Code: 'T2', Category: 'Tax', Basis: 'LineNetPlusCharges', Sequence: 101, Amount: null, Rate: 0.01875 }),
        ];
        const out = ComputeCharges(layers, [line('a', 333.33)]);
        // Both layers compute on the SAME base — the second must not see the first.
        expect(out.Charges[0].BasisAmount).toBe(out.Charges[1].BasisAmount);
        for (const c of out.Charges) expect(Money(c.Amount)).toBe(c.Amount);
    });

    it('shipping enlarges the taxable base but tax does not', () => {
        const out = ComputeCharges(
            [
                charge({ Code: 'SHIP', Sequence: 10, Amount: 33.33 }),
                charge({ Code: 'TAX', Category: 'Tax', Basis: 'LineNetPlusCharges', Sequence: 100, Amount: null, Rate: 0.1 }),
                charge({ Code: 'TAX2', Category: 'Tax', Basis: 'LineNetPlusCharges', Sequence: 101, Amount: null, Rate: 0.05 }),
            ],
            [line('a', 100)],
        );
        // Taxable base = 100 + 33.33 shipping = 133.33 for BOTH tax layers.
        expect(out.Charges[1].BasisAmount).toBe(133.33);
        expect(out.Charges[2].BasisAmount).toBe(133.33);
    });

    it('a charge of one penny across many lines still allocates exactly', () => {
        const lines = Array.from({ length: 13 }, (_, i) => line(`l${i}`, 100));
        const out = ComputeCharges([charge({ Amount: 0.01 })], lines);
        expect(sum(out.Charges[0].Allocations.map((a) => a.Amount))).toBe(0.01);
    });
});
