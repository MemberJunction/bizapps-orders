/**
 * Webhook endpoint drift and charge-to-payment reconciliation (#477). No network, no database:
 * Stripe answers from fixtures shaped like its test-mode responses.
 */
import { describe, expect, it } from 'vitest';
import type { GatewayCharge, GatewayWebhookEndpoint } from '../BasePaymentProvider.js';
import { StripePaymentProvider, StripeChargeFromObject } from '../StripePaymentProvider.js';
import { CheckWebhookEndpointDrift, EndpointServesProvider } from '../PaymentWebhookEndpointCheck.js';
import {
    ChargeMismatchDedupeKey,
    CreatedInWindow,
    FindChargeMismatches,
    GatewayWindow,
    type ReconcilablePayment,
} from '../ChargeReconciliation.js';

const PROVIDER_ID = '11111111-2222-4333-8444-555555555555';
const HANDLED = ['payment_intent.succeeded', 'payment_intent.payment_failed', 'payment_intent.canceled', 'charge.refunded'];

const endpoint = (over: Partial<GatewayWebhookEndpoint> = {}): GatewayWebhookEndpoint => ({
    Url: `https://orders.example.com/webhooks/payments/${PROVIDER_ID}`,
    Status: 'enabled',
    EnabledEvents: [...HANDLED],
    ...over,
});

describe('webhook endpoint drift', () => {
    it('finds Orders\' endpoint by the provider id at the end of its path', () => {
        expect(EndpointServesProvider(`https://x.example.com/api/webhooks/payments/${PROVIDER_ID.toUpperCase()}/`, PROVIDER_ID)).toBe(true);
        expect(EndpointServesProvider('https://x.example.com/webhooks/payments/someone-else', PROVIDER_ID)).toBe(false);
        expect(EndpointServesProvider('not a url', PROVIDER_ID)).toBe(false);
    });

    it('is OK when the endpoint sends every handled kind', () => {
        expect(CheckWebhookEndpointDrift({ PaymentProviderID: PROVIDER_ID, HandledKinds: HANDLED, Endpoints: [endpoint()] }).Status).toBe('OK');
    });

    it('is OK when the endpoint sends every event (*)', () => {
        expect(
            CheckWebhookEndpointDrift({ PaymentProviderID: PROVIDER_ID, HandledKinds: HANDLED, Endpoints: [endpoint({ EnabledEvents: ['*'] })] }).Status,
        ).toBe('OK');
    });

    it('raises drift when charge.refunded is removed from a test endpoint', () => {
        const result = CheckWebhookEndpointDrift({
            PaymentProviderID: PROVIDER_ID,
            HandledKinds: HANDLED,
            Endpoints: [endpoint({ EnabledEvents: HANDLED.filter((k) => k !== 'charge.refunded') })],
        });
        expect(result.Status).toBe('Drift');
        expect(result.MissingKinds).toEqual(['charge.refunded']);
    });

    it('reports a missing or disabled endpoint', () => {
        expect(CheckWebhookEndpointDrift({ PaymentProviderID: PROVIDER_ID, HandledKinds: HANDLED, Endpoints: [] }).Status).toBe('Missing');
        expect(
            CheckWebhookEndpointDrift({ PaymentProviderID: PROVIDER_ID, HandledKinds: HANDLED, Endpoints: [endpoint({ Status: 'disabled' })] }).Status,
        ).toBe('Disabled');
    });

    it('judges the best enabled endpoint when a stale duplicate also points at the route', () => {
        const result = CheckWebhookEndpointDrift({
            PaymentProviderID: PROVIDER_ID,
            HandledKinds: HANDLED,
            Endpoints: [endpoint({ EnabledEvents: ['payment_intent.succeeded'] }), endpoint()],
        });
        expect(result.Status).toBe('OK');
    });
});

const charge = (over: Partial<GatewayCharge> = {}): GatewayCharge => ({
    ProviderChargeID: 'ch_test_1',
    ProviderIntentID: 'pi_test_1',
    Amount: 100,
    AmountRefunded: 0,
    CurrencyCode: 'USD',
    Status: 'succeeded',
    CreatedAt: new Date('2026-10-05T15:00:00Z'),
    ...over,
});

const payment = (over: Partial<ReconcilablePayment> = {}): ReconcilablePayment => ({
    ID: 'p1',
    PaymentNumber: 'PAY-1',
    ReceivingCompanyID: 'company-1',
    PaymentDate: '2026-10-05',
    Amount: 100,
    Status: 'Captured',
    ProviderChargeID: 'ch_test_1',
    PaymentIntentID: 'i1',
    RefundedAmount: 0,
    ...over,
});

const reconcile = (charges: GatewayCharge[], payments: ReconcilablePayment[], missing: string[] = []) =>
    FindChargeMismatches({
        FromDate: '2026-10-02',
        ToDate: '2026-10-08',
        Charges: charges,
        ChargesInWindow: new Set(charges.filter((c) => CreatedInWindow(c, '2026-10-02', '2026-10-08')).map((c) => c.ProviderChargeID)),
        Payments: payments,
        ConfirmedMissing: new Set(missing),
        IntentIDs: new Map([['pi_test_1', 'i1']]),
    });

describe('charge reconciliation', () => {
    it('finds nothing when every charge has its captured payment', () => {
        expect(reconcile([charge()], [payment()])).toEqual([]);
    });

    it('reports a test charge made outside Orders as a charge with no payment', () => {
        const found = reconcile([charge({ ProviderChargeID: 'ch_test_outside', ProviderIntentID: 'pi_test_outside' })], []);
        expect(found).toHaveLength(1);
        expect(found[0]).toMatchObject({ Kind: 'ChargeWithoutPayment', ProviderChargeID: 'ch_test_outside', PaymentIntentID: null, Amount: 100 });
        expect(found[0].Detail).toMatch(/not opened by Orders/);
    });

    it('reports a succeeded charge whose payment is still pending', () => {
        expect(reconcile([charge()], [payment({ Status: 'Pending' })])[0]).toMatchObject({ Kind: 'ChargeWithoutPayment', PaymentHeaderID: 'p1' });
    });

    it('does not report a charge older than the window as one with no payment', () => {
        expect(reconcile([charge({ CreatedAt: new Date('2026-09-20T15:00:00Z') })], [])).toEqual([]);
    });

    it('reports a captured payment whose charge the gateway does not have', () => {
        expect(reconcile([], [payment()], ['ch_test_1'])[0]).toMatchObject({ Kind: 'PaymentWithoutCharge', PaymentHeaderID: 'p1' });
        expect(reconcile([], [payment({ ProviderChargeID: null })])[0]).toMatchObject({ Kind: 'PaymentWithoutCharge' });
    });

    it('reports a refunded charge whose payment carries fewer refunds', () => {
        const found = reconcile([charge({ AmountRefunded: 40 })], [payment({ RefundedAmount: 10 })]);
        expect(found).toEqual([expect.objectContaining({ Kind: 'RefundNotBooked', Amount: 30, PaymentHeaderID: 'p1' })]);
    });

    it('ignores charges that did not succeed', () => {
        expect(reconcile([charge({ Status: 'failed', ProviderChargeID: 'ch_failed' })], [])).toEqual([]);
    });

    it('keys a mismatch by kind, charge and amount, so a re-run raises nothing new', () => {
        const [m] = reconcile([charge({ AmountRefunded: 40 })], [payment()]);
        expect(ChargeMismatchDedupeKey(m)).toBe('RefundNotBooked|ch_test_1|40');
    });

    it('pads the gateway read either side of the window', () => {
        const w = GatewayWindow('2026-10-02', '2026-10-08', 2);
        expect(w.From.toISOString()).toBe('2026-09-30T00:00:00.000Z');
        expect(w.To.toISOString()).toBe('2026-10-10T23:59:59.000Z');
    });
});

describe('StripePaymentProvider reconciliation reads', () => {
    function live(replies: Array<{ status?: number; body: Record<string, unknown> }>) {
        const driver = new StripePaymentProvider();
        driver.Config = {
            ID: PROVIDER_ID, TypeCode: 'Stripe', CompanyID: 'c', Name: 'Test account', CredentialsRef: null, IsLiveMode: true,
            Capabilities: { SupportsTokenization: true, SupportsRefund: true, SupportsWebhooks: true },
        };
        driver.Credentials = { ApiKey: 'sk_test_fixture' };
        const urls: string[] = [];
        const orig = globalThis.fetch;
        globalThis.fetch = (async (input: RequestInfo | URL) => {
            urls.push(String(input));
            const reply = replies[urls.length - 1];
            return new Response(JSON.stringify(reply.body), { status: reply.status ?? 200 });
        }) as typeof fetch;
        return { driver, urls, restore: () => (globalThis.fetch = orig) };
    }

    it('lists charges in a created window', async () => {
        const { driver, urls, restore } = live([
            { body: { object: 'list', has_more: false, data: [{ id: 'ch_test_1', object: 'charge', amount: 10000, amount_refunded: 2500, currency: 'usd', status: 'succeeded', payment_intent: 'pi_test_1', created: 1759676400 }] } },
        ]);
        try {
            const result = await driver.ListCharges({ CreatedFrom: new Date('2026-10-01T00:00:00Z'), CreatedTo: new Date('2026-10-08T00:00:00Z') });
            expect(result.Charges).toEqual([
                expect.objectContaining({ ProviderChargeID: 'ch_test_1', ProviderIntentID: 'pi_test_1', Amount: 100, AmountRefunded: 25 }),
            ]);
            expect(decodeURIComponent(urls[0])).toContain('created[gte]=1790812800');
        } finally {
            restore();
        }
    });

    it('tells a missing charge apart from a failed read', async () => {
        const { driver, restore } = live([
            { status: 404, body: { error: { code: 'resource_missing', message: 'No such charge' } } },
            { status: 403, body: { error: { code: 'secret_key_required', message: 'This key cannot read charges' } } },
        ]);
        try {
            expect(await driver.RetrieveCharge({ ProviderChargeID: 'ch_gone' })).toMatchObject({ Success: false, NotFound: true });
            expect(await driver.RetrieveCharge({ ProviderChargeID: 'ch_x' })).toMatchObject({ Success: false, NotFound: false });
        } finally {
            restore();
        }
    });

    it('lists webhook endpoints with their enabled events', async () => {
        const { driver, restore } = live([
            { body: { object: 'list', has_more: false, data: [{ id: 'we_test_1', url: `https://orders.example.com/webhooks/payments/${PROVIDER_ID}`, status: 'enabled', enabled_events: ['payment_intent.succeeded'] }] } },
        ]);
        try {
            const result = await driver.ListWebhookEndpoints();
            expect(result.Endpoints).toEqual([
                { Url: `https://orders.example.com/webhooks/payments/${PROVIDER_ID}`, Status: 'enabled', EnabledEvents: ['payment_intent.succeeded'] },
            ]);
        } finally {
            restore();
        }
    });

    it('the stub lists no charges and declines to list endpoints', async () => {
        const stub = new StripePaymentProvider();
        stub.Config = { ID: PROVIDER_ID, TypeCode: 'Stripe', CompanyID: 'c', Name: 'Stub', CredentialsRef: null, IsLiveMode: false, Capabilities: { SupportsTokenization: true, SupportsRefund: true, SupportsWebhooks: true } };
        expect((await stub.ListCharges({})).Charges).toEqual([]);
        expect((await stub.ListWebhookEndpoints()).Success).toBe(false);
        expect(stub.ListsCharges).toBe(true);
    });

    it('reads an expanded intent on a charge', () => {
        expect(StripeChargeFromObject({ id: 'ch_x', amount: 500, currency: 'usd', payment_intent: { id: 'pi_x' }, status: 'succeeded' }).ProviderIntentID).toBe('pi_x');
    });
});
