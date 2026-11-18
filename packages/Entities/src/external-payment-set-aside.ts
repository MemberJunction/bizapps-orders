/**
 * @fileoverview Setting an external-payment exception aside: which rows may be, and which a bulk
 * set-aside leaves out (bc-aidp-next-golive#449). Pure, so the entity, the queue page and the tests
 * read one statement of the rule.
 *
 * SETTING ASIDE IS PERMANENT. `Ignored` is terminal for the poll (`DecideExternalPayment`): a payment
 * set aside is never captured, even after the invoice it was waiting for is loaded. So two rules:
 *
 *   ONLY ROWS WITH NO CASH RECORDED. `Held`, `Unmatched` and `Refused` have no payment header. A
 *   `Reapplied` or `ReversalNeeded` row has cash booked against it and an action owed on the ledger;
 *   setting it aside would hide that action while the wrong allocation or the reversed cash stays put.
 *
 *   A BULK SET-ASIDE LEAVES RECENT UNMATCHED ROWS ALONE. An `Unmatched` payment may be one whose invoice
 *   is still being converted (bc-aidp-next-golive#446), and the poll captures it on its own once the
 *   invoice is loaded. Clearing pre-go-live rows in bulk must not sweep those up, so in a set of more
 *   than one row an `Unmatched` row is included only when it is dated before the cut day the person
 *   chose. One row set aside on its own is a deliberate decision about that payment and is not limited.
 *
 * @module @mj-biz-apps/orders-entities
 */
import type { ExternalPaymentDisposition } from './ExternalPaymentBehavior.js';
import { IsBefore, ToISODate } from './date-cell';

/** Dispositions a person may set aside: exceptions with no payment header. */
export const SET_ASIDE_FROM: ReadonlySet<ExternalPaymentDisposition> = new Set<ExternalPaymentDisposition>(['Held', 'Unmatched', 'Refused']);

/** `ExternalPayment.DispositionReason` is NVARCHAR(500). */
export const DISPOSITION_REASON_MAX = 500;

/** The words stored on a row a person set aside: who, which day, and their reason, cut to the column. */
export function SetAsideReasonText(reason: string, byName: string | null | undefined, day: string): string {
    const who = byName?.trim() ? ` by ${byName.trim()}` : '';
    return `Set aside${who} on ${day}: ${reason.trim()}`.slice(0, DISPOSITION_REASON_MAX);
}

/** Why a row cannot be set aside, or null when it can. */
export function SetAsideRowRefusal(row: { Disposition: string; PaymentHeaderID: string | null }): string | null {
    if (row.Disposition === 'Ignored') return 'It is already set aside.';
    if (!SET_ASIDE_FROM.has(row.Disposition as ExternalPaymentDisposition) || row.PaymentHeaderID) {
        return `It is ${row.Disposition} with cash recorded against it; that needs the ledger corrected, not the row set aside.`;
    }
    return null;
}

/**
 * The save rule the entity runs on every tier: a saved row moving to `Ignored` must come from a
 * disposition with no cash recorded, and carry a reason. Null when the save is allowed or is not a
 * set-aside at all (a new row, or one already `Ignored`).
 */
export function SetAsideSaveRefusal(change: {
    Saved: boolean;
    From: string | null;
    To: string;
    Reason: string | null;
    PaymentHeaderID: string | null;
}): string | null {
    if (!change.Saved || change.To !== 'Ignored' || change.From === 'Ignored' || change.From == null) return null;
    const refusal = SetAsideRowRefusal({ Disposition: change.From, PaymentHeaderID: change.PaymentHeaderID });
    if (refusal) return `This payment cannot be set aside. ${refusal}`;
    if (!change.Reason?.trim()) return 'Setting a payment aside needs a reason.';
    return null;
}

/** The fields the bulk plan reads from a row. */
export interface SetAsideCandidate {
    ID: string;
    ExternalPaymentRef: string;
    Disposition: string;
    PaymentDate: Date | string | null;
    PaymentHeaderID: string | null;
}

export interface SetAsidePlan<T extends SetAsideCandidate> {
    /** Rows to set aside. */
    Eligible: T[];
    /** Rows left out, each with the reason in words a person can act on. */
    Excluded: Array<{ Row: T; Why: string }>;
}

/**
 * Which of the selected rows a set-aside takes. `PaidBefore` is the cut day (`YYYY-MM-DD`) the person
 * filtered on; without one, a bulk set-aside takes no `Unmatched` row.
 */
export function PlanSetAside<T extends SetAsideCandidate>(rows: readonly T[], opts: { PaidBefore: string | null }): SetAsidePlan<T> {
    const plan: SetAsidePlan<T> = { Eligible: [], Excluded: [] };
    const bulk = rows.length > 1;
    const cut = opts.PaidBefore ? ToISODate(opts.PaidBefore) : null;
    for (const row of rows) {
        const refusal = SetAsideRowRefusal(row);
        if (refusal) {
            plan.Excluded.push({ Row: row, Why: refusal });
            continue;
        }
        if (bulk && row.Disposition === 'Unmatched' && !(cut && IsBefore(row.PaymentDate, cut))) {
            plan.Excluded.push({
                Row: row,
                Why: cut
                    ? `It is Unmatched and dated ${ToISODate(row.PaymentDate) ?? '(no date)'}, not before ${cut}; it may be waiting for an invoice still to be loaded. Set it aside on its own if it is not.`
                    : 'It is Unmatched and no "paid before" day is set; it may be waiting for an invoice still to be loaded. Set a day, or set it aside on its own.',
            });
            continue;
        }
        plan.Eligible.push(row);
    }
    return plan;
}
