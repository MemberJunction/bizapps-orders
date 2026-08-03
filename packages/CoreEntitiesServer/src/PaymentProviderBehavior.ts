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

// ─── Bank debits (ACH) ─────────────────────────────────────────────────────────────────────────

/**
 * Stripe's published US bank-debit price: 0.8% of the amount, capped at $5.
 *
 * FOR THE STUB ONLY, and the name says so deliberately. The live path reads the fee off the charge's
 * balance transaction like every other capture — what Stripe actually charged is a fact, and computing
 * it here would be this file's opinion competing with the gateway's record. A stub that reported a
 * ZERO fee would be worse still: it would make the fee leg of the capture entry (D18) unreachable in
 * every test, so the arithmetic most worth exercising would be the arithmetic never exercised. That is
 * the same reasoning behind the card stub's 2.9% + 30c, and the same reason this constant will drift
 * from Stripe's price list one day without breaking anything real.
 *
 * The cap is a MAJOR-UNIT USD figure. A bank debit is a US rail, so the currency is USD in practice;
 * a caller passing anything else gets the percentage without the cap rather than a cap converted at a
 * rate this module has no business knowing.
 */
export function AchFeeEstimate(grossAmount: number, currencyCode: string = 'USD'): number {
    const gross = Math.round(Math.abs(grossAmount ?? 0) * 100) / 100;
    if (!Number.isFinite(gross) || gross <= 0) return 0;
    const raw = gross * 0.008;
    const capped = currencyCode.toUpperCase() === 'USD' ? Math.min(raw, 5) : raw;
    return Math.round(capped * 100) / 100;
}

// ─── Settlement ────────────────────────────────────────────────────────────────────────────────

/**
 * What a settlement event should do to the payment we opened for it.
 *
 * `Hold` is the important one and the reason this is a decision table rather than an `if`. It means
 * the event and the payment disagree in a way this code was not written for — a success against a
 * refunded payment, a capture with no ledger entry behind it — and the honest response is to record
 * nothing and say so. Both confident answers are worse: acting books or unbooks real money on a
 * reading we have already admitted we do not understand.
 */
export type SettlementAction = 'Promote' | 'Fail' | 'Reverse' | 'Hold' | 'None';

export interface SettlementDecision {
    Action: SettlementAction;
    Reason: string;
}

/**
 * Decide what a bank-debit event does to its payment.
 *
 * THE ASYMMETRY IS THE WHOLE DESIGN. A card tells you at the till; a bank debit tells you up to four
 * business days later, and it can tell you TWICE — "taken" and then, a week after that, "returned"
 * (insufficient funds, account closed, unauthorised). So there is no single moment where the answer is
 * known, and a payment has to be able to move forward AND backward:
 *
 *   Pending  + succeeded → `Promote`  the payment becomes Captured, which is what books the cash
 *   Pending  + failed    → `Fail`     nothing was ever booked, so nothing needs reversing
 *   Captured + failed    → `Reverse`  the money left again; a REVERSING payment says so in the ledger
 *
 * WHY `Reverse` AND NOT AN UPDATE. A returned debit is not "the payment never happened" — it happened,
 * the ledger recorded it, a period may have closed over it. Editing the original would erase a true
 * fact about a past date. A reversing payment is the same answer the rest of this application already
 * gives (`ReversesPaymentHeaderID`, D53), and it leaves both facts standing.
 *
 * `None` covers the ordinary quiet cases — an event that changes nothing, a promotion that already
 * happened — and is a SUCCESS. A gateway that does not get a 2xx retries forever.
 */
export function DecideSettlement(input: {
    /** How the driver read the intent after this event. */
    EventStatus: IntentStatus | null | undefined;
    /** `PaymentHeader.Status`, or null when no payment was opened for this intent. */
    HeaderStatus: string | null | undefined;
    /** True when the header carries a `JournalEntryID` — the cash is in the ledger. */
    HeaderBooked: boolean;
    /** True when a reversing payment already points at this one. */
    AlreadyReversed: boolean;
}): SettlementDecision {
    const header = (input.HeaderStatus ?? '').trim();
    if (!header) {
        // NOT an error. An intent can exist without a payment — a checkout the customer abandoned, or
        // one whose payment has not been captured yet. There is simply nothing to settle.
        return { Action: 'None', Reason: 'the intent has no payment to settle' };
    }

    switch (input.EventStatus) {
        case 'Succeeded':
            if (header === 'Pending') {
                return { Action: 'Promote', Reason: 'the bank confirmed the debit, so the payment becomes Captured' };
            }
            if (header === 'Captured') {
                return { Action: 'None', Reason: 'the payment is already Captured' };
            }
            // Succeeded against Failed / Refunded / Disputed. A bank does not un-return a debit, so
            // this is either a gateway we have misread or an event arriving wildly out of order.
            return {
                Action: 'Hold',
                Reason: `the bank reported success against a payment that is ${header} — this needs a person`,
            };

        case 'Failed':
        case 'Canceled':
            if (header === 'Pending') {
                return { Action: 'Fail', Reason: 'the debit did not clear and nothing was booked' };
            }
            if (header === 'Captured') {
                if (input.AlreadyReversed) {
                    return { Action: 'None', Reason: 'this payment has already been reversed' };
                }
                if (!input.HeaderBooked) {
                    // Captured without a journal entry should be impossible — booking is part of the
                    // same transaction as the transition. If it happened, the two records disagree
                    // about whether cash exists, and guessing which is right is how the disagreement
                    // becomes permanent.
                    return {
                        Action: 'Hold',
                        Reason: 'the payment is Captured but carries no journal entry, so what to reverse is unclear',
                    };
                }
                return { Action: 'Reverse', Reason: 'the debit was returned after being booked, so the cash comes back out' };
            }
            if (header === 'Failed') {
                return { Action: 'None', Reason: 'the payment is already Failed' };
            }
            return {
                Action: 'Hold',
                Reason: `the bank reported a failure against a payment that is ${header} — this needs a person`,
            };

        // Processing / RequiresPayment / unknown. The gateway is telling us it is still working, which
        // is exactly the state a Pending payment already records.
        default:
            return { Action: 'None', Reason: `nothing to settle while the intent reads ${input.EventStatus ?? 'unknown'}` };
    }
}

/** What the save path knows about a payment that is asking to become `Captured`. */
export interface CaptureTimingFacts {
    /** The status the caller wrote. */
    RequestedStatus: string;
    /** The status already on disk, or undefined for a new payment. */
    PersistedStatus?: string | null;
    /** False for a payment being inserted. */
    IsSaved: boolean;
    /** False for a RECORDED payment — cheque, cash, wire — which has no gateway to wait for. */
    HasProvider: boolean;
    /** The driver's own declaration. See `BasePaymentProvider.SettlesAsynchronously`. */
    SettlesAsynchronously: boolean;
}

/**
 * Whether a payment asking to be `Captured` must be held at `Pending` because its rail settles on
 * somebody else's schedule.
 *
 * WHY THIS IS A FUNCTION AND NOT AN `IF` IN THE SAVE PATH. The rule used to live only in
 * `Orders.CapturePayment`, which made it a rule that ONE CALLER followed rather than one the system
 * enforced — a workflow, a UI form or a test builder writing `Status: 'Captured'` went straight past
 * it and booked `Dr Cash` for a bank debit that had not cleared. Balanced, posted, and undetectable
 * downstream. Stating it here means the entity server and the operation ask the same question of the
 * same code instead of both remembering.
 *
 * THE PROMOTION MUST PASS. When the webhook moves a `Pending` payment to `Captured`, that IS the
 * bank answering; holding it again would mean a bank debit could never book at all. The persisted
 * status is the signal — already `Pending` means promotion, anything else means a caller declaring
 * cash that has not moved.
 */
export function ShouldHoldForLateSettlement(facts: CaptureTimingFacts): boolean {
    if (facts.RequestedStatus !== 'Captured') return false;
    if (!facts.HasProvider) return false;
    if (!facts.SettlesAsynchronously) return false;
    // The webhook promoting a payment that was already waiting — let it book.
    if (facts.IsSaved && facts.PersistedStatus === 'Pending') return false;
    return true;
}
