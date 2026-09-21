/**
 * @fileoverview Pure decisions for money that arrives on an external rail (Bill.com), read by
 * `Orders.PollExternalPayments`. No I/O, no entities — every rule here is a table or a function of
 * its arguments, so it can be tested exhaustively and read by a finance reviewer.
 *
 * THREE RULES THAT ARE DELIBERATE:
 *
 *   UNKNOWN STATUS HOLDS. Bill.com's `receivable-payments.status` vocabulary is not in the
 *   connector's catalog; the table below is what the sandbox showed (spike S2) plus the obvious
 *   spellings. A status not in the table is HELD and surfaced, never read as cleared — a payment
 *   recorded on a guess is a ledger entry for money that may not exist.
 *
 *   ALL-OR-NOTHING FAN-OUT. One Bill.com payment can settle many invoices. If any of them is not one
 *   we issued, the WHOLE payment is Unmatched and nothing is captured — a partial capture would
 *   misstate the payment and hide the unmatched remainder behind a plausible-looking record.
 *
 *   MATCHING IS BY INVOICE ID ONLY. Never by amount, never by `OrderHeader.ExternalDocumentNumber`
 *   (free-form, hand-editable, not unique — golive #146/#148).
 *
 * @module @mj-biz-apps/orders-entities
 */

export type ExternalPaymentDisposition = 'Captured' | 'Held' | 'Unmatched' | 'Refused' | 'Ignored' | 'ReversalNeeded';

export type RailPaymentClass = 'Cleared' | 'Pending' | 'Reversed';

/**
 * Bill.com `receivable-payments.status` → what it means for cash. Keys are upper-cased. PROVISIONAL
 * until spike S2 has been run against the sandbox with a pending and a cleared payment; add what it
 * shows here and nowhere else.
 */
export const BILLCOM_PAYMENT_STATUS: Readonly<Record<string, RailPaymentClass>> = Object.freeze({
    PAID: 'Cleared',
    CLEARED: 'Cleared',
    SETTLED: 'Cleared',
    COMPLETED: 'Cleared',
    SCHEDULED: 'Pending',
    PROCESSING: 'Pending',
    PENDING: 'Pending',
    IN_PROCESS: 'Pending',
    VOID: 'Reversed',
    VOIDED: 'Reversed',
    CANCELED: 'Reversed',
    CANCELLED: 'Reversed',
    FAILED: 'Reversed',
    RETURNED: 'Reversed',
});

export function ClassifyPaymentStatus(status: string | null | undefined): RailPaymentClass | 'Unknown' {
    if (!status) return 'Unknown';
    return BILLCOM_PAYMENT_STATUS[status.trim().toUpperCase()] ?? 'Unknown';
}

export interface PaymentSeen {
    ExternalPaymentRef: string;
    Status: string | null;
    /** What the last pass did with this payment, or null when it has never been seen. */
    PriorDisposition: ExternalPaymentDisposition | null;
}

export type ExternalPaymentAction = 'Capture' | 'Hold' | 'Ignore' | 'ReversalNeeded';

export function DecideExternalPayment(p: PaymentSeen): { Action: ExternalPaymentAction; Reason: string } {
    const cls = ClassifyPaymentStatus(p.Status);
    const ref = p.ExternalPaymentRef;

    if (p.PriorDisposition === 'Captured') {
        if (cls === 'Reversed') {
            return { Action: 'ReversalNeeded', Reason: `${ref} was captured and Bill.com now reports it '${p.Status}'. The cash has to be reversed (bank-return path, O-US13); nothing is changed automatically.` };
        }
        return { Action: 'Ignore', Reason: `${ref} is already captured.` };
    }
    if (p.PriorDisposition === 'ReversalNeeded') {
        return { Action: 'Ignore', Reason: `${ref} is already flagged for reversal.` };
    }
    if (p.PriorDisposition === 'Ignored') {
        // Terminal by a person's hand (an Unmatched or Refused row set to Ignored), or a reversal that
        // was never captured. Either way, nothing here re-opens it — a status flip on the rail cannot
        // make pre-cutover AR ours.
        return { Action: 'Ignore', Reason: `${ref} was set aside (Ignored); nothing is captured for it.` };
    }
    switch (cls) {
        case 'Cleared':
            return { Action: 'Capture', Reason: `${ref} is '${p.Status}': cleared and not yet captured.` };
        case 'Pending':
            return { Action: 'Hold', Reason: `${ref} is '${p.Status}': promised, not yet banked. Held until Bill.com reports it cleared.` };
        case 'Reversed':
            return { Action: 'Ignore', Reason: `${ref} is '${p.Status}' and was never captured; there is nothing to reverse.` };
        default:
            return {
                Action: 'Hold',
                Reason: `${ref} has an unknown Bill.com status '${p.Status ?? '(none)'}'. Held rather than guessed — add the status to BILLCOM_PAYMENT_STATUS once its meaning is confirmed.`,
            };
    }
}

/** What the poller needs to know about the unit behind one of our external invoices. */
export interface UnitRef {
    OrderHeaderID: string;
    CompanyID: string;
    OrderHeaderPaymentScheduleID: string | null;
    BillToOrganizationID: string | null;
    BillToPersonID: string | null;
}

export interface InvoiceAllocation {
    OrderHeaderID: string;
    Amount: number;
    OrderHeaderPaymentScheduleID: string | null;
}

export type AllocationOutcome =
    | { OK: true; Allocations: InvoiceAllocation[]; Payer: { BillToOrganizationID: string | null; BillToPersonID: string | null }; CompanyID: string; Total: number }
    | { OK: false; Unmatched: string[]; Reason: string };

const money = (n: number): number => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

/**
 * Turn Bill.com's `invoicePayments[]` into `Orders.CapturePayment` allocations, or explain why not.
 * The lookup answers "which unit did we issue this invoice for" from `ExternalInvoice`.
 */
export function AllocateInvoicePayments(
    invoicePayments: ReadonlyArray<{ ExternalInvoiceRef: string; Amount: number }>,
    lookup: (externalInvoiceRef: string) => UnitRef | undefined,
): AllocationOutcome {
    if (!invoicePayments.length) {
        return { OK: false, Unmatched: [], Reason: 'The payment is applied to no invoice on Bill.com; there is no order to apply it to here.' };
    }
    const unmatched: string[] = [];
    const allocations: InvoiceAllocation[] = [];
    const companies = new Set<string>();
    let payer: { BillToOrganizationID: string | null; BillToPersonID: string | null } | null = null;
    for (const ip of invoicePayments) {
        const unit = lookup(ip.ExternalInvoiceRef);
        if (!unit) {
            unmatched.push(ip.ExternalInvoiceRef);
            continue;
        }
        const amount = money(ip.Amount);
        if (!(amount > 0)) {
            return { OK: false, Unmatched: [], Reason: `Invoice ${ip.ExternalInvoiceRef} carries a non-positive share (${ip.Amount}); refusing to allocate it.` };
        }
        allocations.push({ OrderHeaderID: unit.OrderHeaderID, Amount: amount, OrderHeaderPaymentScheduleID: unit.OrderHeaderPaymentScheduleID });
        companies.add(unit.CompanyID.toLowerCase());
        // Orders may carry BOTH a bill-to organisation and a person (no XOR on OrderHeader); the
        // capture needs exactly one payer, and the organisation is the customer (D65).
        payer ??= unit.BillToOrganizationID
            ? { BillToOrganizationID: unit.BillToOrganizationID, BillToPersonID: null }
            : { BillToOrganizationID: null, BillToPersonID: unit.BillToPersonID };
    }
    if (unmatched.length) {
        return {
            OK: false,
            Unmatched: unmatched,
            Reason: `Bill.com invoice(s) ${unmatched.join(', ')} were not issued by Orders (pre-cutover AR, or created directly in Bill.com). Nothing captured: a partial capture would misstate the payment.`,
        };
    }
    if (companies.size > 1) {
        return { OK: false, Unmatched: [], Reason: `The payment settles invoices for ${companies.size} receiving companies; one payment must land in one company's books.` };
    }
    const total = money(allocations.reduce((s, a) => s + a.Amount, 0));
    return { OK: true, Allocations: allocations, Payer: payer!, CompanyID: allocations.length ? lookup(invoicePayments[0].ExternalInvoiceRef)!.CompanyID : '', Total: total };
}

/** `PaymentHeader.IdempotencyKey` for a rail payment — the D19 guard, enforced by UX_PaymentHeader_IdempotencyKey. */
export function ExternalPaymentIdempotencyKey(typeCode: string, externalPaymentRef: string): string {
    return `${typeCode.toLowerCase()}:${externalPaymentRef}`;
}

/** Tender code for `Orders.CapturePayment`. Money BILL moved itself is ACH; money recorded in BILL follows its type. */
export function TenderFor(p: { OnlinePayment: boolean | null; ReceivablesType: string | null }): 'ACH' | 'Check' | 'CreditCard' | 'Wire' {
    if (p.OnlinePayment === true) return 'ACH';
    const t = (p.ReceivablesType ?? '').toUpperCase();
    if (t.includes('CHECK') || t.includes('CHEQUE')) return 'Check';
    if (t.includes('CARD')) return 'CreditCard';
    if (t.includes('WIRE')) return 'Wire';
    return 'ACH';
}
