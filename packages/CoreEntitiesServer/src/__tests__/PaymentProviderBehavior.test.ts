/**
 * Unit tests for the payment-gateway edge. No network, no database.
 *
 * These cover the three things that go wrong SILENTLY when talking to a gateway, which is why they were
 * put in a pure module in the first place:
 *
 *   MINOR UNITS — a factor-of-100 error produces a plausible amount at both ends. Charging 12 cents for
 *   a $12 order and charging $1,234 for a $12.34 one both look like money, and neither trips a balance
 *   check. The zero-decimal currencies are the trap: JPY has no minor unit, so the reflexive `× 100`
 *   overcharges by a hundredfold.
 *
 *   SIGNATURES — the webhook route is unauthenticated by necessity (D19), so the signature IS the
 *   authentication. A verifier that accepts everything passes every test that only feeds it valid input,
 *   which is why most of the cases below are deliberately INVALID.
 *
 *   IDEMPOTENCY — gateways retry on success too. Anything other than a 2xx comes back, so "already
 *   applied" has to be a success rather than an error, or a duplicate retries forever.
 */
import { describe, it, expect } from 'vitest';
import {
    CurrencyExponent,
    DecideWebhookAction,
    FromMinorUnits,
    HmacSha256Hex,
    MapStripeIntentStatus,
    SignaturesMatch,
    SplitCapturedAmount,
    ToMinorUnits,
    VerifyWebhookSignature,
} from '../PaymentProviderBehavior.js';

describe('minor units', () => {
    it('turns ordinary money into cents', () => {
        expect(ToMinorUnits(12.34, 'USD')).toBe(1234);
        expect(ToMinorUnits(0.01, 'USD')).toBe(1);
        expect(ToMinorUnits(1000, 'USD')).toBe(100000);
    });

    it('leaves a ZERO-DECIMAL currency alone', () => {
        // The trap. 1000 yen is 1000, not 100000 — sending the latter charges a hundred times over.
        expect(CurrencyExponent('JPY')).toBe(0);
        expect(ToMinorUnits(1000, 'JPY')).toBe(1000);
        expect(FromMinorUnits(1000, 'JPY')).toBe(1000);
    });

    it('handles a THREE-decimal currency', () => {
        // Kuwaiti dinar is thousandths. Treating it as ordinary is a factor of ten.
        expect(CurrencyExponent('KWD')).toBe(3);
        expect(ToMinorUnits(1.234, 'KWD')).toBe(1234);
    });

    it('is case-insensitive about the currency code', () => {
        expect(ToMinorUnits(1000, 'jpy')).toBe(ToMinorUnits(1000, 'JPY'));
    });

    it('rounds the SCALED value, not the amount', () => {
        // `Math.round(12.345) * 100` is 1200; the correct answer is 1235. Both look like money.
        expect(ToMinorUnits(12.345, 'USD')).toBe(1235);
    });

    it('rounds a binary-floating-point edge the way money should', () => {
        // 1.005 * 100 is 100.49999999999999 in IEEE 754, so a naive round gives 100.
        expect(ToMinorUnits(1.005, 'USD')).toBe(101);
    });

    it('round-trips', () => {
        for (const amount of [0.01, 0.99, 12.34, 999.99, 1000000]) {
            expect(FromMinorUnits(ToMinorUnits(amount, 'USD'), 'USD')).toBe(amount);
        }
    });

    it('handles a negative amount without inverting the rounding', () => {
        expect(ToMinorUnits(-12.34, 'USD')).toBe(-1234);
    });

    it('THROWS rather than sending NaN to a gateway', () => {
        // Some gateways read a non-numeric amount as zero, which succeeds and collects nothing.
        expect(() => ToMinorUnits(Number.NaN, 'USD')).toThrow(/not a finite amount/);
        expect(() => ToMinorUnits(Number.POSITIVE_INFINITY, 'USD')).toThrow(/not a finite amount/);
        expect(() => FromMinorUnits(Number.NaN, 'USD')).toThrow(/not a finite amount/);
    });

    it('defaults an unknown currency to two decimals rather than throwing', () => {
        // A currency this list has not heard of is far more likely to be ordinary than not, and refusing
        // the payment outright would be worse than the small risk of being wrong.
        expect(CurrencyExponent('ZZZ')).toBe(2);
    });
});

describe('webhook signatures', () => {
    const secret = 'whsec_test_secret';
    const body = '{"id":"evt_1","type":"payment_intent.succeeded"}';
    const now = 1_700_000_000;

    const sign = async (payload: string, at: number, withSecret = secret) =>
        `t=${at},v1=${await HmacSha256Hex(withSecret, `${at}.${payload}`)}`;

    it('accepts a correctly signed payload', async () => {
        const header = await sign(body, now);
        expect((await VerifyWebhookSignature(body, header, secret, { NowSeconds: now })).Valid).toBe(true);
    });

    it('REJECTS a tampered payload', async () => {
        const header = await sign(body, now);
        const tampered = body.replace('succeeded', 'payment_failed');
        const result = await VerifyWebhookSignature(tampered, header, secret, { NowSeconds: now });
        expect(result.Valid).toBe(false);
        expect(result.Reason).toMatch(/no provided signature matched/);
    });

    it('REJECTS a signature made with the wrong secret', async () => {
        const header = await sign(body, now, 'whsec_someone_elses_secret');
        expect((await VerifyWebhookSignature(body, header, secret, { NowSeconds: now })).Valid).toBe(false);
    });

    it('REJECTS a missing secret rather than skipping verification', async () => {
        // "Nothing configured, so accept everything" turns a misconfiguration into a public endpoint
        // that marks orders paid.
        const header = await sign(body, now);
        const result = await VerifyWebhookSignature(body, header, undefined, { NowSeconds: now });
        expect(result.Valid).toBe(false);
        expect(result.Reason).toMatch(/no endpoint secret/);
    });

    it('REJECTS a missing or malformed header', async () => {
        expect((await VerifyWebhookSignature(body, null, secret)).Valid).toBe(false);
        expect((await VerifyWebhookSignature(body, 'garbage', secret)).Valid).toBe(false);
        expect((await VerifyWebhookSignature(body, 't=abc,v1=def', secret)).Valid).toBe(false);
        expect((await VerifyWebhookSignature(body, `t=${now}`, secret, { NowSeconds: now })).Reason)
            .toMatch(/no v1 signature/);
    });

    it('REJECTS a replayed payload once it is outside the tolerance', async () => {
        // Without a timestamp window a captured payload stays valid forever.
        const header = await sign(body, now);
        const result = await VerifyWebhookSignature(body, header, secret, { NowSeconds: now + 3600 });
        expect(result.Valid).toBe(false);
        expect(result.Reason).toMatch(/outside the 300s tolerance/);
    });

    it('accepts one inside the tolerance, in either direction', async () => {
        const header = await sign(body, now);
        expect((await VerifyWebhookSignature(body, header, secret, { NowSeconds: now + 120 })).Valid).toBe(true);
        // Clock skew runs both ways; a slightly-future timestamp is not an attack.
        expect((await VerifyWebhookSignature(body, header, secret, { NowSeconds: now - 120 })).Valid).toBe(true);
    });

    it('accepts ANY of several v1 signatures, for a secret rotation', async () => {
        // Stripe sends one per active secret mid-rotation. A verifier reading only the first breaks
        // halfway through a rotation, which is the worst possible moment to break.
        const mine = await HmacSha256Hex(secret, `${now}.${body}`);
        const theirs = await HmacSha256Hex('whsec_old', `${now}.${body}`);
        expect((await VerifyWebhookSignature(body, `t=${now},v1=${theirs},v1=${mine}`, secret, { NowSeconds: now })).Valid)
            .toBe(true);
        expect((await VerifyWebhookSignature(body, `t=${now},v1=${mine},v1=${theirs}`, secret, { NowSeconds: now })).Valid)
            .toBe(true);
    });

    it('tolerates whitespace in the header', async () => {
        const mac = await HmacSha256Hex(secret, `${now}.${body}`);
        expect((await VerifyWebhookSignature(body, ` t=${now} , v1=${mac} `, secret, { NowSeconds: now })).Valid)
            .toBe(true);
    });

    it('verifies against the EXACT bytes, so a JSON round-trip fails', async () => {
        // The reason the route must capture the raw body. Re-stringifying reorders nothing here, yet
        // still changes whitespace — and that is enough.
        const header = await sign(body, now);
        const reencoded = JSON.stringify(JSON.parse(body), null, 2);
        expect((await VerifyWebhookSignature(reencoded, header, secret, { NowSeconds: now })).Valid).toBe(false);
    });
});

describe('SignaturesMatch', () => {
    it('matches identical strings and rejects differing ones', () => {
        expect(SignaturesMatch('abc123', 'abc123')).toBe(true);
        expect(SignaturesMatch('abc123', 'abc124')).toBe(false);
    });

    it('rejects a length mismatch without throwing', () => {
        expect(SignaturesMatch('abc', 'abcdef')).toBe(false);
        expect(SignaturesMatch('', 'a')).toBe(false);
    });

    it('does not short-circuit on the first differing character', () => {
        // Not directly observable, so this asserts the OUTCOME the loop guarantees: a difference
        // anywhere is caught, whether it is at the front or the back.
        expect(SignaturesMatch('zzzzzzzz', 'azzzzzzz')).toBe(false);
        expect(SignaturesMatch('zzzzzzzz', 'zzzzzzza')).toBe(false);
    });
});

describe('MapStripeIntentStatus', () => {
    it('maps the statuses we act on', () => {
        expect(MapStripeIntentStatus('succeeded')).toBe('Succeeded');
        expect(MapStripeIntentStatus('processing')).toBe('Processing');
        expect(MapStripeIntentStatus('canceled')).toBe('Canceled');
        expect(MapStripeIntentStatus('requires_payment_method')).toBe('RequiresPayment');
        expect(MapStripeIntentStatus('requires_action')).toBe('RequiresPayment');
    });

    it('accepts both spellings of cancelled', () => {
        expect(MapStripeIntentStatus('cancelled')).toBe('Canceled');
    });

    it('maps an UNKNOWN status to Processing, not to Succeeded or Failed', () => {
        // Both confident answers are dangerous: Succeeded books cash that may not exist, Failed abandons
        // a payment that may be fine. "Something is happening and we do not know what" is the honest
        // reading, and it leaves the payment for a later event to resolve.
        expect(MapStripeIntentStatus('some_new_stripe_status')).toBe('Processing');
        expect(MapStripeIntentStatus(null)).toBe('Processing');
        expect(MapStripeIntentStatus(undefined)).toBe('Processing');
        expect(MapStripeIntentStatus('')).toBe('Processing');
    });
});

describe('DecideWebhookAction', () => {
    const base = {
        EventID: 'evt_1',
        EventKind: 'payment_intent.succeeded',
        AlreadySeen: false,
        HandledKinds: ['payment_intent.succeeded'] as const,
        IntentKnown: true,
    };

    it('applies a new, actionable event', () => {
        expect(DecideWebhookAction(base).Action).toBe('Apply');
    });

    it('reports a duplicate as ALREADY APPLIED, which is a success', () => {
        // Not an error. A gateway that does not receive a 2xx retries — forever, for a duplicate.
        expect(DecideWebhookAction({ ...base, AlreadySeen: true }).Action).toBe('AlreadyApplied');
    });

    it('IGNORES an event kind we do not act on', () => {
        // Gateways send far more than any integration consumes. Treating the rest as errors fills a
        // dashboard with red for events we were never going to read.
        expect(DecideWebhookAction({ ...base, EventKind: 'invoice.created' }).Action).toBe('Ignore');
    });

    it('IGNORES an intent we did not create', () => {
        // A gateway account may serve more than one application. Rejecting someone else's traffic means
        // retries forever for a payment that is not ours.
        expect(DecideWebhookAction({ ...base, IntentKnown: false }).Action).toBe('Ignore');
    });

    it('REJECTS an event with no id, because it cannot be de-duplicated', () => {
        expect(DecideWebhookAction({ ...base, EventID: null }).Action).toBe('Reject');
    });

    it('checks the duplicate BEFORE the kind', () => {
        // An event already applied stays applied even if the handled list has since changed — otherwise
        // narrowing the list would make old events re-processable.
        expect(DecideWebhookAction({ ...base, AlreadySeen: true, EventKind: 'invoice.created' }).Action)
            .toBe('AlreadyApplied');
    });
});

describe('SplitCapturedAmount', () => {
    it('derives net by subtraction so the three reconcile', () => {
        const split = SplitCapturedAmount(100, 3.2);
        expect(split).toEqual({ Gross: 100, Fee: 3.2, Net: 96.8 });
        expect(split.Net + split.Fee).toBe(split.Gross);
    });

    it('treats a zero fee as a zero fee', () => {
        expect(SplitCapturedAmount(50, 0)).toEqual({ Gross: 50, Fee: 0, Net: 50 });
    });

    it('reads the fee by magnitude — some gateways report it negative', () => {
        expect(SplitCapturedAmount(100, -3.2).Fee).toBe(3.2);
    });

    it('reconciles TO THE PENNY on amounts that need rounding', () => {
        // 2.9% + 30c on 33.33. All three come back exact at 2dp — but their SUM in JavaScript does not:
        // 32.06 + 1.27 is 33.330000000000005. That is the hazard, not a defect in the split, and it is
        // the same one that made a balanced journal entry fail an exact-equality check in accounting.
        // A caller reconciling these must round the sum, so that is what this asserts.
        const split = SplitCapturedAmount(33.33, 33.33 * 0.029 + 0.3);
        expect(split.Fee).toBe(1.27);
        expect(split.Net).toBe(32.06);
        expect(Math.round((split.Net + split.Fee) * 100) / 100).toBe(split.Gross);
        // And the raw sum is deliberately NOT equal, which is why the rounding above is not decoration.
        expect(split.Net + split.Fee).not.toBe(split.Gross);
    });

    it('THROWS when the fee exceeds the capture', () => {
        // Booking it would credit receivables less than cash and fee together, and the entry would not
        // balance — a failure that surfaces far from its cause.
        expect(() => SplitCapturedAmount(10, 20)).toThrow(/cannot exceed/);
    });
});
