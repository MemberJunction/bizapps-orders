/**
 * AmountChangePlan — what lowering a booked term's amount would do to recognition and billing (#506, golive #221 case A).
 *
 * RECOGNITION: CUMULATIVE CATCH-UP. The share of the reduction that belongs to periods already earned is taken
 * back in one go on the effective day (a posted period is never reopened), and the rest comes off the slices
 * still to come. "Already earned" is read from the ledger: the staged `RevenueRecognition` entries dated before
 * the effective day, against all of the term's staged entries. So with 400 of a 1,200 term earned and the price
 * cut to 900, a third of the 300 reduction (100) is the catch-up, and the remaining 800 becomes 600.
 *
 * The slices still to come are netted, not edited (D14): each staged entry dated on or after the effective day is
 * mirrored on its own date, and what is left to recognise at the new price is spread again from the first of them
 * to the term's end, through the term's own driver and cadence. This is the term extension's netting
 * (./TermExtensionPlan.ts) with a smaller amount re-spread over the same end.
 *
 * BILLING: WHERE THE REDUCTION LANDS. The reduction plus its tax is taken from the order's instalments not yet
 * invoiced, and only what cannot be is credited on a document already sent:
 *   - "applies to invoice" set: that invoice is credited up to its open amount and the rest is spread over the
 *     uninvoiced instalments. If that invoice is already paid, the part that would have credited it reduces the
 *     next instalment instead, unless the customer asked for a refund;
 *   - blank: spread over the uninvoiced instalments, pro rata to their amounts;
 *   - an order billed as a whole has no instalments: the order is the invoice, and it is credited;
 *   - whatever is left after all of that is a credit memo nobody's invoice absorbs: refunded when asked for, and
 *     otherwise left as the customer's credit.
 * An instalment reduced to nothing is cancelled rather than kept at zero.
 *
 * Pure: no I/O. ./AmountChange.ts reads what this needs.
 *
 * CONNECTS TO:
 *   CALLER: ./AmountChange.ts
 *   USES:   ./TermExtensionPlan.ts (staged-entry shapes, NetRelease) · ./RevenueRecognition.ts (the driver)
 */
import type { JEDraft, JELineDraft } from './OrderJournalEntryFactory.js';
import type { RevenueRecognitionDriver } from './RevenueRecognition.js';
import { NetRelease, type StagedEntry, type StagedLine } from './TermExtensionPlan.js';

const money = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;
const cents = (n: number): number => Math.round((n + Number.EPSILON) * 100);
const dayKey = (d: Date): string => d.toISOString().slice(0, 10);

// ─── Recognition ────────────────────────────────────────────────────────────

export interface AmountChangeInput {
    /** Every `RevenueRecognition` entry linked to the term. */
    Entries: StagedEntry[];
    /** The day the change takes effect: the catch-up is dated here, and staged entries from here on are replaced. */
    EffectiveDate: Date;
    /** The term's end, which the re-spread runs to. */
    TermEndDate: Date;
    /** The term's amount today, and the amount it changes to. Net of discount, before tax. */
    CurrentAmount: number;
    NewAmount: number;
    /** The term's own recognition driver and cadence. Null when its recognition type defers nothing. */
    Driver: RevenueRecognitionDriver | null;
    PeriodMonths: number;
    LinkedEntityID: string;
    LinkedRecordID: string;
    /** Names the act in each entry's description, e.g. "term 1 of SUB-000004 reduced to 900.00". */
    Label: string;
    ProductName: string;
}

export interface AmountChangePlan {
    /** CurrentAmount − NewAmount. */
    Reduction: number;
    /** What the entries dated before the effective day recognise: revenue already earned. */
    Recognized: number;
    /** The reduction's share that belongs to periods already earned, taken back on the effective day. */
    CatchUp: number;
    /** The staged entries being replaced, in date order, and one mirror per target in the same order. */
    Targets: StagedEntry[];
    Offsets: JEDraft[];
    /** The new schedule of what is left to recognise. Empty when nothing is. */
    Respread: JEDraft[];
    /** What the targets were going to recognise. */
    Replaced: number;
    /** What the new schedule recognises: `Replaced − (Reduction − CatchUp)`. */
    Remaining: number;
    /**
     * The catch-up as an entry on the effective day: revenue debited and deferred revenue credited, on the
     * accounts the earned entries used. Null when nothing was earned yet, and when no entries were staged at all
     * (the term was recognised when booked, so there is no deferred balance to take it from).
     */
    CatchUpEntry: JEDraft | null;
}

/** Plan the recognition side of an amount reduction, or say why it cannot be made. */
export function PlanAmountChange(input: AmountChangeInput): AmountChangePlan | string {
    const current = money(input.CurrentAmount);
    const next = money(input.NewAmount);
    if (!(next > 0)) {
        return 'The new amount must be more than zero. Ending the arrangement altogether is a cancellation, not an amendment.';
    }
    if (!(next < current)) {
        return `The new amount must be lower than the current ${current.toFixed(2)}. An increase is billed as a new sale, not an amendment.`;
    }
    const reduction = money(current - next);

    const effective = dayKey(input.EffectiveDate);
    const byDate = (a: StagedEntry, b: StagedEntry) => a.EffectiveDate.getTime() - b.EffectiveDate.getTime() || a.EntryNumber.localeCompare(b.EntryNumber);
    const earned = input.Entries.filter((e) => dayKey(e.EffectiveDate) < effective);
    const targets = input.Entries.filter((e) => dayKey(e.EffectiveDate) >= effective).sort(byDate);

    // Nothing staged: the term's revenue was recognised when it was booked, so the whole reduction is earned.
    if (input.Entries.length === 0) {
        return { Reduction: reduction, Recognized: current, CatchUp: reduction, Targets: [], Offsets: [], Respread: [], Replaced: 0, Remaining: 0, CatchUpEntry: null };
    }

    const batched = targets.filter((t) => t.Status !== 'Pending' || t.JournalEntryBatchID);
    if (batched.length > 0) {
        return (
            `Recognition entries ${batched.map((t) => t.EntryNumber).join(', ')} on this term are dated on or after ` +
            `${effective} but are already in a journal-entry batch, so an offset dated the same day could not net ` +
            `against them. Resolve the batch first.`
        );
    }

    const before = earned.length ? NetRelease(earned) : null;
    if (typeof before === 'string') return before;
    const after = targets.length ? NetRelease(targets) : null;
    if (typeof after === 'string') return after;
    const recognized = before?.Amount ?? 0;
    const replaced = after?.Amount ?? 0;

    // The ledger has to describe the amount being changed, or the catch-up would be a share of the wrong total.
    if (money(recognized + replaced) !== current) {
        return (
            `This term's staged recognition entries add up to ${money(recognized + replaced).toFixed(2)}, not its amount ` +
            `of ${current.toFixed(2)}, so the share already earned cannot be read from them. Nothing was planned.`
        );
    }

    const catchUp = money((reduction * recognized) / current);
    const remaining = money(replaced - (reduction - catchUp));
    const catchUpEntry: JEDraft | null =
        before && catchUp > 0
            ? {
                  EffectiveDate: effective,
                  EntryType: 'RevenueRecognition',
                  Description: `Catch-up: ${input.Label}`,
                  LinkedEntityID: input.LinkedEntityID,
                  LinkedRecordID: input.LinkedRecordID,
                  Lines: [
                      { GLAccountID: before.Credit.GLAccountID, DebitAmount: catchUp, Description: `Revenue taken back — ${input.ProductName}`, Dimensions: before.Credit.Dimensions },
                      { GLAccountID: before.Debit.GLAccountID, CreditAmount: catchUp, Description: `Deferred revenue — ${input.ProductName}`, Dimensions: before.Debit.Dimensions },
                  ],
              }
            : null;

    const offsets = targets.map((t) => ({
        EffectiveDate: dayKey(t.EffectiveDate),
        EntryType: 'RevenueRecognition',
        Description: `Offset of ${t.EntryNumber}: ${input.Label}`,
        LinkedEntityID: input.LinkedEntityID,
        LinkedRecordID: input.LinkedRecordID,
        Lines: t.Lines.map(mirrorLine),
    }));

    if (remaining === 0 || !after) {
        return { Reduction: reduction, Recognized: recognized, CatchUp: catchUp, Targets: targets, Offsets: offsets, Respread: [], Replaced: replaced, Remaining: 0, CatchUpEntry: catchUpEntry };
    }
    if (!input.Driver) return 'This term has staged recognition entries but its recognition type defers nothing.';

    const start = targets[0].EffectiveDate;
    const schedule = input.Driver.BuildSchedule({
        Amount: remaining,
        BookingDate: start,
        ServicePeriodStart: start,
        ServicePeriodEnd: input.TermEndDate,
        ProductName: input.ProductName,
        PeriodMonths: input.PeriodMonths,
    });
    const respread = schedule.Entries.filter((e) => e.Amount !== 0).map((e) => ({
        EffectiveDate: dayKey(e.RecognitionDate),
        EntryType: 'RevenueRecognition',
        Description: `Recognize ${input.ProductName}: ${input.Label}`,
        LinkedEntityID: input.LinkedEntityID,
        LinkedRecordID: input.LinkedRecordID,
        Lines: [
            { GLAccountID: after.Debit.GLAccountID, DebitAmount: e.Amount, Description: `Release deferred — ${input.ProductName}`, Dimensions: after.Debit.Dimensions },
            { GLAccountID: after.Credit.GLAccountID, CreditAmount: e.Amount, Description: `Revenue — ${input.ProductName}`, Dimensions: after.Credit.Dimensions },
        ],
    }));
    const scheduled = money(respread.reduce((sum, d) => sum + (d.Lines[0].DebitAmount ?? 0), 0));
    if (scheduled !== remaining) {
        return `The new schedule sums to ${scheduled}, not the ${remaining} left to recognise; nothing was planned.`;
    }
    return { Reduction: reduction, Recognized: recognized, CatchUp: catchUp, Targets: targets, Offsets: offsets, Respread: respread, Replaced: replaced, Remaining: remaining, CatchUpEntry: catchUpEntry };
}

function mirrorLine(line: StagedLine): JELineDraft {
    const debit = Number(line.CreditAmount ?? 0);
    const credit = Number(line.DebitAmount ?? 0);
    return {
        GLAccountID: line.GLAccountID,
        ...(debit > 0 ? { DebitAmount: debit } : {}),
        ...(credit > 0 ? { CreditAmount: credit } : {}),
        ...(line.Description ? { Description: line.Description } : {}),
        ...(line.Dimensions.length ? { Dimensions: line.Dimensions } : {}),
    };
}

// ─── Billing ────────────────────────────────────────────────────────────────

/** One instalment of the term's order, for the company that sold the term. */
export interface ReductionInstalment {
    ID: string;
    InstallmentNumber: number;
    /** `YYYY-MM-DD`. */
    DueDate: string;
    Amount: number;
    /** What is still owed on it. */
    Balance: number;
    Status: string;
    /** Set once invoiced, and never cleared. */
    DocumentNumber: string | null;
}

export interface ReductionInput {
    /** The reduction including its tax: what the customer is billed less. */
    GrossReduction: number;
    /** The order's instalments for the term's company. Empty when the order is billed as a whole. */
    Instalments: ReductionInstalment[];
    /** An order billed as a whole: what is still owed on it. */
    OrderBalance: number;
    /** The invoice the reduction is about, when it is about one. An instalment ID. */
    AppliesToInvoiceID?: string | null;
    /** The customer asked for a refund of a paid invoice's credit. */
    RefundRequested?: boolean;
}

/** An uninvoiced instalment the reduction changes. */
export interface InstalmentChange {
    ID: string;
    InstallmentNumber: number;
    DueDate: string;
    CurrentAmount: number;
    /** Zero when the instalment is cancelled. */
    NewAmount: number;
}

/** What a credit memo would credit: an invoiced instalment, or the order itself when it is billed as a whole. */
export interface CreditApplication {
    /** The instalment credited, or null for the order. */
    InstalmentID: string | null;
    DocumentNumber: string | null;
    Amount: number;
}

export interface ReductionPlan {
    /** Uninvoiced instalments reduced or cancelled, in instalment order. */
    Instalments: InstalmentChange[];
    /** The credit memo: everything not taken from an uninvoiced instalment. Zero when no document is needed. */
    CreditMemo: number;
    /** Where the credit memo is applied. */
    Applied: CreditApplication[];
    /** The credit memo's part refunded to the customer. */
    Refund: number;
    /** The credit memo's part left as the customer's credit, applied to nothing yet. */
    OpenCredit: number;
}

/** Decide where a reduction lands, or say why it cannot. */
export function PlanReduction(input: ReductionInput): ReductionPlan | string {
    let left = money(input.GrossReduction);
    if (!(left > 0)) return 'There is nothing to reduce.';
    const changes = new Map<string, InstalmentChange>();
    const applied: CreditApplication[] = [];
    let refund = 0;

    if (input.Instalments.length === 0) {
        if (input.AppliesToInvoiceID) {
            return 'This order is billed as a whole, so the order itself is the invoice credited. Leave the invoice to credit blank.';
        }
        const onOrder = money(Math.min(left, Math.max(0, input.OrderBalance)));
        if (onOrder > 0) applied.push({ InstalmentID: null, DocumentNumber: null, Amount: onOrder });
        left = money(left - onOrder);
        if (input.RefundRequested) {
            refund = left;
            left = 0;
        }
        return { Instalments: [], CreditMemo: money(input.GrossReduction), Applied: applied, Refund: refund, OpenCredit: left };
    }

    const scheduled = input.Instalments
        .filter((i) => i.Status === 'Scheduled' && !i.DocumentNumber)
        .sort((a, b) => a.DueDate.localeCompare(b.DueDate) || a.InstallmentNumber - b.InstallmentNumber);

    if (input.AppliesToInvoiceID) {
        const invoice = input.Instalments.find((i) => i.ID.toLowerCase() === String(input.AppliesToInvoiceID).toLowerCase());
        if (!invoice) return `Instalment ${input.AppliesToInvoiceID} is not one of the instalments on this term's order for the company that sold it. Pick one of that order's invoices.`;
        if (!invoice.DocumentNumber || (invoice.Status !== 'Invoiced' && invoice.Status !== 'Paid')) {
            return (
                `Instalment ${invoice.InstallmentNumber} is ${invoice.Status} and has not been invoiced, so there is no invoice to credit. ` +
                `Leave the invoice to credit blank; the reduction comes off the instalments not yet invoiced.`
            );
        }
        const open = money(Math.max(0, invoice.Balance));
        if (open > 0) {
            if (input.RefundRequested) {
                return `Invoice ${invoice.DocumentNumber} still has ${open.toFixed(2)} open; a refund applies only to an invoice already paid.`;
            }
            const credit = money(Math.min(left, open));
            applied.push({ InstalmentID: invoice.ID, DocumentNumber: invoice.DocumentNumber, Amount: credit });
            left = money(left - credit);
        } else {
            // Paid: what would have credited this invoice is refunded, or comes off the next instalment.
            const owed = money(Math.min(left, invoice.Amount));
            if (input.RefundRequested) {
                refund = owed;
                left = money(left - owed);
            } else {
                left = money(left - owed + takeInOrder(owed, scheduled, changes));
            }
        }
    } else if (input.RefundRequested) {
        return 'A refund needs the paid invoice it comes from. Pick that invoice to credit.';
    }

    if (left > 0) left = spreadProRata(left, scheduled, changes);

    const instalments = scheduled.filter((s) => changes.has(s.ID)).map((s) => changes.get(s.ID)!);
    const fromInstalments = money(instalments.reduce((sum, c) => sum + c.CurrentAmount - c.NewAmount, 0));
    const creditMemo = money(input.GrossReduction - fromInstalments);
    return { Instalments: instalments, CreditMemo: creditMemo, Applied: applied, Refund: refund, OpenCredit: left };
}

/** Take `amount` from the instalments in due order, cancelling each one it covers. Returns what is left over. */
function takeInOrder(amount: number, scheduled: ReductionInstalment[], changes: Map<string, InstalmentChange>): number {
    let left = money(amount);
    for (const row of scheduled) {
        if (left <= 0) break;
        const change = changeFor(row, changes);
        const take = money(Math.min(left, change.NewAmount));
        change.NewAmount = money(change.NewAmount - take);
        left = money(left - take);
    }
    return left;
}

/**
 * Spread `amount` over the instalments in proportion to what each still bills. Cumulative rounding, so the
 * pieces sum to the amount exactly. Returns what is left when the amount is more than they bill together.
 */
function spreadProRata(amount: number, scheduled: ReductionInstalment[], changes: Map<string, InstalmentChange>): number {
    const rows = scheduled.map((row) => changeFor(row, changes)).filter((c) => c.NewAmount > 0);
    const total = cents(rows.reduce((sum, c) => sum + c.NewAmount, 0));
    if (total === 0) return money(amount);
    const wanted = cents(amount);
    if (wanted >= total) {
        for (const c of rows) c.NewAmount = 0;
        return money((wanted - total) / 100);
    }
    let through = 0;
    let given = 0;
    for (const c of rows) {
        through += cents(c.NewAmount);
        const upTo = Math.round((wanted * through) / total);
        c.NewAmount = money(c.NewAmount - (upTo - given) / 100);
        given = upTo;
    }
    return 0;
}

function changeFor(row: ReductionInstalment, changes: Map<string, InstalmentChange>): InstalmentChange {
    let change = changes.get(row.ID);
    if (!change) {
        change = { ID: row.ID, InstallmentNumber: row.InstallmentNumber, DueDate: row.DueDate, CurrentAmount: money(row.Amount), NewAmount: money(row.Amount) };
        changes.set(row.ID, change);
    }
    return change;
}

// ─── Instalment invoices after a change ─────────────────────────────────────

/** The amounts of one line an instalment invoice slices, as ./InstalmentInvoiceEntry.ts reads them. */
export interface SlicedLineAmounts {
    ID: string;
    Net: number;
    Tax: number;
    Charges: number;
    Gross: number;
    ChargeCredits: Array<{ GLAccountID: string; Amount: number; Label: string }>;
}

/**
 * A line as its instalment invoices bill it once approved amount changes have lowered it: net and gross less
 * the reductions, tax less their tax, and each tax credit lowered in proportion so the credits still sum to the
 * line's tax. The lowered instalments then tie to the lowered line. A line with no change comes back unchanged.
 *
 * Only tax follows a reduction; recording one is refused on a line that carries any other charge, so every
 * charge credit here is tax.
 */
export function ReduceLineAmounts<T extends SlicedLineAmounts>(line: T, reductions: Array<{ OrderLineID: string; Net: number; Tax: number }>): T {
    const mine = reductions.filter((r) => r.OrderLineID.toLowerCase() === line.ID.toLowerCase());
    if (mine.length === 0) return line;
    const net = money(mine.reduce((s, r) => s + r.Net, 0));
    const tax = money(mine.reduce((s, r) => s + r.Tax, 0));
    if (net > line.Net + 0.005 || tax > line.Tax + 0.005) {
        throw new Error(`Line ${line.ID} has been lowered by more than its own amount; its instalments cannot be billed.`);
    }
    const credited = cents(line.ChargeCredits.reduce((s, c) => s + c.Amount, 0));
    const keep = cents(line.Tax) === 0 ? 1 : 1 - tax / line.Tax;
    // Cumulative rounding, so the lowered credits sum to exactly their share.
    let through = 0;
    let given = 0;
    const target = Math.round(credited * keep);
    const credits = line.ChargeCredits.map((c) => {
        through += cents(c.Amount);
        const upTo = credited === 0 ? 0 : Math.round((target * through) / credited);
        const piece = upTo - given;
        given = upTo;
        return { ...c, Amount: piece / 100 };
    });
    return {
        ...line,
        Net: money(line.Net - net),
        Tax: money(line.Tax - tax),
        Gross: money(line.Gross - net),
        ChargeCredits: credits.filter((c) => c.Amount !== 0),
    };
}

// ─── The credit memo (#662) ─────────────────────────────────────────────────

/** A credit memo's gross divided into the reduction's net and its tax. */
export interface CreditMemoSplit {
    Gross: number;
    Net: number;
    Tax: number;
}

/**
 * The part of a reduction a credit memo carries, as net and tax. The memo is the reduction's gross less what the
 * uninvoiced instalments took, so it holds net and tax in the reduction's own proportion. Zero when no memo is needed.
 */
export function SplitCreditMemo(memo: number, reductionNet: number, reductionGross: number): CreditMemoSplit {
    const gross = money(memo);
    if (!(gross > 0) || !(reductionGross > 0)) return { Gross: 0, Net: 0, Tax: 0 };
    if (gross > money(reductionGross)) {
        throw new Error(`A credit memo of ${gross.toFixed(2)} is more than the ${money(reductionGross).toFixed(2)} reduction it comes from.`);
    }
    const net = gross === money(reductionGross) ? money(reductionNet) : money((reductionNet * gross) / reductionGross);
    return { Gross: gross, Net: net, Tax: money(gross - net) };
}

/** What an approved amount change took off its line's instalment billing: the schedule reduction, as net and tax. */
export function ScheduleShare(scheduleReduction: number, creditMemo: number, reductionNet: number): { Net: number; Tax: number; Gross: number } {
    const gross = money(scheduleReduction);
    const memo = SplitCreditMemo(creditMemo, reductionNet, money(scheduleReduction + creditMemo));
    const net = money(reductionNet - memo.Net);
    return { Net: net, Tax: money(gross - net), Gross: gross };
}

export interface CreditMemoEntryInput {
    Split: CreditMemoSplit;
    /** `YYYY-MM-DD`: the day the memo is issued. A posted period is never reopened. */
    EffectiveDate: string;
    EntryType: string;
    DocumentNumber: string;
    /** Names the act, e.g. "term 1 of SUB-000004 reduced to 900.00". */
    Label: string;
    ProductName: string;
    LinkedEntityID: string;
    LinkedRecordID: string;
    Accounts: { AR: string; Deferred: string };
    /** The line's tax credits, as its invoices posted them. Every charge on the line is tax here. */
    TaxCredits: Array<{ GLAccountID: string; Amount: number; Label: string }>;
    Dimensions: Array<{ DimensionID: string; DimensionValueID: string }>;
}

/**
 * The credit memo's entry: deferred revenue debited for its net, each tax account for its share of its tax, and the
 * customer's receivable credited for the whole. Revenue is not touched here: the amount change's catch-up and re-cut
 * already lower what is recognised, so the memo gives back only what was billed and will now never be earned.
 *
 * The tax is taken off the tax accounts in proportion to what the line credited to each, with cumulative rounding so
 * the pieces sum to exactly the memo's tax. Refused when the memo carries tax and the line credited none.
 */
export function CreditMemoEntry(input: CreditMemoEntryInput): JEDraft | string {
    const { Split: split } = input;
    if (!(split.Gross > 0)) return 'There is no credit memo to post.';
    const credited = cents(input.TaxCredits.reduce((s, c) => s + c.Amount, 0));
    const taxCents = cents(split.Tax);
    if (taxCents > 0 && credited === 0) {
        return (
            `The credit memo carries ${split.Tax.toFixed(2)} of tax, but the line's tax was not posted to any account, so there ` +
            `is no account to take it back from.`
        );
    }
    let through = 0;
    let given = 0;
    const taxLines: JELineDraft[] = [];
    for (const credit of input.TaxCredits) {
        through += cents(credit.Amount);
        const upTo = credited === 0 ? 0 : Math.round((taxCents * through) / credited);
        const piece = upTo - given;
        given = upTo;
        if (piece === 0) continue;
        taxLines.push({
            GLAccountID: credit.GLAccountID,
            DebitAmount: piece / 100,
            Description: `${credit.Label} — credit memo ${input.DocumentNumber}`,
            ...(input.Dimensions.length ? { Dimensions: input.Dimensions } : {}),
        });
    }
    const dims = input.Dimensions.length ? { Dimensions: input.Dimensions } : {};
    return {
        EffectiveDate: input.EffectiveDate,
        EntryType: input.EntryType,
        Description: `Credit memo ${input.DocumentNumber}: ${input.Label}`,
        LinkedEntityID: input.LinkedEntityID,
        LinkedRecordID: input.LinkedRecordID,
        Lines: [
            ...(split.Net > 0
                ? [{ GLAccountID: input.Accounts.Deferred, DebitAmount: split.Net, Description: `Deferred revenue — credit memo ${input.DocumentNumber}, ${input.ProductName}`, ...dims }]
                : []),
            ...taxLines,
            { GLAccountID: input.Accounts.AR, CreditAmount: split.Gross, Description: `AR — credit memo ${input.DocumentNumber}, ${input.ProductName}`, ...dims },
        ],
    };
}

/** The document number of an order's next credit memo: the order number, then CM and the memo's sequence on it. */
export function CreditMemoNumber(orderNumber: string, existing: Array<string | null | undefined>): string {
    const prefix = `${orderNumber}-CM`;
    const used = existing
        .filter((n): n is string => !!n && n.startsWith(prefix))
        .map((n) => Number(n.slice(prefix.length)))
        .filter((n) => Number.isInteger(n) && n > 0);
    return `${prefix}${(used.length ? Math.max(...used) : 0) + 1}`;
}
