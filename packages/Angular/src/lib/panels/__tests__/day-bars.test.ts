/**
 * `BuildDayBars` — the seven-bar window both dashboards share.
 *
 * The defect this guards: a bar's Label used to come from the VIEWER's own clock while its Value
 * came from the BUSINESS day — see the module doc on `BuildDayBars` for the full story. These tests
 * pin the machine's zone to one that disagrees with the business zone at the instant under test,
 * the same way `date-cell.test.ts` does for `Today`/`LocalDay`, so a regression back to per-instant
 * labelling has something to fail against instead of passing by host-zone coincidence.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BusinessTimeZoneEngine, type InstanceConfigurationRow } from '@mj-biz-apps/common-entities';
import { BuildDayBars } from '../day-bars';

describe('BuildDayBars', () => {
    // Same singleton-engine setup as packages/Entities/src/__tests__/date-cell.test.ts.
    const engine = BusinessTimeZoneEngine.Instance as unknown as { _configurations: InstanceConfigurationRow[]; _loaded: boolean };
    const original = { rows: engine._configurations, loaded: engine._loaded };
    afterEach(() => {
        engine._configurations = original.rows;
        engine._loaded = original.loaded;
    });

    /** See date-cell.test.ts's `AT` for why this pin — and its careful restore — exists. */
    const AT = (tz: string, fn: () => void) => {
        const original = process.env.TZ;
        process.env.TZ = tz;
        try {
            fn();
        } finally {
            if (original === undefined) {
                delete process.env.TZ;
            } else {
                process.env.TZ = original;
            }
        }
    };

    it("labels every bar with ITS OWN key's weekday, even when the viewer's machine sits east of the business zone", () => {
        engine._configurations = [
            {
                FeatureKey: 'BizApps.BusinessTimeZone',
                Value: '{"iana":"America/Chicago","sql":"Central Standard Time"}',
                DefaultValue: '{"iana":"UTC","sql":"UTC"}',
            },
        ];
        engine._loaded = true;

        vi.useFakeTimers();
        // 9 PM CDT on the 27th: business Today() is 2026-08-27. In Asia/Kolkata (+5:30) this same
        // instant is 07:30 on the 28th — a full calendar day later, so a label built from the
        // viewer's own clock disagrees with a label built from the business key at every one of
        // the seven bars, not just at a boundary.
        vi.setSystemTime(new Date('2026-08-28T02:00:00.000Z'));
        try {
            AT('Asia/Kolkata', () => {
                const seenKeys: string[] = [];
                const bars = BuildDayBars((iso) => {
                    seenKeys.push(iso);
                    return 1;
                });

                expect(bars).toHaveLength(7);
                // The seven business-calendar keys walking back from Today(), oldest first.
                expect(seenKeys).toEqual([
                    '2026-08-21',
                    '2026-08-22',
                    '2026-08-23',
                    '2026-08-24',
                    '2026-08-25',
                    '2026-08-26',
                    '2026-08-27',
                ]);
                // Independently known weekdays for those seven business days (verified against a
                // real calendar, not derived from the code under test).
                expect(bars.map((b) => b.Label)).toEqual(['Fri', 'Sat', 'Sun', 'Mon', 'Tue', 'Wed', 'Thu']);
                // Under the bug this replaces (the viewer's own clock, in Kolkata, a day ahead),
                // the labels would have read one weekday later across the board: ['Sat', 'Sun',
                // 'Mon', 'Tue', 'Wed', 'Thu', 'Fri'] — this assertion is what catches that.

                expect(bars[6].Current).toBe(true);
                expect(bars.slice(0, 6).every((b) => b.Current !== true)).toBe(true);
            });
        } finally {
            vi.useRealTimers();
        }
    });

    it('passes each bar its own key, so the caller can compute a value with no drift from the label', () => {
        engine._configurations = [
            {
                FeatureKey: 'BizApps.BusinessTimeZone',
                Value: '{"iana":"America/Chicago","sql":"Central Standard Time"}',
                DefaultValue: '{"iana":"UTC","sql":"UTC"}',
            },
        ];
        engine._loaded = true;

        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-08-28T02:00:00.000Z'));
        try {
            const rows = ['2026-08-24', '2026-08-27', '2026-08-27'];
            const bars = BuildDayBars((iso) => rows.filter((r) => r === iso).length);
            expect(bars.find((b) => b.Current)?.Value).toBe(2); // today, 2026-08-27, has two rows
            expect(bars.reduce((sum, b) => sum + b.Value, 0)).toBe(3);
        } finally {
            vi.useRealTimers();
        }
    });
});
