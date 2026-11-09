/**
 * InstalmentBilledSoFar — what an order's invoiced instalments already billed each line, part by part (#681).
 *
 * An instalment invoice slices its row across the lines' amounts (./InstalmentInvoiceEntry.ts). The next
 * invoice has to know what the earlier ones billed of each amount, so it can slice its own row against what
 * is left. That used to be worked out by slicing the earlier rows again against the lines as they stand
 * now, which stops being what they billed as soon as an amount change or a return lowers a line. So each
 * invoice records its pieces (`InstalmentLineBilling`), in the same transaction as its journal entry and
 * `BilledToDate`, and this module reads them back.
 *
 * INSTALMENTS INVOICED BEFORE THE RECORD EXISTED have no rows. For those, the pieces are rebuilt the way
 * their invoice computed them: every row in instalment order sliced against the lines as booked, before
 * any reduction, which is what the lines were when those invoices ran. A row that has its record is taken
 * from it, even inside that replay.
 *
 * CONNECTS TO:
 *   CALLER: IssueInstalmentInvoiceOperation (the slice an invoice bills, and recording it) ·
 *           ReversalScheduleReduction (what a return measures as still to bill)
 *   USES:   ./InstalmentInvoiceEntry.ts (the slice layout) · ./BundleBehavior.ts (exact splits)
 */
import { RunView, type IMetadataProvider, type UserInfo } from '@memberjunction/core';
import type { mjBizAppsOrdersInstalmentLineBillingEntity } from '@mj-biz-apps/orders-entities';

import { SplitExactly } from './BundleBehavior.js';
import { SliceLayout, SliceLayoutParts, type InstalmentBilledPart, type InstalmentLineFacts } from './InstalmentInvoiceEntry.js';
import { INSTALMENT_LINE_BILLING_ENTITY } from './entity-names.js';
import { RequireUUID, RequireUUIDs } from './sql-guards.js';

/** One recorded piece: what one invoiced instalment billed one line for one part. */
export interface RecordedBilledPart extends InstalmentBilledPart {
    OrderHeaderPaymentScheduleID: string;
}

/** One schedule row as the replay reads it, in instalment order. */
export interface BilledSoFarRow {
    ID: string;
    Amount: number;
    /** Set once invoiced, and never cleared. */
    DocumentNumber?: string | null;
}

type SlicedLine = Pick<InstalmentLineFacts, 'ID' | 'Quantity' | 'Net' | 'Tax' | 'Charges' | 'ChargeCredits'>;

const cents = (n: number): number => Math.round(Number(n) * 100);
const lower = (id: string | null | undefined): string => String(id ?? '').toLowerCase();
const partKey = (p: Omit<InstalmentBilledPart, 'Amount'>): string => `${lower(p.OrderLineID)}|${p.Part}|${lower(p.ChargeTypeID)}`;

/**
 * What the invoiced rows billed of each amount, aligned with `lines.map(SliceLayout).flat()`. Pure.
 *
 * @param lines    the lines as the next slice reads them (reductions applied)
 * @param booked   the same lines as booked, before any reduction; only read for rows invoiced without a record
 * @param rows     one company's live rows, in instalment order
 * @param recorded the recorded pieces of those rows; pieces of other lines are ignored
 */
export function BilledSoFar(lines: SlicedLine[], booked: SlicedLine[], rows: BilledSoFarRow[], recorded: RecordedBilledPart[]): number[] {
    const lineIDs = new Set(lines.map((l) => lower(l.ID)));
    const rowIDs = new Set(rows.map((r) => lower(r.ID)));
    const mine = recorded.filter((p) => lineIDs.has(lower(p.OrderLineID)) && rowIDs.has(lower(p.OrderHeaderPaymentScheduleID)));
    const recordedRows = new Set(mine.map((p) => lower(p.OrderHeaderPaymentScheduleID)));

    const billed = new Map<string, number>();
    const add = (key: string, amountCents: number): void => {
        billed.set(key, (billed.get(key) ?? 0) + amountCents);
    };
    for (const p of mine) add(partKey(p), cents(p.Amount));
    for (const [key, amount] of replayUnrecorded(booked, rows, recordedRows, mine)) add(key, amount);

    const parts = lines.flatMap(SliceLayoutParts);
    const keys = new Set(parts.map(partKey));
    for (const [key, amount] of billed) {
        if (amount !== 0 && !keys.has(key)) {
            const [lineID, part] = key.split('|');
            throw new Error(
                `Line ${lineID} has been invoiced ${amount / 100} of its ${part} part, which it no longer carries, so what is ` +
                    `left of it cannot be sliced across the remaining instalments. Nothing was posted.`,
            );
        }
    }
    return parts.map((p) => (billed.get(partKey(p)) ?? 0) / 100);
}

/**
 * The pieces of the rows invoiced without a record, keyed by part, in cents: every row up to the last of
 * them sliced in order against the booked lines, as their invoices sliced them. Rows with a record take
 * their recorded pieces; the schedule's last row takes what is left.
 */
function replayUnrecorded(booked: SlicedLine[], rows: BilledSoFarRow[], recordedRows: Set<string>, recorded: RecordedBilledPart[]): Map<string, number> {
    const out = new Map<string, number>();
    const unrecorded = rows.map((r) => !!r.DocumentNumber && !recordedRows.has(lower(r.ID)));
    const last = unrecorded.lastIndexOf(true);
    if (last < 0) return out;

    const parts = booked.flatMap(SliceLayoutParts);
    const keys = parts.map(partKey);
    let remaining = booked.map(SliceLayout).flat().map(cents);
    for (let i = 0; i <= last; i++) {
        let pieces: number[];
        if (recordedRows.has(lower(rows[i].ID))) {
            const byKey = new Map<string, number>();
            for (const p of recorded) {
                if (lower(p.OrderHeaderPaymentScheduleID) === lower(rows[i].ID)) byKey.set(partKey(p), (byKey.get(partKey(p)) ?? 0) + cents(p.Amount));
            }
            pieces = keys.map((k) => byKey.get(k) ?? 0);
        } else if (i === rows.length - 1) {
            pieces = remaining;
        } else {
            pieces = SplitExactly(cents(rows[i].Amount) / 100, remaining).map(cents);
        }
        remaining = remaining.map((r, j) => r - pieces[j]);
        if (unrecorded[i]) pieces.forEach((p, j) => out.set(keys[j], (out.get(keys[j]) ?? 0) + p));
    }
    return out;
}

/** Every recorded piece of an order's instalments. Reads only. */
export async function ReadInstalmentLineBillings(orderHeaderID: string, provider: IMetadataProvider, user: UserInfo): Promise<RecordedBilledPart[]> {
    const orderID = RequireUUID(orderHeaderID, 'OrderHeaderID');
    const result = await RunView.FromMetadataProvider(provider).RunView<RecordedBilledPart>(
        {
            EntityName: INSTALMENT_LINE_BILLING_ENTITY,
            ExtraFilter:
                `OrderHeaderPaymentScheduleID IN (SELECT ID FROM __mj_BizAppsOrders.OrderHeaderPaymentSchedule ` +
                `WHERE OrderHeaderID = '${orderID}')`,
            Fields: ['OrderHeaderPaymentScheduleID', 'OrderLineID', 'Part', 'ChargeTypeID', 'Amount'],
            ResultType: 'simple',
            BypassCache: true,
        },
        user,
    );
    if (!result.Success) throw new Error(`What order ${orderID}'s instalments billed could not be read: ${result.ErrorMessage ?? 'unknown error'}`);
    return (result.Results ?? []).map((p) => ({ ...p, Amount: Number(p.Amount) }));
}

/**
 * Record what one instalment billed, part by part. WRITES; runs inside the caller's transaction, beside
 * the journal entry and `BilledToDate`, so all three commit or roll back together.
 */
export async function RecordInstalmentLineBillings(
    scheduleID: string,
    parts: InstalmentBilledPart[],
    provider: IMetadataProvider,
    user: UserInfo,
): Promise<void> {
    const id = RequireUUID(scheduleID, 'OrderHeaderPaymentScheduleID');
    RequireUUIDs(parts.map((p) => p.OrderLineID), 'OrderLineID');
    for (const part of parts) {
        const row = await provider.GetEntityObject<mjBizAppsOrdersInstalmentLineBillingEntity>(INSTALMENT_LINE_BILLING_ENTITY, user);
        row.NewRecord();
        row.OrderHeaderPaymentScheduleID = id;
        row.OrderLineID = part.OrderLineID;
        row.Part = part.Part;
        row.ChargeTypeID = part.ChargeTypeID;
        row.Amount = part.Amount;
        if (!(await row.Save())) {
            throw new Error(
                row.LatestResult?.CompleteMessage ??
                    `What instalment ${id} billed line ${part.OrderLineID} (${part.Part}) could not be recorded.`,
            );
        }
    }
}
