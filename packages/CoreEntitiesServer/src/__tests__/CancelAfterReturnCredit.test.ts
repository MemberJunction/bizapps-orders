/**
 * golive #379: the origin's Bill.com invoice can still be cancelled after its return's credit is netted.
 *
 * Confirming a return now applies the return's credit to the order it reverses, as an `AccountCredit`
 * payment. `Orders.CancelExternalInvoice` refuses an invoice with money applied to it, and that credit
 * is a `Captured` payment line on the origin, so without the carve-out the return would itself make
 * the origin's Sent invoice uncancellable. Cash, and credit from anywhere but a return of this order,
 * still blocks the cancel.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    /** Payment lines on the origin, each tagged with whether it is its own return's credit. */
    lines: [] as Array<{ Amount: number; FromOwnReturn: boolean }>,
    archived: [] as string[],
}));

vi.mock('@memberjunction/core', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/core')>();
    return {
        ...actual,
        RunView: class {
            async RunView(params: { EntityName: string; ExtraFilter?: string }) {
                if (params.EntityName.includes('External Invoices')) {
                    return { Success: true, Results: [{ ID: INVOICE, OrderHeaderID: ORIGIN, OrderHeaderPaymentScheduleID: null, PaymentProviderID: PROVIDER, Status: 'Sent', ExternalInvoiceRef: 'bill-ref', DocumentNumber: 'INV-1' }] };
                }
                if (params.EntityName.includes('Payment Lines')) {
                    // The query decides what counts; the stub answers as SQL Server would for the two kinds of row.
                    const leavesOutOwnReturn = /ReversesOrderHeaderID\s*=\s*'bbbbbbbb-0000-4000-8000-000000000002'/i.test(params.ExtraFilter ?? '');
                    return { Success: true, Results: mocks.lines.filter((l) => !(leavesOutOwnReturn && l.FromOwnReturn)) };
                }
                return { Success: true, Results: [] };
            }
        },
    };
});

vi.mock('../InvoiceRailResolver.js', () => ({
    ResolveInvoiceRail: async () => ({
        Config: { Name: 'Bill.com Sandbox' },
        GetInvoice: async () => ({ Success: true, Value: { DueAmount: 3000, Total: 3000 } }),
        CancelInvoice: async (ref: string) => {
            mocks.archived.push(ref);
            return { Success: true };
        },
    }),
}));

import type { IMetadataProvider, UserInfo } from '@memberjunction/core';
import type { OrdersCancelExternalInvoiceInput, OrdersCancelExternalInvoiceOutput } from '@mj-biz-apps/orders-entities';
import { CancelExternalInvoiceOperation } from '../CancelExternalInvoiceOperation.js';

const PROVIDER = '11111111-2222-4333-8444-555555555555';
const ORIGIN = 'bbbbbbbb-0000-4000-8000-000000000002';
const INVOICE = 'cccccccc-2222-4333-8444-555555555555';

const provider = {
    GetEntityObject: async () => ({ InnerLoad: async () => true, SetMany: () => undefined, Set: () => undefined, Save: async () => true }),
} as unknown as IMetadataProvider;

interface Callable {
    InternalExecute(i: OrdersCancelExternalInvoiceInput, p: IMetadataProvider, u: UserInfo): Promise<OrdersCancelExternalInvoiceOutput>;
}
const cancel = () =>
    (new CancelExternalInvoiceOperation() as unknown as Callable).InternalExecute(
        { ExternalInvoiceID: INVOICE, Reason: 'Returned in full on ORD-002504: Pricing error' },
        provider,
        {} as UserInfo,
    );

beforeEach(() => {
    mocks.lines = [];
    mocks.archived = [];
});

describe('cancelling the origin’s invoice after its return’s credit was netted', () => {
    it('is allowed when the only money applied is the return’s own credit', async () => {
        mocks.lines = [{ Amount: 3000, FromOwnReturn: true }];

        const out = await cancel();

        expect(out).toMatchObject({ Success: true, ResultCode: 'CANCELED' });
        expect(mocks.archived).toEqual(['bill-ref']);
    });

    it('is still refused when cash was applied as well', async () => {
        mocks.lines = [
            { Amount: 2000, FromOwnReturn: true },
            { Amount: 1000, FromOwnReturn: false },
        ];

        const out = await cancel();

        expect(out).toMatchObject({ Success: false, ResultCode: 'HAS_PAYMENT' });
        expect(mocks.archived).toEqual([]);
    });
});
