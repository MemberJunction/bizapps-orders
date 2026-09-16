/**
 * @fileoverview `BuildDayBars` — the seven-bar window `CashPerDay` (payments dashboard) and
 * `OrdersPerDay` (orders dashboard) both build.
 *
 * Deliberately NOT in `day-bars.component.ts`. That file's `@Component` decorator needs the
 * Angular JIT compiler to evaluate, which this repo's plain `vitest` tests do not load — every
 * other Angular test file here reads a component's SOURCE rather than importing the class for
 * exactly that reason (see `pages/__tests__/manage-columns-host.test.ts`,
 * `pages/__tests__/kit-classes.test.ts`). A pure function has no such requirement, so it gets its
 * own module and is trivially importable from a plain test.
 *
 * The bug this replaces: a caller walked `Date` INSTANTS — `new Date()` minus N days — keyed each
 * one with the BUSINESS day (`LocalDay`, since the business-dates fix landed) and labelled it with
 * the VIEWER's own weekday (`day.toLocaleDateString(...)`, no explicit zone). The two zones agree
 * by construction only when the viewer happens to sit in the business zone; a viewer in Kolkata
 * with the business booking in Chicago got a bar labelled with today's weekday counting
 * yesterday's rows — the "bar said Mon and counted Tuesday" defect `date-cell.ts`'s own module doc
 * describes, one level up, now for a whole dashboard rather than a single cell.
 *
 * Working entirely in calendar-day space removes the seam. `Today()` and `AddDays` never leave
 * `CalendarDay` (`'YYYY-MM-DD'`); `FromCalendarDay` turns that key into UTC midnight of the same
 * day, and formatting it with `timeZone: 'UTC'` reads the label back off that same UTC-pinned
 * instant — so the label cannot name a different day than the key that filtered its rows, whatever
 * zone the browser or the CI runner sits in.
 *
 * @module @mj-biz-apps/orders-ng
 */
import { AddDays, type CalendarDay, FromCalendarDay } from '@mj-biz-apps/common-entities';
import { Today } from '@mj-biz-apps/orders-entities';

import type { MJODayBar } from './day-bars.component';

/**
 * The last seven business calendar days, ending today, with each bar's label DERIVED from its key.
 *
 * @param valueForDay - The bar's height for one business calendar day — typically a filter over an
 * entity array compared with `ToISODate(row.SomeDateField) === iso`.
 */
export function BuildDayBars(valueForDay: (iso: CalendarDay) => number): MJODayBar[] {
    const days: MJODayBar[] = [];
    const today = Today();
    for (let back = 6; back >= 0; back--) {
        const iso = AddDays(today, -back);
        days.push({
            Label: FromCalendarDay(iso).toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' }),
            Value: valueForDay(iso),
            Current: back === 0,
        });
    }
    return days;
}
