/**
 * PaymentWebhookHandler — the unauthenticated door, and everything that makes it safe to open.
 *
 * THE ROUTE HAS NO AUTHENTICATION, by necessity (D19). Stripe will not present a bearer token; the
 * signature IS the credential. Every guard below exists because of that.
 *
 * TRANSPORT-AGNOSTIC ON PURPOSE. This is a function over `(rawBody, headers)` returning a status and a
 * body, not an Express handler. Two reasons. It is unit-testable without standing up a server, which
 * matters because the interesting cases are a forged signature and a replayed event — neither of which
 * you want to be exercising through HTTP. And the host application owns its middleware order: the route
 * must be mounted BEFORE the auth middleware and with a raw-body parser, and only the bootstrap knows
 * how to do that. `MountPaymentWebhook` at the bottom is the thin adapter.
 *
 * THE RAW BODY IS LOAD-BEARING. The signature covers the exact bytes sent. A JSON round-trip — key
 * order, whitespace, unicode normalisation — invalidates it, so any parser that runs before this
 * silently breaks every webhook. `express.raw({ type: 'application/json' })` on this path only.
 *
 * WHAT THE RESPONSE SAYS, AND WHY IT SAYS SO LITTLE. A 2xx means "we will not need this again". A
 * gateway retries anything else, so:
 *
 *   200  applied, or ALREADY applied, or deliberately ignored — all three are settled
 *   400  malformed or unverifiable — retrying will not help, so do not ask again
 *   500  we failed to record a valid event — PLEASE retry, this one is ours
 *
 * The body carries no detail. A public endpoint that explains why a signature failed is an oracle for
 * anyone probing it, and the reason belongs in our logs where it is useful and not in a response where
 * it is a hint.
 *
 * CONNECTS TO:
 *   PURE:   ./PaymentProviderBehavior.ts — signature, idempotency decision
 *   RECORD: ./PaymentWebhookDeliveryLog.ts — one row per verified delivery (#474)
 *   LOOKUP: ./PaymentProviderResolver.ts
 *   DOC:    plans/archive/bizapps-orders-master.md D19
 */
import {
    BaseEntity,
    CompositeKey,
    IMetadataProvider,
    IRunViewProvider,
    LogError,
    LogStatus,
    RunView,
    UserInfo,
} from '@memberjunction/core';
import {
    mjBizAppsOrdersPaymentIntentEntity,
} from '@mj-biz-apps/orders-entities';
import {
    DecideWebhookAction,
    IsOutOfOrderIntentEvent,
    type WebhookAction,
    type WebhookDecision,
} from './PaymentProviderBehavior.js';
import {
    DeliveryOutcomeFor,
    FindPriorDelivery,
    RecordWebhookDelivery,
    type PriorDelivery,
    type WebhookDeliveryOutcome,
    type WebhookDeliveryReasonCode,
} from './PaymentWebhookDeliveryLog.js';
import { EscapeSQLString } from './sql-guards.js';
import { SettlePaymentForEvent } from './PaymentSettlement.js';
import { BookProviderRefunds } from './ProviderRefundBooking.js';
import { BuildPaymentProvider, LoadPaymentProviderConfig } from './PaymentProviderResolver.js';
import type { BasePaymentProvider, WebhookEvent } from './BasePaymentProvider.js';
import { CheckoutSessionService } from './CheckoutSessionService.js';
import { raiseProviderSubscriptionAlert, raiseUnknownGatewaySubscriptionAlert } from './checkoutCaptureAlert.js';
import { SyncProviderSubscription } from './ProviderSubscriptionSync.js';
import { ORDERS_SUBSCRIPTION_METADATA_KEY } from './ProviderSubscriptions.js';
import {
    CHECKOUT_CAPTURE_TERMINAL_LOG_MARKER,
    webhookEventExceedsRetryWindow,
} from './checkoutCaptureRetry.js';

const PAYMENT_INTENT_ENTITY = 'MJ_BizApps_Orders: Payment Intents';
const SUBSCRIPTION_ENTITY = 'MJ_BizApps_Orders: Subscriptions';
const PAYMENT_PROVIDER_PRICE_ENTITY = 'MJ_BizApps_Orders: Payment Provider Prices';
/** The subscription events that say the gateway has started billing a subscription (E3). */
const SUBSCRIPTION_STARTED_KINDS = ['invoice.paid', 'customer.subscription.created'];
/** The gateway event that reports a charge's cumulative refunded amount. */
const REFUND_EVENT_KIND = 'charge.refunded';

export interface WebhookRequest {
    /** The EXACT bytes received. See the header — a parsed-and-restringified body will not verify. */
    RawBody: string;
    Headers: Record<string, string | undefined>;
    /** Which configured provider this endpoint is for, from the route path. */
    PaymentProviderID: string;
}

export interface WebhookResponse {
    Status: 200 | 400 | 500;
    /** Deliberately terse — see the header. */
    Body: { received: boolean; outcome?: WebhookAction };
}

/**
 * Handle one delivery.
 *
 * The order of operations is the security model, and it is deliberate:
 *
 *   1. resolve the provider   — so we know which secret to verify against
 *   2. VERIFY THE SIGNATURE   — before the payload is parsed, let alone trusted
 *   3. parse                  — now that we know it came from the gateway
 *   4. decide idempotently    — before anything is written
 *   5. apply                  — inside a transaction
 *
 * Nothing before step 2 reads the payload. Parsing first would mean acting on attacker-controlled JSON
 * to decide whether to trust attacker-controlled JSON.
 */
export async function HandlePaymentWebhook(
    request: WebhookRequest,
    provider: IMetadataProvider,
    user: UserInfo,
): Promise<WebhookResponse> {
    // ── 1. Which provider is this endpoint for? ────────────────────────────
    let driver;
    try {
        const config = await LoadPaymentProviderConfig(request.PaymentProviderID, provider, user);
        if (!config.Capabilities.SupportsWebhooks) {
            LogError(`Webhook delivered for provider '${config.Name}', whose type does not support webhooks.`);
            return { Status: 400, Body: { received: false } };
        }
        driver = await BuildPaymentProvider(config, provider, user);
    } catch (err) {
        // An unknown or misconfigured provider is a 400: the gateway is calling a URL we cannot serve,
        // and retrying will not change that.
        LogError(`Webhook could not resolve provider ${request.PaymentProviderID}: ${(err as Error).message}`);
        return { Status: 400, Body: { received: false } };
    }

    // ── 2. Is it really from them? ─────────────────────────────────────────
    const verification = await driver.VerifyWebhook(request.RawBody, request.Headers);
    if (!verification.Valid) {
        // Logged in full, returned as nothing. This is the line between a useful log and an oracle.
        LogError(
            `Rejected a webhook for provider ${request.PaymentProviderID}: ${verification.Reason ?? 'signature did not verify'}`,
        );
        return { Status: 400, Body: { received: false } };
    }

    // ── 3. Now it can be read. ─────────────────────────────────────────────
    // From here on every delivery is verified, so every one is recorded (#474) — including the ones
    // that change nothing. A delivery whose signature failed never reaches this line.
    const providerID = driver.Config.ID;
    const event = driver.ParseWebhookEvent(request.RawBody);
    if (!event) {
        LogError(`A verified webhook for provider ${request.PaymentProviderID} could not be parsed.`);
        await RecordWebhookDelivery(
            {
                PaymentProviderID: providerID,
                Outcome: 'Rejected',
                ReasonCode: 'unreadable',
                Reason: 'the verified body could not be read as an event',
            },
            null,
            provider,
            user,
        );
        return { Status: 400, Body: { received: false } };
    }

    // ── 3b. A gateway subscription changed (E3) ───────────────────────────
    // Only its id is read from the event: what the subscription is now comes from the gateway itself.
    if (event.ProviderSubscriptionID && driver.HandledSubscriptionEventKinds.includes(event.Kind)) {
        const prior = await findPriorDeliverySafely(providerID, event.EventID, provider, user);
        const handled =
            prior?.Outcome === 'Applied'
                ? {
                      Response: { Status: 200 as const, Body: { received: true, outcome: 'AlreadyApplied' as const } },
                      Outcome: 'AlreadyApplied' as const,
                      ReasonCode: 'duplicate' as const,
                      Reason: `event ${event.EventID} has already been applied`,
                  }
                : await handleSubscriptionEvent(event, driver, provider, user);
        await RecordWebhookDelivery(
            {
                PaymentProviderID: providerID,
                ProviderEventID: event.EventID,
                EventKind: event.Kind,
                PaymentIntentID: null,
                ProviderIntentID: null,
                ProviderChargeID: null,
                OccurredAt: event.OccurredAt ?? null,
                Outcome: handled.Outcome,
                ReasonCode: handled.ReasonCode ?? null,
                Reason: handled.Reason,
            },
            prior,
            provider,
            user,
        );
        return handled.Response;
    }

    // ── 4. Have we seen it, and do we care? ────────────────────────────────
    const existing = await findIntent(event, provider, user);
    const prior = await findPriorDeliverySafely(providerID, event.EventID, provider, user);
    const decision = DecideWebhookAction({
        EventID: event.EventID,
        EventKind: event.Kind,
        // EXACT, not "the latest": the delivery table remembers every event applied, where the intent
        // remembers only the last one stamped on it.
        AlreadySeen: existing?.ProviderEventID === event.EventID || prior?.Outcome === 'Applied',
        HandledKinds: driver.HandledEventKinds,
        IntentKnown: existing != null,
        OutOfOrder:
            existing != null &&
            IsOutOfOrderIntentEvent({
                EventStatus: event.Status,
                EventOccurredAt: event.OccurredAt,
                CurrentStatus: existing.Status,
                LastEventAt: existing.LastEventAt,
            }),
    });

    const handled = await act(decision, event, existing, driver, provider, user);
    await RecordWebhookDelivery(
        {
            PaymentProviderID: providerID,
            ProviderEventID: event.EventID,
            EventKind: event.Kind,
            PaymentIntentID: existing?.ID ?? null,
            ProviderIntentID: event.ProviderIntentID ?? null,
            ProviderChargeID: event.ProviderChargeID ?? null,
            OccurredAt: event.OccurredAt ?? null,
            Outcome: handled.Outcome,
            ReasonCode: handled.ReasonCode ?? null,
            Reason: handled.Reason,
        },
        prior,
        provider,
        user,
    );
    return handled.Response;
}

/** What one verified, parsed delivery came to: the answer for the gateway and the row to record. */
interface HandledDelivery {
    Response: WebhookResponse;
    Outcome: WebhookDeliveryOutcome;
    ReasonCode?: WebhookDeliveryReasonCode;
    Reason: string;
}

/** Steps 4 and 5 once the decision is made. */
async function act(
    decision: WebhookDecision,
    event: WebhookEvent,
    existing: IntentRow | null,
    driver: BasePaymentProvider,
    provider: IMetadataProvider,
    user: UserInfo,
): Promise<HandledDelivery> {
    if (decision.Action !== 'Apply') {
        // Ignore / Reject stay 200 or 400 as before. AlreadyApplied is a settled *intent*
        // stamp, not a settled checkout capture: if CapturePayment failed after confirm,
        // Stripe's retry lands here and we still try to book (idempotent).
        LogStatus(`Webhook ${event.EventID}: ${decision.Action} — ${decision.Reason}`);
        if (decision.Action === 'AlreadyApplied' && existing) {
            const booked = await bookCheckoutCaptureFromWebhook(event, existing.ID, user);
            if (!booked) {
                return failed('the settled checkout payment did not book; the gateway will redeliver');
            }
        }
        return {
            Response: { Status: 200, Body: { received: true, outcome: decision.Action } },
            Outcome: DeliveryOutcomeFor(decision.Action),
            ReasonCode: decision.ReasonCode,
            Reason: decision.Reason,
        };
    }

    // ── 5. Apply it. ───────────────────────────────────────────────────────
    try {
        // SETTLEMENT RUNS FIRST, AND THE ORDER IS LOAD-BEARING. `applyEvent` stamps
        // `ProviderEventID`, which is the idempotency key — so an event recorded BEFORE settlement
        // that then failed to settle would be judged `AlreadyApplied` on every retry, and a payment
        // the bank confirmed would sit `Pending` for ever with nothing left to move it. Settling
        // first means a failure returns 500 with nothing stamped and the gateway asks again.
        //
        // Only for drivers that have SAID they settle late. A card driver never reaches this line, so
        // the guarantee in `applyEvent`'s note — that a webhook cannot reach the ledger — still holds
        // everywhere it held before. Checkout CapturePayment is a separate, explicit call below.
        if (driver.SettlesAsynchronously) {
            await SettlePaymentForEvent(event, existing!.ID, provider, user);
        }
        // A refund made at the gateway is booked before the event is stamped, for the same reason as
        // settlement: a failure here answers 500 with nothing stamped, and the retry books only what is
        // still missing (#476).
        if (event.Kind === REFUND_EVENT_KIND) {
            await BookProviderRefunds(event, existing!.ID, driver, provider, user);
        }
        await applyEvent(event, existing!.ID, provider, user);
        const booked = await bookCheckoutCaptureFromWebhook(event, existing!.ID, user);
        if (!booked) {
            return failed('the settled checkout payment did not book; the gateway will redeliver');
        }
        return {
            Response: { Status: 200, Body: { received: true, outcome: 'Apply' } },
            Outcome: 'Applied',
            Reason: decision.Reason,
        };
    } catch (err) {
        // OURS, not theirs. The event was valid and we failed to record it, so ask again — a 200 here
        // would lose a real payment notification silently.
        LogError(`Failed to apply webhook ${event.EventID}: ${(err as Error).message}`);
        return failed((err as Error).message);
    }
}

/**
 * A subscription or invoice event (E3). The Orders subscription that records this gateway subscription is
 * synced with the gateway (`SyncProviderSubscription`); a failure answers 500 so the gateway redelivers,
 * and the nightly pass is the backstop. A gateway subscription no Orders subscription records is classified:
 *   · created by Orders' own hand-over (its metadata names an Orders subscription): E2 records it, nothing to do;
 *   · on a price Orders does not sell on this account: not ours, recorded only;
 *   · on a price Orders sells: unknown, and when the gateway starts billing it, one alert Task for a person.
 */
async function handleSubscriptionEvent(
    event: WebhookEvent,
    driver: BasePaymentProvider,
    provider: IMetadataProvider,
    user: UserInfo,
): Promise<HandledDelivery> {
    const providerID = driver.Config.ID;
    const gatewayID = event.ProviderSubscriptionID!;
    const rv = new RunView(provider as unknown as IRunViewProvider);
    const found = await rv.RunView<{ ID: string }>(
        {
            EntityName: SUBSCRIPTION_ENTITY,
            ExtraFilter: `PaymentProviderID = '${EscapeSQLString(providerID)}' AND ProviderSubscriptionID = '${EscapeSQLString(gatewayID)}'`,
            Fields: ['ID'],
            ResultType: 'simple',
            BypassCache: true,
        },
        user,
    );
    if (!found.Success) return failedSync(`could not look up the subscription for ${gatewayID}: ${found.ErrorMessage}`);
    const subscriptionID = found.Results?.[0]?.ID;
    if (subscriptionID) {
        const synced = await SyncProviderSubscription(subscriptionID, {}, provider, user);
        if (synced.Outcome === 'Failed') {
            const reason = `${gatewayID}: ${synced.Error ?? 'the sync failed'}`;
            // The gateway redelivers, and most failures pass. The third failed attempt for this subscription (the
            // same event redelivered, or several events) tells a person (one open Task), so a renewal that will not
            // book is never silent.
            if ((await priorSyncFailures(providerID, gatewayID, rv, user)) + 1 >= SYNC_FAILURES_BEFORE_TASK) {
                await raiseProviderSubscriptionAlert(
                    {
                        SubscriptionID: subscriptionID,
                        SubscriptionNumber: synced.SubscriptionNumber ?? subscriptionID,
                        Code: 'GatewaySyncFailed',
                        Reason: `the gateway's events for ${gatewayID} have failed to sync ${SYNC_FAILURES_BEFORE_TASK} times: ${synced.Error ?? 'unknown error'}`,
                        Urgent: true,
                        Linked: true,
                    },
                    user,
                    provider,
                );
            }
            return failedSync(reason);
        }
        return {
            Response: { Status: 200, Body: { received: true, outcome: 'Apply' } },
            Outcome: 'Applied',
            Reason:
                `${synced.SubscriptionNumber ?? subscriptionID} ${synced.Outcome}` +
                (synced.Actions.length ? `: ${synced.Actions.join('; ')}` : '') +
                (synced.Notices.length ? ` (notices: ${synced.Notices.join(', ')})` : ''),
        };
    }

    const described = await driver.DescribeProviderSubscription(gatewayID);
    if (!described.Success) {
        return ignored('unknown_subscription', `no Orders subscription records ${gatewayID}, and the gateway could not be read to classify it: ${described.Reason ?? ''}`.trim());
    }
    if (described.Metadata?.[ORDERS_SUBSCRIPTION_METADATA_KEY]) {
        return ignored(
            'unknown_subscription',
            `${gatewayID} was created by Orders' hand-over for ${described.Metadata[ORDERS_SUBSCRIPTION_METADATA_KEY]} and is not recorded yet; the hand-over records it (and raises its own alert if it cannot)`,
        );
    }
    const mapped = described.ProviderPriceID ? await priceIsMapped(providerID, described.ProviderPriceID, rv, user) : false;
    if (!mapped) {
        return ignored('not_ours', `${gatewayID} bills price ${described.ProviderPriceID ?? 'unknown'}, which Orders does not sell on this account`);
    }
    const reason =
        `the gateway bills ${gatewayID} (customer ${described.ProviderCustomerRef ?? 'unknown'}${described.CustomerEmail ? `, ${described.CustomerEmail}` : ''}) ` +
        `on price ${described.ProviderPriceID}, which Orders sells, but no Orders subscription records it`;
    if (SUBSCRIPTION_STARTED_KINDS.includes(event.Kind)) {
        await raiseUnknownGatewaySubscriptionAlert({ ProviderSubscriptionID: gatewayID, Reason: reason }, user, provider);
    }
    return ignored('unknown_subscription', reason);
}

/** Failed deliveries of a subscription event before a person is told (GatewaySyncFailed). */
const SYNC_FAILURES_BEFORE_TASK = 3;
/** Only failures redelivered within this window count toward it. */
const SYNC_FAILURE_WINDOW_DAYS = 7;

/**
 * Failed deliveries so far for this gateway subscription's events. The log keeps ONE row per event (a
 * redelivery updates it and bumps `DeliveryCount`), so the attempts are the sum of `DeliveryCount` over the
 * rows whose latest outcome is a failed sync, not the number of rows.
 */
async function priorSyncFailures(paymentProviderID: string, gatewayID: string, rv: RunView, user: UserInfo): Promise<number> {
    const r = await rv.RunView<{ ID: string; DeliveryCount: number | null }>(
        {
            EntityName: 'MJ_BizApps_Orders: Payment Webhook Deliveries',
            ExtraFilter:
                `PaymentProviderID = '${EscapeSQLString(paymentProviderID)}' AND ReasonCode = 'sync_failed' ` +
                `AND Reason LIKE '${EscapeSQLString(gatewayID)}:%' ` +
                // Failures that have stopped (a week without a redelivery) are history, not a run of them.
                `AND LastReceivedAt >= DATEADD(day, -${SYNC_FAILURE_WINDOW_DAYS}, SYSDATETIMEOFFSET())`,
            Fields: ['ID', 'DeliveryCount'],
            ResultType: 'simple',
            BypassCache: true,
        },
        user,
    );
    return r.Success ? (r.Results ?? []).reduce((n, row) => n + Math.max(1, Number(row.DeliveryCount ?? 1)), 0) : 0;
}

async function priceIsMapped(paymentProviderID: string, providerPriceID: string, rv: RunView, user: UserInfo): Promise<boolean> {
    const rows = await rv.RunView<{ ID: string }>(
        {
            EntityName: PAYMENT_PROVIDER_PRICE_ENTITY,
            ExtraFilter: `PaymentProviderID = '${EscapeSQLString(paymentProviderID)}' AND ProviderPriceID = '${EscapeSQLString(providerPriceID)}' AND IsActive = 1`,
            Fields: ['ID'],
            ResultType: 'simple',
            BypassCache: true,
        },
        user,
    );
    return !!rows.Success && (rows.Results ?? []).length > 0;
}

function ignored(code: WebhookDeliveryReasonCode, reason: string): HandledDelivery {
    return { Response: { Status: 200, Body: { received: true, outcome: 'Ignore' } }, Outcome: 'Ignored', ReasonCode: code, Reason: reason };
}

function failedSync(reason: string): HandledDelivery {
    return { Response: { Status: 500, Body: { received: false } }, Outcome: 'Failed', ReasonCode: 'sync_failed', Reason: reason };
}

/** A valid event we could not finish with: 500, so the gateway redelivers. */
function failed(reason: string): HandledDelivery {
    return {
        Response: { Status: 500, Body: { received: false } },
        Outcome: 'Failed',
        ReasonCode: 'apply_failed',
        Reason: reason,
    };
}

/**
 * The earlier delivery of this event, or null when there is none or it could not be read. A failed
 * read must not refuse the event: the intent's own stamp still guards against a duplicate.
 */
async function findPriorDeliverySafely(
    paymentProviderID: string,
    providerEventID: string,
    provider: IMetadataProvider,
    user: UserInfo,
): Promise<PriorDelivery | null> {
    try {
        return await FindPriorDelivery(paymentProviderID, providerEventID, provider, user);
    } catch (err) {
        LogError(`Could not read earlier deliveries of webhook ${providerEventID}: ${(err as Error).message}`);
        return null;
    }
}

/**
 * After the intent row reflects Succeeded, book CapturePayment for a Confirmed
 * checkout session if the complete path failed to, or complete a checkout session
 * the buyer's browser never completed (#724). No-op for back-office intents.
 * Returns false when a checkout capture was attempted, did not book, and is
 * Retryable inside the event-age window — caller 500s so Stripe retries.
 * Terminal refusals (and events older than the window) return true after a
 * CHECKOUT-CAPTURE-TERMINAL log so Stripe stops and a human can see it.
 */
async function bookCheckoutCaptureFromWebhook(
    event: WebhookEvent,
    paymentIntentID: string,
    user: UserInfo,
): Promise<boolean> {
    if (event.Status !== 'Succeeded') {
        return true;
    }
    try {
        const book = await CheckoutSessionService.BookSettledCheckoutPaymentIfNeeded(paymentIntentID, user);
        if (!(book.Attempted && !book.Booked)) {
            return true;
        }
        const retryable = book.Retryable !== false;
        if (retryable && !event.OccurredAt) {
            LogError(
                `[CHECKOUT-CAPTURE-RETRY] Webhook event ${event.EventID} has no OccurredAt; retry window cannot be applied — treating as Retryable`,
            );
        }
        const pastWindow = webhookEventExceedsRetryWindow(event);
        if (retryable && !pastWindow) {
            LogError(
                `Checkout CapturePayment did not book for intent ${paymentIntentID} (retryable): ${book.ErrorMessage ?? 'unknown error'}`,
            );
            return false;
        }
        LogError(
            `${CHECKOUT_CAPTURE_TERMINAL_LOG_MARKER} Settled checkout payment will not be retried via webhook` +
                ` intent=${paymentIntentID} event=${event.EventID}` +
                ` retryable=${retryable} pastWindow=${pastWindow}: ${book.ErrorMessage ?? 'unknown error'}`,
        );
        return true;
    } catch (err) {
        LogError(
            `Checkout CapturePayment threw for intent ${paymentIntentID}: ${err instanceof Error ? err.message : String(err)}`,
        );
        return false;
    }
}

/** The fields of a `PaymentIntent` the decision reads. */
interface IntentRow {
    ID: string;
    Status: string;
    ProviderEventID: string | null;
    LastEventAt: Date | string | null;
}

/** The `PaymentIntent` row this event is about, if we opened it. */
async function findIntent(
    event: WebhookEvent,
    provider: IMetadataProvider,
    user: UserInfo,
): Promise<IntentRow | null> {
    if (!event.ProviderIntentID) return null;
    // Escaped rather than interpolated raw: this value came off the wire. It is inside a verified
    // payload, so it is not attacker-controlled in practice — but "verified" and "safe to concatenate
    // into SQL" are different claims, and only one of them is being made here.
    const rv = new RunView(provider as unknown as IRunViewProvider);
    const result = await rv.RunView<IntentRow>(
        {
            EntityName: PAYMENT_INTENT_ENTITY,
            ExtraFilter: `ProviderIntentID = '${EscapeSQLString(event.ProviderIntentID)}'`,
            Fields: ['ID', 'Status', 'ProviderEventID', 'LastEventAt'],
            ResultType: 'simple',
            BypassCache: true,
        },
        user,
    );
    return result?.Results?.[0] ?? null;
}

/**
 * Record what the gateway told us.
 *
 * DELIBERATELY NARROW: this moves the `PaymentIntent` and nothing else. It does not capture the
 * `PaymentHeader`, book cash, or touch allocations — `PaymentHeaderEntityServer` owns all of that, and a
 * webhook that reached into it would give the gateway a second path into the ledger.
 *
 * The intent is the RECORD OF WHAT THE GATEWAY SAYS; promoting that into cash is a separate, deliberate
 * step. `ProviderEventID` is stamped in the same save, which is what makes the next delivery of this
 * event a no-op rather than a second application.
 */
async function applyEvent(
    event: WebhookEvent,
    paymentIntentID: string,
    provider: IMetadataProvider,
    user: UserInfo,
): Promise<void> {
    const intent = await provider.GetEntityObject<mjBizAppsOrdersPaymentIntentEntity>(
        PAYMENT_INTENT_ENTITY,
        CompositeKey.FromID(paymentIntentID),
        user,
    );

    if (event.Status) {
        intent.Status = event.Status;
        // The GATEWAY'S time of the event that set this status, which is what the next event is
        // compared against (#475). It used to be our receipt time, which is later than the event's
        // own time and so cannot order two events. An event that sets no status leaves it alone: it
        // did not set the status, so it must not move the line older events are judged by.
        if (event.OccurredAt) intent.LastEventAt = event.OccurredAt;
    }
    intent.ProviderEventID = event.EventID;

    if (!(await intent.Save())) {
        throw new Error(
            `Could not record event ${event.EventID} against payment intent ${paymentIntentID}: ` +
                `${intent.LatestResult?.CompleteMessage ?? 'unknown error'}`,
        );
    }

    LogStatus(
        `Payment intent ${paymentIntentID} is now ${event.Status ?? 'unchanged'} from event ${event.EventID}` +
            `${event.FailureReason ? ` (${event.FailureReason})` : ''}`,
    );
}

/**
 * Mount the route on an Express-shaped app.
 *
 * Typed structurally rather than against `express`, so this package takes no dependency on it — the
 * host already has one, and this file should not be the reason a shared server package pulls in a web
 * framework.
 *
 * TWO THINGS THE CALLER MUST GET RIGHT, and neither can be enforced from here:
 *
 *   · Mount BEFORE the auth middleware. Stripe presents no token; auth would reject every delivery.
 *   · Give this path a RAW body parser and nothing else. `express.json()` anywhere upstream re-encodes
 *     the payload and every signature fails.
 *
 * ```ts
 * app.post(
 *     '/webhooks/payments/:providerId',
 *     express.raw({ type: 'application/json' }),
 *     MountPaymentWebhook(() => ({ provider: Metadata.Provider, user: systemUser })),
 * );
 * ```
 */
export function MountPaymentWebhook(
    context: () => { provider: IMetadataProvider; user: UserInfo },
): (req: WebhookHttpRequest, res: WebhookHttpResponse) => Promise<void> {
    return async (req, res) => {
        const { provider, user } = context();
        // `req.body` is a Buffer under a raw parser and a string if something already decoded it.
        // Both are accepted; anything else has been through a JSON parser and cannot verify.
        const rawBody = typeof req.body === 'string' ? req.body : String(req.body ?? '');
        const result = await HandlePaymentWebhook(
            {
                RawBody: rawBody,
                Headers: req.headers ?? {},
                PaymentProviderID: req.params?.providerId ?? '',
            },
            provider,
            user,
        );
        res.status(result.Status).json(result.Body);
    };
}

/** The Express request surface this route actually uses. Structural, so no dependency is needed. */
export interface WebhookHttpRequest {
    body?: unknown;
    headers?: Record<string, string | undefined>;
    params?: Record<string, string | undefined>;
}

/** Likewise for the response. */
export interface WebhookHttpResponse {
    status(code: number): { json(body: unknown): void };
}
