/**
 * The gateway half of option E, E2: Stripe's `CreateProviderSubscription`, `FindProviderSubscriptions`,
 * `DescribeProviderPrice` and the anchor limit, against a fake `fetch`; and the base driver's refusal.
 *
 * The request shape is the one proven in a Stripe sandbox: `billing_cycle_anchor` with
 * `proration_behavior=none` charges nothing at creation; `billing_cycle_anchor_config` charged a full
 * year at once and must never be sent.
 */
import { describe, expect, it } from 'vitest';
import { BasePaymentProvider, type PaymentProviderConfig } from '../BasePaymentProvider.js';
import { OneIntervalLaterAsStripeCounts, OneYearLaterAsStripeCounts, StripeChargedAtCreation, StripePaymentProvider, StripePriceInterval } from '../StripePaymentProvider.js';

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
    body: URLSearchParams;
    signal?: AbortSignal | null;
}

function live(replies: Array<{ status?: number; body: Record<string, unknown> }>, overrides: Partial<PaymentProviderConfig> = {}) {
    const driver = new StripePaymentProvider();
    driver.Config = config(overrides);
    driver.Credentials = { ApiKey: 'sk_test_fixture' };
    const sent: Sent[] = [];
    const orig = globalThis.fetch;
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
        sent.push({
            url: String(input),
            method: String(init?.method ?? 'GET'),
            headers: (init?.headers ?? {}) as Record<string, string>,
            body: new URLSearchParams(String(init?.body ?? '')),
            signal: init?.signal,
        });
        const reply = replies[sent.length - 1];
        if (!reply) throw new Error('no more fake replies');
        return new Response(JSON.stringify(reply.body), { status: reply.status ?? 200 });
    }) as typeof fetch;
    return { driver, sent, restore: () => (globalThis.fetch = orig) };
}

const ANCHOR = new Date('2027-10-30T05:00:00Z');
const request = {
    ProviderCustomerRef: 'cus_jane',
    ProviderInstrumentRef: 'pm_jane',
    ProviderPriceID: 'price_pro_599',
    Quantity: 1,
    FirstChargeAt: ANCHOR,
    IdempotencyKey: 'provider-subscription:sub-1:price_pro_599:pm_jane:1:1824872400',
    Metadata: { OrdersSubscriptionID: 'sub-1', OrdersSubscriptionNumber: 'SUB-000110' },
};
const activeSubscription = {
    id: 'sub_test_1',
    object: 'subscription',
    status: 'active',
    latest_invoice: null,
    billing_cycle_anchor: 1824872400,
};

describe('StripePaymentProvider.CreateProviderSubscription', () => {
    it('sends the sandbox-proven request: anchor in seconds, no proration, the saved card, the idempotency key, API 2024-06-20', async () => {
        const { driver, sent, restore } = live([{ body: activeSubscription }]);
        try {
            const result = await driver.CreateProviderSubscription(request);
            expect(result).toEqual({
                Success: true,
                ProviderSubscriptionID: 'sub_test_1',
                Status: 'active',
                FirstChargeAt: ANCHOR,
                ChargedAtCreation: false,
            });
            expect(sent).toHaveLength(1);
            expect(sent[0].method).toBe('POST');
            expect(sent[0].url).toBe('https://api.stripe.com/v1/subscriptions');
            expect(sent[0].headers['Idempotency-Key']).toBe(request.IdempotencyKey);
            expect(sent[0].headers['Stripe-Version']).toBe('2024-06-20');
            expect(Object.fromEntries(sent[0].body)).toEqual({
                customer: 'cus_jane',
                'items[0][price]': 'price_pro_599',
                'items[0][quantity]': '1',
                default_payment_method: 'pm_jane',
                collection_method: 'charge_automatically',
                billing_cycle_anchor: '1824872400',
                proration_behavior: 'none',
                'expand[0]': 'latest_invoice',
                'metadata[OrdersSubscriptionID]': 'sub-1',
                'metadata[OrdersSubscriptionNumber]': 'SUB-000110',
            });
            expect([...sent[0].body.keys()].some((k) => k.startsWith('billing_cycle_anchor_config'))).toBe(false);
        } finally {
            restore();
        }
    });

    it('flags a subscription Stripe billed at creation (an invoice, or not active) so the caller can raise it as urgent', async () => {
        const { driver, restore } = live([
            { body: { ...activeSubscription, latest_invoice: 'in_today' } },
            { body: { ...activeSubscription, id: 'sub_test_2', status: 'incomplete' } },
        ]);
        try {
            expect((await driver.CreateProviderSubscription(request)).ChargedAtCreation).toBe(true);
            expect((await driver.CreateProviderSubscription(request)).ChargedAtCreation).toBe(true);
        } finally {
            restore();
        }
    });

    it('L4: reads a charge at creation from the invoice amounts: a $0 invoice on an active subscription is not one', async () => {
        const invoice = (amount_due: number, amount_paid: number) => ({ id: 'in_today', object: 'invoice', amount_due, amount_paid });
        const { driver, restore } = live([
            { body: { ...activeSubscription, latest_invoice: invoice(0, 0) } },
            { body: { ...activeSubscription, latest_invoice: invoice(59900, 0) } },
            { body: { ...activeSubscription, latest_invoice: invoice(0, 59900) } },
        ]);
        try {
            expect((await driver.CreateProviderSubscription(request)).ChargedAtCreation).toBe(false);
            expect((await driver.CreateProviderSubscription(request)).ChargedAtCreation).toBe(true);
            expect((await driver.CreateProviderSubscription(request)).ChargedAtCreation).toBe(true);
        } finally {
            restore();
        }
        // An unexpanded id cannot say what it charged, so it counts as charged; trialing charges nothing;
        // any other status (incomplete, past_due) is a charge or a failed one.
        expect(StripeChargedAtCreation('active', 'in_today')).toBe(true);
        expect(StripeChargedAtCreation('active', null)).toBe(false);
        expect(StripeChargedAtCreation('trialing', null)).toBe(false);
        expect(StripeChargedAtCreation('incomplete', { amount_due: 0, amount_paid: 0 })).toBe(true);
        expect(StripeChargedAtCreation('past_due', null)).toBe(true);
    });

    it("returns Stripe's own message on a 4xx refusal, and throws on a 5xx", async () => {
        const { driver, restore } = live([
            {
                status: 400,
                body: { error: { message: 'billing_cycle_anchor cannot be later than next natural billing date (1866974400) for plan' } },
            },
            { status: 409, body: { error: { type: 'idempotency_error', message: 'There is currently another in-progress request using this Idempotent Key' } } },
            { status: 503, body: {} },
        ]);
        try {
            expect(await driver.CreateProviderSubscription(request)).toEqual({
                Success: false,
                Reason: 'billing_cycle_anchor cannot be later than next natural billing date (1866974400) for plan',
                InFlightElsewhere: undefined,
            });
            // 409: the same key is still being processed by a racing request, which is not a problem for a person.
            expect(await driver.CreateProviderSubscription(request)).toMatchObject({ Success: false, InFlightElsewhere: true, Reason: expect.stringMatching(/in-progress/) });
            await expect(driver.CreateProviderSubscription(request)).rejects.toThrow(/503/);
        } finally {
            restore();
        }
    });

    it('the stub refuses without calling Stripe: an invented sub_ would stop Orders renewing with nobody billing', async () => {
        const { driver, sent, restore } = live([], { IsLiveMode: false });
        try {
            const result = await driver.CreateProviderSubscription(request);
            expect(result.Success).toBe(false);
            expect(result.Reason).toMatch(/IsLiveMode = 0/);
            expect(result.ProviderSubscriptionID).toBeUndefined();
            expect(sent).toHaveLength(0);
        } finally {
            restore();
        }
    });

    it('refuses a quantity Stripe cannot bill, without calling Stripe', async () => {
        const { driver, sent, restore } = live([]);
        try {
            expect((await driver.CreateProviderSubscription({ ...request, Quantity: 0 })).Success).toBe(false);
            expect((await driver.CreateProviderSubscription({ ...request, Quantity: 1.5 })).Success).toBe(false);
            expect(sent).toHaveLength(0);
        } finally {
            restore();
        }
    });
});

describe('StripePaymentProvider.FindProviderSubscriptions', () => {
    it("lists the customer's subscriptions of every status and keeps the ones carrying the Orders id", async () => {
        const { driver, sent, restore } = live([
            {
                body: {
                    object: 'list',
                    has_more: false,
                    data: [
                        { id: 'sub_mine', status: 'active', metadata: { OrdersSubscriptionID: 'sub-1' } },
                        { id: 'sub_old', status: 'canceled', metadata: { OrdersSubscriptionID: 'sub-1' } },
                        { id: 'sub_other', status: 'active', metadata: { OrdersSubscriptionID: 'sub-2' } },
                        { id: 'sub_none', status: 'active', metadata: {} },
                    ],
                },
            },
        ]);
        try {
            const result = await driver.FindProviderSubscriptions({ ProviderCustomerRef: 'cus_jane', MetadataKey: 'OrdersSubscriptionID', MetadataValue: 'sub-1' });
            expect(result.Subscriptions).toEqual([
                { ProviderSubscriptionID: 'sub_mine', Status: 'active', IsLive: true, Metadata: { OrdersSubscriptionID: 'sub-1' } },
                { ProviderSubscriptionID: 'sub_old', Status: 'canceled', IsLive: false, Metadata: { OrdersSubscriptionID: 'sub-1' } },
            ]);
            const url = new URL(sent[0].url);
            expect(url.pathname).toBe('/v1/subscriptions');
            expect(url.searchParams.get('customer')).toBe('cus_jane');
            expect(url.searchParams.get('status')).toBe('all');
        } finally {
            restore();
        }
    });

    it('reports a refused read as a refusal, not as "none found"', async () => {
        const { driver, restore } = live([{ status: 403, body: { error: { message: 'The key lacks Subscriptions: Read' } } }]);
        try {
            expect(await driver.FindProviderSubscriptions({ ProviderCustomerRef: 'cus_jane', MetadataKey: 'OrdersSubscriptionID', MetadataValue: 'sub-1' })).toEqual({
                Success: false,
                Reason: 'The key lacks Subscriptions: Read',
            });
        } finally {
            restore();
        }
    });
});

describe("Stripe's first-charge limit", () => {
    it('is creation + one year to the second, with 29 Feb moved to 28 Feb (proven in a Stripe sandbox)', () => {
        expect(OneYearLaterAsStripeCounts(new Date('2028-02-29T12:00:00Z')).toISOString()).toBe('2029-02-28T12:00:00.000Z');
        expect(OneYearLaterAsStripeCounts(new Date('2027-01-31T12:00:00Z')).toISOString()).toBe('2028-01-31T12:00:00.000Z');
        expect(OneYearLaterAsStripeCounts(new Date('2026-11-01T01:30:00Z')).toISOString()).toBe('2027-11-01T01:30:00.000Z');
        const driver = new StripePaymentProvider();
        driver.Config = config();
        expect(driver.LatestFirstChargeAt(new Date('2028-02-29T06:30:00Z'))?.toISOString()).toBe('2029-02-28T06:30:00.000Z');
    });
});

describe('the subscription calls carry a timeout; the payment calls do not', () => {
    it('create, list and price each pass an abort signal, so a hung connection cannot hold a checkout', async () => {
        const { driver, sent, restore } = live([
            { body: activeSubscription },
            { body: { object: 'list', has_more: false, data: [] } },
            { body: { id: 'price_pro_599', active: true, recurring: { interval: 'year', interval_count: 1 } } },
        ]);
        try {
            await driver.CreateProviderSubscription(request);
            await driver.FindProviderSubscriptions({ ProviderCustomerRef: 'cus_jane', MetadataKey: 'OrdersSubscriptionID', MetadataValue: 'sub-1' });
            await driver.DescribeProviderPrice('price_pro_599');
            expect(sent).toHaveLength(3);
            for (const call of sent) expect(call.signal).toBeInstanceOf(AbortSignal);
        } finally {
            restore();
        }
    });

    it('a timeout is a fault (thrown), never a refusal', async () => {
        const driver = new StripePaymentProvider();
        driver.Config = config();
        driver.Credentials = { ApiKey: 'sk_test_fixture' };
        const orig = globalThis.fetch;
        globalThis.fetch = (async () => {
            throw new DOMException('The operation was aborted due to timeout', 'TimeoutError');
        }) as typeof fetch;
        try {
            await expect(driver.CreateProviderSubscription(request)).rejects.toThrow(/unreachable calling POST \/subscriptions: The operation was aborted due to timeout/);
        } finally {
            globalThis.fetch = orig;
        }
    });

    it('a payment call still sends no signal (its state after a timeout would be unknown)', async () => {
        const { driver, sent, restore } = live([{ body: { id: 'cus_new' } }]);
        try {
            await driver.EnsureCustomer({ BillToPersonID: 'person-1', Email: 'jane@example.com' } as never);
            expect(sent[0]?.signal ?? undefined).toBeUndefined();
        } finally {
            restore();
        }
    });
});

describe('StripePaymentProvider.DescribeProviderPrice', () => {
    it('reads whether the price is active and how often it bills', async () => {
        const { driver, sent, restore } = live([{ body: { id: 'price_pro_599', active: true, recurring: { interval: 'year', interval_count: 1 } } }]);
        try {
            expect(await driver.DescribeProviderPrice('price_pro_599')).toEqual({ Success: true, Active: true, Interval: { Unit: 'year', Count: 1 } });
            expect(new URL(sent[0].url).pathname).toBe('/v1/prices/price_pro_599');
            expect(sent[0].method).toBe('GET');
        } finally {
            restore();
        }
    });

    it('reports a one-time price as no interval, an archived one as inactive, and a refusal as a refusal', async () => {
        expect(StripePriceInterval({ type: 'one_time', recurring: null })).toBeNull();
        expect(StripePriceInterval({ recurring: { interval: 'month', interval_count: 3 } })).toEqual({ Unit: 'month', Count: 3 });
        const { driver, restore } = live([{ body: { id: 'p', active: false, recurring: { interval: 'year' } } }, { status: 404, body: { error: { message: 'No such price' } } }]);
        try {
            expect(await driver.DescribeProviderPrice('p')).toEqual({ Success: true, Active: false, Interval: { Unit: 'year', Count: 1 } });
            expect(await driver.DescribeProviderPrice('price_gone')).toEqual({ Success: false, Reason: 'No such price' });
        } finally {
            restore();
        }
    });
});

describe('StripeSubscriptionFromObject', () => {
    it('carries the price, the quantity and the anchor, so a found subscription can be compared with the plan', async () => {
        const { driver, restore } = live([
            {
                body: {
                    object: 'list',
                    has_more: false,
                    data: [{ id: 'sub_mine', status: 'active', billing_cycle_anchor: 1824872400, metadata: { OrdersSubscriptionID: 'sub-1' }, items: { data: [{ price: { id: 'price_pro_599' }, quantity: 2 }] } }],
                },
            },
        ]);
        try {
            const found = await driver.FindProviderSubscriptions({ ProviderCustomerRef: 'cus_jane', MetadataKey: 'OrdersSubscriptionID', MetadataValue: 'sub-1' });
            expect(found.Subscriptions?.[0]).toMatchObject({ ProviderPriceID: 'price_pro_599', Quantity: 2, FirstChargeAt: ANCHOR });
        } finally {
            restore();
        }
    });
});

describe('a Stripe answer without a subscription id', () => {
    it("maps to '' (never the string 'undefined'), which Orders refuses to record", async () => {
        const { driver, restore } = live([
            { body: { ...activeSubscription, id: undefined } },
            { body: { object: 'list', has_more: false, data: [{ status: 'active', metadata: { OrdersSubscriptionID: 'sub-1' } }] } },
        ]);
        try {
            expect((await driver.CreateProviderSubscription(request)).ProviderSubscriptionID).toBe('');
            const found = await driver.FindProviderSubscriptions({ ProviderCustomerRef: 'cus_jane', MetadataKey: 'OrdersSubscriptionID', MetadataValue: 'sub-1' });
            expect(found.Subscriptions?.[0].ProviderSubscriptionID).toBe('');
        } finally {
            restore();
        }
    });
});

describe("Stripe's first-charge limit for other periods", () => {
    it('is one period from creation: a month keeps the day, moved to the month end where it has none', () => {
        expect(OneIntervalLaterAsStripeCounts(new Date('2027-01-31T12:00:00Z'), { Unit: 'month', Count: 1 }).toISOString()).toBe('2027-02-28T12:00:00.000Z');
        expect(OneIntervalLaterAsStripeCounts(new Date('2027-11-15T12:00:00Z'), { Unit: 'month', Count: 3 }).toISOString()).toBe('2028-02-15T12:00:00.000Z');
        expect(OneIntervalLaterAsStripeCounts(new Date('2027-11-15T12:00:00Z'), { Unit: 'week', Count: 2 }).toISOString()).toBe('2027-11-29T12:00:00.000Z');
        const driver = new StripePaymentProvider();
        driver.Config = config();
        expect(driver.LatestFirstChargeAt(new Date('2027-01-31T12:00:00Z'), { Unit: 'month', Count: 1 })?.toISOString()).toBe('2027-02-28T12:00:00.000Z');
        // A yearly interval is exactly the sandbox-proven yearly limit.
        expect(driver.LatestFirstChargeAt(new Date('2028-02-29T06:30:00Z'), { Unit: 'year', Count: 1 })?.toISOString()).toBe('2029-02-28T06:30:00.000Z');
    });
});

describe('BasePaymentProvider', () => {
    it('refuses to create or find gateway subscriptions, and knows no first-charge limit', async () => {
        const base = new BasePaymentProvider();
        base.Config = config({ TypeCode: 'Manual' });
        const created = await base.CreateProviderSubscription(request);
        expect(created.Success).toBe(false);
        expect(created.Reason).toMatch(/'Manual' payment provider does not support creating a gateway-billed subscription/);
        const found = await base.FindProviderSubscriptions({ ProviderCustomerRef: 'c', MetadataKey: 'k', MetadataValue: 'v' });
        expect(found.Success).toBe(false);
        expect((await base.DescribeProviderPrice('price_x')).Success).toBe(false);
        expect(base.LatestFirstChargeAt(new Date())).toBeNull();
    });
});
