/**
 * @fileoverview One rule for "the day this record happened on", written once for the server.
 *
 * ## The defect this exists to stop
 *
 * A SQL `DATE` column is a calendar day with no time. `new Date()` is an instant, and an instant
 * serialises in UTC — so a record stamped at 9 PM Eastern is dated tomorrow, and the payment, the
 * order and the journal entry that describe one event end up on two different days and, at a month
 * boundary, in two different accounting periods (#209, bc-aidp-next-golive#168).
 *
 * The same mistake was written six ways across this package: `x.PaymentDate = new Date()`,
 * `this.PaymentDate ? new Date(this.PaymentDate) : new Date()`, `this.OrderDate ?? new Date()`.
 * Each is the same two decisions — take the day the value names, and fall back to TODAY when it
 * names none — so both decisions live here instead of being re-made at each site.
 *
 * ## Why the warm-up is lazy
 *
 * `TodayAsDateValue()` reads the business zone from `BusinessTimeZoneEngine`, which the server
 * pre-warms at startup (`@RegisterForStartup`). `Config(false, …)` is a no-op once loaded, and the
 * call is defence in depth for a host that starts in another mode — but it is a metadata read, and
 * several callers are inside a write transaction by the time they reach this. Warming only when the
 * fallback is actually taken keeps that read off the path where the value was supplied anyway.
 */
import type { IMetadataProvider, UserInfo } from '@memberjunction/core';
import { BusinessTimeZoneEngine } from '@mj-biz-apps/common-entities';
import { AsDateValue, TodayAsDateValue } from '@mj-biz-apps/orders-entities';

/**
 * The calendar day `cell` names, or the business day today when it names none.
 *
 * Pinned to midnight UTC either way, which is the shape a `date` column round-trips unchanged.
 *
 * @param cell - A day already in hand: an entity field, a row value, an operation's input.
 * @param provider - Used only to configure the time-zone engine, and only on the fallback path.
 * @param user - The caller, for that same configuration read.
 */
export async function CalendarDayOrToday(
    cell: unknown,
    provider: IMetadataProvider,
    user: UserInfo,
): Promise<Date> {
    const stated = AsDateValue(cell);
    if (stated) return stated;

    await BusinessTimeZoneEngine.Instance.Config(false, user, provider);
    return TodayAsDateValue();
}
