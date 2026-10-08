/**
 * Webhook endpoint drift check (#477).
 *
 * The events a Stripe webhook endpoint sends are chosen by hand in the gateway's dashboard, and the
 * gateway keeps no history of changes. Each driver declares the events it acts on
 * (`HandledEventKinds`); nothing compared that list with the live endpoint, so an event dropped from
 * the endpoint — `charge.refunded`, say — went unnoticed until the books disagreed.
 *
 * WHICH ENDPOINT IS ORDERS'. The webhook route ends in the provider's id
 * (`<root>/webhooks/payments/<PaymentProviderID>`), so the endpoint is the one whose URL path ends in
 * that id. No base-URL setting is needed, and two environments sharing one gateway account do not
 * confuse each other.
 *
 * DRIFT IS A CONFIGURATION FAULT, NOT A FINANCE ITEM. It is logged as an error and fails the scheduled
 * run; it is not raised on finance's review list, which is for money that needs a decision.
 *
 * ONLY LIVE PROVIDERS. A provider in test mode runs the stub driver, which has no endpoint to read.
 *
 * CONNECTS TO:
 *   DRIVER:  ./BasePaymentProvider.ts `ListWebhookEndpoints`
 *   CALLERS: packages/Server — the scheduled Action and the check at server start
 */
import { LogError, LogStatus, RunView, type IMetadataProvider, type IRunViewProvider, type UserInfo } from '@memberjunction/core';
import type { GatewayWebhookEndpoint } from './BasePaymentProvider.js';
import { BuildPaymentProvider, LoadPaymentProviderConfig } from './PaymentProviderResolver.js';
import { RequireUUID } from './sql-guards.js';

const PAYMENT_PROVIDER_ENTITY = 'MJ_BizApps_Orders: Payment Providers';

/** The result for one provider. */
export interface WebhookEndpointCheckResult {
    PaymentProviderID: string;
    PaymentProviderName: string;
    /**
     * `OK`: the endpoint sends every handled kind. `Drift`: it does not. `Missing`: no endpoint points
     * at this provider's route. `Disabled`: one does, but it is switched off. `Skipped`: the provider is
     * not live. `Error`: the gateway could not be read.
     */
    Status: 'OK' | 'Drift' | 'Missing' | 'Disabled' | 'Skipped' | 'Error';
    /** Handled kinds the endpoint does not send. */
    MissingKinds: string[];
    EndpointUrl?: string;
    Message: string;
}

/** True when an endpoint's URL path ends in `/<providerID>`. Case and a trailing slash do not matter. */
export function EndpointServesProvider(url: string, paymentProviderID: string): boolean {
    let path: string;
    try {
        path = new URL(url).pathname;
    } catch {
        return false;
    }
    const trimmed = path.replace(/\/+$/, '').toLowerCase();
    return trimmed.endsWith(`/${paymentProviderID.toLowerCase()}`);
}

/**
 * Compare a provider's handled kinds with the endpoints the gateway has.
 *
 * When several endpoints point at the route, the enabled one that sends the most handled kinds is the
 * one judged: a stale duplicate must not hide a correct endpoint, nor the other way round.
 */
export function CheckWebhookEndpointDrift(input: {
    PaymentProviderID: string;
    HandledKinds: readonly string[];
    Endpoints: GatewayWebhookEndpoint[];
}): Pick<WebhookEndpointCheckResult, 'Status' | 'MissingKinds' | 'EndpointUrl' | 'Message'> {
    const mine = input.Endpoints.filter((e) => EndpointServesProvider(e.Url, input.PaymentProviderID));
    if (mine.length === 0) {
        return {
            Status: 'Missing',
            MissingKinds: [...input.HandledKinds],
            Message: `No webhook endpoint at the gateway points at this provider's route (…/${input.PaymentProviderID}).`,
        };
    }
    const missingFor = (e: GatewayWebhookEndpoint): string[] =>
        e.EnabledEvents.includes('*') ? [] : input.HandledKinds.filter((k) => !e.EnabledEvents.includes(k));
    const enabled = mine.filter((e) => e.Status === 'enabled');
    if (enabled.length === 0) {
        return {
            Status: 'Disabled',
            MissingKinds: [...input.HandledKinds],
            EndpointUrl: mine[0].Url,
            Message: `The webhook endpoint ${mine[0].Url} is disabled at the gateway, so no events reach Orders.`,
        };
    }
    const best = [...enabled].sort((a, b) => missingFor(a).length - missingFor(b).length)[0];
    const missing = missingFor(best);
    if (missing.length === 0) {
        return { Status: 'OK', MissingKinds: [], EndpointUrl: best.Url, Message: `${best.Url} sends every event Orders handles.` };
    }
    return {
        Status: 'Drift',
        MissingKinds: missing,
        EndpointUrl: best.Url,
        Message: `The webhook endpoint ${best.Url} does not send ${missing.join(', ')}, which Orders acts on.`,
    };
}

/**
 * Check every active, live, webhook-capable provider, or only `paymentProviderID` when given.
 * Logs an error for each result that is not OK or Skipped. Never throws for one provider's failure.
 */
export async function CheckPaymentWebhookEndpoints(
    provider: IMetadataProvider,
    user: UserInfo,
    paymentProviderID?: string,
): Promise<WebhookEndpointCheckResult[]> {
    if (paymentProviderID) RequireUUID(paymentProviderID, 'PaymentProviderID');
    const rv = new RunView(provider as unknown as IRunViewProvider);
    const rows = await rv.RunView<{ ID: string; Name: string; IsLiveMode: boolean }>(
        {
            EntityName: PAYMENT_PROVIDER_ENTITY,
            ExtraFilter: paymentProviderID ? `ID = '${paymentProviderID}' AND IsActive = 1` : 'IsActive = 1',
            Fields: ['ID', 'Name', 'IsLiveMode'],
            ResultType: 'simple',
            BypassCache: true,
        },
        user,
    );
    if (!rows.Success) throw new Error(`Could not read the payment providers: ${rows.ErrorMessage}`);

    const results: WebhookEndpointCheckResult[] = [];
    for (const row of rows.Results ?? []) {
        const base = { PaymentProviderID: row.ID, PaymentProviderName: row.Name, MissingKinds: [] as string[] };
        try {
            const config = await LoadPaymentProviderConfig(row.ID, provider, user);
            if (!config.Capabilities.SupportsWebhooks) continue;
            if (!config.IsLiveMode) {
                results.push({ ...base, Status: 'Skipped', Message: 'Test mode: the stub driver has no webhook endpoint to read.' });
                continue;
            }
            const driver = await BuildPaymentProvider(config, provider, user);
            const listed = await driver.ListWebhookEndpoints();
            if (!listed.Success) {
                results.push({ ...base, Status: 'Error', Message: `Could not read the gateway's webhook endpoints: ${listed.Reason}` });
                continue;
            }
            results.push({
                ...base,
                ...CheckWebhookEndpointDrift({
                    PaymentProviderID: row.ID,
                    HandledKinds: driver.HandledEventKinds,
                    Endpoints: listed.Endpoints ?? [],
                }),
            });
        } catch (err) {
            results.push({ ...base, Status: 'Error', Message: err instanceof Error ? err.message : String(err) });
        }
    }

    for (const r of results) {
        if (r.Status === 'OK' || r.Status === 'Skipped') {
            LogStatus(`[Orders] Webhook endpoint check, ${r.PaymentProviderName}: ${r.Status}. ${r.Message}`);
        } else {
            LogError(`[Orders] WEBHOOK-ENDPOINT-DRIFT ${r.PaymentProviderName} (${r.PaymentProviderID}): ${r.Status}. ${r.Message}`);
        }
    }
    return results;
}
