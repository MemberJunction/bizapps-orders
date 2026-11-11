/**
 * @fileoverview Instalments left behind when a confirm moves a line's term.
 *
 * A subscription line that extends coverage the subscriber already holds starts the day after that
 * coverage ends, whatever start the line stated ({@link DisplacedTermStart}). The payment schedule is
 * the order's, not the line's, so nothing moved it: a schedule planned around the stated dates kept
 * them, and its instalments fell due, and were invoiced, before the term they pay for began
 * (golive #467).
 *
 * Confirm refuses such an order instead of moving the instalments itself. The schedule covers the
 * whole order, so on an order with several lines there is no single shift that is right, and moving
 * money dates without the person seeing it is the failure being fixed. The order screen runs the same
 * test to warn before confirm.
 *
 * WHAT COUNTS AS EARLY. Money due before a moved line's new start can still pay for the other lines
 * of the order, so a moved line is reported only when the live instalments due before its new start
 * add up to more than the order's lines that start no later than that. On an order whose only line
 * moved, that is any instalment due before the new start.
 *
 * @module @mj-biz-apps/orders-entities
 */

import { ToISODate, type DateCell } from './date-cell';

/** A subscription line whose stated start the confirm replaced. Dates are `YYYY-MM-DD`. */
export interface MovedTermLine {
    LineNumber: number | null;
    Product: string | null;
    /** The line's gross, the figure the schedule ties to. */
    LineTotalGross: number;
    StatedStart: string;
    StatedEnd: string | null;
    SettledStart: string;
    SettledEnd: string | null;
}

/** A schedule row as this test reads it. `DueDate` may arrive as a string or a `Date`. */
export interface MovedTermScheduleRow {
    InstallmentNumber: number | null;
    DueDate: DateCell;
    Amount: number;
    Status: string;
}

/** One moved line and the instalments that fall due before its new start. */
export interface InstalmentsBeforeMovedTerm<R extends MovedTermScheduleRow = MovedTermScheduleRow> {
    Line: MovedTermLine;
    Rows: R[];
}

/** Half a penny: the money columns are DECIMAL(18,2), so anything finer is float noise. */
const PENNY_TOLERANCE = 0.005;

/**
 * The moved lines whose new start comes after more of the schedule than the rest of the order
 * accounts for, each with the instalments due before that start. Empty when nothing is early.
 *
 * `orderGross` is the whole order's gross. A cancelled row has left the schedule and is ignored. A
 * line whose settled start equals its stated start did not move and is ignored.
 */
export function FindInstalmentsBeforeMovedTerms<R extends MovedTermScheduleRow>(
    rows: readonly R[],
    lines: readonly MovedTermLine[],
    orderGross: number,
): InstalmentsBeforeMovedTerm<R>[] {
    const moved = lines.filter((l) => l.SettledStart > l.StatedStart);
    if (moved.length === 0) return [];
    const live = rows
        .filter((r) => r.Status !== 'Canceled' && ToISODate(r.DueDate) !== null)
        .sort((a, b) => Number(a.InstallmentNumber ?? 0) - Number(b.InstallmentNumber ?? 0));
    if (live.length === 0) return [];

    const found: InstalmentsBeforeMovedTerm<R>[] = [];
    for (const line of moved) {
        const early = live.filter((r) => ToISODate(r.DueDate)! < line.SettledStart);
        if (early.length === 0) continue;
        const dueEarly = early.reduce((sum, r) => sum + Number(r.Amount ?? 0), 0);
        // What the order's other lines can account for before this start: everything except the
        // moved lines that start on or after it.
        const startingLater = moved
            .filter((m) => m.SettledStart >= line.SettledStart)
            .reduce((sum, m) => sum + Number(m.LineTotalGross ?? 0), 0);
        if (dueEarly - (orderGross - startingLater) > PENNY_TOLERANCE) found.push({ Line: line, Rows: early });
    }
    return found;
}

/** `Instalment 1 (due 2026-12-01)` or `Instalments 1, 2 and 3 (due 2026-12-01 to 2027-06-01)`. */
function describeRows(rows: readonly MovedTermScheduleRow[]): string {
    const numbers = rows.map((r) => String(r.InstallmentNumber ?? '?'));
    const list = numbers.length === 1 ? numbers[0] : `${numbers.slice(0, -1).join(', ')} and ${numbers[numbers.length - 1]}`;
    const first = ToISODate(rows[0].DueDate);
    const last = ToISODate(rows[rows.length - 1].DueDate);
    const due = first === last ? `due ${first}` : `due ${first} to ${last}`;
    return `${rows.length === 1 ? 'Instalment' : 'Instalments'} ${list} (${due})`;
}

/** One sentence per line: where it now runs, which instalments fall before that, and the two ways out. */
export function DescribeInstalmentsBeforeMovedTerm(found: InstalmentsBeforeMovedTerm): string {
    const { Line: line, Rows: rows } = found;
    const which = line.LineNumber != null ? `Line ${line.LineNumber}` : 'A line';
    const product = line.Product ? ` (${line.Product})` : '';
    const runs = line.SettledEnd ? `${line.SettledStart} to ${line.SettledEnd}` : `from ${line.SettledStart}`;
    const entered = line.StatedEnd ? `${line.StatedStart} to ${line.StatedEnd}` : `from ${line.StatedStart}`;
    const fall = rows.length === 1 ? 'falls' : 'fall';
    return (
        `${which}${product} becomes the next term of a subscription the customer already holds, so it runs ` +
        `${runs}, not ${entered} as entered. ${describeRows(rows)} ${fall} due before that term starts.`
    );
}

/** The confirm's refusal: every line found, then what to do. */
export function ExplainInstalmentsBeforeMovedTerms(orderNumber: string | null, found: readonly InstalmentsBeforeMovedTerm[]): string {
    const order = orderNumber ? `Order ${orderNumber}` : 'The order';
    return (
        `${order} was not confirmed. ${found.map(DescribeInstalmentsBeforeMovedTerm).join(' ')} ` +
        `Move those instalments into the new term, or choose "New subscription" on the line to keep the dates entered.`
    );
}
