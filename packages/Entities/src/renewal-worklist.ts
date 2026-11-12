/**
 * What a subscription's renewal is waiting on, decided from its facts (the Subscriptions section's
 * Renewals page).
 *
 * The page lists every subscription whose coverage ends inside a window and answers, per row, the
 * question the accounting and product teams actually ask: "has this renewed, will it renew by
 * itself, and if so when — or does somebody have to act?". The answer is a function of the facts
 * the renewal pass (`Orders.SpawnRenewals`) itself reads, so it is decided here, once, with the
 * same rules the pass selects by. A page that guessed from the dates alone would disagree with the
 * job on exactly the rows that matter.
 *
 * Pure and provider-free: the server operation decides it for every row it returns, and the page
 * can re-decide it for a what-if without a round trip.
 *
 * @module @mj-biz-apps/orders-entities
 */

/**
 * Where a subscription stands with respect to its next term.
 *
 * - `Renewed`         a later term already exists: the renewal booked (or the customer bought more coverage).
 * - `RenewalPending`  a renewal order exists but has not produced a term — a draft awaiting confirmation.
 * - `DueNow`          auto-renew is on and the term end is inside the lead window: the next renewal pass places it, where the pass is live (the page reads the job's mode and says when it is not).
 * - `Scheduled`       auto-renew is on; the pass will place it on `AutoRenewOn`.
 * - `Lapsed`          auto-renew is on but the term ended before the pass's lower bound, so it will not be revived by a routine pass.
 * - `WillEnd`         auto-renew is off: the term simply ends unless a person places a renewal.
 * - `Ended`           auto-renew is off and the term has ended; nothing renewed it, and only a person can.
 * - `ProviderBilled`  a payment gateway bills it; Orders places no renewal order.
 * - `Inactive`        the subscription is not Active or Trialing (canceled, paused, expired), so nothing renews it.
 */
export type RenewalState =
    | 'Renewed'
    | 'RenewalPending'
    | 'DueNow'
    | 'Scheduled'
    | 'Lapsed'
    | 'WillEnd'
    | 'Ended'
    | 'ProviderBilled'
    | 'Inactive';

/** The facts the classification reads. Days are `YYYY-MM-DD`. */
export interface RenewalFacts {
    /** `Subscription.Status`. */
    Status: string;
    AutoRenew: boolean;
    /** `Subscription.ProviderSubscriptionID` is set: a gateway bills it. */
    ProviderBilled: boolean;
    /** A term later than the expiring one exists. */
    RenewalBooked: boolean;
    /** A live renewal order (not voided) exists that has not produced a term. */
    RenewalPending: boolean;
    /** The expiring term's last day. */
    TermEndDate: string;
    /** Lead days in force: the subscription's own, else its type's, else 0. */
    LeadDays: number;
    /** The day the question is asked. */
    AsOf: string;
}

export interface RenewalClassification {
    State: RenewalState;
    /**
     * The first day the renewal pass would place this subscription's renewal: the term end less the
     * lead days, never earlier than `AsOf`. Set only while the pass is still going to place it
     * (`DueNow` and `Scheduled`).
     */
    AutoRenewOn: string | null;
}

/** Subscription statuses the renewal pass will act on. */
export const RENEWABLE_STATUSES: ReadonlyArray<string> = ['Active', 'Trialing'];

/**
 * Decide the state, with the same rules `Orders.SpawnRenewals` selects by: auto-renew on, Active or
 * Trialing, not gateway-billed, latest term ending inside the lead window and not before the day
 * before the pass. The order of the tests matters: a booked renewal is `Renewed` whatever the switch
 * says, and a gateway-billed subscription is the gateway's whatever the dates say.
 *
 * @example
 * ```typescript
 * ClassifyRenewal({ Status: 'Active', AutoRenew: true, ProviderBilled: false, RenewalBooked: false,
 *                   RenewalPending: false, TermEndDate: '2027-03-31', LeadDays: 90, AsOf: '2026-11-09' })
 * // { State: 'Scheduled', AutoRenewOn: '2026-12-31' }
 * ```
 */
export function ClassifyRenewal(facts: RenewalFacts): RenewalClassification {
    if (facts.RenewalBooked) return { State: 'Renewed', AutoRenewOn: null };
    if (facts.RenewalPending) return { State: 'RenewalPending', AutoRenewOn: null };
    if (facts.ProviderBilled) return { State: 'ProviderBilled', AutoRenewOn: null };
    if (!RENEWABLE_STATUSES.includes(facts.Status)) return { State: 'Inactive', AutoRenewOn: null };

    const daysToEnd = DaysBetweenDays(facts.AsOf, facts.TermEndDate);
    // Auto-renew off: the term ends on its own, and once it has, it has ended. The switch says
    // nothing about the pass's lower bound, which applies only to a term the pass would place.
    if (!facts.AutoRenew) return { State: daysToEnd < 0 ? 'Ended' : 'WillEnd', AutoRenewOn: null };

    // The pass's lower bound: a term that ended before yesterday is not revived by a routine run.
    if (daysToEnd < -1) return { State: 'Lapsed', AutoRenewOn: null };

    const placeOn = AddDays(facts.TermEndDate, -Math.max(0, Math.floor(facts.LeadDays)));
    if (placeOn <= facts.AsOf) return { State: 'DueNow', AutoRenewOn: facts.AsOf };
    return { State: 'Scheduled', AutoRenewOn: placeOn };
}

/** Whole days from `from` to `to`, both `YYYY-MM-DD`; negative when `to` is earlier. */
export function DaysBetweenDays(from: string, to: string): number {
    return Math.round((DayUTC(to) - DayUTC(from)) / 86_400_000);
}

/** `YYYY-MM-DD` plus a (possibly negative) number of days. */
export function AddDays(day: string, days: number): string {
    const [y, m, d] = day.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

function DayUTC(day: string): number {
    const [y, m, d] = day.split('-').map(Number);
    return Date.UTC(y, (m ?? 1) - 1, d ?? 1);
}
