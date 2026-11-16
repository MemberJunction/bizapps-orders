/**
 * RecognitionVoids — a reversal voids the origin's staged recognition it would otherwise mirror
 * (golive #378, D14 as amended).
 *
 * A return or a cancellation is a reversing order line, and its booking used to write one mirror
 * ("unrecognize") entry for every recognition month of the origin still to come. Each pair nets to
 * zero only if both halves land in the same batch, and a one-year subscription returned in its first
 * month left eleven of them for finance to review.
 *
 * THE RULE. A mirror is replaced by voiding the origin entry it offsets when, and only when:
 *   · the origin entry is a recognition entry of the line being reversed (linked to the line, or to
 *     one of its terms, D46), dated the same day as the mirror;
 *   · it is still Pending, in no batch, and neither reverses nor has been reversed by another entry —
 *     it has reached nothing outside the subledger; and
 *   · the mirror cancels it exactly, account by account (to the cent).
 * Under those conditions voiding the origin and booking the mirror leave every account with the same
 * balance, so the swap changes the number of entries and nothing else. Every other mirror is booked
 * as before: one that offsets an entry already Batched or GL-posted (that entry has left the
 * subledger, so only a reversing entry can correct it), and one that takes back only part of a month
 * (a partial return, a prorated month), which a void would over-correct.
 *
 * That is why the same rule serves full returns, cancellations and partial reversals alike: a full
 * return or a cancellation that takes back whole months voids those months; a partial return's
 * mirrors match nothing and are booked as before. Dimensions are not compared: a void removes exactly
 * the tags the origin carried, which is what taking the month back means.
 *
 * CONNECTS TO:
 *   CALLER:  OrderEntityServer.bookLines — after the factory builds the drafts, before they are booked
 *   WRITES:  Accounting.VoidPendingJournalEntries (./AccountingBridge.ts), in the booking transaction
 */
import { IMetadataProvider, IRunViewProvider, RunView, UserInfo } from '@memberjunction/core';
import { UUIDsEqual } from '@memberjunction/global';
import type { JELineDraft, OrderLineDraft } from './OrderJournalEntryFactory.js';
import { RequireUUIDs } from './sql-guards.js';

const JE_ENTITY = 'MJ_BizApps_Accounting: Journal Entries';
const JE_LINE_ENTITY = 'MJ_BizApps_Accounting: Journal Entry Lines';
const JE_TYPE_ENTITY = 'MJ_BizApps_Accounting: Journal Entry Types';
const SUBSCRIPTION_TERM_ENTITY = 'MJ_BizApps_Orders: Subscription Terms';

/** Money is compared to the cent, never with `===` on floats. */
const CENT = 0.005;

/** One line of a staged origin entry. */
export interface OriginEntryLine {
    GLAccountID: string;
    DebitAmount: number | null;
    CreditAmount: number | null;
}

/** A recognition entry of an origin line, as the plan reads it. */
export interface OriginRecognitionEntry {
    ID: string;
    EntryNumber: string;
    /** `YYYY-MM-DD`. */
    EffectiveDate: string;
    Status: string;
    JournalEntryBatchID: string | null;
    ReversesJournalEntryID: string | null;
    ReversedByJournalEntryID: string | null;
    Lines: OriginEntryLine[];
}

/** A void the booking will make in place of a mirror. */
export interface PlannedVoid {
    JournalEntryID: string;
    EntryNumber: string;
    /** The reversing line whose mirror the void replaces. */
    OrderLineID: string;
}

export interface RecognitionVoidPlan {
    /** The drafts still to book: everything but the mirrors replaced by a void. */
    Kept: OrderLineDraft[];
    Voids: PlannedVoid[];
}

/**
 * Decide which recognition mirrors become voids — pure. `originsByLine` holds, for each reversing
 * line (lower-cased ID), the recognition entries of the line it reverses. Each origin entry is used
 * at most once, so two reversing lines of the same origin in one order cannot both claim it.
 */
export function PlanRecognitionVoids(
    drafts: readonly OrderLineDraft[],
    originsByLine: ReadonlyMap<string, readonly OriginRecognitionEntry[]>,
): RecognitionVoidPlan {
    const kept: OrderLineDraft[] = [];
    const voids: PlannedVoid[] = [];
    const claimed = new Set<string>();
    for (const draft of drafts) {
        const origins = draft.IsBooking || !draft.RecognitionEntry ? undefined : originsByLine.get(draft.OrderLineID.toLowerCase());
        const match = origins?.find((e) => !claimed.has(e.ID.toLowerCase()) && IsVoidable(e) && e.EffectiveDate === draft.Draft.EffectiveDate && Cancels(e.Lines, draft.Draft.Lines));
        if (!match) {
            kept.push(draft);
            continue;
        }
        claimed.add(match.ID.toLowerCase());
        voids.push({ JournalEntryID: match.ID, EntryNumber: match.EntryNumber, OrderLineID: draft.OrderLineID });
    }
    return { Kept: kept, Voids: voids };
}

/** Still in the subledger only: Pending, in no batch, and not part of a reversal pair. */
export function IsVoidable(entry: OriginRecognitionEntry): boolean {
    return entry.Status === 'Pending' && !entry.JournalEntryBatchID && !entry.ReversesJournalEntryID && !entry.ReversedByJournalEntryID;
}

/** True when booking `mirror` would leave every account where it was before `origin` — to the cent. */
export function Cancels(origin: readonly OriginEntryLine[], mirror: readonly JELineDraft[]): boolean {
    if (origin.length === 0 || mirror.length === 0) return false;
    const net = new Map<string, number>();
    const add = (account: string, debit: number | null | undefined, credit: number | null | undefined) => {
        const k = account.toLowerCase();
        net.set(k, (net.get(k) ?? 0) + Number(debit ?? 0) - Number(credit ?? 0));
    };
    for (const l of origin) add(l.GLAccountID, l.DebitAmount, l.CreditAmount);
    for (const l of mirror) add(l.GLAccountID, l.DebitAmount, l.CreditAmount);
    return [...net.values()].every((v) => Math.abs(v) < CENT);
}

/** A reversing line: its ID and the line it reverses. */
export interface ReversingLineRef {
    ID: string;
    ReversesOrderLineID: string | null;
}

/**
 * The recognition entries of the lines `lines` reverse, keyed by lower-cased reversing line ID. An
 * origin's entries are linked to its terms when it has any, otherwise to the line (D46). Four reads in
 * all, whatever the number of lines. Lines that reverse nothing are skipped; none at all reads nothing.
 */
export async function LoadOriginRecognition(
    lines: readonly ReversingLineRef[],
    provider: IMetadataProvider,
    user: UserInfo,
): Promise<Map<string, OriginRecognitionEntry[]>> {
    const out = new Map<string, OriginRecognitionEntry[]>();
    const reversing = lines.filter((l) => !!l.ReversesOrderLineID);
    if (reversing.length === 0) return out;
    const rv = new RunView(provider as unknown as IRunViewProvider);
    const originIDs = RequireUUIDs([...new Set(reversing.map((l) => l.ReversesOrderLineID!.toLowerCase()))], 'ReversesOrderLineID');

    const terms = await read<{ ID: string; OrderLineID: string }>(rv, user, {
        EntityName: SUBSCRIPTION_TERM_ENTITY,
        ExtraFilter: `OrderLineID IN (${quoted(originIDs)})`,
        Fields: ['ID', 'OrderLineID'],
    });
    const typeID = await recognitionTypeID(rv, user);
    if (!typeID) return out;
    const linked = [...originIDs, ...RequireUUIDs(terms.map((t) => t.ID), 'SubscriptionTermID')];
    const entries = await read<EntryRow>(rv, user, {
        EntityName: JE_ENTITY,
        ExtraFilter: `LinkedRecordID IN (${quoted(linked)}) AND EntryTypeID = '${typeID}'`,
        Fields: ['ID', 'EntryNumber', 'EffectiveDate', 'Status', 'JournalEntryBatchID', 'ReversesJournalEntryID', 'ReversedByJournalEntryID', 'LinkedRecordID'],
    });
    const entryLines = entries.length
        ? await read<LineRow>(rv, user, {
              EntityName: JE_LINE_ENTITY,
              ExtraFilter: `JournalEntryID IN (${quoted(RequireUUIDs(entries.map((e) => e.ID), 'JournalEntryID'))})`,
              Fields: ['JournalEntryID', 'GLAccountID', 'DebitAmount', 'CreditAmount'],
          })
        : [];

    const originOf = (linkedRecordID: string): string | undefined => {
        if (originIDs.some((id) => UUIDsEqual(id, linkedRecordID))) return linkedRecordID.toLowerCase();
        return terms.find((t) => UUIDsEqual(t.ID, linkedRecordID))?.OrderLineID.toLowerCase();
    };
    const byOrigin = new Map<string, OriginRecognitionEntry[]>();
    for (const e of entries) {
        const origin = originOf(e.LinkedRecordID);
        if (!origin) continue;
        byOrigin.set(origin, [...(byOrigin.get(origin) ?? []), toOriginEntry(e, entryLines)]);
    }
    for (const l of reversing) out.set(l.ID.toLowerCase(), byOrigin.get(l.ReversesOrderLineID!.toLowerCase()) ?? []);
    return out;
}

interface EntryRow {
    ID: string;
    EntryNumber: string;
    EffectiveDate: Date | string;
    Status: string;
    JournalEntryBatchID: string | null;
    ReversesJournalEntryID: string | null;
    ReversedByJournalEntryID: string | null;
    LinkedRecordID: string;
}

interface LineRow {
    JournalEntryID: string;
    GLAccountID: string;
    DebitAmount: number | null;
    CreditAmount: number | null;
}

function toOriginEntry(e: EntryRow, lines: readonly LineRow[]): OriginRecognitionEntry {
    return {
        ID: e.ID,
        EntryNumber: e.EntryNumber,
        EffectiveDate: calendarDay(e.EffectiveDate),
        Status: String(e.Status),
        JournalEntryBatchID: e.JournalEntryBatchID ?? null,
        ReversesJournalEntryID: e.ReversesJournalEntryID ?? null,
        ReversedByJournalEntryID: e.ReversedByJournalEntryID ?? null,
        Lines: lines
            .filter((l) => UUIDsEqual(l.JournalEntryID, e.ID))
            .map((l) => ({
                GLAccountID: l.GLAccountID,
                DebitAmount: l.DebitAmount == null ? null : Number(l.DebitAmount),
                CreditAmount: l.CreditAmount == null ? null : Number(l.CreditAmount),
            })),
    };
}

/** A `date` column arrives as UTC midnight (or as text): its calendar day, read from the UTC parts. */
function calendarDay(value: Date | string): string {
    if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10);
    const d = value instanceof Date ? value : new Date(value);
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

/** The `RevenueRecognition` entry type's ID, or null on a database that has none (nothing is staged then). */
async function recognitionTypeID(rv: RunView, user: UserInfo): Promise<string | null> {
    const rows = await read<{ ID: string }>(rv, user, { EntityName: JE_TYPE_ENTITY, ExtraFilter: `Code = 'RevenueRecognition'`, Fields: ['ID'] });
    return rows[0]?.ID ? RequireUUIDs([rows[0].ID], 'EntryTypeID')[0] : null;
}

function quoted(ids: readonly string[]): string {
    return ids.map((id) => `'${id}'`).join(',');
}

/** A simple read that fails loudly: booking on a guessed empty result would mirror what it should void. */
async function read<T>(rv: RunView, user: UserInfo, params: { EntityName: string; ExtraFilter: string; Fields: string[] }): Promise<T[]> {
    const res = await rv.RunView<T>({ ...params, ResultType: 'simple', BypassCache: true, IgnoreMaxRows: true }, user);
    if (!res.Success) throw new Error(`Reading ${params.EntityName} for the reversal's staged recognition failed: ${res.ErrorMessage ?? 'unknown error'}`);
    return res.Results ?? [];
}
