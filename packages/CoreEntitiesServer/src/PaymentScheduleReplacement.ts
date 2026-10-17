/**
 * @fileoverview Replacing an order's payment schedule from a supplied list, with no database near it
 * (golive #290). `Orders.ReplacePaymentSchedule` reads the order, calls {@link PlanScheduleReplacement},
 * and writes what the plan says.
 *
 * WHY A REPLACEMENT AND NOT AN APPEND. The caller (Sales, copying a deal's schedule at Close Won and
 * again whenever a won deal's schedule is edited) holds the whole schedule it wants. Sending the whole
 * list and letting orders work out the difference means a second call with the same list changes
 * nothing, and a reopened deal closed again does not double the rows.
 *
 * THE RULE FOR ROWS ALREADY INVOICED. A row past `Scheduled` (Invoiced, Paid, WrittenOff) is frozen by
 * `trg_OrderHeaderPaymentSchedule_Immutable`: the customer holds its number. So each such row must
 * appear in the supplied list with the same due date and the same amount, and is then kept as it is.
 * If one is missing or changed the whole replacement is refused and nothing is written, naming the
 * instalment. Skipping it instead would leave the caller's list and the order disagreeing with
 * nothing to show for it. Cancelled rows have left the schedule and are left alone.
 *
 * WHAT HAPPENS TO THE REST. The supplied rows not matched to a frozen row become the order's
 * `Scheduled` rows, in due-date order. Existing `Scheduled` rows are reused in place (re-dated,
 * re-amounted, renumbered) before any is deleted or created, so a row that a payment is already aimed
 * at keeps its identity where it can.
 *
 * NUMBERING. A frozen or cancelled row keeps its `InstallmentNumber`: it is part of a document number
 * the customer may hold. The live `Scheduled` rows take the lowest numbers no frozen or cancelled row
 * holds, in due-date order. Reused rows are assigned in their current number order, so each update
 * moves a row to a number at or below its own and never onto one another row still holds; that keeps
 * `UQ_OrderHeaderPaymentSchedule_Installment` satisfied after every single statement.
 *
 * A BOOKED ORDER HAS TWO EXTRA LIMITS. A confirmed order with no schedule was billed in full at
 * confirm (D92), so adding rows would bill it twice; and a confirmed order with a schedule booked
 * nothing for its unissued rows, so removing them all would leave that value with nothing to bill it.
 * Both are refused.
 *
 * THE TIE is checked by the caller with `ScheduleShortfalls` on {@link ScheduleReplacementPlan.Final},
 * the same check confirm and invoicing run, so all three refuse in the same words.
 *
 * @module @mj-biz-apps/orders-core-entities-server
 */

import { ToISODate } from '@mj-biz-apps/orders-entities';
import type { ScheduleRowFacts } from './PaymentScheduleBehavior.js';

const Money = (n: number): number => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
const cents = (n: number): number => Math.round(Money(n) * 100);
const lower = (id: string | null | undefined): string => String(id ?? '').toLowerCase();

/** Statuses a person can no longer change: the customer holds the document. */
const FROZEN_STATUSES = new Set(['Invoiced', 'Paid', 'WrittenOff']);

/** One row as the caller wants it. */
export interface ScheduleReplacementRow {
    /** `YYYY-MM-DD`. */
    DueDate: string;
    Amount: number;
    Description?: string | null;
}

/** One row the order already has, as the planner reads it. */
export interface ExistingScheduleRow extends ScheduleRowFacts {
    ID: string;
    InstallmentNumber: number;
    DueDate: string | Date;
    DocumentNumber?: string | null;
    Description?: string | null;
}

/** A row the plan leaves on the order after it is applied. */
export interface PlannedScheduleRow extends ScheduleRowFacts {
    /** Null for a row the plan creates. */
    ID: string | null;
    InstallmentNumber: number;
    DueDate: string;
    Description: string | null;
    DocumentNumber: string | null;
    /** True for a frozen row kept exactly as it was. */
    Kept: boolean;
}

/** Why a replacement is refused. */
export type ScheduleReplacementRefusalCode =
    | 'INVALID_ROW'
    | 'ORDER_VOIDED'
    | 'PER_COMPANY_SCHEDULE'
    | 'INVOICED_ROW_CHANGED'
    | 'BILLED_WITHOUT_SCHEDULE'
    | 'SCHEDULE_REQUIRED';

export interface ScheduleReplacementRefusal {
    Refused: true;
    Code: ScheduleReplacementRefusalCode;
    Message: string;
}

/** What to write, in the order it must be written: deletes, then updates, then inserts. */
export interface ScheduleReplacementPlan {
    Delete: string[];
    Update: Array<{ ID: string; InstallmentNumber: number; DueDate: string; Amount: number; Description: string | null }>;
    Insert: Array<{ InstallmentNumber: number; DueDate: string; Amount: number; Description: string | null }>;
    /** The order's schedule once the plan is applied, cancelled rows excluded, by instalment number. */
    Final: PlannedScheduleRow[];
    /** True when applying the plan writes nothing. */
    Unchanged: boolean;
}

export interface ScheduleReplacementOrder {
    OrderNumber: string;
    Status: string;
    CompanyID: string;
}

/**
 * Check the supplied rows: a real day, an amount above zero to the cent, a description that fits.
 * Returns the rows normalised, or the first problem found.
 */
export function NormaliseReplacementRows(
    rows: ReadonlyArray<{ DueDate?: unknown; Amount?: unknown; Description?: unknown }> | null | undefined,
): ScheduleReplacementRow[] | ScheduleReplacementRefusal {
    if (!Array.isArray(rows)) return refusal('INVALID_ROW', 'Rows must be a list; send an empty list to remove the schedule.');
    const out: ScheduleReplacementRow[] = [];
    for (const [i, row] of rows.entries()) {
        const n = i + 1;
        const day = typeof row?.DueDate === 'string' || row?.DueDate instanceof Date ? ToISODate(row.DueDate) : null;
        if (!day || !isRealDay(day)) return refusal('INVALID_ROW', `Row ${n} has no valid due date (YYYY-MM-DD).`);
        const amount = Number(row?.Amount);
        if (row?.Amount === null || row?.Amount === undefined || !Number.isFinite(amount) || Money(amount) <= 0) {
            return refusal('INVALID_ROW', `Row ${n} (due ${day}) needs an amount greater than zero.`);
        }
        const description = row?.Description === null || row?.Description === undefined ? null : String(row.Description).trim() || null;
        if (description && description.length > 500) {
            return refusal('INVALID_ROW', `Row ${n} (due ${day}) has a description longer than 500 characters.`);
        }
        out.push({ DueDate: day, Amount: Money(amount), Description: description });
    }
    return out;
}

/**
 * Work out how to turn the order's schedule into the supplied one, or why it cannot be done.
 *
 * `supplied` must already be normalised ({@link NormaliseReplacementRows}). The tie is not checked
 * here; the caller runs `ScheduleShortfalls` on `Final` against the order's lines.
 */
export function PlanScheduleReplacement(
    order: ScheduleReplacementOrder,
    existing: readonly ExistingScheduleRow[],
    supplied: readonly ScheduleReplacementRow[],
): ScheduleReplacementPlan | ScheduleReplacementRefusal {
    if (order.Status === 'Voided') {
        return refusal('ORDER_VOIDED', `Order ${order.OrderNumber} is Voided, so its payment schedule cannot change.`);
    }
    const orderCompany = lower(order.CompanyID);
    const notCancelled = existing.filter((r) => r.Status !== 'Canceled');
    if (notCancelled.some((r) => lower(r.CompanyID) !== orderCompany)) {
        return refusal(
            'PER_COMPANY_SCHEDULE',
            `Order ${order.OrderNumber} is billed by a schedule per product company, kept from before one schedule per ` +
                `order because it had already invoiced under it. Change that schedule on the order itself.`,
        );
    }

    const booked = order.Status === 'Confirmed';
    if (booked && notCancelled.length === 0 && supplied.length > 0) {
        return refusal(
            'BILLED_WITHOUT_SCHEDULE',
            `Order ${order.OrderNumber} was confirmed with no payment schedule, so its full value was billed at confirm. ` +
                `Adding instalments now would bill it twice.`,
        );
    }
    if (booked && notCancelled.length > 0 && supplied.length === 0) {
        return refusal(
            'SCHEDULE_REQUIRED',
            `Order ${order.OrderNumber} is confirmed and billed by its payment schedule, so the schedule cannot be removed: ` +
                `the instalments not yet invoiced would have nothing to bill them.`,
        );
    }

    const matched = matchFrozenRows(order, existing, supplied);
    if ('Refused' in matched) return matched;

    return buildPlan(order, existing, supplied, matched.Used);
}

/** Pair each frozen row with a supplied row of the same day and amount, or refuse naming it. */
function matchFrozenRows(
    order: ScheduleReplacementOrder,
    existing: readonly ExistingScheduleRow[],
    supplied: readonly ScheduleReplacementRow[],
): { Used: Set<number> } | ScheduleReplacementRefusal {
    const used = new Set<number>();
    const frozen = existing.filter((r) => FROZEN_STATUSES.has(r.Status)).sort(byNumber);
    for (const row of frozen) {
        const day = ToISODate(row.DueDate);
        const match = supplied.findIndex((s, i) => !used.has(i) && s.DueDate === day && cents(s.Amount) === cents(row.Amount));
        if (match < 0) {
            const document = row.DocumentNumber ? ` as ${row.DocumentNumber}` : '';
            return refusal(
                'INVOICED_ROW_CHANGED',
                `Instalment ${row.InstallmentNumber} of order ${order.OrderNumber} (due ${day}, ${Money(row.Amount).toFixed(2)}) ` +
                    `was invoiced${document} and cannot change, but the new schedule has no row with that date and amount. ` +
                    `Keep that row as it is and change only the instalments not yet invoiced.`,
            );
        }
        used.add(match);
    }
    return { Used: used };
}

function buildPlan(
    order: ScheduleReplacementOrder,
    existing: readonly ExistingScheduleRow[],
    supplied: readonly ScheduleReplacementRow[],
    usedBySupplied: Set<number>,
): ScheduleReplacementPlan {
    const held = new Set(existing.filter((r) => r.Status !== 'Scheduled').map((r) => Number(r.InstallmentNumber)));
    const wanted = supplied
        .map((row, index) => ({ row, index }))
        .filter(({ index }) => !usedBySupplied.has(index))
        .sort((a, b) => (a.row.DueDate < b.row.DueDate ? -1 : a.row.DueDate > b.row.DueDate ? 1 : a.index - b.index))
        .map(({ row }) => row);
    const numbers = freeNumbers(held, wanted.length);
    const reusable = existing.filter((r) => r.Status === 'Scheduled').sort(byNumber);

    const plan: ScheduleReplacementPlan = { Delete: [], Update: [], Insert: [], Final: [], Unchanged: true };
    for (const row of reusable.slice(wanted.length)) plan.Delete.push(row.ID);
    wanted.forEach((row, i) => {
        const target = { InstallmentNumber: numbers[i], DueDate: row.DueDate, Amount: row.Amount, Description: row.Description ?? null };
        const current = reusable[i];
        if (!current) {
            plan.Insert.push(target);
        } else if (!sameRow(current, target)) {
            plan.Update.push({ ID: current.ID, ...target });
        }
        plan.Final.push({
            ...target,
            ID: current?.ID ?? null,
            CompanyID: order.CompanyID,
            Status: 'Scheduled',
            DocumentNumber: null,
            Kept: false,
        });
    });
    for (const row of existing.filter((r) => FROZEN_STATUSES.has(r.Status))) {
        plan.Final.push({
            ID: row.ID,
            CompanyID: row.CompanyID,
            Status: row.Status,
            InstallmentNumber: Number(row.InstallmentNumber),
            DueDate: ToISODate(row.DueDate) as string,
            Amount: Money(row.Amount),
            Description: row.Description ?? null,
            DocumentNumber: row.DocumentNumber ?? null,
            Kept: true,
        });
    }
    plan.Final.sort(byNumber);
    plan.Unchanged = !plan.Delete.length && !plan.Update.length && !plan.Insert.length;
    return plan;
}

/** The lowest `count` positive numbers not in `held`, ascending. */
function freeNumbers(held: Set<number>, count: number): number[] {
    const out: number[] = [];
    for (let n = 1; out.length < count; n++) if (!held.has(n)) out.push(n);
    return out;
}

function sameRow(
    current: ExistingScheduleRow,
    target: { InstallmentNumber: number; DueDate: string; Amount: number; Description: string | null },
): boolean {
    return (
        Number(current.InstallmentNumber) === target.InstallmentNumber &&
        ToISODate(current.DueDate) === target.DueDate &&
        cents(current.Amount) === cents(target.Amount) &&
        (current.Description ?? null) === target.Description
    );
}

function byNumber(a: { InstallmentNumber: number }, b: { InstallmentNumber: number }): number {
    return Number(a.InstallmentNumber) - Number(b.InstallmentNumber);
}

/** A well-formed day that exists: `2026-02-30` is refused rather than rolled into March. */
function isRealDay(day: string): boolean {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return false;
    const parsed = new Date(`${day}T00:00:00Z`);
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === day;
}

function refusal(code: ScheduleReplacementRefusalCode, message: string): ScheduleReplacementRefusal {
    return { Refused: true, Code: code, Message: message };
}
