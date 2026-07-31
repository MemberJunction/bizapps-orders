/**
 * @fileoverview Turning the numbers on an invoice into the strings that print on it.
 *
 * WHY THIS IS NOT IN THE TEMPLATE. The template language has no money formatting — Nunjucks gives
 * you `round(2)`, which renders eleven hundred dollars as `1100` and, worse, renders a hundred and
 * ten dollars exactly as `110` where the missing `.00` reads as a rounding error to anyone checking
 * the column. Grouping separators, the currency symbol's position and the negative convention are
 * locale decisions, not styling decisions, so they are made here where they can be tested and the
 * template just prints `{{ row.AmountText }}`.
 *
 * WHY IT IS NOT IN THE BUILDER EITHER. Everything here is a pure function of a document plus a
 * locale. Keeping it separate is what lets the same document render as US dollars for the customer
 * and as raw numbers for a reconciliation check, without a second trip to the database.
 *
 * NEGATIVES ARE PARENTHESISED, NOT PREFIXED. `-1,200.00` and `1,200.00` differ by one character at
 * the far left of a right-aligned column, which is exactly where the eye is not. `(1,200.00)` is the
 * convention every accounts-payable clerk already reads, and it is unmistakable at a glance.
 *
 * @module @mj-biz-apps/orders-core-entities-server
 */

import type { InvoiceDocument, InvoiceRow, LadderRow } from './InvoiceBehavior.js';

/** How to render the numbers. The app is single-currency today; this is the seam for when it is not. */
export interface DisplayOptions {
    /** BCP 47 tag. Drives grouping separators and date order. */
    Locale?: string;
    /** ISO 4217 code. */
    Currency?: string;
}

const DEFAULTS: Required<DisplayOptions> = { Locale: 'en-US', Currency: 'USD' };

/** A row as it prints: every number carries the string beside it. */
export interface DisplayRow extends InvoiceRow {
    QuantityText: string;
    UnitPriceText: string;
    DiscountText: string;
    AmountText: string;
    ServicePeriodText: string | null;
    Children: DisplayRow[];
}

/** A ladder row as it prints. */
export interface DisplayLadderRow extends LadderRow {
    AmountText: string;
}

/** The whole document, ready for a template that does no arithmetic of its own. */
export interface DisplayInvoice extends Omit<InvoiceDocument, 'Rows' | 'Ladder' | 'Payments'> {
    Rows: DisplayRow[];
    Ladder: DisplayLadderRow[];
    Payments: Array<InvoiceDocument['Payments'][number] & { AmountText: string; PaymentDateText: string }>;

    OrderDateText: string;
    DueDateText: string | null;
    /** `Due in 22 days`, `Due today`, `21 days overdue` — or null when nothing is owed. */
    DuePhrase: string | null;
    ListSubtotalText: string;
    DiscountTotalText: string;
    NetTotalText: string;
    ChargeTotalText: string;
    TaxTotalText: string;
    GrossText: string;
    AmountPaidText: string;
    AmountDueText: string;
    /** `Amount due` / `Credit due you` — the label the ladder ends on, repeated for the big figure. */
    DueLabel: string;
    /** True when the document is settled, so the renderer can stamp it. */
    IsSettled: boolean;
    /** True when there is a real overdue balance — never true for a quote or a credit. */
    IsOverdue: boolean;
    CurrencyCode: string;
    /** The date the document was produced, for the footer. */
    GeneratedOnText: string;
}

/**
 * Format an amount, parenthesising negatives.
 *
 * THE NUMBER OF DECIMALS IS THE CURRENCY'S, not a constant. Dollars and euros carry two; yen and
 * won carry none, and a bill for `¥12,000.00` tells a Japanese customer they are being charged in
 * some unit that is not yen. Forcing two digits is the kind of hardcoding that is invisible until
 * the first order in a currency nobody tested with.
 */
export function FormatMoney(amount: number, options?: DisplayOptions): string {
    const { Locale, Currency } = { ...DEFAULTS, ...options };
    const value = Math.abs(Number(amount) || 0);
    const text = new Intl.NumberFormat(Locale, { style: 'currency', currency: Currency }).format(value);
    return Number(amount) < 0 ? `(${text})` : text;
}

/**
 * Format a quantity, dropping a trailing `.00` but keeping real fractions.
 *
 * `3` for three of something and `2.5` for two and a half hours — printing `3.00` on a line of
 * widgets invites the reader to look for a decimal that is not there.
 */
export function FormatQuantity(quantity: number, options?: DisplayOptions): string {
    const { Locale } = { ...DEFAULTS, ...options };
    const value = Number(quantity) || 0;
    const decimals = Number.isInteger(value) ? 0 : Math.min(4, (String(value).split('.')[1] ?? '').length);
    return new Intl.NumberFormat(Locale, { minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(value);
}

/** Format an ISO date without letting the local timezone move it a day. */
export function FormatDate(isoDate: string | null, options?: DisplayOptions): string | null {
    if (!isoDate) return null;
    const [y, m, d] = String(isoDate).slice(0, 10).split('-').map(Number);
    if (!y || !m || !d) return null;
    const { Locale } = { ...DEFAULTS, ...options };
    return new Intl.DateTimeFormat(Locale, { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' }).format(
        new Date(Date.UTC(y, m - 1, d)),
    );
}

/** `Due in 22 days` / `Due today` / `21 days overdue`. Null when nothing is owed. */
export function DuePhrase(daysUntilDue: number | null): string | null {
    if (daysUntilDue == null) return null;
    if (daysUntilDue === 0) return 'Due today';
    if (daysUntilDue > 0) return `Due in ${daysUntilDue} day${daysUntilDue === 1 ? '' : 's'}`;
    const overdue = Math.abs(daysUntilDue);
    return `${overdue} day${overdue === 1 ? '' : 's'} overdue`;
}

function decorateRow(row: InvoiceRow, options: DisplayOptions): DisplayRow {
    const period =
        row.ServicePeriodStart || row.ServicePeriodEnd
            ? `${FormatDate(row.ServicePeriodStart, options) ?? '—'} – ${FormatDate(row.ServicePeriodEnd, options) ?? '—'}`
            : null;
    return {
        ...row,
        QuantityText: FormatQuantity(row.Quantity, options),
        UnitPriceText: FormatMoney(row.UnitPrice, options),
        // A line with no discount prints an em dash, not a zero: a column of `$0.00` down the page
        // reads as money and pulls the eye away from the ones that are real.
        DiscountText: row.DiscountAmount === 0 ? '—' : `−${FormatMoney(Math.abs(row.DiscountAmount), options)}`,
        AmountText: row.IncludedInParent ? 'included' : FormatMoney(row.Amount, options),
        ServicePeriodText: period,
        Children: row.Children.map((c) => decorateRow(c, options)),
    };
}

/** Decorate a document for printing. Pure: same document and locale in, same strings out. */
export function DecorateInvoice(doc: InvoiceDocument, options?: DisplayOptions & { GeneratedOn?: string }): DisplayInvoice {
    const opts = { ...DEFAULTS, ...options };
    const generatedOn = options?.GeneratedOn ?? new Date().toISOString().slice(0, 10);
    const dueLabel = doc.Kind === 'Credit Memo' ? 'Credit due you' : doc.Kind === 'Quote' ? 'Quote total' : 'Amount due';

    return {
        ...doc,
        Rows: doc.Rows.map((r) => decorateRow(r, opts)),
        Ladder: doc.Ladder.map((r) => ({ ...r, AmountText: FormatMoney(r.Amount, opts) })),
        Payments: doc.Payments.map((p) => ({
            ...p,
            AmountText: FormatMoney(p.Amount, opts),
            PaymentDateText: FormatDate(p.PaymentDate, opts) ?? p.PaymentDate,
        })),

        OrderDateText: FormatDate(doc.OrderDate, opts) ?? doc.OrderDate,
        DueDateText: FormatDate(doc.DueDate, opts),
        DuePhrase: DuePhrase(doc.DaysUntilDue),
        ListSubtotalText: FormatMoney(doc.ListSubtotal, opts),
        DiscountTotalText: FormatMoney(doc.DiscountTotal, opts),
        NetTotalText: FormatMoney(doc.NetTotal, opts),
        ChargeTotalText: FormatMoney(doc.ChargeTotal, opts),
        TaxTotalText: FormatMoney(doc.TaxTotal, opts),
        GrossText: FormatMoney(doc.Gross, opts),
        AmountPaidText: FormatMoney(doc.AmountPaid, opts),
        // The headline figure is a magnitude — a credit memo says "Credit due you $310.72", not
        // "$-310.72", because the label already carries the direction.
        AmountDueText: FormatMoney(Math.abs(doc.AmountDue), opts),
        DueLabel: dueLabel,
        // A quote is never settled and never overdue, however its arithmetic comes out: nobody has
        // been asked for the money yet.
        IsSettled: doc.Kind === 'Invoice' && doc.Gross > 0 && doc.AmountDue <= 0,
        IsOverdue: doc.Kind === 'Invoice' && doc.AmountDue > 0 && doc.DaysUntilDue != null && doc.DaysUntilDue < 0,
        CurrencyCode: opts.Currency,
        GeneratedOnText: FormatDate(generatedOn, opts) ?? generatedOn,
    };
}
