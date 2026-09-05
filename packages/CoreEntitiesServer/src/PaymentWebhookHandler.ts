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
import { DecideWebhookAction, type WebhookAction } from './PaymentProviderBehavior.js';
import { SettlePaymentForEvent } from './PaymentSettlement.js';
import { BuildPaymentProvider, LoadPaymentProviderConfig } from './PaymentProviderResolver.js';
import type { WebhookEvent } from './BasePaymentProvider.js';
import { CheckoutSessionService } from './CheckoutSessionService.js';
import { EscapeSQLString } from './sql-guards.js';
import {
    CHECKOUT_CAPTURE_TERMINAL_LOG_MARKER,
    webhookEventExceedsRetryWindow,
} from './checkoutCaptureRetry.js';

const PAYMENT_INTENT_ENTITY = 'MJ_BizApps_Orders: Payment Intents';

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
    const event = driver.ParseWebhookEvent(request.RawBody);
    if (!event) {
        LogError(`A verified webhook for provider ${request.PaymentProviderID} could not be parsed.`);
        return { Status: 400, Body: { received: false } };
    }

    // ── 4. Have we seen it, and do we care? ────────────────────────────────
    const existing = await findIntent(event, provider, user);
    const decision = DecideWebhookAction({
        EventID: event.EventID,
        EventKind: event.Kind,
        AlreadySeen: existing?.ProviderEventID === event.EventID,
        HandledKinds: driver.HandledEventKinds,
        IntentKnown: existing != null,
    });

    if (decision.Action !== 'Apply') {
        // Ignore / Reject stay 200 or 400 as before. AlreadyApplied is a settled *intent*
        // stamp, not a settled checkout capture: if CapturePayment failed after confirm,
        // Stripe's retry lands here and we still try to book (idempotent).
        LogStatus(`Webhook ${event.EventID}: ${decision.Action} — ${decision.Reason}`);
        if (decision.Action === 'AlreadyApplied' && existing) {
            const booked = await bookCheckoutCaptureFromWebhook(event, existing.ID, user);
            if (!booked) {
                return { Status: 500, Body: { received: false } };
            }
        }
        return { Status: 200, Body: { received: true, outcome: decision.Action } };
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
        await applyEvent(event, existing!.ID, provider, user);
        const booked = await bookCheckoutCaptureFromWebhook(event, existing!.ID, user);
        if (!booked) {
            return { Status: 500, Body: { received: false } };
        }
        return { Status: 200, Body: { received: true, outcome: 'Apply' } };
    } catch (err) {
        // OURS, not theirs. The event was valid and we failed to record it, so ask again — a 200 here
        // would lose a real payment notification silently.
        LogError(`Failed to apply webhook ${event.EventID}: ${(err as Error).message}`);
        return { Status: 500, Body: { received: false } };
    }
}

/**
 * After the intent row reflects Succeeded, book CapturePayment for a Confirmed
 * checkout session if the complete path failed to. No-op for back-office intents.
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

/** The `PaymentIntent` row this event is about, if we opened it. */
async function findIntent(
    event: WebhookEvent,
    provider: IMetadataProvider,
    user: UserInfo,
): Promise<{ ID: string; Status: string; ProviderEventID: string | null } | null> {
    if (!event.ProviderIntentID) return null;
    // Escaped rather than interpolated raw: this value came off the wire. It is inside a verified
    // payload, so it is not attacker-controlled in practice — but "verified" and "safe to concatenate
    // into SQL" are different claims, and only one of them is being made here.
    const safe = EscapeSQLString(event.ProviderIntentID);
    const rv = new RunView(provider as unknown as IRunViewProvider);
    const result = await rv.RunView<{ ID: string; Status: string; ProviderEventID: string | null }>(
        {
            EntityName: PAYMENT_INTENT_ENTITY,
            ExtraFilter: `ProviderIntentID = '${safe}'`,
            ResultType: 'simple',
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

    if (event.Status) intent.Status = event.Status;
    intent.ProviderEventID = event.EventID;
    intent.LastEventAt = new Date();

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
