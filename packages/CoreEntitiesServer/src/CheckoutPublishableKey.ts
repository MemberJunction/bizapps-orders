/**
 * CheckoutPublishableKey — the ONE place that decides which Stripe publishable key a browser gets.
 *
 * WHY NOT JUST THE WIDGET'S `stripePublishableKey`. Widget Configuration is metadata, and metadata is
 * usually shared by every environment of a deployment. A key written there is the same key in staging
 * and in production, while the SECRET key comes from each server's own environment. Production would
 * then load Stripe.js with a test key against a live secret key, and every card payment fails.
 *
 * THE RULE. When the widget names a `paymentProviderId`, that provider's `CredentialsRef` is resolved
 * through the secret seam (`ResolvePaymentCredentials`); the default resolver reads
 * `<CredentialsRef>_PUBLISHABLE_KEY`. A key found there WINS over the widget's. Otherwise the widget's
 * value is used, exactly as before, so a deployment that sets nothing sees no change.
 *
 * THE CHECK. A publishable key whose mode (test/live) disagrees with the account's is logged as a
 * warning — prefixes only, never a key. The account's mode is its API key's mode when that is
 * recognisable, because that is the key the server actually talks to Stripe with; otherwise
 * `IsLiveMode`. (`IsLiveMode` alone is not proof: a provider can be "live" — real gateway calls rather
 * than the stub — against a Stripe test account.)
 *
 * NEVER FAILS A CHECKOUT. Reading the provider is a convenience for the browser's key, not a gate: a
 * missing or inactive provider is logged and the widget's key is used. The payment-intent step refuses
 * a bad provider with its own, specific error.
 *
 * CONNECTS TO:
 *   CALLER:  ./CheckoutSessionService.ts — `InitializeSession`, `InitializeRenewalPaymentSession`
 *   SEAM:    ./PaymentProviderResolver.ts — `LoadPaymentProviderConfig`, `ResolvePaymentCredentials`
 *   BROWSER: Server `checkout-host-page.ts` and Angular `checkout-public-host` read the result as
 *            `Configuration.stripePublishableKey` from `/checkout/initialize`.
 */
import { IMetadataProvider, LogError, LogErrorEx, Metadata, UserInfo } from '@memberjunction/core';
import type { CheckoutWidgetConfiguration } from '@mj-biz-apps/orders-entities';
import { LoadPaymentProviderConfig, ResolvePaymentCredentials } from './PaymentProviderResolver.js';

/** A Stripe key's mode, read from its prefix. */
export type StripeKeyMode = 'test' | 'live';

/** Where the browser's key came from. */
export type CheckoutPublishableKeySource = 'environment' | 'widget' | 'none';

export interface CheckoutPublishableKey {
    /** The key to send to the browser, or undefined for none (the widget then mounts no card form). */
    Key: string | undefined;
    Source: CheckoutPublishableKeySource;
    /** Set when the key's mode disagrees with the account's. Contains key prefixes only. */
    Warning?: string;
}

export interface CheckoutPublishableKeyInputs {
    /** The widget Configuration's `stripePublishableKey`, as authored (any type — it is admin JSON). */
    WidgetKey: unknown;
    /** The provider's publishable key from the secret seam, when a provider was resolved. */
    ProviderKey?: string;
    /** The provider's API key — read for its PREFIX only, to know the account's mode. */
    ApiKey?: string;
    IsLiveMode?: boolean;
    ProviderName?: string;
    CredentialsRef?: string | null;
}

/** `test` / `live` for a Stripe `pk_`, `sk_` or `rk_` key; null for anything else or nothing. */
export function StripeKeyModeOf(key: string | null | undefined): StripeKeyMode | null {
    if (!key) return null;
    const match = /^(?:pk|sk|rk)_(test|live)_/.exec(key.trim());
    if (!match) return null;
    return match[1] === 'live' ? 'live' : 'test';
}

/**
 * The pure decision: which key, from where, and whether its mode disagrees with the account's.
 * The provider's key wins; the widget's is the fallback; blank strings count as absent.
 */
export function ChooseCheckoutPublishableKey(inputs: CheckoutPublishableKeyInputs): CheckoutPublishableKey {
    const providerKey = typeof inputs.ProviderKey === 'string' ? inputs.ProviderKey.trim() : '';
    const widgetKey = typeof inputs.WidgetKey === 'string' ? inputs.WidgetKey.trim() : '';

    const result: CheckoutPublishableKey = providerKey
        ? { Key: providerKey, Source: 'environment' }
        : widgetKey
          ? { Key: widgetKey, Source: 'widget' }
          : { Key: undefined, Source: 'none' };

    const keyMode = StripeKeyModeOf(result.Key);
    const apiKeyMode = StripeKeyModeOf(inputs.ApiKey);
    const accountMode: StripeKeyMode | null =
        apiKeyMode ?? (inputs.IsLiveMode === undefined ? null : inputs.IsLiveMode ? 'live' : 'test');
    if (keyMode && accountMode && keyMode !== accountMode) {
        const basis = apiKeyMode
            ? `its API key is a ${apiKeyMode} key`
            : `IsLiveMode is ${inputs.IsLiveMode ? 'on' : 'off'}`;
        const from =
            result.Source === 'environment'
                ? `${envName(inputs.CredentialsRef)} on this server`
                : `the widget's stripePublishableKey`;
        result.Warning =
            `Payment provider '${inputs.ProviderName ?? 'unknown'}' is a ${accountMode} account (${basis}), but the ` +
            `checkout publishable key from ${from} is a pk_${keyMode}_ key. Stripe.js and the server will not ` +
            `agree, and card payments will fail. Set ${envName(inputs.CredentialsRef)} to the account's ` +
            `pk_${accountMode}_ key.`;
    }
    return result;
}

/**
 * The publishable key the browser should get for a widget's Configuration.
 *
 * Reads the widget's payment provider only when one is named. Every failure along that read — no
 * acting user, no metadata provider, an invalid or inactive provider, a secret store that throws — is
 * logged and falls back to the widget's own key, so this never makes a checkout fail to load.
 */
export async function ResolveCheckoutPublishableKey(
    configObj: CheckoutWidgetConfiguration,
    widgetName: string,
    contextUser: UserInfo | undefined,
): Promise<CheckoutPublishableKey> {
    const widgetKey = configObj.stripePublishableKey;
    const providerID = typeof configObj.paymentProviderId === 'string' ? configObj.paymentProviderId.trim() : '';
    if (!providerID) {
        return ChooseCheckoutPublishableKey({ WidgetKey: widgetKey });
    }

    const provider = Metadata.Provider as IMetadataProvider | undefined;
    if (!contextUser || !provider) {
        LogError(
            `[CheckoutPublishableKey] Widget '${widgetName}': cannot read payment provider ${providerID} for its ` +
                `publishable key (${!contextUser ? 'no acting user' : 'no metadata provider'}); using the widget's key.`,
        );
        return ChooseCheckoutPublishableKey({ WidgetKey: widgetKey });
    }

    try {
        const config = await LoadPaymentProviderConfig(providerID, provider, contextUser);
        const credentials = await ResolvePaymentCredentials(config.CredentialsRef);
        const chosen = ChooseCheckoutPublishableKey({
            WidgetKey: widgetKey,
            ProviderKey: credentials.PublishableKey,
            ApiKey: credentials.ApiKey,
            IsLiveMode: config.IsLiveMode,
            ProviderName: config.Name,
            CredentialsRef: config.CredentialsRef,
        });
        if (chosen.Warning) {
            LogErrorEx({
                message: `Widget '${widgetName}': ${chosen.Warning}`,
                severity: 'warning',
                category: 'CheckoutPublishableKey',
            });
        }
        return chosen;
    } catch (err) {
        LogError(
            `[CheckoutPublishableKey] Widget '${widgetName}': could not resolve payment provider ${providerID} for its ` +
                `publishable key; using the widget's key. ${err instanceof Error ? err.message : String(err)}`,
        );
        return ChooseCheckoutPublishableKey({ WidgetKey: widgetKey });
    }
}

/** The environment variable the default resolver reads, for messages. */
function envName(credentialsRef: string | null | undefined): string {
    if (!credentialsRef) return '<CredentialsRef>_PUBLISHABLE_KEY';
    return `${credentialsRef.replace(/[^A-Za-z0-9_]/g, '_').toUpperCase()}_PUBLISHABLE_KEY`;
}
