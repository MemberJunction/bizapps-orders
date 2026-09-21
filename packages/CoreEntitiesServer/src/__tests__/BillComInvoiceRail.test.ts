/**
 * The Bill.com rail with the wire stubbed. What these guard is the WIRE SHAPE — the one defect the
 * connector's live verification found (`customer:{id}`, never `customerId`) is invisible to any test
 * that does not look at the request body, and would fail every invoice create in production with a
 * 400. The rest pins the read-back mapping, the payment fan-out, and the live-mode refusal.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { CRUDResult, ExternalRecord, FetchBatchResult } from '@memberjunction/integration-engine';
import { BillComInvoiceRail, NormalizeReceivablePayment } from '../BillComInvoiceRail.js';
import { UseBillComGatewaySeams, type BillComGatewaySeams } from '../BillComGateway.js';

interface Call { verb: string; object: string; attrs?: Record<string, unknown>; id?: string; watermark?: string | null }
const calls: Call[] = [];

const ok = (id: string, code = 201): CRUDResult => ({ Success: true, ExternalID: id, StatusCode: code });

const invoiceRecord = (over: Record<string, unknown> = {}): ExternalRecord => ({
    ExternalID: '00e1',
    ObjectType: 'invoices',
    Fields: { id: '00e1', invoiceNumber: 'ORD-1', totalAmount: 250.25, dueAmount: 250.25, scheduledAmount: 0, status: { value: 'OPEN' }, archived: false, ...over },
});

const paymentBatch = (): FetchBatchResult => ({
    Records: [
        {
            ExternalID: '0rp1',
            ObjectType: 'receivable-payments',
            Fields: {
                id: '0rp1', customerId: '0cu1', amount: 100, unappliedAmount: 0, paymentDate: '2026-09-20', status: 'PAID',
                onlinePayment: true, receivablesType: 'ACH', updatedTime: '2026-09-20T10:00:00.000Z',
                invoicePayments: [{ invoiceId: '00e1', amount: 60, paymentDate: '2026-09-20' }, { invoiceId: '00e2', amount: 40, paymentDate: '2026-09-20' }],
            },
        },
        {
            ExternalID: '0rp0',
            ObjectType: 'receivable-payments',
            Fields: { id: '0rp0', amount: 5, status: 'PAID', updatedTime: '2026-08-01T00:00:00.000Z', invoicePayments: [] },
        },
    ],
    HasMore: false,
});

let environment: string | null = 'sandbox';
let archivedOnRead = false;

const seams = (): BillComGatewaySeams => ({
    loadCompanyIntegration: async () => ({ ID: 'ci', IntegrationID: 'int', CredentialID: 'cred' }) as never,
    loadCredentialEnvironment: async () => environment,
    createRecord: async (_ci, object, attrs) => { calls.push({ verb: 'create', object, attrs }); return ok(object === 'customers' ? '0cu1' : '00e1'); },
    updateRecord: async (_ci, object, id, attrs) => { calls.push({ verb: 'update', object, id, attrs }); archivedOnRead = attrs.archived === true; return ok(id, 200); },
    getRecord: async (_ci, object, id) => { calls.push({ verb: 'get', object, id }); return invoiceRecord({ id, archived: archivedOnRead }); },
    fetchChanges: async (_ci, object, watermark) => { calls.push({ verb: 'fetch', object, watermark }); return paymentBatch(); },
});

const rail = (live = false): BillComInvoiceRail => {
    const r = new BillComInvoiceRail();
    r.Config = { PaymentProviderID: 'p', TypeCode: 'BillCom', CompanyID: 'c', Name: 'Bill.com — BC', IsLiveMode: live, CompanyIntegrationID: 'ci' };
    r.Provider = {} as never;
    r.User = {} as never;
    return r;
};

const facts = (over: Partial<Parameters<BillComInvoiceRail['IssueInvoice']>[0]> = {}) => ({
    DocumentNumber: 'ORD-1', InvoiceDate: '2026-09-22', DueDate: '2026-10-22', Amount: 250.25, ExternalCustomerRef: '0cu1', Memo: null,
    Lines: [{ Description: 'Widget', Quantity: 2, UnitPrice: 100 }, { Description: 'Setup', Quantity: 1, UnitPrice: 50.25 }],
    ...over,
});

beforeEach(() => { calls.length = 0; environment = 'sandbox'; archivedOnRead = false; UseBillComGatewaySeams(seams()); });
afterEach(() => UseBillComGatewaySeams(null));

describe('BillComInvoiceRail.IssueInvoice', () => {
    it('creates the invoice with customer:{id} — never customerId — and lines as BILL spells them', async () => {
        const r = await rail().IssueInvoice(facts());
        expect(r).toEqual({ Success: true, Value: { ExternalInvoiceRef: '00e1' } });
        const create = calls.find((c) => c.verb === 'create' && c.object === 'invoices')!;
        expect(create.attrs).toMatchObject({ invoiceNumber: 'ORD-1', invoiceDate: '2026-09-22', dueDate: '2026-10-22', customer: { id: '0cu1' } });
        expect(create.attrs).not.toHaveProperty('customerId');
        expect(create.attrs!.invoiceLineItems).toEqual([
            { description: 'Widget', quantity: 2, price: 100 },
            { description: 'Setup', quantity: 1, price: 50.25 },
        ]);
    });

    it('omits dueDate when there is none, and refuses an empty invoice before calling BILL', async () => {
        await rail().IssueInvoice(facts({ DueDate: null }));
        expect(calls[0].attrs).not.toHaveProperty('dueDate');
        calls.length = 0;
        const r = await rail().IssueInvoice(facts({ Lines: [] }));
        expect(r.Success).toBe(false);
        expect(calls).toHaveLength(0);
    });

    it('refuses a live provider row pointed at a sandbox credential, before any write', async () => {
        const r = await rail(true).IssueInvoice(facts());
        expect(r.Success).toBe(false);
        if (!r.Success) { expect(r.Reason).toMatch(/sandbox/); expect(r.Transient).toBe(false); }
        expect(calls.filter((c) => c.verb === 'create')).toHaveLength(0);
    });

    it('a connector refusal is a result, and a timeout is transient', async () => {
        UseBillComGatewaySeams({ ...seams(), createRecord: async () => ({ Success: false, StatusCode: 400, ErrorMessage: 'customer: The customer field is required' }) });
        const bad = await rail().IssueInvoice(facts());
        expect(bad.Success).toBe(false);
        if (!bad.Success) expect(bad.Transient).toBe(false);
        UseBillComGatewaySeams({ ...seams(), createRecord: async () => { throw new Error('ETIMEDOUT connecting to gateway.stage.bill.com'); } });
        const slow = await rail().IssueInvoice(facts());
        expect(slow.Success).toBe(false);
        if (!slow.Success) expect(slow.Transient).toBe(true);
    });
});

describe('BillComInvoiceRail.EnsureCustomer', () => {
    it('sends name, email, our party id as accountNumber, and the billing address', async () => {
        const r = await rail().EnsureCustomer({ PartyKind: 'Organization', PartyID: 'org-1', Name: 'Acme', Email: 'ap@acme.test', AddressLines: ['1 Main St', 'Suite 2'], City: 'Austin', State: 'TX', PostalCode: '78701', Country: 'US' });
        expect(r).toEqual({ Success: true, Value: { ExternalCustomerRef: '0cu1' } });
        expect(calls[0].attrs).toMatchObject({ name: 'Acme', email: 'ap@acme.test', accountNumber: 'org-1', billingAddress: { line1: '1 Main St', line2: 'Suite 2', city: 'Austin', stateOrProvince: 'TX', zipOrPostalCode: '78701', country: 'US' } });
    });

    it('refuses a party with no email, permanently, naming the party', async () => {
        const r = await rail().EnsureCustomer({ PartyKind: 'Person', PartyID: 'p1', Name: 'Pat Lee', Email: null, AddressLines: [], City: null, State: null, PostalCode: null, Country: null });
        expect(r.Success).toBe(false);
        if (!r.Success) { expect(r.Reason).toContain('Pat Lee'); expect(r.Reason).toMatch(/email/); expect(r.Transient).toBe(false); }
        expect(calls).toHaveLength(0);
    });
});

describe('BillComInvoiceRail.GetInvoice and CancelInvoice', () => {
    it('reads an invoice back into a snapshot, flattening the status object', async () => {
        const r = await rail().GetInvoice('00e1');
        expect(r).toEqual({ Success: true, Value: { ExternalInvoiceRef: '00e1', InvoiceNumber: 'ORD-1', Total: 250.25, DueAmount: 250.25, ScheduledAmount: 0, Status: 'OPEN', Archived: false } });
    });

    it('a missing invoice is a null value, not a failure', async () => {
        UseBillComGatewaySeams({ ...seams(), getRecord: async () => null });
        expect(await rail().GetInvoice('00e9')).toEqual({ Success: true, Value: null });
    });

    it('cancel asks for archived:true and confirms by reading back', async () => {
        const r = await rail().CancelInvoice('00e1');
        expect(r).toEqual({ Success: true, Value: { Archived: true } });
        expect(calls.map((c) => c.verb)).toEqual(['update', 'get']);
        expect(calls[0].attrs).toEqual({ archived: true });
    });

    it('cancel is refused, not reported done, when BILL ignores the flag', async () => {
        UseBillComGatewaySeams({ ...seams(), getRecord: async () => invoiceRecord({ archived: false }) });
        const r = await rail().CancelInvoice('00e1');
        expect(r.Success).toBe(false);
        if (!r.Success) { expect(r.Reason).toMatch(/not archived/); expect(r.Transient).toBe(false); }
    });
});

describe('BillComInvoiceRail.FetchPaymentsSince', () => {
    it('normalises payments with the invoice fan-out, narrows to the watermark locally, and advances it', async () => {
        const r = await rail().FetchPaymentsSince('2026-09-01T00:00:00.000Z');
        expect(r.Success).toBe(true);
        if (!r.Success) return;
        expect(r.Value.Payments).toHaveLength(1);
        expect(r.Value.Payments[0]).toMatchObject({
            ExternalPaymentRef: '0rp1', ExternalCustomerRef: '0cu1', Amount: 100, UnappliedAmount: 0, PaymentDate: '2026-09-20', Status: 'PAID',
            OnlinePayment: true, ReceivablesType: 'ACH', UpdatedAt: '2026-09-20T10:00:00.000Z',
            InvoicePayments: [{ ExternalInvoiceRef: '00e1', Amount: 60, PaymentDate: '2026-09-20' }, { ExternalInvoiceRef: '00e2', Amount: 40, PaymentDate: '2026-09-20' }],
        });
        expect(r.Value.NewWatermark).toBe('2026-09-20T10:00:00.000Z');
        expect(calls[0]).toMatchObject({ verb: 'fetch', object: 'receivable-payments', watermark: '2026-09-01T00:00:00.000Z' });
    });

    it('with no watermark returns everything and keeps records that lack updatedTime', () => {
        const p = NormalizeReceivablePayment('0rpX', { amount: '12.50', status: { name: 'SCHEDULED' }, invoicePayments: 'not-an-array' });
        expect(p).toMatchObject({ ExternalPaymentRef: '0rpX', Amount: 12.5, Status: 'SCHEDULED', UpdatedAt: null, InvoicePayments: [], OnlinePayment: null });
    });

    it('normalises BILL timestamps to ISO-Z, so an offset spelling of the same instant is not dropped by the watermark', async () => {
        const p = NormalizeReceivablePayment('0rpO', { amount: 1, status: 'PAID', updatedTime: '2026-09-20T10:00:00.000+0000', invoicePayments: [] });
        expect(p.UpdatedAt).toBe('2026-09-20T10:00:00.000Z');
        expect(NormalizeReceivablePayment('0rpB', { updatedTime: 'not a time' }).UpdatedAt).toBeNull();
        UseBillComGatewaySeams({
            ...seams(),
            fetchChanges: async () => ({ Records: [{ ExternalID: '0rpO', ObjectType: 'receivable-payments', Fields: { amount: 1, status: 'PAID', updatedTime: '2026-09-20T10:00:00.000+0000', invoicePayments: [] } }], HasMore: false }),
        });
        const r = await rail().FetchPaymentsSince('2026-09-20T10:00:00.000Z');
        expect(r.Success && r.Value.Payments).toHaveLength(1);
        expect(r.Success && r.Value.NewWatermark).toBe('2026-09-20T10:00:00.000Z');
    });
});
