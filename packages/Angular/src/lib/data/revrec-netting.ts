import type { mjBizAppsAccountingJournalEntryEntity } from '@mj-biz-apps/accounting-entities';

/**
 * Netting a subscription's recognition schedule against the returns and cancellations that reverse
 * it (golive #474).
 *
 * A return or a cancellation is a reversal ORDER LINE (`ReversesOrderLineID`). Its confirm books one
 * mirror entry ("unrecognize") for each month of the origin's schedule still to come, linked to the
 * reversal line, not to the term: a reversing line creates no term. Read by the term alone, the
 * schedule kept showing every month as Scheduled after the money was taken back.
 *
 * The deferred revenue waterfall reads every entry as a positive amount, so a mirror passed to it
 * would ADD a month rather than offset it. Here a month whose mirrors match what the origin
 * recognizes in it is dropped with them: both sides are gone, and so is the month. A month only
 * partly reversed keeps the origin's entry and drops the mirror, which overstates it exactly as
 * before; showing the net part needs the waterfall to read a mirror as negative, which is the
 * accounting package's change.
 *
 * VOIDED ENTRIES SIMPLY DROP OUT (golive #378). A reversal now voids an origin month still Pending in
 * no batch instead of mirroring it, so there is no pair to net: the voided entry is left out, and its
 * month counts as taken back in full. Mirrors remain only for months already batched or posted, or
 * taken back in part, and are netted as above.
 */

/** The origin line a reversal line reverses, by lower-cased reversal line ID. */
export type ReversalLineMap = ReadonlyMap<string, string>;

/** The terms an origin line sold, by lower-cased origin line ID (lower-cased term IDs). */
export type OriginLineTerms = ReadonlyMap<string, readonly string[]>;

export interface NettedSchedule {
    Entries: mjBizAppsAccountingJournalEntryEntity[];
    /** Months whose recognition a reversal took back in full: left out, with the reversal's entries. */
    OffsetMonths: number;
    /** Months a reversal took back only part of: still shown at the origin's full amount. */
    PartlyOffsetMonths: number;
}

const CENT = 0.005;

function key(id: unknown): string {
    return String(id ?? '').toLowerCase();
}

/**
 * A voided entry (golive #378): cancelled before it left the subledger, so it recognizes nothing. Read
 * as text, so this builds against an accounting release whose status list predates it.
 */
export function IsVoided(je: mjBizAppsAccountingJournalEntryEntity): boolean {
    return String(je.Status) === 'Voided';
}

/** Recognition, read the way the waterfall reads it: by description or entry type. */
export function IsRecognitionEntry(je: mjBizAppsAccountingJournalEntryEntity): boolean {
    const desc = (je.Description || '').toLowerCase();
    const type = (je.EntryType || '').toLowerCase();
    return desc.includes('recognize') || type.includes('recognition');
}

/** One side of the entry, as the waterfall sums it: the credits, else the debits. */
export function EntryAmount(je: mjBizAppsAccountingJournalEntryEntity): number {
    const lines = je.Lines;
    if (lines == null || !lines.IsAvailable) return 0;
    let credit = 0;
    let debit = 0;
    for (const line of lines.Items) {
        if (line.CreditAmount != null && Number(line.CreditAmount) > 0) credit += Number(line.CreditAmount);
        if (line.DebitAmount != null && Number(line.DebitAmount) > 0) debit += Number(line.DebitAmount);
    }
    return credit > 0 ? credit : debit;
}

/** `YYYY-MM` of a `date` column, read from its UTC parts (a SQL date arrives as UTC midnight). */
function monthOf(value: unknown): string | null {
    if (value == null) return null;
    if (typeof value === 'string' && /^\d{4}-\d{2}/.test(value)) return value.slice(0, 7);
    const d = value instanceof Date ? value : new Date(String(value));
    if (Number.isNaN(d.getTime())) return null;
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

/**
 * Leave out voided entries; drop each month a reversal takes back in full, with the reversal's entries; drop every other entry
 * linked to a reversal line (its booking reversal, and mirrors of a month only partly taken back).
 */
export function NetReversedRecognition(
    all: readonly mjBizAppsAccountingJournalEntryEntity[],
    reversals: ReversalLineMap,
    originTerms: OriginLineTerms,
): NettedSchedule {
    const voidedMonths = new Set<string>();
    for (const je of all) {
        const month = monthOf(je.EffectiveDate);
        if (IsVoided(je) && IsRecognitionEntry(je) && month) voidedMonths.add(`${key(je.LinkedRecordID)}|${month}`);
    }
    const entries = all.filter((je) => !IsVoided(je));
    if (reversals.size === 0) return { Entries: [...entries], OffsetMonths: voidedMonths.size, PartlyOffsetMonths: 0 };

    // Which origin line an entry belongs to: through its term, or the line itself when it has none.
    const originOfLinked = new Map<string, string>();
    for (const [origin, terms] of originTerms) {
        originOfLinked.set(origin, origin);
        for (const t of terms) originOfLinked.set(key(t), origin);
    }

    type Month = { origin: mjBizAppsAccountingJournalEntryEntity[]; originAmount: number; mirrorAmount: number };
    const months = new Map<string, Month>();
    const monthFor = (origin: string, month: string): Month => {
        const k = `${origin}|${month}`;
        let m = months.get(k);
        if (!m) {
            m = { origin: [], originAmount: 0, mirrorAmount: 0 };
            months.set(k, m);
        }
        return m;
    };

    for (const je of entries) {
        if (!IsRecognitionEntry(je)) continue;
        const month = monthOf(je.EffectiveDate);
        if (!month) continue;
        const linked = key(je.LinkedRecordID);
        const reversed = reversals.get(linked);
        if (reversed) {
            monthFor(reversed, month).mirrorAmount += EntryAmount(je);
            continue;
        }
        const origin = originOfLinked.get(linked);
        // An entry already reversed in the ledger is the waterfall's to drop (#430), not this netting's.
        if (origin && je.ReversedByJournalEntryID == null && je.ReversesJournalEntryID == null) {
            const m = monthFor(origin, month);
            m.origin.push(je);
            m.originAmount += EntryAmount(je);
        }
    }

    const dropped = new Set<mjBizAppsAccountingJournalEntryEntity>();
    let offset = 0;
    let partly = 0;
    for (const m of months.values()) {
        if (m.mirrorAmount <= CENT || m.origin.length === 0) continue;
        if (Math.abs(m.originAmount - m.mirrorAmount) <= CENT || m.mirrorAmount > m.originAmount) {
            m.origin.forEach((je) => dropped.add(je));
            offset++;
        } else {
            partly++;
        }
    }

    const kept = entries.filter((je) => !dropped.has(je) && !reversals.has(key(je.LinkedRecordID)));
    return { Entries: kept, OffsetMonths: offset + voidedMonths.size, PartlyOffsetMonths: partly };
}
