/**
 * Charging the renewal card — the daily pass that collects a renewal order from the card the buyer
 * kept at checkout (#289).
 *
 * `Orders.SpawnRenewals` books a renewal order at lead time and never calls a gateway. A subscription
 * whose checkout kept a card (`Subscription.DefaultCustomerPaymentMethodID`, a `CustomerPaymentMethod`
 * wallet entry) gets a renewal whose one schedule row is due on the new term's first day. This pass
 * charges that card off-session on the due day, and tries again on the retry days after it
 * (`OrdersSettings.RenewalChargeRetryDays`, default 3, 7 and 11) until the order is paid, the access
 * cutoff (`RenewalAccessCutoffDaysPastDue`) suspends it, or the last retry day has passed.
 *
 * EACH ATTEMPT IS ITS OWN INTENT. `OpenPaymentIntent` opens it against the saved card, the gateway
 * confirms it at once (the customer is not there), and a success is captured through
 * `Orders.CapturePayment` against that order — the ordinary capture path, so the journal entry, the
 * rollups and `ReconcilePaymentGatedGrants` all run as they do for any payment. A decline, or a demand
 * that the absent customer authenticate (SCA), is recorded as a Failed intent; neither is retried
 * before the next retry day.
 *
 * WHAT STOPS A DOUBLE CHARGE
 *   · the gateway idempotency key is the order and the attempt day, so a rerun on the same day gets
 *     the same intent back rather than a second charge;
 *   · each attempt writes a `SubscriptionEvent` ('PaymentSucceeded' / 'PaymentFailed') naming its
 *     attempt day and its intent, and a day that already has one is skipped. A success is logged the
 *     moment the gateway answers, before the capture, so the intent is known to be this pass's own;
 *   · an intent still Processing holds the order off until the gateway answers;
 *   · the capture's idempotency key is the intent, so one intent books one payment. A webhook for the
 *     same intent only stamps the intent (`PaymentWebhookHandler.applyEvent`): a card driver does not
 *     settle late, and `BookSettledCheckoutPaymentIfNeeded` books only intents a checkout session
 *     opened.
 *
 * MONEY TAKEN BUT NOT BOOKED. A Succeeded intent on the order with no payment means the gateway has
 * the money: a capture failed, or a charge that came back Processing has since succeeded. The next
 * pass captures it before anything else, on any day, and charges nothing new. The exception is an
 * intent a checkout session opened (the update-card page): checkout books it, so the pass holds the
 * order and reports it rather than booking it twice or charging the old card on top of it.
 *
 * AN UNKNOWN OUTCOME STOPS THE CARD. When the gateway cannot be reached, or answers with a server
 * error, the charge may or may not have happened. The attempt is logged as a 'PaymentFailed' event
 * marked `OutcomeUnknown`, and the order is held from then on: the next retry day carries a new
 * idempotency key, so charging again could take the money twice. A person reconciles the order with
 * the gateway.
 *
 * AN OPEN UPDATE-CARD PAGE HOLDS THE RETRY. While an unexpired checkout session on the order holds an
 * intent, the buyer may be paying with a new card, so the old card is not charged that day.
 *
 * DATED ON THE GATEWAY'S DAY. The payment is dated the business day the gateway took the money,
 * which is not the run's day when the two differ (a run near midnight, a rerun with an as-of day).
 *
 * ONE ORDER'S FAILURE DOES NOT STOP THE BATCH. Each order is attempted on its own and a fault is
 * reported in `Failures`.
 *
 * CONNECTS TO:
 *   SELECTION: SpawnRenewalsOperation (the renewal order and its one-row schedule)
 *   CARD:      CheckoutSavedInstrument (writes the wallet entry and the renewal card)
 *   GATEWAY:   PaymentIntentService.OpenPaymentIntent → BasePaymentProvider.CreateIntent
 *   CAPTURE:   CapturePaymentOperation → PaymentHeaderEntityServer → ReconcilePaymentGatedGrants
 *   SETTINGS:  OrdersSettings.RenewalChargeRetryDays, RenewalAccessCutoffDaysPastDue
 *   CALLER:    packages/Server/src/custom/charge-renewals.action.ts (the daily scheduled job)
 */
import { LogError, RunView, type IMetadataProvider, type IRunViewProvider, type UserInfo } from '@memberjunction/core';
import {
    LocalDay,
    NON_OWING_STATUSES,
    ToISODate,
    mjBizAppsOrdersPaymentIntentEntity,
    mjBizAppsOrdersSubscriptionEventEntity,
} from '@mj-biz-apps/orders-entities';
import { BusinessTimeZoneEngine } from '@mj-biz-apps/common-entities';
import { CalendarDayOrToday } from './calendar-day.js';
import { CapturePaymentOperation } from './CapturePaymentOperation.js';
import { OrdersSettings } from './OrdersSettings.js';
import { OpenPaymentIntent, SUPPORTED_PAYMENT_CURRENCY, type OpenIntentResult } from './PaymentIntentService.js';
import { AddDays } from './PaymentTermsBehavior.js';
import { DaysBetween } from './InvoiceBehavior.js';
import { RequireOptionalDay, RequireOptionalUUID, RequireUUIDs } from './sql-guards.js';

const PAYMENT_INTENT_ENTITY = 'MJ_BizApps_Orders: Payment Intents';
const PAYMENT_HEADER_ENTITY = 'MJ_BizApps_Orders: Payment Headers';
const SUBSCRIPTION_EVENT_ENTITY = 'MJ_BizApps_Orders: Subscription Events';
const CHECKOUT_SESSION_ENTITY = 'MJ_BizApps_Orders: Checkout Sessions';

/** Written into every event this pass logs, so its attempts can be told from other payment events. */
export const RENEWAL_CHARGE_SOURCE = 'RenewalCharge';

// ─── Pure rules ─────────────────────────────────────────────────────────────────────────────────

/** The days after the due day on which the card is charged: the due day (0), then each retry day. */
export function RenewalChargeDays(retryDays: readonly number[]): number[] {
    const retries = retryDays.filter((d) => Number.isInteger(d) && d > 0);
    return [0, ...[...new Set(retries)].sort((a, b) => a - b)];
}

/** What the pass knows about one renewal order on one day. */
export interface RenewalChargeFacts {
    /** The pass's day, `YYYY-MM-DD`. */
    AsOfDay: string;
    /** The order's next unpaid due day, `YYYY-MM-DD`. */
    DueDay: string;
    /** `OrdersSettings.RenewalChargeRetryDays`. */
    RetryDays: readonly number[];
    /** `OrdersSettings.RenewalAccessCutoffDaysPastDue`; `null` when the cutoff is off. */
    CutoffDaysPastDue: number | null;
    /** Days this pass already attempted the order, from its events. */
    AttemptDays: readonly string[];
    /** True while an intent on the order is still Processing at the gateway. */
    InFlight: boolean;
    /** A Succeeded intent on the order, not opened by a checkout session, that has no payment yet. */
    SettledUncapturedIntentID: string | null;
    /** Why the order must not be charged or captured until a person looks at it; null when it may. */
    HoldReason?: string | null;
    /** True while an unexpired checkout session on the order holds an intent (the update-card page). */
    CheckoutOpen?: boolean;
}

export type RenewalChargeDecision =
    | { Action: 'Capture'; PaymentIntentID: string }
    | { Action: 'Charge'; Attempt: number; NextAttemptDay: string | null }
    | { Action: 'Hold'; Reason: string }
    | { Action: 'Skip'; Reason: string };

/**
 * The next charge day after `daysSinceDue`, as `YYYY-MM-DD`, or null when there is none before the
 * cutoff. A retry on or after the cutoff day never happens: access is suspended that day.
 */
export function NextRenewalChargeDay(
    dueDay: string,
    daysSinceDue: number,
    chargeDays: readonly number[],
    cutoffDaysPastDue: number | null,
): string | null {
    const next = chargeDays.find((d) => d > daysSinceDue && (cutoffDaysPastDue == null || d < cutoffDaysPastDue));
    return next == null ? null : AddDays(dueDay, next);
}

/**
 * Whether to charge, capture or leave one renewal order today.
 *
 * In order: money already taken is booked before anything else, on any day; an intent still at the
 * gateway holds the order off; then the day must be a charge day before the cutoff that has not
 * been attempted yet.
 */
export function DecideRenewalCharge(facts: RenewalChargeFacts): RenewalChargeDecision {
    if (facts.HoldReason) return { Action: 'Hold', Reason: facts.HoldReason };
    if (facts.SettledUncapturedIntentID) return { Action: 'Capture', PaymentIntentID: facts.SettledUncapturedIntentID };
    if (facts.InFlight) return { Action: 'Skip', Reason: 'an earlier charge is still processing at the gateway' };
    if (facts.CheckoutOpen) return { Action: 'Skip', Reason: 'a checkout session on the order holds a payment in progress' };

    const daysSinceDue = DaysBetween(facts.DueDay, facts.AsOfDay);
    if (daysSinceDue < 0) return { Action: 'Skip', Reason: `not due until ${facts.DueDay}` };
    if (facts.CutoffDaysPastDue != null && daysSinceDue >= facts.CutoffDaysPastDue) {
        return { Action: 'Skip', Reason: `${daysSinceDue} day(s) past due, at or past the access cutoff of ${facts.CutoffDaysPastDue}; retries stop at suspension` };
    }

    const chargeDays = RenewalChargeDays(facts.RetryDays);
    const index = chargeDays.indexOf(daysSinceDue);
    if (index < 0) {
        const next = NextRenewalChargeDay(facts.DueDay, daysSinceDue, chargeDays, facts.CutoffDaysPastDue);
        return {
            Action: 'Skip',
            Reason: next ? `not a charge day; the next attempt is on ${next}` : 'the last retry day has passed',
        };
    }
    if (facts.AttemptDays.includes(facts.AsOfDay)) return { Action: 'Skip', Reason: `already attempted on ${facts.AsOfDay}` };

    return {
        Action: 'Charge',
        Attempt: index + 1,
        NextAttemptDay: NextRenewalChargeDay(facts.DueDay, daysSinceDue, chargeDays, facts.CutoffDaysPastDue),
    };
}

/**
 * The gateway idempotency key for an attempt: one per order per attempt day, so a rerun on the same
 * day cannot charge twice and the next retry day is a new attempt.
 */
export function RenewalChargeIdempotencyKey(orderID: string, attemptDay: string): string {
    return `renewal-charge-${orderID.toLowerCase()}-${attemptDay}`;
}

/** The capture's idempotency key: one payment per intent. */
export function RenewalCaptureIdempotencyKey(paymentIntentID: string): string {
    return `renewal-charge-capture:${paymentIntentID.toLowerCase()}`;
}

/** How an attempt ended at the gateway. */
export type RenewalChargeResultKind = 'Succeeded' | 'Declined' | 'AuthenticationRequired' | 'InFlight' | 'NotOpened';

/**
 * Read an `OpenPaymentIntent` answer for an off-session charge.
 *
 * An SCA demand counts as a failure whether it came back as an error (`authentication_required`) or
 * as an intent waiting on the customer (`requires_action`): the customer is not there (#289). An
 * intent still `RequiresPayment` after an off-session confirm was not paid, so it is a decline.
 */
export function ClassifyRenewalCharge(result: Pick<OpenIntentResult, 'Success' | 'Status' | 'PaymentIntentID' | 'RequiresAuthentication'>): RenewalChargeResultKind {
    if (!result.PaymentIntentID) return 'NotOpened';
    if (result.RequiresAuthentication) return 'AuthenticationRequired';
    if (!result.Success) return 'Declined';
    if (result.Status === 'Succeeded') return 'Succeeded';
    if (result.Status === 'Processing') return 'InFlight';
    return 'Declined';
}

/**
 * The business day the gateway took the money, `YYYY-MM-DD`. `fallbackDay` when the gateway gave no
 * time, which is the business day the pass learned of it.
 */
export function RenewalCaptureDay(capturedAt: Date | string | null | undefined, fallbackDay: string): string {
    const instant = capturedAt instanceof Date ? capturedAt : capturedAt ? new Date(capturedAt) : null;
    if (!instant || Number.isNaN(instant.getTime())) return fallbackDay;
    return LocalDay(instant) || fallbackDay;
}

// ─── The pass ───────────────────────────────────────────────────────────────────────────────────

export interface ChargeRenewalsInput {
    /** Treat this as today. Defaults to the business day. */
    AsOfDate?: Date | string;
    /** Restrict to the renewal orders of one subscription. */
    SubscriptionID?: string;
    /** Report what would be charged, and charge nothing. */
    Preview?: boolean;
    /** Cap on orders charged or captured in one pass. */
    MaxCount?: number;
}

export type RenewalChargeOutcome = 'Charged' | 'Captured' | 'Declined' | 'AuthenticationRequired' | 'Processing' | 'WouldCharge' | 'WouldCapture' | 'Skipped' | 'Error';

/** One renewal order the pass looked at, and what came of it. */
export interface RenewalChargeAttempt {
    OrderID: string;
    OrderNumber: string;
    SubscriptionID: string;
    SubscriptionNumber: string;
    Amount: number;
    DueDate: string;
    DaysSinceDue: number;
    /** 1 for the due day, 2 for the first retry day, and so on. */
    Attempt?: number;
    Outcome: RenewalChargeOutcome;
    Reason?: string;
    PaymentIntentID?: string;
    PaymentID?: string;
    PaymentDate?: string;
    /** After a failure, the next day the card will be tried; null when no attempt is left. */
    NextAttemptDay?: string | null;
}

export interface ChargeRenewalsOutput {
    Success: boolean;
    Message: string;
    AsOfDate: string;
    RetryDays: number[];
    CutoffDaysPastDue: number | null;
    Considered: number;
    /** Orders paid by this pass: charged and captured, or a settled charge captured. On a preview, orders it would charge or capture. */
    Charged: number;
    /** Attempts the gateway declined or that needed authentication. */
    Failed: number;
    Skipped: number;
    Attempts: RenewalChargeAttempt[];
    /** Orders whose attempt hit a fault. The rest of the pass stands. */
    Failures: Array<{ OrderID: string; Error: string }>;
}

/** A renewal order with a renewal card, as the selection reads it. */
interface ChargeCandidate {
    OrderID: string;
    OrderNumber: string;
    CompanyID: string;
    Balance: number;
    NextDueDate: unknown;
    SubscriptionID: string;
    SubscriptionNumber: string;
    CustomerPaymentMethodID: string;
    OwnerPersonID: string | null;
    OwnerOrganizationID: string | null;
    PaymentProviderID: string;
    ProviderCustomerRef: string | null;
    ProviderInstrumentRef: string;
    TenderCode: string;
}

interface OrderIntentState {
    AttemptDays: string[];
    InFlight: boolean;
    SettledUncaptured: { ID: string; Amount: number; LastEventAt: Date | null; EventID: string | null } | null;
    HoldReason: string | null;
    CheckoutOpen: boolean;
}

const emptyState = (): OrderIntentState => ({ AttemptDays: [], InFlight: false, SettledUncaptured: null, HoldReason: null, CheckoutOpen: false });

/**
 * Charge the renewal card of every renewal order due a charge today. See the header for the rules.
 */
export async function ChargeRenewals(
    input: ChargeRenewalsInput,
    provider: IMetadataProvider,
    user: UserInfo,
): Promise<ChargeRenewalsOutput> {
    RequireOptionalUUID(input.SubscriptionID, 'SubscriptionID');
    RequireOptionalDay(input.AsOfDate, 'AsOfDate');
    const asOf = ToISODate(await CalendarDayOrToday(input.AsOfDate, provider, user)) as string;
    await OrdersSettings.Load(provider, user);
    const retryDays = OrdersSettings.RenewalChargeRetryDays;
    const cutoff = OrdersSettings.RenewalAccessCutoffDaysPastDue;
    const chargeDays = RenewalChargeDays(retryDays);

    const out: ChargeRenewalsOutput = {
        Success: true,
        Message: '',
        AsOfDate: asOf,
        RetryDays: retryDays,
        CutoffDaysPastDue: cutoff,
        Considered: 0,
        Charged: 0,
        Failed: 0,
        Skipped: 0,
        Attempts: [],
        Failures: [],
    };

    const candidates = await findCandidates(provider, asOf, chargeDays[chargeDays.length - 1], input.SubscriptionID);
    out.Considered = candidates.length;
    const states = await loadIntentStates(candidates.map((c) => c.OrderID), provider, user);
    const limit = input.MaxCount ?? Number.MAX_SAFE_INTEGER;
    let committed = 0;

    for (const candidate of candidates) {
        const dueDay = ToISODate(candidate.NextDueDate) as string;
        const state = states.get(candidate.OrderID.toLowerCase()) ?? emptyState();
        const attempt: RenewalChargeAttempt = {
            OrderID: candidate.OrderID,
            OrderNumber: candidate.OrderNumber,
            SubscriptionID: candidate.SubscriptionID,
            SubscriptionNumber: candidate.SubscriptionNumber,
            Amount: Number(candidate.Balance),
            DueDate: dueDay,
            DaysSinceDue: DaysBetween(dueDay, asOf),
            Outcome: 'Skipped',
        };
        out.Attempts.push(attempt);

        const decision = DecideRenewalCharge({
            AsOfDay: asOf,
            DueDay: dueDay,
            RetryDays: retryDays,
            CutoffDaysPastDue: cutoff,
            AttemptDays: state.AttemptDays,
            InFlight: state.InFlight,
            SettledUncapturedIntentID: state.SettledUncaptured?.ID ?? null,
            HoldReason: state.HoldReason,
            CheckoutOpen: state.CheckoutOpen,
        });
        if (decision.Action === 'Hold') {
            // Reported as a failure so the run is not green: it needs a person, not another pass.
            LogError(`Orders.ChargeRenewals: order ${candidate.OrderNumber} held: ${decision.Reason}`);
            attempt.Outcome = 'Error';
            attempt.Reason = decision.Reason;
            out.Failures.push({ OrderID: candidate.OrderID, Error: decision.Reason });
            continue;
        }
        if (decision.Action === 'Skip') {
            attempt.Reason = decision.Reason;
            out.Skipped++;
            continue;
        }
        if (committed >= limit) {
            attempt.Reason = 'left for the next pass: MaxCount reached';
            out.Skipped++;
            continue;
        }
        committed++;

        if (input.Preview) {
            attempt.Outcome = decision.Action === 'Charge' ? 'WouldCharge' : 'WouldCapture';
            if (decision.Action === 'Charge') attempt.Attempt = decision.Attempt;
            attempt.PaymentIntentID = decision.Action === 'Capture' ? decision.PaymentIntentID : undefined;
            out.Charged++;
            continue;
        }

        try {
            if (decision.Action === 'Capture') {
                const settled = state.SettledUncaptured!;
                attempt.PaymentIntentID = settled.ID;
                attempt.Amount = settled.Amount;
                const fallback = await businessToday(provider, user);
                await capture(candidate, attempt, settled.ID, settled.Amount, RenewalCaptureDay(settled.LastEventAt, fallback), settled.EventID, provider, user);
                attempt.Outcome = 'Captured';
                out.Charged++;
                continue;
            }
            attempt.Attempt = decision.Attempt;
            await chargeOnce(candidate, attempt, decision, asOf, provider, user);
            if (attempt.Outcome === 'Charged') out.Charged++;
            else if (attempt.Outcome === 'Declined' || attempt.Outcome === 'AuthenticationRequired') out.Failed++;
            else if (attempt.Outcome === 'Error') out.Failures.push({ OrderID: candidate.OrderID, Error: attempt.Reason ?? 'unknown error' });
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            LogError(`Orders.ChargeRenewals: order ${candidate.OrderNumber} failed: ${message}`);
            attempt.Outcome = 'Error';
            attempt.Reason = message;
            out.Failures.push({ OrderID: candidate.OrderID, Error: message });
        }
    }

    out.Success = out.Failures.length === 0;
    const verb = input.Preview ? 'would be charged' : 'paid';
    out.Message =
        `${out.Considered} renewal order(s) with a renewal card as of ${asOf}: ${out.Charged} ${verb}, ` +
        `${out.Failed} declined, ${out.Skipped} skipped` +
        (out.Failures.length ? `, ${out.Failures.length} failed` : '') +
        '.';
    return out;
}

/** One off-session charge, then its capture or its failure record. Faults throw to the caller. */
async function chargeOnce(
    candidate: ChargeCandidate,
    attempt: RenewalChargeAttempt,
    decision: { Attempt: number; NextAttemptDay: string | null },
    asOf: string,
    provider: IMetadataProvider,
    user: UserInfo,
): Promise<void> {
    const idempotencyKey = RenewalChargeIdempotencyKey(candidate.OrderID, asOf);
    let opened: OpenIntentResult;
    try {
        opened = await OpenPaymentIntent(
            {
                PaymentProviderID: candidate.PaymentProviderID,
                Amount: Number(candidate.Balance),
                CurrencyCode: SUPPORTED_PAYMENT_CURRENCY,
                OrderHeaderID: candidate.OrderID,
                BillToPersonID: candidate.OwnerPersonID,
                BillToOrganizationID: candidate.OwnerPersonID ? null : candidate.OwnerOrganizationID,
                ProviderCustomerRef: candidate.ProviderCustomerRef,
                ProviderInstrumentRef: candidate.ProviderInstrumentRef,
                IdempotencyKey: idempotencyKey,
                Metadata: {
                    Purpose: RENEWAL_CHARGE_SOURCE,
                    SubscriptionID: candidate.SubscriptionID,
                    Attempt: String(decision.Attempt),
                },
            },
            provider,
            user,
        );
    } catch (err) {
        // The gateway may have charged the card: unreachable, a server error, or our row not written
        // after it answered. Recorded so later passes hold the order instead of charging it again
        // under the next day's key.
        const reason = err instanceof Error ? err.message : String(err);
        await logEvent(
            candidate,
            'PaymentFailed',
            {
                Source: RENEWAL_CHARGE_SOURCE,
                Attempt: decision.Attempt,
                AttemptDay: asOf,
                Amount: Number(candidate.Balance),
                OutcomeUnknown: true,
                IdempotencyKey: idempotencyKey,
                Reason: reason,
            },
            null,
            provider,
            user,
        );
        throw err;
    }
    attempt.PaymentIntentID = opened.PaymentIntentID;

    const kind = ClassifyRenewalCharge(opened);
    if (kind === 'NotOpened') {
        // Nothing reached the card: a configuration fault, not a decline. Not logged as a failed
        // payment, so nobody is told their card failed; a rerun sends the same idempotency key.
        attempt.Outcome = 'Error';
        attempt.Reason = opened.Reason ?? 'the gateway did not open an intent';
        return;
    }
    if (kind === 'InFlight') {
        attempt.Outcome = 'Processing';
        attempt.Reason = 'the gateway is still processing the charge; a later pass books it once it succeeds';
        return;
    }
    if (kind === 'Succeeded') {
        const day = RenewalCaptureDay(opened.CapturedAt, await businessToday(provider, user));
        // Logged before the capture: it records that the gateway took the money, and it is what lets
        // a later pass recognise this intent as its own if the capture below fails.
        const eventID = await logEvent(
            candidate,
            'PaymentSucceeded',
            {
                Source: RENEWAL_CHARGE_SOURCE,
                Attempt: decision.Attempt,
                AttemptDay: asOf,
                PaymentIntentID: opened.PaymentIntentID,
                Amount: Number(candidate.Balance),
                PaymentDate: day,
            },
            null,
            provider,
            user,
        );
        await capture(candidate, attempt, opened.PaymentIntentID!, Number(candidate.Balance), day, eventID, provider, user);
        attempt.Outcome = 'Charged';
        return;
    }

    // Declined, or the card wants the absent customer to authenticate.
    await markIntentFailed(opened.PaymentIntentID!, provider, user);
    attempt.Outcome = kind;
    attempt.Reason = opened.Reason ?? (kind === 'AuthenticationRequired' ? 'the card requires authentication' : 'the card was declined');
    attempt.NextAttemptDay = decision.NextAttemptDay;
    await logEvent(
        candidate,
        'PaymentFailed',
        {
            Source: RENEWAL_CHARGE_SOURCE,
            Attempt: decision.Attempt,
            AttemptDay: asOf,
            PaymentIntentID: opened.PaymentIntentID,
            Amount: Number(candidate.Balance),
            Reason: attempt.Reason,
            FailureCode: opened.FailureCode ?? null,
            AuthenticationRequired: kind === 'AuthenticationRequired',
            NextAttemptDay: decision.NextAttemptDay,
        },
        null,
        provider,
        user,
    );
}

/** Book the gateway's money against the renewal order, and name the payment on the success event. */
async function capture(
    candidate: ChargeCandidate,
    attempt: RenewalChargeAttempt,
    paymentIntentID: string,
    amount: number,
    paymentDate: string,
    eventID: string | null,
    provider: IMetadataProvider,
    user: UserInfo,
): Promise<void> {
    const op = new CapturePaymentOperation();
    const result = await op.ExecuteServer(
        {
            PaymentIntentID: paymentIntentID,
            Amount: amount,
            ReceivingCompanyID: candidate.CompanyID,
            BillToPersonID: candidate.OwnerPersonID,
            BillToOrganizationID: candidate.OwnerPersonID ? null : candidate.OwnerOrganizationID,
            TenderCode: candidate.TenderCode,
            PaymentDate: paymentDate,
            Reference: `Renewal charge for ${candidate.SubscriptionNumber}`,
            Allocations: [{ OrderHeaderID: candidate.OrderID, Amount: amount }],
            PaymentDetail: {
                PaymentProviderID: candidate.PaymentProviderID,
                ProviderInstrumentRef: candidate.ProviderInstrumentRef,
                SourceCustomerPaymentMethodID: candidate.CustomerPaymentMethodID,
            },
            IdempotencyKey: RenewalCaptureIdempotencyKey(paymentIntentID),
        },
        { provider, user, emitProgress: () => undefined },
    );
    const output = result.Output;
    if (!result.Success || !output?.Success) {
        const detail =
            result.ErrorMessage ?? output?.Message ?? output?.Blockers?.map((b) => b.Message).join('; ') ?? 'unknown error';
        // The money has moved; the intent stays Succeeded with no payment, and the next pass books it.
        throw new Error(`the gateway took ${amount} but the payment did not book: ${detail}. The next pass books it.`);
    }
    const paymentID = output.PaymentHeaderID ?? null;
    attempt.PaymentID = paymentID ?? undefined;
    attempt.PaymentDate = paymentDate;
    if (eventID && paymentID) await notePaymentOnEvent(eventID, paymentID, paymentDate, provider, user);
}

/** Point the success event at the payment that booked it. Fail-soft, like `logEvent`. */
async function notePaymentOnEvent(eventID: string, paymentID: string, paymentDate: string, provider: IMetadataProvider, user: UserInfo): Promise<void> {
    try {
        const event = await provider.GetEntityObject<mjBizAppsOrdersSubscriptionEventEntity>(SUBSCRIPTION_EVENT_ENTITY, user);
        if (!(await event.Load(eventID))) return;
        event.RelatedPaymentID = paymentID;
        const data = parseEventData(event.EventData) ?? {};
        event.EventData = JSON.stringify({ ...data, PaymentDate: paymentDate });
        if (!(await event.Save())) {
            LogError(`Orders.ChargeRenewals: could not name payment ${paymentID} on event ${eventID}: ${event.LatestResult?.CompleteMessage ?? 'unknown error'}`);
        }
    } catch (err) {
        LogError(`Orders.ChargeRenewals: could not name payment ${paymentID} on event ${eventID}: ${err instanceof Error ? err.message : String(err)}`);
    }
}

/** Our intent row moves to Failed: an SCA demand comes back as an open intent the gateway still holds. */
async function markIntentFailed(paymentIntentID: string, provider: IMetadataProvider, user: UserInfo): Promise<void> {
    const intent = await provider.GetEntityObject<mjBizAppsOrdersPaymentIntentEntity>(PAYMENT_INTENT_ENTITY, user);
    if (!(await intent.Load(paymentIntentID))) throw new Error(`payment intent ${paymentIntentID} was not found`);
    if (intent.Status === 'Failed') return;
    intent.Status = 'Failed';
    if (!(await intent.Save())) {
        throw new Error(`could not mark payment intent ${paymentIntentID} Failed: ${intent.LatestResult?.CompleteMessage ?? 'unknown error'}`);
    }
}

/**
 * Log an attempt on the subscription. Fail-soft: by now the gateway has answered and the payment, if
 * any, is booked; a missing event must not turn that into a fault. It does cost the same-day guard
 * for this order, which the gateway idempotency key still covers.
 */
async function logEvent(
    candidate: ChargeCandidate,
    eventType: 'PaymentSucceeded' | 'PaymentFailed',
    data: Record<string, unknown>,
    paymentID: string | null,
    provider: IMetadataProvider,
    user: UserInfo,
): Promise<string | null> {
    try {
        const event = await provider.GetEntityObject<mjBizAppsOrdersSubscriptionEventEntity>(SUBSCRIPTION_EVENT_ENTITY, user);
        event.NewRecord();
        event.SubscriptionID = candidate.SubscriptionID;
        event.EventType = eventType;
        event.OccurredAt = new Date();
        event.RelatedOrderHeaderID = candidate.OrderID;
        if (paymentID) event.RelatedPaymentID = paymentID;
        event.EventData = JSON.stringify(data);
        if (!(await event.Save())) {
            LogError(`Orders.ChargeRenewals: could not log ${eventType} for order ${candidate.OrderNumber}: ${event.LatestResult?.CompleteMessage ?? 'unknown error'}`);
            return null;
        }
        return event.ID;
    } catch (err) {
        LogError(`Orders.ChargeRenewals: could not log ${eventType} for order ${candidate.OrderNumber}: ${err instanceof Error ? err.message : String(err)}`);
        return null;
    }
}

async function businessToday(provider: IMetadataProvider, user: UserInfo): Promise<string> {
    await BusinessTimeZoneEngine.Instance.Config(false, user, provider);
    return BusinessTimeZoneEngine.Instance.Today();
}

/**
 * Renewal orders with an active renewal card that still owe money, due within the charge window.
 *
 * Raw SQL for the same reason as `SpawnRenewals.findDue`: one statement over five tables. The order's
 * card is the renewal card of the subscription its first renewal line renews. `NextDueDate` and
 * `Balance` come from `vwOrderHeaders`, the same figures the overdue rule and the access cutoff read.
 */
async function findCandidates(
    provider: IMetadataProvider,
    asOf: string,
    windowDays: number,
    subscriptionID?: string,
): Promise<ChargeCandidate[]> {
    const db = provider as unknown as { ExecuteSQL(sql: string): Promise<unknown> };
    const owing = NON_OWING_STATUSES.map((s) => `'${s}'`).join(',');
    const only = subscriptionID ? `AND s.ID = '${subscriptionID}'` : '';
    const rows = (await db.ExecuteSQL(`
        WITH renewalLine AS (
            SELECT ol.OrderHeaderID, ol.RenewsSubscriptionID,
                   ROW_NUMBER() OVER (PARTITION BY ol.OrderHeaderID ORDER BY ol.LineNumber) AS rn
            FROM __mj_BizAppsOrders.OrderLine ol
            WHERE ol.RenewsSubscriptionID IS NOT NULL
        )
        SELECT
            oh.ID                AS OrderID,
            oh.OrderNumber,
            oh.CompanyID,
            oh.Balance,
            oh.NextDueDate,
            s.ID                 AS SubscriptionID,
            s.SubscriptionNumber,
            cpm.ID               AS CustomerPaymentMethodID,
            cpm.OwnerPersonID,
            cpm.OwnerOrganizationID,
            pd.PaymentProviderID,
            pd.ProviderCustomerRef,
            pd.ProviderInstrumentRef,
            pt.Code              AS TenderCode
        FROM __mj_BizAppsOrders.vwOrderHeaders oh
        JOIN renewalLine rl ON rl.OrderHeaderID = oh.ID AND rl.rn = 1
        JOIN __mj_BizAppsOrders.Subscription s ON s.ID = rl.RenewsSubscriptionID
        JOIN __mj_BizAppsOrders.CustomerPaymentMethod cpm ON cpm.ID = s.DefaultCustomerPaymentMethodID
        JOIN __mj_BizAppsOrders.PaymentDetail pd ON pd.ID = cpm.PaymentDetailID
        JOIN __mj_BizAppsOrders.PaymentType pt ON pt.ID = pd.PaymentTypeID
        WHERE oh.Status NOT IN (${owing})
          AND oh.Balance > 0
          AND oh.NextDueDate IS NOT NULL
          AND oh.NextDueDate <= '${asOf}'
          AND oh.NextDueDate >= DATEADD(DAY, -${Math.max(0, Math.floor(windowDays))}, '${asOf}')
          -- Turning automatic renewal off withdraws the consent to charge the card.
          AND s.AutoRenew = 1
          AND cpm.IsActive = 1
          AND pd.PaymentProviderID IS NOT NULL
          AND pd.ProviderInstrumentRef IS NOT NULL
          ${only}
        ORDER BY oh.NextDueDate, oh.OrderNumber
    `)) as ChargeCandidate[];
    return Array.isArray(rows) ? rows : [];
}

/**
 * For each order: the days this pass already attempted it, whether an intent is still Processing, a
 * Succeeded intent with no payment, and whether anything holds the order for a person.
 *
 * A Succeeded intent with no payment is captured here unless a checkout session opened it: checkout
 * books its own, so that one holds the order instead. Any Processing intent holds the order off,
 * whoever opened it: charging the card while another payment is in flight could take the money twice.
 */
async function loadIntentStates(orderIDs: string[], provider: IMetadataProvider, user: UserInfo): Promise<Map<string, OrderIntentState>> {
    const out = new Map<string, OrderIntentState>();
    if (!orderIDs.length) return out;
    const rv = new RunView(provider as unknown as IRunViewProvider);
    const ids = RequireUUIDs(orderIDs, 'OrderHeaderID').map((id) => `'${id}'`).join(',');
    const state = (orderID: string): OrderIntentState => {
        const k = orderID.toLowerCase();
        let s = out.get(k);
        if (!s) {
            s = emptyState();
            out.set(k, s);
        }
        return s;
    };

    // Sequential: a caller's transaction shares one connection.
    const events = await rv.RunView<{ ID: string; EventType: string; RelatedOrderHeaderID: string; EventData: string | null }>(
        {
            EntityName: SUBSCRIPTION_EVENT_ENTITY,
            ExtraFilter: `EventType IN ('PaymentSucceeded','PaymentFailed') AND RelatedOrderHeaderID IN (${ids})`,
            Fields: ['ID', 'EventType', 'RelatedOrderHeaderID', 'EventData'],
            ResultType: 'simple',
            BypassCache: true,
        },
        user,
    );
    if (!events.Success) throw new Error(`Could not read renewal charge events: ${events.ErrorMessage}`);
    /** Intent id → the success event that names it, for this pass's own successful charges. */
    const ownSuccesses = new Map<string, string>();
    for (const e of events.Results ?? []) {
        const data = parseEventData(e.EventData);
        if (data?.Source !== RENEWAL_CHARGE_SOURCE) continue;
        if (typeof data.AttemptDay === 'string') state(e.RelatedOrderHeaderID).AttemptDays.push(data.AttemptDay);
        if (data.OutcomeUnknown === true && !state(e.RelatedOrderHeaderID).HoldReason) {
            state(e.RelatedOrderHeaderID).HoldReason =
                `the outcome of the charge on ${String(data.AttemptDay)} is unknown; reconcile the order with the gateway ` +
                `(idempotency key ${String(data.IdempotencyKey)}) before the card is charged again`;
        }
        if (e.EventType === 'PaymentSucceeded' && typeof data.PaymentIntentID === 'string') {
            ownSuccesses.set(data.PaymentIntentID.toLowerCase(), e.ID);
        }
    }

    const intents = await rv.RunView<{ ID: string; OrderHeaderID: string; Status: string; Amount: number; LastEventAt: Date | null }>(
        {
            EntityName: PAYMENT_INTENT_ENTITY,
            ExtraFilter: `OrderHeaderID IN (${ids}) AND Status IN ('Processing','Succeeded')`,
            Fields: ['ID', 'OrderHeaderID', 'Status', 'Amount', 'LastEventAt'],
            OrderBy: '__mj_CreatedAt',
            ResultType: 'simple',
            BypassCache: true,
        },
        user,
    );
    if (!intents.Success) throw new Error(`Could not read renewal payment intents: ${intents.ErrorMessage}`);

    // Checkout sessions on these orders (the update-card page): an unexpired one holding an intent
    // holds the retry, and an intent a session opened is booked by checkout, never here.
    const sessions = await rv.RunView<{ DraftOrderID: string; PaymentIntentID: string | null; Status: string; ExpiresAt: Date | null }>(
        {
            EntityName: CHECKOUT_SESSION_ENTITY,
            ExtraFilter: `DraftOrderID IN (${ids}) AND PaymentIntentID IS NOT NULL`,
            Fields: ['DraftOrderID', 'PaymentIntentID', 'Status', 'ExpiresAt'],
            ResultType: 'simple',
            BypassCache: true,
        },
        user,
    );
    if (!sessions.Success) throw new Error(`Could not read checkout sessions on renewal orders: ${sessions.ErrorMessage}`);
    const sessionIntents = new Set<string>();
    const now = Date.now();
    for (const session of sessions.Results ?? []) {
        if (session.PaymentIntentID) sessionIntents.add(session.PaymentIntentID.toLowerCase());
        const expires = session.ExpiresAt ? new Date(session.ExpiresAt).getTime() : null;
        if (session.Status === 'Open' && (expires == null || expires > now)) state(session.DraftOrderID).CheckoutOpen = true;
    }

    const open = intents.Results ?? [];
    if (!open.length) return out;

    const intentIDs = RequireUUIDs(open.map((i) => i.ID), 'PaymentIntentID').map((id) => `'${id}'`).join(',');
    const payments = await rv.RunView<{ PaymentIntentID: string }>(
        {
            EntityName: PAYMENT_HEADER_ENTITY,
            ExtraFilter: `PaymentIntentID IN (${intentIDs}) AND Status <> 'Failed'`,
            Fields: ['PaymentIntentID'],
            ResultType: 'simple',
            BypassCache: true,
        },
        user,
    );
    if (!payments.Success) throw new Error(`Could not read renewal payments: ${payments.ErrorMessage}`);
    const paid = new Set((payments.Results ?? []).map((p) => p.PaymentIntentID.toLowerCase()));

    for (const intent of open) {
        const s = state(intent.OrderHeaderID);
        const key = intent.ID.toLowerCase();
        if (intent.Status === 'Processing') {
            s.InFlight = true;
        } else if (!paid.has(key)) {
            if (sessionIntents.has(key)) {
                s.HoldReason ??=
                    `payment intent ${intent.ID} from checkout took the money but no payment is booked; ` +
                    `book it through checkout before the card is charged again`;
            } else if (!s.SettledUncaptured) {
                // This pass's own (a capture that failed, or a charge that came back Processing and has
                // since succeeded), or one a person opened: either way the money is the order's.
                s.SettledUncaptured = { ID: intent.ID, Amount: Number(intent.Amount), LastEventAt: intent.LastEventAt, EventID: ownSuccesses.get(key) ?? null };
            }
        }
    }
    return out;
}

interface ChargeEventData {
    Source?: unknown;
    AttemptDay?: unknown;
    PaymentIntentID?: unknown;
    OutcomeUnknown?: unknown;
    IdempotencyKey?: unknown;
    [key: string]: unknown;
}

function parseEventData(raw: string | null): ChargeEventData | null {
    if (!raw) return null;
    try {
        const parsed: unknown = JSON.parse(raw);
        return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as ChargeEventData) : null;
    } catch {
        return null;
    }
}
