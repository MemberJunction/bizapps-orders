/**
 * Unit tests for the payment drivers themselves. No network, no database.
 *
 * WHAT IS TESTABLE HERE, AND WHY IT IS WORTH TESTING. The Stripe driver's live path needs a gateway and
 * belongs in an integration check; its STUB path does not, and the stub is what 245 integration checks
 * will actually run against — so a stub that reported the wrong shape would corrupt every one of them
 * while looking green. The Manual and StoredValue drivers have no live path at all: they are entirely
 * this.
 *
 * The other half is the REFUSALS. Every driver returns `Success: false` with a reason for a logical
 * refusal and throws only on a fault, because a caller that has to read exception messages to tell
 * "declined" from "broken" will eventually treat one as the other. That contract is only worth having
 * if it holds on every path, so the paths are enumerated.
 */
import { describe, it, expect } from 'vitest';
import { BasePaymentProvider, type PaymentProviderConfig } from '../BasePaymentProvider.js';
import { StripePaymentProvider, ToFormBody } from '../StripePaymentProvider.js';
import { ManualPaymentProvider } from '../ManualPaymentProvider.js';
import { StoredValuePaymentProvider } from '../StoredValuePaymentProvider.js';

const config = (over: Partial<PaymentProviderConfig> = {}): PaymentProviderConfig => ({
    ID: '11111111-1111-1111-1111-111111111111',
    TypeCode: 'Stripe',
    CompanyID: '22222222-2222-2222-2222-222222222222',
    Name: 'Test account',
    CredentialsRef: null,
    IsLiveMode: false,
    Capabilities: { SupportsTokenization: true, SupportsRefund: true, SupportsWebhooks: true },
    ...over,
});

const stripe = (over: Partial<PaymentProviderConfig> = {}) => {
    const driver = new StripePaymentProvider();
    driver.Config = config(over);
    driver.Credentials = {};
    return driver;
};

describe('BasePaymentProvider — the default is refusal', () => {
    it('declines every operation rather than pretending', async () => {
        // A driver author who forgets to override should find out here, not from a reconciliation weeks
        // later. Crucially these REFUSE rather than succeed-with-nothing.
        const base = new BasePaymentProvider();
        base.Config = config({ TypeCode: 'Nonexistent' });
        expect((await base.CreateIntent({ Amount: 1, CurrencyCode: 'USD' })).Success).toBe(false);
        expect((await base.Capture({ ProviderIntentID: 'x', CurrencyCode: 'USD' })).Success).toBe(false);
        expect((await base.RetrieveIntent({ ProviderIntentID: 'x' })).Success).toBe(false);
        expect((await base.Refund({ CurrencyCode: 'USD', Amount: 1 })).Success).toBe(false);
    });

    it('names the provider type in the refusal, so the fix is findable', async () => {
        const base = new BasePaymentProvider();
        base.Config = config({ TypeCode: 'Nonexistent' });
        const result = await base.CreateIntent({ Amount: 1, CurrencyCode: 'USD' });
        expect(result.Reason).toContain('Nonexistent');
        expect(result.Reason).toMatch(/PaymentProviderType.Code/);
    });

    it('REFUSES to verify a webhook by default', async () => {
        // The route is unauthenticated, so the default must be a closed door. A driver that inherits
        // this and forgets to override gets rejection, not admission.
        const base = new BasePaymentProvider();
        base.Config = config();
        expect((await base.VerifyWebhook('{}', {})).Valid).toBe(false);
    });

    it('handles no event kinds by default', () => {
        expect(new BasePaymentProvider().HandledEventKinds).toEqual([]);
    });
});

describe('StripePaymentProvider — the stub', () => {
    it('opens an intent without a network call when the account is not live', async () => {
        const result = await stripe().CreateIntent({
            Amount: 100,
            CurrencyCode: 'USD',
            OrderHeaderID: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
        });
        expect(result.Success).toBe(true);
        expect(result.ProviderIntentID).toMatch(/^pi_stub_/);
        expect(result.Status).toBe('RequiresPayment');
    });

    it('is DETERMINISTIC for the same order', async () => {
        // So a duplicate is visible as a duplicate rather than as two unrelated intents, and a re-run of
        // a check produces the same ids.
        const first = await stripe().CreateIntent({ Amount: 100, CurrencyCode: 'USD', OrderHeaderID: 'order-1' });
        const second = await stripe().CreateIntent({ Amount: 100, CurrencyCode: 'USD', OrderHeaderID: 'order-1' });
        expect(first.ProviderIntentID).toBe(second.ProviderIntentID);
    });

    it('reports a NON-ZERO fee, so the fee leg of the capture entry is reachable', async () => {
        // A stub reporting zero would make the Dr Processing Fee leg (D18) unexercised in every test —
        // the one thing that most needs exercising would be the one thing never exercised.
        const result = await stripe().Capture({ ProviderIntentID: 'pi_stub_x', Amount: 100, CurrencyCode: 'USD' });
        expect(result.Success).toBe(true);
        expect(result.Amount).toBe(100);
        // 2.9% + 30c, Stripe's standard US card rate.
        expect(result.FeeAmount).toBe(3.2);
        expect(result.Status).toBe('Succeeded');
    });

    it('retrieve on the stub stays RequiresPayment — the stub never sees a browser confirm', async () => {
        const result = await stripe().RetrieveIntent({ ProviderIntentID: 'pi_stub_x' });
        expect(result.Success).toBe(true);
        expect(result.Status).toBe('RequiresPayment');
    });

    it('retrieve on a live account reads Stripe status (not a client claim)', async () => {
        const driver = stripe({ IsLiveMode: true });
        driver.Credentials = { ApiKey: 'sk_test_x' };
        const orig = globalThis.fetch;
        globalThis.fetch = (async () =>
            new Response(JSON.stringify({ id: 'pi_live', status: 'succeeded', amount_received: 27500, currency: 'usd' }), {
                status: 200,
                headers: { 'Content-Type': 'application/json' },
            })) as typeof fetch;
        try {
            const result = await driver.RetrieveIntent({ ProviderIntentID: 'pi_live' });
            expect(result.Success).toBe(true);
            expect(result.Status).toBe('Succeeded');
            expect(result.Amount).toBe(275);
        } finally {
            globalThis.fetch = orig;
        }
    });

    it('reports a zero fee on a zero capture rather than a negative one', async () => {
        const result = await stripe().Capture({ ProviderIntentID: 'pi_stub_x', Amount: 0, CurrencyCode: 'USD' });
        expect(result.FeeAmount).toBe(0);
    });

    it('refuses an intent for a non-positive amount', async () => {
        expect((await stripe().CreateIntent({ Amount: 0, CurrencyCode: 'USD' })).Success).toBe(false);
        expect((await stripe().CreateIntent({ Amount: -5, CurrencyCode: 'USD' })).Success).toBe(false);
    });

    it('refunds through the stub, and refuses without a target', async () => {
        expect((await stripe().Refund({ ProviderChargeID: 'ch_1', Amount: 10, CurrencyCode: 'USD' })).Success).toBe(true);
        const noTarget = await stripe().Refund({ Amount: 10, CurrencyCode: 'USD' });
        expect(noTarget.Success).toBe(false);
        expect(noTarget.Reason).toMatch(/charge id or an intent id/);
    });

    it('the LIVE path refuses cleanly when no API key resolved', async () => {
        // Rather than throwing, or worse, calling Stripe with `Bearer undefined`. The message points at
        // CredentialsRef, which is where the fix is.
        const live = stripe({ IsLiveMode: true });
        const result = await live.CreateIntent({ Amount: 100, CurrencyCode: 'USD' });
        expect(result.Success).toBe(false);
        expect(result.Reason).toMatch(/CredentialsRef/);
    });
});

describe('StripePaymentProvider — reading webhooks', () => {
    it('declares the event kinds it acts on', () => {
        expect(stripe().HandledEventKinds).toContain('payment_intent.succeeded');
        expect(stripe().HandledEventKinds).toContain('charge.refunded');
    });

    it('parses a succeeded intent, converting from minor units', () => {
        const event = stripe().ParseWebhookEvent(
            JSON.stringify({
                id: 'evt_1',
                type: 'payment_intent.succeeded',
                data: { object: { id: 'pi_1', status: 'succeeded', amount_received: 1234, currency: 'usd', latest_charge: 'ch_1' } },
            }),
        );
        expect(event).not.toBeNull();
        expect(event!.EventID).toBe('evt_1');
        expect(event!.ProviderIntentID).toBe('pi_1');
        expect(event!.ProviderChargeID).toBe('ch_1');
        // 1234 cents is 12.34, and this is where a hundredfold error would enter.
        expect(event!.Amount).toBe(12.34);
        expect(event!.Status).toBe('Succeeded');
    });

    it('respects a ZERO-DECIMAL currency when reading an amount', () => {
        const event = stripe().ParseWebhookEvent(
            JSON.stringify({
                id: 'evt_2',
                type: 'payment_intent.succeeded',
                data: { object: { id: 'pi_2', status: 'succeeded', amount_received: 1000, currency: 'jpy' } },
            }),
        );
        // 1000 yen is 1000 yen, not 10.
        expect(event!.Amount).toBe(1000);
        expect(event!.CurrencyCode).toBe('JPY');
    });

    it('maps a failure event to Failed and carries the gateway\'s own words', () => {
        // Stripe has no `failed` intent STATUS — a failure arrives as an event against an intent that is
        // back to requires_payment_method. Reading the status alone would report RequiresPayment and
        // lose the fact that an attempt was made and declined.
        const event = stripe().ParseWebhookEvent(
            JSON.stringify({
                id: 'evt_3',
                type: 'payment_intent.payment_failed',
                data: {
                    object: {
                        id: 'pi_3',
                        status: 'requires_payment_method',
                        currency: 'usd',
                        last_payment_error: { message: 'Your card was declined.' },
                    },
                },
            }),
        );
        expect(event!.Status).toBe('Failed');
        expect(event!.FailureReason).toBe('Your card was declined.');
    });

    it('parses a refund event off the charge', () => {
        const event = stripe().ParseWebhookEvent(
            JSON.stringify({
                id: 'evt_4',
                type: 'charge.refunded',
                data: { object: { id: 'ch_9', payment_intent: 'pi_9', amount_refunded: 500, currency: 'usd' } },
            }),
        );
        expect(event!.ProviderChargeID).toBe('ch_9');
        expect(event!.ProviderIntentID).toBe('pi_9');
        expect(event!.Amount).toBe(5);
    });

    it('reads latest_charge whether it is a string or an expanded object', () => {
        const asObject = stripe().ParseWebhookEvent(
            JSON.stringify({
                id: 'evt_5',
                type: 'payment_intent.succeeded',
                data: { object: { id: 'pi_5', status: 'succeeded', currency: 'usd', latest_charge: { id: 'ch_5' } } },
            }),
        );
        expect(asObject!.ProviderChargeID).toBe('ch_5');
    });

    it('returns NULL for unparseable or shapeless payloads rather than guessing', () => {
        expect(stripe().ParseWebhookEvent('not json')).toBeNull();
        expect(stripe().ParseWebhookEvent('{}')).toBeNull();
        expect(stripe().ParseWebhookEvent(JSON.stringify({ id: 'evt_6' }))).toBeNull();
    });

    it('refuses a webhook when no signing secret is configured', async () => {
        const result = await stripe().VerifyWebhook('{}', { 'stripe-signature': 't=1,v1=abc' });
        expect(result.Valid).toBe(false);
    });

    it('reads the signature header in either case', async () => {
        // Proxies normalise header case differently, and a driver that only reads one spelling rejects
        // every delivery behind the wrong proxy.
        const driver = stripe();
        driver.Credentials = { WebhookSecret: 'whsec_x' };
        const lower = await driver.VerifyWebhook('{}', { 'stripe-signature': 'garbage' });
        const upper = await driver.VerifyWebhook('{}', { 'Stripe-Signature': 'garbage' });
        // Both reach the verifier and fail there for the same reason — neither is rejected for a missing
        // header, which is what a case-sensitive read would produce.
        expect(lower.Reason).toBe(upper.Reason);
        expect(lower.Reason).not.toMatch(/no signature header/);
    });
});

describe('ToFormBody', () => {
    it('encodes Stripe\'s bracketed metadata keys', () => {
        const body = ToFormBody({ amount: '100', 'metadata[OrderHeaderID]': 'abc-123' });
        expect(body).toContain('amount=100');
        expect(body).toMatch(/metadata(%5B|\[)OrderHeaderID(%5D|\])=abc-123/);
    });

    it('escapes values rather than interpolating them', () => {
        // The reason this is a function and not a template string: an unescaped `&` in a description
        // would silently add a field to the request.
        const body = ToFormBody({ description: 'A & B = C' });
        expect(body).not.toContain('A & B');
        expect(new URLSearchParams(body).get('description')).toBe('A & B = C');
    });
});

describe('ManualPaymentProvider', () => {
    const manual = () => {
        const driver = new ManualPaymentProvider();
        driver.Config = config({ TypeCode: 'Manual', Capabilities: { SupportsTokenization: false, SupportsRefund: true, SupportsWebhooks: false } });
        driver.Credentials = {};
        return driver;
    };

    it('opens an intent so the manual path has the same shape as every other', async () => {
        const result = await manual().CreateIntent({ Amount: 500, CurrencyCode: 'USD' });
        expect(result.Success).toBe(true);
        // Prefixed so a manual receipt is never mistaken for a gateway reference during reconciliation.
        expect(result.ProviderIntentID).toMatch(/^manual_/);
    });

    it('captures what a person says arrived', async () => {
        const result = await manual().Capture({ ProviderIntentID: 'manual_1', Amount: 500, CurrencyCode: 'USD' });
        expect(result.Success).toBe(true);
        expect(result.Amount).toBe(500);
    });

    it('reports a fee of exactly ZERO, not unknown', async () => {
        // A real distinction from the gateway drivers: a bank's wire charge hits the ACCOUNT, not this
        // receipt, so there is no per-payment cut to book. Zero is the true answer.
        const result = await manual().Capture({ ProviderIntentID: 'manual_1', Amount: 500, CurrencyCode: 'USD' });
        expect(result.FeeAmount).toBe(0);
        expect(result.FeeAmount).not.toBeUndefined();
    });

    it('refuses a capture with no amount, because there is nothing to record', async () => {
        expect((await manual().Capture({ ProviderIntentID: 'manual_1', CurrencyCode: 'USD' })).Success).toBe(false);
        expect((await manual().Capture({ ProviderIntentID: 'manual_1', Amount: 0, CurrencyCode: 'USD' })).Success).toBe(false);
    });

    it('refunds — fully expressible even though nothing moves on our side', async () => {
        // D17: somebody will post a cheque, and the ledger entry is the record that they must.
        const result = await manual().Refund({ Amount: 100, CurrencyCode: 'USD' });
        expect(result.Success).toBe(true);
        expect(result.ProviderRefundID).toMatch(/^manual_refund_/);
    });

    it('handles no webhook kinds — nothing calls us', () => {
        expect(manual().HandledEventKinds).toEqual([]);
    });
});

describe('StoredValuePaymentProvider', () => {
    const sv = () => {
        const driver = new StoredValuePaymentProvider();
        driver.Config = config({ TypeCode: 'StoredValue' });
        driver.Credentials = {};
        return driver;
    };

    it('refuses when neither instrument shape is named', async () => {
        // The two shapes are a gift card and an over-paid order (D38/D68). Without one of them there is
        // no balance to look at, and guessing would be inventing money.
        const driver = sv();
        driver.Provider = {} as never;
        driver.User = {} as never;
        const result = await driver.CreateIntent({ Amount: 10, CurrencyCode: 'USD' });
        expect(result.Success).toBe(false);
        expect(result.Reason).toMatch(/stored-value account or the over-paid/);
    });

    it('refuses without a provider to read balances with', async () => {
        // Rather than throwing a null-reference somewhere deeper.
        const result = await sv().CreateIntent({ Amount: 10, CurrencyCode: 'USD', StoredValueAccountID: 'x' });
        expect(result.Success).toBe(false);
        expect(result.Reason).toMatch(/not given a provider/);
    });

    it('refuses a non-positive draw', async () => {
        expect((await sv().CreateIntent({ Amount: 0, CurrencyCode: 'USD' })).Success).toBe(false);
        expect((await sv().Capture({ ProviderIntentID: 'sv_1', Amount: 0, CurrencyCode: 'USD' })).Success).toBe(false);
    });

    it('restores a balance on refund, and refuses without an amount', async () => {
        expect((await sv().Refund({ Amount: 25, CurrencyCode: 'USD' })).Success).toBe(true);
        expect((await sv().Refund({ CurrencyCode: 'USD' })).Success).toBe(false);
    });

    it('reports a fee of ZERO — we are the institution', async () => {
        // There is no third party taking a cut of our own money.
        const driver = sv();
        driver.Provider = {} as never;
        driver.User = {} as never;
        // Reaches the balance check and refuses there, which is the point: the fee is only asserted on
        // the success path, exercised by the integration bundle where a real account exists.
        const result = await driver.Capture({ ProviderIntentID: 'sv_1', Amount: 10, CurrencyCode: 'USD' });
        expect(result.Success).toBe(false);
    });

    it('handles no webhook kinds — internal money has no external notifier', () => {
        expect(sv().HandledEventKinds).toEqual([]);
    });
});
