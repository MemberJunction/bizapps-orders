/**
 * ProgressRecognition — the catch-up arithmetic and the one shipped progress driver (plan §9.2, D90).
 *
 * The property that matters: whatever the observations, the posted deltas sum EXACTLY to the line
 * amount once the line reaches 100%, and a backward slide is nothing but a negative delta.
 */
import { describe, expect, it } from 'vitest';
import { ComputeCatchUp, ManualAttestationDriver, RecognitionMirrors } from '../RevenueRecognition.js';

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

describe('RecognitionMirrors — which way a catch-up entry posts', () => {
    // The four cases, as a table, because the bug this replaces was one of them being absent.
    it('an ordinary line recognises forward and unrecognises backward', () => {
        expect(RecognitionMirrors(1, 400)).toBe(false);
        expect(RecognitionMirrors(1, -150)).toBe(true);
    });

    it('a REVERSAL line is the other way round: its forward progress removes revenue', () => {
        // The defect this was extracted to fix. A reversal POC line attested from 40% to 70% has a
        // POSITIVE delta — 30% more of the line is done — and that must post as an unrecognition,
        // because the line exists to unwind a sale. Mirroring on the delta alone recognised revenue
        // on it instead, and the entry balanced, so nothing downstream would ever have said so.
        expect(RecognitionMirrors(-1, 400)).toBe(true);
    });

    it('and a backward slide on a reversal line posts forward again — two flips are no flip', () => {
        expect(RecognitionMirrors(-1, -150)).toBe(false);
    });

    it('reads the quantity however it arrives from the row', () => {
        expect(RecognitionMirrors(-2.5, 10)).toBe(true);
        expect(RecognitionMirrors(0, 10)).toBe(false);
    });
});
