/**
 * @fileoverview Turning an order into the document you send a customer — the decisions, with no
 * database and no HTML anywhere near them.
 *
 * THERE IS NO INVOICE RECORD, AND THAT IS THE POINT. The confirmed order IS the receivable: it is
 * what the ledger booked, what the aging report ages, and what the customer quotes on the phone. An
 * invoice is that order RENDERED. Storing a second row called `Invoice` would create a number that
 * can disagree with the order it came from, and the day it does, nothing in the system can tell you
 * which one is right. So this module derives; it never writes.
 *
 * (Statements are the opposite case and are deliberately NOT built on this: a statement is a
 * point-in-time snapshot of a customer's position, so re-deriving it later gives you a DIFFERENT
 * document with the same date on it. That one needs storage. This one must not have it.)
 *
 * WHY THE SPLIT BY SELLING COMPANY IS THE LOAD-BEARING DECISION HERE. An order's lines can be sold
 * by more than one company — 14 of the 75 orders in the review seed are — and each company carries
 * its own receivable, its own tax registration and its own remit-to address. One document covering
 * two companies would name one of them as the payee for money the other is owed. So an order
 * produces one document PER SELLING COMPANY, and the invariant that matters is that the documents
 * sum back to the order: `Σ documents.Gross === OrderHeader.TotalGross`. Everything below exists to
 * keep that true, which is why unattributable amounts are pushed onto the header company rather
 * than dropped. A dropped charge produces an invoice that is internally consistent, adds up
 * perfectly, and undercharges the customer.
 *
 * THE LADDER MUST TIE. `ListSubtotal − Discounts + Charges + Tax === Gross`, always. The named
 * discount rows are a BREAKDOWN of the line-level discount, not a second source of it — promotions
 * are already baked into `OrderLine.LineTotalNet` by the time an order is confirmed. If the named
 * rows do not account for the whole discount, {@link BuildDocument} emits the difference as an
 * explicit residual row instead of letting the ladder quietly fail to add up.
 *
 * @module @mj-biz-apps/orders-core-entities-server
 */

import { SplitExactly } from './BundleBehavior.js';

const Money = (n: number): number => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

// ── Inputs ───────────────────────────────────────────────────────────────────────────────────────
// Plain records rather than entities: these are the shapes a reader hands over, and keeping the
// entity types out means every decision below can be exercised in a unit test with a literal.

/** The order header, as far as the document is concerned. */
export interface InvoiceOrderFacts {
    ID: string;
    OrderNumber: string;
    OrderType: string | null;
    OrderDate: string;
    Status: string;
    /** The company on the header — the fallback owner of anything not attributable to a line. */
    CompanyID: string;
    CompanyName: string;
    TotalGross: number;
    AmountPaid: number;
    Balance: number;
    DueDate: string | null;
    PaymentStatus: string | null;
    /** The customer's own PO/reference, printed so their AP department can match it. */
    ExternalDocumentNumber: string | null;
    /** Set when this order reverses another — the document is then a credit memo. */
    ReversesOrderHeaderID: string | null;
    ReversesOrderNumber: string | null;
    ReversalReason: string | null;
    Description: string | null;
    /** Net days from the terms record, used only when the header carries no due date. */
    PaymentTermsName: string | null;
    PaymentTermsNetDays: number | null;
}

/** One order line. Amounts are the engine's, already discounted and already taxed. */
export interface InvoiceLineFacts {
    ID: string;
    LineNumber: number;
    ProductID: string | null;
    ProductName: string;
    ProductSKU: string | null;
    Description: string | null;
    CompanyID: string;
    CompanyName: string;
    Quantity: number;
    UnitPrice: number;
    DiscountAmount: number;
    LineTotalNet: number;
    ChargeAmount: number;
    LineTax: number;
    LineTotalGross: number;
    ServicePeriodStart: string | null;
    ServicePeriodEnd: string | null;
    ParentOrderLineID: string | null;
    IsRollupParent: boolean;
    ReversesOrderLineID: string | null;
}

/** A header-level charge (shipping, handling, surcharge — and tax, which is a charge like any other). */
export interface InvoiceChargeFacts {
    ID: string;
    Name: string;
    /** `Tax` separates the tax rows from the fee rows on the ladder; nothing else keys off it. */
    Category: string;
    Amount: number;
    Rate: number | null;
    Sequence: number;
    /** Line-level allocations of this charge. Empty means it was never allocated. */
    Allocations: Array<{ OrderLineID: string; Amount: number }>;
}

/** A discount that was applied — a promotion, or a manual adjustment somebody authorised. */
export interface InvoiceAdjustmentFacts {
    ID: string;
    /** Set when the adjustment targets a single line; null when it is order-wide. */
    OrderLineID: string | null;
    PromotionName: string | null;
    PromotionCode: string | null;
    Reason: string | null;
    /** Stored as a positive magnitude of discount. */
    Amount: number;
    Allocations: Array<{ OrderLineID: string; Amount: number }>;
}

/** Money received against this order. */
export interface InvoicePaymentFacts {
    PaymentHeaderID: string;
    PaymentNumber: string;
    PaymentDate: string;
    PaymentTypeName: string | null;
    /** The amount of this payment allocated to THIS order (not the payment's full amount). */
    Amount: number;
    /** Per-line allocations; a null `OrderLineID` means it landed on the order as a whole. */
    Allocations: Array<{ OrderLineID: string | null; Amount: number }>;
}

/** Somewhere to send it and somewhere to send the money back to. */
export interface InvoicePartyFacts {
    Name: string | null;
    AttentionOf: string | null;
    AddressLines: string[];
    Email: string | null;
}

/**
 * Who is asking to be paid.
 *
 * One per selling company, because on a split order they are genuinely different businesses with
 * different registrations. `CurrencyCode` belongs here rather than on the order: it is the selling
 * company's functional currency, which is a property of the seller and not of the sale.
 */
export interface InvoiceIssuerFacts {
    CompanyID: string;
    Name: string;
    AddressLines: string[];
    Email: string | null;
    Phone: string | null;
    Website: string | null;
    /** Printed as the registration line — a tax number a buyer's AP department can quote. */
    TaxID: string | null;
    CurrencyCode: string | null;
}

// ── Outputs ──────────────────────────────────────────────────────────────────────────────────────

export type DocumentKind = 'Invoice' | 'Quote' | 'Credit Memo';

/** One row on the printed line table. Children of a bundle hang off their parent. */
export interface InvoiceRow {
    LineID: string;
    LineNumber: number;
    ProductName: string;
    ProductSKU: string | null;
    Description: string | null;
    Quantity: number;
    UnitPrice: number;
    DiscountAmount: number;
    /**
     * What prints in the amount column. For a rollup parent this is the sum of its children in THIS
     * document — the children then print without amounts, because printing both would show the
     * customer a bundle charged twice.
     */
    Amount: number;
    /** True when the amount belongs to the parent above, so the renderer suppresses the column. */
    IncludedInParent: boolean;
    ServicePeriodStart: string | null;
    ServicePeriodEnd: string | null;
    ReversesOrderLineID: string | null;
    Children: InvoiceRow[];
}

/** A row on the totals ladder, in print order. */
export interface LadderRow {
    Label: string;
    /** Shown after the label in muted type — a promo code, a tax rate. */
    Note: string | null;
    Amount: number;
    Kind: 'Subtotal' | 'Discount' | 'Charge' | 'Tax' | 'Total' | 'Payment' | 'Due';
}

/** One sendable document: an order, restricted to what one selling company is owed for. */
export interface InvoiceDocument {
    Kind: DocumentKind;
    /** `ORD-1005` when the order is single-company, `ORD-1005-A` when it had to be split. */
    DocumentNumber: string;
    OrderNumber: string;
    OrderHeaderID: string;
    OrderDate: string;
    DueDate: string | null;
    /** Negative once overdue. Null when nothing is owed or no due date applies. */
    DaysUntilDue: number | null;
    Status: string;
    PaymentStatusLabel: string;

    CompanyID: string;
    CompanyName: string;
    Issuer: InvoiceIssuerFacts;

    BillTo: InvoicePartyFacts;
    ShipTo: InvoicePartyFacts | null;

    TermsLabel: string;
    ExternalDocumentNumber: string | null;
    ReversesOrderNumber: string | null;
    ReversalReason: string | null;
    Description: string | null;

    Rows: InvoiceRow[];
    Ladder: LadderRow[];

    ListSubtotal: number;
    DiscountTotal: number;
    NetTotal: number;
    ChargeTotal: number;
    TaxTotal: number;
    Gross: number;
    AmountPaid: number;
    AmountDue: number;

    Payments: Array<{ PaymentNumber: string; PaymentDate: string; TypeName: string | null; Amount: number }>;

    /**
     * Anything the reader had to decide rather than read. Money that could not be attributed to a
     * line, a discount breakdown that did not reconcile — surfaced so it can be asserted against,
     * because each of these produces a document that looks perfectly ordinary.
     */
    Notes: string[];
}

// ── Decisions ────────────────────────────────────────────────────────────────────────────────────

/**
 * Whether an order can be rendered as a customer-facing document at all, and what it is if so.
 *
 * A VOIDED ORDER IS REFUSED. Not because rendering it is hard, but because the resulting page is a
 * bill for money nobody owes, indistinguishable from a real one once it is a PDF in an inbox. If
 * somebody needs to see a voided order they can look at the order.
 */
export function CanRender(status: string): { OK: boolean; Reason?: string } {
    if (status === 'Voided')
        return {
            OK: false,
            Reason: 'This order is voided — there is nothing to bill, and a voided order rendered as an invoice is indistinguishable from a live one.',
        };
    return { OK: true };
}

/**
 * What kind of document this order is.
 *
 * A reversal is a credit memo even if its total happens to be zero, and a negative total is a credit
 * memo even when nothing was formally reversed — either way the customer is owed, and calling it an
 * invoice would ask them to pay a negative number.
 */
export function DeriveDocumentKind(facts: Pick<InvoiceOrderFacts, 'Status' | 'ReversesOrderHeaderID' | 'TotalGross'>): DocumentKind {
    if (facts.ReversesOrderHeaderID || Number(facts.TotalGross) < 0) return 'Credit Memo';
    if (facts.Status === 'Draft' || facts.Status === 'Quoted') return 'Quote';
    return 'Invoice';
}

/** ISO date arithmetic that does not drift across a DST boundary. */
function dayNumber(iso: string): number {
    const [y, m, d] = String(iso).slice(0, 10).split('-').map(Number);
    return Date.UTC(y, (m ?? 1) - 1, d ?? 1);
}

/** Whole days from `from` to `to`; negative when `to` is in the past. */
export function DaysBetween(from: string, to: string): number {
    return Math.round((dayNumber(to) - dayNumber(from)) / 86_400_000);
}

/**
 * The date payment is due.
 *
 * The header's own `DueDate` wins whenever it is set — it is what the ledger and the aging report
 * use, and a document that computes its own would eventually print a different date than the one
 * the collector is chasing against.
 */
export function DueDateFor(order: Pick<InvoiceOrderFacts, 'DueDate' | 'OrderDate' | 'PaymentTermsNetDays'>): string | null {
    if (order.DueDate) return String(order.DueDate).slice(0, 10);
    const days = order.PaymentTermsNetDays;
    if (days == null || !order.OrderDate) return null;
    return new Date(dayNumber(order.OrderDate) + days * 86_400_000).toISOString().slice(0, 10);
}

/** `Net 30`, or `Due on receipt` when there are no terms — never a blank line on a bill. */
export function TermsLabel(order: Pick<InvoiceOrderFacts, 'PaymentTermsName' | 'PaymentTermsNetDays'>): string {
    if (order.PaymentTermsName) return order.PaymentTermsName;
    if (order.PaymentTermsNetDays != null) return `Net ${order.PaymentTermsNetDays}`;
    return 'Due on receipt';
}

/**
 * How the payment position reads at a glance.
 *
 * Derived from the two amounts rather than copied from `OrderHeader.PaymentStatus`, because this
 * document may cover ONE company of several and the header's status describes the whole order —
 * printing "Paid" on the unpaid half of a split order is exactly the kind of wrong that never gets
 * reported, it just never gets paid.
 */
export function PaymentStatusLabel(gross: number, paid: number): string {
    const due = Money(gross - paid);
    if (gross < 0) return 'Credit';
    if (due <= 0 && gross > 0) return 'Paid';
    if (paid > 0) return 'Partly paid';
    return 'Unpaid';
}

/**
 * The document number.
 *
 * A single-company order prints the ORDER number, unchanged: the customer, the ledger, the aging
 * report and the person answering the phone all say the same string. Only when one order has to
 * become several documents does a suffix appear, and then it is stable — companies are ordered by
 * ID, so re-rendering the same order tomorrow produces the same `-A` and `-B`.
 */
export function DocumentNumber(orderNumber: string, index: number, total: number): string {
    if (total <= 1) return orderNumber;
    return `${orderNumber}-${String.fromCharCode(65 + index)}`;
}

/**
 * Spread an amount over companies, in proportion to what each is owed.
 *
 * Used for money that arrived against the ORDER rather than against a line — an order-level payment
 * allocation has no company to belong to. Largest-remainder via {@link SplitExactly}, so the parts
 * sum to the whole exactly: a pro-rata split that loses a cent leaves a document that can never be
 * marked paid.
 */
export function SpreadAcrossCompanies(amount: number, companyGross: Array<{ CompanyID: string; Gross: number }>): Map<string, number> {
    const out = new Map<string, number>();
    if (!companyGross.length) return out;
    const parts = SplitExactly(amount, companyGross.map((c) => Math.max(0, c.Gross)));
    companyGross.forEach((c, i) => out.set(c.CompanyID, parts[i]));
    return out;
}

/**
 * Attribute a header-level amount to companies via its line allocations.
 *
 * ANY UNALLOCATED REMAINDER GOES TO THE HEADER COMPANY, and the caller is told. The alternative —
 * ignoring it — produces documents that are each internally consistent and together bill less than
 * the order. That is the failure this whole module is arranged to prevent, so it cannot be silent.
 *
 * @param lineCompany Line ID -> selling company. Allocations to unknown lines fall through to the
 *   header company too, on the same reasoning.
 */
export function AttributeByLine(
    total: number,
    allocations: Array<{ OrderLineID: string | null; Amount: number }>,
    lineCompany: Map<string, string>,
    headerCompanyID: string,
): { ByCompany: Map<string, number>; Unattributed: number } {
    const byCompany = new Map<string, number>();
    let attributed = 0;

    for (const alloc of allocations) {
        const company = (alloc.OrderLineID && lineCompany.get(alloc.OrderLineID)) || null;
        if (!company) continue;
        byCompany.set(company, Money((byCompany.get(company) ?? 0) + Number(alloc.Amount)));
        attributed = Money(attributed + Number(alloc.Amount));
    }

    const remainder = Money(Number(total) - attributed);
    if (remainder !== 0) {
        byCompany.set(headerCompanyID, Money((byCompany.get(headerCompanyID) ?? 0) + remainder));
    }

    return { ByCompany: byCompany, Unattributed: remainder };
}

/**
 * Build the printed line rows for one company's document, nesting bundle components under the
 * bundle they came from.
 *
 * A ROLLUP PARENT CARRIES NO MONEY OF ITS OWN — the pricing engine zeroes it so the order does not
 * double — so its printed amount is the sum of the children present HERE, and those children print
 * without amounts. A bundle whose components were sold by two companies therefore appears on both
 * documents, each showing only its own share. That looks odd on the page and is the only version
 * that adds up.
 *
 * A child whose parent is not in this document is promoted to the top level rather than dropped,
 * with its own amount intact.
 */
export function BuildRows(lines: InvoiceLineFacts[]): InvoiceRow[] {
    const present = new Set(lines.map((l) => l.ID));
    const childrenOf = new Map<string, InvoiceLineFacts[]>();
    const tops: InvoiceLineFacts[] = [];

    for (const line of lines) {
        const parent = line.ParentOrderLineID;
        if (parent && present.has(parent)) {
            const bucket = childrenOf.get(parent) ?? [];
            bucket.push(line);
            childrenOf.set(parent, bucket);
        } else {
            tops.push(line);
        }
    }

    const toRow = (line: InvoiceLineFacts, includedInParent: boolean): InvoiceRow => {
        const kids = (childrenOf.get(line.ID) ?? []).sort((a, b) => a.LineNumber - b.LineNumber);
        const rolled = line.IsRollupParent;
        const childRows = kids.map((k) => toRow(k, rolled));
        const amount = rolled
            ? Money(kids.reduce((s, k) => s + Number(k.LineTotalNet ?? 0), 0))
            : Money(line.LineTotalNet);

        return {
            LineID: line.ID,
            LineNumber: line.LineNumber,
            ProductName: line.ProductName,
            ProductSKU: line.ProductSKU,
            Description: line.Description,
            Quantity: Number(line.Quantity),
            UnitPrice: Money(line.UnitPrice),
            DiscountAmount: LineDiscountOf(line),
            Amount: amount,
            IncludedInParent: includedInParent,
            ServicePeriodStart: line.ServicePeriodStart,
            ServicePeriodEnd: line.ServicePeriodEnd,
            ReversesOrderLineID: line.ReversesOrderLineID,
            Children: childRows,
        };
    };

    return tops.sort((a, b) => a.LineNumber - b.LineNumber).map((l) => toRow(l, false));
}

/**
 * What one line lists at, before discount.
 *
 * ROLLUP PARENTS LIST AT NOTHING. The parent of a bundle carries a unit price but is deliberately
 * priced to zero — the components carry the money — so counting `Quantity × UnitPrice` on it as
 * well inflates the subtotal by a whole bundle. The discount line below would then absorb the
 * difference and the ladder would still reach the right total, while showing the customer a
 * fictional list price and a fictional saving.
 */
export function ListAmountOf(line: InvoiceLineFacts): number {
    if (line.IsRollupParent) return 0;
    return Money(Number(line.Quantity) * Number(line.UnitPrice));
}

/**
 * What one line was discounted by — DERIVED, not read.
 *
 * `OrderLine.DiscountAmount` IS NOT THE DISCOUNT. A discount can be recorded as an amount or as a
 * percentage, and when it is a percentage the amount column stays zero: in the review seed, 15
 * orders carry a discount and 16 lines have a `LineTotalNet` below list with `DiscountAmount = 0`.
 * Trusting the column prints "Subtotal 600.00 / Total 540.00" with no discount row between them —
 * a bill that is off by sixty dollars and looks completely ordinary.
 *
 * List minus net is the discount by definition, whichever way it was entered, and it carries the
 * right sign on a return line without a special case: a credit of −300 discounted by 10.72 has a
 * net of −289.28, so the derived discount is −10.72 and the ladder walks back UP to it.
 */
export function LineDiscountOf(line: InvoiceLineFacts): number {
    if (line.IsRollupParent) return 0;
    return Money(ListAmountOf(line) - Number(line.LineTotalNet ?? 0));
}

/** The list subtotal, before any discount. */
export function ListSubtotalOf(lines: InvoiceLineFacts[]): number {
    return Money(lines.reduce((s, l) => s + ListAmountOf(l), 0));
}

/** The whole discount on this set of lines. */
export function DiscountTotalOf(lines: InvoiceLineFacts[]): number {
    return Money(lines.reduce((s, l) => s + LineDiscountOf(l), 0));
}

/** Assemble the totals ladder in print order, with a residual row when the named discounts fall short. */
export function BuildLadder(input: {
    ListSubtotal: number;
    Discounts: Array<{ Label: string; Note: string | null; Amount: number }>;
    DiscountTotal: number;
    Charges: Array<{ Label: string; Note: string | null; Amount: number; IsTax: boolean }>;
    Gross: number;
    Payments: Array<{ Label: string; Amount: number }>;
    AmountDue: number;
    DueLabel: string;
}): LadderRow[] {
    const rows: LadderRow[] = [{ Label: 'Subtotal', Note: null, Amount: input.ListSubtotal, Kind: 'Subtotal' }];

    let named = 0;
    for (const d of input.Discounts) {
        if (Money(d.Amount) === 0) continue;
        named = Money(named + d.Amount);
        rows.push({ Label: d.Label, Note: d.Note, Amount: -Money(d.Amount), Kind: 'Discount' });
    }

    // The named promotions are a BREAKDOWN of the line-level discount, not a second source of it.
    // When they do not account for all of it — a manual discount typed straight onto a line, an
    // adjustment recorded before this document existed — the difference prints as its own row. The
    // ladder adding up is not negotiable; where the discount came from is a nice-to-have.
    const residual = Money(input.DiscountTotal - named);
    if (residual !== 0) {
        rows.push({ Label: residual > 0 ? 'Discount' : 'Adjustment', Note: null, Amount: -residual, Kind: 'Discount' });
    }

    for (const c of input.Charges) {
        if (Money(c.Amount) === 0 && !c.IsTax) continue;
        rows.push({ Label: c.Label, Note: c.Note, Amount: Money(c.Amount), Kind: c.IsTax ? 'Tax' : 'Charge' });
    }

    rows.push({ Label: 'Total', Note: null, Amount: Money(input.Gross), Kind: 'Total' });

    for (const p of input.Payments) {
        if (Money(p.Amount) === 0) continue;
        rows.push({ Label: p.Label, Note: null, Amount: -Money(p.Amount), Kind: 'Payment' });
    }

    rows.push({ Label: input.DueLabel, Note: null, Amount: Money(input.AmountDue), Kind: 'Due' });
    return rows;
}

/**
 * Everything above, in the right order: an order and its satellites become one document per selling
 * company.
 *
 * @param asOf The date the document is being produced, used only for the days-until-due countdown.
 */
export function BuildDocuments(input: {
    Order: InvoiceOrderFacts;
    Lines: InvoiceLineFacts[];
    Charges: InvoiceChargeFacts[];
    Adjustments: InvoiceAdjustmentFacts[];
    Payments: InvoicePaymentFacts[];
    BillTo: InvoicePartyFacts;
    ShipTo: InvoicePartyFacts | null;
    /** Company ID -> the trading name to print as the issuer. Falls back to the line's own copy. */
    CompanyNames?: Map<string, string>;
    /** Company ID -> issuer block. A company with no entry still gets a document, with just a name. */
    Issuers?: Map<string, InvoiceIssuerFacts>;
    AsOf: string;
    /** Render only this company's document. Omit for all of them. */
    OnlyCompanyID?: string | null;
}): InvoiceDocument[] {
    const { Order: order, Lines: lines, Charges: charges, Adjustments: adjustments, Payments: payments } = input;

    const kind = DeriveDocumentKind(order);
    const dueDate = DueDateFor(order);
    const terms = TermsLabel(order);

    const lineCompany = new Map(lines.map((l) => [l.ID, l.CompanyID]));

    // Companies in ID order, so the -A/-B suffixes are stable across renders. An order with no
    // lines still produces one document — for the header company, showing nothing — because an
    // empty invoice is a visible problem and no invoice at all is not.
    const companyIDs = [...new Set(lines.map((l) => l.CompanyID))].sort();
    if (!companyIDs.length) companyIDs.push(order.CompanyID);

    const companyName = (id: string): string =>
        input.CompanyNames?.get(id) ?? lines.find((l) => l.CompanyID === id)?.CompanyName ?? order.CompanyName;

    const grossByCompany = companyIDs.map((id) => ({
        CompanyID: id,
        Gross: Money(lines.filter((l) => l.CompanyID === id).reduce((s, l) => s + Number(l.LineTotalGross ?? 0), 0)),
    }));

    // Charges and adjustments are attributed through their line allocations; payments that landed on
    // the order as a whole are spread pro rata. Both are computed ONCE here rather than per company,
    // so every document sees the same split of the same money.
    const notesByCompany = new Map<string, string[]>();
    const note = (companyID: string, text: string): void => {
        const bucket = notesByCompany.get(companyID) ?? [];
        bucket.push(text);
        notesByCompany.set(companyID, bucket);
    };

    const chargeSplit = charges.map((c) => {
        const { ByCompany, Unattributed } = AttributeByLine(c.Amount, c.Allocations, lineCompany, order.CompanyID);
        if (Unattributed !== 0 && companyIDs.length > 1) {
            note(order.CompanyID, `${c.Name} of ${Unattributed.toFixed(2)} was not allocated to any line and is billed by ${companyName(order.CompanyID)}.`);
        }
        return { Charge: c, ByCompany };
    });

    const adjustmentSplit = adjustments.map((a) => {
        const allocations = a.Allocations.length
            ? a.Allocations
            : a.OrderLineID
              ? [{ OrderLineID: a.OrderLineID, Amount: a.Amount }]
              : [];
        const { ByCompany } = AttributeByLine(a.Amount, allocations, lineCompany, order.CompanyID);
        return { Adjustment: a, ByCompany };
    });

    const paymentSplit = payments.map((p) => {
        const lineLevel = p.Allocations.filter((al) => al.OrderLineID);
        const orderLevel = Money(p.Amount - lineLevel.reduce((s, al) => s + Number(al.Amount), 0));
        const { ByCompany } = AttributeByLine(
            Money(p.Amount - orderLevel),
            lineLevel,
            lineCompany,
            order.CompanyID,
        );
        if (orderLevel !== 0) {
            for (const [id, share] of SpreadAcrossCompanies(orderLevel, grossByCompany)) {
                if (share === 0) continue;
                ByCompany.set(id, Money((ByCompany.get(id) ?? 0) + share));
            }
        }
        return { Payment: p, ByCompany };
    });

    const documents: InvoiceDocument[] = [];

    companyIDs.forEach((companyID, index) => {
        const myLines = lines.filter((l) => l.CompanyID === companyID);
        const listSubtotal = ListSubtotalOf(myLines);
        const discountTotal = DiscountTotalOf(myLines);
        const netTotal = Money(myLines.reduce((s, l) => s + Number(l.LineTotalNet ?? 0), 0));

        // A zero FEE is noise and drops out. A zero TAX row is kept ONLY when this document has no
        // tax to show otherwise: "Sales tax 0.00" tells a customer their exemption was applied, or
        // that this seller has no nexus where the goods went, which is a different statement from a
        // bill that never mentions tax at all.
        //
        // It is dropped once a real tax row exists, because on a split order every jurisdiction's
        // charge appears on BOTH documents and only one of them carries the money — printing the
        // zeroes gives the customer four tax lines, two of them empty, that read as a mistake.
        const attributed = chargeSplit.map(({ Charge, ByCompany }) => ({
            Charge,
            Amount: Money(ByCompany.get(companyID) ?? 0),
        }));
        const hasRealTax = attributed.some((c) => c.Charge.Category === 'Tax' && c.Amount !== 0);
        // And at most ONE of them: an order taxed in three jurisdictions by the other company would
        // otherwise put three empty tax lines on this one.
        const zeroTaxPlaceholder = hasRealTax ? null : attributed.find((c) => c.Charge.Category === 'Tax' && c.Amount === 0);

        const myCharges = attributed
            .filter((entry) => entry.Amount !== 0 || entry === zeroTaxPlaceholder)
            .sort((a, b) => a.Charge.Sequence - b.Charge.Sequence);

        const chargeTotal = Money(myCharges.filter((c) => c.Charge.Category !== 'Tax').reduce((s, c) => s + c.Amount, 0));
        const taxFromCharges = Money(myCharges.filter((c) => c.Charge.Category === 'Tax').reduce((s, c) => s + c.Amount, 0));
        // The lines are the authority for tax — `LineTax` is what the ledger booked. Charge rows of
        // category Tax are how it is BROKEN OUT by jurisdiction; when the two disagree the lines win
        // and the difference prints as an unlabelled tax row rather than silently going missing.
        const taxTotal = Money(myLines.reduce((s, l) => s + Number(l.LineTax ?? 0), 0));

        const gross = Money(myLines.reduce((s, l) => s + Number(l.LineTotalGross ?? 0), 0));

        const myAdjustments = adjustmentSplit
            .map(({ Adjustment, ByCompany }) => ({ Adjustment, Amount: Money(ByCompany.get(companyID) ?? 0) }))
            .filter(({ Amount }) => Amount !== 0);

        const myPayments = paymentSplit
            .map(({ Payment, ByCompany }) => ({ Payment, Amount: Money(ByCompany.get(companyID) ?? 0) }))
            .filter(({ Amount }) => Amount !== 0);

        const amountPaid = Money(myPayments.reduce((s, p) => s + p.Amount, 0));
        const amountDue = Money(gross - amountPaid);

        const ladderCharges = myCharges
            .filter((c) => c.Charge.Category !== 'Tax')
            .map((c) => ({ Label: c.Charge.Name, Note: null as string | null, Amount: c.Amount, IsTax: false }));

        const taxRows = myCharges
            .filter((c) => c.Charge.Category === 'Tax')
            .map((c) => ({
                Label: c.Charge.Name,
                Note: c.Charge.Rate != null ? `${(Number(c.Charge.Rate) * 100).toFixed(3).replace(/0+$/, '').replace(/\.$/, '')}%` : null,
                Amount: c.Amount,
                IsTax: true,
            }));

        const taxResidual = Money(taxTotal - taxFromCharges);
        if (taxResidual !== 0) {
            taxRows.push({ Label: 'Sales tax', Note: null, Amount: taxResidual, IsTax: true });
            if (taxFromCharges !== 0) {
                note(companyID, `Tax rows total ${taxFromCharges.toFixed(2)} but the lines carry ${taxTotal.toFixed(2)}; the difference is shown unattributed.`);
            }
        }

        const ladder = BuildLadder({
            ListSubtotal: listSubtotal,
            Discounts: myAdjustments.map(({ Adjustment, Amount }) => {
                const label = Adjustment.PromotionName ?? Adjustment.Reason ?? 'Discount';
                return {
                    Label: label,
                    // The code is shown BESIDE the promotion's name, not repeated after it. Many
                    // promotions are named after their code, and "SPRING10 (SPRING10)" reads as a
                    // rendering fault rather than as the reference it is meant to be.
                    Note: Adjustment.PromotionCode && Adjustment.PromotionCode !== label ? Adjustment.PromotionCode : null,
                    Amount,
                };
            }),
            DiscountTotal: discountTotal,
            Charges: [...ladderCharges, ...taxRows],
            Gross: gross,
            Payments: myPayments.map(({ Payment, Amount }) => ({
                Label: `Payment ${Payment.PaymentNumber}`,
                Amount,
            })),
            AmountDue: amountDue,
            DueLabel: kind === 'Credit Memo' ? 'Credit due you' : 'Amount due',
        });

        // The one invariant worth stating on the document itself: the ladder must reach the total.
        const laddered = Money(
            listSubtotal -
                discountTotal +
                chargeTotal +
                taxTotal,
        );
        if (laddered !== gross) {
            note(
                companyID,
                `Ladder reaches ${laddered.toFixed(2)} but the lines total ${gross.toFixed(2)} — this document does not add up.`,
            );
        }

        documents.push({
            Kind: kind,
            DocumentNumber: DocumentNumber(order.OrderNumber, index, companyIDs.length),
            OrderNumber: order.OrderNumber,
            OrderHeaderID: order.ID,
            OrderDate: String(order.OrderDate).slice(0, 10),
            DueDate: dueDate,
            DaysUntilDue: dueDate && amountDue > 0 ? DaysBetween(input.AsOf, dueDate) : null,
            Status: order.Status,
            PaymentStatusLabel: PaymentStatusLabel(gross, amountPaid),

            CompanyID: companyID,
            CompanyName: companyName(companyID),
            Issuer: input.Issuers?.get(companyID) ?? {
                CompanyID: companyID,
                Name: companyName(companyID),
                AddressLines: [],
                Email: null,
                Phone: null,
                Website: null,
                TaxID: null,
                CurrencyCode: null,
            },

            BillTo: input.BillTo,
            ShipTo: input.ShipTo,

            TermsLabel: terms,
            ExternalDocumentNumber: order.ExternalDocumentNumber,
            ReversesOrderNumber: order.ReversesOrderNumber,
            ReversalReason: order.ReversalReason,
            Description: order.Description,

            Rows: BuildRows(myLines),
            Ladder: ladder,

            ListSubtotal: listSubtotal,
            DiscountTotal: discountTotal,
            NetTotal: netTotal,
            ChargeTotal: chargeTotal,
            TaxTotal: taxTotal,
            Gross: gross,
            AmountPaid: amountPaid,
            AmountDue: amountDue,

            Payments: myPayments.map(({ Payment, Amount }) => ({
                PaymentNumber: Payment.PaymentNumber,
                PaymentDate: String(Payment.PaymentDate).slice(0, 10),
                TypeName: Payment.PaymentTypeName,
                Amount,
            })),

            Notes: notesByCompany.get(companyID) ?? [],
        });
    });

    return input.OnlyCompanyID ? documents.filter((d) => d.CompanyID === input.OnlyCompanyID) : documents;
}
