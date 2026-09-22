/**
 * @fileoverview The two ordering rules that decide which contra account every entry touches (D92).
 *
 * Each order line carries two running totals: `BilledToDate`, advanced by instalment invoices, and
 * `RecognizedToDate`, advanced by recognition entries. The line's balance-sheet position is the gap
 * between them, and it has a name on each side:
 *
 *     Billed  >  Recognized   →   the difference sits in DEFERRED REVENUE (billed, not yet earned)
 *     Recognized  >  Billed   →   the difference sits in UNBILLED RECEIVABLE (earned, not yet billed)
 *
 * Both rules are "relieve the balance that exists, then open the other one":
 *
 *   RULE 1, invoicing an instalment — `Dr AR`, and credit **Unbilled first** up to the line's
 *   unbilled balance `max(0, R − B)`, then Deferred for the rest. Billing in advance (the Blue
 *   Cypress norm) has no unbilled balance, so this is simply `Dr AR / Cr Deferred`.
 *
 *   RULE 2, recognising revenue — `Cr Revenue`, and debit **Deferred first** up to the line's
 *   deferred balance `max(0, B − R)`, then Unbilled for the rest.
 *
 * WHY "UNBILLED" MEANS TWO DIFFERENT THINGS, and why only one of them is right. Under the
 * superseded D89/D91 designs an order's future instalments were parked in Unbilled at confirm —
 * future amounts not yet earned. Here Unbilled only ever arises from RULE 2: service delivered that
 * the contract does not yet allow us to bill. That is what the standard means by a contract asset,
 * and it is why this pair of rules belongs to every driver rather than to percentage-of-completion
 * alone (Andrew, #227).
 *
 * A NEGATIVE AMOUNT IS THE SAME SUBTRACTION. Attested progress can slide backwards — 70% down to
 * 55% — and that is not a special case: the pieces come back signed, off the same balances, and the
 * caller mirrors them into the opposite sides exactly as a reversal line does (D16).
 *
 * @module @mj-biz-apps/orders-core-entities-server
 */

const money = (n: number): number => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

/** Which rule is being applied — which balance gets relieved first. */
export type ContraDirection =
    /** Rule 1: invoicing. Relieve Unbilled, then open Deferred. */
    | 'Invoice'
    /** Rule 2: recognising. Relieve Deferred, then open Unbilled. */
    | 'Recognize';

/** How one entry's contra side divides. Signed: a negative `amount` returns negative pieces. */
export interface ContraLegs {
    /** The Deferred Revenue piece. Credited under rule 1, debited under rule 2. */
    Deferred: number;
    /** The Unbilled Receivable piece. Credited under rule 1, debited under rule 2. */
    Unbilled: number;
}

/**
 * Split one entry's contra side between Deferred Revenue and Unbilled Receivable (D92).
 *
 * @param billed     the line's `BilledToDate` BEFORE this entry
 * @param recognized the line's `RecognizedToDate` BEFORE this entry
 * @param amount     the entry's contra total; may be negative (a backward attestation)
 * @param direction  which rule applies — see {@link ContraDirection}
 *
 * The two pieces always sum to `amount` exactly, which is what keeps the entry balanced by
 * construction rather than by two roundings agreeing.
 */
export function SplitContraLegs(
    billed: number,
    recognized: number,
    amount: number,
    direction: ContraDirection,
): ContraLegs {
    const total = money(amount);
    if (total === 0) return { Deferred: 0, Unbilled: 0 };

    // A backward move relieves whatever the forward move opened, so it comes off the same balance
    // the forward rule would have opened LAST — which is the balance that exists right now.
    if (total < 0) {
        const forward = SplitContraLegs(billed, recognized, -total, direction === 'Invoice' ? 'Recognize' : 'Invoice');
        return { Deferred: money(-forward.Deferred), Unbilled: money(-forward.Unbilled) };
    }

    const first = direction === 'Invoice' ? money(recognized - billed) : money(billed - recognized);
    const relieved = money(Math.min(total, Math.max(0, first)));
    const opened = money(total - relieved);

    return direction === 'Invoice'
        ? { Deferred: opened, Unbilled: relieved }
        : { Deferred: relieved, Unbilled: opened };
}
