/**
 * @fileoverview Pure decisions for sending one billing unit to an external rail (Bill.com).
 *
 * A BILLING UNIT is what one rail invoice represents: `(order, selling company, instalment | none)`.
 * An order without a payment schedule has one unit per selling company and it becomes invoiceable at
 * Confirmed; an order with a schedule has one unit per row and it becomes invoiceable when
 * `Orders.IssueInstalmentInvoice` has frozen the row's number (design §4.1, golive #242).
 *
 * Nothing here does I/O. `Orders.IssueExternalInvoice` reads the order, the document and the
 * existing external-invoice row, then asks these functions what to do — so the rules are testable
 * without a database and readable by the finance people who own them.
 *
 * WHY THE PAYLOAD TIES OR REFUSES. Bill.com computes the invoice total from its lines. If our lines
 * did not sum to the unit's amount, the customer would hold a document for a different figure than
 * our receivable — the failure `InvoiceBehavior` already names: an invoice that adds up perfectly
 * and undercharges the customer. So the tie is checked here, before any network call.
 *
 * @module @mj-biz-apps/orders-core-entities-server
 */
import type { InvoiceDocument, InvoiceRow } from './InvoiceBehavior.js';
import { BILLCOM_TRANSIENT } from './BillComInvoiceRail.js';

export type ExternalInvoiceStatus = 'Sending' | 'Sent' | 'Canceled' | 'Failed';

/** The key of a billing unit. `OrderHeaderPaymentScheduleID` is null for a schedule-less unit. */
export interface BillingUnitKey {
    OrderHeaderID: string;
    CompanyID: string;
    OrderHeaderPaymentScheduleID: string | null;
}

/**
 * The instalment-shaped facts of one unit. Structurally the same as PR #220's `InvoiceInstalmentFacts`
 * so that object can be passed straight in once it exists; for a schedule-less unit the caller builds
 * one from the document (`InstallmentCount: 1`, `DocumentNumber: null`).
 */
export interface ExternalInvoiceUnitFacts {
    CompanyID: string;
    /** 1-based within the order and company. */
    InstallmentNumber: number;
    /** One means "the whole order for this company". */
    InstallmentCount: number;
    DueDate: string | null;
    Amount: number;
    /** Frozen by `Orders.IssueInstalmentInvoice`; null for a schedule-less unit, whose number is the document's. */
    DocumentNumber: string | null;
}

export interface ExternalInvoiceLine {
    Description: string;
    Quantity: number;
    UnitPrice: number;
}

export interface ExternalInvoicePayload {
    DocumentNumber: string;
    InvoiceDate: string;
    DueDate: string | null;
    Amount: number;
    Lines: ExternalInvoiceLine[];
    Memo: string | null;
}

export const money = (n: number): number => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

const TIE_TOLERANCE = 0.005;

/**
 * One document + one unit → the lines the rail sends.
 *
 * SCHEDULE-LESS: one line per printed row (a rollup parent prints its children's total, so the
 * children are skipped), then `Charges` and `Tax` as their own lines when non-zero. The row's
 * `Amount` is already net of discount, so `UnitPrice = Amount / Quantity`; when that does not
 * multiply back to the cent the row collapses to one unit at the row amount, with the quantity in
 * the description — the customer sees the right money either way.
 *
 * INSTALMENT: one line, for the instalment amount, under the frozen number. The full order value and
 * the "2 of 4" ladder are on OUR document; the rail's invoice is the amount now due.
 */
export function BuildExternalInvoicePayload(
    doc: InvoiceDocument,
    unit: ExternalInvoiceUnitFacts,
    invoiceDate: string,
    /**
     * Money captured against THIS unit, from `PaidOnBillingUnit`. Pass it: `doc.AmountPaid` is a
     * pro-rata spread across the order's selling companies, which on a split order credited one
     * company's payment to another and refused that other company's invoice as part-paid forever.
     * Omitted only by tests that construct a document directly.
     */
    paidOnUnit?: number,
): { OK: true; Payload: ExternalInvoicePayload } | { OK: false; Reason: string } {
    if (doc.Kind !== 'Invoice') {
        return { OK: false, Reason: `${doc.DocumentNumber} is a ${doc.Kind.toLowerCase()}, not an invoice, and cannot be sent to the rail.` };
    }
    const amount = money(unit.Amount);
    if (!(amount > 0)) {
        return { OK: false, Reason: `${doc.DocumentNumber} has nothing owed (${amount}); there is no invoice to send.` };
    }

    if (unit.InstallmentCount > 1) {
        if (!unit.DocumentNumber) {
            return {
                OK: false,
                Reason: `Instalment ${unit.InstallmentNumber} of ${unit.InstallmentCount} on ${doc.OrderNumber} has no frozen document number; issue it (Orders.IssueInstalmentInvoice) before sending it to the rail.`,
            };
        }
        return {
            OK: true,
            Payload: {
                DocumentNumber: unit.DocumentNumber,
                InvoiceDate: invoiceDate,
                DueDate: unit.DueDate,
                Amount: amount,
                Lines: [{ Description: `Instalment ${unit.InstallmentNumber} of ${unit.InstallmentCount} — order ${doc.OrderNumber}`, Quantity: 1, UnitPrice: amount }],
                Memo: doc.Description,
            },
        };
    }

    // An order billed as a whole is sent for its GROSS, so money already applied to it would be
    // billed twice — a checkout deposit, an early check. Bill.com has no "payment received" line we
    // can trust to net it, so this unit is refused and a person decides (design §5.1, review finding 6).
    const applied = money(paidOnUnit ?? doc.AmountPaid);
    if (applied > TIE_TOLERANCE) {
        return {
            OK: false,
            Reason: `${doc.DocumentNumber} already has ${applied.toFixed(2)} applied; sending the full ${amount.toFixed(2)} to the rail would bill the customer twice. Record the balance by hand or issue a schedule.`,
        };
    }
    const lines: ExternalInvoiceLine[] = [];
    for (const row of doc.Rows) lines.push(...rowLines(row));
    if (money(doc.ChargeTotal) !== 0) lines.push({ Description: 'Charges', Quantity: 1, UnitPrice: money(doc.ChargeTotal) });
    if (money(doc.TaxTotal) !== 0) lines.push({ Description: 'Tax', Quantity: 1, UnitPrice: money(doc.TaxTotal) });

    // ROUND EACH LINE, THEN SUM — the order every invoice system totals in, ours and the rail's.
    // Summing raw products instead drifts: `rowLines` derives a unit price from an already-rounded
    // line amount, so a fractional quantity leaves a sub-cent tail on every line. Three lines of
    // 2.5 × 13.33 summed raw give 99.98 against a unit amount of 99.99, and since both sides are
    // cent-quantised the 0.005 tolerance is exact equality — a correctly priced order was refused
    // and parked as Failed for good.
    const total = money(lines.reduce((s, l) => s + money(l.Quantity * l.UnitPrice), 0));
    if (Math.abs(total - amount) > TIE_TOLERANCE) {
        return {
            OK: false,
            Reason: `${doc.DocumentNumber} lines total ${total.toFixed(2)}, which does not tie to the unit amount ${amount.toFixed(2)}. Refusing rather than sending a customer an invoice for the wrong figure.`,
        };
    }
    return {
        OK: true,
        Payload: {
            DocumentNumber: unit.DocumentNumber ?? doc.DocumentNumber,
            InvoiceDate: invoiceDate,
            DueDate: unit.DueDate ?? doc.DueDate,
            Amount: amount,
            Lines: lines,
            Memo: doc.Description,
        },
    };
}

function rowLines(row: InvoiceRow): ExternalInvoiceLine[] {
    // A child whose amount is printed on its parent carries no money of its own.
    if (row.IncludedInParent) return [];
    const amount = money(row.Amount);
    if (amount === 0) return [];
    const name = row.Description ? `${row.ProductName} — ${row.Description}` : row.ProductName;
    const qty = Number(row.Quantity) || 1;
    const unit = money(amount / qty);
    if (qty > 0 && Math.abs(money(unit * qty) - amount) <= TIE_TOLERANCE) {
        return [{ Description: name, Quantity: qty, UnitPrice: unit }];
    }
    return [{ Description: `${name} (×${qty})`, Quantity: 1, UnitPrice: amount }];
}

export type InvoiceableCode =
    | 'OK'
    | 'ALREADY_SENT'
    | 'IN_FLIGHT'
    | 'HAS_HISTORY'
    | 'NOT_CONFIRMED'
    | 'NAME_THE_INSTALMENT'
    | 'INSTALMENT_NOT_INVOICED';

export interface InvoiceableDecision {
    Verdict: 'Issue' | 'AlreadySent' | 'Refuse';
    Code: InvoiceableCode;
    Reason: string;
}

/**
 * May this unit be sent now? History first (a `Sent` row answers regardless of anything else), then
 * the order, then the schedule rules.
 */
export function DecideInvoiceable(i: {
    OrderStatus: string;
    HasSchedule: boolean;
    ScheduleRowStatus: string | null;
    ScheduleRowNamed: boolean;
    ExistingStatus: ExternalInvoiceStatus | null;
    AllowReissue: boolean;
}): InvoiceableDecision {
    switch (i.ExistingStatus) {
        case 'Sent':
            return { Verdict: 'AlreadySent', Code: 'ALREADY_SENT', Reason: 'This unit already has a live invoice on the rail.' };
        case 'Sending':
            // A claim is kept when a send could not be confirmed (a timeout, a dropped socket), so this
            // state also means "the rail may or may not hold an invoice for this unit". Automatic retry
            // must never resolve that — it is how the customer gets two invoices — but a person who has
            // looked in Bill.com must be able to, and `AllowReissue` is how they say so.
            if (!i.AllowReissue) {
                return {
                    Verdict: 'Refuse',
                    Code: 'IN_FLIGHT',
                    Reason:
                        'A send for this unit is in flight, or was interrupted before the rail confirmed it. Check the rail: if the ' +
                        'invoice is there, record its reference against this unit; if it is not, send again with AllowReissue.',
                };
            }
            break;
        case 'Canceled':
        case 'Failed':
            if (!i.AllowReissue) {
                return {
                    Verdict: 'Refuse',
                    Code: 'HAS_HISTORY',
                    Reason: `This unit was previously ${i.ExistingStatus.toLowerCase()} on the rail. Re-issuing is a deliberate act: send again with AllowReissue.`,
                };
            }
            break;
        default:
            break;
    }
    if (i.OrderStatus !== 'Confirmed') {
        return { Verdict: 'Refuse', Code: 'NOT_CONFIRMED', Reason: `The order is ${i.OrderStatus}; only a Confirmed order has a receivable to invoice.` };
    }
    if (i.HasSchedule && !i.ScheduleRowNamed) {
        return {
            Verdict: 'Refuse',
            Code: 'NAME_THE_INSTALMENT',
            Reason: 'This order is billed in instalments; issue the instalment from the Billing worklist, which names the schedule row.',
        };
    }
    if (i.ScheduleRowNamed && i.ScheduleRowStatus !== 'Invoiced') {
        return {
            Verdict: 'Refuse',
            Code: 'INSTALMENT_NOT_INVOICED',
            Reason: `The instalment is ${i.ScheduleRowStatus ?? 'unknown'}; it must be Invoiced (its number frozen) before it can be sent to the rail.`,
        };
    }
    return { Verdict: 'Issue', Code: 'OK', Reason: 'the unit is invoiceable and unsent' };
}

export type CancelCode = 'OK' | 'NOT_SENT' | 'HAS_PAYMENT' | 'PAYMENT_PENDING_ON_RAIL';

/**
 * May this rail invoice be withdrawn? Blocked, not warned, when money has been applied: a paid
 * invoice follows the refund path (O-US5), not this one (golive #147).
 */
export function DecideCancel(i: {
    Status: ExternalInvoiceStatus;
    PaidAmountOnUnit: number;
    /** The rail's view, when it could be read; null when it could not. */
    ExternalDueAmount: number | null;
    ExternalTotal: number | null;
}): { OK: boolean; Code: CancelCode; Reason: string } {
    if (i.Status !== 'Sent') {
        return { OK: false, Code: 'NOT_SENT', Reason: `Only a Sent invoice can be cancelled; this one is ${i.Status}.` };
    }
    if (money(i.PaidAmountOnUnit) > 0) {
        return {
            OK: false,
            Code: 'HAS_PAYMENT',
            Reason: `${money(i.PaidAmountOnUnit).toFixed(2)} has been applied against this unit. A paid or part-paid invoice is reversed through the refund path, not cancelled.`,
        };
    }
    if (i.ExternalDueAmount !== null && i.ExternalTotal !== null && money(i.ExternalDueAmount) < money(i.ExternalTotal)) {
        return {
            OK: false,
            Code: 'PAYMENT_PENDING_ON_RAIL',
            Reason: `The rail shows ${money(i.ExternalTotal - i.ExternalDueAmount).toFixed(2)} applied or scheduled against this invoice that has not been polled yet. Run the payment poll, then decide.`,
        };
    }
    return { OK: true, Code: 'OK', Reason: 'nothing has been paid against this invoice' };
}

/** Whether the sweep should try a failed send again. Same vocabulary as the rail's `Transient`. */
export function ClassifyIssueFailure(reason: string | null | undefined): 'Transient' | 'Permanent' {
    if (!reason) return 'Permanent';
    // A refusal this module wrote is a fact about the unit, whatever numbers it happens to contain.
    if (PERMANENT_REFUSAL.test(reason)) return 'Permanent';
    return BILLCOM_TRANSIENT.test(reason) ? 'Transient' : 'Permanent';
}

/** The reasons `BuildExternalInvoicePayload` and the rail emit for facts about the unit itself. */
const PERMANENT_REFUSAL = /does not tie|already has .* applied|has nothing owed|not an invoice|no frozen document number|requires a customer email|no bill-to party/i;
