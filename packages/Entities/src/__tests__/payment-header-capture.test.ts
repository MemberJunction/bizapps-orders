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

/**
 * A saved detail is never edited (golive #303): the database refuses a change to its company or
 * tender. The payment gets a new detail with the same writable fields instead. `Clear()` then
 * `EnsureObject()` resets the same object to a new record, which the stand-in reproduces.
 */
describe('PaymentHeaderEntity.SyncPaymentDetailFromHeader on a saved detail', () => {
    type Field = { Name: string; Value: unknown; ReadOnly: boolean };
    type SavedDetail = Detail & { IsSaved: boolean; Fields: Field[]; Set(name: string, value: unknown): void };

    function savedDetail(values: Record<string, unknown>): SavedDetail {
        const row: Record<string, unknown> = { ID: 'detail-1', __mj_CreatedAt: 'then', ...values };
        const readOnly = new Set(['ID', '__mj_CreatedAt']);
        const detail = {
            IsSaved: true,
            get Fields(): Field[] {
                return Object.keys(row).map((Name) => ({ Name, Value: row[Name], ReadOnly: readOnly.has(Name) }));
            },
            Set(name: string, value: unknown) { row[name] = value; },
            reset() {
                for (const key of Object.keys(row)) row[key] = null;
                row.ID = 'detail-2';
                detail.IsSaved = false;
            },
            get CompanyID() { return row.CompanyID as string | null; },
            set CompanyID(v) { row.CompanyID = v; },
            get PaymentTypeID() { return row.PaymentTypeID as string | null; },
            set PaymentTypeID(v) { row.PaymentTypeID = v; },
            row,
        };
        return detail as unknown as SavedDetail;
    }

    function savedHeader(receivingCompanyID: string, paymentTypeID: string, detail: SavedDetail) {
        const calls: string[] = [];
        const instance = header(receivingCompanyID, paymentTypeID, detail);
        Object.defineProperty(instance, 'ClearPaymentDetail', { value: () => calls.push('clear') });
        Object.defineProperty(instance, 'PaymentDetailID_EnsureObject', {
            value: () => {
                calls.push('ensure');
                (detail as unknown as { reset(): void }).reset();
                return detail;
            },
        });
        return { instance, calls };
    }

    it('replaces the detail when the company changed, keeping its instrument fields', () => {
        const detail = savedDetail({ CompanyID: 'co-a', PaymentTypeID: 'pt-wire', ReferenceNumber: 'WIRE-1', Notes: 'n' });
        const { instance, calls } = savedHeader('co-b', 'pt-wire', detail);
        instance.SyncPaymentDetailFromHeader();
        const row = (detail as unknown as { row: Record<string, unknown> }).row;
        expect(calls).toEqual(['clear', 'ensure']);
        expect(row).toMatchObject({ ID: 'detail-2', CompanyID: 'co-b', PaymentTypeID: 'pt-wire', ReferenceNumber: 'WIRE-1', Notes: 'n' });
        expect(row.__mj_CreatedAt).toBeNull();
    });

    it('replaces the detail when the tender changed', () => {
        const detail = savedDetail({ CompanyID: 'co-a', PaymentTypeID: 'pt-check', ReferenceNumber: '1001' });
        const { instance, calls } = savedHeader('co-a', 'pt-wire', detail);
        instance.SyncPaymentDetailFromHeader();
        expect(calls).toEqual(['clear', 'ensure']);
        expect((detail as unknown as { row: Record<string, unknown> }).row).toMatchObject({ CompanyID: 'co-a', PaymentTypeID: 'pt-wire', ReferenceNumber: '1001' });
    });

    it('keeps a saved detail whose company and tender already match', () => {
        const detail = savedDetail({ CompanyID: 'co-a', PaymentTypeID: 'pt-wire' });
        const { instance, calls } = savedHeader('co-a', 'pt-wire', detail);
        instance.SyncPaymentDetailFromHeader();
        expect(calls).toEqual([]);
        expect((detail as unknown as { row: Record<string, unknown> }).row.ID).toBe('detail-1');
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
