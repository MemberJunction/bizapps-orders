/**
 * TermShiftPlan — what moving a booked term's start and end together writes to the ledger (#507).
 *
 * THE RULE. A shift moves the term, not its price, so the same amount is recognised over the same length of
 * time, starting on the new start date. The staged schedule is never edited (D14), and a posted period is
 * never reopened:
 *   1. every staged entry dated on or after the day the shift takes effect is mirrored one for one, on its
 *      own date, so each pair nets to zero in its own period (as an extension does);
 *   2. the term's whole amount is spread again from the new start to the new end, through the term's own
 *      driver and cadence. The first slice is dated the new start and is a full period's share, so the new
 *      start month gets a full month;
 *   3. the slices of that new schedule dated before the effective day belong to periods that are already
 *      behind us. They are not written on their own dates. Instead, their total is compared with what the
 *      term has already recognised before the effective day, and the difference is one entry dated the
 *      effective day, in the current open period: a catch-up when the shift moved the start earlier and
 *      revenue was missed, a reversal when it moved the start later and revenue was recognised too soon;
 *   4. the slices dated on or after the effective day are written on their own dates.
 * What was recognised before the effective day, the correction, and the new future slices together come
 * to the term's whole amount; the plan refuses anything else.
 *
 * WHY THE WHOLE AMOUNT IS RE-SPREAD, NOT ONLY WHAT IS LEFT. An extension re-spreads what is left from the
 * effective day because the past is unchanged. A shift changes which periods the past slices belong to, so
 * the past has to be measured against the new schedule; the correction entry carries the difference.
 *
 * Pure: no I/O. `TermShift.ts` loads the entries and writes what this returns.
 *
 * CONNECTS TO:
 *   CALLER: ./TermShift.ts
 *   USES:   ./TermExtensionPlan.ts (netting the staged entries, mirroring a line)
 *           ./RevenueRecognition.ts (the term's driver builds the new schedule)
 */
import type { JEDraft } from './OrderJournalEntryFactory.js';
import type { RevenueRecognitionDriver } from './RevenueRecognition.js';
import { MirrorLine, NetRelease, SideKey, type NetSide, type StagedEntry } from './TermExtensionPlan.js';

export interface TermShiftInput {
    /** Every `RevenueRecognition` entry linked to the term. */
    Entries: StagedEntry[];
    /** The day the shift takes effect: the first day of the current open period's remaining days. */
    EffectiveDate: Date;
    /** The term's dates after the shift. */
    NewStartDate: Date;
    NewEndDate: Date;
    /** The term's own recognition driver and cadence. Null when its recognition type defers nothing. */
    Driver: RevenueRecognitionDriver | null;
    PeriodMonths: number;
    /** Where every entry written is linked, so a later amendment of the same term finds them. */
    LinkedEntityID: string;
    LinkedRecordID: string;
    /** Names the act in each entry's description, e.g. "term 1 of SUB-000004 moved to start 2026-03-01". */
    Label: string;
    ProductName: string;
}

export interface TermShiftPlan {
    /** The staged entries dated on or after the effective day, in date order. Each is offset. */
    Targets: StagedEntry[];
    /** One mirror per target, in the same order. */
    Offsets: JEDraft[];
    /** The new schedule's slices dated on or after the effective day. */
    Schedule: JEDraft[];
    /** The catch-up or reversal dated the effective day, or null when the past needs no correction. */
    Correction: JEDraft | null;
    /** Positive: revenue recognised now that the new dates say was already earned. Negative: revenue reversed. */
    CorrectionAmount: number;
    /** What the term's staged entries recognise in all. */
    Total: number;
    /** What the entries dated before the effective day recognised. */
    RecognisedBefore: number;
}

const money = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;
const dayKey = (d: Date): string => d.toISOString().slice(0, 10);

const EMPTY: TermShiftPlan = {
    Targets: [],
    Offsets: [],
    Schedule: [],
    Correction: null,
    CorrectionAmount: 0,
    Total: 0,
    RecognisedBefore: 0,
};

/** Plan the shift, or say why it cannot be made. */
export function PlanTermShift(input: TermShiftInput): TermShiftPlan | string {
    if (input.NewEndDate.getTime() < input.NewStartDate.getTime()) {
        return 'A term cannot end before it starts.';
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
    if (input.Entries.length === 0) return EMPTY;

    const release = NetRelease(input.Entries);
    if (typeof release === 'string') return release;
    const total = release.Amount;
    const recognisedLater = netCredit(targets, release.Credit);
    const recognisedBefore = money(total - recognisedLater);

    const offsets = targets.map((t) => ({
        EffectiveDate: dayKey(t.EffectiveDate),
        EntryType: 'RevenueRecognition',
        Description: `Offset of ${t.EntryNumber}: ${input.Label}`,
        LinkedEntityID: input.LinkedEntityID,
        LinkedRecordID: input.LinkedRecordID,
        Lines: t.Lines.map(MirrorLine),
    }));

    if (total === 0) {
        if (recognisedBefore !== 0) {
            return 'The staged recognition entries on this term net to zero overall but not before the shift takes effect; nothing was written.';
        }
        return { ...EMPTY, Targets: targets, Offsets: offsets };
    }
    if (!input.Driver) return 'This term has staged recognition entries but its recognition type defers nothing.';

    const slices = input.Driver.BuildSchedule({
        Amount: total,
        BookingDate: input.NewStartDate,
        ServicePeriodStart: input.NewStartDate,
        ServicePeriodEnd: input.NewEndDate,
        ProductName: input.ProductName,
        PeriodMonths: input.PeriodMonths,
    }).Entries.filter((e) => e.Amount !== 0);

    const earnedBefore = money(slices.filter((e) => dayKey(e.RecognitionDate) < effective).reduce((sum, e) => sum + e.Amount, 0));
    const correctionAmount = money(earnedBefore - recognisedBefore);
    const schedule = slices
        .filter((e) => dayKey(e.RecognitionDate) >= effective)
        .map((e) => releaseEntry(input, release, dayKey(e.RecognitionDate), e.Amount, `Recognize ${input.ProductName}: ${input.Label}`));

    const scheduled = money(schedule.reduce((sum, d) => sum + (d.Lines[0].DebitAmount ?? 0), 0));
    if (money(recognisedBefore + correctionAmount + scheduled) !== total) {
        return (
            `The shifted schedule comes to ${money(recognisedBefore + correctionAmount + scheduled)}, not the ${total} ` +
            `the term recognises; nothing was written.`
        );
    }
    return {
        Targets: targets,
        Offsets: offsets,
        Schedule: schedule,
        Correction: correctionEntry(input, release, correctionAmount),
        CorrectionAmount: correctionAmount,
        Total: total,
        RecognisedBefore: recognisedBefore,
    };
}

/** What `entries` credit, net, to the revenue side of the release. */
function netCredit(entries: StagedEntry[], revenue: NetSide): number {
    const key = SideKey({ GLAccountID: revenue.GLAccountID, Dimensions: revenue.Dimensions, DebitAmount: null, CreditAmount: null, Description: null });
    let net = 0;
    for (const entry of entries) {
        for (const line of entry.Lines) {
            if (SideKey(line) === key) net += Number(line.CreditAmount ?? 0) - Number(line.DebitAmount ?? 0);
        }
    }
    return money(net);
}

/** One release of `amount` from deferred to revenue, dated `date`. */
function releaseEntry(
    input: TermShiftInput,
    release: { Debit: NetSide; Credit: NetSide },
    date: string,
    amount: number,
    description: string,
): JEDraft {
    return {
        EffectiveDate: date,
        EntryType: 'RevenueRecognition',
        Description: description,
        LinkedEntityID: input.LinkedEntityID,
        LinkedRecordID: input.LinkedRecordID,
        Lines: [
            { GLAccountID: release.Debit.GLAccountID, DebitAmount: amount, Description: `Release deferred — ${input.ProductName}`, Dimensions: release.Debit.Dimensions },
            { GLAccountID: release.Credit.GLAccountID, CreditAmount: amount, Description: `Revenue — ${input.ProductName}`, Dimensions: release.Credit.Dimensions },
        ],
    };
}

/** The catch-up (positive) or reversal (negative) dated the effective day, or null for zero. */
function correctionEntry(input: TermShiftInput, release: { Debit: NetSide; Credit: NetSide }, amount: number): JEDraft | null {
    if (amount === 0) return null;
    const date = dayKey(input.EffectiveDate);
    if (amount > 0) {
        return releaseEntry(input, release, date, amount, `Catch-up of ${input.ProductName} revenue the new dates place earlier: ${input.Label}`);
    }
    const reversal = -amount;
    return {
        EffectiveDate: date,
        EntryType: 'RevenueRecognition',
        Description: `Reversal of ${input.ProductName} revenue the new dates place later: ${input.Label}`,
        LinkedEntityID: input.LinkedEntityID,
        LinkedRecordID: input.LinkedRecordID,
        Lines: [
            { GLAccountID: release.Credit.GLAccountID, DebitAmount: reversal, Description: `Revenue reversed — ${input.ProductName}`, Dimensions: release.Credit.Dimensions },
            { GLAccountID: release.Debit.GLAccountID, CreditAmount: reversal, Description: `Deferred again — ${input.ProductName}`, Dimensions: release.Debit.Dimensions },
        ],
    };
}
