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
    /**
     * `PaymentProvider.BillsSubscriptions`: this account bills the auto-renewing subscriptions sold
     * through it, so Orders creates a gateway subscription after the first payment. Honoured only
     * when the type's `Capabilities.SupportsSubscriptionBilling` is also set; see
     * `ProviderBillsNewSubscriptions` in ./ProviderSubscriptions.ts, the one place the two are combined.
     * Never consulted by the renewal jobs, which key on the subscription's own marker.
     */
    BillsSubscriptions: boolean;
    Capabilities: {
        SupportsTokenization: boolean;
        SupportsRefund: boolean;
        SupportsWebhooks: boolean;
        /**
         * `PaymentProviderType.SupportsSubscriptionBilling`: the gateway can bill a subscription itself
         * (charge the card each period, send its own receipts).
         */
        SupportsSubscriptionBilling: boolean;
    };
}

/** Resolved secrets. Held only for the duration of a call and never persisted. */
export interface PaymentCredentials {
    /** The gateway API key. */
    ApiKey?: string;
    /** The webhook endpoint signing secret — a DIFFERENT secret from the API key, deliberately. */
    WebhookSecret?: string;
    /**
     * The gateway's PUBLISHABLE key — the one a browser is meant to hold (Stripe's `pk_…`). Not a
     * secret, but resolved from the same `CredentialsRef` so it travels with the account it belongs
     * to: a deployment's live and test accounts each carry their own pair, and the browser's key can
     * never drift from the server's. See `ResolveCheckoutPublishableKey`.
     */
    PublishableKey?: string;
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
    /**
     * Ask the gateway to keep the instrument the customer is about to enter, so it can be charged
     * later without them present — the first purchase of an auto-renewing subscription. Needs a
     * `ProviderCustomerRef`: a saved instrument belongs to a gateway customer, and without one the
     * gateway has nothing to attach it to. Ignored when `ProviderInstrumentRef` is set, since that
     * instrument is already saved.
     */
    SaveInstrumentForReuse?: boolean;
    /** Free-form, echoed back on webhooks. Useful for reconciliation, never load-bearing. */
    Metadata?: Record<string, string>;
    /**
     * What the gateway's dashboard shows for this charge — see `FormatIntentDescription`. Display
     * only, like `Metadata`: nothing reads it back.
     */
    Description?: string | null;
    /**
     * Where the gateway sends its own receipt for this charge, when the caller wants one. Omitted, the
     * gateway sends none. A driver whose gateway has no receipts ignores it.
     */
    ReceiptEmail?: string | null;
    /**
     * OUR idempotency key. Sent to gateways that support one so a retried create does not open a
     * second intent — and therefore does not charge the customer twice.
     */
    IdempotencyKey?: string;
}

export interface CreateIntentResult {
    Success: boolean;
    Reason?: string;
    /**
     * The gateway's intent id. Also set on a REFUSAL when the gateway created the intent before
     * declining it: a saved instrument charged at create time (#289) comes back declined with the
     * intent it opened, and that attempt is recorded as a Failed intent rather than lost.
     */
    ProviderIntentID?: string;
    Status?: IntentStatus;
    /** For a client-side confirmation flow. Never logged. */
    ClientSecret?: string;
    /** For a hosted-checkout flow — where to send the customer. */
    HostedUrl?: string;
    /**
     * The gateway's code for why a saved-instrument charge was refused (`card_declined`,
     * `insufficient_funds`, `authentication_required`, ...). Set only on a refusal.
     */
    FailureCode?: string;
    /**
     * True when charging a saved instrument needs the customer to authenticate (an SCA demand). The
     * customer is not present, so the charge cannot complete; callers treat it as a failure (#289).
     */
    RequiresAuthentication?: boolean;
    /** When the gateway took the money, for a saved-instrument charge that succeeded at create time. */
    CapturedAt?: Date;
}

/**
 * Details attached to an intent after it was opened. Checkout opens its intent before the order exists,
 * so the order number and id can only reach the gateway afterwards (#327).
 */
export interface UpdateIntentRequest {
    ProviderIntentID: string;
    Description?: string | null;
    /** Merged into what the intent already carries; keys not named here are left alone. */
    Metadata?: Record<string, string>;
}

export interface UpdateIntentResult {
    Success: boolean;
    Reason?: string;
}

export interface CaptureRequest {
    ProviderIntentID: string;
    /** Omit for the full authorised amount. Major units. */
    Amount?: number;
    CurrencyCode: string;
    /** The gift card being spent, when the tender is one. Only the stored-value driver reads it. */
    StoredValueAccountID?: string | null;
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
    /**
     * The instrument the intent was paid with, when the gateway reports one. Token references and
     * display fields only — never a card number. Present so a caller can put a saved card in the
     * wallet after the first payment.
     */
    Instrument?: RetrievedInstrument;
}

/** The instrument behind a paid intent, as the gateway describes it. */
export interface RetrievedInstrument {
    /** The gateway customer the instrument is attached to; null when it is not saved to one. */
    ProviderCustomerRef: string | null;
    ProviderInstrumentRef: string;
    Brand?: string;
    Last4?: string;
    ExpiryMonth?: number;
    ExpiryYear?: number;
    HolderName?: string;
    /** ISO 3166-1 alpha-2 country of the card's issuer, when the gateway reports one. */
    IssuingCountry?: string;
}

/** A gateway customer to reuse or create — the owner of any instrument saved for later charges. */
export interface EnsureCustomerRequest {
    /** The customer already on file for this person with this provider, when there is one. */
    ExistingProviderCustomerRef?: string | null;
    Email?: string | null;
    Name?: string | null;
    /** Ours, echoed into the gateway's record so the two can be matched. */
    BillToPersonID?: string | null;
    BillToOrganizationID?: string | null;
    /**
     * Ours: the checkout the customer is opened for, when the buyer has no person record yet. The
     * person that checkout's completion creates owns the card filed against this customer.
     */
    CheckoutSessionID?: string | null;
    /** Sent to gateways that support one, so a retried call does not create a second customer. */
    IdempotencyKey?: string;
}

export interface EnsureCustomerResult {
    Success: boolean;
    Reason?: string;
    ProviderCustomerRef?: string;
    /** True when `ExistingProviderCustomerRef` was reused rather than a new customer created. */
    WasExisting?: boolean;
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

/** One refund as the gateway reports it. */
export interface GatewayRefund {
    ProviderRefundID: string;
    ProviderChargeID?: string | null;
    /** Major units, positive. */
    Amount: number;
    CurrencyCode: string;
    /** The gateway's own status, unmapped (Stripe: pending, requires_action, succeeded, failed, canceled). */
    Status: string;
    CreatedAt?: Date;
}

/** Which refunds to list. Every condition given must hold. */
export interface ListRefundsRequest {
    ProviderChargeID?: string;
    CreatedFrom?: Date;
    CreatedTo?: Date;
}

export interface ListRefundsResult {
    Success: boolean;
    Reason?: string;
    Refunds?: GatewayRefund[];
}

/** One charge as the gateway reports it. */
export interface GatewayCharge {
    ProviderChargeID: string;
    ProviderIntentID?: string | null;
    /** Major units. */
    Amount: number;
    /** Major units refunded so far, cumulative. */
    AmountRefunded: number;
    CurrencyCode: string;
    /** The gateway's own status, unmapped (Stripe: succeeded, pending, failed). */
    Status: string;
    CreatedAt?: Date;
    /** The payer's e-mail as the gateway holds it (Stripe: the billing details, else the receipt address). */
    BuyerEmail?: string | null;
    /** The payer's name as the gateway holds it (Stripe: the billing details). */
    BuyerName?: string | null;
}

/**
 * One line of what a charge paid for, as the gateway's hosted checkout or payment link recorded it.
 * The gateway's price id is what an unmatched charge's product is chosen by (#481).
 */
export interface GatewayChargeItem {
    ProviderPriceID: string;
    ProviderProductID?: string | null;
    Quantity: number;
    /** Major units, the line's total. */
    Amount: number;
}

export interface ListChargeItemsRequest {
    ProviderIntentID: string;
}

export interface ListChargeItemsResult {
    Success: boolean;
    Reason?: string;
    /** Empty when the charge came through no hosted checkout or link (a dashboard or API charge). */
    Items?: GatewayChargeItem[];
    /** The buyer the checkout collected, which can be fuller than the charge's billing details. */
    BuyerEmail?: string | null;
    BuyerName?: string | null;
}

export interface ListChargesRequest {
    CreatedFrom?: Date;
    CreatedTo?: Date;
}

export interface ListChargesResult {
    Success: boolean;
    Reason?: string;
    Charges?: GatewayCharge[];
}

export interface RetrieveChargeRequest {
    ProviderChargeID: string;
}

export interface RetrieveChargeResult {
    Success: boolean;
    Reason?: string;
    /** True when the gateway answered that no such charge exists, as opposed to failing to answer. */
    NotFound?: boolean;
    Charge?: GatewayCharge;
}

/** One webhook endpoint configured at the gateway. */
export interface GatewayWebhookEndpoint {
    Url: string;
    /** The gateway's own status (Stripe: enabled, disabled). */
    Status: string;
    /** The event kinds it sends; `*` means every kind. */
    EnabledEvents: string[];
}

export interface ListWebhookEndpointsResult {
    Success: boolean;
    Reason?: string;
    Endpoints?: GatewayWebhookEndpoint[];
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
    /**
     * When the gateway says the event happened. Stripe `created` (unix seconds).
     * Used to bound checkout-capture webhook 500s; absent means the bound cannot
     * be applied and retries follow Retryable only.
     */
    OccurredAt?: Date;
    /**
     * The gateway subscription an event is about, for the kinds a driver lists in
     * `HandledSubscriptionEventKinds` (E3). Only the id is read from such an event: what the subscription
     * is now is read from the gateway itself (`DescribeProviderSubscription`), so the event's own shape,
     * order and repeats do not matter.
     */
    ProviderSubscriptionID?: string;
}

/**
 * Ask the gateway to bill a subscription itself from a later day on (option E, E2): Orders took the
 * first payment, and the gateway charges every renewal on the saved instrument.
 *
 * Example: Jane paid year 1 ($599) on the checkout on 31 Oct 2026, her card is `pm_…` on customer
 * `cus_…`, and her term ends 30 Oct 2027. Orders asks for a subscription on `price_…` whose first
 * charge is 00:00 business time on 30 Oct 2027; nothing is charged at creation.
 */
export interface CreateProviderSubscriptionRequest {
    /** The gateway customer the instrument belongs to (`PaymentDetail.ProviderCustomerRef`). */
    ProviderCustomerRef: string;
    /** The saved instrument every renewal is charged to (`PaymentDetail.ProviderInstrumentRef`). */
    ProviderInstrumentRef: string;
    /** The gateway's price (`PaymentProviderPrice.ProviderPriceID` flagged `UseForNewSubscriptions`). */
    ProviderPriceID: string;
    /** Units, from the term. A whole number of at least 1. */
    Quantity: number;
    /**
     * When the gateway first charges. The time before it is not billed at all: the customer paid it
     * through Orders. Must be in the future and no later than `LatestFirstChargeAt` allows.
     */
    FirstChargeAt: Date;
    /** OUR idempotency key, so a retried create does not open a second gateway subscription. */
    IdempotencyKey: string;
    /** Stored on the gateway's subscription, so it can be found again from Orders' ids. */
    Metadata?: Record<string, string>;
}

export interface CreateProviderSubscriptionResult {
    Success: boolean;
    Reason?: string;
    /** The gateway's id (Stripe `sub_…`), written to `Subscription.ProviderSubscriptionID`. */
    ProviderSubscriptionID?: string;
    /** The gateway's own status word, for the log and the alert. */
    Status?: string;
    /** The first charge as the gateway recorded it. */
    FirstChargeAt?: Date;
    /**
     * True when the gateway billed something at creation or did not start the subscription cleanly.
     * Must never happen: the customer already paid this period through Orders, so it is a double
     * charge, and the caller raises it as urgent.
     */
    ChargedAtCreation?: boolean;
    /**
     * Set on a refusal that only means another request with the same idempotency key is still being
     * processed. That request gets the subscription and its caller records it, so this is not a
     * problem for a person.
     */
    InFlightElsewhere?: boolean;
}

/** Find the gateway subscriptions on a customer that carry one metadata value. */
export interface FindProviderSubscriptionsRequest {
    ProviderCustomerRef: string;
    MetadataKey: string;
    MetadataValue: string;
}

/** A subscription the gateway holds, as `FindProviderSubscriptions` reports it. */
export interface GatewaySubscription {
    ProviderSubscriptionID: string;
    /** The gateway's own status word. */
    Status: string;
    /** False once the gateway will never bill it again (Stripe: `canceled`, `incomplete_expired`). */
    IsLive: boolean;
    Metadata: Record<string, string>;
    /** The price it bills (its first item), when the gateway reports one. */
    ProviderPriceID?: string;
    /** The quantity of that item. */
    Quantity?: number;
    /** When it first charges, or charged (Stripe: `billing_cycle_anchor`). */
    FirstChargeAt?: Date;
}

/**
 * Stop the gateway billing a subscription Orders has cancelled (E2b).
 *
 * `BillingEndsAt` is the instant after which the gateway must charge nothing: null for now. The
 * driver decides how: end it now, at its period end, or at that instant, whichever stops every
 * charge after `BillingEndsAt` without one before it that Orders has not sold.
 *
 * Example: Sess cancels Jane's SUB-000110 at the end of term 1 (ends 30 Oct 2027). Orders asks the
 * gateway to bill nothing after 00:00 Central on 31 Oct 2027; Stripe's period ends at 00:00 Central on
 * 30 Oct 2027, so it is told not to renew at period end, and the $599 renewal never happens.
 */
export interface CancelProviderSubscriptionRequest {
    /** The gateway's id (`Subscription.ProviderSubscriptionID`). */
    ProviderSubscriptionID: string;
    /** The gateway must charge nothing after this instant; null ends the subscription now. */
    BillingEndsAt: Date | null;
    /** OUR idempotency key, so a retried request is answered, not repeated. */
    IdempotencyKey: string;
}

/** What the gateway did. Each `Success: true` outcome means it will charge nothing after `BillingEndsAt`. */
export type CancelProviderSubscriptionOutcome =
    /** Ended now. */
    | 'CanceledNow'
    /** Set to end at its current period end instead of renewing. */
    | 'EndsAtPeriodEnd'
    /** Set to end at an instant inside its current period. */
    | 'EndsAt'
    /** It had already ended (a retry, or someone cancelled it at the gateway). */
    | 'AlreadyEnded'
    /** It was already set to end no later than asked. */
    | 'AlreadyEnding';

export interface CancelProviderSubscriptionResult {
    Success: boolean;
    Reason?: string;
    Outcome?: CancelProviderSubscriptionOutcome;
    /** When the gateway's billing actually ends: now, its period end or the instant set. */
    BillingEndsAt?: Date;
    /** The gateway's own status word after the call. */
    Status?: string;
}

/**
 * Where a gateway subscription's billing stands, read without changing it.
 *   · `Ended`: it charges nothing more.
 *   · `Ending`: it is set to end (`EndsAt`) and charges nothing more before then.
 *   · `Renewing`: it charges again at `CurrentPeriodEnd`.
 *   · `Collecting`: it is trying to collect a charge it has not been paid (Stripe: `past_due`, `unpaid`,
 *     `incomplete`, `paused`).
 */
export type ProviderSubscriptionBillingState = 'Ended' | 'Ending' | 'Renewing' | 'Collecting';

export interface DescribeProviderSubscriptionResult {
    Success: boolean;
    Reason?: string;
    State?: ProviderSubscriptionBillingState;
    /** Start of the period the gateway last billed (or tried to): its latest charge, or its creation before the first one. */
    CurrentPeriodStart?: Date | null;
    /** End of that period: when it charges next, unless it is set to end. */
    CurrentPeriodEnd?: Date | null;
    /** When it ends, for `Ending`. */
    EndsAt?: Date | null;
    /** The gateway's own status word. */
    Status?: string;
    /** When it ended, for `Ended`. */
    EndedAt?: Date | null;
    /** The gateway price it bills now, and how many units. */
    ProviderPriceID?: string | null;
    Quantity?: number | null;
    /** The gateway customer it bills, and that customer's e-mail when the gateway has one. */
    ProviderCustomerRef?: string | null;
    CustomerEmail?: string | null;
    /** The value of each metadata key it carries (E2 writes `OrdersSubscriptionID`). */
    Metadata?: Record<string, string>;
}

/**
 * One invoice of a gateway subscription, as E3/E4 read it (`ListProviderSubscriptionInvoices`). Amounts
 * are major units in `CurrencyCode`.
 *
 * Example: Jane's renewal on 30 Oct 2027 is `{ BillingReason: 'subscription_cycle', Status: 'paid',
 * AmountPaid: 599, ProviderIntentID: 'pi_…', ProviderChargeID: 'ch_…', PaidAt: 2027-10-30T05:00Z }`.
 */
export interface GatewaySubscriptionInvoice {
    ProviderInvoiceID: string;
    /** `draft`, `open`, `paid`, `void`, `uncollectible`. */
    Status: string;
    /** Why the gateway raised it: `subscription_cycle` (a renewal), `subscription_create`, `subscription_update`, `manual`. */
    BillingReason: string | null;
    AmountPaid: number;
    AmountDue: number;
    /** Tax the gateway added, if any. */
    Tax: number;
    CurrencyCode: string;
    ProviderIntentID: string | null;
    ProviderChargeID: string | null;
    CreatedAt: Date | null;
    /** When it was paid; null while unpaid. */
    PaidAt: Date | null;
    /** Marked paid without the gateway collecting (a payment made elsewhere). */
    PaidOutOfBand: boolean;
    /** True when any discount reduced it (a coupon). */
    Discounted: boolean;
    /** Collection attempts so far, and when the gateway tries next (null when it will not). */
    AttemptCount: number;
    NextAttemptAt: Date | null;
    /** The price and quantity of its subscription line. */
    ProviderPriceID: string | null;
    Quantity: number | null;
    /**
     * The billing period the subscription's own line covers (not a proration line). A renewal invoice bills
     * the period that starts at the renewal; the invoice that paid the period Orders already covers (an
     * imported subscriber's current year) starts before the latest term's last day.
     */
    PeriodStart: Date | null;
    PeriodEnd: Date | null;
}

export interface ListProviderSubscriptionInvoicesResult {
    Success: boolean;
    Reason?: string;
    Invoices?: GatewaySubscriptionInvoice[];
}

/** How often a gateway price bills. */
export interface GatewayPriceInterval {
    Unit: 'day' | 'week' | 'month' | 'year';
    /** Units per billing period: `{ Unit: 'month', Count: 3 }` is quarterly. */
    Count: number;
}

export interface DescribeProviderPriceResult {
    Success: boolean;
    Reason?: string;
    /** False when the gateway would refuse to start a new subscription on it. */
    Active?: boolean;
    /** How often it bills; null for a one-time price. */
    Interval?: GatewayPriceInterval | null;
}

export interface FindProviderSubscriptionsResult {
    Success: boolean;
    Reason?: string;
    Subscriptions?: GatewaySubscription[];
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
     * The webhook kinds that say something happened to a gateway subscription or its invoices (E3). For
     * each, the handler reads the subscription id the parser filled in and brings Orders in line with
     * what the gateway says now. Empty by default: a driver whose gateway bills no subscriptions has none.
     */
    public get HandledSubscriptionEventKinds(): readonly string[] {
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

    /**
     * Whether capturing a payment against this provider means asking the gateway to MOVE money.
     * True for a till (Stripe): capture calls the gateway and needs an intent. False for a rail that
     * collected the money on its own (Bill.com): the payment is RECORDED, not collected, so there is no
     * intent and nothing to capture — `PaymentHeaderEntityServer` books it like a check, but keeps
     * `PaymentProviderID` so the money stays attributed to the rail it arrived on.
     */
    public get CollectsAtCapture(): boolean {
        return true;
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

    /** Attach display details to an intent already opened. Moves no money and changes no status. */
    public async UpdateIntent(_request: UpdateIntentRequest): Promise<UpdateIntentResult> {
        return { Success: false, Reason: this.notImplemented('updating a payment intent') };
    }

    public async Refund(_request: RefundRequest): Promise<RefundResult> {
        return { Success: false, Reason: this.notImplemented('refunding a payment') };
    }

    /**
     * The refunds the gateway holds, for a charge or a time window.
     *
     * Read-only. Used to book a refund made at the gateway (#476): the refund event carries only the
     * charge's cumulative refunded amount, and the individual refund ids come from here.
     */
    public async ListRefunds(_request: ListRefundsRequest): Promise<ListRefundsResult> {
        return { Success: false, Reason: this.notImplemented('listing refunds') };
    }

    /**
     * Whether this driver can list the gateway's charges, which is what the charge reconciliation
     * reads (#477). False for a rail with no charges of its own to list.
     */
    public get ListsCharges(): boolean {
        return false;
    }

    /** The gateway's charges in a time window. Read-only. */
    public async ListCharges(_request: ListChargesRequest): Promise<ListChargesResult> {
        return { Success: false, Reason: this.notImplemented('listing charges') };
    }

    /** One charge by id. Read-only. */
    public async RetrieveCharge(_request: RetrieveChargeRequest): Promise<RetrieveChargeResult> {
        return { Success: false, Reason: this.notImplemented('reading a charge') };
    }

    /**
     * What a charge paid for, by the gateway intent it was taken on: the lines of the hosted checkout
     * or payment link behind it, and the buyer that checkout collected. Read-only. Used to choose the
     * product and buyer of an order created from a charge that matched nothing (#481).
     */
    public async ListChargeItems(_request: ListChargeItemsRequest): Promise<ListChargeItemsResult> {
        return { Success: false, Reason: this.notImplemented('reading what a charge paid for') };
    }

    /** The webhook endpoints configured at the gateway, for the drift check (#477). Read-only. */
    public async ListWebhookEndpoints(): Promise<ListWebhookEndpointsResult> {
        return { Success: false, Reason: this.notImplemented('listing webhook endpoints') };
    }

    /**
     * Reuse or create the gateway customer that a saved instrument will belong to.
     *
     * Refuses by default, like every other operation here: a driver that cannot keep an instrument
     * for later must say so, not hand back an id nothing will accept.
     */
    public async EnsureCustomer(_request: EnsureCustomerRequest): Promise<EnsureCustomerResult> {
        return { Success: false, Reason: this.notImplemented('keeping a customer for saved instruments') };
    }

    /**
     * Have the gateway bill a subscription from `FirstChargeAt` on (option E, E2).
     *
     * Refuses by default. Orders calls it only for an account whose type supports subscription
     * billing and whose `BillsSubscriptions` switch is on, and a driver that has not implemented it
     * must say so rather than return an id: an id marks the Orders subscription as gateway-billed, and
     * Orders then stops renewing it.
     */
    public async CreateProviderSubscription(_request: CreateProviderSubscriptionRequest): Promise<CreateProviderSubscriptionResult> {
        return { Success: false, Reason: this.notImplemented('creating a gateway-billed subscription') };
    }

    /**
     * The gateway subscriptions on a customer that carry a metadata value. Read-only. Used before a
     * retried create, because a gateway forgets idempotency keys (Stripe after about 24 hours) and a
     * second create would otherwise open a second subscription.
     */
    public async FindProviderSubscriptions(_request: FindProviderSubscriptionsRequest): Promise<FindProviderSubscriptionsResult> {
        return { Success: false, Reason: this.notImplemented('finding gateway-billed subscriptions') };
    }

    /**
     * Stop the gateway billing a subscription after `BillingEndsAt` (E2b). Called by
     * `Orders.CancelSubscription` BEFORE it writes anything, so a gateway that does not confirm leaves
     * Orders unchanged rather than cancelled while the gateway still bills.
     *
     * Refuses by default: a driver that cannot cancel must say so, never report success.
     */
    public async CancelProviderSubscription(_request: CancelProviderSubscriptionRequest): Promise<CancelProviderSubscriptionResult> {
        return { Success: false, Reason: this.notImplemented('cancelling a gateway-billed subscription') };
    }

    /**
     * Where one gateway subscription's billing stands. Read-only. `Orders.CancelSubscription` reads it
     * before deciding anything, because the gateway, not Orders, knows whether it has already charged a
     * period Orders has not booked, or has already stopped.
     *
     * Refuses by default: a driver that cannot read the gateway must not let Orders guess.
     */
    public async DescribeProviderSubscription(_providerSubscriptionID: string): Promise<DescribeProviderSubscriptionResult> {
        return { Success: false, Reason: this.notImplemented('reading a gateway-billed subscription') };
    }

    /**
     * A gateway subscription's invoices created on or after `CreatedSince` (every status), oldest first.
     * Read-only. E3/E4 read them to book each renewal the gateway was paid for and to record each failed
     * attempt, so a renewal is never booked from a webhook's payload. Refuses by default.
     */
    public async ListProviderSubscriptionInvoices(_request: {
        ProviderSubscriptionID: string;
        CreatedSince?: Date | null;
    }): Promise<ListProviderSubscriptionInvoicesResult> {
        return { Success: false, Reason: this.notImplemented('listing a gateway subscription\'s invoices') };
    }

    /**
     * How often a gateway price bills. Read-only. Orders reads it before creating a subscription on the
     * price, and refuses visibly when the price's period is not the Orders term's: a yearly price on a
     * monthly product would otherwise be billed on the wrong cadence without a word.
     */
    public async DescribeProviderPrice(_providerPriceID: string): Promise<DescribeProviderPriceResult> {
        return { Success: false, Reason: this.notImplemented('reading a gateway price') };
    }

    /**
     * The latest first charge the gateway accepts for a subscription created at `createdAt` on a price
     * that bills every `interval`, or null when the driver knows no limit. Stripe refuses a first
     * charge past the price's next natural billing date (one period from creation); the caller defers
     * creating the subscription until the charge day fits. Without `interval`, a yearly price.
     */
    public LatestFirstChargeAt(_createdAt: Date, _interval?: GatewayPriceInterval | null): Date | null {
        return null;
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
