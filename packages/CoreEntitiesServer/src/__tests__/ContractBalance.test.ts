import { describe, expect, it } from 'vitest';

import { SplitContraLegs, type ContraDirection } from '../ContractBalance.js';

const money = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

describe('SplitContraLegs — the two ordering rules (D92)', () => {
    it('rule 1 with no unbilled balance is simply Cr Deferred — the Blue Cypress norm', () => {
        // Billed in advance: recognition never runs ahead, so Unbilled never appears.
        expect(SplitContraLegs(25_000, 0, 25_000, 'Invoice')).toEqual({ Deferred: 25_000, Unbilled: 0 });
    });

    it('rule 1 relieves an unbilled balance FIRST, then opens Deferred', () => {
        // R − B = 15,000 sitting in Unbilled; a 25,000 invoice clears it and defers the rest.
        expect(SplitContraLegs(25_000, 40_000, 25_000, 'Invoice')).toEqual({ Deferred: 10_000, Unbilled: 15_000 });
    });

    it('rule 2 with a deferred balance is simply Dr Deferred', () => {
        expect(SplitContraLegs(50_000, 40_000, 5_000, 'Recognize')).toEqual({ Deferred: 5_000, Unbilled: 0 });
    });

    it('rule 2 relieves the deferred balance FIRST, then opens Unbilled', () => {
        // B − R = 25,000 in Deferred; recognising 40,000 exhausts it and 15,000 becomes a contract asset.
        expect(SplitContraLegs(25_000, 0, 40_000, 'Recognize')).toEqual({ Deferred: 25_000, Unbilled: 15_000 });
    });

    it('a backward attestation is the same subtraction with a negative sign', () => {
        // Month 7 of Scenario 4: 45% slides to 40%. Comes back out of Deferred, signed.
        expect(SplitContraLegs(75_000, 45_000, -5_000, 'Recognize')).toEqual({ Deferred: -5_000, Unbilled: 0 });
    });

    it('the two pieces always sum to the amount exactly, so the entry balances by construction', () => {
        const cases: Array<[number, number, number, ContraDirection]> = [
            [0, 0, 100.01, 'Invoice'],
            [33.33, 66.67, 12.34, 'Invoice'],
            [1_000.01, 999.99, 0.02, 'Recognize'],
            [7, 19, 13.37, 'Recognize'],
            [19, 7, -13.37, 'Recognize'],
            [7, 19, -0.01, 'Invoice'],
        ];
        for (const [b, r, amt, dir] of cases) {
            const legs = SplitContraLegs(b, r, amt, dir);
            expect(money(legs.Deferred + legs.Unbilled)).toBe(money(amt));
        }
    });

    it('a REVERSAL line: the rule reads magnitudes, the caller carries the sign', () => {
        // BilledToDate and RecognizedToDate are stored signed — negative on a reversal line — so an
        // origin and its reversals net to zero. The ordering rule itself is about magnitudes,
        // though: a reversal relieves the same balances in the same order, in the other direction.
        // So callers pass absolute values and mirror the finished entry once, exactly as the
        // journal factory has always handled a negative quantity (D16).
        const origin = SplitContraLegs(25_000, 40_000, 25_000, 'Invoice');
        const reversal = SplitContraLegs(Math.abs(-25_000), Math.abs(-40_000), Math.abs(-25_000), 'Invoice');
        expect(reversal).toEqual(origin);
        // …and the two net to nothing once the reversal's sign is applied by the caller.
        expect(money(origin.Deferred - reversal.Deferred)).toBe(0);
        expect(money(origin.Unbilled - reversal.Unbilled)).toBe(0);
    });

    it('a zero amount produces no legs at all', () => {
        expect(SplitContraLegs(10, 5, 0, 'Invoice')).toEqual({ Deferred: 0, Unbilled: 0 });
    });
});

/**
 * Andrew's Scenario 4 walked end to end (#227, issuecomment-5778003562): a $100,000 project on four
 * quarterly instalments of $25,000 in advance, attested monthly, including a backward slide.
 *
 * Nine steps, every one of the four situations he names: progress ahead of billing at months 1 and
 * 9, billing ahead of progress at months 5 and 7, the backward slide at month 7, and completion at
 * month 12 where both totals meet and both balances are zero. Written as the table is written, so a
 * reviewer can read the two side by side.
 */
describe("Andrew's Scenario 4, step by step", () => {
    interface Step {
        Label: string;
        Amount: number;
        Direction: ContraDirection;
        Deferred: number;
        Unbilled: number;
        /** Running totals AFTER the step, as his table states them. */
        Billed: number;
        Recognized: number;
    }

    const steps: Step[] = [
        { Label: 'Order confirmed',        Amount:  25_000, Direction: 'Invoice',   Deferred:  25_000, Unbilled:      0, Billed:  25_000, Recognized:      0 },
        { Label: 'Month 1, attested 40%',  Amount:  40_000, Direction: 'Recognize', Deferred:  25_000, Unbilled: 15_000, Billed:  25_000, Recognized: 40_000 },
        { Label: 'Quarter 2 invoice',      Amount:  25_000, Direction: 'Invoice',   Deferred:  10_000, Unbilled: 15_000, Billed:  50_000, Recognized: 40_000 },
        { Label: 'Month 5, attested 45%',  Amount:   5_000, Direction: 'Recognize', Deferred:   5_000, Unbilled:      0, Billed:  50_000, Recognized: 45_000 },
        { Label: 'Quarter 3 invoice',      Amount:  25_000, Direction: 'Invoice',   Deferred:  25_000, Unbilled:      0, Billed:  75_000, Recognized: 45_000 },
        { Label: 'Month 7, attested 40%',  Amount:  -5_000, Direction: 'Recognize', Deferred:  -5_000, Unbilled:      0, Billed:  75_000, Recognized: 40_000 },
        { Label: 'Month 9, attested 90%',  Amount:  50_000, Direction: 'Recognize', Deferred:  35_000, Unbilled: 15_000, Billed:  75_000, Recognized: 90_000 },
        { Label: 'Quarter 4 invoice',      Amount:  25_000, Direction: 'Invoice',   Deferred:  10_000, Unbilled: 15_000, Billed: 100_000, Recognized: 90_000 },
        { Label: 'Month 12, attested 100%',Amount:  10_000, Direction: 'Recognize', Deferred:  10_000, Unbilled:      0, Billed: 100_000, Recognized:100_000 },
    ];

    it('produces exactly the entries and running totals his table states', () => {
        let billed = 0;
        let recognized = 0;

        for (const step of steps) {
            const legs = SplitContraLegs(billed, recognized, step.Amount, step.Direction);
            expect({ step: step.Label, ...legs }).toEqual({
                step: step.Label,
                Deferred: step.Deferred,
                Unbilled: step.Unbilled,
            });

            if (step.Direction === 'Invoice') billed = money(billed + step.Amount);
            else recognized = money(recognized + step.Amount);

            expect({ step: step.Label, billed, recognized }).toEqual({
                step: step.Label,
                billed: step.Billed,
                recognized: step.Recognized,
            });
        }
    });

    it('closes at the contract value with both balances at zero', () => {
        const billed = steps.filter((s) => s.Direction === 'Invoice').reduce((t, s) => t + s.Amount, 0);
        const recognized = steps.filter((s) => s.Direction === 'Recognize').reduce((t, s) => t + s.Amount, 0);
        expect(billed).toBe(100_000);
        expect(recognized).toBe(100_000);
        // Revenue over the project sums to the contract value, and AR to the four invoices.
        expect(steps.filter((s) => s.Direction === 'Invoice')).toHaveLength(4);
    });

    it('never opens Unbilled while billing runs ahead of progress', () => {
        // Months 5 and 7 and everything after the quarter 3 invoice: Deferred covers it.
        for (const label of ['Month 5, attested 45%', 'Quarter 3 invoice', 'Month 7, attested 40%']) {
            const step = steps.find((s) => s.Label === label)!;
            expect(Math.abs(step.Unbilled)).toBe(0);
        }
    });
});
