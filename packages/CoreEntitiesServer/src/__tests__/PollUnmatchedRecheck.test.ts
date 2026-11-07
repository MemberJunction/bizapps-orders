/**
 * Open `Unmatched` payments are re-checked on every poll, not only when the rail returns the payment
 * again (bc-aidp-next-golive#446). A Bill.com payment against an invoice loaded after cutover was
 * parked Unmatched, and once the rail stopped returning it nothing ever looked at it again.
 *
 * The selection is pure and tested directly. The recheck itself runs through the real poller against
 * a faked ledger (the harness of `PollReappliedResolution.test.ts`), with the capture operation
 * stubbed, so what is asserted is which rows the poll re-decides and what it writes for them. One
 * test drives the whole provider pass, so the recheck cannot drop out of it unnoticed.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
    /** ExternalPayment rows the fake table holds; the loader's filter is applied to them. */
    externalPayments: [] as Array<Record<string, unknown>>,
    /** ExternalInvoice rows the fake ledger maps rail refs onto. */
    externalInvoices: [] as Array<{ ID: string; ExternalInvoiceRef: string; OrderHeaderID: string; CompanyID: string; OrderHeaderPaymentScheduleID: string | null }>,
    /** Filters the poller sent for ExternalPayment reads. */
    paymentFilters: [] as string[],
    /** Every ExternalPayment read the poller sent, as sent. */
    paymentReads: [] as Array<Record<string, unknown>>,
    /** The rail the resolver hands `pollProvider`. */
    rail: null as unknown,
    /** Captures the poller asked for. */
    captures: [] as Array<Record<string, unknown>>,
    /** What upsertExternalPayment wrote, per call. */
    writes: [] as Array<Record<string, unknown>>,
}));

vi.mock('@memberjunction/core', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/core')>();
    return {
        ...actual,
        RunView: class {
            async RunView(params: { EntityName: string; ExtraFilter?: string }) {
                const filter = params.ExtraFilter ?? '';
                if (params.EntityName.includes('External Payments')) {
                    mocks.paymentFilters.push(filter);
                    mocks.paymentReads.push(params);
                    const m = /Disposition = '(\w+)'/.exec(filter);
                    return { Success: true, Results: mocks.externalPayments.filter((r) => !m || r.Disposition === m[1]) };
                }
                if (params.EntityName.includes('External Invoices')) {
                    return { Success: true, Results: mocks.externalInvoices.filter((i) => filter.includes(`'${i.ExternalInvoiceRef}'`)) };
                }
                if (params.EntityName.includes('Order Headers')) {
                    return { Success: true, Results: mocks.externalInvoices.map((i) => ({ ID: i.OrderHeaderID, BillToOrganizationID: ORG_ID, BillToPersonID: null })) };
                }
                return { Success: true, Results: [] };
            }
        },
    };
});

vi.mock('@mj-biz-apps/orders-entities', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@mj-biz-apps/orders-entities')>();
    return {
        ...actual,
        OrdersCapturePaymentOperation: class {
            async Execute(input: Record<string, unknown>) {
                mocks.captures.push(input);
                return { Success: true, Output: { Success: true, PaymentNumber: 'PAY-1', PaymentHeaderID: HEADER_ID, WasRetry: false } };
            }
        },
    };
});

vi.mock('../InvoiceRailResolver.js', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../InvoiceRailResolver.js')>();
    return { ...actual, ResolveInvoiceRail: vi.fn(async () => mocks.rail) };
});

import type { IMetadataProvider, UserInfo } from '@memberjunction/core';
import { BillComInvoiceRail } from '../BillComInvoiceRail.js';
import { BaseInvoiceRail } from '../BaseInvoiceRail.js';
import { EveryInvoiceIssued, PollExternalPaymentsOperation, UnmatchedRowsToRecheck, type ExternalPaymentRow } from '../PollExternalPaymentsOperation.js';

const PROVIDER_ID = '11111111-2222-4333-8444-555555555555';
const HEADER_ID = '99999999-2222-4333-8444-555555555555';
const ORDER_A = 'aaaaaaaa-2222-4333-8444-555555555555';
const ORDER_B = 'bbbbbbbb-2222-4333-8444-555555555555';
const COMPANY_ID = 'cccccccc-2222-4333-8444-555555555555';
const ORG_ID = 'dddddddd-2222-4333-8444-555555555555';

const payload = (invoiceIds: string[]) => ({
    customerId: 'cus1',
    amount: 20000,
    unappliedAmount: 0,
    paymentDate: '2026-10-01',
    status: 'PAID',
    currency: 'USD',
    receivablesType: 'CHECK',
    updatedTime: '2026-10-01T15:00:00.000+0000',
    invoicePayments: invoiceIds.map((invoiceId) => ({ invoiceId, amount: 20000 / invoiceIds.length })),
});

const row = (over: Partial<ExternalPaymentRow> = {}, invoiceIds = ['invA']): ExternalPaymentRow => ({
    ID: 'ext-1',
    ExternalPaymentRef: '0rp01',
    Disposition: 'Unmatched',
    DispositionReason: 'Bill.com invoice invA is not one Orders issued.',
    PaymentHeaderID: null,
    ExternalUpdatedAt: '2026-10-01T15:00:00Z',
    Payload: JSON.stringify(payload(invoiceIds)),
    ...over,
});

const invoice = (ref: string, order = ORDER_A) => ({ ID: `ei-${ref}`, ExternalInvoiceRef: ref, OrderHeaderID: order, CompanyID: COMPANY_ID, OrderHeaderPaymentScheduleID: null });

const billCom = new BillComInvoiceRail();

describe('choosing open unmatched payments to re-check', () => {
    it('rebuilds a Bill.com payment from the stored payload, as the fetch would have', () => {
        const [only] = UnmatchedRowsToRecheck([row()], [], billCom);
        expect(only.Row.ID).toBe('ext-1');
        expect(only.Record.Amount).toBe(20000);
        expect(only.Record.InvoicePayments.map((ip) => ip.ExternalInvoiceRef)).toEqual(['invA']);
    });

    it('leaves out a payment the rail returned this pass', () => {
        expect(UnmatchedRowsToRecheck([row()], ['0rp01'], billCom)).toHaveLength(0);
    });

    it('leaves out Ignored and other rows, a row with a header, an unreadable payload, and a payment applied to no invoice', () => {
        const rows = [
            row({ ID: 'a', Disposition: 'Ignored' }),
            row({ ID: 'b', Disposition: 'Held' }),
            row({ ID: 'c', PaymentHeaderID: HEADER_ID }),
            row({ ID: 'd', Payload: '{not json' }),
            row({ ID: 'e', Payload: null }),
            row({ ID: 'f' }, []),
        ];
        expect(UnmatchedRowsToRecheck(rows, [], billCom)).toHaveLength(0);
    });

    it('rebuilds nothing for a rail that cannot', () => {
        expect(UnmatchedRowsToRecheck([row()], [], new BaseInvoiceRail())).toHaveLength(0);
    });

    it('asks for every invoice, never some of them', () => {
        const [only] = UnmatchedRowsToRecheck([row({}, ['invA', 'invB'])], [], billCom);
        expect(EveryInvoiceIssued(only.Record, new Set(['invA']))).toBe(false);
        expect(EveryInvoiceIssued(only.Record, new Set(['invA', 'invB']))).toBe(true);
    });
});

interface Callable {
    recheckOpenUnmatched(
        rail: unknown,
        fetchedRefs: readonly string[],
        preview: boolean,
        bookingCurrency: string,
        provider: IMetadataProvider,
        user: UserInfo,
    ): Promise<Array<{ ExternalPaymentRef: string; Disposition: string }>>;
}

/** Records what the poller sets on each save, and reports it clean. */
const fakeProvider = {
    GetEntityObject: async () => {
        const fields: Record<string, unknown> = {};
        return {
            InnerLoad: async () => true,
            NewRecord: () => undefined,
            SetMany: (f: Record<string, unknown>) => Object.assign(fields, f),
            Save: async () => {
                mocks.writes.push(fields);
                return true;
            },
            Get: () => HEADER_ID,
            LatestResult: undefined,
        };
    },
} as unknown as IMetadataProvider;

const rail = Object.assign(new BillComInvoiceRail(), {
    Config: { PaymentProviderID: PROVIDER_ID, Name: 'Bill.com Sandbox', TypeCode: 'BillCom', CompanyID: COMPANY_ID },
    GetInvoice: async () => ({ Success: false, Reason: 'not needed here' }),
});

function recheck(fetchedRefs: string[] = []) {
    const op = new PollExternalPaymentsOperation() as unknown as Callable;
    return op.recheckOpenUnmatched(rail, fetchedRefs, false, 'USD', fakeProvider, {} as UserInfo);
}

beforeEach(() => {
    mocks.externalPayments = [];
    mocks.externalInvoices = [];
    mocks.paymentFilters = [];
    mocks.paymentReads = [];
    mocks.rail = rail;
    mocks.captures = [];
    mocks.writes = [];
});

describe('a payment parked Unmatched before its invoice was loaded', () => {
    it('is captured on the next pass once the invoice exists', async () => {
        mocks.externalPayments = [row()];
        // First pass: the invoice is not loaded yet, so nothing is re-decided or rewritten.
        expect(await recheck()).toEqual([]);
        expect(mocks.captures).toHaveLength(0);
        expect(mocks.writes).toHaveLength(0);

        // The cutover load adds the invoice; the next pass captures the payment the normal way.
        mocks.externalInvoices = [invoice('invA')];
        const out = await recheck();
        expect(out.map((o) => o.Disposition)).toEqual(['Captured']);
        expect(mocks.captures).toHaveLength(1);
        expect(mocks.captures[0]).toMatchObject({ Amount: 20000, ReceivingCompanyID: COMPANY_ID, IdempotencyKey: 'billcom:0rp01' });
        expect(mocks.writes.at(-1)).toMatchObject({ Disposition: 'Captured', PaymentHeaderID: HEADER_ID });
    });

    it('stays Unmatched, untouched, while one of its invoices is still missing', async () => {
        mocks.externalPayments = [row({}, ['invA', 'invB'])];
        mocks.externalInvoices = [invoice('invA', ORDER_A)];
        expect(await recheck()).toEqual([]);
        expect(mocks.captures).toHaveLength(0);
        expect(mocks.writes).toHaveLength(0);
    });

    it('reads only open Unmatched rows of this provider, so an Ignored row is never re-decided', async () => {
        mocks.externalPayments = [row({ ID: 'ign', ExternalPaymentRef: '0rp02', Disposition: 'Ignored', DispositionReason: 'Set aside by Finance.' })];
        mocks.externalInvoices = [invoice('invA')];
        expect(await recheck()).toEqual([]);
        expect(mocks.paymentFilters).toHaveLength(1);
        expect(mocks.paymentFilters[0]).toContain(`PaymentProviderID = '${PROVIDER_ID}'`);
        expect(mocks.paymentFilters[0]).toContain(`Disposition = 'Unmatched'`);
        expect(mocks.captures).toHaveLength(0);
        expect(mocks.writes).toHaveLength(0);
    });

    it('leaves a payment the fetch already re-decided this pass to the fetch', async () => {
        mocks.externalPayments = [row()];
        mocks.externalInvoices = [invoice('invA')];
        expect(await recheck(['0rp01'])).toEqual([]);
        expect(mocks.captures).toHaveLength(0);
    });
});

describe('reading the open unmatched rows', () => {
    it('reads every row, not the first page the entity row limit allows, and names the columns it uses', async () => {
        mocks.externalPayments = [row()];
        await recheck();
        expect(mocks.paymentReads).toHaveLength(1);
        expect(mocks.paymentReads[0]).toMatchObject({ IgnoreMaxRows: true, BypassCache: true });
        expect(mocks.paymentReads[0].MaxRows).toBeUndefined();
        expect(mocks.paymentReads[0].Fields).toEqual(
            expect.arrayContaining(['ID', 'ExternalPaymentRef', 'Disposition', 'DispositionReason', 'PaymentHeaderID', 'ExternalUpdatedAt', 'Payload']),
        );
    });
});

interface Pollable {
    pollProvider(
        paymentProviderID: string,
        opts: { preview: boolean; maxCount: number; since: string | null },
        newlyWaiting: unknown[],
        provider: IMetadataProvider,
        user: UserInfo,
    ): Promise<{ Outcomes: Array<{ ExternalPaymentRef: string; Disposition: string }>; Fault: string | null }>;
}

describe('a provider pass', () => {
    it('captures a parked payment whose invoice was loaded, though the rail no longer returns it', async () => {
        // The rail returns nothing new: only the recheck in the pass can reach the parked payment.
        mocks.rail = Object.assign(new BillComInvoiceRail(), {
            Config: rail.Config,
            GetInvoice: rail.GetInvoice,
            CheckConfiguration: async () => ({ Success: true, Value: true }),
            FetchPaymentsSince: async () => ({ Success: true, Value: { Payments: [], NewWatermark: null } }),
        });
        mocks.externalPayments = [row()];
        mocks.externalInvoices = [invoice('invA')];
        const op = new PollExternalPaymentsOperation() as unknown as Pollable;
        const out = await op.pollProvider(PROVIDER_ID, { preview: false, maxCount: 100, since: null }, [], fakeProvider, {} as UserInfo);
        expect(out.Fault).toBeNull();
        expect(out.Outcomes).toEqual([expect.objectContaining({ ExternalPaymentRef: '0rp01', Disposition: 'Captured' })]);
        expect(mocks.captures).toHaveLength(1);
        expect(mocks.writes).toContainEqual(expect.objectContaining({ Disposition: 'Captured', PaymentHeaderID: HEADER_ID }));
    });
});
