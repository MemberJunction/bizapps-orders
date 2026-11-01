/**
 * The gateway half of option E, E2: Stripe's `CreateProviderSubscription`, `FindProviderSubscriptions`,
 * `DescribeProviderPrice` and the anchor limit, against a fake `fetch`; and the base driver's refusal.
 *
 * The request shape is the one proven in a Stripe sandbox: `billing_cycle_anchor` with
 * `proration_behavior=none` charges nothing at creation; `billing_cycle_anchor_config` charged a full
 * year at once and must never be sent.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BasePaymentProvider, type PaymentProviderConfig } from '../BasePaymentProvider.js';
import {
    OneIntervalLaterAsStripeCounts,
    OneYearLaterAsStripeCounts,
    PlanStripeCancel,
    StripeCancelState,
    StripeChargedAtCreation,
    StripePaymentProvider,
    StripePriceInterval,
    StripeSubscriptionBilling,
    StripeSubscriptionFromObject,
    type StripeCancelStateFacts,
} from '../StripePaymentProvider.js';

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

// ─── E2b: cancelling a Stripe-billed subscription ──────────────────────────────────────────────────
//
// The running example: Jane's term 1 ends 30 Oct 2027. Stripe's period ends 00:00 Central on 30 Oct
// 2027 (05:00 UTC, CDT), the charge E2 anchored on the term's last day. Sess cancels at end of term on
// 3 Mar 2027 (09:00 CST = 15:00 UTC), so Orders asks for nothing after 00:00 Central on 31 Oct 2027
// (05:00 UTC, still CDT: DST ends 7 Nov 2027).

/** 3 Mar 2027 09:00 Central (CST). */
const CANCEL_NOW = new Date('2027-03-03T15:00:00Z');
/** Stripe's current_period_end: 00:00 CDT 30 Oct 2027 = 1824872400. */
const PERIOD_END = new Date('2027-10-30T05:00:00Z');
/** Orders' end of coverage for an end-of-term cancel: 00:00 CDT 31 Oct 2027 = 1824958800. */
const WANTED = new Date('2027-10-31T05:00:00Z');
/** A cancel effective 15 Jun 2027: nothing after 00:00 CDT 16 Jun 2027 = 1813122000, inside the period. */
const MID = new Date('2027-06-16T05:00:00Z');
/** A later instant: 00:00 CST 30 Nov 2027 = 1827554400, after the period end. */
const LATER = new Date('2027-11-30T06:00:00Z');

const facts = (overrides: Partial<StripeCancelStateFacts> = {}): StripeCancelStateFacts => ({
    Status: 'active',
    CurrentPeriodEnd: PERIOD_END,
    CancelAtPeriodEnd: false,
    CancelAt: null,
    ...overrides,
});

describe('PlanStripeCancel (E2b)', () => {
    it('Jane already cancelled in Stripe (canceled, incomplete_expired): AlreadyEnded at now, whatever was asked', () => {
        for (const Status of ['canceled', 'incomplete_expired']) {
            expect(PlanStripeCancel(facts({ Status }), WANTED, CANCEL_NOW)).toEqual({ Action: 'None', Outcome: 'AlreadyEnded', BillingEndsAt: CANCEL_NOW });
            expect(PlanStripeCancel(facts({ Status }), null, CANCEL_NOW)).toEqual({ Action: 'None', Outcome: 'AlreadyEnded', BillingEndsAt: CANCEL_NOW });
        }
        // Control: the same facts while active are not "ended".
        expect(PlanStripeCancel(facts(), null, CANCEL_NOW)).toEqual({ Action: 'CancelNow' });
    });

    it('Jane already set to end at her period end (30 Oct 2027), asked for 31 Oct: AlreadyEnding at 30 Oct, no change', () => {
        expect(PlanStripeCancel(facts({ CancelAtPeriodEnd: true, CancelAt: PERIOD_END }), WANTED, CANCEL_NOW)).toEqual({
            Action: 'None',
            Outcome: 'AlreadyEnding',
            BillingEndsAt: PERIOD_END,
        });
        // Boundary: the period ends exactly at the wanted instant → still AlreadyEnding (≤, not <).
        expect(PlanStripeCancel(facts({ CancelAtPeriodEnd: true }), PERIOD_END, CANCEL_NOW)).toEqual({
            Action: 'None',
            Outcome: 'AlreadyEnding',
            BillingEndsAt: PERIOD_END,
        });
    });

    it('set to end at its period end, but asked for 16 Jun 2027 (inside the period): must act → CancelAt 16 Jun', () => {
        expect(PlanStripeCancel(facts({ CancelAtPeriodEnd: true }), MID, CANCEL_NOW)).toEqual({ Action: 'CancelAt', BillingEndsAt: MID });
    });

    it('cancel_at 16 Jun 2027 already set, asked for 31 Oct 2027: AlreadyEnding at 16 Jun', () => {
        expect(PlanStripeCancel(facts({ CancelAt: MID }), WANTED, CANCEL_NOW)).toEqual({ Action: 'None', Outcome: 'AlreadyEnding', BillingEndsAt: MID });
        // Boundary: cancel_at exactly the wanted instant.
        expect(PlanStripeCancel(facts({ CancelAt: WANTED }), WANTED, CANCEL_NOW)).toEqual({ Action: 'None', Outcome: 'AlreadyEnding', BillingEndsAt: WANTED });
    });

    it('cancel_at later than wanted is NOT already ending: cancel_at 30 Oct asked 16 Jun → CancelAt 16 Jun; cancel_at 30 Nov asked 31 Oct → AtPeriodEnd', () => {
        expect(PlanStripeCancel(facts({ CancelAt: PERIOD_END }), MID, CANCEL_NOW)).toEqual({ Action: 'CancelAt', BillingEndsAt: MID });
        expect(PlanStripeCancel(facts({ CancelAt: LATER }), WANTED, CANCEL_NOW)).toEqual({ Action: 'AtPeriodEnd', BillingEndsAt: PERIOD_END });
    });

    it('asked for now (null) → CancelNow', () => {
        expect(PlanStripeCancel(facts(), null, CANCEL_NOW)).toEqual({ Action: 'CancelNow' });
        expect(PlanStripeCancel(facts({ Status: 'trialing' }), null, CANCEL_NOW)).toEqual({ Action: 'CancelNow' });
    });

    it('an instant already passed (2 Mar 2027 while it is 3 Mar), or exactly now, → CancelNow', () => {
        expect(PlanStripeCancel(facts(), new Date('2027-03-02T06:00:00Z'), CANCEL_NOW)).toEqual({ Action: 'CancelNow' });
        expect(PlanStripeCancel(facts(), new Date(CANCEL_NOW.getTime()), CANCEL_NOW)).toEqual({ Action: 'CancelNow' });
        // Control: one millisecond later is a future instant inside the period → CancelAt.
        const justAfter = new Date(CANCEL_NOW.getTime() + 1);
        expect(PlanStripeCancel(facts(), justAfter, CANCEL_NOW)).toEqual({ Action: 'CancelAt', BillingEndsAt: justAfter });
    });

    it('past_due, unpaid, incomplete, paused with a future instant (31 Oct 2027) → CancelNow (Stripe may be collecting a renewal Orders never sold)', () => {
        for (const Status of ['past_due', 'unpaid', 'incomplete', 'paused']) {
            expect(PlanStripeCancel(facts({ Status }), WANTED, CANCEL_NOW)).toEqual({ Action: 'CancelNow' });
        }
    });

    it('active, period ends 30 Oct 2027 before 31 Oct → AtPeriodEnd at 30 Oct; trialing likewise', () => {
        expect(PlanStripeCancel(facts(), WANTED, CANCEL_NOW)).toEqual({ Action: 'AtPeriodEnd', BillingEndsAt: PERIOD_END });
        expect(PlanStripeCancel(facts({ Status: 'trialing' }), WANTED, CANCEL_NOW)).toEqual({ Action: 'AtPeriodEnd', BillingEndsAt: PERIOD_END });
    });

    it('boundary: the period ends EXACTLY at the wanted instant (30 Oct 05:00 UTC) → AtPeriodEnd, not CancelAt', () => {
        expect(PlanStripeCancel(facts(), PERIOD_END, CANCEL_NOW)).toEqual({ Action: 'AtPeriodEnd', BillingEndsAt: PERIOD_END });
        // One second earlier falls inside the period → CancelAt.
        const before = new Date(PERIOD_END.getTime() - 1000);
        expect(PlanStripeCancel(facts(), before, CANCEL_NOW)).toEqual({ Action: 'CancelAt', BillingEndsAt: before });
    });

    it('active, cancel effective 15 Jun 2027 (inside the period) → CancelAt 00:00 CDT 16 Jun 2027', () => {
        expect(PlanStripeCancel(facts(), MID, CANCEL_NOW)).toEqual({ Action: 'CancelAt', BillingEndsAt: MID });
        expect(PlanStripeCancel(facts({ Status: 'trialing' }), MID, CANCEL_NOW)).toEqual({ Action: 'CancelAt', BillingEndsAt: MID });
    });
});

describe('StripeCancelState (E2b)', () => {
    it("reads Jane's subscription: seconds become instants", () => {
        expect(
            StripeCancelState({ status: 'active', current_period_end: 1824872400, cancel_at_period_end: true, cancel_at: 1813122000 }),
        ).toEqual({ Status: 'active', CurrentPeriodEnd: PERIOD_END, CancelAtPeriodEnd: true, CancelAt: MID });
    });

    it('cancel_at_period_end is true only for boolean true', () => {
        for (const v of ['true', 1, 'yes', null, undefined, false]) {
            expect(StripeCancelState({ status: 'active', cancel_at_period_end: v }).CancelAtPeriodEnd).toBe(false);
        }
    });

    it('null, 0, negative or garbage seconds become null; a missing status is ""', () => {
        for (const v of [null, undefined, 0, -5, 'garbage', {}, Number.NaN]) {
            const state = StripeCancelState({ current_period_end: v, cancel_at: v });
            expect(state.CurrentPeriodEnd).toBeNull();
            expect(state.CancelAt).toBeNull();
            expect(state.Status).toBe('');
        }
        // A numeric string is seconds too (Stripe never sends one, but it is unambiguous).
        expect(StripeCancelState({ cancel_at: '1813122000' }).CancelAt).toEqual(MID);
    });
});

describe('StripeSubscriptionFromObject IsLive for every Stripe status (R3)', () => {
    it('active, trialing, past_due, unpaid, incomplete, paused are live; canceled and incomplete_expired are ended', () => {
        const live = ['active', 'trialing', 'past_due', 'unpaid', 'incomplete', 'paused'];
        const ended = ['canceled', 'incomplete_expired'];
        for (const status of live) expect({ status, IsLive: StripeSubscriptionFromObject({ id: 'sub_x', status }).IsLive }).toEqual({ status, IsLive: true });
        for (const status of ended) expect({ status, IsLive: StripeSubscriptionFromObject({ id: 'sub_x', status }).IsLive }).toEqual({ status, IsLive: false });
    });
});

describe('StripePaymentProvider.CancelProviderSubscription (E2b)', () => {
    const KEY = 'provider-subscription-cancel:sub-1:sub_x:1824958800';
    const subscription = (overrides: Record<string, unknown> = {}) => ({
        id: 'sub_x',
        object: 'subscription',
        status: 'active',
        current_period_end: 1824872400,
        cancel_at_period_end: false,
        cancel_at: null,
        ...overrides,
    });
    const URL_X = 'https://api.stripe.com/v1/subscriptions/sub_x';

    beforeEach(() => {
        vi.useFakeTimers({ toFake: ['Date'] });
        vi.setSystemTime(CANCEL_NOW);
    });
    afterEach(() => {
        vi.useRealTimers();
    });

    it('a stub account (IsLiveMode = 0) refuses and never calls Stripe', async () => {
        const { driver, sent, restore } = live([], { IsLiveMode: false });
        try {
            const result = await driver.CancelProviderSubscription({ ProviderSubscriptionID: 'sub_x', BillingEndsAt: null, IdempotencyKey: KEY });
            expect(result.Success).toBe(false);
            expect(result.Reason).toMatch(/IsLiveMode = 0/);
            expect(result.Reason).toMatch(/sub_x/);
            expect(result.Outcome).toBeUndefined();
            expect(sent).toHaveLength(0);
        } finally {
            restore();
        }
    });

    it("GET 404: refuses with Stripe's own message and changes nothing", async () => {
        const { driver, sent, restore } = live([{ status: 404, body: { error: { message: "No such subscription: 'sub_x'" } } }]);
        try {
            expect(await driver.CancelProviderSubscription({ ProviderSubscriptionID: 'sub_x', BillingEndsAt: WANTED, IdempotencyKey: KEY })).toEqual({
                Success: false,
                Reason: "Stripe could not find sub_x: No such subscription: 'sub_x'",
            });
            expect(sent).toHaveLength(1);
            expect(sent[0].method).toBe('GET');
        } finally {
            restore();
        }
    });

    it('Jane already canceled in the Stripe dashboard: AlreadyEnded, no DELETE', async () => {
        const { driver, sent, restore } = live([{ body: subscription({ status: 'canceled' }) }]);
        try {
            expect(await driver.CancelProviderSubscription({ ProviderSubscriptionID: 'sub_x', BillingEndsAt: null, IdempotencyKey: KEY })).toEqual({
                Success: true,
                Outcome: 'AlreadyEnded',
                BillingEndsAt: CANCEL_NOW,
                Status: 'canceled',
            });
            expect(sent.map((s) => s.method)).toEqual(['GET']);
            expect(sent[0].url).toBe(URL_X);
        } finally {
            restore();
        }
    });

    it('immediate cancel (BillingEndsAt null): exactly one DELETE /v1/subscriptions/sub_x, no Idempotency-Key, Stripe-Version 2024-06-20', async () => {
        const { driver, sent, restore } = live([{ body: subscription() }, { body: subscription({ status: 'canceled' }) }]);
        try {
            expect(await driver.CancelProviderSubscription({ ProviderSubscriptionID: 'sub_x', BillingEndsAt: null, IdempotencyKey: KEY })).toEqual({
                Success: true,
                Outcome: 'CanceledNow',
                BillingEndsAt: CANCEL_NOW,
                Status: 'canceled',
            });
            expect(sent.map((s) => `${s.method} ${s.url}`)).toEqual([`GET ${URL_X}`, `DELETE ${URL_X}`]);
            expect(sent[1].headers['Idempotency-Key']).toBeUndefined();
            expect([...sent[1].body.keys()]).toEqual([]);
            for (const call of sent) {
                expect(call.headers['Stripe-Version']).toBe('2024-06-20');
                expect(call.signal).toBeInstanceOf(AbortSignal);
            }
        } finally {
            restore();
        }
    });

    it('end of term (31 Oct 2027): POST cancel_at_period_end=true with the idempotency key → EndsAtPeriodEnd at 30 Oct', async () => {
        const { driver, sent, restore } = live([{ body: subscription() }, { body: subscription({ cancel_at_period_end: true, cancel_at: 1824872400 }) }]);
        try {
            expect(await driver.CancelProviderSubscription({ ProviderSubscriptionID: 'sub_x', BillingEndsAt: WANTED, IdempotencyKey: KEY })).toEqual({
                Success: true,
                Outcome: 'EndsAtPeriodEnd',
                BillingEndsAt: PERIOD_END,
                Status: 'active',
            });
            expect(sent.map((s) => `${s.method} ${s.url}`)).toEqual([`GET ${URL_X}`, `POST ${URL_X}`]);
            expect(Object.fromEntries(sent[1].body)).toEqual({ cancel_at_period_end: 'true' });
            expect(sent[1].headers['Idempotency-Key']).toBe(KEY);
            expect(sent[0].headers['Idempotency-Key']).toBeUndefined();
            expect(sent[1].headers['Stripe-Version']).toBe('2024-06-20');
        } finally {
            restore();
        }
    });

    it('mid-period (cancel effective 15 Jun 2027): POST cancel_at=1813122000 (seconds, floored) and proration_behavior=none → EndsAt', async () => {
        const { driver, sent, restore } = live([{ body: subscription() }, { body: subscription({ cancel_at: 1813122000 }) }]);
        try {
            const wantedWithMs = new Date(MID.getTime() + 999);
            expect(await driver.CancelProviderSubscription({ ProviderSubscriptionID: 'sub_x', BillingEndsAt: wantedWithMs, IdempotencyKey: KEY })).toEqual({
                Success: true,
                Outcome: 'EndsAt',
                BillingEndsAt: MID,
                Status: 'active',
            });
            expect(sent[1].method).toBe('POST');
            expect(Object.fromEntries(sent[1].body)).toEqual({ cancel_at: '1813122000', proration_behavior: 'none' });
            expect(sent[1].headers['Idempotency-Key']).toBe(KEY);
        } finally {
            restore();
        }
    });

    it('two people press Cancel: the POST is refused (400) but a re-read shows it already ending → Success, AlreadyEnding', async () => {
        const { driver, sent, restore } = live([
            { body: subscription() },
            { status: 400, body: { error: { message: 'Keys for idempotent requests can only be used with the same parameters they were first used with.' } } },
            { body: subscription({ cancel_at_period_end: true, cancel_at: 1824872400 }) },
        ]);
        try {
            expect(await driver.CancelProviderSubscription({ ProviderSubscriptionID: 'sub_x', BillingEndsAt: WANTED, IdempotencyKey: KEY })).toEqual({
                Success: true,
                Outcome: 'AlreadyEnding',
                BillingEndsAt: PERIOD_END,
                Status: 'active',
            });
            expect(sent.map((s) => s.method)).toEqual(['GET', 'POST', 'GET']);
        } finally {
            restore();
        }
    });

    it('the DELETE is refused but a re-read shows it canceled → Success, AlreadyEnded', async () => {
        const { driver, sent, restore } = live([
            { body: subscription() },
            { status: 404, body: { error: { message: "No such subscription: 'sub_x'" } } },
            { body: subscription({ status: 'canceled' }) },
        ]);
        try {
            expect(await driver.CancelProviderSubscription({ ProviderSubscriptionID: 'sub_x', BillingEndsAt: null, IdempotencyKey: KEY })).toMatchObject({
                Success: true,
                Outcome: 'AlreadyEnded',
                Status: 'canceled',
            });
            expect(sent.map((s) => s.method)).toEqual(['GET', 'DELETE', 'GET']);
        } finally {
            restore();
        }
    });

    it("the POST is refused and the re-read still shows it billing → Success false, naming Stripe's reason", async () => {
        const { driver, sent, restore } = live([
            { body: subscription() },
            { status: 400, body: { error: { message: 'This subscription is managed by a subscription schedule.' } } },
            { body: subscription() },
        ]);
        try {
            expect(await driver.CancelProviderSubscription({ ProviderSubscriptionID: 'sub_x', BillingEndsAt: WANTED, IdempotencyKey: KEY })).toEqual({
                Success: false,
                Reason: 'Stripe refused to cancel sub_x: This subscription is managed by a subscription schedule.',
            });
            expect(sent.map((s) => s.method)).toEqual(['GET', 'POST', 'GET']);
        } finally {
            restore();
        }
    });

    it('the POST is refused and the re-read is refused too → Success false with the POST reason', async () => {
        const { driver, restore } = live([
            { body: subscription() },
            { status: 400, body: { error: { message: 'Refused.' } } },
            { status: 403, body: { error: { message: 'The key lacks Subscriptions: Read' } } },
        ]);
        try {
            expect(await driver.CancelProviderSubscription({ ProviderSubscriptionID: 'sub_x', BillingEndsAt: WANTED, IdempotencyKey: KEY })).toEqual({
                Success: false,
                Reason: 'Stripe refused to cancel sub_x: Refused.',
            });
        } finally {
            restore();
        }
    });

    it('the POST "succeeds" but the returned subscription still bills after 31 Oct → Success false (verified, not trusted)', async () => {
        const { driver, restore } = live([{ body: subscription() }, { body: subscription() }]);
        try {
            const result = await driver.CancelProviderSubscription({ ProviderSubscriptionID: 'sub_x', BillingEndsAt: WANTED, IdempotencyKey: KEY });
            expect(result.Success).toBe(false);
            expect(result.Reason).toBe("Stripe accepted the cancel of sub_x but it still shows as billing (status 'active').");
            expect(result.Outcome).toBeUndefined();
        } finally {
            restore();
        }
    });

    it('the DELETE "succeeds" but the returned subscription is still active → Success false', async () => {
        const { driver, restore } = live([{ body: subscription() }, { body: subscription() }]);
        try {
            expect((await driver.CancelProviderSubscription({ ProviderSubscriptionID: 'sub_x', BillingEndsAt: null, IdempotencyKey: KEY })).Success).toBe(false);
        } finally {
            restore();
        }
    });

    it('a 5xx on the read or on the change throws (a fault; the caller catches it)', async () => {
        const { driver, restore } = live([{ status: 503, body: {} }, { body: subscription() }, { status: 500, body: {} }]);
        try {
            await expect(driver.CancelProviderSubscription({ ProviderSubscriptionID: 'sub_x', BillingEndsAt: null, IdempotencyKey: KEY })).rejects.toThrow(/503 calling GET \/subscriptions\/sub_x/);
            await expect(driver.CancelProviderSubscription({ ProviderSubscriptionID: 'sub_x', BillingEndsAt: WANTED, IdempotencyKey: KEY })).rejects.toThrow(/500 calling POST \/subscriptions\/sub_x/);
        } finally {
            restore();
        }
    });

    it('the base driver refuses a cancel', async () => {
        const base = new BasePaymentProvider();
        base.Config = config({ TypeCode: 'Manual' });
        const result = await base.CancelProviderSubscription({ ProviderSubscriptionID: 'sub_x', BillingEndsAt: null, IdempotencyKey: KEY });
        expect(result.Success).toBe(false);
        expect(result.Reason).toMatch(/'Manual' payment provider does not support cancelling a gateway-billed subscription/);
    });
});

/**
 * E2b: where a Stripe subscription's billing stands. Jane's subscription was created 2025-12-31T06:00Z
 * (00:00 CST) and renews 2026-12-31T06:00Z (00:00 CST on her term's last day).
 */
describe('StripeSubscriptionBilling (E2b)', () => {
    const START_S = 1767160800; // 2025-12-31T06:00:00Z
    const END_S = 1798696800; // 2026-12-31T06:00:00Z
    const CANCEL_AT_S = 1785564000; // 2026-08-01T06:00:00Z
    const START = new Date('2025-12-31T06:00:00.000Z');
    const END = new Date('2026-12-31T06:00:00.000Z');
    const object = (overrides: Record<string, unknown> = {}) => ({
        id: 'sub_x',
        status: 'active',
        current_period_start: START_S,
        current_period_end: END_S,
        cancel_at_period_end: false,
        cancel_at: null,
        ...overrides,
    });

    it('the fixture instants are what the comments say', () => {
        expect(new Date(START_S * 1000).toISOString()).toBe('2025-12-31T06:00:00.000Z');
        expect(new Date(END_S * 1000).toISOString()).toBe('2026-12-31T06:00:00.000Z');
        expect(new Date(CANCEL_AT_S * 1000).toISOString()).toBe('2026-08-01T06:00:00.000Z');
    });

    it('active, not set to end → Renewing at current_period_end, with the period start', () => {
        expect(StripeSubscriptionBilling(object())).toEqual({ State: 'Renewing', CurrentPeriodStart: START, CurrentPeriodEnd: END, EndsAt: null, Status: 'active' });
    });

    it('trialing, not set to end → Renewing', () => {
        expect(StripeSubscriptionBilling(object({ status: 'trialing' }))).toEqual({ State: 'Renewing', CurrentPeriodStart: START, CurrentPeriodEnd: END, EndsAt: null, Status: 'trialing' });
    });

    it('active/trialing with cancel_at_period_end → Ending at current_period_end', () => {
        for (const status of ['active', 'trialing']) {
            expect(StripeSubscriptionBilling(object({ status, cancel_at_period_end: true }))).toEqual({ State: 'Ending', CurrentPeriodStart: START, CurrentPeriodEnd: END, EndsAt: END, Status: status });
        }
    });

    it('active/trialing with cancel_at (1 Aug 2026) → Ending at cancel_at', () => {
        for (const status of ['active', 'trialing']) {
            expect(StripeSubscriptionBilling(object({ status, cancel_at: CANCEL_AT_S }))).toEqual({
                State: 'Ending',
                CurrentPeriodStart: START,
                CurrentPeriodEnd: END,
                EndsAt: new Date('2026-08-01T06:00:00.000Z'),
                Status: status,
            });
        }
    });

    it('canceled and incomplete_expired → Ended (even if a cancel flag is still set)', () => {
        for (const status of ['canceled', 'incomplete_expired']) {
            expect(StripeSubscriptionBilling(object({ status }))).toEqual({ State: 'Ended', CurrentPeriodStart: START, CurrentPeriodEnd: END, EndsAt: null, Status: status });
            expect(StripeSubscriptionBilling(object({ status, cancel_at_period_end: true })).State).toBe('Ended');
        }
    });

    it('past_due, unpaid, incomplete, paused → Collecting (an unpaid charge may still be collected), even with a cancel flag set', () => {
        for (const status of ['past_due', 'unpaid', 'incomplete', 'paused']) {
            expect(StripeSubscriptionBilling(object({ status }))).toEqual({ State: 'Collecting', CurrentPeriodStart: START, CurrentPeriodEnd: END, EndsAt: null, Status: status });
            expect(StripeSubscriptionBilling(object({ status, cancel_at_period_end: true })).State).toBe('Collecting');
            expect(StripeSubscriptionBilling(object({ status, cancel_at: CANCEL_AT_S })).State).toBe('Collecting');
        }
    });

    it('an unknown or missing status → Collecting (never Renewing)', () => {
        expect(StripeSubscriptionBilling(object({ status: 'something_new' })).State).toBe('Collecting');
        expect(StripeSubscriptionBilling({ id: 'sub_x' }).State).toBe('Collecting');
    });

    it('current_period_start missing, null, 0 or not a number → CurrentPeriodStart null', () => {
        const { current_period_start: _omit, ...withoutStart } = object();
        expect(StripeSubscriptionBilling(withoutStart).CurrentPeriodStart).toBeNull();
        expect(StripeSubscriptionBilling(object({ current_period_start: null })).CurrentPeriodStart).toBeNull();
        expect(StripeSubscriptionBilling(object({ current_period_start: 0 })).CurrentPeriodStart).toBeNull();
        expect(StripeSubscriptionBilling(object({ current_period_start: 'soon' })).CurrentPeriodStart).toBeNull();
    });
});

describe('StripePaymentProvider.DescribeProviderSubscription (E2b)', () => {
    const URL_X = 'https://api.stripe.com/v1/subscriptions/sub_x';

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('a stub account (IsLiveMode = 0) refuses, naming sub_x, and never calls Stripe', async () => {
        const { driver, sent, restore } = live([], { IsLiveMode: false });
        try {
            const result = await driver.DescribeProviderSubscription('sub_x');
            expect(result.Success).toBe(false);
            expect(result.Reason).toMatch(/IsLiveMode = 0/);
            expect(result.Reason).toMatch(/sub_x/);
            expect(result.State).toBeUndefined();
            expect(sent).toHaveLength(0);
        } finally {
            restore();
        }
    });

    it('one GET /v1/subscriptions/sub_x?expand[]=customer with the 15 s subscription timeout, Stripe-Version 2024-06-20, no body; maps the state and the details', async () => {
        const timeout = vi.spyOn(AbortSignal, 'timeout');
        const { driver, sent, restore } = live([
            {
                body: {
                    id: 'sub_x',
                    object: 'subscription',
                    status: 'active',
                    current_period_start: 1798696800,
                    current_period_end: 1830232800,
                    cancel_at_period_end: false,
                    cancel_at: null,
                    // E3: the customer (expanded, for its e-mail), the price and quantity it bills, its metadata.
                    customer: { id: 'cus_jane', email: 'jane@example.com' },
                    items: { data: [{ price: { id: 'price_pro' }, quantity: 1 }] },
                    metadata: { OrdersSubscriptionID: 'sub-guid' },
                },
            },
        ]);
        try {
            expect(await driver.DescribeProviderSubscription('sub_x')).toEqual({
                Success: true,
                State: 'Renewing',
                CurrentPeriodStart: new Date('2026-12-31T06:00:00.000Z'),
                CurrentPeriodEnd: new Date('2027-12-31T06:00:00.000Z'),
                EndsAt: null,
                Status: 'active',
                EndedAt: null,
                ProviderPriceID: 'price_pro',
                Quantity: 1,
                ProviderCustomerRef: 'cus_jane',
                CustomerEmail: 'jane@example.com',
                Metadata: { OrdersSubscriptionID: 'sub-guid' },
            });
            expect(sent).toHaveLength(1);
            expect(sent[0].method).toBe('GET');
            expect(sent[0].url).toBe(`${URL_X}?expand[]=customer`);
            expect(sent[0].headers['Stripe-Version']).toBe('2024-06-20');
            expect(sent[0].headers['Idempotency-Key']).toBeUndefined();
            expect([...sent[0].body.keys()]).toEqual([]);
            expect(sent[0].signal).toBeInstanceOf(AbortSignal);
            expect(timeout).toHaveBeenCalledWith(15_000);
        } finally {
            restore();
        }
    });

    it('maps an Ending answer (cancel_at_period_end) through the driver', async () => {
        const { driver, restore } = live([
            { body: { id: 'sub_x', status: 'active', current_period_start: 1767160800, current_period_end: 1798696800, cancel_at_period_end: true } },
        ]);
        try {
            const result = await driver.DescribeProviderSubscription('sub_x');
            expect(result).toMatchObject({ Success: true, State: 'Ending', EndsAt: new Date('2026-12-31T06:00:00.000Z'), Status: 'active' });
        } finally {
            restore();
        }
    });

    it("the id is URL-encoded into the path", async () => {
        const { driver, sent, restore } = live([{ body: { id: 'sub/x', status: 'canceled' } }]);
        try {
            expect((await driver.DescribeProviderSubscription('sub/x')).State).toBe('Ended');
            expect(sent[0].url).toBe('https://api.stripe.com/v1/subscriptions/sub%2Fx?expand[]=customer');
        } finally {
            restore();
        }
    });

    it.each([
        ['an unreadable body (parsed as {})', {}],
        ['no status', { id: 'sub_x', current_period_start: 1798696800 }],
        ['an empty status', { id: 'sub_x', status: '  ' }],
        ['another subscription', { id: 'sub_other', status: 'active', current_period_start: 1767160800 }],
        ['an active one naming no period', { id: 'sub_x', status: 'active' }],
        ['an unknown status', { id: 'sub_x', status: 'weird', current_period_start: 1767160800 }],
        ['a period that is not a number', { id: 'sub_x', status: 'active', current_period_start: 'abc' }],
    ])('fails closed on a 2xx that is not this subscription: %s → Success false, no State (a cancel then refuses, nothing sent)', async (_, body) => {
        const { driver, restore } = live([{ body: body as Record<string, unknown> }]);
        try {
            const result = await driver.DescribeProviderSubscription('sub_x');
            expect(result.Success).toBe(false);
            expect(result.State).toBeUndefined();
            expect(result.Reason).toMatch(/treated as a failed read/);
        } finally {
            restore();
        }
    });

    it('a 2025-03-31.basil shape (the period on the item, not the subscription) is read from the item', async () => {
        const { driver, restore } = live([
            { body: { id: 'sub_x', status: 'active', items: { data: [{ price: { id: 'price_pro' }, quantity: 1, current_period_start: 1798696800, current_period_end: 1830232800 }] } } },
        ]);
        try {
            expect(await driver.DescribeProviderSubscription('sub_x')).toMatchObject({
                Success: true,
                State: 'Renewing',
                CurrentPeriodStart: new Date('2026-12-31T06:00:00.000Z'),
                CurrentPeriodEnd: new Date('2027-12-31T06:00:00.000Z'),
            });
        } finally {
            restore();
        }
    });

    it("a 404 → Success false naming sub_x and Stripe's message, no State", async () => {
        const { driver, sent, restore } = live([{ status: 404, body: { error: { message: "No such subscription: 'sub_x'" } } }]);
        try {
            const result = await driver.DescribeProviderSubscription('sub_x');
            expect(result.Success).toBe(false);
            expect(result.Reason).toMatch(/^Stripe could not read sub_x: /);
            expect(result.Reason).toContain("No such subscription: 'sub_x'");
            expect(result.State).toBeUndefined();
            expect(sent).toHaveLength(1);
        } finally {
            restore();
        }
    });

    it('a 403 (key lacks Subscriptions: Read) → Success false naming sub_x', async () => {
        const { driver, restore } = live([{ status: 403, body: { error: { message: 'The key lacks Subscriptions: Read' } } }]);
        try {
            const result = await driver.DescribeProviderSubscription('sub_x');
            expect(result.Success).toBe(false);
            expect(result.Reason).toContain('sub_x');
            expect(result.Reason).toContain('The key lacks Subscriptions: Read');
        } finally {
            restore();
        }
    });

    it('the base driver refuses to read', async () => {
        const base = new BasePaymentProvider();
        base.Config = config({ TypeCode: 'Manual' });
        const result = await base.DescribeProviderSubscription('sub_x');
        expect(result.Success).toBe(false);
        expect(result.Reason).toMatch(/'Manual' payment provider does not support reading a gateway-billed subscription/);
    });
});
