import { describe, expect, it } from 'vitest';
import { MergeOrderRollups, ORDER_ROLLUP_FIELDS } from '../OrderRollupBehavior.js';

/**
 * Issue #147 — a confirmed, unpaid $895 order showed its Balance as `—`.
 *
 * The header is written before its lines exist, so the entity holds `Balance = null` at that
 * moment; the OrderLine trigger then computes the real value onto the ROW. Whoever loses this
 * merge decides whether the caller gets 895 or a dash — and, because a null is sent back as
 * `@Balance_Clear=1` on the next update, whether the stored total survives at all.
 */
describe('MergeOrderRollups', () => {
    const preLineEntity = {
        TotalGross: null,
        AmountPaid: 0,
        Balance: null,
        FulfillmentStatus: 'Pending',
    };

    it('takes the row over the entity for every column', () => {
        const merged = MergeOrderRollups(
            { TotalGross: 895, AmountPaid: 0, Balance: 895, FulfillmentStatus: 'NotApplicable' },
            preLineEntity,
        );

        expect(merged).toEqual({
            TotalGross: 895,
            AmountPaid: 0,
            Balance: 895,
            FulfillmentStatus: 'NotApplicable',
        });
    });

    it('treats a null reported by the row as the answer, not as a gap to fill', () => {
        // A row saying the balance is null means the trigger has not run yet. That is more current
        // than an entity's leftover figure, and silently substituting the older number is how a
        // wrong total gets presented as an authoritative one.
        const merged = MergeOrderRollups(
            { TotalGross: null, AmountPaid: 0, Balance: null, FulfillmentStatus: 'Pending' },
            { TotalGross: 500, AmountPaid: 250, Balance: 250, FulfillmentStatus: 'Fulfilled' },
        );

        expect(merged.TotalGross).toBeNull();
        expect(merged.Balance).toBeNull();
        expect(merged.AmountPaid).toBe(0);
    });

    it('keeps a captured payment the row omitted rather than zeroing it', () => {
        // AmountPaid is NOT NULL, so it needs no _Clear flag to do damage — a stale 0 sent to
        // spUpdateOrderHeader overwrites a real payment outright.
        const merged = MergeOrderRollups({ TotalGross: 1200, Balance: 200 }, { AmountPaid: 1000 });

        expect(merged.AmountPaid).toBe(1000);
        expect(merged.TotalGross).toBe(1200);
    });

    it('falls back to the entity when the read found no row', () => {
        const merged = MergeOrderRollups(null, {
            TotalGross: 240,
            AmountPaid: 0,
            Balance: 240,
            FulfillmentStatus: 'Pending',
        });

        expect(merged).toEqual({
            TotalGross: 240,
            AmountPaid: 0,
            Balance: 240,
            FulfillmentStatus: 'Pending',
        });
    });

    it('resolves every column to null when neither side has one', () => {
        const merged = MergeOrderRollups(undefined, {});

        expect(merged).toEqual({
            TotalGross: null,
            AmountPaid: null,
            Balance: null,
            FulfillmentStatus: null,
        });
    });

    it('preserves a real zero balance instead of collapsing it to null', () => {
        // `$0.00` owed and "not computed" are different facts, and only one of them is a dash.
        const merged = MergeOrderRollups(
            { TotalGross: 200, AmountPaid: 200, Balance: 0, FulfillmentStatus: 'Fulfilled' },
            preLineEntity,
        );

        expect(merged.Balance).toBe(0);
    });

    it('covers exactly the columns spRecalcOrderHeaderTotals writes', () => {
        // The proc's UPDATE list. A column added there without being added here keeps being read
        // from a stale entity, which is the whole defect.
        expect([...ORDER_ROLLUP_FIELDS]).toEqual([
            'TotalGross',
            'AmountPaid',
            'Balance',
            'FulfillmentStatus',
        ]);
    });
});
