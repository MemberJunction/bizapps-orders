/**
 * RecognitionRebuildPlan — what rebuilding a booked line's revenue recognition voids, keeps and stages (golive #495).
 *
 * Confirm stages a deferred line's releases once, from its product's recognition type at that moment. When finance
 * changes the type, the line keeps the old schedule. A rebuild replaces it:
 *
 *   KEPT     entries already in a batch or posted: they reached the ledger, so they stay as they are.
 *   VOIDED   entries still Pending in no batch: they never left the subledger, so they are voided, not offset.
 *   CREATED  what the voided entries were going to release, staged again through the current type's driver over
 *            what is left of the line's service period after the last kept entry.
 *
 * The new entries keep the voided ones' accounts and dimensions, and the discount the voided entries carried is
 * shared across them by running totals, so Deferred Revenue and Sales Discounts end where they would have.
 *
 * Pure: no I/O. RebuildRecognitionOperation reads what this needs and writes what it plans.
 *
 * CONNECTS TO:
 *   CALLER: ./RebuildRecognitionOperation.ts
 *   USES:   ./RevenueRecognition.ts (the driver) · ./TermExtensionPlan.ts (staged-entry shapes)
 */
import type { JEDraft, JELineDraft } from './OrderJournalEntryFactory.js';
import type { RevenueRecognitionDriver } from './RevenueRecognition.js';
import type { StagedDimension, StagedEntry, StagedLine } from './TermExtensionPlan.js';

const money = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;
const dayKey = (d: Date): string => d.toISOString().slice(0, 10);
const RELEASE_DEFERRED_PREFIX = 'Release deferred';

/** An entry as the plan reports it. */
export interface RebuildEntry {
    JournalEntryID: string | null;
    EntryNumber: string | null;
    /** YYYY-MM-DD. */
    EffectiveDate: string;
    /** What the entry releases from Deferred Revenue. */
    Amount: number;
    Status: string | null;
}

export interface RecognitionRebuildInput {
    /** Every `RevenueRecognition` entry linked to the line. */
    Entries: StagedEntry[];
    /** The line's net: what its releases add up to. */
    Net: number;
    Driver: RevenueRecognitionDriver;
    ServicePeriodStart: Date | null;
    ServicePeriodEnd: Date | null;
    /** The day the line was booked, for a driver that reads it. */
    BookingDate: Date;
    ProductName: string;
    /** The entries' description, e.g. "Order ORD-1 line 2 — Acme". */
    Label: string;
    LinkedEntityID: string;
    LinkedRecordID: string;
}

export interface RecognitionRebuildPlan {
    Kept: RebuildEntry[];
    Voided: RebuildEntry[];
    Created: RebuildEntry[];
    /** The voided entries' IDs, to void. */
    VoidIDs: string[];
    /** The new entries, to stage. Same order as `Created`. */
    Drafts: JEDraft[];
    AmountReplaced: number;
}

function isVoided(e: StagedEntry): boolean {
    return String(e.Status) === 'Voided';
}

function deferredAccounts(entries: readonly StagedEntry[]): Set<string> {
    const out = new Set<string>();
    for (const e of entries) for (const l of e.Lines) if ((l.Description ?? '').startsWith(RELEASE_DEFERRED_PREFIX)) out.add(l.GLAccountID.toLowerCase());
    return out;
}

/** What an entry releases from Deferred Revenue: its signed debits on the Deferred Revenue accounts. */
function releaseOf(e: StagedEntry, deferred: Set<string>): number {
    return money(e.Lines.filter((l) => deferred.has(l.GLAccountID.toLowerCase())).reduce((t, l) => t + Number(l.DebitAmount ?? 0) - Number(l.CreditAmount ?? 0), 0));
}

/** The discount an entry books: its debits on accounts other than Deferred Revenue. */
function discountOf(e: StagedEntry, deferred: Set<string>): number {
    return money(e.Lines.filter((l) => !deferred.has(l.GLAccountID.toLowerCase())).reduce((t, l) => t + Number(l.DebitAmount ?? 0), 0));
}

function report(e: StagedEntry, deferred: Set<string>): RebuildEntry {
    return { JournalEntryID: e.ID, EntryNumber: e.EntryNumber, EffectiveDate: dayKey(e.EffectiveDate), Amount: releaseOf(e, deferred), Status: e.Status };
}

function dims(d: StagedDimension[]): StagedDimension[] | undefined {
    return d.length ? d : undefined;
}

/** Plan the rebuild, or say why it cannot be made. */
export function PlanRecognitionRebuild(input: RecognitionRebuildInput): RecognitionRebuildPlan | string {
    const entries = input.Entries.filter((e) => !isVoided(e));
    if (entries.length === 0) {
        return 'This line has no recognition entries staged, so it was recognized when it was booked. Only a line booked to Deferred Revenue can be rebuilt.';
    }
    const deferred = deferredAccounts(entries);
    if (deferred.size === 0) return "This line's recognition entries have no Deferred Revenue release line, so what they release cannot be read.";

    const byDate = (a: StagedEntry, b: StagedEntry) => a.EffectiveDate.getTime() - b.EffectiveDate.getTime() || a.EntryNumber.localeCompare(b.EntryNumber);
    const voidable = entries.filter((e) => e.Status === 'Pending' && !e.JournalEntryBatchID).sort(byDate);
    const kept = entries.filter((e) => !voidable.includes(e)).sort(byDate);
    if (voidable.length === 0) {
        return "Every recognition entry on this line is already in a batch or posted, so there is nothing left to rebuild.";
    }

    const recognized = money(kept.reduce((t, e) => t + releaseOf(e, deferred), 0));
    const replaced = money(voidable.reduce((t, e) => t + releaseOf(e, deferred), 0));
    const net = money(input.Net);
    if (money(recognized + replaced) !== net) {
        return (
            `This line's recognition entries add up to ${money(recognized + replaced).toFixed(2)}, not its net of ${net.toFixed(2)}, ` +
            `so what is left to recognize cannot be read from them. Nothing was planned.`
        );
    }
    if (!(replaced > 0)) return 'The entries still Pending release nothing, so there is nothing to rebuild.';

    // What is left of the service period after the last kept entry.
    const start = input.ServicePeriodStart;
    const end = input.ServicePeriodEnd;
    let from = start;
    const lastKept = kept.length ? kept[kept.length - 1].EffectiveDate : null;
    if (lastKept) {
        const next = new Date(Date.UTC(lastKept.getUTCFullYear(), lastKept.getUTCMonth(), lastKept.getUTCDate() + 1));
        if (!from || next > from) from = next;
    }
    if (from && end && from > end) {
        return `Entries through ${dayKey(lastKept!)} are already batched or posted, and the service period ends ${dayKey(end)}, so no period is left to spread the rest over.`;
    }

    let schedule: ReturnType<RevenueRecognitionDriver['BuildSchedule']>;
    try {
        schedule = input.Driver.BuildSchedule({
            Amount: replaced,
            BookingDate: input.BookingDate,
            ServicePeriodStart: from,
            ServicePeriodEnd: end,
            ProductName: input.ProductName,
        });
    } catch (err) {
        return err instanceof Error ? err.message : String(err);
    }

    // The accounts and dimensions the voided entries used.
    const template = voidable[0].Lines;
    const deferredLine = template.find((l) => deferred.has(l.GLAccountID.toLowerCase()) && Number(l.DebitAmount ?? 0) > 0);
    const discountLine = template.find((l) => !deferred.has(l.GLAccountID.toLowerCase()) && Number(l.DebitAmount ?? 0) > 0);
    const salesLine = template.find((l) => Number(l.CreditAmount ?? 0) > 0);
    if (!deferredLine || !salesLine) return `Recognition entry ${voidable[0].EntryNumber} is not a release (Deferred Revenue to Sales), so its accounts cannot be reused.`;
    const discount = money(voidable.reduce((t, e) => t + discountOf(e, deferred), 0));
    if (discount > 0 && !discountLine) return `The entries still Pending carry a discount, but entry ${voidable[0].EntryNumber} names no discount account to book it on.`;

    const same =
        schedule.Entries.length === voidable.length &&
        schedule.Entries.every((s, i) => dayKey(s.RecognitionDate) === dayKey(voidable[i].EffectiveDate) && money(s.Amount) === releaseOf(voidable[i], deferred));
    if (same) return "This line's schedule already follows its product's recognition type. Nothing to rebuild.";

    let released = 0;
    const discountThrough = (r: number) => money((discount * r) / replaced);
    const created: RebuildEntry[] = [];
    const drafts: JEDraft[] = [];
    for (const slice of schedule.Entries) {
        const amount = money(slice.Amount);
        const before = discountThrough(released);
        released = money(released + amount);
        const share = money(discountThrough(released) - before);
        const line = (src: StagedLine, side: 'DebitAmount' | 'CreditAmount', value: number): JELineDraft =>
            ({ GLAccountID: src.GLAccountID, [side]: value, Description: src.Description ?? undefined, Dimensions: dims(src.Dimensions) }) as JELineDraft;
        const lines: JELineDraft[] = [line(deferredLine, 'DebitAmount', amount)];
        if (share !== 0 && discountLine) lines.push(line(discountLine, 'DebitAmount', share));
        lines.push(line(salesLine, 'CreditAmount', money(amount + share)));
        const date = dayKey(slice.RecognitionDate);
        drafts.push({
            EffectiveDate: date,
            EntryType: 'RevenueRecognition',
            Description: `${input.Label} — recognize ${input.ProductName} (rebuilt)`,
            LinkedEntityID: input.LinkedEntityID,
            LinkedRecordID: input.LinkedRecordID,
            Lines: lines,
        });
        created.push({ JournalEntryID: null, EntryNumber: null, EffectiveDate: date, Amount: amount, Status: null });
    }

    return {
        Kept: kept.map((e) => report(e, deferred)),
        Voided: voidable.map((e) => report(e, deferred)),
        Created: created,
        VoidIDs: voidable.map((e) => e.ID),
        Drafts: drafts,
        AmountReplaced: replaced,
    };
}
