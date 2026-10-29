/**
 * Two paths through `IssueOneUnit` for a send the rail refused before creating anything.
 *
 * THE RESEND. A bill-to party with no email is refused while the rail customer is created, before
 * any invoice exists; the unit keeps a `Failed` row with no rail reference. Once the email is added,
 * the next send is a first send. It used to be refused as history needing `AllowReissue`, which the
 * order form answered with a double-billing warning for an invoice that was never created.
 *
 * THE PREVIEW. A preview answers what the send would answer short of calling the rail, so a party
 * the rail cannot take as a customer is reported by a preview, and the preview still writes nothing.
 */
import { afterEach, describe, expect, it, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
    history: [] as Array<Record<string, unknown>>,
    customerMapped: false,
    orgEmail: null as string | null,
    writes: [] as Array<{ id: string | null; fields: Record<string, unknown> }>,
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
                if (e.includes('Order Headers')) {
                    return { Success: true, Results: [{ ID: ORDER, OrderNumber: 'ORD-0001', Status: 'Confirmed', CompanyID: COMPANY, BillToOrganizationID: ORG, BillToPersonID: null, ConfirmedAt: '2026-09-01', ExternalDocumentNumber: null, Balance: 600 }] };
                }
                if (e.includes('Order Lines')) return { Success: true, Results: [{ ID: LINE, OrderHeaderID: ORDER, CompanyID: COMPANY }] };
                if (e.includes('External Invoices')) {
                    // Honour the one filter that matters here: the count of numbers the rail holds.
                    const withRef = params.ExtraFilter?.includes('ExternalInvoiceRef IS NOT NULL');
                    return { Success: true, Results: withRef ? mocks.history.filter((r) => r.ExternalInvoiceRef) : mocks.history };
                }
                if (e.includes('External Customers')) return { Success: true, Results: mocks.customerMapped ? [{ ExternalCustomerRef: 'cus-1' }] : [] };
                if (e.includes('Organizations')) return { Success: true, Results: [{ ID: ORG, Name: 'Placeholder Co', Email: mocks.orgEmail, PrimaryEmail: null }] };
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
        Config: { PaymentProviderID: PROVIDER, Name: 'Bill.com Sandbox', TypeCode: 'BillCom', CompanyID: COMPANY },
        CheckConfiguration: async () => ({ Success: true }),
        CustomerNameTargets: () => [],
        InvoiceNumberTargets: () => [],
        CheckCustomer: (f: { Email: string | null; Name: string }) =>
            f.Email ? null : { Code: 'NO_CUSTOMER_EMAIL', Reason: `Bill.com requires a customer email and ${f.Name} has none.` },
        EnsureCustomer: async () => ({ Success: true, Value: { ExternalCustomerRef: 'cus-new' } }),
        IssueInvoice: async () => {
            mocks.issued++;
            return { Success: true, Value: { ExternalInvoiceRef: '00e0NEW' } };
        },
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
const FAILED = 'cccccccc-2222-4333-8444-555555555555';
const LINE = 'ffffffff-2222-4333-8444-555555555555';

let loadedID: string | null = null;
const fakeProvider = {
    EntityByName: () => undefined,
    GetEntityObject: async () => ({
        InnerLoad: async (key: { KeyValuePairs?: Array<{ Value: string }> }) => {
            loadedID = key?.KeyValuePairs?.[0]?.Value ?? null;
            return true;
        },
        NewRecord: () => {
            loadedID = null;
        },
        Set: () => undefined,
        SetMany: (fields: Record<string, unknown>) => mocks.writes.push({ id: loadedID, fields }),
        Save: async () => true,
        Get: () => 'new-row-id',
        LatestResult: undefined,
    }),
} as unknown as IMetadataProvider;

const unit = { OrderHeaderID: ORDER, CompanyID: COMPANY, OrderHeaderPaymentScheduleID: null };
const run = (opts: { Preview?: boolean; AllowReissue?: boolean }) =>
    IssueOneUnit(unit, { Preview: false, AllowReissue: false, ...opts }, fakeProvider, {} as UserInfo);

const failedRow = (over: Record<string, unknown> = {}) => ({
    ID: FAILED,
    PaymentProviderID: PROVIDER,
    OrderHeaderID: ORDER,
    CompanyID: COMPANY,
    OrderHeaderPaymentScheduleID: null,
    DocumentNumber: 'ORD-0001',
    Amount: 600,
    Status: 'Failed',
    ExternalInvoiceRef: null,
    LastError: 'Bill.com requires a customer email and Placeholder Co has none.',
    ...over,
});

beforeEach(() => {
    mocks.history = [];
    mocks.customerMapped = false;
    mocks.orgEmail = 'ap@placeholder.test';
    mocks.writes = [];
    mocks.issued = 0;
    loadedID = null;
    // These sends create the party's rail customer, which only a listed provider may do (#358).
    OrdersSettings.SetOverride('RailCustomerCreateProviders', PROVIDER);
});

afterEach(() => OrdersSettings.ClearOverrides());

describe('a send after one the rail refused before creating anything', () => {
    it('sends without AllowReissue once the email is there', async () => {
        mocks.history = [failedRow()];
        const out = await run({});
        expect(out.ResultCode).toBe('SENT');
        expect(mocks.issued).toBe(1);
    });

    it('keeps the original document number — no number was spent on the rail', async () => {
        mocks.history = [failedRow()];
        const out = await run({});
        expect(out.DocumentNumber).toBe('ORD-0001');
    });

    it('still refuses without AllowReissue when an earlier row reached the rail', async () => {
        mocks.history = [failedRow({ ExternalInvoiceRef: '00e0OLD', LastError: 'totalled wrong; archived' })];
        const out = await run({});
        expect(out.ResultCode).toBe('HAS_HISTORY');
        expect(mocks.issued).toBe(0);
    });
});

describe('a preview for a bill-to party the rail cannot take', () => {
    it('reports the missing email and writes nothing', async () => {
        mocks.orgEmail = null;
        const out = await run({ Preview: true });
        expect(out.Success).toBe(false);
        expect(out.ResultCode).toBe('NO_CUSTOMER_EMAIL');
        expect(out.Message).toContain('Placeholder Co');
        expect(mocks.writes).toHaveLength(0);
    });

    it('previews as before when the party already has a customer on the rail', async () => {
        mocks.orgEmail = null;
        mocks.customerMapped = true;
        const out = await run({ Preview: true });
        expect(out.ResultCode).toBe('PREVIEWED');
    });
});
