/**
 * The webhook's subscription branch (E3). No network, no database: the resolver, the driver, the data layer,
 * the sync and the alert are replaced; the delivery rows the handler writes are captured.
 *
 *   · an event for a subscription Orders records → the sync runs; Applied (200), or Failed (500) so the
 *     gateway redelivers;
 *   · the same event again → AlreadyApplied, no second sync;
 *   · a gateway subscription no Orders subscription records → classified: Orders' own in-flight hand-over,
 *     not ours, or unknown on a mapped price (one alert, only when the gateway starts billing it);
 *   · control: a payment_intent event still takes the intent path.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { WebhookEvent } from '../BasePaymentProvider.js';

const PROVIDER_ID = '11111111-2222-4333-8444-555555555555';
const SUB_ID = 'bbbbbbbb-2222-4333-8444-555555555555';

interface Row {
    [key: string]: unknown;
}

const state = vi.hoisted(() => ({
    event: null as WebhookEvent | null,
    subscriptions: [] as Row[],
    mappedPrices: [] as string[],
    deliveries: [] as Row[],
    saved: [] as Row[],
    describe: { Success: true, State: 'Renewing', ProviderPriceID: 'price_pro', Metadata: {} } as Record<string, unknown>,
    syncCalls: [] as string[],
    syncResult: { Outcome: 'Changed', SubscriptionNumber: 'SUB-000110', Actions: ['booked'], Notices: [] } as Record<string, unknown>,
    alerts: [] as Row[],
    filters: [] as string[],
    billsSubscriptions: true,
}));

vi.mock('@memberjunction/core', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/core')>();
    return {
        ...actual,
        LogStatus: () => undefined,
        LogError: () => undefined,
        RunView: class {
            async RunView(params: { EntityName: string; ExtraFilter?: string }) {
                state.filters.push(`${params.EntityName}: ${params.ExtraFilter ?? ''}`);
                if (params.EntityName.endsWith('Subscriptions')) {
                    return { Success: true, Results: state.subscriptions };
                }
                if (params.EntityName.endsWith('Payment Provider Prices')) {
                    const price = /ProviderPriceID = '([^']*)'/.exec(params.ExtraFilter ?? '')?.[1];
                    return { Success: true, Results: state.mappedPrices.includes(price ?? '') ? [{ ID: 'ppp-1' }] : [] };
                }
                if (params.EntityName.endsWith('Payment Webhook Deliveries')) {
                    const id = /ProviderEventID = '([^']*)'/.exec(params.ExtraFilter ?? '')?.[1];
                    return { Success: true, Results: state.deliveries.filter((d) => d.ProviderEventID === id) };
                }
                return { Success: true, Results: [] };
            }
        },
    };
});

vi.mock('../PaymentProviderResolver.js', () => ({
    LoadPaymentProviderConfig: async () => ({ ID: PROVIDER_ID, Name: 'Gateway (test)', Capabilities: { SupportsWebhooks: true } }),
    BuildPaymentProvider: async () => ({
        Config: { ID: PROVIDER_ID, CompanyID: 'c', BillsSubscriptions: state.billsSubscriptions, Capabilities: { SupportsSubscriptionBilling: true } },
        HandledEventKinds: ['payment_intent.succeeded'],
        HandledSubscriptionEventKinds: ['invoice.paid', 'customer.subscription.created', 'customer.subscription.updated'],
        SettlesAsynchronously: false,
        VerifyWebhook: async () => ({ Valid: true }),
        ParseWebhookEvent: () => state.event,
        DescribeProviderSubscription: async () => state.describe,
    }),
}));
vi.mock('../ProviderSubscriptionSync.js', () => ({
    SyncProviderSubscription: async (id: string) => {
        state.syncCalls.push(id);
        return { SubscriptionID: id, Differences: [], ...state.syncResult };
    },
}));
vi.mock('../checkoutCaptureAlert.js', () => ({
    raiseUnknownGatewaySubscriptionAlert: async (alert: Row) => {
        state.alerts.push(alert);
        return true;
    },
}));
vi.mock('../PaymentSettlement.js', () => ({ SettlePaymentForEvent: async () => undefined }));
vi.mock('../CheckoutSessionService.js', () => ({
    CheckoutSessionService: { BookSettledCheckoutPaymentIfNeeded: async () => ({ Attempted: false }) },
}));

import type { IMetadataProvider, UserInfo } from '@memberjunction/core';
import { HandlePaymentWebhook } from '../PaymentWebhookHandler.js';

function entity(): Row {
    const row: Row = {
        NewRecord: () => undefined,
        Load: async () => false,
        Save: async () => {
            state.saved.push(Object.fromEntries(Object.entries(row).filter(([, v]) => typeof v !== 'function')));
            return true;
        },
        LatestResult: { CompleteMessage: '' },
    };
    return row;
}
const provider = { GetEntityObject: async () => entity() } as unknown as IMetadataProvider;
const user = {} as UserInfo;
const deliver = () => HandlePaymentWebhook({ RawBody: '{}', Headers: {}, PaymentProviderID: PROVIDER_ID }, provider, user);
const subEvent = (over: Partial<WebhookEvent> = {}): WebhookEvent => ({
    EventID: 'evt_sub_1',
    Kind: 'invoice.paid',
    ProviderSubscriptionID: 'sub_jane',
    OccurredAt: new Date('2027-10-30T05:00:05Z'),
    ...over,
});

beforeEach(() => {
    state.event = null;
    state.subscriptions = [];
    state.mappedPrices = [];
    state.deliveries = [];
    state.saved = [];
    state.describe = { Success: true, State: 'Renewing', ProviderPriceID: 'price_pro', Metadata: {} };
    state.syncCalls = [];
    state.syncResult = { Outcome: 'Changed', SubscriptionNumber: 'SUB-000110', Actions: ['booked renewal ORD-1'], Notices: [] };
    state.alerts = [];
    state.filters = [];
    state.billsSubscriptions = true;
});

describe('a subscription event for a subscription Orders records', () => {
    it('syncs it: 200, Applied, the sync named in the delivery row; matched by (account, gateway id) only', async () => {
        state.event = subEvent();
        state.subscriptions = [{ ID: SUB_ID }];
        const res = await deliver();
        expect(res.Status).toBe(200);
        expect(state.syncCalls).toEqual([SUB_ID]);
        expect(state.saved[0]).toMatchObject({ Outcome: 'Applied', ProviderEventID: 'evt_sub_1', EventKind: 'invoice.paid' });
        expect(state.saved[0].PaymentIntentID ?? null).toBeNull();
        expect(String(state.saved[0].Reason)).toMatch(/SUB-000110 Changed: booked renewal ORD-1/);
        const lookup = state.filters.find((f) => f.startsWith('MJ_BizApps_Orders: Subscriptions'))!;
        expect(lookup).toContain(`PaymentProviderID = '${PROVIDER_ID}'`);
        expect(lookup).toContain("ProviderSubscriptionID = 'sub_jane'");
        expect(lookup).not.toMatch(/Email/i);
    });
    it('a failed sync answers 500 (the gateway redelivers) and records Failed, sync_failed', async () => {
        state.event = subEvent();
        state.subscriptions = [{ ID: SUB_ID }];
        state.syncResult = { Outcome: 'Failed', Error: 'Stripe was unreachable', Actions: [], Notices: [] };
        const res = await deliver();
        expect(res.Status).toBe(500);
        expect(state.saved[0]).toMatchObject({ Outcome: 'Failed', ReasonCode: 'sync_failed' });
        expect(String(state.saved[0].Reason)).toMatch(/unreachable/);
    });
    it('the same event already Applied: 200 AlreadyApplied, and the sync does not run again', async () => {
        state.event = subEvent();
        state.subscriptions = [{ ID: SUB_ID }];
        state.deliveries = [{ ID: 'd-1', ProviderEventID: 'evt_sub_1', Outcome: 'Applied' }];
        const res = await deliver();
        expect(res.Status).toBe(200);
        expect(res.Body.outcome).toBe('AlreadyApplied');
        expect(state.syncCalls).toEqual([]);
    });
    it('an earlier Failed delivery of the same event is retried (the sync runs)', async () => {
        state.event = subEvent();
        state.subscriptions = [{ ID: SUB_ID }];
        state.deliveries = [{ ID: 'd-1', ProviderEventID: 'evt_sub_1', Outcome: 'Failed' }];
        await deliver();
        expect(state.syncCalls).toEqual([SUB_ID]);
    });
});

describe('a gateway subscription no Orders subscription records', () => {
    it("created by Orders' own hand-over (its metadata names an Orders subscription): Ignored, no alert (E2 records it)", async () => {
        state.event = subEvent({ Kind: 'customer.subscription.created' });
        state.describe = { Success: true, State: 'Renewing', ProviderPriceID: 'price_pro', Metadata: { OrdersSubscriptionID: SUB_ID } };
        state.mappedPrices = ['price_pro'];
        const res = await deliver();
        expect(res.Status).toBe(200);
        expect(state.alerts).toEqual([]);
        expect(state.saved[0]).toMatchObject({ Outcome: 'Ignored', ReasonCode: 'unknown_subscription' });
        expect(String(state.saved[0].Reason)).toMatch(/created by Orders' hand-over/);
    });
    it('on a price Orders does not sell here (a legacy $175 subscriber): not_ours, no alert', async () => {
        state.event = subEvent();
        state.describe = { Success: true, State: 'Renewing', ProviderPriceID: 'price_legacy_175', Metadata: {} };
        state.mappedPrices = ['price_pro'];
        const res = await deliver();
        expect(res.Status).toBe(200);
        expect(state.alerts).toEqual([]);
        expect(state.saved[0]).toMatchObject({ Outcome: 'Ignored', ReasonCode: 'not_ours' });
    });
    it('on a price Orders sells, when the gateway starts billing it (invoice.paid): one alert naming it', async () => {
        state.event = subEvent();
        state.describe = { Success: true, State: 'Renewing', ProviderPriceID: 'price_pro', ProviderCustomerRef: 'cus_sam', CustomerEmail: 'sam@example.com', Metadata: {} };
        state.mappedPrices = ['price_pro'];
        await deliver();
        expect(state.alerts).toHaveLength(1);
        expect(state.alerts[0]).toMatchObject({ ProviderSubscriptionID: 'sub_jane' });
        expect(String(state.alerts[0].Reason)).toMatch(/sam@example\.com/);
        expect(state.saved[0]).toMatchObject({ Outcome: 'Ignored', ReasonCode: 'unknown_subscription' });
    });
    it('control: an update of an unknown one is recorded only, no alert (only invoice.paid / created raise one)', async () => {
        state.event = subEvent({ Kind: 'customer.subscription.updated' });
        state.mappedPrices = ['price_pro'];
        await deliver();
        expect(state.alerts).toEqual([]);
        expect(state.saved[0]).toMatchObject({ Outcome: 'Ignored', ReasonCode: 'unknown_subscription' });
    });
    it('the gateway cannot be read to classify it: Ignored, unknown_subscription, no alert', async () => {
        state.event = subEvent();
        state.describe = { Success: false, Reason: 'Stripe 404' };
        await deliver();
        expect(state.alerts).toEqual([]);
        expect(state.saved[0]).toMatchObject({ Outcome: 'Ignored', ReasonCode: 'unknown_subscription' });
    });
});

describe('controls', () => {
    it('a payment_intent event takes the intent path, as before (unknown_intent), and syncs nothing', async () => {
        state.event = { EventID: 'evt_pi', Kind: 'payment_intent.succeeded', ProviderIntentID: 'pi_x', Status: 'Succeeded' };
        const res = await deliver();
        expect(res.Status).toBe(200);
        expect(state.syncCalls).toEqual([]);
        expect(state.saved[0]).toMatchObject({ Outcome: 'Ignored', ReasonCode: 'unknown_intent' });
    });
    it("an account whose BillsSubscriptions switch is off: Ignored, provider_off; no lookup, no sync, no alert", async () => {
        state.event = subEvent();
        state.subscriptions = [{ ID: SUB_ID }];
        state.mappedPrices = ['price_pro'];
        state.billsSubscriptions = false;
        const res = await deliver();
        expect(res.Status).toBe(200);
        expect(state.syncCalls).toEqual([]);
        expect(state.alerts).toEqual([]);
        expect(state.filters.some((f) => f.includes('Subscriptions:'))).toBe(false);
        expect(state.saved[0]).toMatchObject({ Outcome: 'Ignored', ReasonCode: 'provider_off' });
    });
    it('a subscription event kind the driver does not list is not routed to the sync', async () => {
        state.event = subEvent({ Kind: 'invoice.upcoming' });
        state.subscriptions = [{ ID: SUB_ID }];
        await deliver();
        expect(state.syncCalls).toEqual([]);
    });
});
