/**
 * Formatting tests.
 *
 * These look trivial and are not: every one of them encodes a decision that,
 * gotten wrong, shows a user the wrong number or the wrong day. The date test in
 * particular guards a bug this codebase has already hit once at the engine level.
 */
import { describe, expect, it } from 'vitest';
import {
    DaysSince,
    FormatDate,
    FormatMoney,
    FormatQuantity,
    FormatRate,
    Initials,
    MJODatePipe,
    MJOMoneyPipe,
    MJOQuantityPipe,
    MJORatePipe,
} from '../money-format';

describe('FormatMoney', () => {
    it('formats a positive amount with thousands separators', () => {
        expect(FormatMoney(1621.57)).toBe('$1,621.57');
    });

    it('always shows two decimals', () => {
        expect(FormatMoney(170)).toBe('$170.00');
        expect(FormatMoney(0.5)).toBe('$0.50');
    });

    it('uses a true MINUS SIGN, not a hyphen, so columns align', () => {
        // U+2212. A hyphen is narrower than a digit and breaks tabular alignment.
        expect(FormatMoney(-85)).toBe('−$85.00');
    });

    it('supports accounting parentheses for the document', () => {
        expect(FormatMoney(-85, { Sign: 'parentheses' })).toBe('($85.00)');
    });

    it('supports absolute, for contexts that say "credit" in words', () => {
        expect(FormatMoney(-250, { Sign: 'absolute' })).toBe('$250.00');
    });

    it('renders zero as $0.00 by default', () => {
        expect(FormatMoney(0)).toBe('$0.00');
    });

    it('renders zero as whatever the caller asked for', () => {
        // Balance columns pass '—': a column of $0.00 is noise that hides the
        // rows that actually carry a balance.
        expect(FormatMoney(0, { Zero: '—' })).toBe('—');
    });

    it('rounds for dashboard tiles', () => {
        expect(FormatMoney(41230.44, { Round: true })).toBe('$41,230');
    });

    it('returns an em-dash for null, undefined and NaN', () => {
        expect(FormatMoney(null)).toBe('—');
        expect(FormatMoney(undefined)).toBe('—');
        expect(FormatMoney(Number.NaN)).toBe('—');
    });

    it('honours a different symbol', () => {
        expect(FormatMoney(10, { Symbol: '£' })).toBe('£10.00');
        expect(FormatMoney(0, { Symbol: '£' })).toBe('£0.00');
    });
});

describe('FormatQuantity', () => {
    it('drops decimals on whole numbers', () => {
        expect(FormatQuantity(5)).toBe('5');
    });

    it('keeps a fractional quantity — proration produces them', () => {
        expect(FormatQuantity(0.5833)).toBe('0.5833');
    });

    it('trims trailing zeros rather than padding to four places', () => {
        expect(FormatQuantity(2.5)).toBe('2.5');
    });

    it('keeps the sign — a negative quantity is a reversal', () => {
        expect(FormatQuantity(-1)).toBe('-1');
    });

    it('handles nothing', () => {
        expect(FormatQuantity(null)).toBe('—');
    });
});

describe('FormatRate', () => {
    it('formats a tax rate', () => {
        expect(FormatRate(0.0625)).toBe('6.25%');
    });

    it('trims pointless zeros', () => {
        expect(FormatRate(0.1)).toBe('10%');
        expect(FormatRate(0.0225)).toBe('2.25%');
    });

    it('handles nothing', () => {
        expect(FormatRate(null)).toBe('—');
    });
});

describe('FormatDate', () => {
    it('formats a full date', () => {
        expect(FormatDate('2026-08-01')).toBe('Aug 1, 2026');
    });

    it('formats a short date', () => {
        expect(FormatDate('2026-08-01', { Short: true })).toBe('Aug 1');
    });

    it('does NOT shift the day for anyone west of Greenwich', () => {
        // The bug this guards: `new Date('2026-08-01')` parses as UTC midnight,
        // which renders as July 31 in any negative-offset zone. A date-only column
        // carries no time zone, so it must be parsed as local.
        expect(FormatDate('2026-08-01')).toContain('Aug 1');
        expect(FormatDate('2026-01-01')).toBe('Jan 1, 2026');
    });

    it('tolerates a full timestamp', () => {
        expect(FormatDate('2026-08-01T14:30:00Z')).toBe('Aug 1, 2026');
    });

    it('handles nothing and garbage', () => {
        expect(FormatDate(null)).toBe('—');
        expect(FormatDate('')).toBe('—');
        expect(FormatDate('not-a-date')).toBe('—');
    });
});

describe('DaysSince', () => {
    it('counts days past due', () => {
        expect(DaysSince('2026-06-15', '2026-07-29')).toBe(44);
    });

    it('is zero on the due date itself', () => {
        expect(DaysSince('2026-07-29', '2026-07-29')).toBe(0);
    });

    it('goes negative for a future date', () => {
        expect(DaysSince('2026-08-28', '2026-07-29')).toBe(-30);
    });

    it('crosses a daylight-saving boundary without drifting', () => {
        // Rounding rather than flooring is what makes this hold: a DST transition
        // makes one "day" 23 or 25 hours long.
        expect(DaysSince('2026-03-01', '2026-04-01')).toBe(31);
        expect(DaysSince('2026-10-15', '2026-11-15')).toBe(31);
    });

    it('handles nothing', () => {
        expect(DaysSince(null, '2026-07-29')).toBe(0);
    });
});

describe('Initials', () => {
    it('takes the first letter of the first two words', () => {
        expect(Initials('Jane Chen')).toBe('JC');
        expect(Initials('Meridian Association')).toBe('MA');
    });

    it('caps at two even for long names', () => {
        expect(Initials('Blue Cypress Media LLC')).toBe('BC');
    });

    it('handles one word', () => {
        expect(Initials('Meridian')).toBe('M');
    });

    it('handles nothing', () => {
        expect(Initials(null)).toBe('?');
        expect(Initials('')).toBe('?');
        expect(Initials('   ')).toBe('?');
    });
});

describe('pipes wrap the pure functions', () => {
    it('mjoMoney', () => {
        expect(new MJOMoneyPipe().transform(1621.57)).toBe('$1,621.57');
        expect(new MJOMoneyPipe().transform(0, { Zero: '—' })).toBe('—');
    });

    it('mjoQuantity', () => {
        expect(new MJOQuantityPipe().transform(5)).toBe('5');
    });

    it('mjoRate', () => {
        expect(new MJORatePipe().transform(0.0625)).toBe('6.25%');
    });

    it('mjoDate', () => {
        expect(new MJODatePipe().transform('2026-08-01')).toBe('Aug 1, 2026');
        expect(new MJODatePipe().transform('2026-08-01', true)).toBe('Aug 1');
    });
});
