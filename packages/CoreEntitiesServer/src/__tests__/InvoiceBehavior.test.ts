/**
 * InvoiceBehavior — the document, with no database and no HTML.
 *
 * EVERY FAILURE THIS FILE GUARDS AGAINST PRODUCES A PERFECTLY ORDINARY-LOOKING BILL. A discount
 * recorded as a percentage prints as no discount at all. A charge nobody allocated vanishes from
 * both halves of a split order. A bundle prints its components twice. In each case the page is
 * clean, the arithmetic on the page is self-consistent, and the number at the bottom is wrong.
 *
 * So the assertions here are about AMOUNTS TYING, not about shapes being present, and the one that
 * matters most is the last: the documents an order produces must sum back to the order.
 */
import { describe, expect, it } from 'vitest';
import {
    AttributeByLine,
    BuildDocuments,
    BuildLadder,
    BuildRows,
    CanRender,
    DaysBetween,
    DeriveDocumentKind,
    DiscountTotalOf,
    DocumentNumber,
    DueDateFor,
    LineDiscountOf,
    ListSubtotalOf,
    PaymentStatusLabel,
    SpreadAcrossCompanies,
    TermsLabel,
    type InvoiceAdjustmentFacts,
    type InvoiceChargeFacts,
    type InvoiceLineFacts,
    type InvoiceOrderFacts,
    type InvoicePartyFacts,
    type InvoicePaymentFacts,
} from '../InvoiceBehavior.js';

const CO_A = '00000000-0000-0000-0000-00000000000a';
const CO_B = '00000000-0000-0000-0000-00000000000b';

const order = (over: Partial<InvoiceOrderFacts> = {}): InvoiceOrderFacts => ({
    ID: 'order-1',
    OrderNumber: 'ORD-1005',
    OrderType: 'Sale',
    OrderDate: '2026-07-01',
    Status: 'Confirmed',
    CompanyID: CO_A,
    CompanyName: 'Acme',
    TotalGross: 0,
    AmountPaid: 0,
    Balance: 0,
    DueDate: null,
    PaymentStatus: 'Unpaid',
    ExternalDocumentNumber: null,
    ReversesOrderHeaderID: null,
    ReversesOrderNumber: null,
    ReversalReason: null,
    Description: null,
    PaymentTermsName: 'Net 30',
    PaymentTermsNetDays: 30,
    ...over,
});

const line = (over: Partial<InvoiceLineFacts> = {}): InvoiceLineFacts => ({
    ID: 'line-1',
    LineNumber: 1,
    ProductID: 'product-1',
    ProductName: 'Widget',
    ProductSKU: 'WID-1',
    Description: null,
    CompanyID: CO_A,
    CompanyName: 'Acme',
    Quantity: 1,
    UnitPrice: 100,
    DiscountAmount: 0,
    LineTotalNet: 100,
    ChargeAmount: 0,
    LineTax: 0,
    LineTotalGross: 100,
    ServicePeriodStart: null,
    ServicePeriodEnd: null,
    ParentOrderLineID: null,
    IsRollupParent: false,
    ReversesOrderLineID: null,
    ...over,
});

const party: InvoicePartyFacts = { Name: 'Buyer Co', AttentionOf: null, AddressLines: ['1 Road'], Email: null };

const build = (over: Partial<Parameters<typeof BuildDocuments>[0]> = {}) =>
    BuildDocuments({
        Order: order(),
        Lines: [line()],
        Charges: [],
        Adjustments: [],
        Payments: [],
        BillTo: party,
        ShipTo: null,
        AsOf: '2026-07-01',
        ...over,
    });

// ── What kind of document this is ────────────────────────────────────────────────────────────────

describe('document kind', () => {
    it('refuses to render a voided order', () => {
        const verdict = CanRender('Voided');
        expect(verdict.OK).toBe(false);
        // The refusal has to say WHY — a bill for money nobody owes is indistinguishable from a
        // real one once it is a PDF in somebody's inbox.
        expect(verdict.Reason).toMatch(/voided/i);
    });

    it('renders every other status', () => {
        for (const status of ['Draft', 'Quoted', 'Confirmed'])
            expect(CanRender(status).OK).toBe(true);
    });

    it('calls a draft a quote, not an invoice', () => {
        expect(DeriveDocumentKind({ Status: 'Draft', ReversesOrderHeaderID: null, TotalGross: 100 })).toBe('Quote');
        expect(DeriveDocumentKind({ Status: 'Quoted', ReversesOrderHeaderID: null, TotalGross: 100 })).toBe('Quote');
        expect(DeriveDocumentKind({ Status: 'Confirmed', ReversesOrderHeaderID: null, TotalGross: 100 })).toBe('Invoice');
    });

    it('calls a reversal a credit memo even when it totals zero', () => {
        expect(DeriveDocumentKind({ Status: 'Confirmed', ReversesOrderHeaderID: 'order-0', TotalGross: 0 })).toBe('Credit Memo');
    });

    it('calls a negative total a credit memo even when nothing was formally reversed', () => {
        // Otherwise the customer is asked to pay minus three hundred dollars.
        expect(DeriveDocumentKind({ Status: 'Confirmed', ReversesOrderHeaderID: null, TotalGross: -300 })).toBe('Credit Memo');
    });
});

// ── The discount that is not in the discount column ──────────────────────────────────────────────

describe('discount derivation', () => {
    it('finds a percentage discount that leaves DiscountAmount at zero', () => {
        // The seeded shape: 2 x 300 at 10% off. The column says nothing happened.
        const l = line({ Quantity: 2, UnitPrice: 300, DiscountAmount: 0, LineTotalNet: 540 });
        expect(Number(l.DiscountAmount)).toBe(0);
        expect(LineDiscountOf(l)).toBe(60);
    });

    it('agrees with the column when the discount was recorded as an amount', () => {
        expect(LineDiscountOf(line({ Quantity: 1, UnitPrice: 100, DiscountAmount: 15, LineTotalNet: 85 }))).toBe(15);
    });

    it('carries the right sign on a return line', () => {
        // A credit of -300 discounted by 10.72 nets -289.28: the ladder walks back UP to it.
        const l = line({ Quantity: -1, UnitPrice: 300, DiscountAmount: 10.72, LineTotalNet: -289.28 });
        expect(LineDiscountOf(l)).toBe(-10.72);
        expect(ListSubtotalOf([l]) - DiscountTotalOf([l])).toBeCloseTo(-289.28, 2);
    });

    it('does not list a rollup parent, which would inflate the subtotal by a whole bundle', () => {
        const parent = line({ ID: 'p', Quantity: 2, UnitPrice: 100, LineTotalNet: 0, IsRollupParent: true });
        const child = line({ ID: 'c', LineNumber: 2, Quantity: 2, UnitPrice: 90, LineTotalNet: 180, ParentOrderLineID: 'p' });
        expect(ListSubtotalOf([parent, child])).toBe(180);
        expect(DiscountTotalOf([parent, child])).toBe(0);
    });
});

// ── Attribution ──────────────────────────────────────────────────────────────────────────────────

describe('attributing header amounts to companies', () => {
    const lineCompany = new Map([
        ['l-a', CO_A],
        ['l-b', CO_B],
    ]);

    it('splits a charge by where its allocations landed', () => {
        const { ByCompany, Unattributed } = AttributeByLine(
            30,
            [
                { OrderLineID: 'l-a', Amount: 20 },
                { OrderLineID: 'l-b', Amount: 10 },
            ],
            lineCompany,
            CO_A,
        );
        expect(ByCompany.get(CO_A)).toBe(20);
        expect(ByCompany.get(CO_B)).toBe(10);
        expect(Unattributed).toBe(0);
    });

    it('bills an unallocated remainder to the header company rather than dropping it', () => {
        // Dropping it leaves two documents that are each internally consistent and together
        // undercharge the customer — the failure that never gets reported.
        const { ByCompany, Unattributed } = AttributeByLine(30, [{ OrderLineID: 'l-b', Amount: 10 }], lineCompany, CO_A);
        expect(Unattributed).toBe(20);
        expect(ByCompany.get(CO_A)).toBe(20);
        expect(ByCompany.get(CO_B)).toBe(10);
        expect(ByCompany.get(CO_A)! + ByCompany.get(CO_B)!).toBe(30);
    });

    it('bills an allocation against an unknown line to the header company', () => {
        const { ByCompany } = AttributeByLine(10, [{ OrderLineID: 'ghost', Amount: 10 }], lineCompany, CO_A);
        expect(ByCompany.get(CO_A)).toBe(10);
    });

    it('spreads order-level money pro rata, to the cent', () => {
        const spread = SpreadAcrossCompanies(100, [
            { CompanyID: CO_A, Gross: 1 },
            { CompanyID: CO_B, Gross: 2 },
        ]);
        expect(spread.get(CO_A)! + spread.get(CO_B)!).toBe(100);
        expect(spread.get(CO_B)).toBeGreaterThan(spread.get(CO_A)!);
    });

    it('still sums exactly when the split does not divide evenly', () => {
        const spread = SpreadAcrossCompanies(0.01, [
            { CompanyID: CO_A, Gross: 1 },
            { CompanyID: CO_B, Gross: 1 },
        ]);
        expect(spread.get(CO_A)! + spread.get(CO_B)!).toBe(0.01);
    });
});

// ── Bundles on the page ──────────────────────────────────────────────────────────────────────────

describe('printed rows', () => {
    it('nests components under the bundle and prices the bundle once', () => {
        const parent = line({ ID: 'p', LineNumber: 1, ProductName: 'Starter Bundle', LineTotalNet: 0, IsRollupParent: true });
        const kids = [
            line({ ID: 'c1', LineNumber: 2, ProductName: 'Manual', LineTotalNet: 60, ParentOrderLineID: 'p' }),
            line({ ID: 'c2', LineNumber: 3, ProductName: 'Kit', LineTotalNet: 40, ParentOrderLineID: 'p' }),
        ];
        const rows = BuildRows([parent, ...kids]);

        expect(rows).toHaveLength(1);
        expect(rows[0].Amount).toBe(100);
        expect(rows[0].Children.map((c) => c.ProductName)).toEqual(['Manual', 'Kit']);
        // The components must NOT also print amounts, or the bundle is billed twice.
        expect(rows[0].Children.every((c) => c.IncludedInParent)).toBe(true);
        const topLevel = rows.reduce((s, r) => s + r.Amount, 0);
        expect(topLevel).toBe(100);
    });

    it('promotes an orphan rather than dropping it, keeping its amount', () => {
        // A component whose bundle parent was sold by the other company: it appears here on its own
        // rather than disappearing from both documents.
        const rows = BuildRows([line({ ID: 'c', LineTotalNet: 40, ParentOrderLineID: 'elsewhere' })]);
        expect(rows).toHaveLength(1);
        expect(rows[0].Amount).toBe(40);
        expect(rows[0].IncludedInParent).toBe(false);
    });

    it('prints rows in line-number order regardless of input order', () => {
        const rows = BuildRows([line({ ID: 'b', LineNumber: 2 }), line({ ID: 'a', LineNumber: 1 })]);
        expect(rows.map((r) => r.LineNumber)).toEqual([1, 2]);
    });
});

// ── The ladder ───────────────────────────────────────────────────────────────────────────────────

describe('the totals ladder', () => {
    const base = {
        ListSubtotal: 100,
        Discounts: [] as Array<{ Label: string; Note: string | null; Amount: number }>,
        DiscountTotal: 0,
        Charges: [] as Array<{ Label: string; Note: string | null; Amount: number; IsTax: boolean }>,
        Gross: 100,
        Payments: [] as Array<{ Label: string; Amount: number }>,
        AmountDue: 100,
        DueLabel: 'Amount due',
    };

    it('emits a residual row when the named discounts do not account for the whole discount', () => {
        const ladder = BuildLadder({
            ...base,
            Discounts: [{ Label: 'Spring promo', Note: 'SPRING', Amount: 10 }],
            DiscountTotal: 25,
            Gross: 75,
            AmountDue: 75,
        });
        const discounts = ladder.filter((r) => r.Kind === 'Discount');
        expect(discounts.map((r) => r.Amount)).toEqual([-10, -15]);
        // Subtotal + every discount = the total. That is the whole point of the residual.
        expect(base.ListSubtotal + discounts.reduce((s, r) => s + r.Amount, 0)).toBe(75);
    });

    it('emits no residual when the named discounts already tie', () => {
        const ladder = BuildLadder({ ...base, Discounts: [{ Label: 'Promo', Note: null, Amount: 25 }], DiscountTotal: 25, Gross: 75, AmountDue: 75 });
        expect(ladder.filter((r) => r.Kind === 'Discount')).toHaveLength(1);
    });

    it('shows a negative residual as an adjustment rather than a negative discount', () => {
        const ladder = BuildLadder({ ...base, Discounts: [{ Label: 'Promo', Note: null, Amount: 30 }], DiscountTotal: 25, Gross: 75, AmountDue: 75 });
        const residual = ladder.filter((r) => r.Kind === 'Discount')[1];
        expect(residual.Label).toBe('Adjustment');
        expect(residual.Amount).toBe(5);
    });

    it('keeps a zero tax row and drops a zero fee', () => {
        const ladder = BuildLadder({
            ...base,
            Charges: [
                { Label: 'Shipping', Note: null, Amount: 0, IsTax: false },
                { Label: 'Sales tax', Note: '0%', Amount: 0, IsTax: true },
            ],
        });
        expect(ladder.some((r) => r.Label === 'Shipping')).toBe(false);
        expect(ladder.some((r) => r.Label === 'Sales tax')).toBe(true);
    });

    it('ends on the amount due, after any payments', () => {
        const ladder = BuildLadder({ ...base, Payments: [{ Label: 'Payment PMT-1', Amount: 40 }], AmountDue: 60 });
        expect(ladder.at(-1)).toMatchObject({ Kind: 'Due', Amount: 60 });
        expect(ladder.filter((r) => r.Kind === 'Payment')[0].Amount).toBe(-40);
    });
});

// ── Dates, terms, numbering ──────────────────────────────────────────────────────────────────────

describe('dates and identity', () => {
    it('prefers the header due date over anything computed from terms', () => {
        // The ledger and the aging report chase THAT date; a document that computes its own would
        // eventually print a different one.
        expect(DueDateFor({ DueDate: '2026-08-15', OrderDate: '2026-07-01', PaymentTermsNetDays: 30 })).toBe('2026-08-15');
    });

    it('falls back to order date plus net days', () => {
        expect(DueDateFor({ DueDate: null, OrderDate: '2026-07-01', PaymentTermsNetDays: 30 })).toBe('2026-07-31');
    });

    it('has no due date when there are no terms', () => {
        expect(DueDateFor({ DueDate: null, OrderDate: '2026-07-01', PaymentTermsNetDays: null })).toBeNull();
    });

    it('never prints a blank terms line', () => {
        expect(TermsLabel({ PaymentTermsName: null, PaymentTermsNetDays: null })).toBe('Due on receipt');
        expect(TermsLabel({ PaymentTermsName: null, PaymentTermsNetDays: 45 })).toBe('Net 45');
        expect(TermsLabel({ PaymentTermsName: 'Net 30', PaymentTermsNetDays: 30 })).toBe('Net 30');
    });

    it('counts days across a DST boundary without drifting', () => {
        expect(DaysBetween('2026-03-01', '2026-03-31')).toBe(30);
        expect(DaysBetween('2026-07-31', '2026-07-01')).toBe(-30);
    });

    it('prints the order number unchanged when there is one document', () => {
        expect(DocumentNumber('ORD-1005', 0, 1)).toBe('ORD-1005');
    });

    it('suffixes only when the order had to be split', () => {
        expect(DocumentNumber('ORD-1005', 0, 2)).toBe('ORD-1005-A');
        expect(DocumentNumber('ORD-1005', 1, 2)).toBe('ORD-1005-B');
    });

    it('reads the payment position from the amounts on THIS document', () => {
        expect(PaymentStatusLabel(100, 0)).toBe('Unpaid');
        expect(PaymentStatusLabel(100, 40)).toBe('Partly paid');
        expect(PaymentStatusLabel(100, 100)).toBe('Paid');
        expect(PaymentStatusLabel(-100, 0)).toBe('Credit');
    });
});

// ── End to end, and the invariant that matters ───────────────────────────────────────────────────

describe('assembling documents', () => {
    it('produces one document for a single-company order, numbered as the order', () => {
        const docs = build();
        expect(docs).toHaveLength(1);
        expect(docs[0].DocumentNumber).toBe('ORD-1005');
        expect(docs[0].Kind).toBe('Invoice');
    });

    it('splits a two-company order and the parts sum back to the order', () => {
        const lines = [
            line({ ID: 'l-a', LineNumber: 1, CompanyID: CO_A, CompanyName: 'Acme', LineTotalNet: 100, ChargeAmount: 6, LineTax: 8, LineTotalGross: 114 }),
            line({ ID: 'l-b', LineNumber: 2, CompanyID: CO_B, CompanyName: 'Beta', LineTotalNet: 200, ChargeAmount: 4, LineTax: 0, LineTotalGross: 204 }),
        ];
        const charges: InvoiceChargeFacts[] = [
            {
                ID: 'chg-ship',
                Name: 'Shipping',
                Category: 'Shipping',
                Amount: 10,
                Rate: null,
                Sequence: 1,
                Allocations: [
                    { OrderLineID: 'l-a', Amount: 6 },
                    { OrderLineID: 'l-b', Amount: 4 },
                ],
            },
            { ID: 'chg-tax', Name: 'PA sales tax', Category: 'Tax', Amount: 8, Rate: 0.06, Sequence: 2, Allocations: [{ OrderLineID: 'l-a', Amount: 8 }] },
        ];

        const docs = BuildDocuments({
            Order: order({ TotalGross: 318 }),
            Lines: lines,
            Charges: charges,
            Adjustments: [],
            Payments: [],
            BillTo: party,
            ShipTo: null,
            AsOf: '2026-07-01',
        });

        expect(docs.map((d) => d.DocumentNumber)).toEqual(['ORD-1005-A', 'ORD-1005-B']);
        expect(docs.reduce((s, d) => s + d.Gross, 0)).toBe(318);
        expect(docs[0].TaxTotal).toBe(8);
        expect(docs[1].TaxTotal).toBe(0);
        // Beta has no nexus, and its document says so rather than staying silent about tax.
        expect(docs[1].Ladder.some((r) => r.Kind === 'Tax')).toBe(true);
        expect(docs.every((d) => d.Notes).valueOf()).toBe(true);
        expect(docs.flatMap((d) => d.Notes)).toEqual([]);
    });

    it('shows tax as zero when there is none, but only once', () => {
        // A document with no tax should still say so. Three empty rows saying it is noise.
        const jurisdictions = ['CA state', 'Santa Clara county', 'district'].map((name, i) => ({
            ID: `t${i}`,
            Name: name,
            Category: 'Tax',
            Amount: 0,
            Rate: 0.01,
            Sequence: i + 10,
            Allocations: [],
        }));
        const [doc] = build({
            Order: order({ TotalGross: 100 }),
            Lines: [line({ LineTax: 0, LineTotalGross: 100 })],
            Charges: jurisdictions,
        });
        expect(doc.Ladder.filter((r) => r.Kind === 'Tax')).toHaveLength(1);
    });

    it('drops the empty tax rows once the document carries real tax', () => {
        // On a split order EVERY jurisdiction's charge reaches BOTH documents and only one carries
        // the money. Keeping the zeroes gives this customer four tax lines, two of them empty.
        const lines = [
            line({ ID: 'l-a', CompanyID: CO_A, LineTotalNet: 100, LineTax: 8, LineTotalGross: 108 }),
            line({ ID: 'l-b', LineNumber: 2, CompanyID: CO_B, LineTotalNet: 100, LineTotalGross: 100 }),
        ];
        const charges: InvoiceChargeFacts[] = [
            { ID: 't1', Name: 'CA tax', Category: 'Tax', Amount: 8, Rate: 0.08, Sequence: 10, Allocations: [{ OrderLineID: 'l-a', Amount: 8 }] },
            { ID: 't2', Name: 'NY tax', Category: 'Tax', Amount: 0, Rate: 0.04, Sequence: 11, Allocations: [] },
        ];
        const [first] = BuildDocuments({
            Order: order({ TotalGross: 208 }),
            Lines: lines,
            Charges: charges,
            Adjustments: [],
            Payments: [],
            BillTo: party,
            ShipTo: null,
            AsOf: '2026-07-01',
            OnlyCompanyID: CO_A,
        });
        const taxRows = first.Ladder.filter((r) => r.Kind === 'Tax');
        expect(taxRows).toHaveLength(1);
        expect(taxRows[0].Amount).toBe(8);
    });

    it('does not print a promotion code that merely repeats its own name', () => {
        // Many promotions are named after their code. "SPRING10 (SPRING10)" reads as a rendering
        // fault rather than as the reference it is meant to be.
        const l = line({ Quantity: 1, UnitPrice: 100, LineTotalNet: 90, LineTotalGross: 90 });
        const same: InvoiceAdjustmentFacts = {
            ID: 'a',
            OrderLineID: 'line-1',
            PromotionName: 'SPRING10',
            PromotionCode: 'SPRING10',
            Reason: null,
            Amount: 10,
            Allocations: [{ OrderLineID: 'line-1', Amount: 10 }],
        };
        const [doc] = build({ Order: order({ TotalGross: 90 }), Lines: [l], Adjustments: [same] });
        const discount = doc.Ladder.find((r) => r.Kind === 'Discount')!;
        expect(discount.Label).toBe('SPRING10');
        expect(discount.Note).toBeNull();

        const [named] = build({
            Order: order({ TotalGross: 90 }),
            Lines: [l],
            Adjustments: [{ ...same, PromotionName: 'Spring sale' }],
        });
        expect(named.Ladder.find((r) => r.Kind === 'Discount')!.Note).toBe('SPRING10');
    });

    it('keeps an unallocated charge on the bill instead of losing it between two documents', () => {
        const lines = [
            line({ ID: 'l-a', CompanyID: CO_A, LineTotalNet: 100, ChargeAmount: 10, LineTotalGross: 110 }),
            line({ ID: 'l-b', LineNumber: 2, CompanyID: CO_B, LineTotalNet: 200, LineTotalGross: 200 }),
        ];
        const docs = BuildDocuments({
            Order: order({ TotalGross: 310 }),
            Lines: lines,
            Charges: [{ ID: 'c', Name: 'Handling', Category: 'Handling', Amount: 10, Rate: null, Sequence: 1, Allocations: [] }],
            Adjustments: [],
            Payments: [],
            BillTo: party,
            ShipTo: null,
            AsOf: '2026-07-01',
        });
        expect(docs.reduce((s, d) => s + d.ChargeTotal, 0)).toBe(10);
        expect(docs[0].Notes.join(' ')).toMatch(/not allocated/i);
    });

    it('spreads an order-level payment across both documents and neither claims to be paid', () => {
        const lines = [
            line({ ID: 'l-a', CompanyID: CO_A, LineTotalNet: 100, LineTotalGross: 100 }),
            line({ ID: 'l-b', LineNumber: 2, CompanyID: CO_B, LineTotalNet: 100, LineTotalGross: 100 }),
        ];
        const payments: InvoicePaymentFacts[] = [
            {
                PaymentHeaderID: 'p1',
                PaymentNumber: 'PMT-1',
                PaymentDate: '2026-07-05',
                PaymentTypeName: 'Cheque',
                Amount: 50,
                Allocations: [{ OrderLineID: null, Amount: 50 }],
            },
        ];
        const docs = BuildDocuments({
            Order: order({ TotalGross: 200, AmountPaid: 50 }),
            Lines: lines,
            Charges: [],
            Adjustments: [],
            Payments: payments,
            BillTo: party,
            ShipTo: null,
            AsOf: '2026-07-05',
        });
        expect(docs.map((d) => d.AmountPaid)).toEqual([25, 25]);
        expect(docs.reduce((s, d) => s + d.AmountDue, 0)).toBe(150);
        // The header says "Partly paid" for the order; neither half may claim to be settled.
        expect(docs.every((d) => d.PaymentStatusLabel === 'Partly paid')).toBe(true);
    });

    it('names the promotion on the ladder and still ties to the total', () => {
        const l = line({ Quantity: 2, UnitPrice: 300, DiscountAmount: 0, LineTotalNet: 540, LineTotalGross: 540 });
        const adjustments: InvoiceAdjustmentFacts[] = [
            {
                ID: 'adj',
                OrderLineID: 'line-1',
                PromotionName: 'Spring 10%',
                PromotionCode: 'SPRING10',
                Reason: null,
                Amount: 60,
                Allocations: [{ OrderLineID: 'line-1', Amount: 60 }],
            },
        ];
        const [doc] = BuildDocuments({
            Order: order({ TotalGross: 540 }),
            Lines: [l],
            Charges: [],
            Adjustments: adjustments,
            Payments: [],
            BillTo: party,
            ShipTo: null,
            AsOf: '2026-07-01',
        });
        expect(doc.ListSubtotal).toBe(600);
        expect(doc.DiscountTotal).toBe(60);
        expect(doc.Ladder.filter((r) => r.Kind === 'Discount')).toHaveLength(1);
        expect(doc.Ladder.find((r) => r.Kind === 'Discount')!.Note).toBe('SPRING10');
        expect(doc.Notes).toEqual([]);
    });

    it('narrows to one company on request without renumbering the others', () => {
        const lines = [
            line({ ID: 'l-a', CompanyID: CO_A, LineTotalGross: 100 }),
            line({ ID: 'l-b', LineNumber: 2, CompanyID: CO_B, LineTotalGross: 100 }),
        ];
        const docs = BuildDocuments({
            Order: order({ TotalGross: 200 }),
            Lines: lines,
            Charges: [],
            Adjustments: [],
            Payments: [],
            BillTo: party,
            ShipTo: null,
            AsOf: '2026-07-01',
            OnlyCompanyID: CO_B,
        });
        expect(docs).toHaveLength(1);
        // Still -B: the suffix describes the order, not the size of this result set.
        expect(docs[0].DocumentNumber).toBe('ORD-1005-B');
    });

    it('counts down to the due date only while something is owed', () => {
        const [unpaid] = build({ Order: order({ TotalGross: 100, DueDate: '2026-07-31' }), AsOf: '2026-07-01' });
        expect(unpaid.DaysUntilDue).toBe(30);

        const [paid] = build({
            Order: order({ TotalGross: 100, DueDate: '2026-07-31' }),
            Payments: [
                {
                    PaymentHeaderID: 'p',
                    PaymentNumber: 'PMT-9',
                    PaymentDate: '2026-07-02',
                    PaymentTypeName: 'Card',
                    Amount: 100,
                    Allocations: [{ OrderLineID: null, Amount: 100 }],
                },
            ],
            AsOf: '2026-07-03',
        });
        expect(paid.AmountDue).toBe(0);
        expect(paid.DaysUntilDue).toBeNull();
        expect(paid.PaymentStatusLabel).toBe('Paid');
    });

    it('still produces a document for an order with no lines', () => {
        // An empty invoice is a visible problem; no invoice at all is not.
        const docs = build({ Lines: [], Order: order({ TotalGross: 0 }) });
        expect(docs).toHaveLength(1);
        expect(docs[0].Rows).toEqual([]);
        expect(docs[0].Gross).toBe(0);
    });

    it('reports a ladder that does not reach the total rather than printing it', () => {
        // Line gross deliberately inconsistent with its own parts — the shape a pricing bug leaves.
        const l = line({ LineTotalNet: 100, ChargeAmount: 0, LineTax: 0, LineTotalGross: 175 });
        const [doc] = build({ Lines: [l], Order: order({ TotalGross: 175 }) });
        expect(doc.Notes.join(' ')).toMatch(/does not add up/i);
    });
});
