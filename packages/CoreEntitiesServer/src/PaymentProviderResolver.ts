/**
 * PaymentProviderResolver — turns a `PaymentProvider` row into a working driver.
 *
 * Two jobs, and the second is the one with teeth.
 *
 * 1. FIND THE DRIVER. `PaymentProviderType.Code` is the `@RegisterClass` key (D37), so resolution is a
 *    ClassFactory lookup and adding a gateway needs no schema change. A missing registration REFUSES
 *    rather than falling back to the base class: the base's methods all decline, so a fallback would
 *    look like a gateway that cannot do anything rather than like a driver nobody registered — and the
 *    difference is a five-minute fix versus an afternoon.
 *
 * 2. FIND THE CREDENTIALS, WITHOUT EVER STORING THEM. `PaymentProvider.CredentialsRef` is a POINTER —
 *    the name of a place to look, not a secret. Nothing in this schema holds an API key, because a
 *    database that holds live payment credentials is a database whose backups do too.
 *
 * THE SECRET SEAM. `CredentialsRef` resolves through `BaseSecretResolver`, registered by ClassFactory
 * like everything else here. The default reads environment variables, which is right for a single
 * deployment and inadequate for a real one — so a customer using Vault, AWS Secrets Manager or Azure
 * Key Vault registers a subclass and changes no other code. Naming the seam is the point; pretending
 * environment variables are a secret store would be the mistake.
 *
 * CREDENTIALS ARE NEVER CACHED. They are fetched per operation and dropped. A cache would keep live
 * keys in process memory for the lifetime of a server for the sake of avoiding a lookup that happens
 * once per payment, which is not a trade worth making.
 *
 * CONNECTS TO:
 *   BASE:    ./BasePaymentProvider.ts
 *   DRIVERS: ./StripePaymentProvider.ts · ./ManualPaymentProvider.ts · ./StoredValuePaymentProvider.ts
 *   DOC:     plans/bizapps-orders-master.md D19, D37
 */
import { IMetadataProvider, IRunViewProvider, RunView, UserInfo } from '@memberjunction/core';
import { MJGlobal, RegisterClass } from '@memberjunction/global';
import { LoadOrdersEngine, OrdersEngine } from '@mj-biz-apps/orders-entities';
import {
    BasePaymentProvider,
    type PaymentCredentials,
    type PaymentProviderConfig,
} from './BasePaymentProvider.js';

const PAYMENT_PROVIDER_ENTITY = 'MJ_BizApps_Orders: Payment Providers';

/**
 * Declared rather than imported. The shared server tsconfig sets `"types": []`, so this package has no
 * Node globals — and adding `@types/node` to it to read two environment variables would change a config
 * every other package inherits. This is the whole surface used, and it is the DEFAULT resolver's only
 * dependency: a deployment on a real secret store replaces the class and never reaches it.
 */
declare const process: { env: Record<string, string | undefined> };

/**
 * How a `CredentialsRef` becomes actual secrets.
 *
 * The default treats the ref as an environment-variable PREFIX, so `STRIPE_BLUECYPRESS` reads
 * `STRIPE_BLUECYPRESS_API_KEY` and `STRIPE_BLUECYPRESS_WEBHOOK_SECRET`. Prefixed rather than a single
 * variable because one deployment routinely holds several configured accounts — a live one and a test
 * one at minimum — and they need separate keys.
 */
export class BaseSecretResolver {
    /**
     * Returns whatever it can find. An EMPTY result is not an error here: a Manual provider has no
     * credentials at all, and the driver that needs a key is the one that should complain about its
     * absence, with the context to say what it was trying to do.
     */
    public async Resolve(_credentialsRef: string | null | undefined): Promise<PaymentCredentials> {
        return {};
    }
}

/**
 * The default: `CredentialsRef` is an environment-variable PREFIX.
 *
 * `STRIPE_BLUECYPRESS` reads `STRIPE_BLUECYPRESS_API_KEY` and `STRIPE_BLUECYPRESS_WEBHOOK_SECRET`.
 * Prefixed rather than a single variable because one deployment routinely holds several configured
 * accounts — a live one and a test one at minimum — and they need separate keys.
 *
 * Registered with NO key, so it is the fallback a deployment replaces by registering its own against
 * `BaseSecretResolver` — the same shape as `DefaultPriceResolver`.
 */
@RegisterClass(BaseSecretResolver)
export class EnvironmentSecretResolver extends BaseSecretResolver {
    public override async Resolve(credentialsRef: string | null | undefined): Promise<PaymentCredentials> {
        if (!credentialsRef) return {};
        const prefix = credentialsRef.replace(/[^A-Za-z0-9_]/g, '_').toUpperCase();
        const env = process.env;
        const credentials: PaymentCredentials = {};
        // `|| undefined` rather than `?? ''`: an empty string satisfies a truthiness check downstream
        // and produces an authorization header of `Bearer `, which fails confusingly.
        credentials.ApiKey = env[`${prefix}_API_KEY`] || undefined;
        credentials.WebhookSecret = env[`${prefix}_WEBHOOK_SECRET`] || undefined;
        return credentials;
    }
}

/** Tree-shaking anchor for the secret seam. */
export function LoadEnvironmentSecretResolver(): void {
    // intentionally empty
}

export class PaymentProviderNotConfiguredError extends Error {}

/**
 * Load a configured provider row and hand back a ready driver.
 *
 * Throws rather than returning null. Every caller of this is about to move money and cannot proceed
 * without a driver, so there is no branch for a caller to take — and an exception carries the reason to
 * a log, where a returned null would arrive as "cannot read property of undefined" somewhere else.
 */
export async function ResolvePaymentProvider(
    paymentProviderID: string,
    provider: IMetadataProvider,
    user: UserInfo,
): Promise<BasePaymentProvider> {
    const config = await LoadPaymentProviderConfig(paymentProviderID, provider, user);
    return BuildPaymentProvider(config, provider, user);
}

/** The configured account, with its type's code and capability flags flattened onto it. */
export async function LoadPaymentProviderConfig(
    paymentProviderID: string,
    provider: IMetadataProvider,
    user: UserInfo,
): Promise<PaymentProviderConfig> {
    if (!/^[0-9a-fA-F-]{36}$/.test(paymentProviderID)) {
        throw new PaymentProviderNotConfiguredError(
            `'${paymentProviderID}' is not a valid payment provider identifier.`,
        );
    }

    const rv = new RunView(provider as unknown as IRunViewProvider);
    // The generated view flattens the type's fields onto the provider, which is what makes this one
    // query rather than two. `PaymentProviderType` is the related entity, so `Code` arrives as
    // `PaymentProviderType` — MJ names a related display field after its entity.
    const result = await rv.RunView<{
        ID: string;
        CompanyID: string;
        Name: string;
        CredentialsRef: string | null;
        IsLiveMode: boolean;
        IsActive: boolean;
        PaymentProviderTypeID: string;
        PaymentProviderType: string | null;
    }>(
        {
            EntityName: PAYMENT_PROVIDER_ENTITY,
            ExtraFilter: `ID = '${paymentProviderID}'`,
            ResultType: 'simple',
        },
        user,
    );

    const row = result?.Results?.[0];
    if (!row) {
        throw new PaymentProviderNotConfiguredError(
            `No payment provider ${paymentProviderID} exists. A payment cannot be routed without one.`,
        );
    }
    if (!row.IsActive) {
        throw new PaymentProviderNotConfiguredError(
            `Payment provider '${row.Name}' is inactive. Reactivate it or point the payment at another, ` +
                `rather than letting an inactive gateway be used silently.`,
        );
    }

    const typeCode = await resolveTypeCode(row.PaymentProviderTypeID, row.PaymentProviderType, provider, user);

    return {
        ID: row.ID,
        TypeCode: typeCode.Code,
        CompanyID: row.CompanyID,
        Name: row.Name,
        CredentialsRef: row.CredentialsRef,
        IsLiveMode: !!row.IsLiveMode,
        Capabilities: {
            SupportsTokenization: typeCode.SupportsTokenization,
            SupportsRefund: typeCode.SupportsRefund,
            SupportsWebhooks: typeCode.SupportsWebhooks,
        },
    };
}

/**
 * Instantiate the driver for a config and attach everything it needs.
 *
 * Exposed separately from `ResolvePaymentProvider` so the webhook route can build a driver from a config
 * it already loaded — the route resolves a provider from the URL before it has a payment in hand, and
 * making it re-query would mean two lookups for one request.
 */
export async function BuildPaymentProvider(
    config: PaymentProviderConfig,
    provider: IMetadataProvider,
    user: UserInfo,
): Promise<BasePaymentProvider> {
    const driver = MJGlobal.Instance.ClassFactory.CreateInstance<BasePaymentProvider>(
        BasePaymentProvider,
        config.TypeCode,
    );
    if (!driver) {
        throw new PaymentProviderNotConfiguredError(
            `No payment driver is registered for provider type '${config.TypeCode}'. Register one with ` +
                `@RegisterClass(BasePaymentProvider, '${config.TypeCode}') and call its Load* anchor from ` +
                `the server bootstrap — without the anchor the decorator is tree-shaken away and the ` +
                `class is silently absent.`,
        );
    }

    // REFUSE THE BASE CLASS. `CreateInstance` falls back to the base when no key matches, and the base
    // declines every operation — so accepting it would turn "nobody registered a Stripe driver" into
    // "Stripe cannot take payments", which sends the reader to the gateway instead of to the bootstrap.
    if (driver.constructor === BasePaymentProvider) {
        throw new PaymentProviderNotConfiguredError(
            `Provider type '${config.TypeCode}' resolved to the BASE payment driver, which implements ` +
                `nothing. Its Load* anchor is almost certainly missing from the server bootstrap.`,
        );
    }

    const secrets =
        MJGlobal.Instance.ClassFactory.CreateInstance<BaseSecretResolver>(BaseSecretResolver) ??
        new EnvironmentSecretResolver();

    driver.Config = config;
    driver.Credentials = await secrets.Resolve(config.CredentialsRef);
    driver.Provider = provider;
    driver.User = user;
    return driver;
}

/**
 * The type's `Code` and capability flags.
 *
 * The provider view carries the type's NAME as a related field, and name is not key — a deployment may
 * rename 'Stripe' to 'Stripe (Blue Cypress)' and the ClassFactory key must not move with it. So the
 * type row is read for its `Code`.
 */
async function resolveTypeCode(
    typeID: string,
    relatedName: string | null,
    provider: IMetadataProvider,
    user: UserInfo,
): Promise<{ Code: string; SupportsTokenization: boolean; SupportsRefund: boolean; SupportsWebhooks: boolean }> {
    // CACHE FIRST, THEN THE QUERY — and the fallback is not belt-and-braces.
    //
    // Provider types are seeded metadata and belong in {@link OrdersEngine} like every other lookup,
    // so the common path is a property read. But unlike the other lookups, a provider type is also
    // created at RUN TIME: a deployment adding a gateway, and the integration fixture creating one
    // inside a rolled-back transaction. A cache loaded before that row existed cannot see it, and a
    // miss here does not degrade gracefully — it throws `PaymentProviderNotConfiguredError`, which
    // reads as "this gateway is not set up" for a gateway that plainly is.
    //
    // So a miss falls through to the query it always did. Same behaviour, same errors; the reads
    // that hit the cache simply stop costing a round trip.
    await LoadOrdersEngine(provider, user);
    const cached = OrdersEngine.Instance.PaymentProviderTypeByID(typeID);

    let type: { Code: string; SupportsTokenization: boolean; SupportsRefund: boolean; SupportsWebhooks: boolean } | undefined =
        cached
            ? {
                  Code: cached.Code,
                  SupportsTokenization: cached.SupportsTokenization,
                  SupportsRefund: cached.SupportsRefund,
                  SupportsWebhooks: cached.SupportsWebhooks,
              }
            : undefined;

    if (!type) {
        const rv = new RunView(provider as unknown as IRunViewProvider);
        const result = await rv.RunView<{
            ID: string;
            Code: string;
            SupportsTokenization: boolean;
            SupportsRefund: boolean;
            SupportsWebhooks: boolean;
            IsActive: boolean;
        }>(
            {
                EntityName: 'MJ_BizApps_Orders: Payment Provider Types',
                ExtraFilter: `ID = '${typeID}'`,
                ResultType: 'simple',
            },
            user,
        );
        type = result?.Results?.[0];
    }
    if (!type) {
        throw new PaymentProviderNotConfiguredError(
            `Payment provider type ${typeID}${relatedName ? ` ('${relatedName}')` : ''} was not found.`,
        );
    }
    return {
        Code: type.Code,
        SupportsTokenization: !!type.SupportsTokenization,
        SupportsRefund: !!type.SupportsRefund,
        SupportsWebhooks: !!type.SupportsWebhooks,
    };
}
