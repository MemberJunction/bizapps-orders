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
import { LogError, LogStatus, Metadata, type IMetadataProvider, type UserInfo, RunView, type IRunViewProvider } from '@memberjunction/core';
import { UserCache } from '@memberjunction/generic-database-provider';
import { RegisterClass, UUIDsEqual } from '@memberjunction/global';
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

/** The Action behind `Orders — Poll External Payments`, whose scheduled job governs this route. */
const POLL_ACTION_ID = 'B8C4D3E2-0A5F-4D72-9E3B-6F2A8C4D0B11';
/** That Action's `Preview` input param. Seeded by V202609272103; the job's Configuration names it. */
const POLL_PREVIEW_PARAM_ID = 'B8C4D3E2-0A5F-4D72-9E3B-6F2A8C4D0B13';
const SCHEDULED_JOB_ENTITY = 'MJ: Scheduled Jobs';

/**
 * Is this job's `Preview` param set to something the action will read as true?
 *
 * MUST AGREE WITH `boolParam` (packages/Server/src/custom/action-params.ts), which is what actually
 * decides whether the scheduled run previews. It accepts a real boolean as well as 'true', '1', 'yes'
 * and 'y', and every one of those is a spelling a person can put in the Configuration JSON. This used
 * to be a regex for `"Value": "true"` over the whole blob, which disagreed with `boolParam` on three
 * of them — each disagreement a job that previews while this route records cash — and matched ANY
 * param's value rather than Preview's, so a MaxCount of "true" would have blocked a live job.
 *
 * ABSENT MEANS NOT PREVIEWING, which is the action's own default (`preview = !!input?.Preview`);
 * the two have to answer the same way or the gate is worse than no gate.
 */
function previewParamIsTrue(configuration: string | null): boolean {
    let parsed: unknown;
    try {
        parsed = JSON.parse(configuration ?? '');
    } catch {
        // Unreadable configuration is not permission to record money.
        return true;
    }
    const params = (parsed as { Params?: unknown })?.Params;
    if (!Array.isArray(params)) return false;
    const preview = params.find((x) => typeof (x as { ActionParamID?: unknown })?.ActionParamID === 'string' && UUIDsEqual((x as { ActionParamID: string }).ActionParamID, POLL_PREVIEW_PARAM_ID));
    if (!preview) return false;
    const raw = (preview as { Value?: unknown }).Value;
    if (raw == null || raw === '') return false;
    if (typeof raw === 'boolean') return raw;
    return ['true', '1', 'yes', 'y'].includes(String(raw).trim().toLowerCase());
}

/**
 * A NOTIFICATION MUST NOT RECORD CASH THE SCHEDULED JOB IS NOT YET ALLOWED TO RECORD.
 *
 * This route used to call the poll with `Preview: false` outright. Both jobs ship Disabled and in
 * Preview precisely so Finance reads one run before any money moves, and merging this branch is
 * supposed to turn nothing on — but the route is enabled in the server config, so the day somebody
 * registered the Bill.com subscription and set the secret, the first `invoice.updated` event would
 * have captured a real payment and posted Dr Cash / Cr A/R before anyone had approved a preview.
 *
 * So the webhook now follows the job rather than overriding it: it polls only when the scheduled poll
 * job is Active AND out of Preview. Anything else is logged and ignored, because a webhook-driven
 * preview writes nothing and nobody reads its output — the scheduled run is where a preview belongs.
 */
export function PollJobIsLive(job: { Status: string | null; Configuration: string | null } | null | undefined): { Live: boolean; Why: string } {
    if (!job) return { Live: false, Why: 'no scheduled poll job is installed' };
    if ((job.Status ?? '').trim().toLowerCase() !== 'active') return { Live: false, Why: `the scheduled poll job is ${job.Status?.trim() || 'not active'}` };
    if (previewParamIsTrue(job.Configuration)) return { Live: false, Why: 'the scheduled poll job is still in Preview' };
    return { Live: true, Why: 'the scheduled poll job is live' };
}

/**
 * THE MOST RESTRICTIVE POLL JOB WINS, not whichever row the database happened to return first.
 *
 * One job covers every provider today (the shipped row names no `PaymentProviderID`), but the poll
 * takes one and this route is per-provider, so a site that splits the job per provider is an ordinary
 * configuration. Reading `Results[0]` of an unordered view then answered with an arbitrary job's
 * state — provider A live would have let a notification for provider B record cash while B's own job
 * was still in Preview. With no way to tell from here which job governs which provider, every
 * installed poll job has to agree before this route writes anything.
 */
async function pollIsLive(provider: IMetadataProvider, user: UserInfo): Promise<{ Live: boolean; Why: string }> {
    const rv = new RunView(provider as unknown as IRunViewProvider);
    const r = await rv.RunView<{ Status: string | null; Configuration: string | null }>(
        { EntityName: SCHEDULED_JOB_ENTITY, ExtraFilter: `Configuration LIKE '%${POLL_ACTION_ID}%'`, Fields: ['Status', 'Configuration'], OrderBy: 'Name', ResultType: 'simple' },
        user,
    );
    const jobs = r.Results ?? [];
    if (!jobs.length) return PollJobIsLive(null);
    const verdicts = jobs.map((j) => PollJobIsLive(j));
    const blocked = verdicts.find((v) => !v.Live);
    return blocked ?? verdicts[0];
}

async function defaultRunPoll(providerId: string, provider: IMetadataProvider, user: UserInfo): Promise<void> {
    const live = await pollIsLive(provider, user);
    if (!live.Live) {
        LogStatus(`[Orders] Bill.com notification for ${providerId} acknowledged but NOT polled: ${live.Why}. Nothing was recorded.`);
        return;
    }
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
