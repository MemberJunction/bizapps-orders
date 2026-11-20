/**
 * A rail payment that would pay more than an order or instalment still owes is Held, not captured
 * (golive #148). A receipt keyed in Orders and then marked paid on the Bill.com invoice came back
 * through the poll as a second payment, and the cash was booked twice.
 *
 * The rule is pure and tested directly; the poller runs against the faked ledger of
 * `PollUnmatchedRecheck.test.ts`, through the open-Unmatched recheck, with the capture stubbed.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    externalPayments: [] as Array<Record<string, unknown>>,
    externalInvoices: [] as Array<{ ID: string; ExternalInvoiceRef: string; OrderHeaderID: string; CompanyID: string; OrderHeaderPaymentScheduleID: string | null }>,
    /** Order balances by order ID; an order missing here is returned with no Balance. */
    balances: {} as Record<string, number>,
    /** Schedule rows the fake ledger holds. */
    schedules: [] as Array<{ ID: string; InstallmentNumber: number; Balance: number }>,
    captures: [] as Array<Record<string, unknown>>,
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
                    const m = /Disposition = '(\w+)'/.exec(filter);
                    return { Success: true, Results: mocks.externalPayments.filter((r) => !m || r.Disposition === m[1]) };
                }
                if (params.EntityName.includes('External Invoices')) {
                    return { Success: true, Results: mocks.externalInvoices.filter((i) => filter.includes(`'${i.ExternalInvoiceRef}'`)) };
                }
                if (params.EntityName.includes('Payment Schedules')) {
                    return { Success: true, Results: mocks.schedules.filter((s) => filter.includes(`'${s.ID}'`)) };
                }
                if (params.EntityName.includes('Order Headers')) {
                    return {
                        Success: true,
                        Results: [...new Set(mocks.externalInvoices.map((i) => i.OrderHeaderID))].map((id) => ({
                            ID: id,
                            OrderNumber: 'ORD-002499',
                            BillToOrganizationID: ORG_ID,
                            BillToPersonID: null,
                            ...(id in mocks.balances ? { Balance: mocks.balances[id] } : {}),
                        })),
                    };
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

import type { IMetadataProvider, UserInfo } from '@memberjunction/core';
import { BillComInvoiceRail } from '../BillComInvoiceRail.js';
import { AlreadyPaidReason, PollExternalPaymentsOperation, type ExternalPaymentRow } from '../PollExternalPaymentsOperation.js';

const PROVIDER_ID = '11111111-2222-4333-8444-555555555555';
const HEADER_ID = '99999999-2222-4333-8444-555555555555';
const ORDER_A = 'aaaaaaaa-2222-4333-8444-555555555555';
const SCHEDULE_1 = 'eeeeeeee-2222-4333-8444-555555555555';
const COMPANY_ID = 'cccccccc-2222-4333-8444-555555555555';
const ORG_ID = 'dddddddd-2222-4333-8444-555555555555';

const row = (): ExternalPaymentRow => ({
    ID: 'ext-1',
    ExternalPaymentRef: '0rp01',
    Disposition: 'Unmatched',
    DispositionReason: 'Bill.com invoice invA is not one Orders issued.',
    PaymentHeaderID: null,
    ExternalUpdatedAt: '2026-10-26T15:00:00Z',
    Payload: JSON.stringify({
        customerId: 'cus1',
        amount: 1,
        unappliedAmount: 0,
        paymentDate: '2026-10-26',
        status: 'PAID',
        currency: 'USD',
        receivablesType: 'CASH',
        updatedTime: '2026-10-26T15:00:00.000+0000',
        invoicePayments: [{ invoiceId: 'invA', amount: 1 }],
    }),
});

const invoice = (scheduleID: string | null = null) => ({ ID: 'ei-invA', ExternalInvoiceRef: 'invA', OrderHeaderID: ORDER_A, CompanyID: COMPANY_ID, OrderHeaderPaymentScheduleID: scheduleID });

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

interface Callable {
    recheckOpenUnmatched(
        rail: unknown,
        fetchedRefs: readonly string[],
        preview: boolean,
        bookingCurrency: string,
        provider: IMetadataProvider,
        user: UserInfo,
        newlyWaiting: unknown[],
    ): Promise<Array<{ ExternalPaymentRef: string; Disposition: string; Reason: string }>>;
}

function recheck() {
    const op = new PollExternalPaymentsOperation() as unknown as Callable;
    return op.recheckOpenUnmatched(rail, [], false, 'USD', fakeProvider, {} as UserInfo, []);
}

beforeEach(() => {
    mocks.externalPayments = [row()];
    mocks.externalInvoices = [invoice()];
    mocks.balances = {};
    mocks.schedules = [];
    mocks.captures = [];
    mocks.writes = [];
});

describe('AlreadyPaidReason', () => {
    const orders = new Map([[ORDER_A, { OrderNumber: 'ORD-002499', Balance: 0 }]]);

    it('names an order that has nothing open', () => {
        const why = AlreadyPaidReason('0rp01', 'Bill.com', [{ OrderHeaderID: ORDER_A, Amount: 1 }], orders, new Map());
        expect(why).toContain('Already paid in Orders');
        expect(why).toContain('1.00 to ORD-002499, which has 0.00 open');
    });

    it('lets a payment that fits through, and judges nothing whose balance was not read', () => {
        expect(AlreadyPaidReason('0rp01', 'Bill.com', [{ OrderHeaderID: ORDER_A, Amount: 1 }], new Map([[ORDER_A, { OrderNumber: 'ORD-1', Balance: 1 }]]), new Map())).toBeNull();
        expect(AlreadyPaidReason('0rp01', 'Bill.com', [{ OrderHeaderID: ORDER_A, Amount: 1 }], new Map([[ORDER_A, { OrderNumber: 'ORD-1', Balance: null }]]), new Map())).toBeNull();
    });

    it('sums several applications to the same order', () => {
        const half = new Map([[ORDER_A, { OrderNumber: 'ORD-1', Balance: 1.5 }]]);
        const two = [
            { OrderHeaderID: ORDER_A, Amount: 1 },
            { OrderHeaderID: ORDER_A, Amount: 1 },
        ];
        expect(AlreadyPaidReason('0rp01', 'Bill.com', two, half, new Map())).toContain('2.00 to ORD-1, which has 1.50 open');
    });

    it('names a paid instalment on an order that still owes others', () => {
        const owing = new Map([[ORDER_A, { OrderNumber: 'ORD-1', Balance: 500 }]]);
        const schedules = new Map([[SCHEDULE_1, { InstallmentNumber: 1, Balance: 0 }]]);
        const why = AlreadyPaidReason('0rp01', 'Bill.com', [{ OrderHeaderID: ORDER_A, Amount: 250, OrderHeaderPaymentScheduleID: SCHEDULE_1 }], owing, schedules);
        expect(why).toContain('250.00 to installment 1 of ORD-1, which has 0.00 open');
    });
});

describe('the poll and an order already paid here', () => {
    it('holds the payment for a person and captures nothing', async () => {
        mocks.balances = { [ORDER_A]: 0 };
        const out = await recheck();
        expect(out.map((o) => o.Disposition)).toEqual(['Held']);
        expect(out[0].Reason).toContain('Already paid in Orders');
        expect(mocks.captures).toHaveLength(0);
        expect(mocks.writes.at(-1)).toMatchObject({ Disposition: 'Held', PaymentHeaderID: null });
    });

    it('holds a payment on an instalment already paid', async () => {
        mocks.externalInvoices = [invoice(SCHEDULE_1)];
        mocks.balances = { [ORDER_A]: 100 };
        mocks.schedules = [{ ID: SCHEDULE_1, InstallmentNumber: 1, Balance: 0 }];
        const out = await recheck();
        expect(out.map((o) => o.Disposition)).toEqual(['Held']);
        expect(mocks.captures).toHaveLength(0);
    });

    it('captures it once the balance is open again', async () => {
        mocks.balances = { [ORDER_A]: 1 };
        const out = await recheck();
        expect(out.map((o) => o.Disposition)).toEqual(['Captured']);
        expect(mocks.captures).toHaveLength(1);
    });
});
