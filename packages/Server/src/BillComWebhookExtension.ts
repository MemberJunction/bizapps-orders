/**
 * @fileoverview `OrdersBillComWebhook` — POST /webhooks/billcom/:providerId, mounted before auth.
 *
 * WHAT A BILL.COM WEBHOOK CAN AND CANNOT DO FOR US. Bill.com publishes invoice events
 * (created/updated/archived/restored) signed HMAC-SHA256 over the raw body, and NO payment-received
 * event; an `invoice.updated` carries no receivable-payment id. So the poll (`Orders.PollExternalPayments`)
 * stays the source of truth for cash, and this route does exactly one thing with a VERIFIED
 * notification: run that poll for the provider named in the URL, now, instead of at the next tick.
 * Unverified notifications do nothing — the only thing this endpoint can make us do is call Bill.com,
 * and an unauthenticated way to make us do that is a way to exhaust our API budget.
 *
 * RAW BODY, LIKE THE PAYMENT WEBHOOK. A JSON parser upstream re-serialises the body and invalidates
 * every signature, so this route parses nothing before verifying.
 *
 * RESPOND FIRST, POLL AFTER. Bill.com retries a non-200 with exponential backoff and disables a
 * subscription that keeps failing. A poll can take longer than a webhook client waits, so the route
 * returns 202 as soon as the signature verifies and runs the poll detached, logging its outcome.
 *
 * REGISTERING THE SUBSCRIPTION IS A SETUP STEP, NOT CODE: `POST /v3/subscriptions` in Bill.com with
 * `notificationUrl = https://<host>/webhooks/billcom/<PaymentProviderID>` and `events` = the four
 * invoice events, then put the returned `securityKey` where the provider's `CredentialsRef` points
 * (`<REF>_WEBHOOK_SECRET`).
 *
 * @module @mj-biz-apps/orders-server
 */
import BodyParser from 'body-parser';
import type { Application, Request, Response } from 'express';
import { LogError, LogStatus, Metadata, type IMetadataProvider, type UserInfo } from '@memberjunction/core';
import { UserCache } from '@memberjunction/generic-database-provider';
import { RegisterClass } from '@memberjunction/global';
import { BaseServerExtension, type ExtensionHealthResult, type ExtensionInitResult, type ServerExtensionConfig } from '@memberjunction/server-extensions-core';
import { OrdersPollExternalPaymentsOperation } from '@mj-biz-apps/orders-entities';
import { IsPaymentRelevant, ResolvePaymentProvider } from '@mj-biz-apps/orders-core-entities-server';

const MAX_BODY = '1mb';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

@RegisterClass(BaseServerExtension, 'OrdersBillComWebhook')
export class BillComWebhookExtension extends BaseServerExtension {
    public async Initialize(app: Application, config: ServerExtensionConfig): Promise<ExtensionInitResult> {
        const route = `${config.RootPath.replace(/\/+$/, '')}/:providerId`;
        app.post(route, BodyParser.raw({ type: '*/*', limit: MAX_BODY }), async (req: Request, res: Response) => {
            await HandleBillComWebhook(
                {
                    // Raw bytes under the raw parser, a string if something already decoded it — the same
                    // reading as PaymentWebhookHandler. Never re-serialised: that would break the signature.
                    rawBody: typeof req.body === 'string' ? req.body : String(req.body ?? ''),
                    headers: flattenHeaders(req.headers),
                    providerId: String(req.params?.providerId ?? ''),
                },
                res,
                () => ({ provider: Metadata.Provider, user: this.resolveSystemUser() }),
            );
        });
        LogStatus(`[Orders] Bill.com webhook route registered at POST ${route}`);
        return { Success: true, Message: 'Orders Bill.com webhook mounted (unauthenticated, raw body, signature-verified; a verified event triggers the payment poll).', RegisteredRoutes: [`POST ${route}`] };
    }

    public async Shutdown(): Promise<void> {
        // Nothing held open.
    }

    public async HealthCheck(): Promise<ExtensionHealthResult> {
        const user = this.resolveSystemUser();
        return user
            ? { Healthy: true, Name: 'OrdersBillComWebhook' }
            : { Healthy: false, Name: 'OrdersBillComWebhook', Details: { Reason: "MJ's system user does not resolve, so every Bill.com notification will be refused." } };
    }

    private resolveSystemUser(): UserInfo | undefined {
        try {
            return UserCache.Instance.GetSystemUser() ?? undefined;
        } catch {
            return undefined;
        }
    }
}

export interface BillComWebhookRequest {
    rawBody: string;
    headers: Record<string, string | undefined>;
    providerId: string;
}

/** Transport-agnostic so it can be tested without Express. Exported for that reason. */
export async function HandleBillComWebhook(
    req: BillComWebhookRequest,
    res: { status(code: number): { json(body: unknown): unknown } },
    context: () => { provider: IMetadataProvider | undefined; user: UserInfo | undefined },
    runPoll: (providerId: string, provider: IMetadataProvider, user: UserInfo) => Promise<void> = defaultRunPoll,
): Promise<void> {
    if (!UUID.test(req.providerId)) {
        res.status(404).json({ received: false, reason: 'unknown provider' });
        return;
    }
    const { provider, user } = context();
    if (!provider || !user) {
        // 500, not 4xx: the notification is real and we want it retried once startup is fixed.
        LogError("A Bill.com webhook arrived but MJ's system user or provider could not be resolved; refusing so Bill.com retries.");
        res.status(500).json({ received: false });
        return;
    }
    let driver;
    try {
        driver = await ResolvePaymentProvider(req.providerId, provider, user);
    } catch (err) {
        LogError(`Bill.com webhook for provider ${req.providerId}: ${err instanceof Error ? err.message : String(err)}`);
        res.status(404).json({ received: false, reason: 'provider not configured' });
        return;
    }
    if (driver.Config.TypeCode !== 'BillCom') {
        res.status(404).json({ received: false, reason: 'not a Bill.com provider' });
        return;
    }
    const verdict = await driver.VerifyWebhook(req.rawBody, req.headers);
    if (!verdict.Valid) {
        LogError(`Bill.com webhook for provider ${req.providerId} refused: ${verdict.Reason ?? 'signature invalid'}`);
        res.status(401).json({ received: false });
        return;
    }
    const event = driver.ParseWebhookEvent(req.rawBody);
    const relevant = !event || IsPaymentRelevant(event.Kind);
    // Acknowledge now; Bill.com's retry clock is short and a poll is not.
    res.status(202).json({ received: true, polled: relevant, kind: event?.Kind ?? null });
    if (!relevant) return;
    void runPoll(req.providerId, provider, user).catch((err) => LogError(`Bill.com webhook-triggered poll for ${req.providerId} failed: ${err instanceof Error ? err.message : String(err)}`));
}

async function defaultRunPoll(providerId: string, provider: IMetadataProvider, user: UserInfo): Promise<void> {
    const result = await new OrdersPollExternalPaymentsOperation().Execute({ PaymentProviderID: providerId, Preview: false }, { provider, user });
    const out = result.Output;
    LogStatus(`[Orders] Bill.com webhook-triggered poll for ${providerId}: ${out?.Message ?? result.ErrorMessage ?? 'no result'}`);
}

function flattenHeaders(headers: Request['headers']): Record<string, string | undefined> {
    const flat: Record<string, string | undefined> = {};
    for (const [key, value] of Object.entries(headers)) flat[key.toLowerCase()] = Array.isArray(value) ? value.join(',') : value;
    return flat;
}

/** Tree-shaking anchor — call from the server bootstrap. */
export function LoadBillComWebhookExtension(): void {
    void BillComWebhookExtension;
}
