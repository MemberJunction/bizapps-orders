/**
 * Unit tests for collecting by bank debit. No network, no database.
 *
 * THE WHOLE RAIL EXISTS BECAUSE OF ONE FACT: a bank debit can be TAKEN BACK after it has been booked
 * as received. Everything worth testing here follows from that.
 *
 *   THE DECISION TABLE — `DecideSettlement` is the only thing standing between a returned debit and
 *   cash that stays on the books for ever. Its interesting cases are not the happy ones: a failure
 *   against a payment that is already `Captured` must REVERSE rather than fail, a success against one
 *   already captured must do NOTHING rather than book twice, and a combination nobody anticipated must
 *   `Hold` rather than guess. A table that only ever gets fed the happy path passes while being wrong
 *   about every one of those.
 *
 *   THE FEE — 0.8% capped at $5 is a different shape from the card rate, and the cap is where it goes
 *   wrong: a driver that forgot it would over-report the fee on every invoice above $625, booking a
 *   fee leg that never existed and understating cash by the difference.
 *
 *   `Capture` AS A READ — the driver deliberately does NOT capture; it asks Stripe what happened and
 *   refuses unless the answer is `succeeded`. If that refusal ever silently became a success, every
 *   in-flight debit would book as cash on the day it was submitted.
 */
import { describe, it, expect } from 'vitest';
import { AchFeeEstimate, DecideSettlement, ShouldHoldForLateSettlement, type CaptureTimingFacts } from '../PaymentProviderBehavior.js';
import { StripeACHPaymentProvider } from '../StripeACHPaymentProvider.js';
import type { PaymentProviderConfig } from '../BasePaymentProvider.js';

const config = (over: Partial<PaymentProviderConfig> = {}): PaymentProviderConfig => ({
    ID: '11111111-1111-1111-1111-111111111111',
    TypeCode: 'StripeACH',
    CompanyID: '22222222-2222-2222-2222-222222222222',
    Name: 'Test bank-debit account',
    CredentialsRef: null,
    IsLiveMode: false,
    Capabilities: { SupportsTokenization: true, SupportsRefund: true, SupportsWebhooks: true },
    ...over,
});

const ach = (over: Partial<PaymentProviderConfig> = {}) => {
    const driver = new StripeACHPaymentProvider();
    driver.Config = config(over);
    driver.Credentials = {};
    return driver;
};

/**
 * A live driver whose HTTP call is replaced with a canned answer.
 *
 * `call` is protected precisely so a sibling rail can reuse it; reaching it from a test needs one cast,
 * which is cheaper than standing up a fake Stripe over `fetch` and asserting against our own mock.
 */
const liveAch = (body: Record<string, unknown>, ok = true) => {
    const driver = ach({ IsLiveMode: true });
    driver.Credentials = { ApiKey: 'sk_test_x' };
    (driver as unknown as { call: () => Promise<unknown> }).call = async () => ({ Ok: ok, Body: body, Reason: ok ? undefined : 'refused' });
    return driver;
};

const event = (payload: Record<string, unknown>) => JSON.stringify(payload);

// ─── Fee ───────────────────────────────────────────────────────────────────────────────────────

describe('the bank-debit fee', () => {
    it('is 0.8% below the cap', () => {
        expect(AchFeeEstimate(100)).toBe(0.8);
        expect(AchFeeEstimate(250)).toBe(2);
    });

    it('CAPS AT $5, which is where a card-shaped fee calculation goes wrong', () => {
        // The cap bites at $625. An invoice for $10,000 costs $5 to collect, not $80 — a driver that
        // dropped the cap would book a fee leg 16x too large and understate cash by the difference.
        expect(AchFeeEstimate(625)).toBe(5);
        expect(AchFeeEstimate(10_000)).toBe(5);
        expect(AchFeeEstimate(1_000_000)).toBe(5);
    });

    it('is zero for nothing, rather than a negative or NaN', () => {
        expect(AchFeeEstimate(0)).toBe(0);
        expect(AchFeeEstimate(Number.NaN)).toBe(0);
    });

    it('does not apply a USD cap to a currency it cannot convert', () => {
        // A $5 cap on a non-USD amount would be a conversion this module has no business inventing.
        expect(AchFeeEstimate(10_000, 'EUR')).toBe(80);
    });
});

// ─── The decision table ────────────────────────────────────────────────────────────────────────

describe('DecideSettlement — moving forward', () => {
    it('PROMOTES a pending payment when the bank confirms', () => {
        const d = DecideSettlement({
            EventStatus: 'Succeeded',
            HeaderStatus: 'Pending',
            HeaderBooked: false,
            AlreadyReversed: false,
        });
        expect(d.Action).toBe('Promote');
    });

    it('does NOTHING when the payment is already captured', () => {
        // The second delivery of a success. Booking again would double the cash.
        const d = DecideSettlement({
            EventStatus: 'Succeeded',
            HeaderStatus: 'Captured',
            HeaderBooked: true,
            AlreadyReversed: false,
        });
        expect(d.Action).toBe('None');
    });

    it('does nothing while the debit is still processing', () => {
        for (const status of ['Processing', 'RequiresPayment'] as const) {
            const d = DecideSettlement({
                EventStatus: status,
                HeaderStatus: 'Pending',
                HeaderBooked: false,
                AlreadyReversed: false,
            });
            expect(d.Action).toBe('None');
        }
    });
});

describe('DecideSettlement — moving backward, which is the point of the rail', () => {
    it('FAILS a pending payment, booking nothing', () => {
        const d = DecideSettlement({
            EventStatus: 'Failed',
            HeaderStatus: 'Pending',
            HeaderBooked: false,
            AlreadyReversed: false,
        });
        expect(d.Action).toBe('Fail');
    });

    it('REVERSES a captured payment — the return that arrives days later', () => {
        // THE case this rail exists for. Money appeared to arrive, the ledger recorded it, and then the
        // bank took it back. Failing the original instead would erase a true fact about a past date.
        const d = DecideSettlement({
            EventStatus: 'Failed',
            HeaderStatus: 'Captured',
            HeaderBooked: true,
            AlreadyReversed: false,
        });
        expect(d.Action).toBe('Reverse');
    });

    it('does not reverse the same payment twice', () => {
        const d = DecideSettlement({
            EventStatus: 'Failed',
            HeaderStatus: 'Captured',
            HeaderBooked: true,
            AlreadyReversed: true,
        });
        expect(d.Action).toBe('None');
    });

    it('treats a cancellation exactly as a failure', () => {
        expect(
            DecideSettlement({ EventStatus: 'Canceled', HeaderStatus: 'Pending', HeaderBooked: false, AlreadyReversed: false }).Action,
        ).toBe('Fail');
        expect(
            DecideSettlement({ EventStatus: 'Canceled', HeaderStatus: 'Captured', HeaderBooked: true, AlreadyReversed: false }).Action,
        ).toBe('Reverse');
    });
});

describe('DecideSettlement — refusing to guess', () => {
    it('does nothing at all when there is no payment behind the intent', () => {
        // An abandoned checkout. Not an error — there is simply nothing to settle.
        const d = DecideSettlement({
            EventStatus: 'Succeeded',
            HeaderStatus: null,
            HeaderBooked: false,
            AlreadyReversed: false,
        });
        expect(d.Action).toBe('None');
    });

    it('HOLDS a success reported against a refunded payment', () => {
        // A bank does not un-return a debit. Either we have misread the gateway or events are wildly
        // out of order, and both confident answers move real money on a reading we do not understand.
        const d = DecideSettlement({
            EventStatus: 'Succeeded',
            HeaderStatus: 'Refunded',
            HeaderBooked: true,
            AlreadyReversed: false,
        });
        expect(d.Action).toBe('Hold');
        expect(d.Reason).toMatch(/needs a person/);
    });

    it('HOLDS a captured payment that carries no journal entry', () => {
        // Should be impossible — booking is part of the same transaction as the transition. If it
        // happened, the two records disagree about whether cash exists and guessing makes it permanent.
        const d = DecideSettlement({
            EventStatus: 'Failed',
            HeaderStatus: 'Captured',
            HeaderBooked: false,
            AlreadyReversed: false,
        });
        expect(d.Action).toBe('Hold');
    });

    it('HOLDS a failure reported against a disputed payment', () => {
        const d = DecideSettlement({
            EventStatus: 'Failed',
            HeaderStatus: 'Disputed',
            HeaderBooked: true,
            AlreadyReversed: false,
        });
        expect(d.Action).toBe('Hold');
    });
});

// ─── The driver ────────────────────────────────────────────────────────────────────────────────

describe('StripeACHPaymentProvider — what it declares', () => {
    it('SETTLES ASYNCHRONOUSLY, which is what lets the webhook book cash', () => {
        // Without this the webhook never promotes anything and every debit sits Pending for ever.
        expect(ach().SettlesAsynchronously).toBe(true);
    });

    it('leaves the card driver settling synchronously', async () => {
        const { StripePaymentProvider } = await import('../StripePaymentProvider.js');
        const card = new StripePaymentProvider();
        card.Config = config({ TypeCode: 'Stripe' });
        expect(card.SettlesAsynchronously).toBe(false);
    });

    it('handles BOTH failure event names', () => {
        // Which one Stripe sends for a return after settlement is exactly the detail this code should
        // not be confident about. Handling both is safe because the decision keys off the PAYMENT.
        expect(ach().HandledEventKinds).toContain('charge.failed');
        expect(ach().HandledEventKinds).toContain('payment_intent.payment_failed');
    });

    it('handles the SUBMISSION event, so "waiting" is recorded rather than inferred from silence', () => {
        expect(ach().HandledEventKinds).toContain('payment_intent.processing');
    });
});

describe('StripeACHPaymentProvider — opening an intent', () => {
    it('opens the stub as PROCESSING, not waiting for an instrument', async () => {
        // A card intent waits at a checkout; a debit is already in flight. A stub reporting
        // RequiresPayment would exercise a state the real rail never passes through.
        const result = await ach().CreateIntent({ Amount: 100, CurrencyCode: 'USD' });
        expect(result.Success).toBe(true);
        expect(result.Status).toBe('Processing');
    });

    it('PINS the intent to the bank-debit rail', () => {
        // Left to `automatic_payment_methods`, the same code could open a card intent on one deployment
        // and a debit on another — different fee, different settlement, different reversal risk.
        const body: Record<string, string> = {};
        (ach() as unknown as { DecorateIntentBody(b: Record<string, string>, r: unknown): void }).DecorateIntentBody(body, {
            Amount: 100,
            CurrencyCode: 'USD',
        });
        expect(body['payment_method_types[0]']).toBe('us_bank_account');
    });

    it('still refuses a non-positive amount', async () => {
        expect((await ach().CreateIntent({ Amount: 0, CurrencyCode: 'USD' })).Success).toBe(false);
    });
});

describe('StripeACHPaymentProvider — Capture is a READ', () => {
    it('reports what actually moved when the bank cleared it', async () => {
        const driver = liveAch({ status: 'succeeded', currency: 'usd', amount_received: 25_000, latest_charge: 'ch_1' });
        const result = await driver.Capture({ ProviderIntentID: 'pi_1', CurrencyCode: 'USD' });
        expect(result.Success).toBe(true);
        expect(result.Amount).toBe(250);
        expect(result.ProviderChargeID).toBe('ch_1');
    });

    it('REFUSES while the debit is still processing, and says to wait', async () => {
        // The failure that matters most. If this ever became a success, every in-flight debit would
        // book as cash on the day it was submitted and the books would lead reality by four days.
        const driver = liveAch({ status: 'processing', currency: 'usd', amount: 25_000 });
        const result = await driver.Capture({ ProviderIntentID: 'pi_1', CurrencyCode: 'USD' });
        expect(result.Success).toBe(false);
        expect(result.Status).toBe('Processing');
        expect(result.Reason).toMatch(/has not cleared yet/);
    });

    it('REFUSES a debit that did not clear', async () => {
        const driver = liveAch({ status: 'requires_payment_method', currency: 'usd' });
        const result = await driver.Capture({ ProviderIntentID: 'pi_1', CurrencyCode: 'USD' });
        expect(result.Success).toBe(false);
        expect(result.Reason).toMatch(/no money moved/);
    });

    it('reports the bank-debit fee from the stub, not the card rate', async () => {
        // $1,000 costs $5 to collect by bank debit and $29.30 by card. A stub reporting the card rate
        // would make every integration check assert the wrong fee leg.
        const result = await ach().Capture({ ProviderIntentID: 'pi_stub', Amount: 1000, CurrencyCode: 'USD' });
        expect(result.FeeAmount).toBe(5);
    });
});

describe('StripeACHPaymentProvider — reading a return', () => {
    it('reads charge.failed as a FAILURE against its intent', async () => {
        const parsed = ach().ParseWebhookEvent(
            event({
                id: 'evt_1',
                type: 'charge.failed',
                data: {
                    object: {
                        id: 'ch_1',
                        payment_intent: 'pi_1',
                        currency: 'usd',
                        amount: 25_000,
                        failure_message: 'insufficient funds',
                    },
                },
            }),
        );
        expect(parsed?.Status).toBe('Failed');
        expect(parsed?.ProviderIntentID).toBe('pi_1');
        expect(parsed?.ProviderChargeID).toBe('ch_1');
        expect(parsed?.Amount).toBe(250);
    });

    it('carries the bank’s own words through to the reversal reason', async () => {
        // This ends up on the reversing payment, which is the only place anyone reconciling next month
        // will look for why the money went back out.
        const parsed = ach().ParseWebhookEvent(
            event({
                id: 'evt_1',
                type: 'charge.failed',
                data: { object: { id: 'ch_1', payment_intent: 'pi_1', currency: 'usd', failure_message: 'account closed' } },
            }),
        );
        expect(parsed?.FailureReason).toBe('account closed');
    });

    it('falls back to the failure CODE when there is no message', async () => {
        const parsed = ach().ParseWebhookEvent(
            event({
                id: 'evt_1',
                type: 'charge.failed',
                data: { object: { id: 'ch_1', payment_intent: 'pi_1', currency: 'usd', failure_code: 'R01' } },
            }),
        );
        expect(parsed?.FailureReason).toBe('R01');
    });

    it('leaves every other event to the card driver it inherits from', async () => {
        const parsed = ach().ParseWebhookEvent(
            event({
                id: 'evt_2',
                type: 'payment_intent.succeeded',
                // `status` on the OBJECT is what the base reads — the event's NAME is not the status.
                data: { object: { id: 'pi_2', status: 'succeeded', currency: 'usd', amount_received: 500 } },
            }),
        );
        expect(parsed?.Status).toBe('Succeeded');
        expect(parsed?.ProviderIntentID).toBe('pi_2');
    });

    it('returns null for something that is not JSON', () => {
        expect(ach().ParseWebhookEvent('not json at all')).toBeNull();
    });
});

describe('holding a capture for late settlement', () => {
    const facts = (over: Partial<CaptureTimingFacts> = {}): CaptureTimingFacts => ({
        RequestedStatus: 'Captured',
        PersistedStatus: undefined,
        IsSaved: false,
        HasProvider: true,
        SettlesAsynchronously: true,
        ...over,
    });

    it('holds a NEW payment on an asynchronously-settling rail', () => {
        // The whole point: whoever wrote `Captured`, the bank has not moved the money yet, and
        // booking Dr Cash now puts it in the ledger four days early.
        expect(ShouldHoldForLateSettlement(facts())).toBe(true);
    });

    it('lets the webhook promote a payment that was already Pending', () => {
        // This IS the bank answering. Holding it again would mean a bank debit could never book.
        expect(ShouldHoldForLateSettlement(facts({ IsSaved: true, PersistedStatus: 'Pending' }))).toBe(false);
    });

    it('does not hold a rail that settles immediately', () => {
        expect(ShouldHoldForLateSettlement(facts({ SettlesAsynchronously: false }))).toBe(false);
    });

    it('does not hold a RECORDED payment', () => {
        // A cheque or cash has no gateway to wait for — there is nothing settling late.
        expect(ShouldHoldForLateSettlement(facts({ HasProvider: false }))).toBe(false);
    });

    it('ignores any status other than Captured', () => {
        for (const status of ['Pending', 'Failed', 'Refunded', 'Disputed'])
            expect(ShouldHoldForLateSettlement(facts({ RequestedStatus: status }))).toBe(false);
    });

    it('holds a payment arriving at Captured from a state that is NOT Pending', () => {
        // Only Pending → Captured is the promotion. Anything else reaching Captured on a late rail is
        // a caller declaring cash that has not moved, whatever it was before.
        expect(ShouldHoldForLateSettlement(facts({ IsSaved: true, PersistedStatus: 'Failed' }))).toBe(true);
    });
});
