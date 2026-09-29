/**
 * `CalendarDayOrToday` — the one rule the payment/order date sites share (#209).
 *
 * Both halves of it are load-bearing and each has been written wrongly somewhere in this package:
 *
 *   - the STATED day must survive. `this.OrderDate ?? new Date()` got this right; a fix that
 *     replaced the whole expression with `TodayAsDateValue()` would date a backdated order's
 *     payment today and nothing would complain.
 *   - the FALLBACK must be a calendar day in the business zone. `new Date()` is an instant, and an
 *     instant serialises in UTC, so an evening record was dated tomorrow.
 *
 * The instant below is 01:00 UTC on the 28th, which is 21:00 EDT on the 27th — UTC has turned over
 * and Eastern has not. The machine zone is pinned to Kolkata (+5:30, also on the 28th) so no
 * assertion here can be satisfied by the host's own zone.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { IMetadataProvider, UserInfo } from '@memberjunction/core';
import { BusinessTimeZoneEngine, type InstanceConfigurationRow } from '@mj-biz-apps/common-entities';
import { ToISODate } from '@mj-biz-apps/orders-entities';

import { CalendarDayOrToday } from '../calendar-day.js';

/** 01:00 UTC on the 28th = 21:00 EDT on the 27th — the bug report's own scenario. */
const BUG_INSTANT = '2026-08-28T01:00:00.000Z';
const BUSINESS_DAY = '2026-08-27';
/** What a bare `new Date()` at that instant names once a `DATE` column reads it back. */
const UTC_DAY = '2026-08-28';

const engine = BusinessTimeZoneEngine.Instance as unknown as {
    _configurations: InstanceConfigurationRow[];
    _loaded: boolean;
};
const saved = { rows: engine._configurations, loaded: engine._loaded };

const provider = { name: 'provider' } as unknown as IMetadataProvider;
const user = { ID: 'user-1' } as unknown as UserInfo;

describe('CalendarDayOrToday', () => {
    let originalTZ: string | undefined;

    beforeEach(() => {
        engine._configurations = [
            {
                FeatureKey: 'BizApps.BusinessTimeZone',
                Value: '{"iana":"America/New_York","sql":"Eastern Standard Time"}',
                DefaultValue: '{"iana":"UTC","sql":"UTC"}',
            },
        ];
        // Pinned loaded so the real `Config(false, …)` is a no-op and needs no live provider.
        engine._loaded = true;
        originalTZ = process.env.TZ;
        process.env.TZ = 'Asia/Kolkata';
        vi.useFakeTimers();
        vi.setSystemTime(new Date(BUG_INSTANT));
    });

    afterEach(() => {
        vi.useRealTimers();
        if (originalTZ === undefined) delete process.env.TZ;
        else process.env.TZ = originalTZ;
        engine._configurations = saved.rows;
        engine._loaded = saved.loaded;
        vi.restoreAllMocks();
    });

    it('keeps the day a value already names, rather than replacing it with today', async () => {
        const day = await CalendarDayOrToday(new Date('2026-03-15T00:00:00.000Z'), provider, user);
        expect(ToISODate(day)).toBe('2026-03-15');
    });

    it('keeps a day given as a string too, pinned to midnight UTC', async () => {
        const day = await CalendarDayOrToday('2026-03-15', provider, user);
        expect(ToISODate(day)).toBe('2026-03-15');
        expect(day.getUTCHours()).toBe(0);
    });

    it('reduces a supplied INSTANT to its day, so the time cannot survive into a date column', async () => {
        const day = await CalendarDayOrToday('2026-03-15T18:30:00.000Z', provider, user);
        expect(ToISODate(day)).toBe('2026-03-15');
        expect(day.getUTCHours()).toBe(0);
    });

    it('does not touch the time-zone engine when the day was stated', async () => {
        // The warm-up is a metadata read, and several callers are inside a write transaction by
        // the time they reach here. It has no business running when its answer is not used.
        const configSpy = vi.spyOn(BusinessTimeZoneEngine.Instance, 'Config').mockResolvedValue(undefined);
        await CalendarDayOrToday('2026-03-15', provider, user);
        expect(configSpy).not.toHaveBeenCalled();
    });

    it.each([
        ['null', null],
        ['undefined', undefined],
        ['an empty string', ''],
        ['an unparseable string', 'not a date'],
        ['an Invalid Date', new Date('nope')],
    ])('falls back to the BUSINESS day, not the UTC day, for %s', async (_label, cell) => {
        const day = await CalendarDayOrToday(cell, provider, user);
        expect(ToISODate(day)).toBe(BUSINESS_DAY);
        // The defect, named: a bare `new Date()` here round-trips as the 28th.
        expect(ToISODate(day)).not.toBe(UTC_DAY);
    });

    it('warms the engine with the caller and the provider before answering with today', async () => {
        const configSpy = vi.spyOn(BusinessTimeZoneEngine.Instance, 'Config').mockResolvedValue(undefined);
        await CalendarDayOrToday(null, provider, user);
        // Dropping the warm-up leaves this spy uncalled: on a cold engine the fallback would then
        // answer from whatever zone state the process happened to be in, usually UTC.
        expect(configSpy).toHaveBeenCalledWith(false, user, provider);
    });
});
