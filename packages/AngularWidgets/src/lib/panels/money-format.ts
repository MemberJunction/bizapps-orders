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
    /** Drop the cents. For dashboard tiles where two decimals add nothing. */
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
    const zeroText = options.Zero ?? `${symbol}0.00`;
    if (value === 0) return zeroText;

    const digits = options.Round ? 0 : 2;
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
 * ```
 */
export function FormatDate(iso: string | null | undefined, options: { Short?: boolean } = {}): string {
    if (!iso) return '—';
    const [datePart] = String(iso).split('T');
    const [y, m, d] = datePart.split('-').map(Number);
    if (!y || !m || !d) return '—';
    const date = new Date(y, m - 1, d);
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
 */
export function DaysSince(iso: string | null | undefined, asOf: string): number {
    if (!iso) return 0;
    const parse = (s: string): number => {
        const [y, m, d] = String(s).split('T')[0].split('-').map(Number);
        return new Date(y, m - 1, d).getTime();
    };
    return Math.round((parse(asOf) - parse(iso)) / 86_400_000);
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
