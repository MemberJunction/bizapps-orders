/**
 * @fileoverview Money and quantity formatting — pure functions plus the pipes that wrap them.
 *
 * WHY THIS IS ITS OWN FILE. Every screen in this app is mostly numbers, and the
 * rules for rendering them are not obvious: a zero balance reads better as an
 * em-dash than as `$0.00`; a credit is a negative balance that should read as a
 * positive amount in a credit context; a document uses parentheses for negatives
 * where a worklist uses a minus sign. Scattering those choices across templates
 * guarantees they diverge. Here they are pure functions with tests.
 *
 * The pure half has no Angular import path of its own so it can be unit-tested
 * directly, which is most of the value.
 *
 * @module @mj-biz-apps/orders-ng
 */

import { Pipe, PipeTransform } from '@angular/core';
import { LocalDay, ToISODate, type DateCell } from '@mj-biz-apps/orders-entities';

/** How a negative amount is written. */
export type MJOMoneySign =
    /** `−$85.00` — the worklist default; scans fastest in a column. */
    | 'minus'
    /** `($85.00)` — accounting convention, used on the rendered document. */
    | 'parentheses'
    /** `$85.00` — for contexts that already say "credit" in words. */
    | 'absolute';

export interface MJOMoneyOptions {
    /** Default `'minus'`. */
    Sign?: MJOMoneySign;
    /**
     * What to render for exactly zero. Default `'$0.00'`. Pass `'—'` in balance
     * columns, where a row of zeroes is noise and the eye wants the non-zero ones.
     */
    Zero?: string;
    /**
     * Drop the cents (and `$0.00` becomes `$0`). For dashboard tiles, and for
     * a header trio that is all whole dollars.
     */
    Round?: boolean;
    /** Default `'$'`. Currency is single-currency today; this is the seam. */
    Symbol?: string;
}

/**
 * Format an amount as money.
 *
 * @example
 * ```typescript
 * FormatMoney(1621.57)                          // '$1,621.57'
 * FormatMoney(-85)                              // '−$85.00'
 * FormatMoney(-85, { Sign: 'parentheses' })     // '($85.00)'
 * FormatMoney(0, { Zero: '—' })                 // '—'
 * FormatMoney(41230, { Round: true })           // '$41,230'
 * FormatMoney(null)                             // '—'
 * ```
 */
export function FormatMoney(value: number | null | undefined, options: MJOMoneyOptions = {}): string {
    if (value === null || value === undefined || Number.isNaN(value)) return '—';

    const symbol = options.Symbol ?? '$';
    const digits = options.Round ? 0 : 2;
    const zeroText = options.Zero ?? `${symbol}${digits === 0 ? '0' : '0.00'}`;
    if (value === 0) return zeroText;
    const body =
        symbol +
        Math.abs(value).toLocaleString('en-US', {
            minimumFractionDigits: digits,
            maximumFractionDigits: digits,
        });

    if (value > 0) return body;

    switch (options.Sign ?? 'minus') {
        case 'parentheses':
            return `(${body})`;
        case 'absolute':
            return body;
        default:
            // U+2212 MINUS SIGN, not a hyphen: it aligns with digits in a tabular
            // column, which a hyphen does not.
            return `−${body}`;
    }
}

/**
 * True when the amount has a non-zero cent part (after rounding to the
 * nearest cent). Null / NaN do not count — they are not displayed as money.
 */
export function HasCents(value: number | null | undefined): boolean {
    if (value == null || !Number.isFinite(value)) return false;
    return Math.round(Math.abs(value) * 100) % 100 !== 0;
}

/**
 * Format several amounts with one shared cents policy: if any has cents,
 * all show two decimals; otherwise none do. Used for the order-header
 * Total / Paid / Balance trio so the three figures stay aligned.
 */
export function FormatMoneyGroup(
    values: ReadonlyArray<number | null | undefined>,
    options: MJOMoneyOptions = {},
): string[] {
    const hideCents = options.Round === true || !values.some(HasCents);
    return values.map((value) => FormatMoney(value, { ...options, Round: hideCents }));
}

/**
 * Format a quantity. Whole numbers lose their decimals, because `5` is easier to
 * read than `5.00` and fractional quantities are the exception (a prorated
 * subscription line, a partial return).
 *
 * @example
 * ```typescript
 * FormatQuantity(5)       // '5'
 * FormatQuantity(0.5833)  // '0.5833'
 * FormatQuantity(-1)      // '-1'
 * ```
 */
export function FormatQuantity(value: number | null | undefined): string {
    if (value === null || value === undefined || Number.isNaN(value)) return '—';
    if (Number.isInteger(value)) return String(value);
    // Up to four places, trailing zeros trimmed — the column is DECIMAL(18,4).
    return String(Number(value.toFixed(4)));
}

/**
 * Format money for a space where the full figure will not fit — a chart label,
 * a dense chip, a column head.
 *
 * A bar chart cannot carry `$1,250.00` above a 40px column, so the choice is
 * between an unlabelled bar and an abbreviated number. Unlabelled loses: the bar
 * only shows RELATIVE size, so a lone tall column reads as "the biggest" without
 * ever saying how big. The exact value stays available on hover and in the
 * component's aria-label, so nothing is lost by rounding the visible one.
 *
 * Thresholds are the conventional ones and the rounding is deliberately coarse —
 * one decimal below 10, none above, because the label is for orientation and the
 * precise figure is one hover away.
 *
 * @example
 * ```typescript
 * FormatCompact(0)       // '—'
 * FormatCompact(940)     // '$940'
 * FormatCompact(1250)    // '$1.3k'
 * FormatCompact(8000)    // '$8k'
 * FormatCompact(24500)   // '$25k'
 * FormatCompact(1250000) // '$1.3M'
 * ```
 */
export function FormatCompact(value: number | null | undefined): string {
    if (value === null || value === undefined || Number.isNaN(value)) return '—';
    if (value === 0) return '—';
    const sign = value < 0 ? '-' : '';
    const n = Math.abs(value);
    const scale = (divisor: number, suffix: string): string => {
        const scaled = n / divisor;
        // One decimal only while it still adds information; 9.7k is useful, 97.3k is noise.
        const text = scaled < 10 ? String(Number(scaled.toFixed(1))) : String(Math.round(scaled));
        return `${sign}$${text}${suffix}`;
    };
    if (n >= 1_000_000_000) return scale(1_000_000_000, 'B');
    if (n >= 1_000_000) return scale(1_000_000, 'M');
    if (n >= 1_000) return scale(1_000, 'k');
    return `${sign}$${Math.round(n)}`;
}

/**
 * Format a rate as a percentage, trimming pointless zeros.
 *
 * @example
 * ```typescript
 * FormatRate(0.0625)  // '6.25%'
 * FormatRate(0.1)     // '10%'
 * FormatRate(0.0225)  // '2.25%'
 * ```
 */
export function FormatRate(value: number | null | undefined): string {
    if (value === null || value === undefined || Number.isNaN(value)) return '—';
    const pct = value * 100;
    return `${Number(pct.toFixed(4))}%`;
}

/**
 * Format a DATE-ONLY value — a SQL `date` column — for display.
 *
 * A date column has no time and no zone; it names a calendar day, and this prints that day in every
 * browser. Two shapes reach here:
 *
 * - an ISO string (`'2026-08-01'`, or `'2026-08-01T00:00:00.000Z'` off the wire): its leading
 *   `YYYY-MM-DD` is the day. `new Date('2026-08-01')` would be midnight UTC, which renders as July 31
 *   anywhere west of Greenwich — so the string is read, never parsed.
 * - a `Date` off an entity: the driver materialises a date column at midnight UTC on its day, so the
 *   day is its UTC day ({@link ToISODate}). LOCAL getters on that value gave a payment dated Oct 1
 *   "Sep 30" in its own header for every user in the Americas (golive #168).
 *
 * **NOT FOR TIMESTAMPS.** A `datetimeoffset` (`EventStartsAt`, `OccurredAt`, a promotion's
 * `EffectiveFrom`) is an instant, and its day is the business day it fell on — use
 * {@link FormatInstantDate}. This function does not guess which one it was handed: an instant at
 * 7:00 PM Central is exactly midnight UTC, indistinguishable by value from a date column, and a
 * heuristic printed it as the next day.
 *
 * @example
 * ```typescript
 * FormatDate('2026-08-01')                    // 'Aug 1, 2026'
 * FormatDate('2026-08-01', { Short: true })   // 'Aug 1'
 * FormatDate(order.OrderDate)                 // a Date off an entity works too
 * ```
 */
export function FormatDate(
    value: DateCell,
    options: { Short?: boolean } = {},
): string {
    return formatDay(dateOnlyDay(value), options);
}

/**
 * Format a TIMESTAMP — a `datetimeoffset` — as the BUSINESS calendar day it fell on.
 *
 * The issue's rule (golive #168): a true timestamp displays converted to the business zone, so
 * 7:00 PM Central on Oct 1 (`2026-10-02T00:00:00Z`) reads "Oct 1" for a viewer in Chicago, Pune or
 * Auckland alike — not the UTC day, and not the viewer's.
 *
 * Accepts a `Date` or an ISO string carrying a time and offset (`Z` or `±hh:mm`), which is parsed as
 * the instant it names. A bare `YYYY-MM-DD` carries no instant and is read as that day.
 *
 * For a `date` column use {@link FormatDate}.
 *
 * @example
 * ```typescript
 * FormatInstantDate(event.EventStartsAt)                          // 'Oct 1, 2026'
 * FormatInstantDate('2026-10-02T00:00:00Z', { Short: true })      // 'Oct 1' (business zone Central)
 * ```
 */
export function FormatInstantDate(
    value: DateCell,
    options: { Short?: boolean } = {},
): string {
    return formatDay(instantDay(value), options);
}

/**
 * Whole days between two DATE-ONLY values. Positive means `value` is in the past — i.e. "days
 * overdue", which is the only way this is used.
 *
 * @example
 * ```typescript
 * DaysSince('2026-06-15', '2026-07-29')  // 44
 * DaysSince(order.DueDate, Today())       // a Date off an entity works too
 * ```
 *
 * Both sides read as {@link FormatDate} reads them; `asOf` is normally `Today()`, the business day.
 */
export function DaysSince(
    value: DateCell,
    asOf: Date | string,
): number {
    const from = dateOnlyDay(value);
    const to = dateOnlyDay(asOf);
    if (!from || !to) return 0;
    return Math.round((Date.UTC(...to) - Date.UTC(...from)) / 86_400_000);
}

/** A calendar day as `[year, monthIndex, day]`. */
type CalendarDay = [number, number, number];

/** The day a DATE-ONLY cell names: a `Date` by its UTC parts, a string by its leading `YYYY-MM-DD`. */
function dateOnlyDay(value: DateCell): CalendarDay | null {
    if (!value) return null;
    if (value instanceof Date) return parseDay(ToISODate(value));
    return parseDay(String(value));
}

/** The BUSINESS day an instant fell on. A bare `YYYY-MM-DD` string has no instant and is that day. */
function instantDay(value: DateCell): CalendarDay | null {
    if (!value) return null;
    if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value.trim())) return parseDay(value.trim());
    const instant = value instanceof Date ? value : new Date(String(value));
    if (Number.isNaN(instant.getTime())) return null;
    return parseDay(LocalDay(instant));
}

/** `[y, m - 1, d]` from a leading `YYYY-MM-DD`, or `null` when the text does not start with one. */
function parseDay(text: string | null): CalendarDay | null {
    const match = text ? /^(\d{4})-(\d{2})-(\d{2})/.exec(text) : null;
    if (!match) return null;
    const [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
    if (!y || !m || !d) return null;
    return [y, m - 1, d];
}

/**
 * Print a calendar day. Formatted in UTC from a UTC-midnight carrier, so the browser's zone has no
 * say in which day is printed — it was decided before this point.
 */
function formatDay(day: CalendarDay | null, options: { Short?: boolean }): string {
    if (!day) return '—';
    return new Date(Date.UTC(...day)).toLocaleDateString('en-US', {
        timeZone: 'UTC',
        month: 'short',
        day: 'numeric',
        ...(options.Short ? {} : { year: 'numeric' }),
    });
}

/** Initials for an avatar, capped at two letters. */
export function Initials(name: string | null | undefined): string {
    if (!name) return '?';
    const parts = name.split(/\s+/).filter(Boolean);
    // A whitespace-only name splits to nothing, which would otherwise render an
    // empty avatar circle — visually indistinguishable from a broken one.
    if (!parts.length) return '?';
    return parts
        .slice(0, 2)
        .map((w) => w[0])
        .join('')
        .toUpperCase();
}

/* ────────────────────────────────────────────────────────────────────────────
 * Pipes
 *
 * Thin wrappers, so a template can say `{{ amount | mjoMoney }}` without every
 * component injecting a formatter. Pure (the default), so they memoise.
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * `{{ value | mjoMoney }}` / `{{ value | mjoMoney: { Zero: '—' } }}`
 */
@Pipe({ name: 'mjoMoney', standalone: true })
export class MJOMoneyPipe implements PipeTransform {
    public transform(value: number | null | undefined, options?: MJOMoneyOptions): string {
        return FormatMoney(value, options);
    }
}

/** `{{ value | mjoQuantity }}` */
@Pipe({ name: 'mjoQuantity', standalone: true })
export class MJOQuantityPipe implements PipeTransform {
    public transform(value: number | null | undefined): string {
        return FormatQuantity(value);
    }
}

/** `{{ value | mjoRate }}` */
@Pipe({ name: 'mjoRate', standalone: true })
export class MJORatePipe implements PipeTransform {
    public transform(value: number | null | undefined): string {
        return FormatRate(value);
    }
}

/** `{{ iso | mjoDate }}` / `{{ iso | mjoDate: true }}` for the short form. DATE-ONLY values; see {@link FormatDate}. */
@Pipe({ name: 'mjoDate', standalone: true })
export class MJODatePipe implements PipeTransform {
    public transform(iso: string | null | undefined, short = false): string {
        return FormatDate(iso, { Short: short });
    }
}

/** Every formatting pipe, for a component's `imports` array. */
export const MJO_FORMAT_PIPES = [MJOMoneyPipe, MJOQuantityPipe, MJORatePipe, MJODatePipe] as const;
