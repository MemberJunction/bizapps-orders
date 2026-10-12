/**
 * Unit tests for keeping a checkout's card for renewal. No network, no database: RunView, the entity
 * objects and the payment driver are stubbed, so these pin the decisions — when a card is filed, what
 * is written, and that a replay or a failure never writes twice or throws.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { IMetadataProvider, UserInfo } from '@memberjunction/core';

const state = vi.hoisted(() => ({
    views: {} as Record<string, Array<Record<string, unknown>>>,
    filters: [] as Array<{ EntityName: string; ExtraFilter?: string }>,
    saved: [] as Array<{ entity: string; row: Record<string, unknown> }>,
    retrieve: vi.fn(),
    nextID: 0,
}));

vi.mock('@memberjunction/core', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/core')>();
    return {
        ...actual,
        LogError: vi.fn(),
        LogStatus: vi.fn(),
        RunView: class {
            RunView = vi.fn().mockImplementation(async (params: { EntityName: string; ExtraFilter?: string }) => {
                state.filters.push(params);
                return { Success: true, Results: state.views[params.EntityName] ?? [] };
            });
        },
    };
});

vi.mock('../PaymentProviderResolver.js', () => ({
    ResolvePaymentProvider: async () => ({ RetrieveIntent: state.retrieve }),
}));

import { SaveCheckoutInstrumentForRenewals, SnapshotSellsSubscription } from '../CheckoutSavedInstrument.js';

const user = { ID: 'u-1' } as unknown as UserInfo;

function entity(name: string) {
    const row: Record<string, unknown> = {
        ID: '',
        LatestResult: { CompleteMessage: '' },
        NewRecord() {
            this.ID = `00000000-0000-0000-0000-${String(++state.nextID).padStart(12, '0')}`;
        },
        async Save() {
            state.saved.push({ entity: name, row: { ...this } });
            return true;
        },
    };
    return row;
}

const provider = {
    GetEntityObject: vi.fn(async (name: string) => entity(name)),
} as unknown as IMetadataProvider;

function subscription(id: string) {
    const s = entity('MJ_BizApps_Orders: Subscriptions');
    s.ID = id;
    s.DefaultCustomerPaymentMethodID = null;
    return s;
}

const ORDER = 'aaaaaaaa-0000-0000-0000-000000000001';
const LINE = 'aaaaaaaa-0000-0000-0000-000000000002';
const PERSON = 'aaaaaaaa-0000-0000-0000-000000000003';
const PROVIDER = 'aaaaaaaa-0000-0000-0000-000000000004';
const input = {
    OrderHeaderID: ORDER,
    CompanyID: 'aaaaaaaa-0000-0000-0000-000000000005',
    OwnerPersonID: PERSON,
    PaymentProviderID: PROVIDER,
    ProviderIntentID: 'pi_1',
    TenderCode: 'CreditCard',
};

beforeEach(() => {
    state.views = {
        'MJ_BizApps_Orders: Order Lines': [{ ID: LINE, ProductID: 'aaaaaaaa-0000-0000-0000-000000000006' }],
        'MJ_BizApps_Orders: Payment Types': [{ ID: 'aaaaaaaa-0000-0000-0000-00000000000c' }],
    };
    state.filters = [];
    state.saved = [];
    state.nextID = 100;
    state.retrieve.mockReset().mockResolvedValue({
        Success: true,
        Instrument: { ProviderCustomerRef: 'cus_1', ProviderInstrumentRef: 'pm_1', Brand: 'visa', Last4: '4242', ExpiryMonth: 12, ExpiryYear: 2030 },
    });
});

describe('SaveCheckoutInstrumentForRenewals', () => {
    it('files the card and makes it the renewal card of each new subscription', async () => {
        const sub = subscription('sub-1');
        state.views['MJ_BizApps_Orders: Subscriptions'] = [sub];

        const result = await SaveCheckoutInstrumentForRenewals(input, provider, user);

        expect(result.Saved).toBe(true);
        const detail = state.saved.find((s) => s.entity === 'MJ_BizApps_Orders: Payment Details')!.row;
        expect(detail).toMatchObject({
            PaymentProviderID: PROVIDER,
            ProviderCustomerRef: 'cus_1',
            ProviderInstrumentRef: 'pm_1',
            Brand: 'visa',
            Last4: '4242',
            ExpiryMonth: 12,
            ExpiryYear: 2030,
        });
        const wallet = state.saved.find((s) => s.entity === 'MJ_BizApps_Orders: Customer Payment Methods')!.row;
        expect(wallet).toMatchObject({ OwnerPersonID: PERSON, PaymentDetailID: detail.ID, IsDefault: true, IsActive: true, Nickname: 'visa ending 4242' });
        expect(sub.DefaultCustomerPaymentMethodID).toBe(wallet.ID);
        expect(result.SubscriptionIDs).toEqual(['sub-1']);

        const subFilter = state.filters.find((f) => f.EntityName === 'MJ_BizApps_Orders: Subscriptions')!.ExtraFilter!;
        expect(subFilter).toContain('AutoRenew = 1');
        expect(subFilter).toContain('DefaultCustomerPaymentMethodID IS NULL');
    });

    it('reuses the wallet entry a previous call wrote for the same card — a replay writes nothing new', async () => {
        const sub = subscription('sub-1');
        state.views['MJ_BizApps_Orders: Subscriptions'] = [sub];
        state.views['MJ_BizApps_Orders: Payment Details'] = [{ ID: 'aaaaaaaa-0000-0000-0000-00000000000d' }];
        state.views['MJ_BizApps_Orders: Customer Payment Methods'] = [{ ID: 'aaaaaaaa-0000-0000-0000-00000000000e' }];

        const result = await SaveCheckoutInstrumentForRenewals(input, provider, user);

        expect(result.CustomerPaymentMethodID).toBe('aaaaaaaa-0000-0000-0000-00000000000e');
        expect(state.saved.some((s) => s.entity === 'MJ_BizApps_Orders: Payment Details')).toBe(false);
        expect(state.saved.some((s) => s.entity === 'MJ_BizApps_Orders: Customer Payment Methods')).toBe(false);
        expect(sub.DefaultCustomerPaymentMethodID).toBe('aaaaaaaa-0000-0000-0000-00000000000e');
    });

    it('does nothing when the order created no subscription needing a card', async () => {
        state.views['MJ_BizApps_Orders: Subscriptions'] = [];
        const result = await SaveCheckoutInstrumentForRenewals(input, provider, user);
        expect(result.Saved).toBe(false);
        expect(state.retrieve).not.toHaveBeenCalled();
    });

    it('does nothing without a person to own the card', async () => {
        const result = await SaveCheckoutInstrumentForRenewals({ ...input, OwnerPersonID: null }, provider, user);
        expect(result.Saved).toBe(false);
        expect(state.saved).toHaveLength(0);
    });

    it('files nothing when the gateway kept no card for the payment', async () => {
        state.views['MJ_BizApps_Orders: Subscriptions'] = [subscription('sub-1')];
        state.retrieve.mockResolvedValue({ Success: true, Instrument: { ProviderCustomerRef: null, ProviderInstrumentRef: 'pm_1' } });
        const result = await SaveCheckoutInstrumentForRenewals(input, provider, user);
        expect(result.Saved).toBe(false);
        expect(state.saved).toHaveLength(0);
    });

    it('is fail-soft: a gateway fault is reported, never thrown', async () => {
        state.views['MJ_BizApps_Orders: Subscriptions'] = [subscription('sub-1')];
        state.retrieve.mockRejectedValue(new Error('Stripe was unreachable'));
        const result = await SaveCheckoutInstrumentForRenewals(input, provider, user);
        expect(result.Saved).toBe(false);
        expect(result.Reason).toContain('unreachable');
    });
});

describe('SnapshotSellsSubscription', () => {
    const PRODUCT = 'aaaaaaaa-0000-0000-0000-0000000000a1';
    const snapshot = JSON.stringify({ PricedLines: [{ ProductID: PRODUCT }], TotalGross: 200 });

    it('is true when a drafted product has a subscription type', async () => {
        state.views['MJ_BizApps_Orders: Products'] = [{ ID: PRODUCT }];
        expect(await SnapshotSellsSubscription(snapshot, user)).toBe(true);
        const productFilter = state.filters.find((f) => f.EntityName === 'MJ_BizApps_Orders: Products')!.ExtraFilter!;
        expect(productFilter).toContain(PRODUCT);
        expect(productFilter).toContain('SubscriptionTypeID IS NOT NULL');
        // The order does not exist before payment, so its lines are never read.
        expect(state.filters.some((f) => f.EntityName === 'MJ_BizApps_Orders: Order Lines')).toBe(false);
    });

    it('is false for a draft with no subscription product', async () => {
        state.views['MJ_BizApps_Orders: Products'] = [];
        expect(await SnapshotSellsSubscription(snapshot, user)).toBe(false);
    });

    it('is false, without a query, for an empty or unreadable snapshot', async () => {
        expect(await SnapshotSellsSubscription(null, user)).toBe(false);
        expect(await SnapshotSellsSubscription('{not json', user)).toBe(false);
        expect(state.filters).toHaveLength(0);
    });
});
