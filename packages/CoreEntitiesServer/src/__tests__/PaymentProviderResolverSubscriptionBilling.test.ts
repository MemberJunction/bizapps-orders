/**
 * The capability and the switch reach the driver's config (option E, E2):
 * `PaymentProviderType.SupportsSubscriptionBilling` → `Config.Capabilities.SupportsSubscriptionBilling`,
 * `PaymentProvider.BillsSubscriptions` → `Config.BillsSubscriptions`. From the engine cache and from the
 * query fallback alike, and false whenever the row does not say true.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { UserInfo } from '@memberjunction/core';

const mocks = vi.hoisted(() => ({
    providerRow: {} as Record<string, unknown>,
    typeRow: null as Record<string, unknown> | null,
    cachedType: null as Record<string, unknown> | null,
}));

vi.mock('@memberjunction/core', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/core')>();
    return {
        ...actual,
        RunView: class {
            RunView = async (params: { EntityName: string }) => ({
                Success: true,
                Results: params.EntityName === 'MJ_BizApps_Orders: Payment Providers' ? [mocks.providerRow] : mocks.typeRow ? [mocks.typeRow] : [],
            });
        },
    };
});

vi.mock('@mj-biz-apps/orders-entities', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@mj-biz-apps/orders-entities')>();
    return {
        ...actual,
        LoadOrdersEngine: vi.fn().mockResolvedValue(undefined),
        OrdersEngine: { Instance: { PaymentProviderTypeByID: () => mocks.cachedType ?? undefined } },
    };
});

import { LoadPaymentProviderConfig } from '../PaymentProviderResolver.js';

const PROVIDER_ID = '88EB5F2E-0000-4000-8000-000000000001';
const TYPE_ID = '11111111-0000-4000-8000-000000000001';
const user = { ID: 'u' } as unknown as UserInfo;
const type = (supports: boolean | undefined) => ({
    ID: TYPE_ID,
    Code: 'Stripe',
    SupportsTokenization: true,
    SupportsRefund: true,
    SupportsWebhooks: true,
    SupportsSubscriptionBilling: supports,
    IsActive: true,
});

beforeEach(() => {
    mocks.providerRow = {
        ID: PROVIDER_ID,
        CompanyID: 'company-1',
        Name: 'Acme Stripe',
        CredentialsRef: 'STRIPE_X',
        IsLiveMode: true,
        IsActive: true,
        BillsSubscriptions: true,
        PaymentProviderTypeID: TYPE_ID,
        PaymentProviderType: 'Stripe',
    };
    mocks.typeRow = null;
    mocks.cachedType = null;
});

describe('LoadPaymentProviderConfig: subscription billing', () => {
    it('reads the account switch and the type capability from the engine cache', async () => {
        mocks.cachedType = type(true);
        const config = await LoadPaymentProviderConfig(PROVIDER_ID, {} as never, user);
        expect(config.BillsSubscriptions).toBe(true);
        expect(config.Capabilities.SupportsSubscriptionBilling).toBe(true);
    });

    it('reads them through the query fallback when the type is not cached', async () => {
        mocks.typeRow = type(true);
        const config = await LoadPaymentProviderConfig(PROVIDER_ID, {} as never, user);
        expect(config.Capabilities.SupportsSubscriptionBilling).toBe(true);
    });

    it('is false whenever the row does not say true', async () => {
        mocks.cachedType = type(undefined);
        mocks.providerRow.BillsSubscriptions = 0;
        const config = await LoadPaymentProviderConfig(PROVIDER_ID, {} as never, user);
        expect(config.BillsSubscriptions).toBe(false);
        expect(config.Capabilities.SupportsSubscriptionBilling).toBe(false);
    });
});
