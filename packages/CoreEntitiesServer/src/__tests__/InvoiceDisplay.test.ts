/**
 * InvoiceDisplay — the strings that print, and the ones that must not.
 *
 * A formatting bug on a bill is not cosmetic. `110` where `$110.00` belongs reads as a truncation;
 * `$-310.72` in a right-aligned column hides its own minus sign behind the widest number above it;
 * a date built through the local timezone lands a day early for anyone west of UTC and turns a bill
 * due on the 1st into one due on the 31st.
 */
import { describe, expect, it } from 'vitest';
import {
    DecorateInvoice,
    DuePhrase,
    FormatDate,
    FormatMoney,
    FormatQuantity,
} from '../InvoiceDisplay.js';
import type { InvoiceDocument, InvoiceRow } from '../InvoiceBehavior.js';
import { ToISODate } from '../InvoiceBuilder.js';

const row = (over: Partial<InvoiceRow> = {}): InvoiceRow => ({
    LineID: 'l1',
    LineNumber: 1,
    ProductName: 'Widget',
    ProductSKU: 'W-1',
    Description: null,
    Quantity: 1,
    UnitPrice: 100,
    DiscountAmount: 0,
    Amount: 100,
    IncludedInParent: false,
    ServicePeriodStart: null,
    ServicePeriodEnd: null,
    ReversesOrderLineID: null,
    Children: [],
    ...over,
});

const doc = (over: Partial<InvoiceDocument> = {}): InvoiceDocument => ({
    Kind: 'Invoice',
    DocumentNumber: 'ORD-1005',
    OrderNumber: 'ORD-1005',
    OrderHeaderID: 'o1',
    OrderDate: '2026-07-01',
    DueDate: '2026-07-31',
    DaysUntilDue: 30,
    Status: 'Confirmed',
    PaymentStatusLabel: 'Unpaid',
    CompanyID: 'c1',
    CompanyName: 'Acme',
    Issuer: { CompanyID: 'c1', Name: 'Acme', AddressLines: [], Email: null, Phone: null, Website: null, TaxID: null, CurrencyCode: null },
    BillTo: { Name: 'Buyer', AttentionOf: null, AddressLines: [], Email: null },
    ShipTo: null,
    TermsLabel: 'Net 30',
    ExternalDocumentNumber: null,
    ReversesOrderNumber: null,
    ReversalReason: null,
    Description: null,
    Rows: [row()],
    Ladder: [{ Label: 'Total', Note: null, Amount: 100, Kind: 'Total' }],
    ListSubtotal: 100,
    DiscountTotal: 0,
    NetTotal: 100,
    ChargeTotal: 0,
    TaxTotal: 0,
    Gross: 100,
    AmountPaid: 0,
    AmountDue: 100,
    Payments: [],
    Notes: [],
    ...over,
});

describe('money', () => {
    it('always shows both cents, so a round number does not read as truncated', () => {
        expect(FormatMoney(110)).toBe('$110.00');
        expect(FormatMoney(1100)).toBe('$1,100.00');
    });

    it('parenthesises negatives rather than hiding a minus at the far left of the column', () => {
        expect(FormatMoney(-310.72)).toBe('($310.72)');
    });

    it('honours a currency other than the default', () => {
        expect(FormatMoney(50, { Currency: 'EUR', Locale: 'en-IE' })).toBe('€50.00');
    });

    it('takes the number of decimals from the currency, not from a constant', () => {
        // Yen has none. `¥12,000.00` bills a Japanese customer in a unit that does not exist.
        expect(FormatMoney(12000, { Currency: 'JPY', Locale: 'en-US' })).toBe('¥12,000');
    });
});

describe('quantities', () => {
    it('drops a meaningless decimal', () => {
        expect(FormatQuantity(3)).toBe('3');
    });

    it('keeps a real one', () => {
        expect(FormatQuantity(2.5)).toBe('2.5');
    });
});

describe('dates', () => {
    it('does not shift the day through the local timezone', () => {
        // Built naively through `new Date('2026-07-01')` this lands on 30 June anywhere west of UTC.
        expect(FormatDate('2026-07-01')).toBe('Jul 1, 2026');
    });

    it('returns null rather than "Invalid Date" for nothing', () => {
        expect(FormatDate(null)).toBeNull();
        expect(FormatDate('')).toBeNull();
    });
});

describe('the due phrase', () => {
    it('reads naturally on each side of the date', () => {
        expect(DuePhrase(22)).toBe('Due in 22 days');
        expect(DuePhrase(1)).toBe('Due in 1 day');
        expect(DuePhrase(0)).toBe('Due today');
        expect(DuePhrase(-1)).toBe('1 day overdue');
        expect(DuePhrase(-21)).toBe('21 days overdue');
    });

    it('says nothing when nothing is owed', () => {
        expect(DuePhrase(null)).toBeNull();
    });
});

describe('decorating a document', () => {
    it('prints "included" against a bundle component rather than a second amount', () => {
        const parent = row({ Amount: 100, Children: [row({ LineID: 'c', Amount: 60, IncludedInParent: true })] });
        const display = DecorateInvoice(doc({ Rows: [parent] }));
        expect(display.Rows[0].AmountText).toBe('$100.00');
        expect(display.Rows[0].Children[0].AmountText).toBe('included');
    });

    it('prints an em dash where there is no discount, not a column of zeroes', () => {
        expect(DecorateInvoice(doc()).Rows[0].DiscountText).toBe('—');
        expect(DecorateInvoice(doc({ Rows: [row({ DiscountAmount: 15 })] })).Rows[0].DiscountText).toBe('−$15.00');
    });

    it('shows a credit as a magnitude, because the label already carries the direction', () => {
        const display = DecorateInvoice(doc({ Kind: 'Credit Memo', Gross: -310.72, AmountDue: -310.72 }));
        expect(display.DueLabel).toBe('Credit due you');
        expect(display.AmountDueText).toBe('$310.72');
    });

    it('never stamps a quote as settled and never calls one overdue', () => {
        // A quote's arithmetic can come out to zero owed; nobody has been asked for money yet.
        const quote = DecorateInvoice(doc({ Kind: 'Quote', AmountDue: 0, DaysUntilDue: -40 }));
        expect(quote.IsSettled).toBe(false);
        expect(quote.IsOverdue).toBe(false);
        expect(quote.DueLabel).toBe('Quote total');
    });

    it('stamps a settled invoice and flags a late one', () => {
        expect(DecorateInvoice(doc({ AmountDue: 0, DaysUntilDue: null })).IsSettled).toBe(true);
        expect(DecorateInvoice(doc({ AmountDue: 100, DaysUntilDue: -5 })).IsOverdue).toBe(true);
        expect(DecorateInvoice(doc({ AmountDue: 100, DaysUntilDue: 5 })).IsOverdue).toBe(false);
    });

    it('does not call a zero-total invoice paid', () => {
        // Otherwise every empty or fully-credited order arrives stamped Paid, which reads as a
        // receipt for money that never moved.
        expect(DecorateInvoice(doc({ Gross: 0, AmountDue: 0 })).IsSettled).toBe(false);
    });

    it('leaves the underlying numbers alone for anything reconciling against them', () => {
        const display = DecorateInvoice(doc({ Gross: 1234.56, AmountDue: 1234.56 }));
        expect(display.Gross).toBe(1234.56);
        expect(display.GrossText).toBe('$1,234.56');
    });

    it('is deterministic — the same document and locale give the same strings', () => {
        const d = doc();
        expect(JSON.stringify(DecorateInvoice(d, { GeneratedOn: '2026-07-01' }))).toBe(
            JSON.stringify(DecorateInvoice(d, { GeneratedOn: '2026-07-01' })),
        );
    });
});

describe('the date the data layer hands over', () => {
    it('reads a Date object without losing the year', () => {
        // `RunView` returns SQL `date` columns as Date OBJECTS. Slicing `String(date)` takes ten
        // characters of `Thu Jul 30 2026 00:00:00 GMT-0400` and yields `Thu Jul 30` — which parses
        // as nothing and prints on the bill as a plausible day with no year on it.
        expect(ToISODate(new Date(Date.UTC(2026, 6, 30)))).toBe('2026-07-30');
        expect(FormatDate(ToISODate(new Date(Date.UTC(2026, 6, 30))))).toBe('Jul 30, 2026');
    });

    it('does not slip a day for a machine west of Greenwich', () => {
        // A `date` column has no time; the driver materialises it at midnight UTC, so reading the
        // LOCAL components gives the day before anywhere with a negative offset.
        expect(ToISODate(new Date(Date.UTC(2026, 0, 1)))).toBe('2026-01-01');
    });

    it('passes an ISO string through untouched', () => {
        expect(ToISODate('2026-07-30')).toBe('2026-07-30');
        expect(ToISODate('2026-07-30T14:22:00.000Z')).toBe('2026-07-30');
    });

    it('returns null for nothing and for nonsense, rather than a fake date', () => {
        expect(ToISODate(null)).toBeNull();
        expect(ToISODate('')).toBeNull();
        expect(ToISODate('not a date')).toBeNull();
        expect(ToISODate(new Date('nope'))).toBeNull();
    });
});
