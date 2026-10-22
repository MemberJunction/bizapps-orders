/**
 * What the POLL writes for a re-applied payment — not what the decision rule returns.
 *
 * WHY THIS FILE EXISTS AND THE BEHAVIOUR TEST DOES NOT COVER IT. `DecideExternalPayment` answered
 * correctly all along; the defect was one line further out, in the poller's `Ignore` branch, which
 * wrote `prior.Disposition` straight back. A payment whose allocation Finance had corrected therefore
 * kept the `Reapplied` label for ever — sitting on the queue page as an exception, under a reason
 * saying there was nothing wrong. A unit test of the rule could never see that, which is the whole
 * argument for testing through `handlePayment` instead.
 *
 * The second defect it covers is quieter. `applicationsDiffer` used to answer `false` when the ledger
 * read THREW, so "could not tell" arrived as "no difference" — and once the first defect was fixed, a
 * single failed read would have cleared a live exception with the wrong allocation still in place.
 *
 * The ledger is faked, not the poller: `RunView` and `GetEntityObject` are stubbed and the real
 * `handlePayment` runs against them, so what is asserted is the row this code actually writes.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
    /** PaymentLine rows the fake ledger holds for the payment header. */
    paymentLines: [] as Array<{ OrderHeaderID: string; OrderHeaderPaymentScheduleID: string | null; Amount: number }>,
    /** ExternalInvoice rows the fake ledger maps rail refs onto. */
    externalInvoices: [] as Array<{ ExternalInvoiceRef: string; OrderHeaderID: string; OrderHeaderPaymentScheduleID: string | null }>,
    /** Set to make the PaymentLine read throw, which is the "could not tell" case. */
    ledgerReadFails: false,
    /** What upsertExternalPayment wrote. */
    written: undefined as Record<string, unknown> | undefined,
}));

vi.mock('@memberjunction/core', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/core')>();
    return {
        ...actual,
        RunView: class {
            async RunView(params: { EntityName: string }) {
                if (params.EntityName.includes('Payment Lines')) {
                    if (mocks.ledgerReadFails) throw new Error('the ledger read failed');
                    return { Success: true, Results: mocks.paymentLines };
                }
                if (params.EntityName.includes('External Invoices')) return { Success: true, Results: mocks.externalInvoices };
                return { Success: true, Results: [] };
            }
        },
    };
});

import type { IMetadataProvider, UserInfo } from '@memberjunction/core';
import type { RailPaymentRecord } from '../BaseInvoiceRail.js';
import { PollExternalPaymentsOperation } from '../PollExternalPaymentsOperation.js';

const PROVIDER_ID = '11111111-2222-4333-8444-555555555555';
const HEADER_ID = '99999999-2222-4333-8444-555555555555';
const ORDER_A = 'aaaaaaaa-2222-4333-8444-555555555555';
const ORDER_B = 'bbbbbbbb-2222-4333-8444-555555555555';

/** Records what the poller sets, and reports a clean save. */
const fakeProvider = {
    GetEntityObject: async () => ({
        InnerLoad: async () => true,
        NewRecord: () => undefined,
        SetMany: (fields: Record<string, unknown>) => {
            mocks.written = { ...(mocks.written ?? {}), ...fields };
        },
        Save: async () => true,
        Get: () => HEADER_ID,
        LatestResult: undefined,
    }),
} as unknown as IMetadataProvider;

const fakeRail = { Config: { PaymentProviderID: PROVIDER_ID, Name: 'Bill.com Sandbox', TypeCode: 'BillCom', CompanyID: ORDER_A } };

const payment = (invoicePayments: Array<{ ExternalInvoiceRef: string; Amount: number }>): RailPaymentRecord =>
    ({
        ExternalPaymentRef: '0rp01',
        ExternalCustomerRef: 'cus1',
        Amount: 1000,
        UnappliedAmount: 0,
        PaymentDate: '2026-09-28',
        Status: 'PAID',
        OnlinePayment: false,
        ReceivablesType: 'CHECK',
        CurrencyCode: 'USD',
        UpdatedAt: '2026-09-28T00:00:00Z',
        InvoicePayments: invoicePayments,
        Raw: {},
    }) as unknown as RailPaymentRecord;

interface Callable {
    handlePayment(
        rail: unknown,
        p: RailPaymentRecord,
        prior: unknown,
        preview: boolean,
        bookingCurrency: string,
        provider: IMetadataProvider,
        user: UserInfo,
    ): Promise<{ Disposition: string; Reason: string }>;
}

const prior = (Disposition: string, DispositionReason: string) => ({
    ID: 'ext-1',
    ExternalPaymentRef: '0rp01',
    Disposition,
    DispositionReason,
    PaymentHeaderID: HEADER_ID,
    ExternalUpdatedAt: '2026-09-01T00:00:00Z',
});

function poll(priorRow: ReturnType<typeof prior>, invoicePayments: Array<{ ExternalInvoiceRef: string; Amount: number }>) {
    const op = new PollExternalPaymentsOperation() as unknown as Callable;
    return op.handlePayment(fakeRail, payment(invoicePayments), priorRow, false, 'USD', fakeProvider, {} as UserInfo);
}

beforeEach(() => {
    mocks.written = undefined;
    mocks.ledgerReadFails = false;
    // We hold 700 against order A; the rail is asked about A and B.
    mocks.paymentLines = [{ OrderHeaderID: ORDER_A, OrderHeaderPaymentScheduleID: null, Amount: 700 }];
    mocks.externalInvoices = [
        { ExternalInvoiceRef: 'invA', OrderHeaderID: ORDER_A, OrderHeaderPaymentScheduleID: null },
        { ExternalInvoiceRef: 'invB', OrderHeaderID: ORDER_B, OrderHeaderPaymentScheduleID: null },
    ];
});

describe('a payment Finance re-applied on the rail', () => {
    it('is flagged when the rail no longer matches the lines we hold', async () => {
        // 700 on A here; 700 on A plus 300 on B there.
        await poll(prior('Captured', 'Captured as PAY-1.'), [
            { ExternalInvoiceRef: 'invA', Amount: 700 },
            { ExternalInvoiceRef: 'invB', Amount: 300 },
        ]);
        expect(mocks.written?.Disposition).toBe('Reapplied');
    });

    it('KEEPS the flag on the next pass while the allocation is still wrong', async () => {
        await poll(prior('Reapplied', 'applied to different invoices'), [
            { ExternalInvoiceRef: 'invA', Amount: 700 },
            { ExternalInvoiceRef: 'invB', Amount: 300 },
        ]);
        expect(mocks.written?.Disposition).toBe('Reapplied');
    });

    it('STOPS reading as an exception once a person has re-allocated', async () => {
        // The defect: the row kept the Reapplied label for ever, with a reason saying all was well.
        mocks.paymentLines = [
            { OrderHeaderID: ORDER_A, OrderHeaderPaymentScheduleID: null, Amount: 700 },
            { OrderHeaderID: ORDER_B, OrderHeaderPaymentScheduleID: null, Amount: 300 },
        ];
        await poll(prior('Reapplied', 'applied to different invoices'), [
            { ExternalInvoiceRef: 'invA', Amount: 700 },
            { ExternalInvoiceRef: 'invB', Amount: 300 },
        ]);
        expect(mocks.written?.Disposition).toBe('Captured');
        expect(String(mocks.written?.DispositionReason)).toMatch(/matches again|cleared/i);
        expect(mocks.written?.PaymentHeaderID).toBe(HEADER_ID);
    });

    it('does NOT clear on a failed ledger read — could not tell is not all clear', async () => {
        mocks.ledgerReadFails = true;
        const out = await poll(prior('Reapplied', 'applied to different invoices'), [{ ExternalInvoiceRef: 'invA', Amount: 700 }]);
        expect(mocks.written?.Disposition).toBe('Reapplied');
        expect(out.Disposition).toBe('Reapplied');
    });

    it('keeps the words that described the difference when it could not re-check them', async () => {
        mocks.ledgerReadFails = true;
        await poll(prior('Reapplied', 'Bill.com moved 300.00 from invoice A to invoice B'), [{ ExternalInvoiceRef: 'invA', Amount: 700 }]);
        expect(mocks.written?.DispositionReason).toBe('Bill.com moved 300.00 from invoice A to invoice B');
    });

    it('leaves a merely-captured payment alone when the read fails', async () => {
        mocks.ledgerReadFails = true;
        await poll(prior('Captured', 'Captured as PAY-1.'), [{ ExternalInvoiceRef: 'invA', Amount: 700 }]);
        expect(mocks.written?.Disposition).toBe('Captured');
    });

    it('sees money moved between two instalments of ONE order', async () => {
        const I1 = 'cccccccc-2222-4333-8444-555555555555';
        const I2 = 'dddddddd-2222-4333-8444-555555555555';
        mocks.paymentLines = [{ OrderHeaderID: ORDER_A, OrderHeaderPaymentScheduleID: I1, Amount: 700 }];
        mocks.externalInvoices = [{ ExternalInvoiceRef: 'invA', OrderHeaderID: ORDER_A, OrderHeaderPaymentScheduleID: I2 }];
        await poll(prior('Captured', 'Captured as PAY-1.'), [{ ExternalInvoiceRef: 'invA', Amount: 700 }]);
        expect(mocks.written?.Disposition).toBe('Reapplied');
    });
});
