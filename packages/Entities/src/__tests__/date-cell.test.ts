import { describe, it, expect } from 'vitest';
import { ToISODate, ISOYear, IsBefore, Today, LocalDay, type DateCell } from '../date-cell';

/**
 * Tier 1 for reading a date cell.
 *
 * Every case below is one that `String(cell).slice(0, 10)` gets wrong, and the reason this file
 * exists is that none of them throw. They return a plausible string, and it travels.
 */

/** A SQL `date` column as the driver materialises it: midnight UTC on that calendar day. */
function driverDate(iso: string): Date {
    return new Date(`${iso}T00:00:00.000Z`);
}

describe('ToISODate', () => {
    it('passes an ISO day through untouched', () => {
        expect(ToISODate('2026-07-30')).toBe('2026-07-30');
    });

    it('takes the day off a full ISO timestamp', () => {
        expect(ToISODate('2026-07-30T14:22:05.123Z')).toBe('2026-07-30');
    });

    it('reads a Date as the calendar day the driver meant, not String(date).slice(0, 10)', () => {
        // THE BUG THIS FILE EXISTS FOR. `String(new Date(...))` is 'Thu Jul 30 2026 …', so the old
        // idiom produced 'Thu Jul 30' — which prints on an invoice and compares as less than nothing.
        const cell = driverDate('2026-07-30');
        expect(String(cell).slice(0, 10)).not.toBe('2026-07-30'); // the shape of the old failure
        expect(ToISODate(cell)).toBe('2026-07-30');
    });

    it('reads UTC parts, so a date column does not slip a day west of Greenwich', () => {
        // A `date` column has no time; the driver pins it to midnight UTC. Reading LOCAL parts in a
        // negative-offset zone reports the day before — filing an order in the wrong period while
        // every total still reconciles.
        expect(ToISODate(new Date(Date.UTC(2026, 0, 1, 0, 0, 0)))).toBe('2026-01-01');
    });

    it('is null for absent values rather than epoch 1970', () => {
        for (const empty of [null, undefined, ''] as DateCell[]) {
            expect(ToISODate(empty)).toBeNull();
        }
    });

    it('is null for an unparseable value rather than the string "Invalid Date"', () => {
        expect(ToISODate('not a date')).toBeNull();
        expect(ToISODate(new Date('nonsense'))).toBeNull();
    });

    it('is idempotent, so a value already read once survives being read again', () => {
        const once = ToISODate(driverDate('2026-07-30'));
        expect(ToISODate(once)).toBe('2026-07-30');
    });
});

describe('ISOYear', () => {
    it('reads the year off either shape', () => {
        expect(ISOYear('2026-07-30')).toBe('2026');
        expect(ISOYear(driverDate('2026-07-30'))).toBe('2026');
    });

    it('does not return the weekday, which is what the old slice(0, 4) produced', () => {
        expect(ISOYear(driverDate('2026-07-30'))).not.toBe('Thu ');
    });

    it('is null with nothing to read', () => {
        expect(ISOYear(null)).toBeNull();
    });
});

describe('IsBefore', () => {
    it('compares by calendar day, in both shapes', () => {
        expect(IsBefore('2026-07-29', '2026-07-30')).toBe(true);
        expect(IsBefore(driverDate('2026-07-29'), '2026-07-30')).toBe(true);
    });

    it('is false on the day itself — due today is not yet overdue', () => {
        expect(IsBefore(driverDate('2026-07-30'), '2026-07-30')).toBe(false);
    });

    it('finds the overdue rows a raw string comparison silently missed', () => {
        // The live defect: 'Thu Jul 30' < '2026-07-31' is FALSE, because letters sort after digits.
        // Every overdue row read as current, and the count showed zero with total confidence.
        const overdue = driverDate('2026-07-30');
        expect(String(overdue).slice(0, 10) < '2026-07-31').toBe(false); // the old answer
        expect(IsBefore(overdue, '2026-07-31')).toBe(true); // the true one
    });

    it('treats a missing date as NOT overdue — absence is not evidence of lateness', () => {
        expect(IsBefore(null, '2026-07-30')).toBe(false);
        expect(IsBefore(undefined, '2026-07-30')).toBe(false);
        expect(IsBefore('not a date', '2026-07-30')).toBe(false);
    });
});

describe('Today and LocalDay', () => {
    it('Today is the LOCAL calendar day', () => {
        const now = new Date();
        const expected = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
        expect(Today()).toBe(expected);
    });

    it('LocalDay keeps a bucket key on the same day as its label', () => {
        // The dashboards build a Date, label it with toLocaleDateString (LOCAL) and used to key it
        // with toISOString (UTC). Wherever those disagree — evenings in the Americas, mornings in
        // Asia — the bar said 'Mon' and counted Tuesday.
        const evening = new Date(2026, 6, 30, 21, 30);
        expect(LocalDay(evening)).toBe('2026-07-30');

        // Asserted only where the two genuinely differ, so this passes in a UTC CI container too.
        const offsetMinutes = evening.getTimezoneOffset();
        if (offsetMinutes > 0) {
            expect(evening.toISOString().slice(0, 10)).toBe('2026-07-31'); // what it used to key on
        }
        // The invariant that holds in every zone: the key agrees with the label's own day.
        expect(LocalDay(evening)).toBe(
            `${evening.getFullYear()}-${String(evening.getMonth() + 1).padStart(2, '0')}-${String(evening.getDate()).padStart(2, '0')}`,
        );
    });

    it('LocalDay zero-pads single-digit months and days', () => {
        expect(LocalDay(new Date(2026, 0, 5))).toBe('2026-01-05');
    });
});
