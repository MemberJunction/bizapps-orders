import { describe, expect, it } from 'vitest';
import {
    BuildDocuments,
    DocumentCurrencyCode,
    type InvoiceIssuerFacts,
    type InvoiceOrderFacts,
    type InvoicePartyFacts,
} from '../InvoiceBehavior.js';
import { DecorateInvoice } from '../InvoiceDisplay.js';

/**
 * Invoices, quotes and credit memos print in the order's currency (golive #492).
 *
 * An order's amounts are in its own `CurrencyCode`; one without a currency is in the selling
 * company's functional currency, the issuer's `CurrencyCode`, as before.
 */

const CO = '00000000-0000-0000-0000-00000000000a';

const order = (over: Partial<InvoiceOrderFacts> = {}): InvoiceOrderFacts => ({
    ID: 'order-1',
    OrderNumber: 'ORD-1005',
    OrderType: 'Sale',
    OrderDate: '2026-07-01',
    Status: 'Confirmed',
    CompanyID: CO,
    CompanyName: 'Acme',
    TotalGross: 100,
    AmountPaid: 0,
    Balance: 100,
    DueDate: null,
    ExternalDocumentNumber: null,
    ReversesOrderHeaderID: null,
    ReversesOrderNumber: null,
    ReversalReason: null,
    Description: null,
    PaymentTermsName: null,
    PaymentTermsNetDays: null,
    ...over,
});

const issuer: InvoiceIssuerFacts = {
    CompanyID: CO,
    Name: 'Acme',
    AddressLines: [],
    Email: null,
    Phone: null,
    Website: null,
    TaxID: null,
    CurrencyCode: 'USD',
};

const party: InvoicePartyFacts = { Name: 'Buyer Co', AttentionOf: null, AddressLines: [], Email: null };

const document = (over: Partial<InvoiceOrderFacts> = {}) =>
    BuildDocuments({
        Order: order(over),
        Lines: [
            {
                ID: 'line-1',
                LineNumber: 1,
                ProductID: 'product-1',
                ProductName: 'Membership',
                ProductSKU: null,
                Description: null,
                CompanyID: CO,
                CompanyName: 'Acme',
                Quantity: 1,
                UnitPrice: 100,
                ExtendedAmount: null,
                DiscountPct: 0,
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
            },
        ],
        Charges: [],
        Adjustments: [],
        Payments: [],
        BillTo: party,
        ShipTo: null,
        Issuers: new Map([[CO, issuer]]),
        AsOf: '2026-07-01',
    })[0];

describe('the currency a document prints in', () => {
    it("is the order's own currency when it has one", () => {
        const doc = document({ CurrencyCode: 'aud' });
        expect(doc.OrderCurrencyCode).toBe('AUD');
        expect(DocumentCurrencyCode(doc)).toBe('AUD');
        // the order's currency wins over a requested one: its amounts are stored in it
        expect(DocumentCurrencyCode(doc, 'USD')).toBe('AUD');
        const printed = DecorateInvoice(doc, { Currency: DocumentCurrencyCode(doc) });
        expect(printed.CurrencyCode).toBe('AUD');
        expect(printed.GrossText).toContain('A$');
    });

    it("is the issuer's functional currency for an order with none", () => {
        const doc = document({ CurrencyCode: null });
        expect(doc.OrderCurrencyCode).toBeNull();
        expect(DocumentCurrencyCode(doc)).toBe('USD');
        expect(DocumentCurrencyCode(doc, 'EUR')).toBe('EUR');
    });

    it('falls back to USD when neither the order nor the issuer names one', () => {
        const doc = { ...document(), Issuer: { ...issuer, CurrencyCode: null } };
        expect(DocumentCurrencyCode(doc)).toBe('USD');
    });
});
