/**
 * A read that fails is an error, not an empty list.
 *
 * Each of these reads used to take `Results ?? []` without looking at `Success`, so a timeout or a
 * permission error came back looking like "nothing there": an empty fulfilment queue, an empty
 * invoicing worklist, no rail providers. The worst case is the unit history behind a Bill.com send,
 * where "no rows" means "never sent" and the sweep would send a second invoice for the same order.
 *
 * The provider here fails the reads named in `mocks.failing` (matched on entity name, and on the
 * filter when one is given) and answers every other read with fixed rows.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
    failing: [] as Array<{ Entity: string; FilterIncludes?: string }>,
    issued: 0,
}));

vi.mock('@memberjunction/core', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/core')>();
    return {
        ...actual,
        RunView: class FakeRunView {
            static FromMetadataProvider() {
                return new FakeRunView();
            }
            async RunView(params: { EntityName: string; ExtraFilter?: string }) {
                const e = params.EntityName;
                const fails = mocks.failing.some(
                    (f) => e.includes(f.Entity) && (!f.FilterIncludes || (params.ExtraFilter ?? '').includes(f.FilterIncludes)),
                );
                if (fails) return { Success: false, ErrorMessage: 'Request timed out', Results: [] };
                if (e.includes('Order Headers')) {
                    return { Success: true, Results: [{ ID: ORDER, OrderNumber: 'ORD-0001', Status: 'Confirmed', CompanyID: COMPANY, Company: 'Placeholder Seller', BillToOrganizationID: null, BillToPersonID: null, ConfirmedAt: '2026-09-01', DueDate: '2026-10-01', Balance: 600 }] };
                }
                if (e.includes('Payment Provider Types')) return { Success: true, Results: [{ ID: PROVIDER_TYPE }] };
                if (e.includes('Payment Providers')) return { Success: true, Results: [{ ID: PROVIDER, CompanyID: COMPANY }] };
                return { Success: true, Results: [] };
            }
        },
    };
});

vi.mock('../InvoiceRailResolver.js', async (importOriginal) => ({
    ...(await importOriginal<typeof import('../InvoiceRailResolver.js')>()),
    FindInvoiceRailForCompany: async () => ({
        Config: { PaymentProviderID: PROVIDER, Name: 'Bill.com Sandbox', TypeCode: 'BillCom', CompanyID: COMPANY },
        CheckConfiguration: async () => ({ Success: true }),
        IssueInvoice: async () => {
            mocks.issued++;
            return { Success: true, Value: { ExternalInvoiceRef: '00e0NEW' } };
        },
    }),
}));

import type { IMetadataProvider, UserInfo } from '@memberjunction/core';
import type { OrdersGetFulfillmentQueueInput, OrdersGetFulfillmentQueueOutput } from '@mj-biz-apps/orders-entities';
import { GetFulfillmentQueueOperation } from '../GetFulfillmentQueueOperation.js';
import { BuildExternalInvoicingWorklist } from '../GetExternalInvoicingWorklistOperation.js';
import { ListInvoiceRailProviderIDs, ListPaymentSourceProviderIDs } from '../InvoiceRailResolver.js';
import { IssueOneUnit, LoadExternalInvoiceForUnit } from '../IssueExternalInvoiceOperation.js';

const PROVIDER = '11111111-2222-4333-8444-555555555555';
const PROVIDER_TYPE = '22222222-2222-4333-8444-555555555555';
const ORDER = 'aaaaaaaa-2222-4333-8444-555555555555';
const COMPANY = 'bbbbbbbb-2222-4333-8444-555555555555';

const provider = { EntityByName: () => undefined } as unknown as IMetadataProvider;
const user = {} as UserInfo;

beforeEach(() => {
    mocks.failing = [];
    mocks.issued = 0;
});

/** `InternalExecute` is `protected` at compile time only; this is the typed shape to call it through. */
interface CallableOperation {
    InternalExecute(input: OrdersGetFulfillmentQueueInput, p: IMetadataProvider, u: UserInfo): Promise<OrdersGetFulfillmentQueueOutput>;
}
const fulfillmentQueue = () =>
    (new GetFulfillmentQueueOperation() as unknown as CallableOperation).InternalExecute({}, provider, user);

describe('the fulfilment queue', () => {
    it('reports a failed order read instead of an empty queue', async () => {
        mocks.failing = [{ Entity: 'Order Headers' }];
        const out = await fulfillmentQueue();
        expect(out.Success).toBe(false);
        expect(out.Message).toBe('Could not read the confirmed orders: Request timed out');
    });

    it('reports a failed line read instead of an empty queue', async () => {
        mocks.failing = [{ Entity: 'Order Lines' }];
        const out = await fulfillmentQueue();
        expect(out.Success).toBe(false);
        expect(out.Message).toBe('Could not read the order lines: Request timed out');
    });

    it('still answers an empty queue as a success when the reads work', async () => {
        const out = await fulfillmentQueue();
        expect(out.Success).toBe(true);
        expect(out.OrderCount).toBe(0);
    });
});

describe('the rail provider lists', () => {
    it('throw when the provider types cannot be read', async () => {
        mocks.failing = [{ Entity: 'Payment Provider Types' }];
        await expect(ListInvoiceRailProviderIDs(provider, user)).rejects.toThrow('Could not read payment provider types: Request timed out');
    });

    it('throw when the providers cannot be read', async () => {
        mocks.failing = [{ Entity: 'Payment Providers', FilterIncludes: 'IsActive = 1' }];
        await expect(ListPaymentSourceProviderIDs(provider, user)).rejects.toThrow('Could not read payment providers: Request timed out');
    });
});

describe('the external invoicing worklist', () => {
    const worklist = () => BuildExternalInvoicingWorklist({ CompanyIDs: null, IncludeFailed: false }, provider, user);

    it('throws when the invoice history cannot be read, rather than offering every order as unsent', async () => {
        mocks.failing = [{ Entity: 'External Invoices' }];
        await expect(worklist()).rejects.toThrow('Could not read external invoices: Request timed out');
    });

    it('throws when the confirmed orders cannot be read', async () => {
        mocks.failing = [{ Entity: 'Order Headers' }];
        await expect(worklist()).rejects.toThrow('Could not read confirmed orders: Request timed out');
    });

    it('offers the unsent order when every read works', async () => {
        const rows = await worklist();
        expect(rows).toHaveLength(1);
        expect(rows[0]).toMatchObject({ OrderHeaderID: ORDER, State: 'Unsent' });
    });
});

describe("a unit's invoice history behind a send", () => {
    const unitHistory = { Entity: 'External Invoices', FilterIncludes: `PaymentProviderID = '${PROVIDER}'` };

    it('throws when the history cannot be read, rather than answering "never sent"', async () => {
        mocks.failing = [unitHistory];
        await expect(
            LoadExternalInvoiceForUnit(PROVIDER, { OrderHeaderID: ORDER, CompanyID: COMPANY, OrderHeaderPaymentScheduleID: null }, provider, user),
        ).rejects.toThrow(`Could not read the external invoice history for order ${ORDER}, so it was not sent: Request timed out`);
    });

    it('fails the unit and sends nothing to the rail', async () => {
        mocks.failing = [unitHistory];
        await expect(
            IssueOneUnit({ OrderHeaderID: ORDER, CompanyID: COMPANY, OrderHeaderPaymentScheduleID: null }, { Preview: false, AllowReissue: false }, provider, user),
        ).rejects.toThrow('so it was not sent');
        expect(mocks.issued).toBe(0);
    });
});
