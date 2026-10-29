/**
 * A Bill.com payment captured here and then voided or cancelled on the rail (golive #386).
 *
 * The poll used to flag it `ReversalNeeded` and stop: the payment stayed captured, the order read paid,
 * and the exception row offered nothing to act on. Now the poll reverses it as a bank return through
 * `PaymentReversalFactory` and records the row `Ignored`, naming the reversal.
 *
 * The defects these guard are the expensive ones: a second pass (or a pass after a crash between the
 * reversal and the row update) reversing the same cash twice; a preview writing a reversal; and a
 * refund or dispute, which a person has to book, being reversed as if the bank had returned it.
 *
 * The factory and the ledger are faked, not the poller: the real `handlePayment` runs.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
    /** PaymentHeader rows: the original and any reversal pointing at it. */
    headers: [] as Array<Record<string, unknown>>,
    /** What each CreateReversingPayment call was asked to write. */
    created: [] as Array<{ Source: string; Amount: number }>,
    /** Set to make the reversal's save throw. */
    reversalFails: false,
    /** What upsertExternalPayment wrote. */
    written: undefined as Record<string, unknown> | undefined,
    transactions: [] as string[],
}));

vi.mock('@memberjunction/core', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/core')>();
    return {
        ...actual,
        RunView: class {
            async RunView(params: { EntityName: string }) {
                if (params.EntityName.includes('Payment Headers')) return { Success: true, Results: mocks.headers };
                if (params.EntityName.includes('Payment Lines')) return { Success: true, Results: [{ OrderHeaderID: ORDER_A, OrderHeaderPaymentScheduleID: null, Amount: 1.37 }] };
                return { Success: true, Results: [] };
            }
        },
    };
});

vi.mock('../PaymentReversalFactory.js', () => ({
    LoadAppliedAllocations: async () => [{ OrderHeaderID: ORDER_A, OrderLineID: null, OrderHeaderPaymentScheduleID: null, Amount: 1.37 }],
    BuildUnapplyLines: async () => [],
    CreateReversingPayment: async (_p: unknown, _u: unknown, _original: unknown, request: { Source: string; Amount: number }) => {
        if (mocks.reversalFails) throw new Error('the reversal did not save');
        mocks.created.push(request);
        return { ID: REVERSAL_ID, Number: 'PAY-000070' };
    },
}));

import type { IMetadataProvider, UserInfo } from '@memberjunction/core';
import type { RailPaymentRecord } from '../BaseInvoiceRail.js';
import { PollExternalPaymentsOperation } from '../PollExternalPaymentsOperation.js';

const PROVIDER_ID = '11111111-2222-4333-8444-555555555555';
const HEADER_ID = '99999999-2222-4333-8444-555555555555';
const REVERSAL_ID = '88888888-2222-4333-8444-555555555555';
const ORDER_A = 'aaaaaaaa-2222-4333-8444-555555555555';

const fakeProvider = {
    GetEntityObject: async () => ({
        InnerLoad: async () => true,
        NewRecord: () => undefined,
        SetMany: (fields: Record<string, unknown>) => {
            mocks.written = { ...(mocks.written ?? {}), ...fields };
        },
        Save: async () => true,
        Get: () => 'ext-1',
        LatestResult: undefined,
    }),
    BeginTransaction: async () => void mocks.transactions.push('begin'),
    CommitTransaction: async () => void mocks.transactions.push('commit'),
    RollbackTransaction: async () => void mocks.transactions.push('rollback'),
} as unknown as IMetadataProvider;

const billCom = { Config: { PaymentProviderID: PROVIDER_ID, Name: 'Bill.com Sandbox', TypeCode: 'BillCom', CompanyID: ORDER_A } };
const hubSpot = { Config: { PaymentProviderID: PROVIDER_ID, Name: 'HubSpot', TypeCode: 'HubSpotPayments', CompanyID: ORDER_A } };

const payment = (Status: string): RailPaymentRecord =>
    ({
        ExternalPaymentRef: '0rp02DLMZTFNGM1jmsjx',
        ExternalCustomerRef: 'cus1',
        Amount: 1.37,
        UnappliedAmount: 0,
        PaymentDate: '2026-10-27',
        Status,
        OnlinePayment: false,
        ReceivablesType: 'CHECK',
        CurrencyCode: 'USD',
        UpdatedAt: '2026-10-27T20:00:00Z',
        InvoicePayments: [],
        Raw: {},
    }) as unknown as RailPaymentRecord;

const prior = (Disposition: string) => ({
    ID: 'ext-1',
    ExternalPaymentRef: '0rp02DLMZTFNGM1jmsjx',
    Disposition,
    DispositionReason: 'Captured as PAY-000069.',
    PaymentHeaderID: HEADER_ID,
    ExternalUpdatedAt: '2026-10-27T10:00:00Z',
});

const original = {
    ID: HEADER_ID,
    PaymentNumber: 'PAY-000069',
    ReceivingCompanyID: ORDER_A,
    BillToOrganizationID: ORDER_A,
    BillToPersonID: null,
    PaymentTypeID: ORDER_A,
    PaymentDetailID: null,
    Amount: 1.37,
    ReversesPaymentHeaderID: null,
    ReversalSource: null,
    Status: 'Captured',
};

interface Callable {
    handlePayment(rail: unknown, p: RailPaymentRecord, prior: unknown, preview: boolean, bookingCurrency: string, provider: IMetadataProvider, user: UserInfo): Promise<{ Disposition: string; Reason: string; PaymentNumber?: string | null }>;
}

function poll(status: string, priorRow: ReturnType<typeof prior> | null, opts: { preview?: boolean; rail?: unknown } = {}) {
    const op = new PollExternalPaymentsOperation() as unknown as Callable;
    return op.handlePayment(opts.rail ?? billCom, payment(status), priorRow, !!opts.preview, 'USD', fakeProvider, {} as UserInfo);
}

beforeEach(() => {
    mocks.headers = [original];
    mocks.created = [];
    mocks.reversalFails = false;
    mocks.written = undefined;
    mocks.transactions = [];
});

describe('a captured Bill.com payment the rail reports cancelled', () => {
    it('is reversed once, as a bank return for the full amount, and the row reads Ignored naming the reversal', async () => {
        const out = await poll('CANCELED', prior('Captured'));
        expect(mocks.created).toEqual([expect.objectContaining({ Source: 'BankReturn', Amount: 1.37 })]);
        expect(mocks.transactions).toEqual(['begin', 'commit']);
        expect(mocks.written?.Disposition).toBe('Ignored');
        expect(String(mocks.written?.DispositionReason)).toMatch(/^Reversed as PAY-000070 on \d{4}-\d{2}-\d{2}: Bill\.com reports .* 'CANCELED'/);
        expect(mocks.written?.PaymentHeaderID).toBe(HEADER_ID);
        expect(out.Disposition).toBe('Ignored');
        expect(out.PaymentNumber).toBe('PAY-000070');
    });

    it('a void is reversed the same way', async () => {
        await poll('VOID', prior('Captured'));
        expect(mocks.created).toHaveLength(1);
    });

    it('reverses a row an earlier pass left at ReversalNeeded (the transition from report-only)', async () => {
        await poll('CANCELED', prior('ReversalNeeded'));
        expect(mocks.created).toHaveLength(1);
        expect(mocks.written?.Disposition).toBe('Ignored');
    });

    it('does NOT reverse again when a bank-return reversal already exists, even if the row still reads ReversalNeeded', async () => {
        // A crash between the reversal's commit and the row update leaves exactly this state.
        mocks.headers = [original, { ...original, ID: REVERSAL_ID, PaymentNumber: 'PAY-000070', ReversesPaymentHeaderID: HEADER_ID, ReversalSource: 'BankReturn', Status: 'Refunded' }];
        await poll('CANCELED', prior('ReversalNeeded'));
        expect(mocks.created).toHaveLength(0);
        expect(mocks.written?.Disposition).toBe('Ignored');
        expect(String(mocks.written?.DispositionReason)).toMatch(/^Reversed as PAY-000070/);
    });

    it('does nothing on the pass after, once the row reads Ignored', async () => {
        await poll('CANCELED', prior('Ignored'));
        expect(mocks.created).toHaveLength(0);
        expect(mocks.written?.Disposition).toBe('Ignored');
    });

    it('reverses only what an earlier refund did not already give back', async () => {
        mocks.headers = [original, { ...original, ID: REVERSAL_ID, PaymentNumber: 'PAY-000071', Amount: 0.37, ReversesPaymentHeaderID: HEADER_ID, ReversalSource: 'Refund', Status: 'Refunded' }];
        await poll('CANCELED', prior('Captured'));
        expect(mocks.created).toEqual([expect.objectContaining({ Source: 'BankReturn', Amount: 1 })]);
    });

    it('a preview reverses nothing and says what it would do', async () => {
        const out = await poll('CANCELED', prior('Captured'), { preview: true });
        expect(mocks.created).toHaveLength(0);
        expect(mocks.transactions).toHaveLength(0);
        expect(mocks.written).toBeUndefined();
        expect(out.Disposition).toBe('ReversalNeeded');
        expect(out.Reason).toMatch(/Would reverse 1\.37 of PAY-000069/);
    });

    it('a failed reversal rolls back and leaves the row ReversalNeeded with the error', async () => {
        mocks.reversalFails = true;
        const out = await poll('CANCELED', prior('Captured'));
        expect(mocks.transactions).toEqual(['begin', 'rollback']);
        expect(mocks.written?.Disposition).toBe('ReversalNeeded');
        expect(String(mocks.written?.DispositionReason)).toMatch(/automatic reversal failed: the reversal did not save/);
        expect(out.Disposition).toBe('ReversalNeeded');
    });
});

describe('a refund or dispute on a captured payment', () => {
    it('stays ReversalNeeded for a person and is never reversed by the poll', async () => {
        await poll('PARTIALLY_REFUNDED', prior('Captured'), { rail: hubSpot });
        expect(mocks.written?.Disposition).toBe('ReversalNeeded');
        await poll('REFUNDED', prior('Captured'), { rail: hubSpot });
        expect(mocks.written?.Disposition).toBe('ReversalNeeded');
        expect(mocks.created).toHaveLength(0);
    });
});
