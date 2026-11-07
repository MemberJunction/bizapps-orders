/**
 * The gateway half of E3 + E4 against a fake `fetch`: the subscription event kinds Stripe's driver hears,
 * the `sub_…` read from either payload shape (and nothing else from the payload), the subscription's
 * details, and the invoice list E4 books from. Plus the base driver's refusals.
 */
import { describe, expect, it, vi } from 'vitest';
import { BasePaymentProvider, type PaymentProviderConfig } from '../BasePaymentProvider.js';
import { StripeEventSubscriptionID, StripeInvoiceFacts, StripePaymentProvider, StripeSubscriptionDetails } from '../StripePaymentProvider.js';

const config = (overrides: Partial<PaymentProviderConfig> = {}): PaymentProviderConfig => ({
    ID: '88EB5F2E-0000-4000-8000-000000000001',
    TypeCode: 'Stripe',
    CompanyID: 'company-1',
    Name: 'Test Stripe',
    CredentialsRef: null,
    IsLiveMode: true,
    BillsSubscriptions: true,
    Capabilities: { SupportsTokenization: true, SupportsRefund: true, SupportsWebhooks: true, SupportsSubscriptionBilling: true },
    ...overrides,
});

interface Sent {
    url: string;
    method: string;
    headers: Record<string, string>;
    signal?: AbortSignal | null;
}

function live(replies: Array<{ status?: number; body: Record<string, unknown> }>, overrides: Partial<PaymentProviderConfig> = {}) {
    const driver = new StripePaymentProvider();
    driver.Config = config(overrides);
    driver.Credentials = { ApiKey: 'sk_test_fixture' };
    const sent: Sent[] = [];
    const orig = globalThis.fetch;
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
        sent.push({ url: String(input), method: String(init?.method ?? 'GET'), headers: (init?.headers ?? {}) as Record<string, string>, signal: init?.signal });
        const reply = replies[sent.length - 1];
        if (!reply) throw new Error('no more fake replies');
        return new Response(JSON.stringify(reply.body), { status: reply.status ?? 200 });
    }) as typeof fetch;
    return { driver, sent, restore: () => (globalThis.fetch = orig) };
}

const SUBSCRIPTION_KINDS = [
    'invoice.paid',
    'invoice.payment_failed',
    'invoice.payment_action_required',
    'invoice.marked_uncollectible',
    'invoice.voided',
    'customer.subscription.created',
    'customer.subscription.updated',
    'customer.subscription.deleted',
    'customer.subscription.paused',
    'customer.subscription.resumed',
];

describe('the subscription event kinds (E3)', () => {
    it('Stripe hears exactly the ten kinds the design lists, and not invoice.payment_succeeded (it repeats invoice.paid)', () => {
        const driver = new StripePaymentProvider();
        expect([...driver.HandledSubscriptionEventKinds]).toEqual(SUBSCRIPTION_KINDS);
        expect(driver.HandledSubscriptionEventKinds).not.toContain('invoice.payment_succeeded');
    });
    it('control: the payment kinds are unchanged and separate', () => {
        const driver = new StripePaymentProvider();
        expect([...driver.HandledEventKinds]).toEqual(['payment_intent.succeeded', 'payment_intent.payment_failed', 'payment_intent.canceled', 'charge.refunded']);
        for (const kind of SUBSCRIPTION_KINDS) expect(driver.HandledEventKinds).not.toContain(kind);
    });
    it('the base driver hears none (a gateway that bills no subscriptions)', () => {
        class Bare extends BasePaymentProvider {}
        expect([...new Bare().HandledSubscriptionEventKinds]).toEqual([]);
    });
});

describe('StripeEventSubscriptionID: the sub_… an event names, from either payload shape', () => {
    it('customer.subscription.*: the subscription object’s own id', () => {
        expect(StripeEventSubscriptionID('customer.subscription.updated', { id: 'sub_jane', object: 'subscription' })).toBe('sub_jane');
    });
    it('invoice.* up to 2025-02-24: the invoice’s subscription (an id or an expanded object)', () => {
        expect(StripeEventSubscriptionID('invoice.paid', { id: 'in_1', subscription: 'sub_jane' })).toBe('sub_jane');
        expect(StripeEventSubscriptionID('invoice.paid', { id: 'in_1', subscription: { id: 'sub_jane', object: 'subscription' } })).toBe('sub_jane');
    });
    it('invoice.* from 2025-03-31.basil: parent.subscription_details.subscription', () => {
        expect(StripeEventSubscriptionID('invoice.paid', { id: 'in_1', parent: { type: 'subscription_details', subscription_details: { subscription: 'sub_jane' } } })).toBe('sub_jane');
    });
    it('a one-off invoice names no subscription: null', () => {
        expect(StripeEventSubscriptionID('invoice.paid', { id: 'in_1', subscription: null })).toBeNull();
    });
    it('never takes an id that is not a subscription’s', () => {
        expect(StripeEventSubscriptionID('customer.subscription.updated', { id: 'cus_jane' })).toBeNull();
        expect(StripeEventSubscriptionID('invoice.paid', { id: 'in_1', subscription: 'in_2' })).toBeNull();
        expect(StripeEventSubscriptionID('payment_intent.succeeded', { id: 'pi_1', subscription: 'sub_jane' })).toBeNull();
    });
});

describe('ParseWebhookEvent fills ProviderSubscriptionID for the subscription kinds only', () => {
    const driver = new StripePaymentProvider();
    const body = (type: string, object: Record<string, unknown>) => JSON.stringify({ id: 'evt_1', type, created: 1830142800, data: { object } });
    it('an invoice.paid event: the sub_… and nothing else of the payload (no intent, no amount)', () => {
        const event = driver.ParseWebhookEvent(body('invoice.paid', { id: 'in_1', subscription: 'sub_jane', payment_intent: 'pi_1', amount_paid: 59900, currency: 'usd' }));
        expect(event).toEqual({ EventID: 'evt_1', Kind: 'invoice.paid', CurrencyCode: 'USD', OccurredAt: new Date(1830142800 * 1000), ProviderSubscriptionID: 'sub_jane' });
    });
    it('a customer.subscription.deleted event', () => {
        expect(driver.ParseWebhookEvent(body('customer.subscription.deleted', { id: 'sub_jane', status: 'canceled' }))?.ProviderSubscriptionID).toBe('sub_jane');
    });
    it('control: a payment_intent event fills no subscription id, as before', () => {
        const event = driver.ParseWebhookEvent(body('payment_intent.succeeded', { id: 'pi_1', status: 'succeeded', amount: 100, currency: 'usd', subscription: 'sub_jane' }));
        expect(event?.ProviderSubscriptionID).toBeUndefined();
        expect(event?.ProviderIntentID).toBe('pi_1');
    });
    it('control: an event kind outside both lists fills nothing', () => {
        expect(driver.ParseWebhookEvent(body('invoice.upcoming', { id: 'in_1', subscription: 'sub_jane' }))?.ProviderSubscriptionID).toBeUndefined();
    });
});

describe('StripeSubscriptionDetails', () => {
    it('reads the price, quantity, customer (expanded or an id), e-mail, metadata and ended_at', () => {
        expect(
            StripeSubscriptionDetails({
                ended_at: 1830142800,
                items: { data: [{ price: { id: 'price_pro' }, quantity: 2 }] },
                customer: { id: 'cus_jane', email: 'jane@example.com' },
                metadata: { OrdersSubscriptionID: 'abc', n: 3 },
            }),
        ).toEqual({
            EndedAt: new Date(1830142800 * 1000),
            ProviderPriceID: 'price_pro',
            Quantity: 2,
            ProviderCustomerRef: 'cus_jane',
            CustomerEmail: 'jane@example.com',
            Metadata: { OrdersSubscriptionID: 'abc' },
        });
    });
    it('a customer id (not expanded) has no e-mail; missing fields are null', () => {
        expect(StripeSubscriptionDetails({ customer: 'cus_jane' })).toEqual({
            EndedAt: null,
            ProviderPriceID: null,
            Quantity: null,
            ProviderCustomerRef: 'cus_jane',
            CustomerEmail: null,
            Metadata: {},
        });
    });
});

describe('StripeInvoiceFacts (2024-06-20 names)', () => {
    const paid = {
        id: 'in_renew',
        status: 'paid',
        billing_reason: 'subscription_cycle',
        amount_paid: 59900,
        amount_due: 59900,
        tax: null,
        currency: 'usd',
        payment_intent: 'pi_renew',
        charge: { id: 'ch_renew' },
        created: 1830142800,
        status_transitions: { paid_at: 1830142810 },
        paid_out_of_band: false,
        attempt_count: 1,
        next_payment_attempt: null,
        total_discount_amounts: [],
        lines: { data: [{ type: 'subscription', proration: false, price: { id: 'price_pro' }, quantity: 1, period: { start: 1830142800, end: 1861678800 } }] },
    };
    it('maps a paid renewal: major units, ids from strings or objects, paid_at', () => {
        expect(StripeInvoiceFacts(paid)).toEqual({
            ProviderInvoiceID: 'in_renew',
            Status: 'paid',
            BillingReason: 'subscription_cycle',
            AmountPaid: 599,
            AmountDue: 599,
            Tax: 0,
            CurrencyCode: 'USD',
            ProviderIntentID: 'pi_renew',
            ProviderChargeID: 'ch_renew',
            CreatedAt: new Date(1830142800 * 1000),
            PaidAt: new Date(1830142810 * 1000),
            PaidOutOfBand: false,
            Discounted: false,
            AttemptCount: 1,
            NextAttemptAt: null,
            ProviderPriceID: 'price_pro',
            Quantity: 1,
            PeriodStart: new Date(1830142800 * 1000),
            PeriodEnd: new Date(1861678800 * 1000),
        });
    });
    it("reads the subscription's own line, not a proration or an invoice item listed first", () => {
        const withProration = {
            ...paid,
            lines: {
                data: [
                    { type: 'invoiceitem', proration: false, price: { id: 'price_setup' }, quantity: 1, period: { start: 1, end: 2 } },
                    { type: 'subscription', proration: true, price: { id: 'price_old' }, quantity: 2, period: { start: 3, end: 4 } },
                    { type: 'subscription', proration: false, price: { id: 'price_pro' }, quantity: 1, period: { start: 1830142800, end: 1861678800 } },
                ],
            },
        };
        expect(StripeInvoiceFacts(withProration)).toMatchObject({ ProviderPriceID: 'price_pro', Quantity: 1, PeriodStart: new Date(1830142800 * 1000) });
    });
    it('no period on the line → PeriodStart null (the planner parks it)', () => {
        expect(StripeInvoiceFacts({ ...paid, lines: { data: [{ price: 'price_pro', quantity: 1 }] } }).PeriodStart).toBeNull();
    });
    it('Discounted from a discount amount, a discounts list, or the legacy discount object', () => {
        expect(StripeInvoiceFacts({ ...paid, total_discount_amounts: [{ amount: 20000 }] }).Discounted).toBe(true);
        expect(StripeInvoiceFacts({ ...paid, discounts: ['di_1'] }).Discounted).toBe(true);
        expect(StripeInvoiceFacts({ ...paid, discount: { id: 'di_1' } }).Discounted).toBe(true);
        expect(StripeInvoiceFacts({ ...paid, total_discount_amounts: [{ amount: 0 }] }).Discounted).toBe(false);
    });
    it('an open invoice after two failures: attempts and the next try', () => {
        const open = StripeInvoiceFacts({ ...paid, status: 'open', amount_paid: 0, attempt_count: 2, next_payment_attempt: 1830488400, status_transitions: {} });
        expect(open).toMatchObject({ Status: 'open', AmountPaid: 0, AttemptCount: 2, NextAttemptAt: new Date(1830488400 * 1000), PaidAt: null });
    });
    it('tax and out-of-band', () => {
        expect(StripeInvoiceFacts({ ...paid, tax: 4892, paid_out_of_band: true })).toMatchObject({ Tax: 48.92, PaidOutOfBand: true });
    });
});

describe('StripePaymentProvider.ListProviderSubscriptionInvoices', () => {
    it('GET /v1/invoices?subscription=…&created[gte]=… (no status filter), every page, oldest first, with the 15 s timeout', async () => {
        const timeout = vi.spyOn(AbortSignal, 'timeout');
        const newer = { id: 'in_2', status: 'paid', created: 1830142800, currency: 'usd', amount_paid: 59900 };
        const older = { id: 'in_1', status: 'paid', created: 1798606800, currency: 'usd', amount_paid: 0 };
        const { driver, sent, restore } = live([
            { body: { data: [newer], has_more: true } },
            { body: { data: [older], has_more: false } },
        ]);
        try {
            const result = await driver.ListProviderSubscriptionInvoices({ ProviderSubscriptionID: 'sub_jane', CreatedSince: new Date('2026-10-30T05:00:00Z') });
            expect(result.Success).toBe(true);
            expect(result.Invoices!.map((i) => i.ProviderInvoiceID)).toEqual(['in_1', 'in_2']);
            expect(sent).toHaveLength(2);
            const first = new URL(sent[0].url);
            expect(first.pathname).toBe('/v1/invoices');
            expect(first.searchParams.get('subscription')).toBe('sub_jane');
            expect(first.searchParams.get('created[gte]')).toBe(String(Math.floor(new Date('2026-10-30T05:00:00Z').getTime() / 1000)));
            expect(first.searchParams.has('status')).toBe(false);
            expect(new URL(sent[1].url).searchParams.get('starting_after')).toBe('in_2');
            expect(sent.every((s) => s.method === 'GET' && s.headers['Stripe-Version'] === '2024-06-20')).toBe(true);
            expect(timeout).toHaveBeenCalledWith(15_000);
        } finally {
            restore();
            timeout.mockRestore();
        }
    });
    it('without CreatedSince: no created filter', async () => {
        const { driver, sent, restore } = live([{ body: { data: [], has_more: false } }]);
        try {
            await driver.ListProviderSubscriptionInvoices({ ProviderSubscriptionID: 'sub_jane' });
            expect(new URL(sent[0].url).searchParams.has('created[gte]')).toBe(false);
        } finally {
            restore();
        }
    });
    it('a refusal is reported, naming the subscription', async () => {
        const { driver, restore } = live([{ status: 404, body: { error: { message: 'No such subscription' } } }]);
        try {
            const result = await driver.ListProviderSubscriptionInvoices({ ProviderSubscriptionID: 'sub_gone' });
            expect(result.Success).toBe(false);
            expect(result.Reason).toMatch(/sub_gone.*No such subscription/);
        } finally {
            restore();
        }
    });
    it('the stub (a provider not in live mode) refuses and calls nothing: an empty list would read as "nothing to book"', async () => {
        const { driver, sent, restore } = live([], { IsLiveMode: false });
        try {
            const result = await driver.ListProviderSubscriptionInvoices({ ProviderSubscriptionID: 'sub_jane' });
            expect(result.Success).toBe(false);
            expect(result.Reason).toMatch(/stub/);
            expect(sent).toHaveLength(0);
        } finally {
            restore();
        }
    });
    it('the base driver refuses', async () => {
        class Bare extends BasePaymentProvider {}
        expect((await new Bare().ListProviderSubscriptionInvoices({ ProviderSubscriptionID: 'sub_x' })).Success).toBe(false);
    });
});
