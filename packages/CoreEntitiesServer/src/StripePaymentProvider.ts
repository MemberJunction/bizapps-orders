/**
 * StripePaymentProvider — the real PaymentIntent lifecycle, and a stub that stands in for it.
 *
 * STUB-FIRST, per D19. The committed default in a non-live provider is a deterministic stub: it opens
 * an intent, succeeds on capture, and reports a plausible fee, all without a network call. That is
 * what makes the integration suite able to exercise the payment path at all — 245 checks cannot each
 * wait on a live gateway, and a suite that mocks at the HTTP layer instead would be asserting against
 * its own mock.
 *
 * The stub is chosen by `PaymentProvider.IsLiveMode = 0`, not by an environment variable. The
 * distinction belongs to the CONFIGURED ACCOUNT: a deployment can hold a live account and a test
 * account side by side, and the row says which is which. An env flag would make that a property of the
 * process, so one misconfigured server would either fake real payments or really charge test ones.
 *
 * NO SDK DEPENDENCY. Stripe's REST API over `fetch` is stable, and the surface used here is small —
 * three endpoints. Adding the SDK would pull a large dependency into a package that is imported by
 * every server process for the sake of URL construction. The trade is deliberate: we write the form
 * encoding ourselves (`ToFormBody` below), which Stripe requires and which is the one fiddly part.
 *
 * WHAT IS DELIBERATELY NOT HERE. Reconciliation, dispute handling, and the forensics of a partially
 * captured intent. D19 defers those, and the seams for them are the webhook event kinds this driver
 * already declines to handle rather than pretends to.
 *
 * CONNECTS TO:
 *   PURE:   ./PaymentProviderBehavior.ts — minor units, signature, status mapping
 *   BASE:   ./BasePaymentProvider.ts
 *   DOC:    plans/archive/bizapps-orders-master.md D19
 */
import { RegisterClass } from '@memberjunction/global';
import { LogError } from '@memberjunction/core';
import {
    BasePaymentProvider,
    type CaptureRequest,
    type CaptureResult,
    type CreateIntentRequest,
    type CreateIntentResult,
    type RefundRequest,
    type RefundResult,
    type WebhookEvent,
} from './BasePaymentProvider.js';
import {
    FromMinorUnits,
    MapStripeIntentStatus,
    ToMinorUnits,
    VerifyWebhookSignature,
    type IntentStatus,
} from './PaymentProviderBehavior.js';

const STRIPE_API = 'https://api.stripe.com/v1';

/** Stripe's own event names, kept as strings because they are Stripe's vocabulary and not ours. */
const HANDLED = [
    'payment_intent.succeeded',
    'payment_intent.payment_failed',
    'payment_intent.canceled',
    'charge.refunded',
] as const;

@RegisterClass(BasePaymentProvider, 'Stripe')
export class StripePaymentProvider extends BasePaymentProvider {
    public override get HandledEventKinds(): readonly string[] {
        return HANDLED;
    }

    /** The stub stands in whenever the configured account is not live. */
    protected get useStub(): boolean {
        return !this.Config?.IsLiveMode;
    }

    // ─── Extension points ──────────────────────────────────────────────────────
    //
    // Three small seams, added so a SIBLING Stripe rail (bank debits, and whatever comes after) can
    // change the parts that differ without reimplementing the parts that do not. The alternative was a
    // second class copying `CreateIntent`, `call`, `ToFormBody` and the error handling — four places to
    // fix the next time Stripe changes a response shape, three of which nobody would remember to look
    // at. Everything genuinely shared stays here; a subclass overrides only what its rail changes.

    /**
     * The intent status the STUB reports on creation.
     *
     * A card intent opens waiting for an instrument. A bank debit opens already submitted, and a stub
     * that claimed otherwise would exercise a state the real rail never passes through.
     */
    protected get StubIntentStatus(): IntentStatus {
        return 'RequiresPayment';
    }

    /**
     * The fee the STUB reports on capture — 2.9% + 30c, Stripe's standard US card rate.
     *
     * See the note at the call site for why a stub must not report zero.
     */
    protected StubFeeFor(amount: number, _currencyCode: string): number {
        return amount > 0 ? Math.round((amount * 0.029 + 0.3) * 100) / 100 : 0;
    }

    /**
     * Last chance to add rail-specific fields to a `POST /payment_intents` body.
     *
     * Mutates rather than returns, so a subclass that forgets to call `super` cannot silently discard
     * everything the base assembled — there is nothing to discard.
     */
    protected DecorateIntentBody(_body: Record<string, string>, _request: CreateIntentRequest): void {
        // Cards need nothing beyond what CreateIntent already builds.
    }

    // ─── Intent ────────────────────────────────────────────────────────────────

    public override async CreateIntent(request: CreateIntentRequest): Promise<CreateIntentResult> {
        if (request.Amount <= 0) {
            return { Success: false, Reason: `Stripe cannot open an intent for ${request.Amount}.` };
        }

        if (this.useStub) {
            // Deterministic from the order, so re-running a check produces the same id and a duplicate
            // is visible as a duplicate rather than as two unrelated intents.
            const seed = request.OrderHeaderID ?? request.IdempotencyKey ?? 'no-order';
            return {
                Success: true,
                ProviderIntentID: `pi_stub_${seed.replace(/-/g, '').slice(0, 24)}`,
                Status: this.StubIntentStatus,
                ClientSecret: `pi_stub_${seed.slice(0, 8)}_secret_stub`,
            };
        }

        const body: Record<string, string> = {
            amount: String(ToMinorUnits(request.Amount, request.CurrencyCode)),
            currency: request.CurrencyCode.toLowerCase(),
            // Off-session by default: this is a back-office confirm, not a customer at a checkout.
            // A driver charging a saved instrument must say so or Stripe expects an interactive
            // confirmation that will never come.
            confirm: request.ProviderInstrumentRef ? 'true' : 'false',
        };
        if (request.ProviderCustomerRef) body.customer = request.ProviderCustomerRef;
        if (request.ProviderInstrumentRef) {
            body.payment_method = request.ProviderInstrumentRef;
            body.off_session = 'true';
        }
        for (const [k, v] of Object.entries(request.Metadata ?? {})) body[`metadata[${k}]`] = v;
        if (request.OrderHeaderID) body['metadata[OrderHeaderID]'] = request.OrderHeaderID;
        this.DecorateIntentBody(body, request);

        const result = await this.call('POST', '/payment_intents', body, request.IdempotencyKey);
        if (!result.Ok) return { Success: false, Reason: result.Reason };

        return {
            Success: true,
            ProviderIntentID: String(result.Body.id),
            Status: MapStripeIntentStatus(result.Body.status as string),
            ClientSecret: result.Body.client_secret as string | undefined,
        };
    }

    // ─── Capture ───────────────────────────────────────────────────────────────

    public override async Capture(request: CaptureRequest): Promise<CaptureResult> {
        if (this.useStub) {
            const amount = request.Amount ?? 0;
            return {
                Success: true,
                Amount: amount,
                // 2.9% + 30c, Stripe's standard US card rate. A stub that reported ZERO fee would make
                // the fee leg of the capture entry (D18) unreachable in every test, so the one thing
                // that must be exercised would be the one thing never exercised.
                FeeAmount: this.StubFeeFor(amount, request.CurrencyCode),
                ProviderChargeID: `ch_stub_${request.ProviderIntentID.slice(-12)}`,
                Status: 'Succeeded',
            };
        }

        const body: Record<string, string> = {};
        if (request.Amount != null) {
            body.amount_to_capture = String(ToMinorUnits(request.Amount, request.CurrencyCode));
        }
        const captured = await this.call(
            'POST',
            `/payment_intents/${encodeURIComponent(request.ProviderIntentID)}/capture`,
            body,
        );
        if (!captured.Ok) return { Success: false, Reason: captured.Reason };

        const status = MapStripeIntentStatus(captured.Body.status as string);
        if (status !== 'Succeeded') {
            // A capture that did not succeed is a REFUSAL, not a fault: the card was declined, or the
            // intent needed action. Reporting success here would book cash that never arrived.
            return { Success: false, Reason: `Stripe reported the intent as '${captured.Body.status}' after capture.`, Status: status };
        }

        const currency = (captured.Body.currency as string) ?? request.CurrencyCode;
        const amountMinor = Number(captured.Body.amount_received ?? captured.Body.amount ?? 0);
        const charge = this.latestCharge(captured.Body);

        return {
            Success: true,
            Amount: FromMinorUnits(amountMinor, currency),
            // UNDEFINED rather than zero when the fee is not expanded in the response. Stripe reports
            // it on the balance transaction, which needs a separate fetch, and "we do not know the fee"
            // must not read as "there was no fee" — the first leaves the fee leg unbooked, the second
            // books a wrong one.
            FeeAmount: await this.feeFor(charge, currency),
            ProviderChargeID: charge ?? undefined,
            Status: 'Succeeded',
        };
    }

    // ─── Refund ────────────────────────────────────────────────────────────────

    public override async Refund(request: RefundRequest): Promise<RefundResult> {
        const target = request.ProviderChargeID ?? request.ProviderIntentID;
        if (!target) {
            return { Success: false, Reason: 'A Stripe refund needs either a charge id or an intent id.' };
        }

        if (this.useStub) {
            return {
                Success: true,
                Amount: request.Amount ?? 0,
                ProviderRefundID: `re_stub_${target.slice(-12)}`,
            };
        }

        const body: Record<string, string> = {};
        if (request.ProviderChargeID) body.charge = request.ProviderChargeID;
        else body.payment_intent = request.ProviderIntentID!;
        if (request.Amount != null) body.amount = String(ToMinorUnits(request.Amount, request.CurrencyCode));
        if (request.Reason) body.reason = 'requested_by_customer';

        const result = await this.call('POST', '/refunds', body, request.IdempotencyKey);
        if (!result.Ok) return { Success: false, Reason: result.Reason };

        const currency = (result.Body.currency as string) ?? request.CurrencyCode;
        return {
            Success: true,
            Amount: FromMinorUnits(Number(result.Body.amount ?? 0), currency),
            ProviderRefundID: String(result.Body.id),
        };
    }

    // ─── Webhooks ──────────────────────────────────────────────────────────────

    public override async VerifyWebhook(
        rawBody: string,
        headers: Record<string, string | undefined>,
    ): Promise<{ Valid: boolean; Reason?: string }> {
        // Header names arrive in whatever case the proxy chose, so both are read.
        const signature = headers['stripe-signature'] ?? headers['Stripe-Signature'];
        return VerifyWebhookSignature(rawBody, signature, this.Credentials?.WebhookSecret);
    }

    public override ParseWebhookEvent(rawBody: string): WebhookEvent | null {
        let parsed: unknown;
        try {
            parsed = JSON.parse(rawBody);
        } catch {
            return null;
        }

        // VALID JSON IS NOT NECESSARILY AN OBJECT. `JSON.parse` happily returns `null` for the body
        // `null`, and a number for `42` — both of which then threw a TypeError on the first property
        // read, from a method whose contract is "null when it is not an event we can read". The throw
        // escaped `HandlePaymentWebhook`'s parse step, which is not wrapped, so a body that verified
        // and was not an object crashed the route instead of answering 400.
        //
        // Reachable only behind signature verification, so not an open door — but the contract is the
        // contract, and "returns null OR throws" is not a thing a caller can branch on.
        if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
        const payload = parsed as Record<string, unknown>;

        const kind = payload.type as string | undefined;
        const object = ((payload.data as Record<string, unknown>)?.object ?? {}) as Record<string, unknown>;
        if (!payload.id || !kind) return null;

        const currency = ((object.currency as string) ?? 'usd').toUpperCase();
        const event: WebhookEvent = { EventID: String(payload.id), Kind: kind, CurrencyCode: currency };

        if (kind.startsWith('payment_intent.')) {
            event.ProviderIntentID = object.id as string | undefined;
            event.ProviderChargeID = this.latestCharge(object) ?? undefined;
            const minor = Number(object.amount_received ?? object.amount ?? 0);
            if (Number.isFinite(minor) && minor > 0) event.Amount = FromMinorUnits(minor, currency);
            event.Status =
                kind === 'payment_intent.payment_failed'
                    ? 'Failed'
                    : MapStripeIntentStatus(object.status as string);
            const failure = object.last_payment_error as Record<string, unknown> | undefined;
            if (failure?.message) event.FailureReason = String(failure.message);
        } else if (kind === 'charge.refunded') {
            event.ProviderChargeID = object.id as string | undefined;
            event.ProviderIntentID = object.payment_intent as string | undefined;
            const refunded = Number(object.amount_refunded ?? 0);
            if (Number.isFinite(refunded) && refunded > 0) event.Amount = FromMinorUnits(refunded, currency);
        }

        return event;
    }

    // ─── HTTP ──────────────────────────────────────────────────────────────────

    /**
     * One call, with Stripe's own error shape read out of the body.
     *
     * A 4xx from Stripe is usually a REFUSAL — a declined card, an intent in the wrong state — and its
     * `error.message` is written for a human. Surfacing that rather than "HTTP 402" is the difference
     * between a support ticket somebody can answer and one they cannot.
     *
     * Only transport failures and 5xx throw. Those are faults; the rest are answers.
     */
    protected async call(
        method: 'POST' | 'GET',
        path: string,
        body?: Record<string, string>,
        idempotencyKey?: string,
    ): Promise<{ Ok: boolean; Reason?: string; Body: Record<string, unknown> }> {
        const apiKey = this.Credentials?.ApiKey;
        if (!apiKey) {
            return {
                Ok: false,
                Body: {},
                Reason:
                    `No Stripe API key is available for provider '${this.Config?.Name ?? this.Config?.ID}'. ` +
                    `Its CredentialsRef must resolve to a key — see PaymentProviderResolver.`,
            };
        }

        const headers: Record<string, string> = {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/x-www-form-urlencoded',
            // Pinned deliberately. Stripe changes response shapes between versions, and inheriting
            // whatever the account defaults to means this driver's behaviour can change without a
            // deploy.
            'Stripe-Version': '2024-06-20',
        };
        if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey;

        let response: Response;
        try {
            response = await fetch(`${STRIPE_API}${path}`, {
                method,
                headers,
                body: body ? ToFormBody(body) : undefined,
            });
        } catch (err) {
            // A fault, not an answer. The caller's payment is in an UNKNOWN state, which is worse than
            // a decline, so it must not be reported as one.
            throw new Error(`Stripe was unreachable calling ${method} ${path}: ${(err as Error).message}`);
        }

        const text = await response.text();
        let parsed: Record<string, unknown> = {};
        try {
            parsed = text ? (JSON.parse(text) as Record<string, unknown>) : {};
        } catch {
            parsed = {};
        }

        if (response.ok) return { Ok: true, Body: parsed };

        if (response.status >= 500) {
            throw new Error(`Stripe returned ${response.status} calling ${method} ${path}. The payment state is unknown.`);
        }

        const error = (parsed.error ?? {}) as Record<string, unknown>;
        const reason = (error.message as string) ?? `Stripe returned ${response.status} with no message.`;
        LogError(`Stripe ${method} ${path} refused: ${reason}`);
        return { Ok: false, Body: parsed, Reason: reason };
    }

    /** `latest_charge` is a string on modern API versions and an object on older expanded responses. */
    protected latestCharge(object: Record<string, unknown>): string | null {
        const latest = object.latest_charge;
        if (typeof latest === 'string') return latest;
        if (latest && typeof latest === 'object') return ((latest as Record<string, unknown>).id as string) ?? null;
        const charges = object.charges as Record<string, unknown> | undefined;
        const first = (charges?.data as Array<Record<string, unknown>> | undefined)?.[0];
        return (first?.id as string) ?? null;
    }

    /**
     * The gateway's cut, from the charge's balance transaction.
     *
     * Returns UNDEFINED when it cannot be determined, never 0 — see the note at the call site. A failed
     * lookup here must not silently suppress the fee leg of the capture entry, and it must not fail the
     * capture either: the money HAS moved by this point, and refusing now would leave the ledger
     * disagreeing with the gateway.
     */
    protected async feeFor(chargeID: string | null, currency: string): Promise<number | undefined> {
        if (!chargeID) return undefined;
        try {
            const charge = await this.call('GET', `/charges/${encodeURIComponent(chargeID)}?expand[]=balance_transaction`);
            if (!charge.Ok) return undefined;
            const bt = charge.Body.balance_transaction as Record<string, unknown> | string | undefined;
            if (!bt || typeof bt === 'string') return undefined;
            const fee = Number((bt as Record<string, unknown>).fee ?? NaN);
            return Number.isFinite(fee) ? FromMinorUnits(fee, currency) : undefined;
        } catch (err) {
            LogError(`Could not read the Stripe fee for charge ${chargeID}: ${(err as Error).message}`);
            return undefined;
        }
    }
}

/**
 * Stripe wants `application/x-www-form-urlencoded`, including for nested keys like `metadata[Foo]`.
 *
 * `URLSearchParams` encodes the brackets as `%5B%5D`, which Stripe accepts — so this is a thin wrapper
 * rather than hand-rolled escaping. It exists as a named function because the temptation to build the
 * body with template strings is exactly how an unescaped value ends up changing the request.
 */
export function ToFormBody(fields: Record<string, string>): string {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(fields)) {
        if (value != null) params.append(key, String(value));
    }
    return params.toString();
}

/** Tree-shaking anchor — call from the server bootstrap so @RegisterClass is retained. */
export function LoadStripePaymentProvider(): void {
    // intentionally empty
}
