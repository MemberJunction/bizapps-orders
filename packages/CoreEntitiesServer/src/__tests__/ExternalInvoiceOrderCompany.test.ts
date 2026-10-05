/**
 * The Bill.com rail bills an order once, through the ORDER company's rail (golive #311).
 *
 * An order's lines can belong to products of several companies, but the order is sold and billed by
 * the company on its header. These cases pin the three things that follow: the worklist offers one
 * whole-order unit per order, for the order's company; issuing a unit names that company even when
 * the caller asks for a product company; and an order that already holds a per-company invoice from
 * before golive #311 is neither offered nor sent again, since that would bill its lines twice.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
    history: [] as Array<Record<string, unknown>>,
    railCompanies: [] as string[],
    railAskedFor: [] as string[],
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
                    return {
                        Success: true,
                        Results: [
                            { ID: ORDER, OrderNumber: 'ORD-1234', Status: 'Confirmed', CompanyID: ORDER_CO, Company: 'Seller', BillToOrganizationID: ORG, BillToPersonID: null, BillToOrganization: 'Buyer', ConfirmedAt: '2026-09-01', DueDate: '2026-10-01', ExternalDocumentNumber: null, Balance: 600 },
                        ],
                    };
                }
                if (e.includes('Order Lines')) {
                    return { Success: true, Results: [{ OrderHeaderID: ORDER, CompanyID: ORDER_CO }, { OrderHeaderID: ORDER, CompanyID: PRODUCT_CO }] };
                }
                if (e.includes('External Invoices')) return { Success: true, Results: mocks.history };
                return { Success: true, Results: [] };
            }
            async RunViews(specs: Array<{ EntityName: string }>) {
                return specs.map(() => ({ Success: true, Results: [] }));
            }
        },
    };
});

vi.mock('../InvoiceRailResolver.js', () => ({
    ListInvoiceRailProviderIDs: async () => mocks.railCompanies.map((c) => ({ ID: `provider-${c}`, CompanyID: c })),
    FindInvoiceRailForCompany: async (companyID: string) => {
        mocks.railAskedFor.push(companyID);
        return undefined;
    },
    ResolveInvoiceRail: async () => undefined,
}));

import type { IMetadataProvider, UserInfo } from '@memberjunction/core';
import { BuildExternalInvoicingWorklist } from '../GetExternalInvoicingWorklistOperation.js';
import { IssueOneUnit } from '../IssueExternalInvoiceOperation.js';

const ORDER = 'aaaaaaaa-2222-4333-8444-555555555555';
// As SQL Server returns them, uppercase.
const ORDER_CO = 'BBBBBBBB-2222-4333-8444-555555555555';
const PRODUCT_CO = 'CCCCCCCC-2222-4333-8444-555555555555';
const ORG = 'eeeeeeee-2222-4333-8444-555555555555';

const provider = { EntityByName: () => undefined } as unknown as IMetadataProvider;
const user = {} as UserInfo;

beforeEach(() => {
    mocks.history = [];
    mocks.railCompanies = [ORDER_CO.toLowerCase(), PRODUCT_CO.toLowerCase()];
    mocks.railAskedFor = [];
});

describe('the external invoicing worklist (golive #311)', () => {
    it("offers a two-company order once, for the order's company, numbered as the order, for its whole balance", async () => {
        const rows = await BuildExternalInvoicingWorklist({ CompanyIDs: null, IncludeFailed: false }, provider, user);
        expect(rows).toHaveLength(1);
        expect(rows[0]).toMatchObject({ OrderHeaderID: ORDER, CompanyID: ORDER_CO, DocumentNumber: 'ORD-1234', Amount: 600 });
    });

    it("offers nothing when only a product company has a rail — the order company's rail bills it", async () => {
        mocks.railCompanies = [PRODUCT_CO.toLowerCase()];
        expect(await BuildExternalInvoicingWorklist({ CompanyIDs: null, IncludeFailed: false }, provider, user)).toEqual([]);
    });

    it('leaves off an order already holding a per-company invoice from before golive #311', async () => {
        mocks.history = [
            { ID: 'x', PaymentProviderID: `provider-${PRODUCT_CO.toLowerCase()}`, OrderHeaderID: ORDER, CompanyID: PRODUCT_CO, OrderHeaderPaymentScheduleID: null, DocumentNumber: 'ORD-1234-B', Amount: 300, Status: 'Sent' },
        ];
        expect(await BuildExternalInvoicingWorklist({ CompanyIDs: null, IncludeFailed: false }, provider, user)).toEqual([]);
    });
});

describe('issuing a whole-order unit (golive #311)', () => {
    it("asks the order company's rail, not a product company's", async () => {
        const out = await IssueOneUnit({ OrderHeaderID: ORDER, CompanyID: null, OrderHeaderPaymentScheduleID: null }, { Preview: true, AllowReissue: false }, provider, user);
        expect(out.ResultCode).toBe('NO_RAIL');
        expect(mocks.railAskedFor).toEqual([ORDER_CO]);
    });

    it('refuses a product company named by the caller, naming the order company', async () => {
        const out = await IssueOneUnit({ OrderHeaderID: ORDER, CompanyID: PRODUCT_CO, OrderHeaderPaymentScheduleID: null }, { Preview: true, AllowReissue: false }, provider, user);
        expect(out.Success).toBe(false);
        expect(out.Message).toMatch(/invoiced by its own company/);
        expect(mocks.railAskedFor).toEqual([]);
    });

    it('refuses to send beside a per-company invoice from before golive #311, naming it', async () => {
        mocks.history = [
            { ID: 'x', OrderHeaderID: ORDER, CompanyID: PRODUCT_CO, OrderHeaderPaymentScheduleID: null, DocumentNumber: 'ORD-1234-B', Amount: 300, Status: 'Sent' },
        ];
        const out = await IssueOneUnit({ OrderHeaderID: ORDER, CompanyID: ORDER_CO, OrderHeaderPaymentScheduleID: null }, { Preview: true, AllowReissue: false }, provider, user);
        expect(out.Success).toBe(false);
        expect(out.Message).toMatch(/ORD-1234-B/);
        expect(out.Message).toMatch(/twice/);
    });
});
