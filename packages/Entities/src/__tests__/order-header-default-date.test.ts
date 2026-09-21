/**
 * The order-date default is the whole reason bc-aidp-next-golive#168 was filed: `new Date()` is an
 * instant, an instant serialises in UTC, and an order entered at 9 PM Eastern on the 27th was dated
 * the 28th. The default has to be the business calendar day pinned to UTC midnight.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BusinessTimeZoneEngine, type InstanceConfigurationRow } from '@mj-biz-apps/common-entities';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { ToISODate, TodayAsDateValue } from '../date-cell';

const engine = BusinessTimeZoneEngine.Instance as unknown as { _configurations: InstanceConfigurationRow[]; _loaded: boolean };
const original = { rows: engine._configurations, loaded: engine._loaded };
afterEach(() => {
    engine._configurations = original.rows;
    engine._loaded = original.loaded;
    vi.useRealTimers();
});

describe('OrderHeaderEntity defaults OrderDate to the business day', () => {
    it('the entity source no longer defaults OrderDate with new Date()', () => {
        const source = readFileSync(fileURLToPath(new URL('../OrderHeaderEntity.ts', import.meta.url)), 'utf8');
        expect(source).not.toMatch(/OrderDate\s*=\s*new Date\(\)/);
        expect(source).toMatch(/OrderDate\s*=\s*TodayAsDateValue\(\)/);
    });

    it('CheckoutSessionService no longer stamps OrderDate with new Date()', () => {
        const source = readFileSync(fileURLToPath(new URL('../../../CoreEntitiesServer/src/CheckoutSessionService.ts', import.meta.url)), 'utf8');
        expect(source).not.toMatch(/OrderDate\s*=\s*new Date\(\)/);
    });

    /**
     * The two source checks above prove WHICH expression stamps `OrderDate`. They are weak on their
     * own — the text could say `TodayAsDateValue()` while that function silently returned garbage.
     * This proves what the expression actually COMPUTES: pin the business zone to where the bug
     * report happened (Eastern), pin the MACHINE zone somewhere that disagrees with it at the chosen
     * instant (Kolkata is UTC+5:30; at this instant its calendar day is already the 28th, same as
     * UTC's), and fake the clock to 9 PM Eastern on the 27th — the exact scenario from the bug
     * report. `TodayAsDateValue()` must answer the 27th, pinned to midnight UTC, or a `DATE` column
     * round-trips it as the 28th again — reproducing bc-aidp-next-golive#168.
     *
     * The machine-zone pin is defence in depth here rather than strictly load-bearing: both
     * `new Date()` and `TodayAsDateValue()` are demonstrably provably independent of
     * `process.env.TZ` (`CalendarDayIn`/`FromCalendarDay` resolve wall-clock parts via
     * `Intl.DateTimeFormat` with an explicit `timeZone`, never the host's). What actually
     * discriminates old from new here is the UTC/business-zone disagreement at this instant — see
     * the contrasting assertion below. The pin stays anyway, matching this codebase's convention
     * (`date-cell.test.ts`), as a guard against a future change to `Today()`/`TodayAsDateValue()`
     * that reintroduces a local-parts read of the kind bc-aidp-next-golive#168 was filed over.
     *
     * WHAT THIS DOES NOT COVER: `OrderHeaderEntity` cannot be constructed cheaply in a unit test.
     * `BaseEntity`'s constructor takes a full `EntityInfo` — a real `Fields` array, primary keys,
     * etc. — that `NewRecord()` reads (via `this.EntityInfo.PrimaryKeys`, `this.init()`) before it
     * ever reaches the `OrderDate` assignment, and `OrderHeaderEntity`'s own field initializers
     * eagerly build `PromotionCodesCompanion` / `InitialPaymentIntentCompanion` companions. A
     * faithful stand-in for all of that is a redesign in its own right for a three-line date-default
     * fix. So this test proves the VALUE `TodayAsDateValue()` computes rather than driving it through
     * `OrderHeaderEntity.NewRecord()` itself; combined with the source check above (which proves
     * `NewRecord()` calls exactly this function), the two together account for the whole defect on
     * the entity side. `CheckoutSessionService`'s two call sites, by contrast, ARE driven through the
     * real, unmocked service code — see the discriminating tests added to
     * `CheckoutSessionService.test.ts` in `packages/CoreEntitiesServer`.
     */
    it('TodayAsDateValue is the business day, not the UTC/machine day, at the instant the bug report describes', () => {
        engine._configurations = [
            {
                FeatureKey: 'BizApps.BusinessTimeZone',
                Value: '{"iana":"America/New_York","sql":"Eastern Standard Time"}',
                DefaultValue: '{"iana":"UTC","sql":"UTC"}'
            }
        ];
        engine._loaded = true;

        const originalTZ = process.env.TZ;
        process.env.TZ = 'Asia/Kolkata';
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-08-28T01:00:00.000Z')); // 9 PM EDT on the 27th; already the 28th in UTC and in Kolkata
        try {
            const stamped = TodayAsDateValue();

            // The old defect, reproduced for contrast: `new Date()` at this instant, read back the
            // way a DATE column is (UTC parts, via ToISODate), names the 28th — one day into the
            // future for a customer who checked out at 9 PM the evening before.
            expect(ToISODate(new Date())).toBe('2026-08-28');

            // The fix: the business day survives the round trip, pinned to midnight UTC.
            expect(ToISODate(stamped)).toBe('2026-08-27');
            expect(stamped.getUTCHours()).toBe(0);
            expect(stamped.getUTCMinutes()).toBe(0);
            expect(stamped.getUTCSeconds()).toBe(0);
            expect(stamped.getUTCMilliseconds()).toBe(0);
        } finally {
            vi.useRealTimers();
            if (originalTZ === undefined) {
                delete process.env.TZ;
            } else {
                process.env.TZ = originalTZ;
            }
        }
    });
});
