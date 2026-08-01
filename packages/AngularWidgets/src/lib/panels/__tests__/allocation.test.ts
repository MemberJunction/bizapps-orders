/**
 * Allocation arithmetic.
 *
 * The rules the payment screen depends on, tested as pure functions so they can
 * be checked without a rendering environment. Getting any of these wrong either
 * blocks a legitimate payment or lets an unbalanced one through — and an
 * unbalanced payment desynchronises the sub-ledger from the ledger silently.
 */
import { describe, expect, it } from 'vitest';
import {
    AllocateOldestFirst,
    SumAllocations,
    UnallocatedRemainder,
    type MJOAllocatableOrderLike,
} from '../allocation-math';

const order = (ID: string, Balance: number, DueDate?: string): MJOAllocatableOrderLike => ({
    ID,
    Balance,
    DueDate: DueDate ?? null,
});

describe('SumAllocations', () => {
    it('adds them up', () => {
        expect(SumAllocations({ a: 100, b: 70.5 })).toBe(170.5);
    });

    it('is zero for nothing', () => {
        expect(SumAllocations({})).toBe(0);
    });

    it('rounds to cents rather than accumulating float noise', () => {
        // 0.1 + 0.2 is famously 0.30000000000000004; an allocation grid that
        // reports that as unallocated can never balance.
        expect(SumAllocations({ a: 0.1, b: 0.2 })).toBe(0.3);
    });
});

describe('UnallocatedRemainder', () => {
    it('is the amount minus what is applied', () => {
        expect(UnallocatedRemainder(1000, { a: 400 })).toBe(600);
    });

    it('reaches exactly zero when fully applied', () => {
        expect(UnallocatedRemainder(7076.77, { a: 2400, b: 4299, c: 377.77 })).toBe(0);
    });

    it('goes negative when over-allocated', () => {
        expect(UnallocatedRemainder(500, { a: 800 })).toBe(-300);
    });

    it('survives repeated decimal amounts without drifting off zero', () => {
        const allocations = Object.fromEntries(
            Array.from({ length: 30 }, (_, i) => [`o${i}`, 33.33]),
        );
        expect(UnallocatedRemainder(999.9, allocations)).toBe(0);
    });
});

describe('AllocateOldestFirst', () => {
    it('fills the oldest order first', () => {
        const result = AllocateOldestFirst(500, [
            order('a', 300, '2026-01-01'),
            order('b', 400, '2026-06-01'),
        ]);
        expect(result).toEqual({ a: 300, b: 200 });
    });

    it('stops when the money runs out', () => {
        const result = AllocateOldestFirst(100, [
            order('a', 300, '2026-01-01'),
            order('b', 400, '2026-06-01'),
        ]);
        expect(result).toEqual({ a: 100 });
    });

    it('settles everything exactly when the amount matches', () => {
        const result = AllocateOldestFirst(700, [
            order('a', 300, '2026-01-01'),
            order('b', 400, '2026-06-01'),
        ]);
        expect(result).toEqual({ a: 300, b: 400 });
        expect(UnallocatedRemainder(700, result)).toBe(0);
    });

    it('parks surplus on the LAST order rather than leaving cash unapplied', () => {
        // Unapplied cash is not a concept here — a payment must equal what it
        // settles. Surplus becomes credit on an order, which is exactly what a
        // negative balance means.
        const result = AllocateOldestFirst(1000, [order('a', 300, '2026-01-01')]);
        expect(result).toEqual({ a: 1000 });
        expect(UnallocatedRemainder(1000, result)).toBe(0);
    });

    it('sorts by due date, not by the order the caller happened to pass', () => {
        const result = AllocateOldestFirst(300, [
            order('newer', 200, '2026-08-01'),
            order('older', 200, '2026-02-01'),
        ]);
        expect(result.older).toBe(200);
        expect(result.newer).toBe(100);
    });

    it('treats an order with no due date as oldest — it has been open longest unbilled', () => {
        const result = AllocateOldestFirst(100, [
            order('dated', 500, '2026-01-01'),
            order('undated', 500, undefined),
        ]);
        expect(result.undated).toBe(100);
    });

    it('returns nothing for a zero payment', () => {
        expect(AllocateOldestFirst(0, [order('a', 100)])).toEqual({});
    });

    it('returns nothing when there is nothing open', () => {
        expect(AllocateOldestFirst(500, [])).toEqual({});
    });

    it('never allocates to an order that owes nothing', () => {
        const result = AllocateOldestFirst(500, [order('paid', 0, '2026-01-01'), order('owing', 200, '2026-02-01')]);
        expect(result.paid).toBeUndefined();
        expect(result.owing).toBe(500);
    });

    it('always produces a balanced allocation when anything is open', () => {
        const orders = [order('a', 137.42, '2026-01-01'), order('b', 88.19, '2026-03-01')];
        for (const amount of [10, 137.42, 200, 225.61, 999.99]) {
            expect(UnallocatedRemainder(amount, AllocateOldestFirst(amount, orders))).toBe(0);
        }
    });
});
