/**
 * ProgressRecognition — the catch-up arithmetic and the one shipped progress driver (plan §9.2, D90).
 *
 * The property that matters: whatever the observations, the posted deltas sum EXACTLY to the line
 * amount once the line reaches 100%, and a backward slide is nothing but a negative delta.
 */
import { describe, expect, it } from 'vitest';
import { ComputeCatchUp, ManualAttestationDriver } from '../RevenueRecognition.js';

/** Replay a sequence of cumulative percents the way Orders.RecordProgress does, one at a time. */
function replay(lineNet: number, percents: number[]): number[] {
    let recognized = 0;
    return percents.map((p) => {
        const { Delta } = ComputeCatchUp(lineNet, p, recognized);
        recognized = Math.round((recognized + Delta + Number.EPSILON) * 100) / 100;
        return Delta;
    });
}

describe('ComputeCatchUp', () => {
    it('40% → 70% → 55% → 100% posts four deltas that sum to the line, the third negative, the last landing the odd cent', () => {
        const deltas = replay(1000.01, [0.4, 0.7, 0.55, 1]);
        expect(deltas).toEqual([400, 300.01, -150, 450]);
        expect(deltas[2]).toBeLessThan(0);
        expect(deltas.reduce((s, d) => s + d, 0)).toBeCloseTo(1000.01, 2);
    });

    it('an unchanged percent is a zero delta, not an error', () => {
        expect(ComputeCatchUp(500, 0.3, 150)).toEqual({ Target: 150, Delta: 0 });
    });

    it('rounds the target to the cent before subtracting, so drift cannot accumulate', () => {
        // 1/3 of 100 is 33.333…; the target is 33.33 and the delta is exactly that.
        expect(ComputeCatchUp(100, 1 / 3, 0)).toEqual({ Target: 33.33, Delta: 33.33 });
        expect(ComputeCatchUp(100, 1, 33.33).Delta).toBe(66.67);
    });
});

describe('ManualAttestationDriver', () => {
    const driver = new ManualAttestationDriver();

    it('returns the attested fraction as-is', () => {
        expect(driver.PercentComplete({ PercentComplete: 0.7 })).toBe(0.7);
        expect(driver.PercentComplete({ PercentComplete: 0 })).toBe(0);
        expect(driver.PercentComplete({ PercentComplete: 1 })).toBe(1);
    });

    it('refuses anything that is not a fraction between 0 and 1', () => {
        expect(() => driver.PercentComplete({ PercentComplete: 70 })).toThrow(/between 0 and 1/);
        expect(() => driver.PercentComplete({ PercentComplete: -0.1 })).toThrow(/between 0 and 1/);
        expect(() => driver.PercentComplete({})).toThrow(/between 0 and 1/);
        expect(() => driver.PercentComplete({ PercentComplete: Number.NaN })).toThrow(/between 0 and 1/);
    });
});
