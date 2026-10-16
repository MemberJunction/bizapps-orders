/**
 * An amount change's credit memo as the customer's document, and the credit it leaves on the invoices they
 * already hold (#684). The memo is built from what the approval recorded; these tests hold it to adding up.
 */
import { describe, expect, it } from 'vitest';
import {
    BuildAmountChangeCreditMemo,
    BuildDocuments,
    type AmountChangeMemoFacts,
    type InvoiceDocument,
    type InvoiceInstalmentFacts,
    type InvoiceLineFacts,
    type InvoiceOrderFacts,
} from '../InvoiceBehavior.js';
import { OrderCredits, ReturnScheduleCredits } from '../InvoiceBuilder.js';

const CO_A = '00000000-0000-0000-0000-00000000000a';

const order: InvoiceOrderFacts = {
    ID: 'order-1',
    OrderNumber: 'ORD-1005',
    OrderType: 'Sale',
    OrderDate: '2026-07-01',
    Status: 'Confirmed',
    CompanyID: CO_A,
    CompanyName: 'Acme',
    TotalGross: 1100,
    AmountPaid: 0,
    Balance: 0,
    DueDate: '2026-07-31',
    ExternalDocumentNumber: null,
    ReversesOrderHeaderID: null,
    ReversesOrderNumber: null,
    ReversalReason: null,
    Description: null,
    PaymentTermsName: 'Net 30',
    PaymentTermsNetDays: 30,
};

const line: InvoiceLineFacts = {
    ID: 'line-1',
    LineNumber: 1,
    ProductID: 'product-1',
    ProductName: 'Membership',
    ProductSKU: 'MEM-1',
    Description: null,
    CompanyID: CO_A,
    CompanyName: 'Acme',
    Quantity: 1,
    UnitPrice: 1000,
    ExtendedAmount: null,
    DiscountPct: 0,
    DiscountAmount: 0,
    LineTotalNet: 1000,
    ChargeAmount: 0,
    LineTax: 100,
    LineTotalGross: 1100,
    ServicePeriodStart: null,
    ServicePeriodEnd: null,
    ParentOrderLineID: null,
    IsRollupParent: false,
    ReversesOrderLineID: null,
};

const build = (over: Partial<Parameters<typeof BuildDocuments>[0]> = {}): InvoiceDocument[] =>
    BuildDocuments({
        Order: order,
        Lines: [line],
        Charges: [],
        Adjustments: [],
        Payments: [],
        BillTo: { Name: 'Customer Co', AttentionOf: null, AddressLines: ['1 Main St'], Email: null },
        ShipTo: null,
        AsOf: '2026-07-01',
        ...over,
    });

const memo = (over: Partial<AmountChangeMemoFacts> = {}): AmountChangeMemoFacts => ({
    DocumentNumber: 'ORD-1005-CM1',
    IssuedOn: '2026-10-13',
    Net: 200,
    Tax: 20,
    Gross: 220,
    TermNumber: 1,
    SubscriptionNumber: 'SUB-000004',
    PreviousAmount: 1000,
    NewAmount: 800,
    Applied: [{ DocumentNumber: 'ORD-1005-2', Amount: 150 }],
    Refund: 0,
    OpenCredit: 70,
    LineNumber: 1,
    ProductName: 'Membership',
    ProductSKU: 'MEM-1',
    ...over,
});

describe('the credit memo document', () => {
    it('is a credit memo under its own number, from the order document the customer holds', () => {
        const [base] = build();
        const doc = BuildAmountChangeCreditMemo(base, memo());
        expect(doc.Kind).toBe('Credit Memo');
        expect(doc.DocumentNumber).toBe('ORD-1005-CM1');
        expect(doc.OrderNumber).toBe('ORD-1005');
        expect(doc.OrderDate).toBe('2026-10-13');
        expect(doc.BillTo.Name).toBe('Customer Co');
        expect(doc.Issuer.CompanyID).toBe(CO_A);
        expect(doc.DueDate).toBeNull();
        expect(doc.Description).toContain('term 1 of SUB-000004 lowered from 1000.00 to 800.00');
    });

    it('ladders net, tax and total, then what was applied, ending on the credit left', () => {
        const doc = BuildAmountChangeCreditMemo(build()[0], memo());
        expect(doc.Rows).toHaveLength(1);
        expect(doc.Rows[0].Amount).toBe(-200);
        expect(doc.Ladder.map((r) => [r.Kind, r.Label, r.Amount])).toEqual([
            ['Subtotal', 'Subtotal', -200],
            ['Tax', 'Tax', -20],
            ['Total', 'Total', -220],
            ['Payment', 'Applied to invoice ORD-1005-2', 150],
            ['Due', 'Credit due you', -70],
        ]);
        expect(doc.Gross).toBe(-220);
        expect(doc.AmountDue).toBe(-70);
    });

    it('names the order when the memo credited an order billed as a whole', () => {
        const doc = BuildAmountChangeCreditMemo(build()[0], memo({ Applied: [{ DocumentNumber: null, Amount: 220 }], OpenCredit: 0 }));
        expect(doc.Ladder.find((r) => r.Kind === 'Payment')?.Label).toBe('Applied to order ORD-1005');
        expect(doc.AmountDue).toBe(0);
    });

    it('says a refund is coming when the customer asked for one', () => {
        const doc = BuildAmountChangeCreditMemo(build()[0], memo({ Applied: [], Refund: 220, OpenCredit: 0 }));
        expect(doc.Description).toContain('220.00 of it is refunded to you');
        expect(doc.AmountDue).toBe(-220);
    });

    it('refuses figures that do not add up rather than print them', () => {
        expect(() => BuildAmountChangeCreditMemo(build()[0], memo({ Tax: 19 }))).toThrow(/do not add up to its total of 220.00/);
        expect(() => BuildAmountChangeCreditMemo(build()[0], memo({ OpenCredit: 60 }))).toThrow(/does not add up/);
    });
});

describe('invoices after an amount change', () => {
    it('a whole-order document takes the credits off what is due, as the order balance does', () => {
        const credits = OrderCredits([
            { CreditMemoNumber: 'ORD-1005-CM1', CreditMemoAmount: 220, ScheduleReduction: null },
            { CreditMemoNumber: null, CreditMemoAmount: null, ScheduleReduction: 55 },
        ]);
        const [doc] = build({ Credits: credits });
        expect(doc.Gross).toBe(1100);
        expect(doc.AmountDue).toBe(825);
        expect(doc.Ladder.filter((r) => r.Kind === 'Payment').map((r) => [r.Label, r.Amount])).toEqual([
            ['Credit memo ORD-1005-CM1', -220],
            ['Lower amount on instalments not yet invoiced', -55],
        ]);
        expect(doc.PaymentStatusLabel).toBe('Partly paid');
    });

    it('an instalment invoice shows the credit and asks for its balance, keeping its amount', () => {
        const instalment: InvoiceInstalmentFacts = {
            CompanyID: CO_A,
            InstallmentNumber: 2,
            InstallmentCount: 4,
            DueDate: '2026-10-01',
            Amount: 275,
            AmountPaid: 0,
            DocumentNumber: 'ORD-1005-2',
            AmountCredited: 150,
            Payments: [{ Label: 'Credit memo ORD-1005-CM1', Amount: 150 }],
        };
        const [doc] = build({ Instalment: instalment, Credits: [{ Label: 'ignored on an instalment', Amount: 999 }] });
        expect(doc.AmountDue).toBe(125);
        expect(doc.Ladder.find((r) => r.Kind === 'Instalment')?.Amount).toBe(275);
        expect(doc.Ladder.find((r) => r.Kind === 'Payment')?.Label).toBe('Credit memo ORD-1005-CM1');
    });

    it('an order with no amount change renders as it always did', () => {
        const [doc] = build();
        expect(doc.AmountDue).toBe(1100);
        expect(doc.Ladder.map((r) => r.Kind)).toEqual(['Subtotal', 'Tax', 'Total', 'Due']);
    });
});

describe('a return against an instalment-billed order', () => {
    it('credits only the memo: the rest came off the origin\'s instalments not yet invoiced', () => {
        const credits = ReturnScheduleCredits(
            [
                { ReversesOrderLineID: 'origin-line', LineTotalGross: -600, CreditMemoAmount: 0 },
                { ReversesOrderLineID: 'origin-line-2', LineTotalGross: -330, CreditMemoAmount: 110 },
            ],
            'ORD-1005',
        );
        expect(credits).toEqual([{ Label: 'Taken off the instalments of ORD-1005 not yet invoiced', Amount: -820 }]);
    });

    it('adds nothing for a return whose lines booked no memo split', () => {
        expect(ReturnScheduleCredits([{ ReversesOrderLineID: 'origin-line', LineTotalGross: -600, CreditMemoAmount: null }], 'ORD-1005')).toEqual([]);
        expect(ReturnScheduleCredits([{ ReversesOrderLineID: null, LineTotalGross: 600, CreditMemoAmount: null }], null)).toEqual([]);
    });
});
