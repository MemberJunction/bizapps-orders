/**
 * Journal entry descriptions name the customer (bc-aidp-next-golive#452).
 *
 * Accounting's batch view shows each entry's description as its memo and cannot read Orders tables,
 * so the entries Orders writes for an order or a payment carry the customer's name there.
 *
 * CONNECTS TO:
 *   TESTS: ../JournalEntryCustomer.ts, ../PaymentAllocationFactory.ts (toDraft),
 *          ../OrderJournalEntryFactory.ts (booking and recognition descriptions)
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { OrdersEngine } from '@mj-biz-apps/orders-entities';
import { CustomerPart, OrderCustomerName } from '../JournalEntryCustomer.js';
import { PaymentAllocationFactory, type IntercompanyLookup } from '../PaymentAllocationFactory.js';
import { OrderJournalEntryFactory } from '../OrderJournalEntryFactory.js';
import '../RevenueRecognition.js';

describe('OrderCustomerName', () => {
    it('prefers the billing organization', () => {
        expect(OrderCustomerName({ BillToOrganization: 'Acme Foundation', BillToPerson: 'Pat Doe' })).toBe('Acme Foundation');
    });

    it('falls back to the billing person when no organization is billed', () => {
        expect(OrderCustomerName({ BillToOrganization: null, BillToPerson: 'Pat Doe' })).toBe('Pat Doe');
        expect(OrderCustomerName({ BillToOrganization: '  ', BillToPerson: 'Pat Doe' })).toBe('Pat Doe');
    });

    it('is null when the order names neither', () => {
        expect(OrderCustomerName({})).toBeNull();
    });
});

describe('CustomerPart', () => {
    it('splices the name after a dash, and is empty without one', () => {
        expect(CustomerPart('Acme Foundation')).toBe(' — Acme Foundation');
        expect(CustomerPart(null)).toBe('');
        expect(CustomerPart(' ')).toBe('');
    });
});

describe('payment allocation entry descriptions', () => {
    const resolver = { Resolve: async (role: string) => `gl-${role}` } as never;
    const intercompany: IntercompanyLookup = () => null;
    const build = (customer: string | null) =>
        new PaymentAllocationFactory(resolver, intercompany, 'payment-line-entity').BuildAllocationDrafts({
            PaymentLineID: 'pl-1',
            PaymentNumber: 'PAY-074',
            OrderNumber: 'ORD-61',
            CustomerName: customer,
            Amount: 45000,
            ReceivingCompanyID: 'c-1',
            OrderLines: [{ OrderLineID: 'l-1', CompanyID: 'c-1', Amount: 45000 }],
            TargetOrderLineID: null,
            PaymentDate: new Date('2026-11-05'),
            IsReversal: false,
        });

    it('names the payment, the customer and the order', async () => {
        const { Drafts } = await build('Acme Foundation');
        expect(Drafts[0].Description).toBe('Payment PAY-074 — Acme Foundation — order ORD-61 (company c-1)');
    });

    it('keeps the earlier wording when no customer is known', async () => {
        const { Drafts } = await build(null);
        expect(Drafts[0].Description).toBe('Payment PAY-074 — order ORD-61 (company c-1)');
    });
});

describe('order entry descriptions', () => {
    const PRODUCT = { ID: 'p-1', CompanyID: 'c-1', ProductCategoryID: null, ProductTypeID: 'pt-1', RevenueRecognitionTypeID: 'rr-1', Name: 'Annual Membership' };
    const EVEN = { ID: 'rr-1', Code: 'EVEN', DriverClass: 'EvenOverTime', IsDeferred: true, ScheduleBasis: 'AtBooking' };
    const resolver = { Resolve: async (role: string) => `gl-${role.replace(/ /g, '')}`, TakeResolved: () => [] };
    const line = {
        ID: 'l-1', LineNumber: 1, ProductID: 'p-1', CompanyID: 'c-1', Quantity: 1, UnitPrice: 1200,
        ExtendedAmount: 1200, DiscountPct: 0, DiscountAmount: 0, LineTotalNet: 1200, LineTax: 0, ChargeAmount: 0,
        ServicePeriodStart: '2026-01-01', ServicePeriodEnd: '2026-03-31', DimensionID: null, DimensionValueID: null,
    } as never;

    beforeEach(() => {
        const proto = OrderJournalEntryFactory.prototype as unknown as Record<string, unknown>;
        vi.spyOn(proto, 'loadProducts' as never).mockResolvedValue(new Map([['p-1', PRODUCT]]) as never);
        vi.spyOn(proto, 'loadGiftCardTypeIDs' as never).mockResolvedValue(new Set() as never);
        vi.spyOn(proto, 'loadRevRecTypes' as never).mockResolvedValue(new Map([['rr-1', EVEN]]) as never);
        vi.spyOn(proto, 'loadLineDimensions' as never).mockResolvedValue(new Map() as never);
        vi.spyOn(proto, 'effectiveDateOf' as never).mockResolvedValue('2026-01-01' as never);
        vi.spyOn(proto, 'chargeCreditsFor' as never).mockResolvedValue([] as never);
        vi.spyOn(OrdersEngine.Instance, 'ProductTypeByID').mockReturnValue(undefined as never);
    });
    afterEach(() => vi.restoreAllMocks());

    const build = (order: Record<string, unknown>) =>
        new OrderJournalEntryFactory(resolver as never, 'ol', 'st', 'ct', {} as never, {} as never).BuildDrafts(
            { OrderNumber: 'ORD-61', CompanyID: 'c-1', ...order } as never,
            [line],
        );

    it('names the billed organization on the booking and on every release', async () => {
        const drafts = await build({ BillToOrganization: 'Acme Foundation', BillToPerson: 'Pat Doe' });
        expect(drafts.length).toBeGreaterThan(1);
        expect(drafts.find((d) => d.IsBooking)?.Draft.Description).toBe('Order ORD-61 line 1 — Acme Foundation — Annual Membership');
        for (const d of drafts.filter((x) => !x.IsBooking)) {
            expect(d.Draft.Description).toBe('Order ORD-61 line 1 — Acme Foundation — recognize Annual Membership');
        }
    });

    it('keeps the earlier wording for an order with no billing party', async () => {
        const drafts = await build({});
        expect(drafts.find((d) => d.IsBooking)?.Draft.Description).toBe('Order ORD-61 line 1 — Annual Membership');
    });
});
