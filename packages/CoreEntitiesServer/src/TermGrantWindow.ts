/**
 * TermGrantWindow — the instants a term's access covers, in the business time zone.
 *
 * A subscription term is a run of business days (`SubscriptionTerm.StartDate` / `EndDate` are `date`
 * columns). Access that follows the term covers each of those days in full, in the business zone:
 * from 00:00 business time on the first day until 00:00 business time on the day AFTER the last.
 *
 * WHY. Read as instants, a `date` is 00:00 UTC. Used directly as a grant's end, it cut the last day
 * short by the zone's offset: in Chicago a term ending 31 Dec 2026 ended at 2026-12-31T00:00Z, which is
 * 6 pm Central on 30 Dec. A gateway that charges the renewal at 00:00 Central on the last day (E2's
 * anchor) then charged a customer who had already been locked out for six hours.
 *
 * The same instant is what E2b's cancel asks the gateway for ("charge nothing after 00:00 business time
 * on the day after coverage ends", `PlanGatewayCancel`), so a grant's end, a cancel's billing end and
 * the gateway's charge time all read one rule.
 *
 * Example (Chicago): term 1 Jan → 31 Dec 2026 → { ValidFrom: 2026-01-01T06:00Z, ValidTo: 2027-01-01T06:00Z }.
 *
 * A CANCEL's access-through day follows the same rule (`TermDayEnd`), except an `Immediate` cancel with no
 * grace made for today: that one ends access at once (`SubscriptionBehavior.EndsAccessOnCancel`).
 *
 * CONNECTS TO:
 *   WRITERS: EntitlementEngine (grants at booking), TermExtension, TermShift, the cancel's end
 *            (RevokeGrantsForCanceledSubscription)
 *   READER:  EvaluateGrantAccess (EntitlementBehavior.ts), for a term's and a cancelled subscription's end
 */
import { AddDays, DayStartUtc, ToCalendarDay, type CalendarDay } from '@mj-biz-apps/common-entities';

/** A day as `date` columns hold it: a `Date` at 00:00 UTC, an ISO string, or a `CalendarDay`. */
export type TermDay = Date | string | CalendarDay;

/**
 * A zone is required. `DayStartUtc` with no zone falls back to the machine's own time zone, which on a
 * laptop in California and a server in UTC gives two different answers for the same grant.
 */
function zoneOf(zone: string, what: string): string {
    if (!zone || !zone.trim()) throw new RangeError(`${what}: a business time zone is required.`);
    return zone;
}

function dayOf(value: TermDay, what: string): CalendarDay {
    const day = ToCalendarDay(value as Date | string);
    if (!day) throw new RangeError(`${what}: '${String(value)}' is not a day.`);
    return day;
}

/** 00:00 business time on `day`: the first instant the day covers. */
export function TermDayStart(day: TermDay, zone: string): Date {
    return DayStartUtc(dayOf(day, 'TermDayStart'), zoneOf(zone, 'TermDayStart'));
}

/** 00:00 business time on the day after `day`: the instant `day`'s coverage ends. */
export function TermDayEnd(day: TermDay, zone: string): Date {
    return DayStartUtc(AddDays(dayOf(day, 'TermDayEnd'), 1), zoneOf(zone, 'TermDayEnd'));
}

/** The instants a term from `firstDay` to `lastDay` covers, both days in full. */
export function TermGrantWindow(firstDay: TermDay, lastDay: TermDay, zone: string): { ValidFrom: Date; ValidTo: Date } {
    return { ValidFrom: TermDayStart(firstDay, zone), ValidTo: TermDayEnd(lastDay, zone) };
}
