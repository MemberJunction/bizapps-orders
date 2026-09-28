/**
 * @fileoverview What the external-invoicing screens decide, as pure functions.
 *
 * These live apart from the components for the usual reason in this package — a rule that can be
 * tested without a rendering environment is a rule that gets tested — but also because ONE of them
 * costs money when it is wrong. `CanSend` decides whether a person is offered a button that puts an
 * invoice in front of a customer. Offering it against a unit already live on the rail, or one whose
 * last send was never confirmed, is how a single billing unit becomes two invoices in somebody's
 * inbox (design §13.9, and the defect that reached the sandbox).
 *
 * NOTHING HERE NAMES A VENDOR. The rail is a seam with one implementation today; the provider's own
 * `Name` is what the screens display.
 *
 * @module @mj-biz-apps/orders-ng
 */

/** The lifecycle of one `ExternalInvoice` row. */
export type ExternalInvoiceState = 'Sending' | 'Sent' | 'Canceled' | 'Failed';

/** The shape the screens read; the real entity carries more. */
export interface ExternalInvoiceLike {
    Status: ExternalInvoiceState;
    ExternalStatus?: string | null;
}

/** What the poller left for a person. `Captured` and `Ignored` are finished and never appear. */
export type PaymentExceptionDisposition = 'Held' | 'Unmatched' | 'Refused' | 'Reapplied' | 'ReversalNeeded';

/**
 * Whether a person may send this order to the rail now.
 *
 * `Sending` blocks exactly as `Sent` does. It means the last attempt was never confirmed, so the rail
 * may or may not already hold the invoice; resolving that is a person's job with the rail open, not a
 * button's. `Failed` and `Canceled` do not block, because re-issuing after those is the deliberate act
 * the operation already asks to be told about.
 */
export function CanSend(orderStatus: string | null | undefined, rows: readonly ExternalInvoiceLike[], hasRail: boolean): boolean {
    if (!hasRail || orderStatus !== 'Confirmed') return false;
    return !rows.some((r) => r.Status === 'Sent' || r.Status === 'Sending');
}

/**
 * Whether the selected row is a send that was never confirmed, and so needs a person to resolve it.
 *
 * A `Sending` row is the one state with no automatic way out: the sweep skips it, `CanSend` refuses
 * it, and cancel refuses anything that is not `Sent`. Until this returned true the only exit was
 * editing the row by hand in Explorer — which the row's own message nonetheless told people to do.
 *
 * The two answers are the rail's, not ours: the rail HOLDS the invoice (record its reference) or it
 * does not (re-issue, superseding the claim). Both are offered together on purpose, because choosing
 * between them means looking at the rail.
 */
export function CanResolveInFlight(selected: ExternalInvoiceLike | null | undefined, hasRail: boolean): boolean {
    return hasRail && selected?.Status === 'Sending';
}

/** Only a live invoice can be withdrawn. A cancel posts nothing; a paid invoice is a refund instead. */
export function CanCancel(selected: ExternalInvoiceLike | null | undefined, hasRail: boolean): boolean {
    return hasRail && selected?.Status === 'Sent';
}

/** How a row reads. The rail's own status rides along with `Sent`, because that is what differs. */
export function StateLabel(row: ExternalInvoiceLike): string {
    switch (row.Status) {
        case 'Sent':
            return row.ExternalStatus ? `Sent · ${row.ExternalStatus}` : 'Sent';
        case 'Sending':
            return 'In flight';
        case 'Canceled':
            return 'Cancelled';
        default:
            return 'Failed';
    }
}

/** Chip styling for a row's state. */
export function StateChipClass(row: ExternalInvoiceLike): string {
    switch (row.Status) {
        case 'Sent':
            return 'mj-chip--success';
        case 'Sending':
            return 'mj-chip--info';
        case 'Failed':
            return 'mj-chip--danger';
        default:
            return 'mj-chip--outline';
    }
}

/**
 * Why a payment is waiting, in words a person can act on.
 *
 * The stored dispositions are engineering vocabulary. "Unmatched" in particular reads like a fault in
 * the payment when it means the opposite: the money is fine, we simply never issued that invoice.
 */
export function DispositionLabel(d: PaymentExceptionDisposition): string {
    switch (d) {
        case 'Held':
            return 'Status unclear';
        case 'Unmatched':
            return 'No invoice here';
        case 'Refused':
            return 'Capture refused';
        case 'Reapplied':
            return 'Re-applied on the rail';
        default:
            return 'Needs reversal';
    }
}

/** Chip styling for an exception. A reversal is the one that means money moved the wrong way. */
export function DispositionChipClass(d: PaymentExceptionDisposition): string {
    if (d === 'ReversalNeeded') return 'mj-chip--danger';
    if (d === 'Held') return 'mj-chip--info';
    return 'mj-chip--outline';
}
