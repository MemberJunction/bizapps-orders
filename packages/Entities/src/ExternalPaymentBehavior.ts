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

export type ExternalPaymentDisposition = 'Captured' | 'Held' | 'Unmatched' | 'Refused' | 'Ignored' | 'Reapplied' | 'ReversalNeeded';

export type RailPaymentClass = 'Cleared' | 'Pending' | 'Reversed';

/**
 * Bill.com `receivable-payments.status` → what it means for cash. Keys are upper-cased.
 *
 * THIS IS THE WHOLE ENUM, not a guess: BILL documents exactly six values for
 * `ReceivablePaymentResponseDto.status`, and `PAID` on an offline check was confirmed live in the
 * sandbox on 2026-09-22 (spike S2). An earlier provisional table carried `CLEARED`, `PROCESSING`,
 * `PENDING`, `VOIDED`, `CANCELLED`, `SETTLED`, `COMPLETED`, `IN_PROCESS`, `FAILED` and `RETURNED` —
 * none of which BILL can emit. They are gone rather than kept "just in case", because a key that
 * cannot occur is a claim about the vendor that no one can check.
 *
 * `UNDEFINED` is deliberately absent so it falls to `Unknown` → Hold: BILL saying it does not know
 * is not a reason for us to decide.
 *
 * `ESCHEATED` means the funds went unclaimed and were remitted to the state. The money is not coming,
 * so it classes with the reversals: never captured, and if we already captured it, surfaced as
 * `ReversalNeeded` for a person.
 */
export const BILLCOM_PAYMENT_STATUS: Readonly<Record<string, RailPaymentClass>> = Object.freeze({
    PAID: 'Cleared',
    SCHEDULED: 'Pending',
    VOID: 'Reversed',
    CANCELED: 'Reversed',
    ESCHEATED: 'Reversed',
});

export function ClassifyPaymentStatus(status: string | null | undefined): RailPaymentClass | 'Unknown' {
    if (!status) return 'Unknown';
    return BILLCOM_PAYMENT_STATUS[status.trim().toUpperCase()] ?? 'Unknown';
}

export interface PaymentSeen {
    ExternalPaymentRef: string;
    Status: string | null;
    /**
     * True when the rail's current `invoicePayments[]` no longer match the payment lines we hold for
     * this payment; false when they do. Computed by the caller, which needs the ledger.
     *
     * `undefined` means COULD NOT TELL — not checked, or the read behind the comparison failed. It is
     * deliberately distinct from `false`: on a payment already flagged `Reapplied`, treating "could not
     * tell" as "no difference" would retire a live exception on one bad database read, with the wrong
     * allocation still in place.
     */
    ApplicationsChanged?: boolean;
    /** What the last pass did with this payment, or null when it has never been seen. */
    PriorDisposition: ExternalPaymentDisposition | null;
}

export type ExternalPaymentAction = 'Capture' | 'Hold' | 'Ignore' | 'Reapplied' | 'ReversalNeeded';

export interface ExternalPaymentDecision {
    Action: ExternalPaymentAction;
    Reason: string;
    /**
     * What the `ExternalPayment` row should now READ AS, when that differs from keeping what it says.
     *
     * `Action` is what to do; this is what to store, and the two part company in exactly one place: a
     * payment flagged `Reapplied` whose allocation has since been corrected needs no action but must
     * stop reading as an exception. Without it the poller's `Ignore` branch wrote the prior
     * disposition straight back, so the row sat on the queue page for ever, labelled an exception with
     * a reason saying there was nothing wrong.
     */
    Disposition?: ExternalPaymentDisposition;
    /**
     * True when this answer rests on a comparison that could not be made, so the reason already on the
     * row — which described a difference somebody can act on — is worth more than this one.
     */
    KeepPriorReason?: boolean;
}

export function DecideExternalPayment(p: PaymentSeen): ExternalPaymentDecision {
    const cls = ClassifyPaymentStatus(p.Status);
    const ref = p.ExternalPaymentRef;

    // A CAPTURED PAYMENT AND A RE-APPLIED ONE ARE THE SAME QUESTION, asked a poll apart. Both have
    // cash recorded against them, so both are re-examined the same way — and `Reapplied` is NOT a
    // terminal disposition (it is deliberately absent from the poller's FINAL set, so every pass
    // re-decides it). Falling through to the status switch, as this used to, answered `Capture` for a
    // cleared payment: the capture returned `WasRetry` on the idempotency key, the poller wrote
    // `Captured` back over the row, and the exception a person was supposed to act on vanished an
    // hour after it was raised — leaving the wrong allocation in place with nothing flagging it.
    if (p.PriorDisposition === 'Captured' || p.PriorDisposition === 'Reapplied') {
        if (cls === 'Reversed') {
            return { Action: 'ReversalNeeded', Reason: `${ref} was captured and Bill.com now reports it '${p.Status}'. The cash has to be reversed (bank-return path, O-US13); nothing is changed automatically.` };
        }
        // THE RAIL CAN MOVE MONEY WE ALREADY RECORDED. Bill.com lets Finance re-apply a receipt:
        // 700.00 recorded against invoice A last week becomes 300.00 on A and 400.00 on B today, or
        // moves to invoice C entirely. The payment is unchanged in total, so nothing here is wrong —
        // but our PaymentLines now point at the wrong invoices, Orders shows B open while Bill.com
        // shows it paid, and no amount of re-polling notices because the payment is "already
        // captured". Reported for a person rather than silently ignored, the same posture a void
        // after capture takes.
        const alreadyFlagged = p.PriorDisposition === 'Reapplied';
        if (p.ApplicationsChanged === true) {
            return {
                Action: 'Reapplied',
                Reason: alreadyFlagged
                    ? `${ref} is still applied differently on Bill.com from the payment lines held here; the allocation has not been corrected.`
                    : `${ref} was captured, and Bill.com has since applied it to different invoices. The cash is right; the allocation here is not. Re-allocate it by hand — nothing is changed automatically.`,
            };
        }
        // COULD NOT TELL is not ALL CLEAR. `undefined` means the comparison was not made, or the read
        // behind it failed. On a row already flagged that must hold the flag AND the words on it: they
        // describe a real difference somebody can act on, and one bad database read must not retire it.
        // A merely captured row is unaffected — there is nothing to hold.
        if (alreadyFlagged && p.ApplicationsChanged === undefined) {
            return {
                Action: 'Reapplied',
                Reason: `${ref} is flagged re-applied and the applications could not be compared on this pass; the flag stands until they can be.`,
                KeepPriorReason: true,
            };
        }
        // THE EXCEPTION CLEARS ITSELF once the allocation matches again, so a person who re-allocates
        // by hand does not also have to come back and retire the flag. Storing `Captured` is the point:
        // leaving `Reapplied` on the row kept it on the queue page for ever, labelled an exception,
        // under a reason saying there was nothing wrong.
        if (alreadyFlagged) {
            return {
                Action: 'Ignore',
                Disposition: 'Captured',
                Reason: `${ref} was re-applied on Bill.com and the allocation here now matches again; the exception is cleared.`,
            };
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

/**
 * Bill.com `receivablesType` → an Orders `PaymentType.Code`, for `Orders.CapturePayment`.
 *
 * `receivablesType` is the authoritative signal and is read FIRST. An earlier version short-circuited
 * on `OnlinePayment === true` and answered ACH, which would have booked an online card payment to the
 * bank: BILL reports the method on online payments too. `OnlinePayment` now only breaks the tie when
 * BILL reports no type at all, where "BILL moved it" is the one thing we do know.
 *
 * The keys are BILL's whole documented enum. Note what is NOT in it: there is no `WIRE`. `CASH` maps
 * to Orders' own `Cash` type, which the old default silently booked as ACH.
 *
 * `OTHER` MEANS WIRE, BY AGREEMENT — not by inference. Wires do arrive (money landing directly in the
 * bank is marked paid in Bill.com by hand), and BILL has no wire type, so whoever marks the invoice
 * must pick something from the enum. Jeremy settled this on PR #235 on 2026-09-25, choosing the
 * convention the spec offered as option A (§13 A): Finance selects `Other` when marking a wire paid,
 * and `OTHER` maps to Orders' `Wire`. It is safe to spend `OTHER` this way precisely because Finance
 * confirmed AIDP uses no PayPal, wallet or other tender, so nothing else can legitimately claim it.
 *
 * The convention is deliberately NOT a marker read out of the description or reference number: that
 * would depend on consistent typing by a person, which is exactly what this kind of rule must not do.
 *
 * `PAYPAL`, `WALLET` and `UNDEFINED` are left falling to ACH. Finance says they cannot occur, so this
 * is unreachable rather than a guess — but if one ever did arrive it would book to the bank silently,
 * which is the same shape of defect the rest of this table exists to remove. Worth revisiting the day
 * the residue stops being hypothetical; it is not worth inventing a refusal path for today.
 */
const BILLCOM_TENDER: Readonly<Record<string, OrdersTenderCode>> = Object.freeze({
    CASH: 'Cash',
    CHECK: 'Check',
    CREDIT_CARD: 'CreditCard',
    VIRTUAL_CARD: 'CreditCard',
    ACH: 'ACH',
    // By agreement, not by inference — see above.
    OTHER: 'Wire',
});

/** The `PaymentType.Code` values this rail can produce. All seeded and active in `metadata/payment-types`. */
export type OrdersTenderCode = 'ACH' | 'Cash' | 'Check' | 'CreditCard' | 'Wire';

export function TenderFor(p: { OnlinePayment: boolean | null; ReceivablesType: string | null }): OrdersTenderCode {
    const mapped = BILLCOM_TENDER[(p.ReceivablesType ?? '').trim().toUpperCase()];
    if (mapped) return mapped;
    return 'ACH';
}
