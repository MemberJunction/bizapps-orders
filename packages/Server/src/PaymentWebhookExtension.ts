/**
 * The route that lets a gateway tell us money moved — finally mounted.
 *
 * `MountPaymentWebhook` has existed since the payment drivers landed and was called by nobody. That was
 * survivable while every provider settled synchronously: a card capture books at the moment it is
 * asked, so the webhook only ever confirmed something already recorded, and its absence cost a little
 * reconciliation detail. It stops being survivable the instant a bank debit is configured. A debit is
 * captured BY the webhook — there is no other moment at which the money is known to have arrived — so
 * without this route every ACH payment sits `Pending` for ever and no cash is ever booked.
 *
 * WHY AN EXTENSION AND NOT A CHANGE TO MJ. MJServer loads `serverExtensions[]` from `mj.config.cjs`
 * BEFORE it installs the auth middleware, which is precisely the window an unauthenticated webhook
 * needs. So the route can be mounted from this repo, in this app's own config, with no upstream change
 * — and an operator can turn it off by flipping `Enabled` rather than by redeploying.
 *
 * ═══ TWO THINGS THE MOUNT MUST GET RIGHT, both of them silent when wrong ═══
 *
 * BEFORE AUTH. Stripe presents no bearer token; the signature IS the credential. Behind the auth
 * middleware every delivery would be rejected with a 401 that Stripe retries and eventually gives up
 * on, and the only symptom is payments that never capture.
 *
 * RAW BODY, ON THIS PATH ONLY. The signature covers the exact bytes sent. Any JSON round-trip — key
 * reordering, whitespace, unicode normalisation — changes them, so a `express.json()` upstream turns
 * every legitimate webhook into a signature failure. `express.raw()` is scoped to this route so it
 * cannot affect anything else the app serves.
 *
 * THE PROVIDER ID IS IN THE PATH, and one endpoint per configured provider is deliberate. It is what
 * tells the handler WHICH secret to verify against before it has read a byte of the payload — a single
 * shared endpoint would have to parse untrusted JSON to work out whose signature to check, which is
 * the one thing `HandlePaymentWebhook` is ordered to avoid.
 *
 * THE SYSTEM USER, AND WHY IT IS RESOLVED PER REQUEST. There is no human behind a webhook, so the
 * writes are attributed to MJ's system user — the same one MJ's own unauthenticated eSignature webhook
 * uses, via the same `UserCache`, rather than a bespoke email setting this app would then have to keep
 * correct. It is looked up on each delivery rather than cached at startup because the extension
 * initialises before the data provider is necessarily ready, and a user captured too early would be
 * absent for the lifetime of the process.
 *
 * CONNECTS TO:
 *   HANDLER: @mj-biz-apps/orders-core-entities-server → PaymentWebhookHandler
 *   CONFIG:  mj.config.cjs → serverExtensions[]
 *   DOC:     plans/archive/bizapps-orders-master.md D19
 */
import BodyParser from 'body-parser';
import type { Application, Request, Response } from 'express';
import { LogError, LogStatus, Metadata, UserInfo } from '@memberjunction/core';
import { UserCache } from '@memberjunction/generic-database-provider';
import { RegisterClass } from '@memberjunction/global';
import {
    BaseServerExtension,
    type ExtensionHealthResult,
    type ExtensionInitResult,
    type ServerExtensionConfig,
} from '@memberjunction/server-extensions-core';
import { MountPaymentWebhook } from '@mj-biz-apps/orders-core-entities-server';

/** Stripe's largest documented event payload is well under this; the cap keeps the door narrow. */
const MAX_BODY = '1mb';

@RegisterClass(BaseServerExtension, 'OrdersPaymentWebhook')
export class PaymentWebhookExtension extends BaseServerExtension {
    public async Initialize(app: Application, config: ServerExtensionConfig): Promise<ExtensionInitResult> {
        const route = `${config.RootPath.replace(/\/+$/, '')}/:providerId`;

        app.post(
            route,
            // RAW, and scoped to this path. See the header — a JSON parser anywhere upstream of this
            // invalidates every signature.
            BodyParser.raw({ type: 'application/json', limit: MAX_BODY }),
            async (req: Request, res: Response) => {
                const user = this.resolveSystemUser();
                if (!user) {
                    // 500, NOT 400. The gateway did nothing wrong and the event is real — this is our
                    // configuration being incomplete, and a 4xx would tell Stripe to stop retrying a
                    // notification we very much want back once someone fixes it.
                    LogError(
                        'A payment webhook arrived but MJ\'s system user could not be resolved, so it ' +
                            'cannot be recorded. The user cache is not populated — this is a startup ' +
                            'problem, not a problem with the delivery.',
                    );
                    res.status(500).json({ received: false });
                    return;
                }

                const handler = MountPaymentWebhook(() => ({ provider: Metadata.Provider, user }));
                await handler(
                    {
                        body: req.body,
                        headers: flattenHeaders(req.headers),
                        // Only the one parameter the handler reads, narrowed to a string here rather
                        // than passed through as Express's `string | string[]` dictionary.
                        params: { providerId: String(req.params?.providerId ?? '') },
                    },
                    res,
                );
            },
        );

        LogStatus(`[Orders] Payment webhook route registered at POST ${route}`);
        return {
            Success: true,
            Message: 'Orders payment webhook mounted (unauthenticated, raw body, signature-verified).',
            RegisteredRoutes: [`POST ${route}`],
        };
    }

    public async Shutdown(): Promise<void> {
        // Nothing held open — the route owns no connections, timers or sockets.
    }

    public async HealthCheck(): Promise<ExtensionHealthResult> {
        // Healthy means "this route can do its job", which is exactly "the system user resolves".
        // Reporting healthy without checking would hide the one misconfiguration that silently drops
        // real payment notifications.
        const user = this.resolveSystemUser();
        return user
            ? { Healthy: true, Name: 'OrdersPaymentWebhook' }
            : {
                  Healthy: false,
                  Name: 'OrdersPaymentWebhook',
                  Details: {
                      Reason: 'MJ\'s system user does not resolve, so every webhook delivery will be refused.',
                  },
              };
    }

    /**
     * The user the webhook's writes are attributed to.
     *
     * Returns undefined rather than throwing, so the caller decides the status code. Looked up fresh
     * each time: the metadata provider may not have been ready when this extension initialised.
     */
    private resolveSystemUser(): UserInfo | undefined {
        try {
            return UserCache.Instance.GetSystemUser() ?? undefined;
        } catch {
            // The cache is not populated yet. Undefined rather than a throw, so the caller can answer
            // 500 and the gateway retries once startup has finished.
            return undefined;
        }
    }
}

/**
 * Express types a header value as `string | string[]` because a header CAN legitimately repeat.
 *
 * The handler wants a flat map, and the flattening matters for exactly one header: `stripe-signature`.
 * Joining a repeated value with a comma would be right by luck — Stripe's own scheme is already
 * comma-separated (`t=…,v1=…,v1=…`) so a proxy that split it across two headers rejoins correctly —
 * whereas taking the first would silently drop half a signature during a secret rotation and fail
 * verification for events that are perfectly valid.
 */
function flattenHeaders(headers: Request['headers']): Record<string, string | undefined> {
    const flat: Record<string, string | undefined> = {};
    for (const [key, value] of Object.entries(headers)) {
        flat[key] = Array.isArray(value) ? value.join(',') : value;
    }
    return flat;
}

/** Tree-shaking anchor — call from the server bootstrap so @RegisterClass is retained. */
export function LoadPaymentWebhookExtension(): void {
    // intentionally empty
}
