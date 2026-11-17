/**
 * Posting an order in a foreign currency to the ledger (golive #492).
 *
 * An order's amounts are in its `CurrencyCode`; the ledger is in the selling company's functional
 * currency. Every journal entry an order produces is built in the order's currency, by the same
 * code that builds a functional-currency order's entries, and converted here as the last step:
 *
 *     functional = round2(order-currency amount × BookingExchangeRate)
 *
 * with the order-currency amount, its code and the rate kept on the line (`OriginalCurrencyCode`,
 * `OriginalDebitAmount` / `OriginalCreditAmount`, `ExchangeRateUsed`). Accounting refuses a line
 * whose original amount × rate is more than one cent from its functional amount.
 *
 * ONE RATE FOR THE ORDER'S LIFE. The rate is the one stored when the order was first confirmed.
 * Deferred revenue is released at that same rate, months later, so it clears to what booking put
 * there; nothing here revalues it.
 *
 * BALANCING AFTER ROUNDING. Each line rounds on its own, so an entry that balances in the order's
 * currency can be a cent out in functional. The cent goes on one line whose own rounding left room
 * for it, so that line still sits within the one-cent tolerance; when an entry is more than one cent
 * out (many lines), each cent goes on a different line.
 *
 * RUNNING BALANCES CONVERT CUMULATIVELY. A booking puts an amount into Deferred Revenue and a dozen
 * releases take it out; rounding each release alone could leave a few cents in Deferred forever. A
 * line given a running key converts as the change in round2(running balance × rate) instead, so the
 * lines of one key sum to the rounded balance and an account emptied in the order's currency is
 * empty in functional too. Those lines are never moved to balance an entry.
 *
 * Pure: no I/O.
 *
 * CONNECTS TO:
 *   CALLERS:  OrderJournalEntryFactory (booking, recognition, credit memos), InstalmentInvoiceEntry,
 *             RecordProgressOperation, TermShift, TermExtension, AmountChange
 *   RULE:     @mj-biz-apps/accounting-engine-base OriginalCurrencyProblem (the one-cent check)
 */
import { ORIGINAL_AMOUNT_TOLERANCE, OriginalCurrencyProblem } from '@mj-biz-apps/accounting-engine-base';
import type { JEDraft, JELineDraft } from './OrderJournalEntryFactory.js';

/** The currency an order's entries are converted from, and the rate: functional units per one unit of it. */
export interface PostingCurrency {
    Code: string;
    Rate: number;
}

/** Floating-point slack, as accounting allows, so a difference of exactly one cent is not refused. */
const EPSILON = 1e-9;

function money(value: number): number {
    return Math.round((value + Number.EPSILON) * 100) / 100;
}

function cents(value: number): number {
    return Math.round((value + Number.EPSILON) * 100);
}

/**
 * The currency to convert an order's entries from, or null when they are already functional.
 *
 * An order with no `CurrencyCode`, or in its company's functional currency, stores no booking rate
 * (`ResolveBookingRate`), so no rate means nothing to convert.
 */
export function PostingCurrencyOf(order: { CurrencyCode?: string | null; BookingExchangeRate?: number | null }): PostingCurrency | null {
    const code = (order.CurrencyCode ?? '').trim().toUpperCase();
    const rate = order.BookingExchangeRate == null ? null : Number(order.BookingExchangeRate);
    if (!code || rate == null) return null;
    if (!(rate > 0) || !Number.isFinite(rate)) {
        throw new Error(`The booking exchange rate ${String(order.BookingExchangeRate)} for ${code} is not a positive number.`);
    }
    return { Code: code, Rate: rate };
}

/** An amount in the order's currency, in functional currency at the booking rate. */
export function ToFunctional(amount: number, currency: PostingCurrency): number {
    return money(amount * currency.Rate);
}

/** True when the line was already converted (it states its original currency). */
export function IsConverted(line: JELineDraft): boolean {
    return line.OriginalCurrencyCode != null;
}

export interface ConvertOptions {
    /**
     * The running balance a line belongs to, or null for a line converted on its own. Lines with the
     * same key, across every draft passed in one call and in the order passed, convert cumulatively.
     */
    RunningKey?: (line: JELineDraft, draft: JEDraft) => string | null;
    /**
     * Where a running balance stands before these drafts, in the order's currency, signed as a credit
     * balance. Absent, it starts at zero. Its functional side is taken as the rounded conversion, which
     * is what earlier cumulative entries left it at.
     */
    RunningStart?: (key: string) => number;
    /** Names the source in an error, e.g. "Order ORD-000123". */
    Label?: string;
}

interface Working {
    line: JELineDraft;
    /** Order-currency amount, positive. */
    original: number;
    isDebit: boolean;
    /** Functional amount, positive. */
    functional: number;
    /** May move by a cent to balance the entry. */
    free: boolean;
}

/**
 * Convert drafts built in the order's currency to functional currency (see the file header).
 *
 * Returns the drafts unchanged when `currency` is null. A line that already states its original
 * currency (a mirror of a posted line, say) is kept exactly as it is. Throws when an entry cannot
 * be balanced within the tolerance, or a converted line would be refused by accounting.
 */
export function ConvertDraftsToFunctional(drafts: JEDraft[], currency: PostingCurrency | null, options: ConvertOptions = {}): JEDraft[] {
    if (!currency) return drafts;
    const label = options.Label ?? 'This entry';
    const running = new Map<string, { Original: number; Functional: number }>();

    return drafts.map((draft) => {
        const work: Array<Working | null> = draft.Lines.map((line) => {
            if (IsConverted(line)) return null;
            const isDebit = line.DebitAmount != null && line.DebitAmount !== 0;
            const original = money(Math.abs(Number(isDebit ? line.DebitAmount : (line.CreditAmount ?? 0))));
            const key = options.RunningKey?.(line, draft) ?? null;
            if (key == null) {
                return { line, original, isDebit, functional: ToFunctional(original, currency), free: true };
            }
            // Signed as the account's balance moves: a credit adds, a debit takes away.
            let before = running.get(key);
            if (!before) {
                const start = money(options.RunningStart?.(key) ?? 0);
                before = { Original: start, Functional: ToFunctional(start, currency) };
            }
            const afterOriginal = money(before.Original + (isDebit ? -original : original));
            const afterFunctional = ToFunctional(afterOriginal, currency);
            running.set(key, { Original: afterOriginal, Functional: afterFunctional });
            return { line, original, isDebit, functional: money(Math.abs(afterFunctional - before.Functional)), free: false };
        });

        balance(work, draft, currency, label);

        const lines = draft.Lines.map((line, i): JELineDraft => {
            const w = work[i];
            if (!w) return line;
            const converted: JELineDraft = {
                ...line,
                DebitAmount: w.isDebit ? w.functional : undefined,
                CreditAmount: w.isDebit ? undefined : w.functional,
                OriginalCurrencyCode: currency.Code,
                OriginalDebitAmount: w.isDebit ? w.original : undefined,
                OriginalCreditAmount: w.isDebit ? undefined : w.original,
                ExchangeRateUsed: currency.Rate,
            };
            if (converted.DebitAmount === undefined) delete converted.DebitAmount;
            if (converted.CreditAmount === undefined) delete converted.CreditAmount;
            if (converted.OriginalDebitAmount === undefined) delete converted.OriginalDebitAmount;
            if (converted.OriginalCreditAmount === undefined) delete converted.OriginalCreditAmount;
            return converted;
        });

        // A line so small it rounds to nothing in functional currency has no ledger impact, and
        // accounting refuses a line for zero. The entry still balances without it.
        const kept = lines.filter((l) => cents(l.DebitAmount ?? 0) !== 0 || cents(l.CreditAmount ?? 0) !== 0);
        if (kept.length < 2) {
            throw new Error(
                `${label}: '${draft.Description ?? draft.EntryType}' comes to less than a cent in functional currency at ` +
                    `${currency.Code} ${currency.Rate}, so it cannot be posted as a journal entry.`,
            );
        }
        for (const line of kept) {
            const problem = OriginalCurrencyProblem(line);
            if (problem) throw new Error(`${label}: '${draft.Description ?? draft.EntryType}' — ${problem}`);
        }
        return { ...draft, Lines: kept };
    });
}

/** Move whole cents between free lines until debits equal credits, each staying within the tolerance. */
function balance(work: Array<Working | null>, draft: JEDraft, currency: PostingCurrency, label: string): void {
    const fixedNet = draft.Lines.reduce(
        (t, line, i) => (work[i] ? t : t + cents(line.DebitAmount ?? 0) - cents(line.CreditAmount ?? 0)),
        0,
    );
    const net = () => fixedNet + work.reduce((t, w) => (w ? t + (w.isDebit ? cents(w.functional) : -cents(w.functional)) : t), 0);
    const error = (w: Working) => w.functional - w.original * currency.Rate;

    let out = net();
    while (out !== 0) {
        // Debits too high (out > 0): take a cent off a debit, or add one to a credit. The reverse when low.
        const step = out > 0 ? -0.01 : 0.01;
        let best: Working | null = null;
        let bestRoom = -Infinity;
        for (const w of work) {
            if (!w || !w.free) continue;
            const delta = w.isDebit ? step : -step;
            const moved = money(w.functional + delta);
            if (moved <= 0) continue;
            const after = Math.abs(error(w) + delta);
            if (after > ORIGINAL_AMOUNT_TOLERANCE + EPSILON) continue;
            const room = ORIGINAL_AMOUNT_TOLERANCE - after;
            if (room > bestRoom) {
                best = w;
                bestRoom = room;
            }
        }
        if (!best) {
            throw new Error(
                `${label}: '${draft.Description ?? draft.EntryType}' is ${(Math.abs(out) / 100).toFixed(2)} out of balance after ` +
                    `converting from ${currency.Code} at ${currency.Rate}, and no line can take the rounding within ` +
                    `${ORIGINAL_AMOUNT_TOLERANCE.toFixed(2)} of its converted amount.`,
            );
        }
        best.functional = money(best.functional + (best.isDebit ? step : -step));
        out = net();
    }
}
