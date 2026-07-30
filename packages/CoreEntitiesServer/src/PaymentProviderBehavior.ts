/**
 * The parts of talking to a payment gateway that can be got wrong without a network — and therefore
 * the parts worth proving without one.
 *
 * Three things live here, and each is here because its failure mode is silent:
 *
 *   1. MINOR-UNIT CONVERSION. Stripe and most gateways transact in the currency's smallest unit, so
 *      $12.34 is `1234`. Getting that wrong is a factor-of-100 error that looks like a plausible
 *      amount at both ends — charge 12 cents for a $12 order, or $1,234 for a $12.34 one. Worse, JPY
 *      has NO minor unit, so the "obvious" `× 100` overcharges a Japanese customer a hundredfold.
 *
 *   2. WEBHOOK SIGNATURE VERIFICATION. The webhook route is unauthenticated by necessity (D19) — the
 *      signature IS the authentication. A verifier that accepts anything is a public endpoint that
 *      marks orders paid, and it passes every test that only ever feeds it valid input.
 *
 *   3. IDEMPOTENCY. Gateways retry, and they retry on success too — a webhook that times out on our
 *      side is redelivered. Processing one twice books the cash twice.
 *
 * CONNECTS TO:
 *   SERVER: ./BasePaymentProvider.ts and the drivers under it
 *   ROUTE:  ./PaymentWebhookHandler.ts
 *   DOC:    plans/bizapps-orders-master.md D19, D37
 */
// WEB CRYPTO, NOT `node:crypto`. The shared server tsconfig sets `"types": []`, so this package has no
// Node globals by design and no other file in it reaches for one. `globalThis.crypto` is typed by the
// `dom` lib that IS included, exists in Node 18+, and needs no dependency — the only cost is that HMAC
// becomes async, which the webhook path already is.

/**
 * Currencies with NO minor unit, so an amount is already in its smallest unit.
 *
 * From Stripe's zero-decimal list. Kept explicit rather than derived from `Intl` because the gateway's
 * opinion is what matters here, not the locale database's: we must send what Stripe expects, and a
 * disagreement between the two would be a hundredfold error in whichever direction it fell.
 */
const ZERO_DECIMAL = new Set([
    'BIF', 'CLP', 'DJF', 'GNF', 'JPY', 'KMF', 'KRW', 'MGA', 'PYG', 'RWF',
    'UGX', 'VND', 'VUV', 'XAF', 'XOF', 'XPF',
]);

/** Currencies whose smallest unit is a THOUSANDTH. Rare, and wrong by 10x if treated as ordinary. */
const THREE_DECIMAL = new Set(['BHD', 'JOD', 'KWD', 'OMR', 'TND']);

/** How many minor units make one major unit. */
export function CurrencyExponent(currencyCode: string): number {
    const code = (currencyCode ?? 'USD').toUpperCase();
    if (ZERO_DECIMAL.has(code)) return 0;
    if (THREE_DECIMAL.has(code)) return 3;
    return 2;
}

/**
 * Turn an amount we hold as a decimal into the integer the gateway wants.
 *
 * Rounds rather than truncates, and rounds the SCALED value: `Math.round(12.345 * 100)` is 1235 while
 * `Math.round(12.345) * 100` is 1200. Both look like money.
 *
 * Throws on a non-finite amount instead of sending `NaN` to a gateway, which some accept as zero.
 */
export function ToMinorUnits(amount: number, currencyCode: string): number {
    if (!Number.isFinite(amount)) {
        throw new Error(`Cannot convert ${amount} to minor units — it is not a finite amount.`);
    }
    const factor = 10 ** CurrencyExponent(currencyCode);
    // `Number.EPSILON` nudge for the same reason `Money()` uses one: 1.005 * 100 is 100.49999… in
    // binary floating point, and rounding that gives 100 rather than 101.
    return Math.round((amount + Number.EPSILON * Math.sign(amount)) * factor);
}

/** And back, for reading what the gateway reported. */
export function FromMinorUnits(minor: number, currencyCode: string): number {
    if (!Number.isFinite(minor)) {
        throw new Error(`Cannot convert ${minor} from minor units — it is not a finite amount.`);
    }
    const factor = 10 ** CurrencyExponent(currencyCode);
    return Math.round((minor / factor) * 100) / 100;
}

// ─── Webhook signatures ────────────────────────────────────────────────────────────────────────

export interface SignatureVerification {
    Valid: boolean;
    /** Why not, when not. Logged, never returned to the caller — see PaymentWebhookHandler. */
    Reason?: string;
}

/**
 * Verify a Stripe-style `Stripe-Signature` header.
 *
 * The scheme: `t=<unix seconds>,v1=<hex hmac>[,v1=<another>]`, where the HMAC is SHA-256 over
 * `${t}.${rawBody}` keyed with the endpoint secret. Multiple `v1` values appear during a secret
 * rotation, and ANY match is a pass — a verifier that only reads the first one breaks silently
 * halfway through a rotation, which is the worst possible moment.
 *
 * THE RAW BODY IS NOT NEGOTIABLE. The signature covers the exact bytes Stripe sent. Any JSON
 * round-trip — key reordering, whitespace, unicode normalisation — changes them, and the signature
 * then fails for a legitimate event. That is why the route captures the raw body before any parser
 * touches it.
 *
 * TIMESTAMP TOLERANCE defends against replay: a valid old payload stays valid forever without it.
 * Default five minutes, matching Stripe's own guidance. `nowSeconds` is a parameter so this is
 * testable without waiting.
 */
export async function VerifyWebhookSignature(
    rawBody: string,
    signatureHeader: string | null | undefined,
    secret: string | null | undefined,
    opts: { NowSeconds?: number; ToleranceSeconds?: number } = {},
): Promise<SignatureVerification> {
    if (!secret) {
        // A missing secret must FAIL rather than skip verification. "No secret configured, so accept
        // everything" turns a misconfiguration into an open endpoint that marks orders paid.
        return { Valid: false, Reason: 'no endpoint secret is configured for this provider' };
    }
    if (!signatureHeader) return { Valid: false, Reason: 'the request carried no signature header' };

    let timestamp: number | null = null;
    const candidates: string[] = [];
    for (const part of signatureHeader.split(',')) {
        const [key, value] = part.split('=', 2).map((s) => s?.trim());
        if (key === 't' && value) timestamp = Number(value);
        if (key === 'v1' && value) candidates.push(value);
    }

    if (timestamp == null || !Number.isFinite(timestamp)) {
        return { Valid: false, Reason: 'the signature header carried no usable timestamp' };
    }
    if (!candidates.length) return { Valid: false, Reason: 'the signature header carried no v1 signature' };

    const tolerance = opts.ToleranceSeconds ?? 300;
    const now = opts.NowSeconds ?? Math.floor(Date.now() / 1000);
    if (Math.abs(now - timestamp) > tolerance) {
        return {
            Valid: false,
            Reason: `the signature timestamp is ${Math.abs(now - timestamp)}s away, outside the ${tolerance}s tolerance`,
        };
    }

    const expected = await HmacSha256Hex(secret, `${timestamp}.${rawBody}`);
    for (const candidate of candidates) {
        if (SignaturesMatch(expected, candidate)) return { Valid: true };
    }
    return { Valid: false, Reason: 'no provided signature matched' };
}

/** HMAC-SHA256 as lowercase hex, via Web Crypto. */
export async function HmacSha256Hex(secret: string, payload: string): Promise<string> {
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
        'raw',
        encoder.encode(secret),
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign'],
    );
    const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(payload));
    return [...new Uint8Array(signature)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Constant-time hex comparison.
 *
 * `===` on a signature leaks how many leading characters were right through how long the comparison
 * took. That is a real attack against a public endpoint, and the fix costs nothing. `timingSafeEqual`
 * throws on a length mismatch, so the lengths are checked first — and a mismatched length is itself
 * not secret, since the algorithm fixes it.
 */
export function SignaturesMatch(expected: string, provided: string): boolean {
    if (expected.length !== provided.length) return false;
    // XOR-accumulate every position rather than returning on the first difference. `Node`'s
    // `timingSafeEqual` would do this for us but lives behind `node:crypto`; the loop is the same
    // guarantee in six lines, and it never short-circuits.
    let diff = 0;
    for (let i = 0; i < expected.length; i++) {
        diff |= expected.charCodeAt(i) ^ provided.charCodeAt(i);
    }
    return diff === 0;
}

// ─── Status mapping ────────────────────────────────────────────────────────────────────────────

/** `PaymentIntent.Status` — the CHECK-constrained set our column allows. */
export type IntentStatus = 'RequiresPayment' | 'Processing' | 'Succeeded' | 'Canceled' | 'Failed';

/**
 * Map a gateway's own status onto ours.
 *
 * UNKNOWN MAPS TO `Processing`, NOT to `Succeeded` or `Failed`. A status we do not recognise means the
 * gateway has told us something this code was not written for, and both confident answers are
 * dangerous: `Succeeded` books cash that may not exist, `Failed` abandons a payment that may be fine.
 * `Processing` is the honest reading — something is happening and we do not yet know what — and it
 * leaves the payment for a human or a later event to resolve.
 */
export function MapStripeIntentStatus(providerStatus: string | null | undefined): IntentStatus {
    switch ((providerStatus ?? '').toLowerCase()) {
        case 'requires_payment_method':
        case 'requires_confirmation':
        case 'requires_action':
        case 'requires_source':
        case 'requires_source_action':
            return 'RequiresPayment';
        case 'processing':
            return 'Processing';
        case 'succeeded':
            return 'Succeeded';
        case 'canceled':
        case 'cancelled':
            return 'Canceled';
        // Stripe has no `failed` intent status — a failure arrives as an EVENT against an intent that
        // is back to requires_payment_method. `payment_intent.payment_failed` is mapped by the event
        // reader, not here, and this case exists for gateways that do report it directly.
        case 'failed':
            return 'Failed';
        default:
            return 'Processing';
    }
}

// ─── Idempotency ───────────────────────────────────────────────────────────────────────────────

/** What a webhook should cause, decided before anything is written. */
export type WebhookAction = 'Apply' | 'AlreadyApplied' | 'Ignore' | 'Reject';

export interface WebhookDecision {
    Action: WebhookAction;
    Reason: string;
}

/**
 * Decide what to do with an event, given what we have already seen.
 *
 * `AlreadyApplied` IS A SUCCESS, and that distinction is the whole point. A gateway that does not get
 * a 2xx retries, so returning an error for a duplicate guarantees it comes back — forever. The
 * response must say "yes, we have this" without doing the work twice.
 *
 * `Ignore` is for events we are not interested in. Gateways send far more than any one integration
 * consumes, and treating an unrecognised event as an error means a Stripe dashboard full of red for
 * events we were never going to read.
 */
export function DecideWebhookAction(input: {
    EventID: string | null | undefined;
    EventKind: string | null | undefined;
    /** True when a `PaymentIntent` row already carries this `ProviderEventID`. */
    AlreadySeen: boolean;
    /** The kinds this integration acts on. */
    HandledKinds: readonly string[];
    /** False when the event names an intent we have no record of. */
    IntentKnown: boolean;
}): WebhookDecision {
    if (!input.EventID) {
        return { Action: 'Reject', Reason: 'the event carried no id, so it cannot be de-duplicated' };
    }
    if (input.AlreadySeen) {
        return { Action: 'AlreadyApplied', Reason: `event ${input.EventID} has already been applied` };
    }
    if (!input.EventKind || !input.HandledKinds.includes(input.EventKind)) {
        return { Action: 'Ignore', Reason: `'${input.EventKind ?? 'unknown'}' is not an event this integration acts on` };
    }
    if (!input.IntentKnown) {
        // NOT an error. A gateway account may serve more than this application, and an intent we did
        // not create is simply not ours — rejecting it would mean retries forever for someone else's
        // traffic.
        return { Action: 'Ignore', Reason: 'the event names a payment intent this application did not create' };
    }
    return { Action: 'Apply', Reason: `event ${input.EventID} is new and actionable` };
}

/**
 * Split a captured amount into the cash actually received and the gateway's cut.
 *
 * The capture entry is `Dr Cash (net) / Dr Processing Fee / Cr A/R (gross)` (D18), so these three
 * numbers must reconcile exactly or the entry will not balance. Deriving `net` by subtraction rather
 * than trusting a reported net is deliberate: a gateway that rounds its own net differently would
 * leave a penny with no home in the ledger.
 *
 * ALL THREE ARE EXACT AT 2DP, BUT `Net + Fee` IN JAVASCRIPT IS NOT. Adding two correctly-rounded
 * decimals drifts in binary floating point — 32.06 + 1.27 is 33.330000000000005 — so a caller
 * reconciling them must round the SUM before comparing, exactly as `Money()` does everywhere else in
 * this package. This is the same hazard that made a balanced journal entry fail an exact-equality check
 * in accounting; the numbers were never wrong, the comparison was.
 */
export function SplitCapturedAmount(
    grossAmount: number,
    feeAmount: number,
): { Gross: number; Fee: number; Net: number } {
    const gross = Math.round(grossAmount * 100) / 100;
    const fee = Math.round(Math.abs(feeAmount ?? 0) * 100) / 100;
    if (fee > gross) {
        throw new Error(
            `A processing fee of ${fee} cannot exceed the ${gross} captured. Booking this would credit ` +
                `receivables less than the cash and fee together, and the entry would not balance.`,
        );
    }
    return { Gross: gross, Fee: fee, Net: Math.round((gross - fee) * 100) / 100 };
}
