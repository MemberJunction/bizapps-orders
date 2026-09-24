/**
 * PaymentJournalEntryFactory: the Processing Fee role is optional, but only "nothing linked" is.
 */
import { describe, expect, it } from 'vitest';
import { GLAccountResolutionError, GL_ROLE, type GLAccountResolver } from '../GLAccountResolver.js';
import { PaymentJournalEntryFactory, type PaymentCaptureContext } from '../PaymentJournalEntryFactory.js';

const ctx: PaymentCaptureContext = {
    PaymentID: 'pay-1',
    PaymentNumber: 'P-1',
    CompanyID: 'co-1',
    Amount: 100,
    ProcessingFeeAmount: 3,
    PaymentDate: new Date('2026-09-01'),
    IsReversal: false,
};

function factoryFailingFeeWith(err: Error) {
    const resolver = {
        Resolve: async (role: string) => {
            if (role === GL_ROLE.ProcessingFee) throw err;
            return 'acct-cash';
        },
    } as unknown as GLAccountResolver;
    return new PaymentJournalEntryFactory(resolver, 'ent-payment');
}

describe('PaymentJournalEntryFactory Processing Fee', () => {
    it('reports the fee as unbooked when nothing is linked', async () => {
        const f = factoryFailingFeeWith(new GLAccountResolutionError(GL_ROLE.ProcessingFee, '', 'NotLinked', 'none'));
        await expect(f.BuildCaptureDraft(ctx)).resolves.toEqual({ Draft: null, UnbookedFeeAmount: 3 });
    });

    it('rethrows a cross-company link rather than reporting an unbooked fee (D6)', async () => {
        const err = new GLAccountResolutionError(GL_ROLE.ProcessingFee, '', 'CrossCompany', 'other company');
        await expect(factoryFailingFeeWith(err).BuildCaptureDraft(ctx)).rejects.toBe(err);
    });

    it('rethrows an unrelated failure', async () => {
        const err = new Error('connection reset');
        await expect(factoryFailingFeeWith(err).BuildCaptureDraft(ctx)).rejects.toBe(err);
    });
});
