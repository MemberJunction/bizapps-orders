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
import type { DateCell } from '@mj-biz-apps/orders-entities';

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
 * Format an ISO date for display.
 *
 * Parsed as LOCAL rather than UTC on purpose. A date-only column carries no time
 * zone, and `new Date('2026-08-01')` is parsed as UTC midnight — which renders as
 * July 31st for anyone west of Greenwich. Splitting the string avoids handing the
 * user a date one day earlier than the one stored.
 *
 * @example
 * ```typescript
 * FormatDate('2026-08-01')                    // 'Aug 1, 2026'
 * FormatDate('2026-08-01', { Short: true })   // 'Aug 1'
 * FormatDate(order.OrderDate)                 // a Date off an entity works too
 * ```
 *
 * ACCEPTS A `Date` AS WELL AS AN ISO STRING, and that is not convenience. A date column is a `Date`
 * on an entity and an ISO string on the wire, so a screen holds one or the other depending on how it
 * read the row. Given a `Date`, the old string-splitting path found no '-' to split on and returned
 * '—' — an empty-looking cell that reads as "no date" rather than as the type mismatch it was.
 */
export function FormatDate(
    value: DateCell,
    options: { Short?: boolean } = {},
): string {
    const date = toLocalDate(value);
    if (!date) return '—';
    return date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        ...(options.Short ? {} : { year: 'numeric' }),
    });
}

/**
 * Whole days between an ISO date and a reference point. Positive means the date
 * is in the past — i.e. "days overdue", which is the only way this is used.
 *
 * @example
 * ```typescript
 * DaysSince('2026-06-15', '2026-07-29')  // 44
 * ```
 *
 * Takes a `Date` on either side for the same reason {@link FormatDate} does.
 */
export function DaysSince(
    value: DateCell,
    asOf: Date | string,
): number {
    const from = toLocalDate(value);
    const to = toLocalDate(asOf);
    if (!from || !to) return 0;
    return Math.round((to.getTime() - from.getTime()) / 86_400_000);
}

/**
 * A calendar date at LOCAL midnight, from either representation.
 *
 * The time-of-day is dropped on purpose: everything these helpers answer — what day is this, how
 * many days ago was it — is a question about calendar days, and keeping the clock in would make
 * "yesterday at 23:00" and "today at 01:00" two days apart in one timezone and one in another.
 */
function toLocalDate(value: Date | string | null | undefined): Date | null {
    if (!value) return null;
    if (value instanceof Date) {
        if (Number.isNaN(value.getTime())) return null;
        return new Date(value.getFullYear(), value.getMonth(), value.getDate());
    }
    const [y, m, d] = String(value).split('T')[0].split('-').map(Number);
    if (!y || !m || !d) return null;
    return new Date(y, m - 1, d);
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

/** `{{ iso | mjoDate }}` / `{{ iso | mjoDate: true }}` for the short form. */
@Pipe({ name: 'mjoDate', standalone: true })
export class MJODatePipe implements PipeTransform {
    public transform(iso: string | null | undefined, short = false): string {
        return FormatDate(iso, { Short: short });
    }
}

/** Every formatting pipe, for a component's `imports` array. */
export const MJO_FORMAT_PIPES = [MJOMoneyPipe, MJOQuantityPipe, MJORatePipe, MJODatePipe] as const;
