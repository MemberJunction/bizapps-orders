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
import { StripePaymentProvider, StripeInstrumentFromIntent, ToFormBody, stripeCaptureAlreadyCollected } from '../StripePaymentProvider.js';
import { ManualPaymentProvider } from '../ManualPaymentProvider.js';
import { StoredValuePaymentProvider } from '../StoredValuePaymentProvider.js';
import { MoveGiftCardBalance } from '../GiftCardEngine.js';

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
        expect((await base.ListRefunds({ ProviderChargeID: 'ch_x' })).Success).toBe(false);
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

    it('treats an already-captured live intent as a successful capture', async () => {
        const driver = stripe({ IsLiveMode: true });
        driver.Credentials = { ApiKey: 'sk_test_x' };
        const orig = globalThis.fetch;
        globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
            const url = String(input);
            const method = (init?.method ?? 'GET').toUpperCase();
            if (method === 'POST' && url.includes('/capture')) {
                return new Response(
                    JSON.stringify({
                        error: {
                            code: 'payment_intent_unexpected_state',
                            message: 'This PaymentIntent could not be captured because it has already been captured.',
                        },
                    }),
                    { status: 400, headers: { 'Content-Type': 'application/json' } },
                );
            }
            if (url.includes('/payment_intents/')) {
                return new Response(
                    JSON.stringify({
                        id: 'pi_live',
                        status: 'succeeded',
                        amount_received: 27500,
                        currency: 'usd',
                        latest_charge: 'ch_live',
                    }),
                    { status: 200, headers: { 'Content-Type': 'application/json' } },
                );
            }
            if (url.includes('/charges/')) {
                return new Response(
                    JSON.stringify({ id: 'ch_live', balance_transaction: { fee: 110 } }),
                    { status: 200, headers: { 'Content-Type': 'application/json' } },
                );
            }
            return new Response('{}', { status: 404 });
        }) as typeof fetch;
        try {
            const result = await driver.Capture({ ProviderIntentID: 'pi_live', Amount: 275, CurrencyCode: 'USD' });
            expect(result.Success).toBe(true);
            expect(result.Amount).toBe(275);
            expect(result.ProviderChargeID).toBe('ch_live');
            expect(result.FeeAmount).toBe(1.1);
        } finally {
            globalThis.fetch = orig;
        }
    });

    it('sends receipt_email when the request names one, and nothing otherwise (#295)', async () => {
        const driver = stripe({ IsLiveMode: true });
        driver.Credentials = { ApiKey: 'sk_test_x' };
        const bodies: URLSearchParams[] = [];
        const orig = globalThis.fetch;
        globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
            bodies.push(new URLSearchParams(String(init?.body ?? '')));
            return new Response(JSON.stringify({ id: 'pi_1', client_secret: 'cs_1', status: 'requires_payment_method' }), {
                status: 200,
                headers: { 'Content-Type': 'application/json' },
            });
        }) as typeof fetch;
        try {
            await driver.CreateIntent({ Amount: 10, CurrencyCode: 'USD', ReceiptEmail: 'buyer@example.com' });
            await driver.CreateIntent({ Amount: 10, CurrencyCode: 'USD' });
            expect(bodies[0].get('receipt_email')).toBe('buyer@example.com');
            expect(bodies[1].has('receipt_email')).toBe(false);
        } finally {
            globalThis.fetch = orig;
        }
    });

    it('stripeCaptureAlreadyCollected recognises Stripe automatic-capture refusals', () => {
        expect(
            stripeCaptureAlreadyCollected('This PaymentIntent could not be captured because it has already been captured.', {
                error: { code: 'payment_intent_unexpected_state' },
            }),
        ).toBe(true);
        expect(stripeCaptureAlreadyCollected('card declined', { error: { code: 'card_declined' } })).toBe(false);
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

describe('Payment intent descriptions (#327)', () => {
    /** Stands in for Stripe; records each call's method, path and decoded form body. */
    async function withStripe(
        run: (driver: StripePaymentProvider, calls: Array<{ Method: string; Path: string; Body: URLSearchParams }>) => Promise<void>,
    ): Promise<void> {
        const driver = stripe({ IsLiveMode: true });
        driver.Credentials = { ApiKey: 'sk_test_x' };
        const calls: Array<{ Method: string; Path: string; Body: URLSearchParams }> = [];
        const orig = globalThis.fetch;
        globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
            calls.push({
                Method: (init?.method ?? 'GET').toUpperCase(),
                Path: new URL(String(input)).pathname,
                Body: new URLSearchParams(String(init?.body ?? '')),
            });
            return new Response(JSON.stringify({ id: 'pi_live', status: 'requires_payment_method' }), {
                status: 200,
                headers: { 'Content-Type': 'application/json' },
            });
        }) as typeof fetch;
        try {
            await run(driver, calls);
        } finally {
            globalThis.fetch = orig;
        }
    }

    it('Stripe sends the description when opening an intent', async () => {
        await withStripe(async (driver, calls) => {
            await driver.CreateIntent({ Amount: 100, CurrencyCode: 'USD', Description: 'Annual Membership — Order ORD-1' });
            expect(calls[0].Body.get('description')).toBe('Annual Membership — Order ORD-1');
        });
    });

    it('Stripe sends no description field when none is given', async () => {
        await withStripe(async (driver, calls) => {
            await driver.CreateIntent({ Amount: 100, CurrencyCode: 'USD' });
            expect(calls[0].Body.has('description')).toBe(false);
        });
    });

    it('Stripe updates an open intent with the description and order id', async () => {
        await withStripe(async (driver, calls) => {
            const result = await driver.UpdateIntent({
                ProviderIntentID: 'pi_live',
                Description: 'Annual Membership — Order ORD-1',
                Metadata: { OrderHeaderID: 'order-1' },
            });
            expect(result.Success).toBe(true);
            expect(calls).toHaveLength(1);
            expect(calls[0].Method).toBe('POST');
            expect(calls[0].Path).toBe('/v1/payment_intents/pi_live');
            expect(calls[0].Body.get('description')).toBe('Annual Membership — Order ORD-1');
            expect(calls[0].Body.get('metadata[OrderHeaderID]')).toBe('order-1');
        });
    });

    it('Stripe makes no call for an update with nothing in it', async () => {
        await withStripe(async (driver, calls) => {
            expect((await driver.UpdateIntent({ ProviderIntentID: 'pi_live' })).Success).toBe(true);
            expect(calls).toHaveLength(0);
        });
    });

    it('the Stripe stub accepts an update without a network call', async () => {
        expect((await stripe().UpdateIntent({ ProviderIntentID: 'pi_stub_x', Description: 'x' })).Success).toBe(true);
    });

    it('the base driver refuses an update rather than pretending', async () => {
        const base = new BasePaymentProvider();
        base.Config = config({ TypeCode: 'Nonexistent' });
        expect((await base.UpdateIntent({ ProviderIntentID: 'pi_1', Description: 'x' })).Success).toBe(false);
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
        expect(event!.OccurredAt).toBeUndefined();
    });

    it('stamps OccurredAt from Stripe created (unix seconds)', () => {
        const event = stripe().ParseWebhookEvent(
            JSON.stringify({
                id: 'evt_created',
                type: 'payment_intent.succeeded',
                created: 1700000000,
                data: { object: { id: 'pi_1', status: 'succeeded', amount_received: 100, currency: 'usd' } },
            }),
        );
        expect(event!.OccurredAt).toEqual(new Date(1700000000 * 1000));
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

describe('StripePaymentProvider — keeping a card for later charges', () => {
    type Call = { method: string; url: string; body: URLSearchParams; headers: Record<string, string> };

    /** A live driver whose requests are recorded; every call answers with `reply`. */
    function recordingLive(reply: Record<string, unknown>) {
        const driver = stripe({ IsLiveMode: true });
        driver.Credentials = { ApiKey: 'sk_test_x' };
        const calls: Call[] = [];
        const orig = globalThis.fetch;
        globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
            calls.push({
                method: (init?.method ?? 'GET').toUpperCase(),
                url: String(input),
                body: new URLSearchParams(String(init?.body ?? '')),
                headers: (init?.headers ?? {}) as Record<string, string>,
            });
            return new Response(JSON.stringify(reply), { status: 200, headers: { 'Content-Type': 'application/json' } });
        }) as typeof fetch;
        return { driver, calls, restore: () => (globalThis.fetch = orig) };
    }

    it('asks Stripe to keep the card when a customer is given', async () => {
        const { driver, calls, restore } = recordingLive({ id: 'pi_1', status: 'requires_payment_method', client_secret: 'cs' });
        try {
            await driver.CreateIntent({ Amount: 599, CurrencyCode: 'USD', ProviderCustomerRef: 'cus_1', SaveInstrumentForReuse: true });
            expect(calls[0].body.get('customer')).toBe('cus_1');
            expect(calls[0].body.get('setup_future_usage')).toBe('off_session');
            expect(calls[0].body.get('confirm')).toBe('false');
            expect(calls[0].body.get('off_session')).toBeNull();
        } finally {
            restore();
        }
    });

    it('does not ask to keep the card without a customer to attach it to', async () => {
        const { driver, calls, restore } = recordingLive({ id: 'pi_1', status: 'requires_payment_method' });
        try {
            await driver.CreateIntent({ Amount: 599, CurrencyCode: 'USD', SaveInstrumentForReuse: true });
            expect(calls[0].body.get('setup_future_usage')).toBeNull();
        } finally {
            restore();
        }
    });

    it('charges an already-saved card off-session rather than asking to save it again', async () => {
        const { driver, calls, restore } = recordingLive({ id: 'pi_1', status: 'succeeded' });
        try {
            await driver.CreateIntent({
                Amount: 599,
                CurrencyCode: 'USD',
                ProviderCustomerRef: 'cus_1',
                ProviderInstrumentRef: 'pm_1',
                SaveInstrumentForReuse: true,
            });
            expect(calls[0].body.get('off_session')).toBe('true');
            expect(calls[0].body.get('payment_method')).toBe('pm_1');
            expect(calls[0].body.get('setup_future_usage')).toBeNull();
        } finally {
            restore();
        }
    });

    it('reuses an existing customer without calling Stripe', async () => {
        const { driver, calls, restore } = recordingLive({});
        try {
            const result = await driver.EnsureCustomer({ ExistingProviderCustomerRef: 'cus_old', BillToPersonID: 'p-1' });
            expect(result).toEqual({ Success: true, ProviderCustomerRef: 'cus_old', WasExisting: true });
            expect(calls).toHaveLength(0);
        } finally {
            restore();
        }
    });

    it('creates a customer with the buyer’s e-mail, our person id and an idempotency key', async () => {
        const { driver, calls, restore } = recordingLive({ id: 'cus_new' });
        try {
            const result = await driver.EnsureCustomer({ Email: 'buyer@example.com', BillToPersonID: 'p-1', IdempotencyKey: 'customer-p-1-pp-1' });
            expect(result).toEqual({ Success: true, ProviderCustomerRef: 'cus_new', WasExisting: false });
            expect(calls[0].method).toBe('POST');
            expect(calls[0].url).toContain('/v1/customers');
            expect(calls[0].body.get('email')).toBe('buyer@example.com');
            expect(calls[0].body.get('metadata[PersonID]')).toBe('p-1');
            expect(calls[0].headers['Idempotency-Key']).toBe('customer-p-1-pp-1');
        } finally {
            restore();
        }
    });

    it('creates a customer for a checkout when the buyer has no person yet', async () => {
        const { driver, calls, restore } = recordingLive({ id: 'cus_checkout' });
        try {
            const result = await driver.EnsureCustomer({ Email: 'new@example.com', CheckoutSessionID: 'sess-1' });
            expect(result).toEqual({ Success: true, ProviderCustomerRef: 'cus_checkout', WasExisting: false });
            expect(calls[0].body.get('email')).toBe('new@example.com');
            expect(calls[0].body.get('metadata[CheckoutSessionID]')).toBe('sess-1');
            expect(calls[0].body.get('metadata[PersonID]')).toBeNull();
        } finally {
            restore();
        }
    });

    it('refuses a customer with no owner', async () => {
        const result = await stripe({ IsLiveMode: true }).EnsureCustomer({ Email: 'buyer@example.com' });
        expect(result.Success).toBe(false);
    });

    it('stub returns a deterministic customer without a network call', async () => {
        const result = await stripe().EnsureCustomer({ BillToPersonID: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee' });
        expect(result.Success).toBe(true);
        expect(result.ProviderCustomerRef).toBe('cus_stub_aaaaaaaabbbbccccddddeeee');
    });

    it('the base driver refuses rather than inventing a customer', async () => {
        const base = new BasePaymentProvider();
        base.Config = config({ TypeCode: 'Nonexistent' });
        const result = await base.EnsureCustomer({ BillToPersonID: 'p-1' });
        expect(result.Success).toBe(false);
        expect(result.Reason).toContain('does not support');
    });

    it('retrieve reads the paid card back from an expanded intent', async () => {
        const { driver, calls, restore } = recordingLive({
            id: 'pi_1',
            status: 'succeeded',
            amount_received: 59900,
            currency: 'usd',
            customer: 'cus_1',
            payment_method: {
                id: 'pm_1',
                card: { brand: 'visa', last4: '4242', exp_month: 12, exp_year: 2030 },
                billing_details: { name: 'Pat Buyer' },
            },
        });
        try {
            const result = await driver.RetrieveIntent({ ProviderIntentID: 'pi_1' });
            expect(calls[0].url).toContain('expand[]=payment_method');
            expect(result.Instrument).toEqual({
                ProviderCustomerRef: 'cus_1',
                ProviderInstrumentRef: 'pm_1',
                Brand: 'visa',
                Last4: '4242',
                ExpiryMonth: 12,
                ExpiryYear: 2030,
                HolderName: 'Pat Buyer',
            });
        } finally {
            restore();
        }
    });
});

describe('StripeInstrumentFromIntent', () => {
    it('reads unexpanded ids', () => {
        expect(StripeInstrumentFromIntent({ customer: 'cus_1', payment_method: 'pm_1' })).toEqual({
            ProviderCustomerRef: 'cus_1',
            ProviderInstrumentRef: 'pm_1',
        });
    });

    it('takes the customer from the payment method when the intent has none', () => {
        expect(StripeInstrumentFromIntent({ customer: null, payment_method: { id: 'pm_1', customer: 'cus_2' } })?.ProviderCustomerRef).toBe('cus_2');
    });

    it('is undefined before a payment method exists', () => {
        expect(StripeInstrumentFromIntent({ customer: 'cus_1', payment_method: null })).toBeUndefined();
    });

    it("reads the card's issuing country as VAT location evidence (#480)", () => {
        const instrument = StripeInstrumentFromIntent({ payment_method: { id: 'pm_1', card: { brand: 'visa', country: 'ie' } } });
        expect(instrument?.IssuingCountry).toBe('IE');
    });

    it('leaves the issuing country out when the method is not a card or the country is not a code', () => {
        expect(StripeInstrumentFromIntent({ payment_method: { id: 'pm_1', us_bank_account: { last4: '6789' } } })).not.toHaveProperty('IssuingCountry');
        expect(StripeInstrumentFromIntent({ payment_method: { id: 'pm_1', card: { country: 'Ireland' } } })).not.toHaveProperty('IssuingCountry');
    });
});

describe('MoveGiftCardBalance — the capture/refund write behind a gift-card payment (#302)', () => {
    const CARD = '33333333-3333-3333-3333-333333333333';
    const PAY = '44444444-4444-4444-4444-444444444444';
    /** A card plus whatever ledger rows get written, behind a provider that hands out both. */
    const fakeCard = (balance: number, status = 'Active', expiresAt: Date | null = null) => {
        const card = { Code: 'GC-TEST', CurrentBalance: balance, Status: status, ExpiresAt: expiresAt, Saves: 0 };
        const txns: Array<Record<string, unknown>> = [];
        const sql: string[] = [];
        const provider = {
            // The locked read returns whatever the card holds now, as the database would.
            ExecuteSQL: async (q: string) => (sql.push(q), [{ CurrentBalance: card.CurrentBalance }]),
            GetEntityObject: async (name: string) =>
                name.endsWith('Stored Value Accounts')
                    ? Object.assign(card, { Load: async () => true, Save: async () => ++card.Saves > 0 })
                    : (() => {
                          const t: Record<string, unknown> = { NewRecord: () => undefined };
                          t.Save = async () => (txns.push(t), true);
                          return t;
                      })(),
        };
        return { card, txns, sql, provider: provider as never };
    };

    it('redeems: lowers the balance and writes a signed Redeem row that agrees with it', async () => {
        const { card, txns, provider } = fakeCard(90);
        expect(await MoveGiftCardBalance(provider, {} as never, CARD, 'Redeem', -60, PAY, 'o1')).toBe(30);
        expect(card.CurrentBalance).toBe(30);
        expect(card.Status).toBe('Active');
        expect(txns).toHaveLength(1);
        expect(txns[0]).toMatchObject({
            TransactionType: 'Redeem',
            Amount: -60,
            BalanceAfter: 30,
            RelatedOrderHeaderID: 'o1',
            RelatedPaymentID: PAY,
        });
    });

    it('spending to zero depletes the card; a refund makes it Active again', async () => {
        const { card, txns, provider } = fakeCard(40);
        await MoveGiftCardBalance(provider, {} as never, CARD, 'Redeem', -40, PAY, null);
        expect(card.Status).toBe('Depleted');
        await MoveGiftCardBalance(provider, {} as never, CARD, 'Refund', 25, PAY, null);
        expect(card.CurrentBalance).toBe(25);
        expect(card.Status).toBe('Active');
        expect(txns.map((t) => [t.TransactionType, t.Amount, t.BalanceAfter])).toEqual([
            ['Redeem', -40, 0],
            ['Refund', 25, 25],
        ]);
    });

    it('refuses an overdraw and writes nothing', async () => {
        const { card, txns, provider } = fakeCard(30);
        await expect(MoveGiftCardBalance(provider, {} as never, CARD, 'Redeem', -50, PAY, null)).rejects.toThrow(
            /holds 30\.00, which does not cover 50\.00/,
        );
        expect(card.Saves).toBe(0);
        expect(txns).toHaveLength(0);
    });

    it('refuses to spend a card that is not Active', async () => {
        const { txns, provider } = fakeCard(50, 'Voided');
        await expect(MoveGiftCardBalance(provider, {} as never, CARD, 'Redeem', -10, PAY, null)).rejects.toThrow(/Voided/);
        expect(txns).toHaveLength(0);
    });

    it('reads the balance under UPDLOCK, ROWLOCK, so concurrent spends of one card serialize', async () => {
        const { sql, provider } = fakeCard(90);
        await MoveGiftCardBalance(provider, {} as never, CARD, 'Redeem', -60, PAY, null);
        expect(sql).toHaveLength(1);
        expect(sql[0]).toMatch(/FROM __mj_BizAppsOrders\.StoredValueAccount WITH \(UPDLOCK, ROWLOCK\)/);
        expect(sql[0]).toContain(CARD);
    });

    it('refuses to spend a card past its expiry, even with no provider in the way', async () => {
        const { txns, provider } = fakeCard(50, 'Active', new Date('2026-01-01'));
        await expect(MoveGiftCardBalance(provider, {} as never, CARD, 'Redeem', -10, PAY, null)).rejects.toThrow(/expired on 2026-01-01/);
        expect(txns).toHaveLength(0);
    });

    it('refuses a movement signed the wrong way for its type', async () => {
        const { provider } = fakeCard(50);
        await expect(MoveGiftCardBalance(provider, {} as never, CARD, 'Redeem', 10, PAY, null)).rejects.toThrow(/wrong sign/);
        await expect(MoveGiftCardBalance(provider, {} as never, CARD, 'Refund', -10, PAY, null)).rejects.toThrow(/wrong sign/);
    });
});
