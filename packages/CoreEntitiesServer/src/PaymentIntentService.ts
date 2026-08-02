/**
 * Opening a payment intent — the front half of a gateway-collected payment.
 *
 * WHY THIS EXISTS. Every driver has implemented `CreateIntent` since the payment seam landed, and
 * until now NOTHING CALLED IT except unit tests. `PaymentHeaderEntityServer.settleWithProvider`
 * refuses a provider-backed capture without one — *"names a payment provider but no provider intent,
 * so there is nothing for the gateway to capture. Open an intent first"* — and there was no way to
 * open one. The gateway path was complete at both ends and had no beginning. This is the beginning.
 *
 * ═══ WHY AN INTENT IS ITS OWN ROW AND NOT A STATUS ON `PaymentHeader` ═══
 *
 * Three reasons, and all three are ordinary for a bank debit rather than edge cases:
 *
 *   RETRIES ARE 1:N. Insufficient funds is the commonest ACH failure, so a second attempt is the
 *   normal path. Each attempt is its own intent at the gateway with its own id. As a column you would
 *   either lose the first attempt's id on overwrite, or mint a `PaymentHeader` per attempt — putting
 *   rows for money that never moved into the payment series and into AR.
 *
 *   AN INTENT CAN EXIST WITH NO PAYMENT. A customer opens a hosted checkout and walks away. There is
 *   no cash, no allocation, nothing to record as a payment — and `DecideSettlement` already answers
 *   for exactly that case ("the intent has no payment to settle"). A status column cannot represent a
 *   payment that does not exist.
 *
 *   `ProviderEventID` IS THE WEBHOOK IDEMPOTENCY KEY AND IT LIVES HERE. Events can arrive before a
 *   header exists, or for an intent that never produces one. On the header, the key would not exist
 *   until the header did.
 *
 * There is also a lifecycle mismatch: a `Captured` header is frozen, while an intent churns through
 * `Processing → Succeeded`. And the two vocabularies are genuinely different — ours is cash-shaped
 * (`Pending|Captured|Failed|…`), the gateway's is attempt-shaped.
 *
 * THE CLIENT SECRET IS RETURNED AND NEVER STORED. It authorises the browser to confirm this intent;
 * persisting it would put a bearer credential in a table that reporting reads. `BasePaymentProvider`
 * says "Never logged" for the same reason, and the row below deliberately has no column for it.
 *
 * THIS DOES NOT CREATE A PAYMENT. Opening an intent is asking the gateway to stand ready; no money
 * has moved and nothing is owed differently because of it. `Orders.CapturePayment` writes the
 * `PaymentHeader` and links it to the intent by id.
 *
 * CONNECTS TO:
 *   DRIVER:  ./BasePaymentProvider.ts → CreateIntent
 *   LOOKUP:  ./PaymentProviderResolver.ts
 *   CAPTURE: ./CapturePaymentOperation.ts — takes the returned PaymentIntentID
 *   SETTLE:  ./PaymentSettlement.ts — moves the payment when the gateway answers
 *   DOC:     plans/bizapps-orders-master.md D19, D37, D80
 */
import {
    BaseEntity,
    LogError,
    LogStatus,
    RunView,
    type IMetadataProvider,
    type IRunViewProvider,
    type UserInfo,
} from '@memberjunction/core';
import { ResolvePaymentProvider } from './PaymentProviderResolver.js';
import type { IntentStatus } from './PaymentProviderBehavior.js';

const PAYMENT_INTENT_ENTITY = 'MJ_BizApps_Orders: Payment Intents';

/** What to ask the gateway to stand ready for. */
export interface OpenIntentRequest {
    /** Which configured `PaymentProvider` account. Decides the driver and the credentials. */
    PaymentProviderID: string;
    /** Major units, as we store money. */
    Amount: number;
    CurrencyCode: string;
    /** The order this intent is collecting for. Null for a payment on account. */
    OrderHeaderID?: string | null;
    /** Who we are collecting from (D65) — the gateway's record should match ours. */
    BillToPersonID?: string | null;
    BillToOrganizationID?: string | null;
    /** A saved instrument to charge — the recurring-renewal path, where the mandate already exists. */
    ProviderCustomerRef?: string | null;
    ProviderInstrumentRef?: string | null;
    /** Echoed back on webhooks. Useful for reconciliation, never load-bearing. */
    Metadata?: Record<string, string>;
    /**
     * Sent to the gateway so a retried call does not open a SECOND intent — which, on a saved
     * instrument, would charge the customer twice. See the dedup note in {@link OpenPaymentIntent}.
     */
    IdempotencyKey?: string | null;
}

export interface OpenIntentResult {
    Success: boolean;
    /** Why not, when not — in the gateway's own words where it has any. */
    Reason?: string;
    /** OUR row's id. This is what `Orders.CapturePayment` takes. */
    PaymentIntentID?: string;
    /** The GATEWAY's id for the same thing. */
    ProviderIntentID?: string;
    Status?: IntentStatus;
    /** For a browser-side confirmation flow. RETURNED, NEVER STORED — see the header. */
    ClientSecret?: string;
    /** For a hosted-checkout flow — where to send the customer. */
    HostedUrl?: string;
    /** True when this call found an intent we had already opened rather than opening a new one. */
    WasExisting?: boolean;
}

/**
 * Ask the gateway to stand ready, and record that we did.
 *
 * REFUSALS COME BACK IN THE RESULT; only faults throw. A gateway declining to open an intent is a
 * normal outcome of asking — the same contract every driver follows — while an unresolvable provider
 * or a database that will not accept the row is a fault the caller cannot act on.
 *
 * THE DEDUP IS NOT BELT-AND-BRACES. `ProviderIntentID` is UNIQUE, and a gateway given a repeated
 * idempotency key returns the SAME intent rather than a new one. So a retried call reaches us with an
 * id we already hold, and inserting would violate the constraint. Finding and returning the existing
 * row makes the retry a no-op instead of an error — which is the whole point of sending the key.
 */
export async function OpenPaymentIntent(
    request: OpenIntentRequest,
    provider: IMetadataProvider,
    user: UserInfo,
): Promise<OpenIntentResult> {
    if (!Number.isFinite(request?.Amount) || request.Amount <= 0) {
        return { Success: false, Reason: `Cannot open a payment intent for ${request?.Amount}.` };
    }
    if (!request?.PaymentProviderID) {
        return { Success: false, Reason: 'A payment intent needs a PaymentProviderID — it decides which gateway to ask.' };
    }

    const driver = await ResolvePaymentProvider(request.PaymentProviderID, provider, user);

    const opened = await driver.CreateIntent({
        Amount: request.Amount,
        CurrencyCode: request.CurrencyCode,
        OrderHeaderID: request.OrderHeaderID ?? null,
        BillToPersonID: request.BillToPersonID ?? null,
        BillToOrganizationID: request.BillToOrganizationID ?? null,
        ProviderCustomerRef: request.ProviderCustomerRef ?? null,
        ProviderInstrumentRef: request.ProviderInstrumentRef ?? null,
        Metadata: request.Metadata,
        IdempotencyKey: request.IdempotencyKey ?? undefined,
    });

    if (!opened.Success || !opened.ProviderIntentID) {
        return { Success: false, Reason: opened.Reason ?? 'The gateway did not open a payment intent.' };
    }

    const existing = await findByProviderIntentID(opened.ProviderIntentID, provider, user);
    if (existing) {
        LogStatus(`Payment intent ${opened.ProviderIntentID} was already open; reusing row ${existing}.`);
        return {
            Success: true,
            WasExisting: true,
            PaymentIntentID: existing,
            ProviderIntentID: opened.ProviderIntentID,
            Status: opened.Status,
            // Still returned: a caller retrying a checkout needs the secret to confirm the intent, and
            // it is not ours to withhold merely because the row predates this call.
            ClientSecret: opened.ClientSecret,
            HostedUrl: opened.HostedUrl,
        };
    }

    const row = await provider.GetEntityObject<BaseEntity>(PAYMENT_INTENT_ENTITY, user);
    row.NewRecord();
    row.Set('PaymentProviderID', request.PaymentProviderID);
    row.Set('ProviderIntentID', opened.ProviderIntentID);
    // The gateway's reading, already mapped to our CHECK vocabulary by the driver. Defaulted to
    // Processing rather than to a confident value — the same rule `MapStripeIntentStatus` follows.
    row.Set('Status', opened.Status ?? 'Processing');
    row.Set('Amount', Math.round(request.Amount * 100) / 100);
    if (request.OrderHeaderID) row.Set('OrderHeaderID', request.OrderHeaderID);
    if (request.BillToPersonID) row.Set('BillToPersonID', request.BillToPersonID);
    if (request.BillToOrganizationID) row.Set('BillToOrganizationID', request.BillToOrganizationID);

    if (!(await row.Save())) {
        // A FAULT. The gateway has an open intent and we failed to record it, which means a webhook
        // about real money will arrive for an intent this application cannot recognise. Throwing puts
        // that in front of somebody rather than returning a refusal the caller might retry — and a
        // retry would open a second intent unless an idempotency key was supplied.
        const reason = row.LatestResult?.CompleteMessage ?? 'unknown error';
        LogError(
            `Opened gateway intent ${opened.ProviderIntentID} but could not record it: ${reason}. ` +
                `A webhook for this intent will not match any payment.`,
        );
        throw new Error(`Could not record payment intent ${opened.ProviderIntentID}: ${reason}`);
    }

    return {
        Success: true,
        WasExisting: false,
        PaymentIntentID: row.Get('ID') as string,
        ProviderIntentID: opened.ProviderIntentID,
        Status: opened.Status,
        ClientSecret: opened.ClientSecret,
        HostedUrl: opened.HostedUrl,
    };
}

/** Our row for a gateway intent id, if we already hold one. */
async function findByProviderIntentID(
    providerIntentID: string,
    provider: IMetadataProvider,
    user: UserInfo,
): Promise<string | null> {
    const rv = new RunView(provider as unknown as IRunViewProvider);
    // Escaped rather than interpolated raw. The value came from our own driver rather than from a
    // caller, so it is not attacker-controlled — but "ours" and "safe to concatenate into SQL" are
    // different claims, and only one of them is being made here.
    const safe = providerIntentID.replace(/'/g, "''");
    const result = await rv.RunView<{ ID: string }>(
        {
            EntityName: PAYMENT_INTENT_ENTITY,
            ExtraFilter: `ProviderIntentID = '${safe}'`,
            Fields: ['ID'],
            ResultType: 'simple',
            // The row may have been written moments ago by the call this one is retrying.
            BypassCache: true,
        },
        user,
    );
    return result?.Results?.[0]?.ID ?? null;
}
