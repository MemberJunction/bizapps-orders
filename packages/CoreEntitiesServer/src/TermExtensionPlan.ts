/**
 * TermExtensionPlan — what extending a booked term at no charge writes to the ledger (golive #221, case B).
 *
 * THE RULE. A term's recognition schedule is its forward-dated `RevenueRecognition` entries (D84). They are
 * never edited or deleted (D14): a change nets against them. Extending the term does two things:
 *   1. every staged entry dated on or after the day the extension takes effect is mirrored one for one —
 *      same date, same lines, debit and credit swapped — so each pair nets to zero in its own period;
 *   2. what those entries were going to recognise is spread again, prospectively, from the first of them
 *      to the term's new end, through the term's own recognition driver and cadence.
 * Entries dated before that day stay: that revenue is earned. There is no catch-up, because the price did not
 * change — the same money now covers a longer period.
 *
 * WHY THE OFFSETS ARE COPIED, NOT RECOMPUTED. The driver front-loads the rounding remainder into the first
 * slice, so recomputing the original schedule would not match the stored entries to the cent. The ledger is
 * the record of what was staged; this reads it.
 *
 * WHY THE ACCOUNTS COME FROM THE NET. A term amended before carries earlier offsets and a re-spread among its
 * staged entries, with debit and credit on both accounts. Netting every entry being replaced by account and
 * dimensions leaves exactly one net credit (revenue) and one net debit (deferred revenue) of the same amount:
 * that pair is what the new schedule releases. Any other shape is refused rather than guessed at.
 *
 * Pure: no I/O. `TermExtension.ts` loads the entries and writes what this returns.
 *
 * CONNECTS TO:
 *   CALLER: ./TermExtension.ts
 *   USES:   ./RevenueRecognition.ts (the term's driver builds the new schedule)
 */
import type { JEDraft, JELineDraft } from './OrderJournalEntryFactory.js';
import type { RevenueRecognitionDriver } from './RevenueRecognition.js';

/** One dimension pinned on a staged line. */
export interface StagedDimension {
    DimensionID: string;
    DimensionValueID: string;
}

/** One line of a staged recognition entry, as stored. */
export interface StagedLine {
    GLAccountID: string;
    DebitAmount: number | null;
    CreditAmount: number | null;
    Description: string | null;
    Dimensions: StagedDimension[];
}

/** A staged `RevenueRecognition` entry linked to the term, as stored. */
export interface StagedEntry {
    ID: string;
    EntryNumber: string;
    EffectiveDate: Date;
    Status: string;
    JournalEntryBatchID: string | null;
    Lines: StagedLine[];
}

export interface TermExtensionInput {
    /** Every `RevenueRecognition` entry linked to the term. */
    Entries: StagedEntry[];
    /** The day the extension takes effect. Entries dated on or after it are replaced. */
    EffectiveDate: Date;
    /** The term's end today, and the end it is extended to. */
    CurrentEndDate: Date;
    NewEndDate: Date;
    /**
     * The term's own recognition driver and cadence, so the new schedule is cut the way the sale was. Null when
     * the term's recognition type defers nothing, which leaves it no staged entries to replace.
     */
    Driver: RevenueRecognitionDriver | null;
    PeriodMonths: number;
    /** Where every entry written is linked, so a later amendment of the same term finds them. */
    LinkedEntityID: string;
    LinkedRecordID: string;
    /** Names the act in each entry's description, e.g. "term 1 of SUB-000004 extended to 2027-03-31". */
    Label: string;
    ProductName: string;
}

export interface TermExtensionPlan {
    /** The staged entries being replaced, in date order. */
    Targets: StagedEntry[];
    /** One mirror per target, in the same order. */
    Offsets: JEDraft[];
    /** The new schedule. Empty when nothing was left to recognise. */
    Respread: JEDraft[];
    /** What the targets were going to recognise, and the new schedule now recognises. */
    Remaining: number;
    /** The first new slice's date, or null when there is no new schedule. */
    RespreadStart: Date | null;
}

const money = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;
const dayKey = (d: Date): string => d.toISOString().slice(0, 10);

/** Plan the extension, or say why it cannot be made. */
export function PlanTermExtension(input: TermExtensionInput): TermExtensionPlan | string {
    if (!(input.NewEndDate.getTime() > input.CurrentEndDate.getTime())) {
        return 'An extension must move the term end later. Shortening or moving a booked term is not supported.';
    }

    const effective = dayKey(input.EffectiveDate);
    const targets = input.Entries
        .filter((e) => dayKey(e.EffectiveDate) >= effective)
        .sort((a, b) => a.EffectiveDate.getTime() - b.EffectiveDate.getTime() || a.EntryNumber.localeCompare(b.EntryNumber));

    const batched = targets.filter((t) => t.Status !== 'Pending' || t.JournalEntryBatchID);
    if (batched.length > 0) {
        return (
            `Recognition entries ${batched.map((t) => t.EntryNumber).join(', ')} on this term are dated on or after ` +
            `${effective} but are already in a journal-entry batch, so an offset dated the same day could not net ` +
            `against them. Resolve the batch first.`
        );
    }

    if (targets.length === 0) return { Targets: [], Offsets: [], Respread: [], Remaining: 0, RespreadStart: null };

    const release = NetRelease(targets);
    if (typeof release === 'string') return release;

    const offsets = targets.map((t) => ({
        EffectiveDate: dayKey(t.EffectiveDate),
        EntryType: 'RevenueRecognition',
        Description: `Offset of ${t.EntryNumber}: ${input.Label}`,
        LinkedEntityID: input.LinkedEntityID,
        LinkedRecordID: input.LinkedRecordID,
        Lines: t.Lines.map(mirrorLine),
    }));

    if (release.Amount === 0) {
        return { Targets: targets, Offsets: offsets, Respread: [], Remaining: 0, RespreadStart: null };
    }

    if (!input.Driver) return 'This term has staged recognition entries but its recognition type defers nothing.';
    const start = targets[0].EffectiveDate;
    const schedule = input.Driver.BuildSchedule({
        Amount: release.Amount,
        BookingDate: start,
        ServicePeriodStart: start,
        ServicePeriodEnd: input.NewEndDate,
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
            { GLAccountID: release.Debit.GLAccountID, DebitAmount: e.Amount, Description: `Release deferred — ${input.ProductName}`, Dimensions: release.Debit.Dimensions },
            { GLAccountID: release.Credit.GLAccountID, CreditAmount: e.Amount, Description: `Revenue — ${input.ProductName}`, Dimensions: release.Credit.Dimensions },
        ],
    }));

    const scheduled = money(respread.reduce((sum, d) => sum + (d.Lines[0].DebitAmount ?? 0), 0));
    if (scheduled !== release.Amount) {
        return `The new schedule sums to ${scheduled}, not the ${release.Amount} it replaces; nothing was written.`;
    }
    return { Targets: targets, Offsets: offsets, Respread: respread, Remaining: release.Amount, RespreadStart: start };
}

interface NetSide {
    GLAccountID: string;
    Dimensions: StagedDimension[];
}

/**
 * The single release the targets add up to: one account credited (revenue) and one debited (deferred), for
 * the same amount. Zero when they net out entirely.
 */
export function NetRelease(targets: StagedEntry[]): { Amount: number; Debit: NetSide; Credit: NetSide } | string {
    const sides = new Map<string, NetSide & { Net: number }>();
    for (const target of targets) {
        for (const line of target.Lines) {
            const key = sideKey(line);
            const side = sides.get(key) ?? { GLAccountID: line.GLAccountID, Dimensions: line.Dimensions, Net: 0 };
            side.Net = money(side.Net + Number(line.CreditAmount ?? 0) - Number(line.DebitAmount ?? 0));
            sides.set(key, side);
        }
    }
    const open = [...sides.values()].filter((s) => s.Net !== 0);
    if (open.length === 0) {
        const first = [...sides.values()][0];
        return { Amount: 0, Debit: first, Credit: first };
    }
    const credits = open.filter((s) => s.Net > 0);
    const debits = open.filter((s) => s.Net < 0);
    if (credits.length !== 1 || debits.length !== 1 || money(credits[0].Net + debits[0].Net) !== 0) {
        return (
            'The staged recognition entries on this term do not net to a single release from one deferred account ' +
            'to one revenue account, so the new schedule cannot be derived from them. Nothing was written.'
        );
    }
    if (credits[0].Net < 0) return 'The staged recognition entries on this term net to a reversal, which cannot be extended.';
    return { Amount: credits[0].Net, Debit: debits[0], Credit: credits[0] };
}

function sideKey(line: StagedLine): string {
    const dims = [...line.Dimensions]
        .map((d) => `${d.DimensionID.toLowerCase()}=${d.DimensionValueID.toLowerCase()}`)
        .sort()
        .join(',');
    return `${line.GLAccountID.toLowerCase()}|${dims}`;
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
