/**
 * ProviderSubscriptionCancel — carry an Orders cancel to the gateway that bills the subscription (E2b).
 *
 * Once a gateway bills a subscription (`IsProviderBilled`), cancelling it only in Orders leaves the
 * gateway charging: Sess cancels Jane in March, the Learning Hub removes her, and Stripe still charges
 * her $599 in October. So `Orders.CancelSubscription` asks the gateway FIRST, and writes nothing in
 * Orders unless the gateway confirmed it will charge nothing after Orders' coverage ends.
 *
 * WHEN THE GATEWAY STOPS BILLING. Coverage runs through the cancellation's effective day. The gateway
 * must charge nothing after the end of that business day:
 *   · effective today or earlier (Immediate, or a late request) → end it now;
 *   · effective later (end of term, or a request dated ahead) → nothing after 00:00 business time on
 *     the day after. The driver turns that into "end at period end" when the period ends first (end of
 *     term: E2 anchors the gateway's charge on the term's last day) or "end at that instant" otherwise.
 * The type's grace changes nothing at the gateway: it extends access, never billing.
 *
 * THE GATEWAY IS READ FIRST (`ReadGatewaySubscription`, `GateGatewayCancel`). It, not Orders, knows whether
 * it already charged a period Orders has not booked, or already stopped. The gateway charges at 00:00 on
 * a term's last day (so access never gaps), so a cancel later that day would otherwise stop it without
 * refunding the renewal it charged that morning. And a cancel finished at the gateway (support cancelled
 * and refunded there, or Orders' write failed after the gateway confirmed) is recorded rather than refused.
 *
 * WHAT STOPS A CANCEL. A cancel is refused, with Orders unchanged, when:
 *   · the gateway cannot be read, or has started a billing period Orders has not booked (the renewal it
 *     charged on the term's last day, or a later one): a person cancels and refunds that at the gateway;
 *   · the gateway does not confirm (refused, unreachable, a stub or inactive account), because a
 *     subscription cancelled in Orders but still billing at the gateway is the failure this exists for;
 *   · an open alert says a gateway subscription may be billing that Orders has not recorded, or that a
 *     second one exists (`CANCEL_BLOCKING_ALERT_CODES`), because this cancel would stop only the one it
 *     knows: the person resolves the alert first. Those alerts are Tasks; when they cannot be read, a
 *     gateway-billed cancel is refused too, because "no alert" would only be a guess.
 *
 * CONNECTS TO:
 *   CALLER: ./CancelSubscriptionOperation.ts
 *   DRIVER: ./BasePaymentProvider.ts (CancelProviderSubscription) · ./StripePaymentProvider.ts
 *   ALERTS: ./checkoutCaptureAlert.ts (the E2 alert Tasks this reads, and the one it raises)
 */
import type { IMetadataProvider, UserInfo } from '@memberjunction/core';
import { AddDays, CalendarDayIn, CompareDays, DayStartUtc, ToCalendarDay, type CalendarDay } from '@mj-biz-apps/common-entities';
import type { BasePaymentProvider, CancelProviderSubscriptionOutcome, DescribeProviderSubscriptionResult } from './BasePaymentProvider.js';
import { BuildPaymentProvider, LoadPaymentProviderConfig } from './PaymentProviderResolver.js';
import { ReadOpenProviderSubscriptionAlerts } from './checkoutCaptureAlert.js';

/**
 * Open E2 alerts after which a cancel could leave a gateway subscription billing: one created but not
 * recorded (`NotRecorded`), a create of unknown result (`GatewayFault`), a second one beside the
 * recorded one (`LinkedElsewhere`, `AmbiguousAtGateway`), or one that charged at creation.
 */
export const CANCEL_BLOCKING_ALERT_CODES: readonly string[] = [
    'NotRecorded',
    'GatewayFault',
    'LinkedElsewhere',
    'AmbiguousAtGateway',
    'ChargedAtCreation',
];

/** When the gateway must stop billing: now, or after an instant. */
export type GatewayCancelPlan = { When: 'Now' } | { When: 'EndOfCoverage'; BillingEndsAt: Date };

/**
 * Decide when the gateway stops billing. Pure: today and the zone are passed in.
 *
 * @param effectiveDate - the cancellation's effective day (a date value: UTC midnight of the day).
 * @param today - the business day now.
 * @param zone - the business time zone.
 *
 * Example: Jane's term 1 ends 30 Oct 2027 and Sess cancels at end of term on 3 Mar 2027 →
 * `{ When: 'EndOfCoverage', BillingEndsAt: 00:00 Central 31 Oct 2027 }` (05:00 UTC).
 */
export function PlanGatewayCancel(effectiveDate: Date, today: CalendarDay, zone: string): GatewayCancelPlan {
    const effective = ToCalendarDay(effectiveDate);
    if (!effective) throw new RangeError(`PlanGatewayCancel: '${String(effectiveDate)}' is not a day.`);
    if (CompareDays(effective, today) <= 0) return { When: 'Now' };
    return { When: 'EndOfCoverage', BillingEndsAt: DayStartUtc(AddDays(effective, 1), zone) };
}

/** What happened at the gateway, for the operation's output and the lifecycle event. */
export interface GatewayCancelSummary {
    ProviderSubscriptionID: string;
    When: 'Now' | 'EndOfCoverage';
    /** ISO instant after which the gateway charges nothing. Absent for `Now` before the gateway answered. */
    BillingEndsAt?: string;
    /** The gateway's answer. Absent on a preview. */
    Outcome?: CancelProviderSubscriptionOutcome;
}

/** The plan as a summary, before (or without) asking the gateway: what a preview shows. */
export function GatewayCancelPreview(providerSubscriptionID: string, plan: GatewayCancelPlan): GatewayCancelSummary {
    return {
        ProviderSubscriptionID: providerSubscriptionID,
        When: plan.When,
        BillingEndsAt: plan.When === 'EndOfCoverage' ? plan.BillingEndsAt.toISOString() : undefined,
    };
}

/** The idempotency key for one gateway cancel: the same request repeated is the same key. */
export function GatewayCancelIdempotencyKey(subscriptionID: string, providerSubscriptionID: string, plan: GatewayCancelPlan): string {
    const at = plan.When === 'Now' ? 'now' : String(Math.floor(plan.BillingEndsAt.getTime() / 1000));
    return `provider-subscription-cancel:${subscriptionID.toLowerCase()}:${providerSubscriptionID}:${at}`;
}

/** The business day now, for `PlanGatewayCancel`. */
export function BusinessToday(zone: string, now: Date = new Date()): CalendarDay {
    return CalendarDayIn(now, zone);
}

/**
 * The open alerts that stop a cancel of this subscription, by code (empty when none), or why they could
 * not be read. A host without the tasks app has no alert Tasks at all, so it reads as none, not as a failure.
 */
export async function CancelBlockingAlerts(
    subscriptionNumber: string,
    user: UserInfo,
    provider: IMetadataProvider,
): Promise<{ Codes: string[]; ReadFailure?: string }> {
    const read = await ReadOpenProviderSubscriptionAlerts(user, provider);
    if ('Reason' in read) return { Codes: [], ReadFailure: read.Reason };
    const codes = read.Open.get(subscriptionNumber) ?? new Set<string>();
    return { Codes: CANCEL_BLOCKING_ALERT_CODES.filter((c) => codes.has(c)) };
}

/** What the gateway's billing state means for a cancel. */
export type GatewayCancelGate =
    /** The gateway charges nothing more (ended, or set to end with nothing unbooked charged): Orders records the cancel. */
    | { Kind: 'Finished' }
    /** The gateway started a billing period Orders has not booked: a person settles it at the gateway first. */
    | { Kind: 'UnbookedPeriod'; PeriodStart: Date }
    /** Still billing, nothing unbooked: cancel at the gateway, then in Orders. */
    | { Kind: 'Proceed' };

/**
 * Decide from the gateway's billing state. Pure.
 *
 * A period the gateway started at or after 00:00 business time on the latest open term's last day is one
 * Orders has not booked: the gateway charges a renewal on that day (E2's anchor), and E4 books it later.
 *
 *   · Ended                                   → Finished (a person ended it at the gateway; any refund is theirs)
 *   · Ending, nothing unbooked charged        → Finished
 *   · anything else with an unbooked period   → UnbookedPeriod (an Ending one would keep the renewal it charged)
 *   · otherwise                               → Proceed
 *
 * Example: Jane's term ends 31 Dec 2026 (Chicago). Stripe renews at 00:00 Central that day, so its period
 * starts 2026-12-31T06:00Z, which is the term's last day: UnbookedPeriod. On 30 Dec its period still
 * started at creation: Proceed.
 */
export function GateGatewayCancel(
    billing: Pick<DescribeProviderSubscriptionResult, 'State' | 'CurrentPeriodStart'>,
    latestTermLastDay: CalendarDay,
    zone: string,
): GatewayCancelGate {
    if (billing.State === 'Ended') return { Kind: 'Finished' };
    const unbookedFrom = DayStartUtc(latestTermLastDay, zone);
    const start = billing.CurrentPeriodStart ?? null;
    if (start && start.getTime() >= unbookedFrom.getTime()) return { Kind: 'UnbookedPeriod', PeriodStart: start };
    return billing.State === 'Ending' ? { Kind: 'Finished' } : { Kind: 'Proceed' };
}

/** The driver for the account that bills the subscription, or why it cannot be used. */
async function gatewayDriver(
    subscription: { PaymentProviderID: string | null; ProviderSubscriptionID: string },
    provider: IMetadataProvider,
    user: UserInfo,
): Promise<{ Driver: BasePaymentProvider } | { Reason: string }> {
    if (!subscription.PaymentProviderID) {
        return { Reason: `The subscription names no payment provider for ${subscription.ProviderSubscriptionID}.` };
    }
    try {
        const config = await LoadPaymentProviderConfig(subscription.PaymentProviderID, provider, user);
        return { Driver: await BuildPaymentProvider(config, provider, user) };
    } catch (err) {
        return {
            Reason: `The payment provider that bills ${subscription.ProviderSubscriptionID} cannot be used (${err instanceof Error ? err.message : String(err)}).`,
        };
    }
}

/** Where the gateway's billing of this subscription stands. Never throws: a failure is `Success: false` with a reason. */
export async function ReadGatewaySubscription(
    subscription: { PaymentProviderID: string | null; ProviderSubscriptionID: string },
    provider: IMetadataProvider,
    user: UserInfo,
): Promise<DescribeProviderSubscriptionResult> {
    const built = await gatewayDriver(subscription, provider, user);
    if ('Reason' in built) return { Success: false, Reason: built.Reason };
    try {
        const read = await built.Driver.DescribeProviderSubscription(subscription.ProviderSubscriptionID);
        if (read.Success && !read.State) return { Success: false, Reason: `the gateway's answer for ${subscription.ProviderSubscriptionID} named no state` };
        return read;
    } catch (err) {
        return { Success: false, Reason: `the gateway did not answer for ${subscription.ProviderSubscriptionID} (${err instanceof Error ? err.message : String(err)})` };
    }
}

export interface GatewayCancelResult {
    Success: boolean;
    /** Written for the person cancelling: what went wrong and that nothing in Orders changed. */
    Reason?: string;
    Summary: GatewayCancelSummary;
}

/**
 * Ask the gateway to charge nothing after the plan's instant. Never throws: an unreachable gateway or an
 * unusable account is a refusal, because the caller must then write nothing.
 */
export async function CancelAtGateway(
    subscription: { ID: string; PaymentProviderID: string | null; ProviderSubscriptionID: string },
    plan: GatewayCancelPlan,
    provider: IMetadataProvider,
    user: UserInfo,
): Promise<GatewayCancelResult> {
    const summary = GatewayCancelPreview(subscription.ProviderSubscriptionID, plan);
    const unchanged = 'Nothing was changed in Orders.';
    const built = await gatewayDriver(subscription, provider, user);
    if ('Reason' in built) {
        return { Success: false, Summary: summary, Reason: `${built.Reason} It could not be cancelled there. ${unchanged}` };
    }
    const driver = built.Driver;
    try {
        const result = await driver.CancelProviderSubscription({
            ProviderSubscriptionID: subscription.ProviderSubscriptionID,
            BillingEndsAt: plan.When === 'Now' ? null : plan.BillingEndsAt,
            IdempotencyKey: GatewayCancelIdempotencyKey(subscription.ID, subscription.ProviderSubscriptionID, plan),
        });
        if (!result.Success) {
            return {
                Success: false,
                Summary: summary,
                Reason: `The payment gateway did not confirm the cancel of ${subscription.ProviderSubscriptionID}: ${result.Reason ?? 'no reason given'}. ${unchanged} Try again.`,
            };
        }
        return {
            Success: true,
            Summary: { ...summary, Outcome: result.Outcome, BillingEndsAt: result.BillingEndsAt?.toISOString() ?? summary.BillingEndsAt },
        };
    } catch (err) {
        return {
            Success: false,
            Summary: summary,
            Reason:
                `The payment gateway did not answer the cancel of ${subscription.ProviderSubscriptionID} ` +
                `(${err instanceof Error ? err.message : String(err)}). ${unchanged} Try again.`,
        };
    }
}
