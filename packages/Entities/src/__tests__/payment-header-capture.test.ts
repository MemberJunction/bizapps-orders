/**
 * Capturing a payment (golive #283).
 *
 * The payment detail takes its company and tender from the header at save time. The detail is
 * created by the first instrument field typed, and used to copy the header's company only then —
 * so a reference typed before Receiving Company was chosen left the detail's `CompanyID` null, and
 * the save failed on the detail. `Object.create` holds a header without metadata, as in
 * booked-header-refusal.test.ts.
 */
import { describe, expect, it } from 'vitest';
import { PaymentHeaderEntity } from '../PaymentHeaderEntity';

type Detail = { CompanyID: string | null; PaymentTypeID: string | null };

function header(receivingCompanyID: string | null, paymentTypeID: string | null, detail: Detail | null): PaymentHeaderEntity {
    const instance = Object.create(PaymentHeaderEntity.prototype) as PaymentHeaderEntity;
    Object.defineProperty(instance, 'ReceivingCompanyID', { value: receivingCompanyID });
    Object.defineProperty(instance, 'PaymentTypeID', { value: paymentTypeID });
    Object.defineProperty(instance, 'PaymentDetailID_Object', { value: detail });
    return instance;
}

describe('PaymentHeaderEntity.SyncPaymentDetailFromHeader', () => {
    it('fills a detail created before the header had a company', () => {
        const detail: Detail = { CompanyID: null, PaymentTypeID: null };
        header('co-a', 'pt-wire', detail).SyncPaymentDetailFromHeader();
        expect(detail).toEqual({ CompanyID: 'co-a', PaymentTypeID: 'pt-wire' });
    });

    it('follows a header whose company or tender changed after the detail was created', () => {
        const detail: Detail = { CompanyID: 'co-a', PaymentTypeID: 'pt-check' };
        header('co-b', 'pt-wire', detail).SyncPaymentDetailFromHeader();
        expect(detail).toEqual({ CompanyID: 'co-b', PaymentTypeID: 'pt-wire' });
    });

    it('leaves the detail alone when the header has nothing to give', () => {
        const detail: Detail = { CompanyID: 'co-a', PaymentTypeID: 'pt-check' };
        header(null, null, detail).SyncPaymentDetailFromHeader();
        expect(detail).toEqual({ CompanyID: 'co-a', PaymentTypeID: 'pt-check' });
    });

    it('does nothing without a detail', () => {
        expect(() => header('co-a', 'pt-wire', null).SyncPaymentDetailFromHeader()).not.toThrow();
    });
});

describe('PaymentHeaderEntity.SaveStatus', () => {
    function saving(result: boolean): PaymentHeaderEntity {
        const instance = Object.create(PaymentHeaderEntity.prototype) as PaymentHeaderEntity;
        Object.defineProperty(instance, 'Status', { value: 'Pending', writable: true });
        Object.defineProperty(instance, 'Save', { value: async () => result });
        return instance;
    }

    it('puts the previous status back when the save is refused', async () => {
        const payment = saving(false);
        expect(await payment.SaveStatus('Captured')).toBe(false);
        expect(payment.Status).toBe('Pending');
    });

    it('keeps the new status when the save succeeds', async () => {
        const payment = saving(true);
        expect(await payment.SaveStatus('Captured')).toBe(true);
        expect(payment.Status).toBe('Captured');
    });
});
