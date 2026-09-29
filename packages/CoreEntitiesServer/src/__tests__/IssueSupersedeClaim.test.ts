/**
 * The supersede step in `IssueOneUnit` — the write that lets a stuck claim be cleared at all.
 *
 * WHY IT IS TESTED HERE AND NOT THROUGH `DecideInvoiceable`. The decision says a person MAY re-issue
 * past a `Sending` row; the supersede is what makes that possible, because without it the new claim
 * hits `UQ_ExternalInvoice_LiveUnit` against the old row and answers "another send is already in
 * flight" for ever. The rule and the write are different code, and on this feature the rule has twice
 * been right while the write was wrong. This asserts the write.
 *
 * WHAT MUST NOT HAPPEN, and each has its own case below: superseding without being asked;
 * superseding on a preview, which is supposed to change nothing; and superseding a row that is not a
 * stuck claim.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
    existing: undefined as Record<string, unknown> | undefined,
    writes: [] as Array<{ id: string | null; fields: Record<string, unknown> }>,
    railRefuses: false,
}));

vi.mock('@memberjunction/core', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/core')>();
    return {
        ...actual,
        RunView: class FakeRunView {
            /** Some call sites build the view through this static rather than the constructor. */
            static FromMetadataProvider() {
                return new FakeRunView();
            }
            async RunView(params: { EntityName: string }) {
                const e = params.EntityName;
                if (e.includes('Order Headers')) {
                    return { Success: true, Results: [{ ID: ORDER, OrderNumber: 'ORD-1234', Status: 'Confirmed', CompanyID: COMPANY, BillToOrganizationID: ORG, BillToPersonID: null, ConfirmedAt: '2026-09-01', ExternalDocumentNumber: null, Balance: 600 }] };
                }
                if (e.includes('Order Lines')) return { Success: true, Results: [{ ID: LINE, OrderHeaderID: ORDER, CompanyID: COMPANY }] };
                if (e.includes('External Invoices')) return { Success: true, Results: mocks.existing ? [mocks.existing] : [] };
                if (e.includes('External Customers')) return { Success: true, Results: [{ ExternalCustomerRef: 'cus-1' }] };
                return { Success: true, Results: [] };
            }
            // `ensureCustomer` resolves the bill-to party through the batched pair in
            // DeliveryRecipientResolver; positions are fixed (people, organizations).
            async RunViews(specs: Array<{ EntityName: string }>) {
                return specs.map((spec) =>
                    spec.EntityName.includes('Organizations')
                        ? { Success: true, Results: [{ ID: ORG, Email: 'ap@example.test', Name: 'Acme' }] }
                        : { Success: true, Results: [] },
                );
            }
        },
    };
});

vi.mock('../InvoiceRailResolver.js', () => ({
    FindInvoiceRailForCompany: async () => ({
        Config: { PaymentProviderID: PROVIDER, Name: 'Bill.com Sandbox', TypeCode: 'BillCom', CompanyID: COMPANY },
        CheckConfiguration: async () => ({ Success: true }),
        IssueInvoice: async () =>
            mocks.railRefuses ? { Success: false, Transient: false, Reason: 'duplicate invoice number' } : { Success: true, Value: { ExternalInvoiceRef: '00e0NEW' } },
        GetInvoice: async () => ({ Success: true, Value: { ExternalInvoiceRef: '00e0NEW', InvoiceNumber: 'ORD-1234', Total: 600, DueAmount: 600, ScheduledAmount: 0, Status: 'OPEN', Archived: false } }),
    }),
    ResolveInvoiceRail: async () => undefined,
}));

vi.mock('../InvoiceBuilder.js', () => ({
        // Only the fields the payload builder reads; the real builder is exercised elsewhere.
        BuildInvoiceDocuments: async () => ({
            Success: true,
            Documents: [
                {
                    Kind: 'Invoice',
                    DocumentNumber: 'ORD-1234',
                    OrderNumber: 'ORD-1234',
                    OrderHeaderID: ORDER,
                    CompanyID: COMPANY,
                    DueDate: '2026-10-01',
                    Gross: 600,
                    AmountPaid: 0,
                    ChargeTotal: 0,
                    TaxTotal: 0,
                    Description: 'Order ORD-1234',
                    Rows: [{ ProductName: 'Widget', Description: null, Quantity: 1, Amount: 600, IncludedInParent: false }],
                },
            ],
        }),
}));

import type { IMetadataProvider, UserInfo } from '@memberjunction/core';
import { IssueOneUnit } from '../IssueExternalInvoiceOperation.js';

const PROVIDER = '11111111-2222-4333-8444-555555555555';
const ORDER = 'aaaaaaaa-2222-4333-8444-555555555555';
const COMPANY = 'bbbbbbbb-2222-4333-8444-555555555555';
const ORG = 'eeeeeeee-2222-4333-8444-555555555555';
const STUCK = 'cccccccc-2222-4333-8444-555555555555';
const LINE = 'ffffffff-2222-4333-8444-555555555555';

let loadedID: string | null = null;
const fakeProvider = {
    EntityByName: () => undefined,
    // A real RunView constructed anywhere in the path delegates straight to these.
    RunView: async (params: { EntityName: string }) => new (class { })() && { Success: true, Results: [] },
    RunViews: async (specs: Array<{ EntityName: string }>) =>
        specs.map((spec) =>
            spec.EntityName.includes('Organizations')
                ? { Success: true, Results: [{ ID: ORG, Email: 'ap@example.test', Name: 'Acme' }] }
                : { Success: true, Results: [] },
        ),
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

const stuckClaim = (over: Record<string, unknown> = {}) => ({
    ID: STUCK,
    PaymentProviderID: PROVIDER,
    OrderHeaderID: ORDER,
    CompanyID: COMPANY,
    OrderHeaderPaymentScheduleID: null,
    DocumentNumber: 'ORD-1234',
    Amount: 600,
    Status: 'Sending',
    ExternalInvoiceRef: null,
    ...over,
});

/** The write that retires the OLD row, identified by the row it was loaded against. */
const supersedeWrite = () => mocks.writes.find((w) => w.id === STUCK && w.fields.Status === 'Failed');

beforeEach(() => {
    mocks.writes = [];
    mocks.railRefuses = false;
    mocks.existing = undefined;
    loadedID = null;
});

describe('a re-issue past a claim that was never confirmed', () => {
    it('retires the stuck claim, and says why on the row', async () => {
        mocks.existing = stuckClaim();
        await run({ AllowReissue: true });
        const w = supersedeWrite();
        expect(w).toBeDefined();
        expect(String(w!.fields.LastError)).toMatch(/superseded/i);
    });

    it('retires it BEFORE writing the new claim — the unique index is on the live unit', async () => {
        mocks.existing = stuckClaim();
        await run({ AllowReissue: true });
        const supersedeAt = mocks.writes.findIndex((w) => w.id === STUCK && w.fields.Status === 'Failed');
        const newClaimAt = mocks.writes.findIndex((w) => w.id === null && w.fields.Status === 'Sending');
        expect(supersedeAt).toBeGreaterThanOrEqual(0);
        expect(newClaimAt).toBeGreaterThan(supersedeAt);
    });

    it('refuses without AllowReissue, and touches nothing', async () => {
        mocks.existing = stuckClaim();
        const out = await run({});
        expect(out.ResultCode).toBe('IN_FLIGHT');
        expect(mocks.writes).toHaveLength(0);
    });

    // HONEST LIMIT OF THIS FILE. The supersede also tests `opts.AllowReissue` itself, and no test here
    // can kill that condition: `DecideInvoiceable` refuses `Sending` without AllowReissue several steps
    // earlier, so the flow never reaches the supersede to be wrong about it. Deleting `opts.AllowReissue &&`
    // leaves the suite green. The guard is redundant defence today rather than the thing standing between
    // a sweep and a superseded claim — that is `DecideInvoiceable`, covered in ExternalInvoiceBehavior.test.
    // Worth knowing if the decision's `Sending` branch is ever loosened: this file would not notice.

    it('supersedes NOTHING on a preview — a preview changes nothing, however it is asked', async () => {
        mocks.existing = stuckClaim();
        const out = await run({ AllowReissue: true, Preview: true });
        expect(out.ResultCode).toBe('PREVIEWED');
        expect(mocks.writes).toHaveLength(0);
    });

    it('supersedes nothing when there is no stuck claim to retire', async () => {
        mocks.existing = undefined;
        await run({ AllowReissue: true });
        expect(supersedeWrite()).toBeUndefined();
    });

    it('does not retire a FAILED row — it was never a live claim', async () => {
        // A failed unit is re-issued too, but there is no claim standing in the way of it.
        mocks.existing = stuckClaim({ Status: 'Failed', ID: STUCK });
        await run({ AllowReissue: true });
        expect(supersedeWrite()).toBeUndefined();
    });

    it('leaves the claim retired even when the rail then refuses the re-send', async () => {
        // The person asserted the rail held nothing. If they were wrong, BILL answers 422 — the new
        // row fails, no duplicate invoice is created, and the unit is resolvable by adopting instead.
        mocks.existing = stuckClaim();
        mocks.railRefuses = true;
        const out = await run({ AllowReissue: true });
        expect(out.ResultCode).toBe('RAIL_REFUSED');
        expect(supersedeWrite()).toBeDefined();
    });
});
