/**
 * BasePaymentProvider — the seam every gateway plugs into (D19/D37).
 *
 * A `PaymentProviderType` row's `Code` IS the `@RegisterClass` key, so adding a gateway is a metadata
 * row plus a subclass, never a schema change. `DriverClass` on the same row names the class for a
 * human reading the configuration; the ClassFactory resolves by `Code`.
 *
 * WHAT A DRIVER IS RESPONSIBLE FOR, and what it is emphatically not:
 *
 *   IT DOES        talk to the gateway, and translate between that gateway's vocabulary and ours.
 *   IT DOES NOT    write journal entries, move `PaymentHeader.Status`, or touch allocations.
 *
 * That division is why `PaymentHeaderEntityServer` can stay the single place cash is booked. A driver
 * that posted its own entries would give every gateway its own accounting, and the first one to get it
 * wrong would balance anyway.
 *
 * LOGICAL REFUSAL IS NOT AN EXCEPTION. Every operation returns a result carrying `Success` and, when
 * false, a `Reason` a person can act on. A declined card is a normal outcome of asking; a gateway
 * being unreachable is not. Only the second throws. This is the same rule the remotable operations
 * follow, and it exists because a caller that has to read exception messages to tell "declined" from
 * "broken" will eventually treat one as the other.
 *
 * MONEY CROSSES THIS BOUNDARY IN MAJOR UNITS — decimals, as we store them. Each driver converts at
 * its own edge using `ToMinorUnits`/`FromMinorUnits`, because the conversion is the GATEWAY'S
 * convention rather than ours, and hoisting it here would impose Stripe's on everyone.
 *
 * CONNECTS TO:
 *   PURE:    ./PaymentProviderBehavior.ts
 *   DRIVERS: ./StripePaymentProvider.ts · ./ManualPaymentProvider.ts · ./StoredValuePaymentProvider.ts
 *   LOOKUP:  ./PaymentProviderResolver.ts
 *   DOC:     plans/archive/bizapps-orders-master.md D19, D37
 */
import { IMetadataProvider, UserInfo } from '@memberjunction/core';
import type { IntentStatus } from './PaymentProviderBehavior.js';

/** The configured account a driver is acting for — one `PaymentProvider` row. */
export interface PaymentProviderConfig {
    ID: string;
    /** The `PaymentProviderType.Code`, which is also the ClassFactory key. */
    TypeCode: string;
    CompanyID: string;
    Name: string;
    /**
     * How to FIND the credentials, never the credentials themselves. Resolved through
     * `PaymentProviderResolver`'s secret seam so a deployment can point it at a vault.
     */
    CredentialsRef: string | null;
    IsLiveMode: boolean;
    Capabilities: {
        SupportsTokenization: boolean;
        SupportsRefund: boolean;
        SupportsWebhooks: boolean;
    };
}

/** Resolved secrets. Held only for the duration of a call and never persisted. */
export interface PaymentCredentials {
    /** The gateway API key. */
    ApiKey?: string;
    /** The webhook endpoint signing secret — a DIFFERENT secret from the API key, deliberately. */
    WebhookSecret?: string;
    /** Anything a specific gateway needs beyond those two. */
    Extra?: Record<string, string>;
}

export interface CreateIntentRequest {
    /** Major units, as we store money. */
    Amount: number;
    CurrencyCode: string;
    OrderHeaderID?: string | null;
    /** Who we are collecting from (D65) — carried so the gateway's record matches ours. */
    BillToPersonID?: string | null;
    BillToOrganizationID?: string | null;
    /** A saved instrument to charge, when the customer has one on file. */
    ProviderCustomerRef?: string | null;
    ProviderInstrumentRef?: string | null;
    /** Free-form, echoed back on webhooks. Useful for reconciliation, never load-bearing. */
    Metadata?: Record<string, string>;
    /**
     * OUR idempotency key. Sent to gateways that support one so a retried create does not open a
     * second intent — and therefore does not charge the customer twice.
     */
    IdempotencyKey?: string;
}

export interface CreateIntentResult {
    Success: boolean;
    Reason?: string;
    ProviderIntentID?: string;
    Status?: IntentStatus;
    /** For a client-side confirmation flow. Never logged. */
    ClientSecret?: string;
    /** For a hosted-checkout flow — where to send the customer. */
    HostedUrl?: string;
}

export interface CaptureRequest {
    ProviderIntentID: string;
    /** Omit for the full authorised amount. Major units. */
    Amount?: number;
    CurrencyCode: string;
}

export interface RetrieveIntentRequest {
    ProviderIntentID: string;
}

export interface RetrieveIntentResult {
    Success: boolean;
    Reason?: string;
    Status?: IntentStatus;
    /** Major units as the gateway currently reports them. */
    Amount?: number;
}

export interface CaptureResult {
    Success: boolean;
    Reason?: string;
    /** Major units, as reported by the gateway rather than as we asked. */
    Amount?: number;
    /**
     * The gateway's cut, major units. Feeds `PaymentHeader.ProcessingFeeAmount` and the fee leg of the
     * capture entry (D18). Zero is a legitimate answer; UNKNOWN is not the same thing, so a driver
     * that cannot determine a fee leaves this undefined rather than reporting 0.
     */
    FeeAmount?: number;
    ProviderChargeID?: string;
    Status?: IntentStatus;
}

export interface RefundRequest {
    /** One of these. A gateway may key refunds off either. */
    ProviderIntentID?: string;
    ProviderChargeID?: string;
    /** Major units. Omit for a full refund. */
    Amount?: number;
    CurrencyCode: string;
    Reason?: string;
    IdempotencyKey?: string;
}

export interface RefundResult {
    Success: boolean;
    Reason?: string;
    Amount?: number;
    ProviderRefundID?: string;
}

/** A gateway event, reduced to the facts this application acts on. */
export interface WebhookEvent {
    /** The gateway's own event id. Our idempotency key — `PaymentIntent.ProviderEventID` is UNIQUE. */
    EventID: string;
    /** The gateway's event name, unmapped. Matched against a driver's `HandledEventKinds`. */
    Kind: string;
    ProviderIntentID?: string;
    ProviderChargeID?: string;
    /** Major units. */
    Amount?: number;
    FeeAmount?: number;
    CurrencyCode?: string;
    Status?: IntentStatus;
    /** Present on a failure event, in the gateway's words. */
    FailureReason?: string;
}

/**
 * The driver contract.
 *
 * Registered against this base by `PaymentProviderType.Code`:
 *
 * ```ts
 * @RegisterClass(BasePaymentProvider, 'Stripe')
 * export class StripePaymentProvider extends BasePaymentProvider { … }
 * ```
 *
 * Default implementations REFUSE rather than pretend. A gateway that cannot refund should not silently
 * report a successful refund, and a driver author who forgets to override should find out from a clear
 * message rather than from a reconciliation weeks later.
 *
 * NOT DECORATED ITSELF, matching `BasePriceResolver`. MJ's ClassFactory instantiates the base when no
 * key matches, so a self-registration would make "nobody registered a driver" indistinguishable from
 * "the driver declined" — `PaymentProviderResolver` checks for exactly that and refuses.
 */
export class BasePaymentProvider {
    /**
     * Set by the resolver immediately after construction — the ClassFactory constructs with no
     * arguments, so configuration cannot arrive through a constructor.
     */
    public Config!: PaymentProviderConfig;
    public Credentials!: PaymentCredentials;
    /** For drivers that need to read or write our own tables (the internal ones do). */
    public Provider?: IMetadataProvider;
    public User?: UserInfo;

    /** Gateway event names this driver acts on. Everything else is ignored rather than rejected. */
    public get HandledEventKinds(): readonly string[] {
        return [];
    }

    /**
     * Whether money moves on a DELAY this driver cannot observe synchronously.
     *
     * FALSE for a card: `Capture` returns and the money has moved, so the caller books cash in the
     * same breath and a later event only confirms what we already recorded. TRUE for a bank debit:
     * `Capture` returns "submitted", the bank answers days later, and the only honest thing to record
     * in the meantime is that we are waiting.
     *
     * The flag exists because it changes WHO BOOKS THE CASH. When false, `PaymentHeaderEntityServer`
     * books at the moment the caller asks — the existing path, untouched. When true, the caller leaves
     * the payment `Pending` and the WEBHOOK promotes it, which means `PaymentWebhookHandler` has to do
     * something it deliberately never did before (see its `applyEvent` note). Gating that on a driver's
     * own declaration is what keeps the card path exactly as it was: a driver that does not opt in
     * cannot have its payments promoted behind its back.
     *
     * It is a capability of the DRIVER rather than a column on `PaymentProviderType` because it is not
     * configuration — an operator cannot make ACH settle instantly by editing a row, and offering the
     * switch would invite exactly that.
     */
    public get SettlesAsynchronously(): boolean {
        return false;
    }

    public async CreateIntent(_request: CreateIntentRequest): Promise<CreateIntentResult> {
        return { Success: false, Reason: this.notImplemented('creating a payment intent') };
    }

    public async Capture(_request: CaptureRequest): Promise<CaptureResult> {
        return { Success: false, Reason: this.notImplemented('capturing a payment') };
    }

    /**
     * Ask the gateway what it currently believes about an intent we already opened.
     *
     * Used by checkout completion when the browser has confirmed the card (Stripe.js)
     * but the signature-verified webhook has not yet landed — localhost never receives
     * Stripe's POST. This is a SERVER retrieve with our key, not a client claim.
     */
    public async RetrieveIntent(_request: RetrieveIntentRequest): Promise<RetrieveIntentResult> {
        return { Success: false, Reason: this.notImplemented('retrieving a payment intent') };
    }

    public async Refund(_request: RefundRequest): Promise<RefundResult> {
        return { Success: false, Reason: this.notImplemented('refunding a payment') };
    }

    /**
     * Verify that a webhook really came from the gateway.
     *
     * DEFAULTS TO FALSE, and that default is load-bearing. The route is unauthenticated (D19), so a
     * driver that inherits this and forgets to override gets a closed door rather than an open one.
     * A provider genuinely without webhooks never reaches here — `SupportsWebhooks` is false and the
     * route refuses earlier.
     */
    public async VerifyWebhook(
        _rawBody: string,
        _headers: Record<string, string | undefined>,
    ): Promise<{ Valid: boolean; Reason?: string }> {
        return { Valid: false, Reason: `${this.Config?.TypeCode ?? 'this provider'} does not verify webhooks` };
    }

    /** Reduce a verified payload to the facts we act on. Null when it is not an event we can read. */
    public ParseWebhookEvent(_rawBody: string): WebhookEvent | null {
        return null;
    }

    protected notImplemented(what: string): string {
        const code = this.Config?.TypeCode ?? 'unknown';
        return (
            `The '${code}' payment provider does not support ${what}. This is a driver that has not ` +
            `implemented the operation, not a gateway that declined it — check ` +
            `PaymentProviderType.Code against the registered driver classes.`
        );
    }
}

/** Tree-shaking anchor — call from the server bootstrap so @RegisterClass is retained. */
export function LoadBasePaymentProvider(): void {
    // intentionally empty
}
