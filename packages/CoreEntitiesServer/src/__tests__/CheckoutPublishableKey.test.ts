/**
 * Which Stripe publishable key the browser gets: the provider's `<CredentialsRef>_PUBLISHABLE_KEY`
 * over the widget's `stripePublishableKey`, a mode-mismatch warning that names prefixes only, and a
 * fallback to the widget's key on every failure of the provider read.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { UserInfo } from '@memberjunction/core';

const mocks = vi.hoisted(() => ({
    loadConfig: vi.fn(),
    resolveCredentials: vi.fn(),
    logError: vi.fn(),
    logErrorEx: vi.fn(),
    provider: {} as object | undefined,
}));

vi.mock('../PaymentProviderResolver.js', async (importOriginal) => ({
    ...(await importOriginal<typeof import('../PaymentProviderResolver.js')>()),
    LoadPaymentProviderConfig: (...args: unknown[]) => mocks.loadConfig(...args),
    ResolvePaymentCredentials: (...args: unknown[]) => mocks.resolveCredentials(...args),
}));

vi.mock('@memberjunction/core', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/core')>();
    return {
        ...actual,
        LogError: (...args: unknown[]) => mocks.logError(...args),
        LogErrorEx: (...args: unknown[]) => mocks.logErrorEx(...args),
        Metadata: class {
            static get Provider(): object | undefined {
                return mocks.provider;
            }
        },
    };
});

import {
    ChooseCheckoutPublishableKey,
    ResolveCheckoutPublishableKey,
    StripeKeyModeOf,
} from '../CheckoutPublishableKey.js';
import { PaymentProviderNotConfiguredError } from '../PaymentProviderResolver.js';

/** The package compiles without Node types (`"types": []`), as `PaymentProviderResolver.ts` notes. */
declare const process: { env: Record<string, string | undefined> };

const PROVIDER_ID = '88eb5f2e-3005-4cab-ae24-a4fd48876e7b';
const user = { ID: 'user-1' } as UserInfo;

function providerConfig(overrides: Partial<{ IsLiveMode: boolean; CredentialsRef: string | null; Name: string }> = {}) {
    return {
        ID: PROVIDER_ID,
        TypeCode: 'Stripe',
        CompanyID: 'company-1',
        Name: overrides.Name ?? 'Test Stripe',
        CredentialsRef: overrides.CredentialsRef === undefined ? 'STRIPE_TEST_ACCOUNT' : overrides.CredentialsRef,
        IsLiveMode: overrides.IsLiveMode ?? true,
        Capabilities: { SupportsTokenization: true, SupportsRefund: true, SupportsWebhooks: true },
    };
}

describe('StripeKeyModeOf', () => {
    it('reads test and live from pk_, sk_ and rk_ prefixes', () => {
        expect(StripeKeyModeOf('pk_test_abc')).toBe('test');
        expect(StripeKeyModeOf('pk_live_abc')).toBe('live');
        expect(StripeKeyModeOf('sk_live_abc')).toBe('live');
        expect(StripeKeyModeOf('rk_test_abc')).toBe('test');
        expect(StripeKeyModeOf('  pk_live_abc  ')).toBe('live');
    });

    it('returns null for anything unrecognisable or absent', () => {
        expect(StripeKeyModeOf(undefined)).toBeNull();
        expect(StripeKeyModeOf(null)).toBeNull();
        expect(StripeKeyModeOf('')).toBeNull();
        expect(StripeKeyModeOf('whsec_abc')).toBeNull();
        expect(StripeKeyModeOf('pk_staging_abc')).toBeNull();
    });
});

describe('ChooseCheckoutPublishableKey', () => {
    it('prefers the provider key over the widget key', () => {
        const r = ChooseCheckoutPublishableKey({ WidgetKey: 'pk_test_widget', ProviderKey: 'pk_test_env' });
        expect(r).toEqual({ Key: 'pk_test_env', Source: 'environment' });
    });

    it('falls back to the widget key when the provider has none (backward compatible)', () => {
        const r = ChooseCheckoutPublishableKey({ WidgetKey: 'pk_test_widget', ProviderKey: undefined });
        expect(r).toEqual({ Key: 'pk_test_widget', Source: 'widget' });
    });

    it('treats blank strings and non-strings as absent', () => {
        expect(ChooseCheckoutPublishableKey({ WidgetKey: 'pk_test_widget', ProviderKey: '   ' }).Source).toBe('widget');
        expect(ChooseCheckoutPublishableKey({ WidgetKey: 42 })).toEqual({ Key: undefined, Source: 'none' });
        expect(ChooseCheckoutPublishableKey({ WidgetKey: '  ' })).toEqual({ Key: undefined, Source: 'none' });
    });

    it('warns when the key mode disagrees with the API key mode, naming prefixes only', () => {
        const r = ChooseCheckoutPublishableKey({
            WidgetKey: 'pk_test_widgetsecretish',
            ApiKey: 'sk_live_supersecret',
            IsLiveMode: true,
            ProviderName: 'Live Stripe',
            CredentialsRef: 'stripe-live',
        });
        expect(r.Key).toBe('pk_test_widgetsecretish');
        expect(r.Warning).toContain("'Live Stripe' is a live account");
        expect(r.Warning).toContain('pk_test_');
        expect(r.Warning).toContain('STRIPE_LIVE_PUBLISHABLE_KEY');
        expect(r.Warning).not.toContain('supersecret');
        expect(r.Warning).not.toContain('widgetsecretish');
    });

    it('takes the API key mode over IsLiveMode: a live-mode provider on a test account is not a mismatch', () => {
        const r = ChooseCheckoutPublishableKey({ WidgetKey: 'pk_test_w', ApiKey: 'sk_test_x', IsLiveMode: true });
        expect(r.Warning).toBeUndefined();
    });

    it('falls back to IsLiveMode when the API key is absent or unrecognisable — both directions', () => {
        expect(ChooseCheckoutPublishableKey({ WidgetKey: 'pk_test_w', IsLiveMode: true }).Warning).toContain('IsLiveMode is on');
        expect(ChooseCheckoutPublishableKey({ ProviderKey: 'pk_live_e', WidgetKey: undefined, ApiKey: 'opaque', IsLiveMode: false }).Warning)
            .toContain('IsLiveMode is off');
    });

    it('does not warn without a provider, or with an unrecognisable key', () => {
        expect(ChooseCheckoutPublishableKey({ WidgetKey: 'pk_test_w' }).Warning).toBeUndefined();
        expect(ChooseCheckoutPublishableKey({ WidgetKey: 'custom-key', IsLiveMode: true }).Warning).toBeUndefined();
    });
});

describe('ResolveCheckoutPublishableKey', () => {
    beforeEach(() => {
        mocks.loadConfig.mockReset();
        mocks.resolveCredentials.mockReset();
        mocks.logError.mockReset();
        mocks.logErrorEx.mockReset();
        mocks.provider = {};
    });

    it('uses the widget key and reads no provider when the widget names none', async () => {
        const r = await ResolveCheckoutPublishableKey({ stripePublishableKey: 'pk_test_widget' }, 'W', user);
        expect(r).toEqual({ Key: 'pk_test_widget', Source: 'widget' });
        expect(mocks.loadConfig).not.toHaveBeenCalled();
        expect(mocks.logError).not.toHaveBeenCalled();
    });

    it("hands back the provider's environment key over the widget's", async () => {
        mocks.loadConfig.mockResolvedValue(providerConfig());
        mocks.resolveCredentials.mockResolvedValue({ ApiKey: 'sk_test_x', PublishableKey: 'pk_test_env' });
        const r = await ResolveCheckoutPublishableKey(
            { stripePublishableKey: 'pk_test_widget', paymentProviderId: PROVIDER_ID },
            'W',
            user,
        );
        expect(r).toEqual({ Key: 'pk_test_env', Source: 'environment' });
        expect(mocks.loadConfig).toHaveBeenCalledWith(PROVIDER_ID, mocks.provider, user);
        expect(mocks.resolveCredentials).toHaveBeenCalledWith('STRIPE_TEST_ACCOUNT');
        expect(mocks.logErrorEx).not.toHaveBeenCalled();
    });

    it('keeps the widget key when the provider has no publishable key', async () => {
        mocks.loadConfig.mockResolvedValue(providerConfig());
        mocks.resolveCredentials.mockResolvedValue({ ApiKey: 'sk_test_x' });
        const r = await ResolveCheckoutPublishableKey(
            { stripePublishableKey: 'pk_test_widget', paymentProviderId: PROVIDER_ID },
            'W',
            user,
        );
        expect(r).toEqual({ Key: 'pk_test_widget', Source: 'widget' });
    });

    it('logs a warning (prefix only) on a mode mismatch and still returns the key', async () => {
        mocks.loadConfig.mockResolvedValue(providerConfig({ IsLiveMode: true }));
        mocks.resolveCredentials.mockResolvedValue({ ApiKey: 'sk_live_hidden' });
        const r = await ResolveCheckoutPublishableKey(
            { stripePublishableKey: 'pk_test_widgetvalue', paymentProviderId: PROVIDER_ID },
            'Prod widget',
            user,
        );
        expect(r.Key).toBe('pk_test_widgetvalue');
        expect(mocks.logErrorEx).toHaveBeenCalledTimes(1);
        const logged = mocks.logErrorEx.mock.calls[0][0] as { message: string; severity: string };
        expect(logged.severity).toBe('warning');
        expect(logged.message).toContain("Widget 'Prod widget'");
        expect(logged.message).not.toContain('hidden');
        expect(logged.message).not.toContain('widgetvalue');
    });

    it('falls back to the widget key and logs when the provider read throws', async () => {
        mocks.loadConfig.mockRejectedValue(new PaymentProviderNotConfiguredError("Payment provider 'X' is inactive."));
        const r = await ResolveCheckoutPublishableKey(
            { stripePublishableKey: 'pk_test_widget', paymentProviderId: PROVIDER_ID },
            'W',
            user,
        );
        expect(r).toEqual({ Key: 'pk_test_widget', Source: 'widget' });
        expect(mocks.logError).toHaveBeenCalledTimes(1);
        expect(String(mocks.logError.mock.calls[0][0])).toContain('is inactive');
    });

    it('falls back and logs when the secret resolver throws', async () => {
        mocks.loadConfig.mockResolvedValue(providerConfig());
        mocks.resolveCredentials.mockRejectedValue('vault unreachable');
        const r = await ResolveCheckoutPublishableKey({ paymentProviderId: PROVIDER_ID }, 'W', user);
        expect(r).toEqual({ Key: undefined, Source: 'none' });
        expect(String(mocks.logError.mock.calls[0][0])).toContain('vault unreachable');
    });

    it('falls back and logs when there is no acting user', async () => {
        const r = await ResolveCheckoutPublishableKey(
            { stripePublishableKey: 'pk_test_widget', paymentProviderId: PROVIDER_ID },
            'W',
            undefined,
        );
        expect(r.Source).toBe('widget');
        expect(mocks.loadConfig).not.toHaveBeenCalled();
        expect(String(mocks.logError.mock.calls[0][0])).toContain('no acting user');
    });

    it('falls back and logs when there is no metadata provider', async () => {
        mocks.provider = undefined;
        const r = await ResolveCheckoutPublishableKey(
            { stripePublishableKey: 'pk_test_widget', paymentProviderId: PROVIDER_ID },
            'W',
            user,
        );
        expect(r.Source).toBe('widget');
        expect(String(mocks.logError.mock.calls[0][0])).toContain('no metadata provider');
    });
});

describe('EnvironmentSecretResolver publishable key', () => {
    const env = process.env;
    const names = ['STRIPE_PK_SPEC_API_KEY', 'STRIPE_PK_SPEC_PUBLISHABLE_KEY'];

    afterEach(() => {
        for (const n of names) delete env[n];
    });

    it('reads <CredentialsRef>_PUBLISHABLE_KEY beside the API key', async () => {
        const { EnvironmentSecretResolver } = await vi.importActual<typeof import('../PaymentProviderResolver.js')>(
            '../PaymentProviderResolver.js',
        );
        env.STRIPE_PK_SPEC_API_KEY = 'sk_test_spec';
        env.STRIPE_PK_SPEC_PUBLISHABLE_KEY = '  pk_test_spec  ';
        const creds = await new EnvironmentSecretResolver().Resolve('stripe-pk-spec');
        expect(creds.ApiKey).toBe('sk_test_spec');
        expect(creds.PublishableKey).toBe('pk_test_spec');
    });

    it('leaves it undefined when unset or blank', async () => {
        const { EnvironmentSecretResolver } = await vi.importActual<typeof import('../PaymentProviderResolver.js')>(
            '../PaymentProviderResolver.js',
        );
        expect((await new EnvironmentSecretResolver().Resolve('STRIPE_PK_SPEC')).PublishableKey).toBeUndefined();
        env.STRIPE_PK_SPEC_PUBLISHABLE_KEY = '   ';
        expect((await new EnvironmentSecretResolver().Resolve('STRIPE_PK_SPEC')).PublishableKey).toBeUndefined();
    });
});
