/**
 * Unit tests for the PURE charge engine (plan D71). No database.
 *
 * The two that carry the design:
 *   - BASIS. `LineNetPlusCharges` is how tax reaches shipping, and a test proves the two bases give
 *     DIFFERENT answers on the same order — otherwise the field would be decorative.
 *   - ALLOCATION. Every charge must land on lines, weighted by each line's RUNNING total rather
 *     than its original net, or proportions drift as charges accumulate.
 */
import { describe, it, expect } from 'vitest';
import { ComputeCharges, type ChargeRequest, type ChargeableLine } from '../ChargeBehavior.js';

const line = (id: string, net: number): ChargeableLine => ({ ID: id, Net: net });

const charge = (over: Partial<ChargeRequest> = {}): ChargeRequest => ({
    ChargeTypeID: 'ct1',
    Code: 'SHIP',
    Category: 'Shipping',
    Basis: 'LineNet',
    Sequence: 10,
    Amount: 20,
    ...over,
});

describe('ComputeCharges — amounts and rates', () => {
    it('a flat amount is charged as stated', () => {
        const out = ComputeCharges([charge({ Amount: 25 })], [line('a', 100)]);
        expect(out.TotalCharges).toBe(25);
        expect(out.Charges[0].Amount).toBe(25);
    });

    it('a rate is applied to the basis', () => {
        const out = ComputeCharges(
            [charge({ Code: 'TAX', Category: 'Tax', Amount: null, Rate: 0.086 })],
            [line('a', 1000)],
        );
        expect(out.Charges[0].Amount).toBe(86);
        expect(out.Charges[0].BasisAmount).toBe(1000);
    });

    it('specifying BOTH an amount and a rate is an error, not a silent choice', () => {
        expect(() => ComputeCharges([charge({ Amount: 10, Rate: 0.1 })], [line('a', 100)])).toThrow(/both an Amount and a Rate/);
    });

    it('no lines means no charges', () => {
        const out = ComputeCharges([charge()], []);
        expect(out.TotalCharges).toBe(0);
        expect(out.Charges).toHaveLength(0);
    });
});

describe('ComputeCharges — basis', () => {
    // The case the whole `Basis` field exists for.
    const lines = [line('a', 1000)];
    const shipping = charge({ Code: 'SHIP', Sequence: 10, Amount: 100 });

    it('LineNet EXCLUDES earlier charges — tax on goods only', () => {
        const tax = charge({ Code: 'TAX', Category: 'Tax', Basis: 'LineNet', Sequence: 100, Amount: null, Rate: 0.1 });
        const out = ComputeCharges([shipping, tax], lines);
        expect(out.Charges[1].BasisAmount).toBe(1000);
        expect(out.Charges[1].Amount).toBe(100); // 10% of the goods
    });

    it('LineNetPlusCharges INCLUDES them — tax on goods AND shipping', () => {
        const tax = charge({
            Code: 'TAX',
            Category: 'Tax',
            Basis: 'LineNetPlusCharges',
            Sequence: 100,
            Amount: null,
            Rate: 0.1,
        });
        const out = ComputeCharges([shipping, tax], lines);
        expect(out.Charges[1].BasisAmount).toBe(1100);
        expect(out.Charges[1].Amount).toBe(110); // 10% of goods + shipping
    });

    it('the two bases DIFFER on the same order — which is why it is configuration', () => {
        const mk = (basis: 'LineNet' | 'LineNetPlusCharges') =>
            ComputeCharges(
                [shipping, charge({ Code: 'TAX', Category: 'Tax', Basis: basis, Sequence: 100, Amount: null, Rate: 0.1 })],
                lines,
            ).TotalCharges;
        expect(mk('LineNet')).not.toBe(mk('LineNetPlusCharges'));
    });

    it('a Flat charge reports a basis of zero rather than a misleading number', () => {
        const out = ComputeCharges([charge({ Basis: 'Flat', Amount: 15 })], [line('a', 500)]);
        expect(out.Charges[0].BasisAmount).toBe(0);
        expect(out.Charges[0].Amount).toBe(15);
    });
});

describe('ComputeCharges — sequence', () => {
    it('charges apply in Sequence order regardless of input order', () => {
        const later = charge({ Code: 'TAX', Sequence: 100, Amount: null, Rate: 0.1, Basis: 'LineNetPlusCharges' });
        const earlier = charge({ Code: 'SHIP', Sequence: 10, Amount: 100 });
        // Passed the wrong way round on purpose.
        const out = ComputeCharges([later, earlier], [line('a', 1000)]);
        expect(out.Charges.map((c) => c.Request.Code)).toEqual(['SHIP', 'TAX']);
        expect(out.Charges[1].Amount).toBe(110);
    });
});

describe('ComputeCharges — allocation', () => {
    it('splits a charge across lines in proportion to their nets', () => {
        const out = ComputeCharges([charge({ Amount: 100 })], [line('a', 300), line('b', 100)]);
        expect(out.PerLine.get('a')).toBe(75);
        expect(out.PerLine.get('b')).toBe(25);
    });

    it('ALWAYS allocates the whole charge, to the penny', () => {
        const out = ComputeCharges([charge({ Amount: 100 })], [line('a', 1), line('b', 1), line('c', 1)]);
        const total = [...out.PerLine.values()].reduce((s, v) => s + v, 0);
        expect(Math.round(total * 100) / 100).toBe(100);
    });

    it('weights a later charge by the RUNNING total, not the original net', () => {
        // Two lines of equal net, but a flat first charge lands unevenly by construction? No —
        // equal nets share equally, and the second charge must then see equal running totals.
        const shipping = charge({ Code: 'SHIP', Sequence: 10, Amount: 100 });
        const tax = charge({
            Code: 'TAX',
            Sequence: 100,
            Basis: 'LineNetPlusCharges',
            Amount: null,
            Rate: 0.1,
            Category: 'Tax',
        });
        const out = ComputeCharges([shipping, tax], [line('a', 900), line('b', 100)]);
        // shipping 100 splits 90/10; running totals become 990 and 110; tax is 10% of 1100 = 110,
        // split by 990:110 = 99/11.
        expect(out.Charges[0].Allocations).toEqual([
            { LineID: 'a', Amount: 90 },
            { LineID: 'b', Amount: 10 },
        ]);
        expect(out.Charges[1].BasisAmount).toBe(1100);
        expect(out.Charges[1].Allocations).toEqual([
            { LineID: 'a', Amount: 99 },
            { LineID: 'b', Amount: 11 },
        ]);
    });

    it('every charge produces allocations — none may sit unallocated', () => {
        const out = ComputeCharges(
            [charge({ Code: 'SHIP', Amount: 50 }), charge({ Code: 'HAND', Sequence: 20, Amount: 10 })],
            [line('a', 100), line('b', 100)],
        );
        for (const c of out.Charges) {
            const sum = c.Allocations.reduce((s, a) => s + a.Amount, 0);
            expect(Math.round(sum * 100) / 100).toBe(c.Amount);
        }
    });
});

describe('ComputeCharges — override', () => {
    it('an override replaces the amount but PRESERVES what the rules computed', () => {
        const out = ComputeCharges(
            [charge({ Amount: 100, OverrideAmount: 0, OverrideReason: 'waived — service failure' })],
            [line('a', 500)],
        );
        expect(out.Charges[0].Amount).toBe(0);
        // "Shipping was waived" and "shipping was free" must stay distinguishable.
        expect(out.Charges[0].ComputedAmount).toBe(100);
        expect(out.Charges[0].IsOverridden).toBe(true);
        expect(out.TotalCharges).toBe(0);
    });

    it('an un-overridden charge is not marked as overridden', () => {
        const out = ComputeCharges([charge({ Amount: 30 })], [line('a', 100)]);
        expect(out.Charges[0].IsOverridden).toBe(false);
        expect(out.Charges[0].ComputedAmount).toBe(30);
    });

    it('an override to a HIGHER amount is honoured too', () => {
        const out = ComputeCharges(
            [charge({ Amount: 10, OverrideAmount: 45, OverrideReason: 'oversized item' })],
            [line('a', 200)],
        );
        expect(out.Charges[0].Amount).toBe(45);
        expect(out.Charges[0].ComputedAmount).toBe(10);
    });

    it('a waived charge still allocates nothing rather than allocating zero rows', () => {
        const out = ComputeCharges(
            [charge({ Amount: 100, OverrideAmount: 0, OverrideReason: 'waived' })],
            [line('a', 100), line('b', 100)],
        );
        expect(out.Charges[0].Allocations).toHaveLength(0);
        expect(out.PerLine.size).toBe(0);
    });
});
