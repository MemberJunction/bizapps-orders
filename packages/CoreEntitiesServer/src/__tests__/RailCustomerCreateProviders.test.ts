/**
 * A send whose bill-to party has no customer on file for the rail creates one only when the payment
 * provider is listed in `RailCustomerCreateProviders` (bc-aidp-next-golive#358). Otherwise the send
 * and its preview refuse, naming the party and the rail, and the rail is never asked to create a
 * customer: the party's existing rail customer was most likely never mapped, and a new one would
 * split its history. A party already mapped is unaffected. No database.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    customerMapped: false,
    orgEmail: 'ap@cimatri.test' as string | null,
    created: 0,
    writes: [] as Array<Record<string, unknown>>,
}));

vi.mock('@memberjunction/core', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/core')>();
    return {
        ...actual,
        RunView: class FakeRunView {
            static FromMetadataProvider() {
                return new FakeRunView();
            }
            async RunView(params: { EntityName: string }) {
                const e = params.EntityName;
                if (e.includes('Order Headers')) {
                    return { Success: true, Results: [{ ID: ORDER, OrderNumber: 'ORD-0001', Status: 'Confirmed', CompanyID: COMPANY, BillToOrganizationID: ORG, BillToPersonID: null, ConfirmedAt: '2026-09-01', ExternalDocumentNumber: null, Balance: 600 }] };
                }
                if (e.includes('Order Lines')) return { Success: true, Results: [{ ID: LINE, OrderHeaderID: ORDER, CompanyID: COMPANY }] };
                if (e.includes('External Customers')) return { Success: true, Results: mocks.customerMapped ? [{ ExternalCustomerRef: 'cus-1' }] : [] };
                if (e.includes('Organizations')) return { Success: true, Results: [{ ID: ORG, Name: 'Cimatri HoldCo', Email: mocks.orgEmail, PrimaryEmail: null }] };
                return { Success: true, Results: [] };
            }
        },
    };
});

vi.mock('../RailCustomerNameLimit.js', async (importOriginal) => ({
    ...(await importOriginal<typeof import('../RailCustomerNameLimit.js')>()),
    CheckRailCustomerName: async () => null,
    CheckRailInvoiceNumber: async () => null,
}));

vi.mock('../InvoiceRailResolver.js', () => ({
    FindInvoiceRailForCompany: async () => ({
        Config: { PaymentProviderID: PROVIDER, Name: 'SoundPost — Bill.com', TypeCode: 'BillCom', CompanyID: COMPANY },
        CheckConfiguration: async () => ({ Success: true }),
        CustomerNameTargets: () => [],
        InvoiceNumberTargets: () => [],
        CheckCustomer: (f: { Email: string | null; Name: string }) =>
            f.Email ? null : { Code: 'NO_CUSTOMER_EMAIL', Reason: `Bill.com requires a customer email and ${f.Name} has none.` },
        EnsureCustomer: async () => {
            mocks.created++;
            return { Success: true, Value: { ExternalCustomerRef: 'cus-new' } };
        },
        IssueInvoice: async () => ({ Success: true, Value: { ExternalInvoiceRef: '00e0NEW' } }),
        GetInvoice: async () => ({ Success: true, Value: { ExternalInvoiceRef: '00e0NEW', InvoiceNumber: 'ORD-0001', Total: 600, DueAmount: 600, ScheduledAmount: 0, Status: 'OPEN', Archived: false } }),
    }),
    ResolveInvoiceRail: async () => undefined,
}));

vi.mock('../InvoiceBuilder.js', () => ({
    BuildInvoiceDocuments: async () => ({
        Success: true,
        Documents: [
            {
                Kind: 'Invoice',
                DocumentNumber: 'ORD-0001',
                OrderNumber: 'ORD-0001',
                OrderHeaderID: ORDER,
                CompanyID: COMPANY,
                DueDate: '2026-10-01',
                Gross: 600,
                AmountPaid: 0,
                ChargeTotal: 0,
                TaxTotal: 0,
                Description: 'Order ORD-0001',
                Rows: [{ ProductName: 'Widget', Description: null, Quantity: 1, Amount: 600, IncludedInParent: false }],
            },
        ],
    }),
}));

import type { IMetadataProvider, UserInfo } from '@memberjunction/core';
import { IssueOneUnit } from '../IssueExternalInvoiceOperation.js';
import { OrdersSettings } from '../OrdersSettings.js';

const PROVIDER = '11111111-2222-4333-8444-555555555555';
const ORDER = 'aaaaaaaa-2222-4333-8444-555555555555';
const COMPANY = 'bbbbbbbb-2222-4333-8444-555555555555';
const ORG = 'eeeeeeee-2222-4333-8444-555555555555';
const LINE = 'ffffffff-2222-4333-8444-555555555555';

const fakeProvider = {
    EntityByName: () => undefined,
    GetEntityObject: async () => ({
        InnerLoad: async () => true,
        NewRecord: () => undefined,
        Set: () => undefined,
        SetMany: (fields: Record<string, unknown>) => mocks.writes.push(fields),
        Save: async () => true,
        Get: () => 'new-row-id',
        LatestResult: undefined,
    }),
} as unknown as IMetadataProvider;

const unit = { OrderHeaderID: ORDER, CompanyID: COMPANY, OrderHeaderPaymentScheduleID: null };
const run = (Preview: boolean) => IssueOneUnit(unit, { Preview, AllowReissue: false }, fakeProvider, {} as UserInfo);

beforeEach(() => {
    mocks.customerMapped = false;
    mocks.orgEmail = 'ap@cimatri.test';
    mocks.created = 0;
    mocks.writes = [];
    OrdersSettings.SetOverride('RailCustomerCreateProviders', '');
});

afterEach(() => OrdersSettings.ClearOverrides());

describe('no customer on file, provider not listed', () => {
    it.each([true, false])('refuses (Preview=%s), naming the rail once and the party, and creates nothing', async (preview) => {
        const out = await run(preview);
        expect(out.Success).toBe(false);
        expect(out.ResultCode).toBe('RAIL_REFUSED');
        expect(out.Message).toBe(
            'No customer on file in SoundPost — Bill.com for Cimatri HoldCo, so nothing was sent. ' +
                "Find Cimatri HoldCo's customer in SoundPost — Bill.com, or create it there if it has none, then add its ID to the organization's External Customers mapping and send again.",
        );
        expect(out.Message).not.toContain('RailCustomerCreateProviders');
        expect(mocks.created).toBe(0);
        expect(mocks.writes.some((w) => 'ExternalCustomerRef' in w)).toBe(false);
    });

    it.each([true, false])('still reports a missing billing email (Preview=%s), with the missing customer', async (preview) => {
        mocks.orgEmail = null;
        const out = await run(preview);
        expect(out.ResultCode).toBe('NO_CUSTOMER_EMAIL');
        expect(out.Message).toContain('Bill.com requires a customer email and Cimatri HoldCo has none.');
        expect(out.Message).toContain('No customer on file in SoundPost — Bill.com for Cimatri HoldCo');
        expect(mocks.created).toBe(0);
    });

    it('records the refused send as Failed, as other customer refusals are', async () => {
        await run(false);
        expect(mocks.writes).toContainEqual(expect.objectContaining({ Status: 'Failed', LastError: expect.stringContaining('No customer on file') }));
    });

    it('refuses when another provider is listed', async () => {
        OrdersSettings.SetOverride('RailCustomerCreateProviders', '99999999-2222-4333-8444-555555555555');
        expect((await run(false)).ResultCode).toBe('RAIL_REFUSED');
        expect(mocks.created).toBe(0);
    });
});

describe('no customer on file, provider listed', () => {
    it('creates the customer and sends, matching the ID case-insensitively', async () => {
        OrdersSettings.SetOverride('RailCustomerCreateProviders', `00000000-0000-4000-8000-000000000000, ${PROVIDER.toUpperCase()}`);
        const out = await run(false);
        expect(out.ResultCode).toBe('SENT');
        expect(mocks.created).toBe(1);
    });

    it('previews as a send', async () => {
        OrdersSettings.SetOverride('RailCustomerCreateProviders', PROVIDER);
        expect((await run(true)).ResultCode).toBe('PREVIEWED');
    });
});

describe('a customer already on file', () => {
    it.each([true, false])('is unaffected by the setting (Preview=%s)', async (preview) => {
        mocks.customerMapped = true;
        const out = await run(preview);
        expect(out.ResultCode).toBe(preview ? 'PREVIEWED' : 'SENT');
        expect(mocks.created).toBe(0);
    });
});
