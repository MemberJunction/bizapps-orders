/**
 * `Orders.AdoptExternalInvoice` end to end — the operation, not the rule it consults.
 *
 * WHY THIS EXISTS RATHER THAN MORE `DecideAdoption` CASES. Twice on this feature the pure rule was
 * right and the code around it was wrong: the poller's `Ignore` branch wrote the prior disposition
 * back over a resolved exception, and the re-issue button resolved a different billing unit from the
 * one it named. Neither was reachable from a test of the rule. So what is asserted here is what the
 * OPERATION does — which rows it writes, what it refuses, and what it leaves alone.
 *
 * The rail and the ledger are stubs; the operation is real.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
    /** The ExternalInvoice row the operation loads. */
    row: undefined as Record<string, unknown> | undefined,
    /** What the rail answers for GetInvoice. */
    snapshot: undefined as Record<string, unknown> | null | undefined,
    railFails: false,
    /** Fields written to each entity, keyed by entity name. */
    writes: [] as Array<{ entity: string; fields: Record<string, unknown> }>,
}));

vi.mock('@memberjunction/core', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/core')>();
    return {
        ...actual,
        RunView: class {
            async RunView(params: { EntityName: string }) {
                if (params.EntityName.includes('External Invoices')) return { Success: true, Results: mocks.row ? [mocks.row] : [] };
                if (params.EntityName.includes('Order Headers')) {
                    return { Success: true, Results: [{ ID: ORDER, OrderNumber: 'ORD-1234', ExternalDocumentNumber: null }] };
                }
                return { Success: true, Results: [] };
            }
        },
    };
});

vi.mock('../InvoiceRailResolver.js', () => ({
    ResolveInvoiceRail: async () => ({
        Config: { PaymentProviderID: PROVIDER, Name: 'Bill.com Sandbox', TypeCode: 'BillCom' },
        GetInvoice: async () =>
            mocks.railFails ? { Success: false, Reason: 'the rail timed out' } : { Success: true, Value: mocks.snapshot ?? null },
    }),
}));

import type { IMetadataProvider, UserInfo } from '@memberjunction/core';
import type { OrdersAdoptExternalInvoiceInput, OrdersAdoptExternalInvoiceOutput } from '@mj-biz-apps/orders-entities';
import { AdoptExternalInvoiceOperation } from '../AdoptExternalInvoiceOperation.js';

const PROVIDER = '11111111-2222-4333-8444-555555555555';
const ORDER = 'aaaaaaaa-2222-4333-8444-555555555555';
const INVOICE = 'cccccccc-2222-4333-8444-555555555555';
const INSTALMENT = 'dddddddd-2222-4333-8444-555555555555';

const fakeProvider = {
    // `stampScheduleRow` skips entirely on a database without PR #220's schedule entity, so the stub
    // has to claim it exists or the instalment case would pass for the wrong reason.
    EntityByName: (name: string) => ({ Name: name }),
    GetEntityObject: async (entityName: string) => ({
        InnerLoad: async () => true,
        NewRecord: () => undefined,
        Set: (k: string, v: unknown) => mocks.writes.push({ entity: entityName, fields: { [k]: v } }),
        SetMany: (fields: Record<string, unknown>) => mocks.writes.push({ entity: entityName, fields }),
        Save: async () => true,
        Get: () => INVOICE,
        LatestResult: undefined,
    }),
} as unknown as IMetadataProvider;

interface Callable {
    InternalExecute(i: OrdersAdoptExternalInvoiceInput, p: IMetadataProvider, u: UserInfo): Promise<OrdersAdoptExternalInvoiceOutput>;
}
const adopt = (input: OrdersAdoptExternalInvoiceInput) =>
    (new AdoptExternalInvoiceOperation() as unknown as Callable).InternalExecute(input, fakeProvider, {} as UserInfo);

/** The claimed row: a send that was never confirmed. */
const claimed = (over: Record<string, unknown> = {}) => ({
    ID: INVOICE,
    PaymentProviderID: PROVIDER,
    OrderHeaderID: ORDER,
    OrderHeaderPaymentScheduleID: null,
    DocumentNumber: 'ORD-1234',
    Amount: 600,
    Status: 'Sending',
    ExternalInvoiceRef: null,
    SentAt: null,
    ...over,
});

/** What the rail holds. */
const onRail = (over: Record<string, unknown> = {}) => ({
    ExternalInvoiceRef: '00e01ABC',
    InvoiceNumber: 'ORD-1234',
    Total: 600,
    DueAmount: 600,
    ScheduledAmount: 0,
    Status: 'OPEN',
    Archived: false,
    ...over,
});

const wroteTo = (entity: string) => mocks.writes.filter((w) => w.entity.includes(entity));
const invoiceWrite = () => Object.assign({}, ...wroteTo('External Invoices').map((w) => w.fields)) as Record<string, unknown>;

beforeEach(() => {
    mocks.writes = [];
    mocks.railFails = false;
    mocks.row = claimed();
    mocks.snapshot = onRail();
});

describe('adopting the invoice the rail already holds', () => {
    it('records the reference and marks the unit Sent', async () => {
        const out = await adopt({ ExternalInvoiceID: INVOICE, ExternalInvoiceRef: '00e01ABC' });
        expect(out.ResultCode).toBe('ADOPTED');
        const w = invoiceWrite();
        expect(w.Status).toBe('Sent');
        expect(w.ExternalInvoiceRef).toBe('00e01ABC');
        expect(w.ExternalTotal).toBe(600);
        expect(w.LastError).toBeNull();
    });

    it('stamps the order header, as a real send does', async () => {
        await adopt({ ExternalInvoiceID: INVOICE, ExternalInvoiceRef: '00e01ABC' });
        expect(wroteTo('Order Headers').length).toBeGreaterThan(0);
    });

    it('stamps the instalment row when the unit is an instalment', async () => {
        mocks.row = claimed({ OrderHeaderPaymentScheduleID: INSTALMENT });
        await adopt({ ExternalInvoiceID: INVOICE, ExternalInvoiceRef: '00e01ABC' });
        const stamped = Object.assign({}, ...wroteTo('Payment Schedules').map((w) => w.fields)) as Record<string, unknown>;
        expect(stamped.ExternalInvoiceRef).toBe('00e01ABC');
        expect(stamped.ExternalSystem).toBe('BillCom');
    });

    it('writes NOTHING on a preview', async () => {
        const out = await adopt({ ExternalInvoiceID: INVOICE, ExternalInvoiceRef: '00e01ABC', Preview: true });
        expect(out.ResultCode).toBe('PREVIEWED');
        expect(mocks.writes).toHaveLength(0);
    });
});

describe('what adopting refuses, and writes nothing for', () => {
    it('an archived invoice — the refusal the total cannot make', async () => {
        // A previously cancelled invoice for THIS unit ties to the penny by construction.
        mocks.snapshot = onRail({ Archived: true });
        const out = await adopt({ ExternalInvoiceID: INVOICE, ExternalInvoiceRef: '00e01ABC' });
        expect(out.ResultCode).toBe('NOT_FOUND_ON_RAIL');
        expect(out.Message).toMatch(/AllowReissue/);
        expect(mocks.writes).toHaveLength(0);
    });

    it("a reference belonging to a different document, even at the right figure", async () => {
        mocks.snapshot = onRail({ InvoiceNumber: 'ORD-9999' });
        const out = await adopt({ ExternalInvoiceID: INVOICE, ExternalInvoiceRef: '00e01ABC' });
        expect(out.ResultCode).toBe('TIE_FAILED');
        expect(mocks.writes).toHaveLength(0);
    });

    it('a total that does not tie', async () => {
        mocks.snapshot = onRail({ Total: 500 });
        const out = await adopt({ ExternalInvoiceID: INVOICE, ExternalInvoiceRef: '00e01ABC' });
        expect(out.ResultCode).toBe('TIE_FAILED');
        expect(mocks.writes).toHaveLength(0);
    });

    it('an invoice the rail does not have', async () => {
        mocks.snapshot = null;
        const out = await adopt({ ExternalInvoiceID: INVOICE, ExternalInvoiceRef: '00e01ABC' });
        expect(out.ResultCode).toBe('NOT_FOUND_ON_RAIL');
        expect(mocks.writes).toHaveLength(0);
    });

    it('a rail that could not be read — an unanswered question is not a yes', async () => {
        mocks.railFails = true;
        const out = await adopt({ ExternalInvoiceID: INVOICE, ExternalInvoiceRef: '00e01ABC' });
        expect(out.ResultCode).toBe('ERROR');
        expect(mocks.writes).toHaveLength(0);
    });

    it('a unit that is not a claimed send', async () => {
        mocks.row = claimed({ Status: 'Failed' });
        const out = await adopt({ ExternalInvoiceID: INVOICE, ExternalInvoiceRef: '00e01ABC' });
        expect(out.ResultCode).toBe('NOT_CLAIMED');
        expect(mocks.writes).toHaveLength(0);
    });

    it('repointing a live invoice — that is a cancel, not an adopt', async () => {
        mocks.row = claimed({ Status: 'Sent', ExternalInvoiceRef: '00e0OTHER' });
        const out = await adopt({ ExternalInvoiceID: INVOICE, ExternalInvoiceRef: '00e01ABC' });
        expect(out.ResultCode).toBe('ALREADY_ADOPTED');
        expect(out.Success).toBe(false);
        expect(mocks.writes).toHaveLength(0);
    });

    it('is a quiet no-op when the same reference is already recorded', async () => {
        mocks.row = claimed({ Status: 'Sent', ExternalInvoiceRef: '00e01ABC' });
        const out = await adopt({ ExternalInvoiceID: INVOICE, ExternalInvoiceRef: '00e01ABC' });
        expect(out.ResultCode).toBe('ALREADY_ADOPTED');
        expect(out.Success).toBe(true);
        expect(mocks.writes).toHaveLength(0);
    });

    it('an empty reference, which is the one thing this operation exists to supply', async () => {
        const out = await adopt({ ExternalInvoiceID: INVOICE, ExternalInvoiceRef: '   ' });
        expect(out.ResultCode).toBe('ERROR');
        expect(mocks.writes).toHaveLength(0);
    });

    it('names the provider rather than "the rail" in what a person reads', async () => {
        mocks.snapshot = onRail({ Total: 500 });
        const out = await adopt({ ExternalInvoiceID: INVOICE, ExternalInvoiceRef: '00e01ABC' });
        expect(out.Message).toContain('Bill.com Sandbox');
    });
});
