/**
 * Every verified webhook delivery leaves a row (#474). No network, no database: the resolver, the
 * driver and the data layer are replaced, and the rows the handler writes are captured.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { WebhookEvent } from '../BasePaymentProvider.js';

const PROVIDER_ID = '11111111-2222-4333-8444-555555555555';
const INTENT_ID = 'aaaaaaaa-2222-4333-8444-555555555555';

interface Row {
    [key: string]: unknown;
}

const state = vi.hoisted(() => ({
    verified: true,
    event: null as WebhookEvent | null,
    intent: null as Row | null,
    deliveries: [] as Row[],
    saved: [] as Row[],
    intentSaveFails: false,
}));

vi.mock('@memberjunction/core', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/core')>();
    return {
        ...actual,
        LogStatus: () => undefined,
        LogError: () => undefined,
        RunView: class {
            async RunView(params: { EntityName: string; ExtraFilter?: string }) {
                if (params.EntityName.endsWith('Payment Intents')) {
                    return { Success: true, Results: state.intent ? [state.intent] : [] };
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
    LoadPaymentProviderConfig: async () => ({
        ID: PROVIDER_ID,
        Name: 'Gateway (test)',
        Capabilities: { SupportsWebhooks: true },
    }),
    BuildPaymentProvider: async () => ({
        Config: { ID: PROVIDER_ID, CompanyID: 'c' },
        HandledEventKinds: ['payment_intent.succeeded', 'payment_intent.processing'],
        SettlesAsynchronously: false,
        VerifyWebhook: async () => ({ Valid: state.verified, Reason: state.verified ? undefined : 'bad signature' }),
        ParseWebhookEvent: () => state.event,
    }),
}));

vi.mock('../PaymentSettlement.js', () => ({ SettlePaymentForEvent: async () => undefined }));
vi.mock('../CheckoutSessionService.js', () => ({
    CheckoutSessionService: { BookSettledCheckoutPaymentIfNeeded: async () => ({ Attempted: false }) },
}));

import type { IMetadataProvider, UserInfo } from '@memberjunction/core';
import { HandlePaymentWebhook } from '../PaymentWebhookHandler.js';
import { DeliveryOutcomeFor } from '../PaymentWebhookDeliveryLog.js';

/** A fake entity: fields live on the object, Save records a snapshot. */
function entity(kind: 'intent' | 'delivery'): Row {
    const row: Row = {
        NewRecord: () => undefined,
        Load: async (id: string) => {
            const found = state.deliveries.find((d) => d.ID === id);
            if (!found) return false;
            Object.assign(row, found);
            return true;
        },
        Save: async () => {
            if (kind === 'intent') {
                if (state.intentSaveFails) return false;
                Object.assign(state.intent ?? {}, { Status: row.Status, ProviderEventID: row.ProviderEventID });
                return true;
            }
            const snapshot = Object.fromEntries(Object.entries(row).filter(([, v]) => typeof v !== 'function'));
            state.saved.push(snapshot);
            return true;
        },
        LatestResult: { CompleteMessage: 'the intent could not be saved' },
    };
    return row;
}

const provider = {
    GetEntityObject: async (name: string) => entity(name.endsWith('Payment Intents') ? 'intent' : 'delivery'),
} as unknown as IMetadataProvider;
const user = {} as UserInfo;

const deliver = () =>
    HandlePaymentWebhook({ RawBody: '{}', Headers: {}, PaymentProviderID: PROVIDER_ID }, provider, user);

const event = (over: Partial<WebhookEvent> = {}): WebhookEvent => ({
    EventID: 'evt_test_1',
    Kind: 'payment_intent.succeeded',
    ProviderIntentID: 'pi_test_1',
    ProviderChargeID: 'ch_test_1',
    Status: 'Succeeded',
    OccurredAt: new Date('2026-10-08T10:00:00Z'),
    ...over,
});

beforeEach(() => {
    state.verified = true;
    state.event = null;
    state.intent = null;
    state.deliveries = [];
    state.saved = [];
    state.intentSaveFails = false;
});

describe('payment webhook deliveries are recorded (#474)', () => {
    it('a verified succeeded event for an intent Orders did not open is recorded as Ignored, unknown_intent', async () => {
        state.event = event();
        const res = await deliver();
        expect(res.Status).toBe(200);
        expect(res.Body.outcome).toBe('Ignore');
        expect(state.saved).toHaveLength(1);
        expect(state.saved[0]).toMatchObject({
            PaymentProviderID: PROVIDER_ID,
            ProviderEventID: 'evt_test_1',
            EventKind: 'payment_intent.succeeded',
            ProviderIntentID: 'pi_test_1',
            ProviderChargeID: 'ch_test_1',
            Outcome: 'Ignored',
            ReasonCode: 'unknown_intent',
            DeliveryCount: 1,
        });
        expect(state.saved[0].PaymentIntentID ?? null).toBeNull();
    });

    it('an event kind Orders does not act on is recorded as Ignored, kind_not_handled', async () => {
        state.event = event({ Kind: 'customer.created', ProviderIntentID: undefined });
        await deliver();
        expect(state.saved[0]).toMatchObject({ Outcome: 'Ignored', ReasonCode: 'kind_not_handled' });
    });

    it('an applied event is recorded as Applied against our intent', async () => {
        state.intent = { ID: INTENT_ID, Status: 'Processing', ProviderEventID: null, LastEventAt: null };
        state.event = event();
        const res = await deliver();
        expect(res.Status).toBe(200);
        expect(state.saved[0]).toMatchObject({ Outcome: 'Applied', PaymentIntentID: INTENT_ID });
        expect(state.saved[0].ReasonCode ?? null).toBeNull();
    });

    it('a redelivery of an applied event updates its row: AlreadyApplied, duplicate, second delivery', async () => {
        // The intent has since been stamped by a later event, so only the delivery row knows E1 was applied.
        state.intent = { ID: INTENT_ID, Status: 'Succeeded', ProviderEventID: 'evt_test_2', LastEventAt: null };
        state.deliveries = [{ ID: 'd1', ProviderEventID: 'evt_test_1', Outcome: 'Applied', DeliveryCount: 1 }];
        state.event = event({ Status: 'Processing', Kind: 'payment_intent.processing', OccurredAt: undefined });
        const res = await deliver();
        expect(res.Body.outcome).toBe('AlreadyApplied');
        expect(state.saved[0]).toMatchObject({ ID: 'd1', Outcome: 'AlreadyApplied', ReasonCode: 'duplicate', DeliveryCount: 2 });
        expect(state.intent.Status).toBe('Succeeded');
    });

    it('an event Orders failed to apply is recorded as Failed and the gateway is asked to retry', async () => {
        state.intent = { ID: INTENT_ID, Status: 'Processing', ProviderEventID: null, LastEventAt: null };
        state.intentSaveFails = true;
        state.event = event();
        const res = await deliver();
        expect(res.Status).toBe(500);
        expect(state.saved[0]).toMatchObject({ Outcome: 'Failed', ReasonCode: 'apply_failed' });
    });

    it('a verified body that cannot be read is recorded as Rejected, unreadable, with no event id', async () => {
        state.event = null;
        const res = await deliver();
        expect(res.Status).toBe(400);
        expect(state.saved[0]).toMatchObject({ Outcome: 'Rejected', ReasonCode: 'unreadable' });
        expect(state.saved[0].ProviderEventID ?? null).toBeNull();
    });

    it('a delivery whose signature fails writes nothing', async () => {
        state.verified = false;
        state.event = event();
        const res = await deliver();
        expect(res.Status).toBe(400);
        expect(state.saved).toHaveLength(0);
    });

    it('maps each decision to its stored outcome', () => {
        expect(DeliveryOutcomeFor('Apply')).toBe('Applied');
        expect(DeliveryOutcomeFor('AlreadyApplied')).toBe('AlreadyApplied');
        expect(DeliveryOutcomeFor('Ignore')).toBe('Ignored');
        expect(DeliveryOutcomeFor('Reject')).toBe('Rejected');
    });
});
