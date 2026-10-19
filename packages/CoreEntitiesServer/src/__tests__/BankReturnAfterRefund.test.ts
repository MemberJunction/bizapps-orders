/**
 * A bank return that arrives after a seller refund on the same payment (#828). No database: the plan
 * that decides whether, and for how much, the return reverses is pure.
 */
import { describe, expect, it } from 'vitest';
import { PlanBankReturn } from '../PaymentSettlement.js';

describe('PlanBankReturn (#828)', () => {
    it('returns the full amount when nothing has been reversed', () => {
        expect(PlanBankReturn(1200, [])).toEqual({ AlreadyReturned: false, ReturnAmount: 1200 });
    });

    it('returns the un-refunded remainder after a partial seller refund', () => {
        expect(PlanBankReturn(1200, [{ Amount: 400, ReversalSource: 'Refund' }])).toEqual({
            AlreadyReturned: false,
            ReturnAmount: 800,
        });
    });

    it('subtracts every partial refund, whatever sign the amount is stored with', () => {
        const plan = PlanBankReturn(1200, [
            { Amount: 100.1, ReversalSource: 'Refund' },
            { Amount: -199.9, ReversalSource: 'Refund' },
        ]);
        expect(plan.ReturnAmount).toBe(900);
    });

    it('has nothing left to return after a full refund', () => {
        expect(PlanBankReturn(1200, [{ Amount: 1200, ReversalSource: 'Refund' }]).ReturnAmount).toBe(0);
    });

    it('treats an earlier bank return as already returned', () => {
        expect(PlanBankReturn(1200, [{ Amount: 1200, ReversalSource: 'BankReturn' }]).AlreadyReturned).toBe(true);
    });
});
