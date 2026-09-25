/**
 * Unit tests for payment-gated access (bc-aidp-next-golive#223). No database.
 *
 * The rules under test are the two halves of OnFirstPayment — a new purchase waits for its first
 * payment, a renewal is cut off past the configured days — and the guard that decides which grants
 * a payment is allowed to move at all.
 */
import { describe, it, expect } from 'vitest';
import {
    DecideGrantStatus,
    FirstPaymentAmount,
    InitialGrantStatus,
    IsPaymentSuspension,
    ReconcileGrantStatus,
    type OrderPaymentFacts,
} from '../EntitlementBehavior.js';

const order = (over: Partial<OrderPaymentFacts> = {}): OrderPaymentFacts => ({
    TotalGross: 1200,
    AmountPaid: 0,
    Balance: 1200,
    FirstPaymentAmount: 1200,
    DaysPastDue: 0,
    ...over,
});

describe('FirstPaymentAmount', () => {
    it('is the whole order when there is no schedule', () => {
        expect(FirstPaymentAmount(1200, [])).toBe(1200);
    });

    it('is the first instalment when there is a schedule', () => {
        const rows = [
            { CompanyID: 'A', InstallmentNumber: 2, Amount: 400, Status: 'Scheduled' },
            { CompanyID: 'A', InstallmentNumber: 1, Amount: 400, Status: 'Invoiced' },
            { CompanyID: 'A', InstallmentNumber: 3, Amount: 400, Status: 'Scheduled' },
        ];
        expect(FirstPaymentAmount(1200, rows)).toBe(400);
    });

    it("sums each selling company's first instalment", () => {
        const rows = [
            { CompanyID: 'A', InstallmentNumber: 1, Amount: 300, Status: 'Invoiced' },
            { CompanyID: 'a', InstallmentNumber: 2, Amount: 300, Status: 'Scheduled' },
            { CompanyID: 'B', InstallmentNumber: 1, Amount: 150.5, Status: 'Invoiced' },
        ];
        expect(FirstPaymentAmount(750.5, rows)).toBe(450.5);
    });

    it('skips a cancelled instalment, which was never due', () => {
        const rows = [
            { CompanyID: 'A', InstallmentNumber: 1, Amount: 500, Status: 'Canceled' },
            { CompanyID: 'A', InstallmentNumber: 2, Amount: 250, Status: 'Scheduled' },
        ];
        expect(FirstPaymentAmount(1000, rows)).toBe(250);
    });

    it('falls back to the whole order when every row is cancelled', () => {
        expect(FirstPaymentAmount(900, [{ CompanyID: 'A', InstallmentNumber: 1, Amount: 900, Status: 'Canceled' }])).toBe(900);
    });
});

describe('DecideGrantStatus — OnFirstPayment, new purchase', () => {
    it('is held until the first payment arrives', () => {
        expect(DecideGrantStatus('OnFirstPayment', false, order(), 14)).toEqual({ Status: 'Suspended', Reason: 'AwaitingPayment' });
    });

    it('goes live on the first instalment, not on paid-in-full', () => {
        const o = order({ FirstPaymentAmount: 400, AmountPaid: 400, Balance: 800 });
        expect(DecideGrantStatus('OnFirstPayment', false, o, 14)).toEqual({ Status: 'Active', Reason: null });
    });

    it('stays held on a part-payment of the first instalment', () => {
        const o = order({ FirstPaymentAmount: 400, AmountPaid: 399.99, Balance: 800.01 });
        expect(DecideGrantStatus('OnFirstPayment', false, o, 14).Status).toBe('Suspended');
    });

    it('compares in cents, so a third of 1000 paid as 333.33 counts', () => {
        const o = order({ TotalGross: 1000, FirstPaymentAmount: 333.33, AmountPaid: 333.33, Balance: 666.67 });
        expect(DecideGrantStatus('OnFirstPayment', false, o, 14).Status).toBe('Active');
    });

    it('goes back on hold when the payment is reversed', () => {
        const o = order({ FirstPaymentAmount: 400, AmountPaid: 0, Balance: 1200 });
        expect(DecideGrantStatus('OnFirstPayment', false, o, 14).Reason).toBe('AwaitingPayment');
    });

    it('treats a zero-value order as paid', () => {
        expect(DecideGrantStatus('OnFirstPayment', false, order({ TotalGross: 0, Balance: 0, FirstPaymentAmount: 0 }), 14).Status).toBe('Active');
    });

    it('is not cut off by days past due — that is the renewal half', () => {
        const o = order({ FirstPaymentAmount: 400, AmountPaid: 400, Balance: 800, DaysPastDue: 60 });
        expect(DecideGrantStatus('OnFirstPayment', false, o, 14).Status).toBe('Active');
    });
});

describe('DecideGrantStatus — OnFirstPayment, renewal', () => {
    it('is Active at confirm though nothing is paid', () => {
        expect(DecideGrantStatus('OnFirstPayment', true, order(), 14)).toEqual({ Status: 'Active', Reason: null });
    });

    it('keeps access up to the day before the cutoff', () => {
        expect(DecideGrantStatus('OnFirstPayment', true, order({ DaysPastDue: 13 }), 14).Status).toBe('Active');
    });

    it('is suspended PastDue on the cutoff day', () => {
        expect(DecideGrantStatus('OnFirstPayment', true, order({ DaysPastDue: 14 }), 14)).toEqual({ Status: 'Suspended', Reason: 'PastDue' });
    });

    it('comes back once the order is no longer past due', () => {
        expect(DecideGrantStatus('OnFirstPayment', true, order({ DaysPastDue: 0, Balance: 0, AmountPaid: 1200 }), 14).Status).toBe('Active');
    });

    it('a cutoff of 0 suspends on the first day past due, but not before', () => {
        expect(DecideGrantStatus('OnFirstPayment', true, order({ DaysPastDue: 0 }), 0).Status).toBe('Active');
        expect(DecideGrantStatus('OnFirstPayment', true, order({ DaysPastDue: 1 }), 0).Status).toBe('Suspended');
    });

    it('never cuts off when the cutoff is switched off', () => {
        expect(DecideGrantStatus('OnFirstPayment', true, order({ DaysPastDue: 400 }), null).Status).toBe('Active');
    });
});

describe('DecideGrantStatus — a refund is the seller\'s choice, a bank return is not', () => {
    // A paid 1,200 order; one 400 line returned and refunded, leaving 800 paid against 1,200 gross.
    const refundedReturn = order({ AmountPaid: 800, Balance: 400, RefundedBySeller: 400 });

    it('keeps a new purchase live after a line is returned and refunded', () => {
        expect(DecideGrantStatus('OnFirstPayment', false, refundedReturn, 14)).toEqual({ Status: 'Active', Reason: null });
    });

    it('keeps OnPaidInFull live after a line is returned and refunded', () => {
        expect(DecideGrantStatus('OnPaidInFull', false, refundedReturn, 14).Status).toBe('Active');
    });

    it('keeps access through a goodwill refund on a paid order', () => {
        const o = order({ AmountPaid: 1150, Balance: 50, RefundedBySeller: 50 });
        expect(DecideGrantStatus('OnFirstPayment', false, o, 14).Status).toBe('Active');
        expect(DecideGrantStatus('OnPaidInFull', false, o, 14).Status).toBe('Active');
    });

    it('suspends when the bank takes the payment back', () => {
        const o = order({ AmountPaid: 0, Balance: 1200, RefundedBySeller: 0 });
        expect(DecideGrantStatus('OnFirstPayment', false, o, 14)).toEqual({ Status: 'Suspended', Reason: 'AwaitingPayment' });
        expect(DecideGrantStatus('OnPaidInFull', false, o, 14).Reason).toBe('AwaitingPayment');
    });

    it('counts only the bank return when both happen', () => {
        // Paid as two 600s: 200 of one refunded, the other returned by the bank. Counted paid: 600.
        const o = order({ AmountPaid: 400, Balance: 800, RefundedBySeller: 200 });
        expect(DecideGrantStatus('OnFirstPayment', false, o, 14).Status).toBe('Suspended');
        expect(DecideGrantStatus('OnFirstPayment', false, { ...o, FirstPaymentAmount: 600 }, 14).Status).toBe('Active');
        expect(DecideGrantStatus('OnPaidInFull', false, o, 14).Status).toBe('Suspended');
    });
});

describe('DecideGrantStatus — the other timings are unchanged by renewal or cutoff', () => {
    it('OnConfirm is always Active', () => {
        expect(DecideGrantStatus('OnConfirm', true, order({ DaysPastDue: 90 }), 14).Status).toBe('Active');
    });

    it('OnPaidInFull follows the balance and says why it waits', () => {
        expect(DecideGrantStatus('OnPaidInFull', false, order({ AmountPaid: 400, Balance: 800 }), 14)).toEqual({ Status: 'Suspended', Reason: 'AwaitingPayment' });
        expect(DecideGrantStatus('OnPaidInFull', true, order({ AmountPaid: 1200, Balance: 0 }), 14).Status).toBe('Active');
    });

    it('OnActivation waits for activation', () => {
        expect(DecideGrantStatus('OnActivation', false, order({ Balance: 0 }), 14)).toEqual({ Status: 'Suspended', Reason: 'AwaitingActivation' });
    });

    it('InitialGrantStatus delegates, and agrees with the old answers', () => {
        expect(InitialGrantStatus('OnPaidInFull', { Balance: 500, TotalGross: 500 })).toBe('Suspended');
        expect(InitialGrantStatus('OnPaidInFull', { Balance: 0, TotalGross: 500 })).toBe('Active');
        expect(InitialGrantStatus('OnFirstPayment', { Balance: 500, TotalGross: 500 })).toBe('Suspended');
    });
});

describe('ReconcileGrantStatus — which grants a payment may move', () => {
    const active = { Status: 'Active', Reason: null } as const;
    const pastDue = { Status: 'Suspended', Reason: 'PastDue' } as const;

    it('suspends an Active grant', () => {
        expect(ReconcileGrantStatus({ Status: 'Active', SuspensionReason: null }, pastDue)).toEqual(pastDue);
    });

    it('lifts a payment suspension', () => {
        expect(ReconcileGrantStatus({ Status: 'Suspended', SuspensionReason: 'AwaitingPayment' }, active)).toEqual(active);
        expect(ReconcileGrantStatus({ Status: 'Suspended', SuspensionReason: 'PastDue' }, active)).toEqual(active);
    });

    it('moves a held purchase between payment reasons', () => {
        expect(ReconcileGrantStatus({ Status: 'Suspended', SuspensionReason: 'AwaitingPayment' }, pastDue)).toEqual(pastDue);
    });

    it('reports nothing when nothing changes', () => {
        expect(ReconcileGrantStatus({ Status: 'Active', SuspensionReason: null }, active)).toBeNull();
        expect(ReconcileGrantStatus({ Status: 'Suspended', SuspensionReason: 'PastDue' }, pastDue)).toBeNull();
    });

    it('leaves a suspension that was not for payment to a person', () => {
        expect(ReconcileGrantStatus({ Status: 'Suspended', SuspensionReason: null }, active)).toBeNull();
        expect(ReconcileGrantStatus({ Status: 'Suspended', SuspensionReason: 'AwaitingActivation' }, active)).toBeNull();
    });

    it('never touches a revoked or expired grant', () => {
        expect(ReconcileGrantStatus({ Status: 'Revoked', SuspensionReason: null }, active)).toBeNull();
        expect(ReconcileGrantStatus({ Status: 'Expired', SuspensionReason: 'PastDue' }, active)).toBeNull();
    });
});

describe('IsPaymentSuspension', () => {
    it('is true only for a grant held for a payment reason', () => {
        expect(IsPaymentSuspension({ Status: 'Suspended', SuspensionReason: 'AwaitingPayment' })).toBe(true);
        expect(IsPaymentSuspension({ Status: 'Suspended', SuspensionReason: 'PastDue' })).toBe(true);
        expect(IsPaymentSuspension({ Status: 'Suspended', SuspensionReason: 'AwaitingActivation' })).toBe(false);
        expect(IsPaymentSuspension({ Status: 'Suspended', SuspensionReason: null })).toBe(false);
        expect(IsPaymentSuspension({ Status: 'Active', SuspensionReason: null })).toBe(false);
    });
});
