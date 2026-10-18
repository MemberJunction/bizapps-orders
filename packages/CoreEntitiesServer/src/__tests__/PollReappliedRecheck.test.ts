/**
 * Open `Reapplied` exceptions are re-checked on every poll, not only when the rail returns the
 * payment again (#814). No database: the selection and the rebuild from the stored payload are pure.
 */
import { describe, expect, it } from 'vitest';
import { BillComInvoiceRail } from '../BillComInvoiceRail.js';
import { BaseInvoiceRail } from '../BaseInvoiceRail.js';
import { ReappliedRowsToRecheck, type ExternalPaymentRow } from '../PollExternalPaymentsOperation.js';

const HEADER_ID = '99999999-2222-4333-8444-555555555555';
const payload = {
    customerId: 'cus1',
    amount: 1000,
    unappliedAmount: 0,
    paymentDate: '2026-10-12',
    status: 'PAID',
    updatedTime: '2026-10-12T15:00:00.000+0000',
    invoicePayments: [
        { invoiceId: 'invA', amount: 700 },
        { invoiceId: 'invB', amount: 300 },
    ],
};

const row = (over: Partial<ExternalPaymentRow> = {}): ExternalPaymentRow => ({
    ID: 'ext-1',
    ExternalPaymentRef: '0rp01',
    Disposition: 'Reapplied',
    DispositionReason: 'applied to different invoices',
    PaymentHeaderID: HEADER_ID,
    ExternalUpdatedAt: '2026-10-12T15:00:00Z',
    Payload: JSON.stringify(payload),
    ...over,
});

const billCom = new BillComInvoiceRail();

describe('re-checking open re-applied payments (#814)', () => {
    it('rebuilds a Bill.com payment from the stored payload, as the fetch would have', () => {
        const [only] = ReappliedRowsToRecheck([row()], [], billCom);
        expect(only.Row.ID).toBe('ext-1');
        expect(only.Record.ExternalPaymentRef).toBe('0rp01');
        expect(only.Record.Amount).toBe(1000);
        expect(only.Record.InvoicePayments.map((ip) => [ip.ExternalInvoiceRef, ip.Amount])).toEqual([
            ['invA', 700],
            ['invB', 300],
        ]);
    });

    it('leaves out a payment the rail returned this pass', () => {
        expect(ReappliedRowsToRecheck([row()], ['0rp01'], billCom)).toHaveLength(0);
    });

    it('leaves out rows that are not Reapplied, have no header, or carry an unreadable payload', () => {
        const rows = [
            row({ ID: 'a', Disposition: 'Captured' }),
            row({ ID: 'b', PaymentHeaderID: null }),
            row({ ID: 'c', Payload: '{not json' }),
            row({ ID: 'd', Payload: null }),
        ];
        expect(ReappliedRowsToRecheck(rows, [], billCom)).toHaveLength(0);
    });

    it('rebuilds nothing for a rail that cannot', () => {
        expect(ReappliedRowsToRecheck([row()], [], new BaseInvoiceRail())).toHaveLength(0);
    });
});
