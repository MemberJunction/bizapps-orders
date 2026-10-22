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
    /** Runs when the handler books the checkout capture: stands for the page's work happening then. */
    onBook: null as null | (() => void),
    errors: [] as string[],
    /** The provider each delivery-row lookup ran on, in order. */
    deliveryLookups: [] as unknown[],
}));

vi.mock('@memberjunction/core', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/core')>();
    return {
        ...actual,
        LogStatus: () => undefined,
        LogError: (message: unknown) => {
            state.errors.push(String(message));
        },
        RunView: class {
            constructor(private readonly provider?: unknown) {}
            async RunView(params: { EntityName: string; ExtraFilter?: string }) {
                if (params.EntityName.endsWith('Payment Intents')) {
                    return { Success: true, Results: state.intent ? [state.intent] : [] };
                }
                if (params.EntityName.endsWith('Payment Webhook Deliveries')) {
                    state.deliveryLookups.push(this.provider);
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
    CheckoutSessionService: {
        BookSettledCheckoutPaymentIfNeeded: async () => {
            state.onBook?.();
            return { Attempted: false };
        },
    },
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
    state.deliveryLookups = [];
    state.verified = true;
    state.event = null;
    state.intent = null;
    state.deliveries = [];
    state.saved = [];
    state.intentSaveFails = false;
    state.onBook = null;
    state.errors = [];
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

describe('the delivery row survives the page finishing the same purchase (#939)', () => {
    /**
     * The shared provider as MJ's SQL Server provider behaves: while ANY caller holds a transaction on
     * it, every statement anyone sends through it runs inside that transaction
     * (`SQLServerDataProvider._internalExecuteSQL` takes `this._transaction`). So a row saved through
     * it while the page's unit of work is open is committed or rolled back with the PAGE's work.
     */
    function sharedProviderWithForeignTransaction() {
        const shared = {
            foreignOpen: false,
            pending: [] as Row[],
            BeginForeign() {
                shared.foreignOpen = true;
            },
            RollbackForeign() {
                shared.foreignOpen = false;
                shared.pending = [];
            },
            GetEntityObject: async (name: string) => {
                const row = entity(name.endsWith('Payment Intents') ? 'intent' : 'delivery');
                if (name.endsWith('Payment Intents')) return row;
                const save = row.Save as () => Promise<boolean>;
                row.Save = async () => {
                    if (!shared.foreignOpen) return save();
                    shared.pending.push(Object.fromEntries(Object.entries(row).filter(([, v]) => typeof v !== 'function')));
                    return true; // the statement succeeded; only the transaction it joined is lost later
                };
                return row;
            },
            // An instance with its own transaction stack, as CreateIndependentInstance gives (#928).
            CreateIndependentInstance: vi.fn(async () => ({
                GetEntityObject: async (name: string) => entity(name.endsWith('Payment Intents') ? 'intent' : 'delivery'),
                ReleaseIndependentInstance: vi.fn(async () => undefined),
            })),
        };
        return shared;
    }

    it('records the Applied row even when the page rolls back work it had open on the shared provider', async () => {
        const shared = sharedProviderWithForeignTransaction();
        state.intent = { ID: INTENT_ID, Status: 'Processing', ProviderEventID: null, LastEventAt: null };
        state.event = event();
        // The webhook books the capture while the page is still finishing the purchase on the same
        // shared provider (ORD-002466, ORD-002467: the page's card-for-renewals save, claim, account step).
        state.onBook = () => shared.BeginForeign();

        const res = await HandlePaymentWebhook(
            { RawBody: '{}', Headers: {}, PaymentProviderID: PROVIDER_ID },
            shared as unknown as IMetadataProvider,
            user,
        );
        shared.RollbackForeign();

        expect(res.Status).toBe(200);
        expect(state.saved.filter((r) => r.Outcome === 'Applied')).toHaveLength(1);
        expect(state.saved[0]).toMatchObject({ ProviderEventID: 'evt_test_1', PaymentIntentID: INTENT_ID });
    });

    it('a raced insert is retried as an update on the same isolated instance, which is then released', async () => {
        const release = vi.fn(async () => undefined);
        const sharedGetEntityObject = vi.fn();
        let inserts = 0;
        const own = {
                GetEntityObject: async (name: string) => {
                    const row = entity(name.endsWith('Payment Intents') ? 'intent' : 'delivery');
                    if (name.endsWith('Payment Intents')) return row;
                    const save = row.Save as () => Promise<boolean>;
                    row.Save = async () => {
                        if (row.ID || inserts++ > 0) return save();
                        // Another delivery of the same event inserted first; the unique key refuses ours.
                        state.deliveries.push({ ID: 'd-raced', ProviderEventID: 'evt_test_1', Outcome: 'Ignored', DeliveryCount: 1 });
                        return false;
                    };
                    return row;
                },
                ReleaseIndependentInstance: release,
        };
        const shared = {
            GetEntityObject: sharedGetEntityObject,
            CreateIndependentInstance: vi.fn(async () => own),
        };
        state.event = event();

        const res = await HandlePaymentWebhook(
            { RawBody: '{}', Headers: {}, PaymentProviderID: PROVIDER_ID },
            shared as unknown as IMetadataProvider,
            user,
        );

        expect(res.Status).toBe(200);
        expect(state.saved).toHaveLength(1);
        expect(state.saved[0]).toMatchObject({ ID: 'd-raced', DeliveryCount: 2 });
        expect(sharedGetEntityObject).not.toHaveBeenCalled();
        expect(release).toHaveBeenCalledTimes(1);
        expect(state.errors.filter((e) => e.includes('Could not record webhook delivery'))).toHaveLength(0);
        // The retry's lookup of the row that won the race runs on the same isolated instance.
        expect(state.deliveryLookups.at(-1)).toBe(own);
    });

    it('when no isolated instance can be made, the failure is logged and the answer is unchanged', async () => {
        const shared = {
            GetEntityObject: async (name: string) => entity(name.endsWith('Payment Intents') ? 'intent' : 'delivery'),
            CreateIndependentInstance: async () => {
                throw new Error('pool closed');
            },
        };
        state.intent = { ID: INTENT_ID, Status: 'Processing', ProviderEventID: null, LastEventAt: null };
        state.event = event();

        const res = await HandlePaymentWebhook(
            { RawBody: '{}', Headers: {}, PaymentProviderID: PROVIDER_ID },
            shared as unknown as IMetadataProvider,
            user,
        );

        expect(res.Status).toBe(200);
        expect(res.Body.outcome).toBe('Apply');
        const line = state.errors.find((e) => e.includes('Could not record webhook delivery evt_test_1 as Applied'));
        expect(line).toBeDefined();
        expect(line).toContain('pool closed');
    });

    it('a provider that cannot make an independent instance still gets its row, as before', async () => {
        state.intent = { ID: INTENT_ID, Status: 'Processing', ProviderEventID: null, LastEventAt: null };
        state.event = event();

        // `provider` has GetEntityObject only, like a test double or a non-database provider.
        const res = await deliver();

        expect(res.Status).toBe(200);
        expect(state.saved).toHaveLength(1);
        expect(state.saved[0]).toMatchObject({ Outcome: 'Applied', PaymentIntentID: INTENT_ID });
    });

    it('a delivery row that could not be written says why in the log', async () => {
        const failing = {
            GetEntityObject: async () => ({
                ...entity('delivery'),
                Save: async () => false,
                LatestResult: { CompleteMessage: 'FK_PaymentWebhookDelivery_PaymentIntent violated' },
            }),
        } as unknown as IMetadataProvider;
        state.event = event();

        await HandlePaymentWebhook({ RawBody: '{}', Headers: {}, PaymentProviderID: PROVIDER_ID }, failing, user);

        const line = state.errors.find((e) => e.includes('Could not record webhook delivery evt_test_1'));
        expect(line).toBeDefined();
        expect(line).toContain('FK_PaymentWebhookDelivery_PaymentIntent violated');
    });

    it('when the raced retry also fails, the log line carries the retry\'s reason too', async () => {
        let saves = 0;
        const failing = {
            GetEntityObject: async () => {
                const row = entity('delivery');
                row.Load = async () => true;
                row.Save = async () => {
                    if (saves++ === 0) {
                        state.deliveries.push({ ID: 'd-raced', ProviderEventID: 'evt_test_1', Outcome: 'Ignored', DeliveryCount: 1 });
                        row.LatestResult = { CompleteMessage: 'UQ_PaymentWebhookDelivery_Event violated' };
                    } else {
                        row.LatestResult = { CompleteMessage: 'deadlock victim' };
                    }
                    return false;
                };
                return row;
            },
        } as unknown as IMetadataProvider;
        state.event = event();

        await HandlePaymentWebhook({ RawBody: '{}', Headers: {}, PaymentProviderID: PROVIDER_ID }, failing, user);

        const line = state.errors.find((e) => e.includes('Could not record webhook delivery evt_test_1'));
        expect(line).toContain('UQ_PaymentWebhookDelivery_Event violated');
        expect(line).toContain('as an update of d-raced: deadlock victim');
    });
});
