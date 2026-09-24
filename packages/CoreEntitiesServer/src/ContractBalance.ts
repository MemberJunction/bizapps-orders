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
 * TWO SIGNS, TWO DIFFERENT MECHANISMS — do not conflate them.
 *
 *   THE EVENT'S SIGN is handled INSIDE this rule. `amount` is signed: attested progress can slide
 *   backwards (70% down to 55%), and that is not a special case. A backward move relieves whatever
 *   the forward move opened, so it comes off the same balance, and the pieces come back signed for
 *   the caller to post on the opposite sides.
 *
 *   THE LINE'S SIGN is NOT handled here. A reversal line (`Quantity < 0`) is mirrored ONCE at the
 *   end by the caller, exactly as the journal factory has always handled a negative quantity (D16)
 *   — the same accounts with the debit and credit swapped at a positive amount, never a negative
 *   debit. So callers pass MAGNITUDES for `billed`, `recognized` and `amount` when the line
 *   reverses, and mirror the finished entry. The stored totals are themselves signed by the line,
 *   which is why `Math.abs` appears at those call sites and not in here.
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

/* ── Reversing a scheduled order (D92 §6) ───────────────────────────────────────────────────── */

/** One line's two running totals, as they stand before the reversal books anything. */
export interface ContractLineBalance {
    OrderLineID: string;
    /** For the refusal message. A line number is what a person can find on the order. */
    LineNumber?: number | null;
    BilledToDate: number;
    RecognizedToDate: number;
}

/** What a reversal needs to know about one instalment. */
export interface ReversalScheduleRow {
    ID: string;
    CompanyID: string;
    InstallmentNumber: number;
    /** `YYYY-MM-DD`. */
    DueDate: string;
    Status: string;
    /** Frozen at invoicing and never cleared, so it — not `Status` — says whether it was billed. */
    DocumentNumber: string | null;
}

/**
 * The instalments a reversal cancels: live, and never billed.
 *
 * A future instalment is a promise to invoice, not money that has moved, so unwinding the order
 * simply withdraws it and posts nothing. `DocumentNumber IS NULL` rather than `Status = 'Scheduled'`
 * is the test for the same reason it is in the cascade: the number is frozen once issued while the
 * status keeps moving, and a row the customer holds an invoice for must never be quietly withdrawn.
 * Already-Canceled rows are left alone so a second reversal is a no-op rather than an error.
 */
export function InstalmentsToCancel(rows: ReversalScheduleRow[]): string[] {
    return rows.filter((r) => r.Status !== 'Canceled' && !r.DocumentNumber).map((r) => r.ID);
}

/** The origin line's contract position, as one reversing line sees it (D92 §6). */
export interface ReversalPosition {
    /** The ORIGIN line — the one whose BilledToDate the memo reduces. */
    OriginLineID: string;
    BilledToDate: number;
    RecognizedToDate: number;
    /**
     * The origin quantity not yet taken back by a reversal on ANOTHER order. Earlier reversals have
     * already reduced BilledToDate by their memos, so the balance left belongs to this many units.
     */
    RemainingQuantity: number;
}

/**
 * The credit memo one reversing line gives back: its share of the origin's billed-but-unearned
 * balance.
 *
 * This is `Dr Deferred / Cr AR` for what the customer was invoiced and has not yet consumed. Revenue
 * already recognised STAYS recognised (Andrew): unwinding the contract does not undeliver the service,
 * so the memo reaches only as far as the Deferred balance and no further.
 *
 * PRORATED BY QUANTITY against what is still left, not against what was sold. The caller reduces the
 * origin's BilledToDate by each memo, so after returning 4 of 10 the balance that remains belongs to
 * the other 6. Measuring the next reversal against 10 would under-credit it; measuring against 6
 * credits exactly what is left, and the memos of successive partial reversals sum to what one whole
 * reversal would have given.
 *
 * @param stagedEarned revenue the origin has earned through staged releases dated on or before the
 *   reversal. `RecognizedToDate` does not count those (D92 §8 is parked), so a subscription line
 *   would otherwise look entirely unearned and get its whole billed amount back.
 */
export function ProratedCreditMemo(position: ReversalPosition, reversalQuantity: number, stagedEarned: number): number {
    const quantity = Math.abs(Number(reversalQuantity));
    const remaining = Number(position.RemainingQuantity);
    if (!(remaining > 0) || quantity > remaining + 1e-9) {
        throw new Error(
            `Reversing ${quantity} of order line ${position.OriginLineID} leaves ${remaining} to take back ` +
                `from — the reversal validation should have refused this before booking.`,
        );
    }
    const deferred = money(Number(position.BilledToDate ?? 0) - Number(position.RecognizedToDate ?? 0) - stagedEarned);
    if (deferred <= 0) return 0;
    return money((deferred * quantity) / remaining);
}

/**
 * Refuse a reversal that would strand an earned-but-unbilled balance, or `null` to proceed.
 *
 * `R − B > 0` means we delivered service the contract has not let us bill yet — a contract asset
 * sitting in Unbilled Receivable. Reversing around it would leave that balance with no contract
 * behind it and nothing downstream to notice, so the reversal stops and asks for the instalment to
 * be issued first. Under advance billing, which is the norm here, this is rare: an order billed
 * quarterly in advance is in Deferred all the way through, and only a due instalment nobody issued,
 * or arrears billing, puts a line the other way round.
 *
 * The message names the instalment to issue when one is due, because "issue the final instalment
 * first" is not actionable if the reader has to work out which. When no instalment is due, saying so
 * is the point: the line is earned ahead of anything the schedule allows us to bill, which is a
 * misconfigured schedule and wants a person rather than a retry.
 *
 * @param asOfDay `YYYY-MM-DD`; an instalment counts as due on or before this day.
 */
export function RefuseEarnedNotBilled(
    lines: ContractLineBalance[],
    rows: ReversalScheduleRow[],
    asOfDay: string,
): string | null {
    const stranded = lines
        .map((line) => ({ line, unbilled: money(Number(line.RecognizedToDate ?? 0) - Number(line.BilledToDate ?? 0)) }))
        .filter((x) => x.unbilled > 0);
    if (!stranded.length) return null;

    const due = rows
        .filter((r) => r.Status !== 'Canceled' && !r.DocumentNumber && r.DueDate <= asOfDay)
        .sort((a, b) => (a.DueDate === b.DueDate ? a.InstallmentNumber - b.InstallmentNumber : a.DueDate < b.DueDate ? -1 : 1))[0];

    const named = stranded
        .map((x) => `line ${x.line.LineNumber ?? x.line.OrderLineID} (${x.unbilled.toFixed(2)})`)
        .join(', ');

    return due
        ? `This order has revenue recognised that has not been billed yet — ${named}. Issue instalment ` +
          `${due.InstallmentNumber}, which was due on ${due.DueDate}, and then reverse: crediting the ` +
          `customer before that leaves the earned amount sitting in Unbilled Receivable with no contract ` +
          `behind it.`
        : `This order has revenue recognised that has not been billed yet — ${named} — and no instalment ` +
          `is due to bill it with. The schedule cannot cover what has already been delivered, so the ` +
          `reversal would strand that amount in Unbilled Receivable. Someone needs to correct the ` +
          `schedule before this order can be reversed.`;
}

/** One journal line, in the shape both entry builders here produce. */
export interface CreditMemoLine {
    GLAccountID: string;
    DebitAmount?: number;
    CreditAmount?: number;
    Description: string;
    Dimensions: Array<{ DimensionID: string; DimensionValueID: string }>;
}

/**
 * The credit memo a reversal books for one line: `Dr Deferred / Cr AR` (D92 §6).
 *
 * This REPLACES the value entry for a reversing line on a scheduled company. An ordinary reversal
 * mirrors the booking entry, but a scheduled company never booked one — its value reaches the ledger
 * one instalment at a time — so mirroring nothing would credit nothing back. What the customer is
 * actually owed is what they were invoiced and have not yet consumed, which is the line's Deferred
 * balance, and that is what this gives back.
 *
 * Two amounts on purpose. The customer's receivable falls by the memo, and the obligation to deliver
 * falls with it, so both legs are the same number and the entry balances by construction. Revenue
 * already recognised is not touched: the service was delivered and reversing the contract does not
 * undeliver it (Andrew).
 *
 * @param amount the reversing line's share of the origin's Deferred balance, from {@link ProratedCreditMemo}
 * @returns the two lines, or an empty array when there is nothing billed-and-unearned to give back
 */
export function BuildCreditMemoLines(
    amount: number,
    accounts: { AR: string; Deferred: string },
    label: string,
    dimensions: Array<{ DimensionID: string; DimensionValueID: string }>,
): CreditMemoLine[] {
    const memo = money(amount);
    if (memo <= 0) return [];
    return [
        {
            GLAccountID: accounts.Deferred,
            DebitAmount: memo,
            Description: `Deferred Revenue — credit memo, ${label}`,
            Dimensions: dimensions,
        },
        {
            GLAccountID: accounts.AR,
            CreditAmount: memo,
            Description: `AR — credit memo, ${label}`,
            Dimensions: dimensions,
        },
    ];
}
