/** `FormatDate` with `Numeric`: MM/DD/YYYY, always with the year, from a date-only value's UTC day. */
import { describe, expect, it } from 'vitest';
import { FormatDate, FormatInstantDate } from '../money-format';

describe('FormatDate Numeric', () => {
    it('writes a date column as MM/DD/YYYY', () => {
        expect(FormatDate('2026-08-01', { Numeric: true })).toBe('08/01/2026');
        expect(FormatDate('2027-12-31', { Numeric: true })).toBe('12/31/2027');
        expect(FormatDate(new Date(Date.UTC(2026, 3, 1)), { Numeric: true })).toBe('04/01/2026');
    });

    it('keeps the year even when Short is also asked for, and keeps the dash for nothing', () => {
        expect(FormatDate('2026-08-01', { Numeric: true, Short: true })).toBe('08/01/2026');
        expect(FormatDate(null, { Numeric: true })).toBe('—');
    });

    it('does not change the default wording', () => {
        expect(FormatDate('2026-08-01')).toBe('Aug 1, 2026');
        expect(FormatInstantDate('2026-08-01', { Numeric: true })).toBe('08/01/2026');
    });
});
