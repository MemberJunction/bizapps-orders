/**
 * ProviderSubscriptionSyncPlan — what Orders must do to agree with a gateway subscription (E3 + E4 + E6).
 *
 * Once a payment gateway bills a subscription (option E), the gateway is where renewals are charged,
 * fail, are retried and end. Orders has to follow: book each renewal the gateway was paid for, record
 * each failed attempt, keep access while the gateway is still trying, and end the subscription when the
 * gateway ends it. This module decides WHAT to do from two sets of facts — Orders' record and the
 * gateway's — and writes nothing, so every case is tested without a gateway or a database.
 * `ProviderSubscriptionSync.ts` gathers the facts and carries the steps out.
 *
 * THE GATEWAY'S RECORDS ARE THE TRUTH; EVENTS ONLY TRIGGER. A webhook names a subscription and nothing
 * more is read from it: the plan works from the subscription and its invoices as the gateway reports
 * them now. A duplicate, late or out-of-order event therefore plans the same steps as the first, a
 * missed one is caught by the nightly pass that runs this same plan, and nothing is applied twice
 * because every step checks Orders' record first.
 *
 * THE ORDER OF THE STEPS: money first (each paid renewal), then failed attempts and the access they
 * keep, then the subscription's end state. So a renewal charged on the morning the subscription was
 * cancelled is booked before the cancel, and the cancel then ends what was booked.
 *
 * Example: Jane's SUB-000110 is Stripe-billed; term 1 ends 30 Oct 2027. Stripe charges $599 at 00:00
 * Central that day. The plan: BookRenewal(in_…). Two days later Stripe reports her `active` and
 * renewing: nothing. In March she cancels in Stripe's portal: SetAutoRenew(off, ends 30 Oct 2028).
 *
 * CONNECTS TO:
 *   CALLER:  ./ProviderSubscriptionSync.ts
 *   FACTS:   ./BasePaymentProvider.ts (DescribeProviderSubscription, ListProviderSubscriptionInvoices)
 *   DOC:     docs/HOW_THE_SYSTEM_WORKS.md (gateway-billed subscriptions), plans/provider-subscription-sync.md
 */
import { AddDays, CalendarDayIn, DayStartUtc, type CalendarDay } from '@mj-biz-apps/common-entities';
import type { DescribeProviderSubscriptionResult, GatewaySubscriptionInvoice } from './BasePaymentProvider.js';

/** The gateway's `billing_reason` for a renewal (and for the first charge of an E2 subscription). */
export const RENEWAL_BILLING_REASON = 'subscription_cycle';

/**
 * How far past the end of the coverage Orders sold a failed renewal may keep access while the gateway
 * retries (Q4). The gateway's own retry window decides within it; this only bounds a gateway that never
 * gives up.
 */
export const RETRY_ACCESS_CAP_DAYS = 45;

/** Orders' side of the comparison. */
export interface SyncOrdersFacts {
    SubscriptionNumber: string;
    /** Orders' status: Active, Trialing, Paused, Canceled, Expired… */
    Status: string;
    AutoRenew: boolean;
    /** The last covered day of the latest term (any status), as a business day. Null when none. */
    LatestTermEnd: CalendarDay | null;
    /** The business time zone. */
    Zone: string;
    /** The selling company's booking currency. */
    CurrencyCode: string;
    /** Gateway intents already recorded AND captured as a payment. */
    CapturedIntentIDs: ReadonlySet<string>;
    /** Gateway intents recorded with an order but not yet captured (a capture that failed earlier). */
    UncapturedIntentIDs: ReadonlySet<string>;
    /** Invoices of $0 already booked (they have no intent). */
    BookedZeroInvoiceIDs: ReadonlySet<string>;
    /** Failed attempts already recorded, as `<invoice id>#<attempt>`. */
    RecordedFailures: ReadonlySet<string>;
    /** The gateway price and quantity the last booked gateway renewal carried; null before the first. */
    LastGatewayPriceID: string | null;
    LastGatewayQuantity: number | null;
    /** What the last term's line was priced at, per unit; null when unknown. Only for notices. */
    LastUnitPrice: number | null;
    /** The latest term's grants' current end (the latest one); null when none or open-ended. */
    GrantsValidTo: Date | null;
}

/** The gateway's side: the subscription now, and its invoices since the latest term began. */
export interface SyncGatewayFacts {
    Subscription: Pick<
        DescribeProviderSubscriptionResult,
        'State' | 'Status' | 'CurrentPeriodStart' | 'CurrentPeriodEnd' | 'EndsAt' | 'EndedAt' | 'ProviderPriceID' | 'Quantity'
    >;
    /** Oldest first. */
    Invoices: readonly GatewaySubscriptionInvoice[];
}

/** One thing to do. Applied in the order planned. */
export type SyncStep =
    /** Book the renewal the gateway was paid for (or the $0 one it issued): an order, the payment, the next term. */
    | { Kind: 'BookRenewal'; Invoice: GatewaySubscriptionInvoice }
    /** Finish a booking whose capture failed after its order was confirmed. */
    | { Kind: 'FinishCapture'; Invoice: GatewaySubscriptionInvoice }
    /** A failed collection attempt to record (`PaymentFailed`). */
    | { Kind: 'RecordFailure'; Invoice: GatewaySubscriptionInvoice; Attempt: number }
    /** Keep the latest term's access until this instant while the gateway retries (Q4). */
    | { Kind: 'ExtendAccess'; Until: Date; Invoice: GatewaySubscriptionInvoice }
    /** Mirror the gateway's cancel-at-period-end (or its withdrawal) onto AutoRenew. */
    | { Kind: 'SetAutoRenew'; On: boolean; EndsAt: Date | null }
    /** The gateway ended it: record the cancel in Orders through Orders.CancelSubscription. */
    | { Kind: 'FinishCancel'; Timing: 'Immediate' | 'EndOfTerm'; RequestDay: CalendarDay }
    /** A person must look; one open Task per subscription and code. */
    | { Kind: 'Notice'; Code: SyncNoticeCode; Reason: string; Urgent?: boolean };

export type SyncNoticeCode =
    | 'RenewalNotBooked'
    | 'ReactivatedByGateway'
    | 'RenewingAtGateway'
    | 'GatewayEndsBeforeCoverage'
    | 'GatewayPlanChanged'
    | 'RenewalAmountUnusual'
    | 'GatewayChargeNotBooked';

export interface SyncPlan {
    Steps: SyncStep[];
    /** Every way Orders and the gateway differ, in words, including ones that need no write (E6). */
    Differences: string[];
}

const ACTIVE = new Set(['Active', 'Trialing']);
const money = (v: number): string => `$${v.toFixed(2)}`;
const iso = (d: Date | null | undefined): string => (d ? d.toISOString() : 'unknown');

/**
 * The end of the coverage Orders sold: 00:00 business time the day after the latest term's last day.
 * The gateway charging before this instant is inside a covered day (E2's anchor is 00:00 on the last day).
 */
export function CoverageEndsAt(latestTermEnd: CalendarDay | null, zone: string): Date | null {
    return latestTermEnd ? DayStartUtc(AddDays(latestTermEnd, 1), zone) : null;
}

/**
 * Plan the steps that bring Orders in line with the gateway. Pure.
 *
 * @param now - the time of the run, for a subscription the gateway ended with no `EndedAt`.
 */
export function PlanProviderSubscriptionSync(orders: SyncOrdersFacts, gateway: SyncGatewayFacts, now: Date): SyncPlan {
    const steps: SyncStep[] = [];
    const differences: string[] = [];
    const sub = gateway.Subscription;
    const coverageEndsAt = CoverageEndsAt(orders.LatestTermEnd, orders.Zone);
    let booksRenewal = false;

    // ── 1. Money: every invoice the gateway was paid for ────────────────────────────────────────
    for (const invoice of gateway.Invoices) {
        if (invoice.Status !== 'paid') continue;
        const reason = invoice.BillingReason ?? '';
        if (reason === 'subscription_create') {
            // The gateway billed at creation: E2 already raises ChargedAtCreation. Never a renewal (the
            // term was paid at checkout), so nothing is booked; reported so the nightly pass shows it.
            if (invoice.AmountPaid > 0) differences.push(`${invoice.ProviderInvoiceID}: charged ${money(invoice.AmountPaid)} at creation (E2's ChargedAtCreation alert covers it); not a renewal`);
            continue;
        }
        if (reason !== RENEWAL_BILLING_REASON) {
            // A plan change's proration, or a one-off invoice someone raised at the gateway. Not a renewal,
            // so never booked as one; finance decides.
            if (invoice.AmountPaid > 0) {
                const code: SyncNoticeCode = reason === 'subscription_update' ? 'GatewayPlanChanged' : 'GatewayChargeNotBooked';
                const why = `the gateway charged ${money(invoice.AmountPaid)} on invoice ${invoice.ProviderInvoiceID} (${reason || 'no reason given'}), which is not a renewal, so Orders booked nothing for it. Decide at the gateway whether to keep or refund it.`;
                steps.push({ Kind: 'Notice', Code: code, Reason: why });
                differences.push(why);
            }
            continue;
        }

        // A renewal the gateway was paid for.
        const parked = parkReason(invoice, orders);
        if (parked) {
            steps.push({ Kind: 'Notice', Code: 'RenewalNotBooked', Urgent: true, Reason: parked });
            differences.push(parked);
            continue;
        }
        if (invoice.AmountPaid > 0) {
            const intent = invoice.ProviderIntentID!;
            if (orders.CapturedIntentIDs.has(intent)) continue;
            if (orders.UncapturedIntentIDs.has(intent)) {
                steps.push({ Kind: 'FinishCapture', Invoice: invoice });
                differences.push(`${invoice.ProviderInvoiceID}: renewal booked but its payment of ${money(invoice.AmountPaid)} not captured yet`);
                continue;
            }
        } else if (orders.BookedZeroInvoiceIDs.has(invoice.ProviderInvoiceID)) {
            continue;
        }
        steps.push({ Kind: 'BookRenewal', Invoice: invoice });
        booksRenewal = true;
        differences.push(`${invoice.ProviderInvoiceID}: the gateway was paid ${money(invoice.AmountPaid)} for a renewal Orders has not booked`);
        steps.push(...renewalNotices(invoice, orders, sub));
    }
    if (booksRenewal && orders.Status === 'Canceled') {
        steps.push({
            Kind: 'Notice',
            Code: 'ReactivatedByGateway',
            Reason:
                `the gateway charged a renewal of ${orders.SubscriptionNumber}, which Orders shows cancelled. Orders reactivated the same ` +
                `subscription and booked the renewal (a payment already taken is never refused). Ask the customer: keep it, or refund ` +
                `the charge at the gateway and cancel there.`,
        });
    }

    // ── 2. Failed attempts, and the access they keep (Q4) ───────────────────────────────────────
    for (const invoice of gateway.Invoices) {
        if (invoice.Status !== 'open' || (invoice.BillingReason ?? '') !== RENEWAL_BILLING_REASON) continue;
        for (let attempt = 1; attempt <= invoice.AttemptCount; attempt++) {
            if (orders.RecordedFailures.has(`${invoice.ProviderInvoiceID}#${attempt}`)) continue;
            steps.push({ Kind: 'RecordFailure', Invoice: invoice, Attempt: attempt });
            differences.push(`${invoice.ProviderInvoiceID}: collection attempt ${attempt} failed and is not recorded yet`);
        }
        const until = retryAccessUntil(invoice, orders, coverageEndsAt, sub.State);
        if (until) {
            steps.push({ Kind: 'ExtendAccess', Until: until, Invoice: invoice });
            differences.push(`${invoice.ProviderInvoiceID}: the gateway retries until ${iso(invoice.NextAttemptAt)}; access kept until ${iso(until)}`);
        }
    }

    // ── 3. The end state ─────────────────────────────────────────────────────────────────────────
    const ordersActive = ACTIVE.has(orders.Status);
    switch (sub.State) {
        case 'Renewing':
            if (ordersActive && !orders.AutoRenew) {
                steps.push({ Kind: 'SetAutoRenew', On: true, EndsAt: null });
                differences.push(`the gateway renews it, but Orders shows automatic renewal off (a cancel withdrawn at the gateway)`);
            } else if (orders.Status === 'Canceled' && !booksRenewal) {
                const why =
                    `the gateway still renews ${orders.SubscriptionNumber}, which Orders shows cancelled (a cancel withdrawn at the gateway ` +
                    `after it was cancelled in Orders). Nothing was changed. Cancel it at the gateway, or keep it: if the gateway charges, ` +
                    `Orders books the renewal and reactivates it.`;
                steps.push({ Kind: 'Notice', Code: 'RenewingAtGateway', Reason: why });
                differences.push(why);
            }
            break;
        case 'Ending': {
            if (ordersActive && orders.AutoRenew) {
                steps.push({ Kind: 'SetAutoRenew', On: false, EndsAt: sub.EndsAt ?? null });
                differences.push(`the gateway ends it at ${iso(sub.EndsAt)}, but Orders shows automatic renewal on`);
            }
            // Before the START of the last covered day: the gateway's period ends at its anchor, 00:00 business
            // time ON the last day (E2), so a routine cancel at period end ends inside the covered day.
            const lastDayStarts = orders.LatestTermEnd ? DayStartUtc(orders.LatestTermEnd, orders.Zone) : null;
            if (ordersActive && sub.EndsAt && lastDayStarts && sub.EndsAt.getTime() < lastDayStarts.getTime() - 1000) {
                const why =
                    `the gateway ends ${orders.SubscriptionNumber} at ${iso(sub.EndsAt)}, before the coverage Orders sold ends ` +
                    `(${iso(coverageEndsAt)}). Orders keeps access to its term end; if the customer should lose it sooner, cancel in Orders.`;
                steps.push({ Kind: 'Notice', Code: 'GatewayEndsBeforeCoverage', Reason: why });
                differences.push(why);
            }
            break;
        }
        case 'Ended':
            // Also when a renewal is booked in this same run: booking reactivates a cancelled subscription,
            // and a gateway that charged and then ended it (S9) must leave it cancelled again.
            if ((orders.Status !== 'Canceled' && orders.Status !== 'Expired') || booksRenewal) {
                const endedAt = sub.EndedAt ?? now;
                // Mid-term only when it ended before the last covered day began: a subscription ended at
                // its period end ends at its anchor, 00:00 on the last day, which is the end of term.
                const lastDayStarts = orders.LatestTermEnd ? DayStartUtc(orders.LatestTermEnd, orders.Zone) : null;
                const midTerm = lastDayStarts != null && endedAt.getTime() < lastDayStarts.getTime();
                steps.push({
                    Kind: 'FinishCancel',
                    Timing: midTerm ? 'Immediate' : 'EndOfTerm',
                    RequestDay: CalendarDayIn(endedAt, orders.Zone),
                });
                differences.push(`the gateway ended it at ${iso(endedAt)}, but Orders shows it ${orders.Status}`);
            }
            break;
        case 'Collecting':
            // Handled above: the failures and the access kept while the gateway retries.
            break;
    }
    return { Steps: steps, Differences: differences };
}

/** Why a paid renewal cannot be booked without a person, or null when it can. */
function parkReason(invoice: GatewaySubscriptionInvoice, orders: SyncOrdersFacts): string | null {
    const what = `the gateway's renewal invoice ${invoice.ProviderInvoiceID} (${money(invoice.AmountPaid)})`;
    if (invoice.PaidOutOfBand) {
        return `${what} was marked paid outside the gateway, so there is no gateway payment to book. Book it as the payment it was, or confirm it was not one.`;
    }
    if (invoice.CurrencyCode.toUpperCase() !== orders.CurrencyCode.toUpperCase()) {
        return `${what} is in ${invoice.CurrencyCode}, not the company's ${orders.CurrencyCode}; Orders books only its own currency.`;
    }
    if (invoice.AmountPaid > 0 && !invoice.ProviderIntentID) {
        return `${what} names no gateway payment intent, so the payment cannot be recorded against it.`;
    }
    return null;
}

/** Notices on a renewal being booked: an amount below the last term's that no coupon explains, tax, a plan change. */
function renewalNotices(invoice: GatewaySubscriptionInvoice, orders: SyncOrdersFacts, sub: SyncGatewayFacts['Subscription']): SyncStep[] {
    const out: SyncStep[] = [];
    const net = invoice.AmountPaid - invoice.Tax;
    const quantity = invoice.Quantity ?? 1;
    if (orders.LastUnitPrice != null && !invoice.Discounted && net / quantity < orders.LastUnitPrice - 0.005) {
        out.push({
            Kind: 'Notice',
            Code: 'RenewalAmountUnusual',
            Reason:
                `the gateway renewed ${orders.SubscriptionNumber} at ${money(net / quantity)} a unit, below the last term's ` +
                `${money(orders.LastUnitPrice)}, with no coupon on the invoice. Booked as charged (invoice ${invoice.ProviderInvoiceID}).`,
        });
    }
    if (invoice.Tax > 0) {
        out.push({
            Kind: 'Notice',
            Code: 'RenewalAmountUnusual',
            Reason: `the gateway's renewal invoice ${invoice.ProviderInvoiceID} carries ${money(invoice.Tax)} of tax; Orders booked the renewal net of it.`,
        });
    }
    const price = invoice.ProviderPriceID ?? sub.ProviderPriceID ?? null;
    if (orders.LastGatewayPriceID && price && price !== orders.LastGatewayPriceID) {
        out.push({
            Kind: 'Notice',
            Code: 'GatewayPlanChanged',
            Reason:
                `the gateway now bills ${orders.SubscriptionNumber} on price ${price}, not ${orders.LastGatewayPriceID}. Orders kept the ` +
                `subscription's product and booked what was charged; plans change by cancelling and buying again.`,
        });
    } else if (orders.LastGatewayQuantity != null && invoice.Quantity != null && invoice.Quantity !== orders.LastGatewayQuantity) {
        out.push({
            Kind: 'Notice',
            Code: 'GatewayPlanChanged',
            Reason: `the gateway now bills ${orders.SubscriptionNumber} for ${invoice.Quantity} units, not ${orders.LastGatewayQuantity}. Booked as charged.`,
        });
    }
    return out;
}

/**
 * Until when a failed renewal keeps access while the gateway retries (Q4): the end of the business day of
 * the gateway's next attempt, never past `RETRY_ACCESS_CAP_DAYS` beyond the coverage Orders sold, and only
 * when it moves the grants' end later. Null when there is nothing to keep (the gateway stopped trying, or
 * the grants already reach it).
 */
function retryAccessUntil(
    invoice: GatewaySubscriptionInvoice,
    orders: SyncOrdersFacts,
    coverageEndsAt: Date | null,
    state: SyncGatewayFacts['Subscription']['State'],
): Date | null {
    if (state !== 'Collecting' || !invoice.NextAttemptAt || !coverageEndsAt || !orders.LatestTermEnd) return null;
    const nextDay = CalendarDayIn(invoice.NextAttemptAt, orders.Zone);
    let until = DayStartUtc(AddDays(nextDay, 1), orders.Zone);
    const cap = DayStartUtc(AddDays(orders.LatestTermEnd, 1 + RETRY_ACCESS_CAP_DAYS), orders.Zone);
    if (until.getTime() > cap.getTime()) until = cap;
    const current = orders.GrantsValidTo ?? coverageEndsAt;
    return until.getTime() > current.getTime() ? until : null;
}
