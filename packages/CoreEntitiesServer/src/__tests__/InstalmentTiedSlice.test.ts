/**
 * The instalment slice ties both ways (#234 third review, item 1): an instalment's pieces sum to its
 * schedule row, and an amount's pieces across instalments sum to the amount.
 */
import { describe, expect, it } from 'vitest';

import { TiedSlice } from '../InstalmentInvoiceEntry.js';

const cents = (n: number): number => Math.round(n * 100);
const sum = (xs: number[]): number => xs.reduce((t, x) => t + cents(x), 0);

/** Every instalment's pieces, and the two ties asserted. */
function sliceAll(totals: number[], rows: number[]): number[][] {
    const all = rows.map((_, i) => TiedSlice(totals, rows, i));
    all.forEach((pieces, i) => expect(sum(pieces)).toBe(cents(rows[i])));
    totals.forEach((t, j) => expect(sum(all.map((p) => p[j]))).toBe(cents(t)));
    return all;
}

describe('TiedSlice', () => {
    it("Andrew's example: lines 1,000 and 250 in three equal instalments bill exactly their rows", () => {
        const all = sliceAll([1000, 250], [416.67, 416.67, 416.66]);
        // Instalment 2 bills 416.67, which is what a deposit sized from its row settles.
        expect(sum(all[1])).toBe(41667);
        // The mirror case: instalment 1 bills its row, not 416.68.
        expect(sum(all[0])).toBe(41667);
    });

    it('a single line with tax: net and tax are sliced together, so the bill is the row', () => {
        sliceAll([100, 13], [37.67, 37.67, 37.66]);
    });

    it('a reversal line (negative) keeps its sign in every piece', () => {
        const all = sliceAll([500, -100.01, 7.5], [135.83, 135.83, 135.83]);
        for (const pieces of all) expect(pieces[1]).toBeLessThanOrEqual(0);
    });

    it('holds on random multi-line schedules, with no piece outside its amount', () => {
        let seed = 7;
        const rand = (): number => ((seed = (seed * 16807) % 2147483647) / 2147483647);
        for (let run = 0; run < 500; run++) {
            const totals = Array.from({ length: 1 + Math.floor(rand() * 5) }, () => cents(rand() * 900 + 0.01) / 100);
            const n = 1 + Math.floor(rand() * 12);
            const whole = sum(totals);
            const base = Math.floor(whole / n);
            const rows = Array.from({ length: n }, (_, i) => (i === n - 1 ? whole - base * (n - 1) : base) / 100);
            const all = sliceAll(totals, rows);
            for (const pieces of all) pieces.forEach((p, j) => expect(p >= 0 && p <= totals[j]).toBe(true));
        }
    });

    it('refuses rows that do not total the lines', () => {
        expect(() => TiedSlice([100], [50, 49.99], 0)).toThrow(/cannot be split/);
    });
});

describe('TiedSlice with instalments already invoiced (#681)', () => {
    // Two 600 lines in four 300 rows; row 1 invoiced 150 / 150; line A lowered by 225, so the
    // rows not yet invoiced fall to 225 each.
    const totals = [375, 600];
    const rows = [300, 225, 225, 225];
    const billed = { Amounts: [150, 150], Invoiced: [true, false, false, false] };

    it('slices only what each line has left, so each line ends at its lowered amount', () => {
        const rest = [1, 2, 3].map((i) => TiedSlice(totals, rows, i, billed));
        rest.forEach((pieces, k) => expect(sum(pieces)).toBe(cents(rows[k + 1])));
        expect(sum(rest.map((p) => p[0]))).toBe(cents(225));
        expect(sum(rest.map((p) => p[1]))).toBe(cents(450));
    });

    it('re-slicing the invoiced row instead is the drift the issue reports', () => {
        const replayed = [1, 2, 3].map((i) => TiedSlice(totals, rows, i));
        expect(sum(replayed.map((p) => p[0]))).toBe(cents(259.62));
    });

    it('lets an instalment be invoiced out of order; the last one left takes the remainder', () => {
        const third = TiedSlice(totals, rows, 2, billed);
        const afterThird = { Amounts: [150 + third[0], 150 + third[1]], Invoiced: [true, false, true, false] };
        const second = TiedSlice(totals, rows, 1, afterThird);
        const afterSecond = { Amounts: [afterThird.Amounts[0] + second[0], afterThird.Amounts[1] + second[1]], Invoiced: [true, true, true, false] };
        const fourth = TiedSlice(totals, rows, 3, afterSecond);
        expect(cents(150) + sum([third[0]]) + sum([second[0]]) + sum([fourth[0]])).toBe(cents(375));
        expect(sum(fourth)).toBe(cents(225));
    });

    it('refuses an amount already invoiced beyond what it now holds', () => {
        expect(() => TiedSlice([100, 600], [300, 400], 1, { Amounts: [150, 150], Invoiced: [true, false] })).toThrow(/more than it now holds/);
    });

    it('refuses to slice an instalment that is already invoiced', () => {
        expect(() => TiedSlice(totals, rows, 0, billed)).toThrow(/already invoiced/);
    });

    it('refuses rows not yet invoiced that do not total what the lines have left', () => {
        expect(() => TiedSlice(totals, [300, 300, 225, 225], 1, billed)).toThrow(/cannot be split/);
    });
});
