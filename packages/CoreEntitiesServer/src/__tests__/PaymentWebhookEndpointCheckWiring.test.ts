/**
 * The endpoint check at server start judges EVERY kind the driver acts on (#989 review, the required fix).
 *
 * `CheckWebhookEndpointDrift` was always right; what was wrong was the list `CheckPaymentWebhookEndpoints`
 * handed it — the payment kinds only, so an endpoint that predates E3 (the original four kinds) reported OK
 * while no `invoice.*` / `customer.subscription.*` event ever arrived. This drives the real wiring with the
 * real Stripe driver's lists; only the provider row, its config and the gateway's endpoint list are faked.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { GatewayWebhookEndpoint } from '../BasePaymentProvider.js';
import { StripePaymentProvider } from '../StripePaymentProvider.js';

const PROVIDER_ID = '11111111-2222-4333-8444-555555555555';
const state = vi.hoisted(() => ({ endpoints: [] as unknown[] }));

vi.mock('@memberjunction/core', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/core')>();
    return {
        ...actual,
        LogError: () => undefined,
        LogStatus: () => undefined,
        RunView: class {
            async RunView() {
                return { Success: true, Results: [{ ID: '11111111-2222-4333-8444-555555555555', Name: 'Stripe', IsLiveMode: true }] };
            }
        },
    };
});

vi.mock('../PaymentProviderResolver.js', async () => {
    const { StripePaymentProvider: Driver } = await import('../StripePaymentProvider.js');
    return {
        LoadPaymentProviderConfig: async () => ({ IsLiveMode: true, Capabilities: { SupportsWebhooks: true } }),
        BuildPaymentProvider: async () => {
            const d = new Driver();
            // The real driver's kind lists; only the gateway read is faked.
            d.ListWebhookEndpoints = async () => ({ Success: true, Endpoints: state.endpoints as GatewayWebhookEndpoint[] });
            return d;
        },
    };
});

const { CheckPaymentWebhookEndpoints, WebhookKindsToCheck } = await import('../PaymentWebhookEndpointCheck.js');

const driver = new StripePaymentProvider();
const ORIGINAL_FOUR = [...driver.HandledEventKinds];
const SUBSCRIPTION_TEN = [...driver.HandledSubscriptionEventKinds];

const endpoint = (events: string[]): GatewayWebhookEndpoint => ({
    Url: `https://orders.example.com/webhooks/payments/${PROVIDER_ID}`,
    Status: 'enabled',
    EnabledEvents: events,
});

describe('CheckPaymentWebhookEndpoints judges payment AND subscription kinds', () => {
    beforeEach(() => {
        state.endpoints = [];
    });

    it('the Stripe driver has 4 payment kinds and 10 subscription kinds, none shared', () => {
        expect(ORIGINAL_FOUR).toHaveLength(4);
        expect(SUBSCRIPTION_TEN).toHaveLength(10);
        expect(WebhookKindsToCheck(driver)).toHaveLength(14);
    });

    it('an endpoint subscribed to only the original four kinds is Drift, missing exactly the ten', async () => {
        state.endpoints = [endpoint(ORIGINAL_FOUR)];
        const [r] = await CheckPaymentWebhookEndpoints({} as never, {} as never);
        expect(r.Status).toBe('Drift');
        expect([...r.MissingKinds].sort()).toEqual([...SUBSCRIPTION_TEN].sort());
    });

    it('an endpoint subscribed to all fourteen is OK', async () => {
        state.endpoints = [endpoint([...ORIGINAL_FOUR, ...SUBSCRIPTION_TEN])];
        const [r] = await CheckPaymentWebhookEndpoints({} as never, {} as never);
        expect(r.Status).toBe('OK');
        expect(r.MissingKinds).toEqual([]);
    });

    it('an endpoint with only the subscription kinds is Drift on the original four', async () => {
        state.endpoints = [endpoint(SUBSCRIPTION_TEN)];
        const [r] = await CheckPaymentWebhookEndpoints({} as never, {} as never);
        expect(r.Status).toBe('Drift');
        expect([...r.MissingKinds].sort()).toEqual([...ORIGINAL_FOUR].sort());
    });

    it('de-duplicates a kind a driver lists in both', () => {
        expect(WebhookKindsToCheck({ HandledEventKinds: ['a', 'b'], HandledSubscriptionEventKinds: ['b', 'c'] })).toEqual(['a', 'b', 'c']);
    });
});
