import { afterEach, describe, it, expect, vi } from 'vitest';
import { BusinessTimeZoneEngine, type InstanceConfigurationRow } from '@mj-biz-apps/common-entities';
import { ToISODate, ISOYear, IsBefore, Today, LocalDay, TodayAsDateValue, type DateCell } from '../date-cell';

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

describe('Today and LocalDay answer in the BUSINESS zone, not the browser or the server', () => {
    // The engine is a singleton; before it is configured it resolves UTC. These tests set the
    // instance up the way a loaded engine would look, then restore it.
    const engine = BusinessTimeZoneEngine.Instance as unknown as { _configurations: InstanceConfigurationRow[]; _loaded: boolean };
    const original = { rows: engine._configurations, loaded: engine._loaded };
    const central = (): void => {
        engine._configurations = [{ FeatureKey: 'BizApps.BusinessTimeZone', Value: '{"iana":"America/Chicago","sql":"Central Standard Time"}', DefaultValue: '{"iana":"UTC","sql":"UTC"}' }];
        engine._loaded = true;
    };
    afterEach(() => {
        engine._configurations = original.rows;
        engine._loaded = original.loaded;
    });

    /**
     * Pin the MACHINE's zone to one that disagrees with the business zone at the instant under
     * test — otherwise these tests cannot fail. Measured: on a machine in America/New_York the
     * chosen instants land on the same day in New York and Chicago, so a `Today()` that wrongly
     * read local parts passed all of them. Asia/Kolkata is +5:30 against Chicago's -5:00, so the
     * two disagree across the evening and the assertion has something to catch.
     *
     * Note this is a different rule from the one in `business-day.test.ts` upstream, which needs a
     * WEST-of-Greenwich pin: there the question is UTC parts versus local parts of a UTC-midnight
     * value; here it is business zone versus machine zone of an arbitrary instant. Any zone that
     * disagrees with Central at the instant works — do not "simplify" this to Chicago.
     */
    const AT = (tz: string, fn: () => void) => {
        const original = process.env.TZ;
        process.env.TZ = tz;
        try {
            fn();
        } finally {
            // `process.env.TZ = undefined` coerces to the literal string `'undefined'` — Node env
            // vars are always strings — which this ICU build then resolves as UTC, leaking a false
            // "ambient zone" into every test that runs after this one in the same worker. Delete
            // the key outright when there was nothing to restore.
            if (original === undefined) {
                delete process.env.TZ;
            } else {
                process.env.TZ = original;
            }
        }
    };

    it('Today is the Central calendar day even when the runner sits east of UTC', () => {
        central();
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-08-28T02:00:00.000Z')); // 9 PM CDT on the 27th
        try {
            AT('Asia/Kolkata', () => {
                expect(Today()).toBe('2026-08-27');
            });
        } finally {
            vi.useRealTimers();
        }
    });

    it('LocalDay buckets an instant on its Central day', () => {
        central();
        AT('Asia/Kolkata', () => {
            expect(LocalDay(new Date('2026-07-31T03:30:00.000Z'))).toBe('2026-07-30');
        });
        expect(LocalDay(new Date('nonsense'))).toBe('');
    });

    it('answers UTC before the engine is loaded, so nothing throws on a cold start', () => {
        engine._loaded = false;
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-08-28T02:00:00.000Z'));
        try {
            // Pinned WEST of Greenwich (America/Chicago), per the plan's global constraint for a
            // UTC-parts-vs-local-parts comparison: on a UTC CI runner the two agree for this
            // instant regardless of which reading the code does, so an unpinned machine zone lets
            // this pass whether or not the bug is present. Chicago disagrees with UTC here (21:00
            // on the 27th vs. 02:00 on the 28th), so the assertion has something to catch.
            AT('America/Chicago', () => {
                expect(Today()).toBe('2026-08-28');
            });
        } finally {
            vi.useRealTimers();
        }
    });
});

describe('TodayAsDateValue', () => {
    it('round-trips through ToISODate as the LOCAL calendar day', () => {
        // The whole contract: assign it to a date-typed field, read it back with any UTC-parts
        // reader, and it is still the day the user's clock showed — not the UTC day, which is
        // already tomorrow for part of every evening in the Americas' zones' mirror image (and
        // was the bug: a price created at 8pm Central stamped EffectiveFrom with tomorrow).
        expect(ToISODate(TodayAsDateValue())).toBe(Today());
    });

    it('is pinned to midnight UTC, the shape a SQL date column round-trips as', () => {
        const v = TodayAsDateValue();
        expect(v.getUTCHours()).toBe(0);
        expect(v.getUTCMinutes()).toBe(0);
        expect(v.getUTCSeconds()).toBe(0);
        expect(v.getUTCMilliseconds()).toBe(0);
    });
});
