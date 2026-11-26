/**
 * OriginRecognitionLedger — what a returned line's recognition entries say, read from the ledger (golive #495).
 *
 * WHY THE LEDGER AND NOT THE DRIVER. A return used to rebuild the origin line's release schedule by running the
 * recognition driver of the product's CURRENT type over the line's net. When finance changes a product's type
 * after a line was booked, or rebuilds a line's schedule, that rebuild describes a schedule the line never had:
 * an on-completion line returned after its product moved to straight-line was mirrored month by month, against
 * one release that was still sitting in Deferred Revenue. The entries staged for the line are the record of what
 * it will recognize, so a return reads them.
 *
 * WHAT IS READ. Every `RevenueRecognition` entry linked to the origin line or to one of its subscription terms
 * (the origin side), and every one linked to an earlier reversal of it (their mirrors). Amendments that netted a
 * term's entries (amount changes, extensions, shifts) are on the origin side too, so the position is what the line
 * will still recognize after them. A voided entry never reached the ledger and is left out.
 *
 * THE POSITION, per date and per account (with its dimensions), is the signed sum of all of those lines. A return
 * of `Fraction` of what is left mirrors that share of each date's position, so two halves returned one after the
 * other take back the whole, and a return of everything left mirrors the position exactly.
 *
 * Pure apart from {@link LoadOriginRecognitionLedger}.
 *
 * CONNECTS TO:
 *   CALLER: OrderEntityServer (reads it per reversing line) · OrderJournalEntryFactory (mirrors and earned to date)
 *   USES:   TermExtensionPlan (StagedEntry shapes)
 */
import { RunView, type IRunViewProvider } from '@memberjunction/core';
import { UUIDsEqual } from '@memberjunction/global';
import type { JELineDraft } from './OrderJournalEntryFactory.js';
import type { StagedDimension, StagedEntry } from './TermExtensionPlan.js';
import { EntityIDFor } from './AccountingBridge.js';
import type { ApprovalTaskContext } from './ConcessionApprovalTask.js';
import { ORDER_LINE_ENTITY } from './entity-names.js';
import { RequireUUID, RequireUUIDs } from './sql-guards.js';

const JE_TYPE_ENTITY = 'MJ_BizApps_Accounting: Journal Entry Types';
const JE_ENTITY = 'MJ_BizApps_Accounting: Journal Entries';
const JE_LINE_ENTITY = 'MJ_BizApps_Accounting: Journal Entry Lines';
const JE_LINE_DIMENSION_ENTITY = 'MJ_BizApps_Accounting: Journal Entry Line Dimensions';
const SUBSCRIPTION_TERM_ENTITY = 'MJ_BizApps_Orders: Subscription Terms';

/** The description every staged release gives its Deferred Revenue line; a mirror keeps it. */
const RELEASE_DEFERRED_PREFIX = 'Release deferred';

/** A `date` column as midnight UTC, the shape it round-trips in (as TermExtension reads it). */
const asDay = (value: Date | string): Date => {
    const d = new Date(value);
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
};

async function ReadRows<T>(ctx: ApprovalTaskContext, params: Parameters<RunView['RunView']>[0]): Promise<T[]> {
    const rv = new RunView(ctx.Provider as unknown as IRunViewProvider);
    const res = await rv.RunView<T>({ ...params, BypassCache: true }, ctx.User);
    if (!res.Success) throw new Error(`Reading ${params.EntityName} failed: ${res.ErrorMessage}`);
    return res.Results;
}

const money = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;
const dayKey = (d: Date): string => d.toISOString().slice(0, 10);

/** The origin's recognition entries and its earlier reversals' mirrors, as stored. */
export interface OriginRecognitionLedger {
    /** Entries linked to the origin line or its terms. */
    Origin: StagedEntry[];
    /** Entries linked to earlier reversals of the origin. */
    Prior: StagedEntry[];
}

/** One account's net on one date. Positive is a debit balance. */
interface Side {
    GLAccountID: string;
    Dimensions: StagedDimension[];
    Description: string | null;
    Signed: number;
}

/** One date's mirror of the returned share. */
export interface LedgerMirror {
    /** YYYY-MM-DD. */
    Date: string;
    Lines: JELineDraft[];
}

function sideKey(account: string, dims: StagedDimension[]): string {
    const tags = dims
        .map((d) => `${d.DimensionID.toLowerCase()}=${d.DimensionValueID.toLowerCase()}`)
        .sort()
        .join('|');
    return `${account.toLowerCase()}#${tags}`;
}

function isVoided(e: StagedEntry): boolean {
    return String(e.Status) === 'Voided';
}

/** True when the ledger holds anything staged for the origin, so it, not a driver, says what to mirror. */
export function HasOriginRecognition(ledger: OriginRecognitionLedger | undefined): ledger is OriginRecognitionLedger {
    return !!ledger && ledger.Origin.some((e) => !isVoided(e));
}

/** Per date, per account and dimensions, the signed net of every origin entry and every earlier mirror. */
export function RemainingPosition(ledger: OriginRecognitionLedger): Map<string, Map<string, Side>> {
    const byDate = new Map<string, Map<string, Side>>();
    for (const entry of [...ledger.Origin, ...ledger.Prior]) {
        if (isVoided(entry)) continue;
        const date = dayKey(entry.EffectiveDate);
        const sides = byDate.get(date) ?? new Map<string, Side>();
        byDate.set(date, sides);
        for (const line of entry.Lines) {
            const key = sideKey(line.GLAccountID, line.Dimensions);
            const side = sides.get(key) ?? { GLAccountID: line.GLAccountID, Dimensions: line.Dimensions, Description: line.Description, Signed: 0 };
            side.Signed = money(side.Signed + Number(line.DebitAmount ?? 0) - Number(line.CreditAmount ?? 0));
            sides.set(key, side);
        }
    }
    return byDate;
}

/**
 * The mirrors a return of `fraction` of what is left takes back: each date's position, scaled and reversed, as
 * balanced entry lines. Dates on or before `after` are left alone when it is given (an instalment-billed origin
 * keeps what it has earned, D92 §6). A date whose position is already zero is skipped.
 *
 * Each scaled line is rounded to the cent; a cent of rounding that unbalances an entry is put on its largest
 * line. A fraction of 1 mirrors the position exactly.
 */
export function PlanLedgerMirrors(ledger: OriginRecognitionLedger, fraction: number, after: string | null): LedgerMirror[] {
    if (!(fraction > 0)) return [];
    const share = Math.min(1, fraction);
    const out: LedgerMirror[] = [];
    const position = RemainingPosition(ledger);
    for (const date of [...position.keys()].sort()) {
        if (after && date <= after) continue;
        const sides = [...position.get(date)!.values()].filter((s) => s.Signed !== 0);
        if (sides.length === 0) continue;
        const scaled = sides.map((s) => ({ side: s, amount: money(-s.Signed * share) })).filter((x) => x.amount !== 0);
        if (scaled.length === 0) continue;
        const residual = money(scaled.reduce((sum, x) => sum + x.amount, 0));
        if (residual !== 0) {
            const largest = scaled.reduce((a, b) => (Math.abs(b.amount) > Math.abs(a.amount) ? b : a));
            largest.amount = money(largest.amount - residual);
        }
        out.push({
            Date: date,
            Lines: scaled
                .filter((x) => x.amount !== 0)
                .map((x) => ({
                    GLAccountID: x.side.GLAccountID,
                    ...(x.amount > 0 ? { DebitAmount: x.amount } : { CreditAmount: -x.amount }),
                    Description: x.side.Description ?? undefined,
                    Dimensions: x.side.Dimensions.length ? x.side.Dimensions : undefined,
                })) as JELineDraft[],
        });
    }
    return out;
}

/** The Deferred Revenue accounts the origin's releases drew on, read from their "Release deferred" lines. */
function deferredAccounts(ledger: OriginRecognitionLedger): Set<string> {
    const accounts = new Set<string>();
    for (const entry of ledger.Origin) {
        for (const line of entry.Lines) {
            if ((line.Description ?? '').startsWith(RELEASE_DEFERRED_PREFIX)) accounts.add(line.GLAccountID.toLowerCase());
        }
    }
    return accounts;
}

/**
 * What the origin has recognized from Deferred Revenue through `asOf` (inclusive), net of what earlier reversals
 * took back by then: the signed debits on its Deferred Revenue accounts in entries dated on or before `asOf`.
 */
export function LedgerEarnedThrough(ledger: OriginRecognitionLedger, asOf: string): number {
    const accounts = deferredAccounts(ledger);
    let earned = 0;
    for (const entry of [...ledger.Origin, ...ledger.Prior]) {
        if (isVoided(entry) || dayKey(entry.EffectiveDate) > asOf) continue;
        for (const line of entry.Lines) {
            if (!accounts.has(line.GLAccountID.toLowerCase())) continue;
            earned += Number(line.DebitAmount ?? 0) - Number(line.CreditAmount ?? 0);
        }
    }
    return money(earned);
}

/**
 * Every `RevenueRecognition` entry linked to the given records of one entity, with lines and dimensions. Shared
 * with {@link StagedRecognitionEntries}' shape; `entityName` is the linked entity (order lines or terms).
 */
export async function LinkedRecognitionEntries(entityName: string, recordIDs: readonly string[], ctx: ApprovalTaskContext): Promise<StagedEntry[]> {
    const ids = RequireUUIDs([...new Set(recordIDs.map((id) => id.toLowerCase()))], 'LinkedRecordID');
    if (ids.length === 0) return [];
    const type = (
        await ReadRows<{ ID: string }>(ctx, {
            EntityName: JE_TYPE_ENTITY,
            ExtraFilter: `Code = 'RevenueRecognition'`,
            Fields: ['ID'],
            ResultType: 'simple',
        })
    )[0];
    if (!type) throw new Error("Accounting has no 'RevenueRecognition' journal entry type.");

    const entries = await ReadRows<{ ID: string; EntryNumber: string; EffectiveDate: Date | string; Status: string; JournalEntryBatchID: string | null }>(ctx, {
        EntityName: JE_ENTITY,
        ExtraFilter:
            `LinkedEntityID = '${EntityIDFor(entityName)}' AND LinkedRecordID IN (${ids.map((id) => `'${id}'`).join(', ')}) ` +
            `AND EntryTypeID = '${RequireUUID(type.ID, 'EntryTypeID')}'`,
        Fields: ['ID', 'EntryNumber', 'EffectiveDate', 'Status', 'JournalEntryBatchID'],
        ResultType: 'simple',
    });
    if (entries.length === 0) return [];

    const entryIDs = RequireUUIDs(entries.map((e) => e.ID), 'JournalEntryID');
    const lines = await ReadRows<{ ID: string; JournalEntryID: string; LineNumber: number; GLAccountID: string; DebitAmount: number | null; CreditAmount: number | null; Description: string | null }>(ctx, {
        EntityName: JE_LINE_ENTITY,
        ExtraFilter: `JournalEntryID IN (${entryIDs.map((id) => `'${id}'`).join(', ')})`,
        Fields: ['ID', 'JournalEntryID', 'LineNumber', 'GLAccountID', 'DebitAmount', 'CreditAmount', 'Description'],
        OrderBy: 'LineNumber',
        ResultType: 'simple',
    });
    const lineIDs = RequireUUIDs(lines.map((l) => l.ID), 'JournalEntryLineID');
    const dims = lineIDs.length
        ? await ReadRows<{ JournalEntryLineID: string; DimensionID: string; DimensionValueID: string }>(ctx, {
              EntityName: JE_LINE_DIMENSION_ENTITY,
              ExtraFilter: `JournalEntryLineID IN (${lineIDs.map((id) => `'${id}'`).join(', ')})`,
              Fields: ['JournalEntryLineID', 'DimensionID', 'DimensionValueID'],
              ResultType: 'simple',
          })
        : [];

    return entries.map((e) => ({
        ID: e.ID,
        EntryNumber: e.EntryNumber,
        EffectiveDate: asDay(e.EffectiveDate),
        Status: e.Status,
        JournalEntryBatchID: e.JournalEntryBatchID,
        Lines: lines
            .filter((l) => UUIDsEqual(l.JournalEntryID, e.ID))
            .map((l) => ({
                GLAccountID: l.GLAccountID,
                DebitAmount: l.DebitAmount == null ? null : Number(l.DebitAmount),
                CreditAmount: l.CreditAmount == null ? null : Number(l.CreditAmount),
                Description: l.Description,
                Dimensions: dims
                    .filter((d) => UUIDsEqual(d.JournalEntryLineID, l.ID))
                    .map((d) => ({ DimensionID: d.DimensionID, DimensionValueID: d.DimensionValueID })),
            })),
    }));
}

/**
 * The origin's recognition entries (on the line and on its subscription terms) and the mirrors earlier reversals
 * of it staged. `priorReversalLineIDs` are those reversals' line IDs, which their mirrors are linked to.
 */
export async function LoadOriginRecognitionLedger(
    originLineID: string,
    priorReversalLineIDs: readonly string[],
    ctx: ApprovalTaskContext,
): Promise<OriginRecognitionLedger> {
    const origin = RequireUUID(originLineID, 'OriginLineID');
    const terms = await ReadRows<{ ID: string }>(ctx, {
        EntityName: SUBSCRIPTION_TERM_ENTITY,
        ExtraFilter: `OrderLineID = '${origin}'`,
        Fields: ['ID'],
        ResultType: 'simple',
    });
    const [onLine, onTerms, prior] = await Promise.all([
        LinkedRecognitionEntries(ORDER_LINE_ENTITY, [origin], ctx),
        LinkedRecognitionEntries(SUBSCRIPTION_TERM_ENTITY, terms.map((t) => t.ID), ctx),
        LinkedRecognitionEntries(ORDER_LINE_ENTITY, priorReversalLineIDs, ctx),
    ]);
    return { Origin: [...onLine, ...onTerms], Prior: prior };
}
