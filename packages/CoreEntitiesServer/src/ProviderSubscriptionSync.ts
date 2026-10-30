/**
 * ProviderSubscriptionSync — bring one gateway-billed subscription in line with the gateway (E3 + E4 + E6).
 *
 * The gateway bills a subscription once `ProviderSubscriptionID` is set (option E). It renews it, fails to
 * collect, retries and ends it, and Orders has to follow. This module reads the subscription and its
 * invoices from the gateway, reads Orders' record, asks the pure planner
 * (`PlanProviderSubscriptionSync`) what to do, and does it:
 *
 *   · BookRenewal / FinishCapture → `BookProviderRenewal` (E4): the renewal order, its payment, its term;
 *   · RecordFailure               → a `PaymentFailed` event per failed attempt;
 *   · ExtendAccess                → the latest term's grants kept to the end of the gateway's next retry (Q4);
 *   · SetAutoRenew                → AutoRenew follows the gateway's cancel-at-period-end (sanctioned), with
 *                                   a `CancellationRequested` event;
 *   · FinishCancel                → `Orders.CancelSubscription`, which reads the gateway itself and records
 *                                   a cancel the gateway completed (no second cancel implementation);
 *   · Notice                      → one open alert Task per subscription and problem.
 *
 * ONE PROCEDURE, THREE CALLERS. The webhook (an event named this subscription), the nightly pass (E6:
 * every gateway-billed subscription, the backstop for a missed event), and the cutover's catch-up after the
 * import. Each run reports every difference it found and what it did; nothing is fixed silently.
 *
 * ON A PROVIDER OF ITS OWN. Booking a renewal opens a transaction, and MJ keeps transaction state on the
 * provider object: two webhooks on a shared provider could commit or roll back each other's writes (the
 * PAY-000058 lesson, `isolatedProvider.ts`). So every run takes its own (`WithIsolatedProvider`).
 *
 * CONNECTS TO:
 *   PLAN:    ./ProviderSubscriptionSyncPlan.ts
 *   BOOK:    ./ProviderRenewalBooking.ts
 *   CANCEL:  ./CancelSubscriptionOperation.ts
 *   CALLERS: ./PaymentWebhookHandler.ts · Server: Orders.SyncProviderSubscriptions (the nightly Action)
 */
import { CompositeKey, LogError, LogStatus, Metadata, RunView, type IMetadataProvider, type IRunViewProvider, type UserInfo } from '@memberjunction/core';
import { AddDays, BusinessTimeZoneEngine, ToCalendarDay, type CalendarDay } from '@mj-biz-apps/common-entities';
import type { mjBizAppsOrdersSubscriptionEntity, mjBizAppsOrdersSubscriptionEventEntity } from '@mj-biz-apps/orders-entities';
import type { BasePaymentProvider, GatewaySubscriptionInvoice, PaymentProviderConfig } from './BasePaymentProvider.js';
import { CancelSubscriptionOperation, WithGatewayEndRecorded } from './CancelSubscriptionOperation.js';
import { SettleGatewayRenewalCredits } from './GatewayRenewalCredit.js';
import { functionalCurrency } from './CreateOrderFromProviderPaymentOperation.js';
import { raiseProviderSubscriptionAlert } from './checkoutCaptureAlert.js';
import { WithIsolatedProvider } from './isolatedProvider.js';
import { BuildPaymentProvider, LoadPaymentProviderConfig } from './PaymentProviderResolver.js';
import { ProviderPaymentIdempotencyKey } from './ProviderPaymentOrder.js';
import { BookProviderRenewal, type RenewalSubscription } from './ProviderRenewalBooking.js';
import {
    PlanProviderSubscriptionSync,
    type SyncGatewayFacts,
    type SyncOrdersFacts,
    type SyncPlan,
    type SyncStep,
} from './ProviderSubscriptionSyncPlan.js';
import { EscapeText, RequireUUID } from './sql-guards.js';
import { SanctionProviderBilledChange } from './SubscriptionEntityServer.js';

const SUBSCRIPTION_ENTITY = 'MJ_BizApps_Orders: Subscriptions';
const SUBSCRIPTION_TERM_ENTITY = 'MJ_BizApps_Orders: Subscription Terms';
const SUBSCRIPTION_EVENT_ENTITY = 'MJ_BizApps_Orders: Subscription Events';
const ORDER_LINE_ENTITY = 'MJ_BizApps_Orders: Order Lines';
const PAYMENT_INTENT_ENTITY = 'MJ_BizApps_Orders: Payment Intents';
const PAYMENT_HEADER_ENTITY = 'MJ_BizApps_Orders: Payment Headers';
const ENTITLEMENT_GRANT_ENTITY = 'MJ_BizApps_Orders: Entitlement Grants';

/** What one run came to. */
export type SyncOutcome =
    /** Orders and the gateway agree; nothing written. */
    | 'InLine'
    /** Orders was brought in line (something written). */
    | 'Changed'
    /** Nothing more to write, but a person must look (an alert Task is open). */
    | 'NeedsPerson'
    /** A preview: the plan, nothing written. */
    | 'Previewed'
    /** The gateway or a write failed; the webhook answers 500 and the nightly pass tries again. */
    | 'Failed'
    /** Not a gateway-billed subscription, or its account cannot be used: nothing to sync. */
    | 'NotBilledByGateway';

export interface SyncProviderSubscriptionResult {
    SubscriptionID: string;
    SubscriptionNumber: string | null;
    ProviderSubscriptionID: string | null;
    Outcome: SyncOutcome;
    /** Every difference found (E6), whether or not it needed a write. */
    Differences: string[];
    /** What was done, in order. */
    Actions: string[];
    /** Notices raised (alert Task codes). */
    Notices: string[];
    Error?: string;
}

export interface SyncProviderSubscriptionOptions {
    /** Plan only: read both sides, write nothing. */
    Preview?: boolean;
    /** The time of the run; defaults to now. */
    Now?: Date;
}

/** Sync one subscription on a provider of its own. Never throws: a failure is `Outcome: 'Failed'`. */
export async function SyncProviderSubscription(
    subscriptionID: string,
    options: SyncProviderSubscriptionOptions,
    shared: IMetadataProvider | undefined,
    user: UserInfo,
): Promise<SyncProviderSubscriptionResult> {
    try {
        return await WithIsolatedProvider((own) => syncOne(subscriptionID, options, own, user), shared);
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        LogError(`[ProviderSubscriptionSync] ${subscriptionID}: ${message}`);
        return {
            SubscriptionID: subscriptionID,
            SubscriptionNumber: null,
            ProviderSubscriptionID: null,
            Outcome: 'Failed',
            Differences: [],
            Actions: [],
            Notices: [],
            Error: message,
        };
    }
}

interface SubscriptionRow {
    ID: string;
    SubscriptionNumber: string;
    Status: string;
    AutoRenew: boolean;
    ProductID: string;
    CompanyID: string;
    HolderOrganizationID: string | null;
    BeneficiaryPersonID: string | null;
    PaymentProviderID: string | null;
    ProviderSubscriptionID: string | null;
}

interface TermRow {
    ID: string;
    TermNumber: number;
    StartDate: Date | string;
    EndDate: Date | string;
    OrderLineID: string | null;
    Quantity: number | null;
}

async function syncOne(
    subscriptionID: string,
    options: SyncProviderSubscriptionOptions,
    provider: IMetadataProvider,
    user: UserInfo,
): Promise<SyncProviderSubscriptionResult> {
    const now = runInstant(options.Now);
    const id = RequireUUID(subscriptionID, 'SubscriptionID');
    const rv = new RunView(provider as unknown as IRunViewProvider);
    const subs = await rv.RunView<SubscriptionRow>(
        {
            EntityName: SUBSCRIPTION_ENTITY,
            ExtraFilter: `ID = '${id}'`,
            Fields: [
                'ID',
                'SubscriptionNumber',
                'Status',
                'AutoRenew',
                'ProductID',
                'CompanyID',
                'HolderOrganizationID',
                'BeneficiaryPersonID',
                'PaymentProviderID',
                'ProviderSubscriptionID',
            ],
            ResultType: 'simple',
            BypassCache: true,
        },
        user,
    );
    if (!subs.Success) throw new Error(`Could not read subscription ${id}: ${subs.ErrorMessage}`);
    const sub = subs.Results?.[0];
    const result: SyncProviderSubscriptionResult = {
        SubscriptionID: id,
        SubscriptionNumber: sub?.SubscriptionNumber ?? null,
        ProviderSubscriptionID: sub?.ProviderSubscriptionID ?? null,
        Outcome: 'InLine',
        Differences: [],
        Actions: [],
        Notices: [],
    };
    if (!sub || !sub.ProviderSubscriptionID || !sub.PaymentProviderID) {
        result.Outcome = 'NotBilledByGateway';
        return result;
    }

    let config: PaymentProviderConfig;
    let driver: BasePaymentProvider;
    try {
        config = await LoadPaymentProviderConfig(sub.PaymentProviderID, provider, user);
        driver = await BuildPaymentProvider(config, provider, user);
    } catch (err) {
        result.Outcome = 'Failed';
        result.Error = `The payment provider that bills ${sub.ProviderSubscriptionID} cannot be used: ${err instanceof Error ? err.message : String(err)}`;
        return result;
    }

    // ── The gateway's side ──────────────────────────────────────────────────────────────────────────
    const terms = await loadTerms(id, rv, user);
    const latest = terms[terms.length - 1] ?? null;
    const described = await driver.DescribeProviderSubscription(sub.ProviderSubscriptionID);
    if (!described.Success || !described.State) {
        result.Outcome = 'Failed';
        result.Error = `Could not read ${sub.ProviderSubscriptionID} at the gateway: ${described.Reason ?? 'no state'}`;
        return result;
    }
    const since = latest ? new Date(new Date(latest.StartDate).getTime() - 24 * 3600 * 1000) : null;
    const listed = await driver.ListProviderSubscriptionInvoices({ ProviderSubscriptionID: sub.ProviderSubscriptionID, CreatedSince: since });
    if (!listed.Success) {
        result.Outcome = 'Failed';
        result.Error = `Could not list the invoices of ${sub.ProviderSubscriptionID}: ${listed.Reason ?? 'no reason given'}`;
        return result;
    }
    const gateway: SyncGatewayFacts = { Subscription: described, Invoices: listed.Invoices ?? [] };

    // ── Orders' side ────────────────────────────────────────────────────────────────────────────────
    await BusinessTimeZoneEngine.Instance.Config(false, user, provider);
    const orders = await loadOrdersFacts(sub, latest, gateway.Invoices, config, rv, provider, user);

    const plan = PlanProviderSubscriptionSync(orders, gateway, now);
    result.Differences = plan.Differences;
    if (options.Preview) {
        result.Outcome = plan.Steps.length ? 'Previewed' : 'InLine';
        result.Actions = plan.Steps.map(describeStep);
        return result;
    }
    await applyPlan(plan, sub, latest, config, driver, provider, user, result, orders.LastUnitPrice);
    // A gateway refund's credit still on account (booked before the renewal owed it, or a refund booked by hand):
    // applied to its renewal now (D20). Nothing to do for almost every subscription, so nothing is written then.
    if (result.Outcome !== 'Failed') {
        try {
            const settled = await SettleGatewayRenewalCredits(sub.ID, provider, user);
            if (settled > 0) result.Actions.push(`applied ${settled.toFixed(2)} of a gateway refund's credit to its renewal`);
        } catch (err) {
            result.Notices.push(`could not apply a gateway refund's credit to its renewal: ${err instanceof Error ? err.message : String(err)}`);
        }
    }
    if (result.Outcome !== 'Failed') {
        const wrote = result.Actions.length > 0;
        result.Outcome = wrote ? 'Changed' : result.Notices.length ? 'NeedsPerson' : 'InLine';
    }
    if (result.Actions.length || result.Notices.length) {
        LogStatus(`[ProviderSubscriptionSync] ${sub.SubscriptionNumber} (${sub.ProviderSubscriptionID}): ${[...result.Actions, ...result.Notices.map((n) => `notice ${n}`)].join('; ')}`);
    }
    return result;
}

async function applyPlan(
    plan: SyncPlan,
    sub: SubscriptionRow,
    latest: TermRow | null,
    config: PaymentProviderConfig,
    driver: BasePaymentProvider,
    provider: IMetadataProvider,
    user: UserInfo,
    result: SyncProviderSubscriptionResult,
    lastUnitPrice: number | null,
): Promise<void> {
    const renewal: RenewalSubscription = {
        ID: sub.ID,
        SubscriptionNumber: sub.SubscriptionNumber,
        Status: sub.Status,
        ProductID: sub.ProductID,
        CompanyID: sub.CompanyID,
        HolderOrganizationID: sub.HolderOrganizationID,
        BeneficiaryPersonID: sub.BeneficiaryPersonID,
        PaymentProviderID: sub.PaymentProviderID!,
        ProviderSubscriptionID: sub.ProviderSubscriptionID!,
        LatestTermOrderLineID: latest?.OrderLineID ?? null,
        LatestTermQuantity: latest?.Quantity ?? null,
        LatestTermUnitPrice: lastUnitPrice,
    };
    for (const step of plan.Steps) {
        try {
            switch (step.Kind) {
                case 'BookRenewal':
                case 'FinishCapture': {
                    const booked = await BookProviderRenewal(renewal, step.Invoice, config, driver, provider, user);
                    if (booked.Outcome === 'Booked' || booked.Outcome === 'AlreadyBooked') {
                        if (booked.Outcome === 'Booked') result.Actions.push(booked.Message);
                    } else if (booked.Outcome === 'CaptureFailed') {
                        result.Actions.push(booked.Message);
                        await notice(sub, 'RenewalNotBooked', booked.Message, true, provider, user, result);
                        // The money is recorded but not captured: stop before mirroring the end state.
                        return;
                    } else {
                        await notice(sub, 'RenewalNotBooked', `the gateway's renewal ${step.Invoice.ProviderInvoiceID} was not booked: ${booked.Message}`, true, provider, user, result);
                        return;
                    }
                    break;
                }
                case 'RecordFailure':
                    await logEvent(sub.ID, 'PaymentFailed', {
                        Source: 'Gateway',
                        InvoiceID: step.Invoice.ProviderInvoiceID,
                        Attempt: step.Attempt,
                        AmountDue: step.Invoice.AmountDue,
                        NextAttemptAt: step.Invoice.NextAttemptAt?.toISOString() ?? null,
                    }, provider, user);
                    result.Actions.push(`recorded failed attempt ${step.Attempt} of ${step.Invoice.ProviderInvoiceID}`);
                    break;
                case 'ExtendAccess': {
                    const moved = await extendGrants(latest, step.Until, provider, user);
                    if (moved > 0) result.Actions.push(`kept access to ${step.Until.toISOString()} while the gateway retries (${moved} grant(s))`);
                    break;
                }
                case 'SetAutoRenew':
                    await setAutoRenew(sub, step.On, step.EndsAt, provider, user);
                    result.Actions.push(step.On ? 'automatic renewal back on (cancel withdrawn at the gateway)' : `automatic renewal off (the gateway ends it ${step.EndsAt?.toISOString() ?? 'at its period end'})`);
                    break;
                case 'FinishCancel': {
                    // The gateway charged a renewal and then ended it: what it refunded of that charge is what the
                    // cancel may reverse (nothing when it kept it), and a person is told either way.
                    let refunded = 0;
                    for (const inv of step.RenewalsCharged) {
                        if (!inv.ProviderChargeID) continue;
                        const charge = await driver.RetrieveCharge({ ProviderChargeID: inv.ProviderChargeID });
                        if (!charge.Success || !charge.Charge) {
                            throw new Error(`could not read charge ${inv.ProviderChargeID} to see what the gateway refunded: ${charge.Reason ?? 'no reason given'}`);
                        }
                        refunded += Math.min(charge.Charge.AmountRefunded, inv.AmountPaid);
                    }
                    const op = new CancelSubscriptionOperation();
                    const run = () =>
                        op.ExecuteServer(
                            { SubscriptionID: sub.ID, RequestDate: step.RequestDay, Timing: step.Timing, Reason: 'Ended at the payment gateway' },
                            { provider, user, emitProgress: () => undefined },
                        );
                    // Always as a RECORD of the gateway's end (never extended to a later booked term, D19 is for a
                    // person's cancel); the renewals' reversal capped at what the gateway refunded of them.
                    const cancelled = await WithGatewayEndRecorded(run);
                    if (step.RenewalsCharged.length) {
                        const charged = step.RenewalsCharged.reduce((n, i) => n + i.AmountPaid, 0);
                        const kept = Math.round((charged - refunded) * 100) / 100;
                        const which = step.RenewalsCharged.map((i) => i.ProviderInvoiceID).join(', ');
                        await notice(
                            sub,
                            'EndedAfterRenewal',
                            kept > 0
                                ? `the gateway charged the renewal (${which}, ${charged.toFixed(2)}) and then ended ${sub.ProviderSubscriptionID}, keeping ${kept.toFixed(2)}: ` +
                                  `the customer paid for a period they will not get. Orders booked the renewal and cancelled without reversing what was kept. ` +
                                  `Refund it at the gateway (Orders then books the refund) or record why it is kept.`
                                : `the gateway charged the renewal (${which}, ${charged.toFixed(2)}), refunded ${refunded.toFixed(2)} of it, and ended ${sub.ProviderSubscriptionID}; ` +
                                  `Orders booked the renewal and reversed what was refunded. Nothing to do unless that is unexpected.`,
                            false,
                            provider,
                            user,
                            result,
                        );
                    }
                    const out = cancelled.Output;
                    if (!cancelled.Success || !out?.Success) {
                        // Another delivery (a second worker, or the webhook and the nightly pass together) may have
                        // recorded it a moment ago: cancelled already is what was wanted.
                        if (await currentStatus(sub.ID, provider, user) === 'Canceled') {
                            result.Actions.push(`the cancel the gateway made was already recorded`);
                            break;
                        }
                        const why = cancelled.ErrorMessage ?? out?.Message ?? 'unknown error';
                        // Not RenewalNotBooked: that code blocks every later cancel, and this one must be retried.
                        await notice(sub, 'GatewayCancelNotRecorded', `the gateway ended ${sub.ProviderSubscriptionID}, but recording the cancel in Orders was refused: ${why}`, false, provider, user, result);
                    } else {
                        result.Actions.push(`recorded the cancel the gateway made (${step.Timing}, ${step.RequestDay})`);
                    }
                    break;
                }
                case 'Notice':
                    await notice(sub, step.Code, step.Reason, !!step.Urgent, provider, user, result);
                    break;
            }
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            LogError(`[ProviderSubscriptionSync] ${sub.SubscriptionNumber}: ${describeStep(step)} failed: ${message}`);
            result.Outcome = 'Failed';
            result.Error = `${describeStep(step)} failed: ${message}`;
            return;
        }
    }
}

function describeStep(step: SyncStep): string {
    switch (step.Kind) {
        case 'BookRenewal':
            return `book renewal ${step.Invoice.ProviderInvoiceID} (${step.Invoice.AmountPaid})`;
        case 'FinishCapture':
            return `finish the capture of ${step.Invoice.ProviderInvoiceID}`;
        case 'RecordFailure':
            return `record failed attempt ${step.Attempt} of ${step.Invoice.ProviderInvoiceID}`;
        case 'ExtendAccess':
            return `keep access to ${step.Until.toISOString()}`;
        case 'SetAutoRenew':
            return `automatic renewal ${step.On ? 'on' : 'off'}`;
        case 'FinishCancel':
            return `record the gateway's cancel (${step.Timing}, ${step.RequestDay})`;
        case 'Notice':
            return `notice ${step.Code}`;
    }
}

async function currentStatus(subscriptionID: string, provider: IMetadataProvider, user: UserInfo): Promise<string | null> {
    const rv = new RunView(provider as unknown as IRunViewProvider);
    const r = await rv.RunView<{ Status: string }>(
        { EntityName: SUBSCRIPTION_ENTITY, ExtraFilter: `ID = '${RequireUUID(subscriptionID, 'SubscriptionID')}'`, Fields: ['ID', 'Status'], ResultType: 'simple', BypassCache: true },
        user,
    );
    return r.Results?.[0]?.Status ?? null;
}

async function notice(
    sub: SubscriptionRow,
    code: string,
    reason: string,
    urgent: boolean,
    provider: IMetadataProvider,
    user: UserInfo,
    result: SyncProviderSubscriptionResult,
): Promise<void> {
    await raiseProviderSubscriptionAlert(
        { SubscriptionID: sub.ID, SubscriptionNumber: sub.SubscriptionNumber, Code: code, Reason: reason, Urgent: urgent, Linked: true },
        user,
        provider,
    );
    result.Notices.push(code);
}

async function loadTerms(subscriptionID: string, rv: RunView, user: UserInfo): Promise<TermRow[]> {
    const r = await rv.RunView<TermRow>(
        {
            EntityName: SUBSCRIPTION_TERM_ENTITY,
            ExtraFilter: `SubscriptionID = '${RequireUUID(subscriptionID, 'SubscriptionID')}'`,
            Fields: ['ID', 'TermNumber', 'StartDate', 'EndDate', 'OrderLineID', 'Quantity'],
            OrderBy: 'TermNumber',
            ResultType: 'simple',
            BypassCache: true,
        },
        user,
    );
    if (!r.Success) throw new Error(`Could not read the terms of ${subscriptionID}: ${r.ErrorMessage}`);
    return r.Results ?? [];
}

async function loadOrdersFacts(
    sub: SubscriptionRow,
    latest: TermRow | null,
    invoices: readonly GatewaySubscriptionInvoice[],
    config: PaymentProviderConfig,
    rv: RunView,
    provider: IMetadataProvider,
    user: UserInfo,
): Promise<SyncOrdersFacts> {
    const intents = [...new Set(invoices.map((i) => i.ProviderIntentID).filter((v): v is string => !!v))];
    const charges = [...new Set(invoices.map((i) => i.ProviderChargeID).filter((v): v is string => !!v))];
    const bookedCharges = new Set<string>();
    if (charges.length) {
        // Any payment that records the charge, whatever its key or account (a gateway charge id is unique at the
        // gateway): the importer writes an imported subscriber's current-year payment with the charge and no intent.
        const rows = await rv.RunView<{ ProviderChargeID: string }>(
            {
                EntityName: PAYMENT_HEADER_ENTITY,
                ExtraFilter: `ProviderChargeID IN (${charges.map((c) => `'${EscapeText(c)}'`).join(',')})`,
                Fields: ['ID', 'ProviderChargeID'],
                ResultType: 'simple',
                BypassCache: true,
            },
            user,
        );
        if (!rows.Success) throw new Error(`Could not read the payments of the gateway's charges: ${rows.ErrorMessage}`);
        for (const r of rows.Results ?? []) bookedCharges.add(r.ProviderChargeID);
    }
    const captured = new Set<string>();
    const uncaptured = new Set<string>();
    if (intents.length) {
        const rows = await rv.RunView<{ ProviderIntentID: string; OrderHeaderID: string | null }>(
            {
                EntityName: PAYMENT_INTENT_ENTITY,
                ExtraFilter: `ProviderIntentID IN (${intents.map((i) => `'${EscapeText(i)}'`).join(',')})`,
                Fields: ['ID', 'ProviderIntentID', 'OrderHeaderID'],
                ResultType: 'simple',
                BypassCache: true,
            },
            user,
        );
        if (!rows.Success) throw new Error(`Could not read the recorded gateway intents: ${rows.ErrorMessage}`);
        const recorded = new Map((rows.Results ?? []).map((r) => [r.ProviderIntentID, r]));
        const keys = invoices
            .filter((i) => i.ProviderIntentID && i.ProviderChargeID && recorded.has(i.ProviderIntentID))
            .map((i) => ({ intent: i.ProviderIntentID!, key: ProviderPaymentIdempotencyKey(config.ID, i.ProviderChargeID!) }));
        const paid = new Set<string>();
        if (keys.length) {
            const payments = await rv.RunView<{ IdempotencyKey: string }>(
                {
                    EntityName: PAYMENT_HEADER_ENTITY,
                    ExtraFilter: `IdempotencyKey IN (${keys.map((k) => `'${EscapeText(k.key)}'`).join(',')})`,
                    Fields: ['ID', 'IdempotencyKey'],
                    ResultType: 'simple',
                    BypassCache: true,
                },
                user,
            );
            if (!payments.Success) throw new Error(`Could not read the captured renewal payments: ${payments.ErrorMessage}`);
            for (const p of payments.Results ?? []) paid.add(p.IdempotencyKey);
        }
        for (const k of keys) (paid.has(k.key) ? captured : uncaptured).add(k.intent);
        // An intent Orders recorded for another purpose (a checkout's first payment) counts as booked:
        // it is never a renewal to book again.
        for (const [intent, row] of recorded) if (!captured.has(intent) && !uncaptured.has(intent) && row) captured.add(intent);
    }

    const events = await rv.RunView<{ EventType: string; EventData: string | null; OccurredAt: Date | string }>(
        {
            EntityName: SUBSCRIPTION_EVENT_ENTITY,
            ExtraFilter: `SubscriptionID = '${RequireUUID(sub.ID, 'SubscriptionID')}' AND EventType IN ('PaymentSucceeded','PaymentFailed')`,
            Fields: ['ID', 'EventType', 'EventData', 'OccurredAt'],
            OrderBy: 'OccurredAt',
            ResultType: 'simple',
            BypassCache: true,
        },
        user,
    );
    if (!events.Success) throw new Error(`Could not read the subscription's events: ${events.ErrorMessage}`);
    const zero = new Set<string>();
    const failures = new Set<string>();
    let lastPrice: string | null = null;
    let lastQuantity: number | null = null;
    for (const e of events.Results ?? []) {
        let data: Record<string, unknown> = {};
        try {
            data = e.EventData ? (JSON.parse(e.EventData) as Record<string, unknown>) : {};
        } catch {
            continue;
        }
        if (data.Source !== 'Gateway' || typeof data.InvoiceID !== 'string') continue;
        if (e.EventType === 'PaymentSucceeded') {
            if (Number(data.AmountPaid ?? 0) === 0) zero.add(data.InvoiceID);
            if (typeof data.GatewayPriceID === 'string') lastPrice = data.GatewayPriceID;
            if (data.GatewayQuantity != null && Number.isFinite(Number(data.GatewayQuantity))) lastQuantity = Number(data.GatewayQuantity);
        } else if (e.EventType === 'PaymentFailed' && data.Attempt != null) {
            failures.add(`${data.InvoiceID}#${Number(data.Attempt)}`);
        }
    }

    let lastUnitPrice: number | null = null;
    if (latest?.OrderLineID) {
        const line = await rv.RunView<{ UnitPrice: number | null }>(
            {
                EntityName: ORDER_LINE_ENTITY,
                ExtraFilter: `ID = '${RequireUUID(latest.OrderLineID, 'OrderLineID')}'`,
                Fields: ['ID', 'UnitPrice'],
                ResultType: 'simple',
                BypassCache: true,
            },
            user,
        );
        const price = line.Results?.[0]?.UnitPrice;
        lastUnitPrice = price == null ? null : Number(price);
    }

    let grantsValidTo: Date | null = null;
    if (latest) {
        const grants = await rv.RunView<{ ValidTo: Date | string | null }>(
            {
                EntityName: ENTITLEMENT_GRANT_ENTITY,
                ExtraFilter: `SubscriptionTermID = '${RequireUUID(latest.ID, 'SubscriptionTermID')}' AND Status IN ('Active','Suspended')`,
                Fields: ['ID', 'ValidTo'],
                ResultType: 'simple',
                BypassCache: true,
            },
            user,
        );
        for (const g of grants.Results ?? []) {
            if (!g.ValidTo) continue;
            const v = new Date(g.ValidTo);
            if (!grantsValidTo || v.getTime() > grantsValidTo.getTime()) grantsValidTo = v;
        }
    }

    return {
        SubscriptionNumber: sub.SubscriptionNumber,
        Status: sub.Status,
        AutoRenew: !!sub.AutoRenew,
        LatestTermEnd: latest ? (ToCalendarDay(new Date(latest.EndDate)) as CalendarDay | null) : null,
        LatestTermStart: latest ? (ToCalendarDay(new Date(latest.StartDate)) as CalendarDay | null) : null,
        Zone: BusinessTimeZoneEngine.Instance.Zone,
        CurrencyCode: await functionalCurrency(sub.CompanyID, provider, user),
        CapturedIntentIDs: captured,
        UncapturedIntentIDs: uncaptured,
        BookedZeroInvoiceIDs: zero,
        BookedChargeIDs: bookedCharges,
        RecordedFailures: failures,
        LastGatewayPriceID: lastPrice,
        LastGatewayQuantity: lastQuantity,
        LastUnitPrice: lastUnitPrice,
        GrantsValidTo: grantsValidTo,
    };
}

/** Move the latest term's live grants' end to `until` where it is earlier (Q4). Returns how many moved. */
async function extendGrants(latest: TermRow | null, until: Date, provider: IMetadataProvider, user: UserInfo): Promise<number> {
    if (!latest) return 0;
    const rv = new RunView(provider as unknown as IRunViewProvider);
    const grants = await rv.RunView<{ ID: string; ValidTo: Date | string | null }>(
        {
            EntityName: ENTITLEMENT_GRANT_ENTITY,
            ExtraFilter: `SubscriptionTermID = '${RequireUUID(latest.ID, 'SubscriptionTermID')}' AND Status IN ('Active','Suspended')`,
            Fields: ['ID', 'ValidTo'],
            ResultType: 'simple',
            BypassCache: true,
        },
        user,
    );
    if (!grants.Success) throw new Error(`Could not read the term's grants: ${grants.ErrorMessage}`);
    let moved = 0;
    for (const row of grants.Results ?? []) {
        if (!row.ValidTo || new Date(row.ValidTo).getTime() >= until.getTime()) continue;
        const grant = await provider.GetEntityObject(ENTITLEMENT_GRANT_ENTITY, CompositeKey.FromID(row.ID), user);
        grant.Set('ValidTo', until);
        if (!(await grant.Save())) {
            throw new Error(`Could not keep grant ${row.ID} until ${until.toISOString()}: ${grant.LatestResult?.CompleteMessage ?? 'unknown error'}`);
        }
        moved++;
    }
    return moved;
}

/** AutoRenew follows the gateway's cancel-at-period-end, as a sanctioned write, with its event. */
async function setAutoRenew(sub: SubscriptionRow, on: boolean, endsAt: Date | null, provider: IMetadataProvider, user: UserInfo): Promise<void> {
    const entity = await provider.GetEntityObject<mjBizAppsOrdersSubscriptionEntity>(SUBSCRIPTION_ENTITY, CompositeKey.FromID(sub.ID), user);
    // The gateway already did this; Orders only records it (E2b's rule: a change the gateway has heard of).
    SanctionProviderBilledChange(entity);
    entity.AutoRenew = on;
    if (!(await entity.Save())) {
        throw new Error(`Could not set automatic renewal ${on ? 'on' : 'off'}: ${entity.LatestResult?.CompleteMessage ?? 'unknown error'}`);
    }
    await logEvent(
        sub.ID,
        'CancellationRequested',
        on ? { Source: 'Gateway', Withdrawn: true } : { Source: 'Gateway', EndsAt: endsAt?.toISOString() ?? null },
        provider,
        user,
    );
}

async function logEvent(
    subscriptionID: string,
    type: 'PaymentFailed' | 'CancellationRequested',
    data: Record<string, unknown>,
    provider: IMetadataProvider,
    user: UserInfo,
): Promise<void> {
    const event = await provider.GetEntityObject<mjBizAppsOrdersSubscriptionEventEntity>(SUBSCRIPTION_EVENT_ENTITY, user);
    event.NewRecord();
    event.SubscriptionID = subscriptionID;
    event.EventType = type;
    event.OccurredAt = new Date();
    event.Set('EventData', JSON.stringify(data));
    if (!(await event.Save())) {
        throw new Error(`Failed to log ${type}: ${event.LatestResult?.CompleteMessage ?? 'unknown error'}`);
    }
}

/**
 * The instant of the run: the caller's `Now` (tests, the cutover's catch-up), else the clock. An INSTANT,
 * not a day: the plan only compares it with the gateway's instants, and turns it into a business day with
 * the business zone where it needs one.
 */
function runInstant(now: Date | undefined): Date {
    if (now) return now;
    return new Date();
}

// ─── The nightly pass (E6) ─────────────────────────────────────────────────────────────────────────

export interface SyncProviderSubscriptionsInput {
    /** Only these subscriptions; omit for every gateway-billed subscription the pass covers. */
    SubscriptionIDs?: string[];
    /** Plan only (the default for the scheduled job until a person turns it off). */
    Preview?: boolean;
    Now?: Date;
}

export interface SyncProviderSubscriptionsResult {
    Success: boolean;
    Read: number;
    Changed: number;
    NeedsPerson: number;
    Failed: number;
    Differences: number;
    Results: SyncProviderSubscriptionResult[];
    Message: string;
}

/**
 * How long after a cancel the nightly pass still reads a cancelled subscription: a gateway that renews a
 * subscription Orders cancelled (Q5) does so at its period end, within a term of the cancel. The webhook
 * is the primary path; this only bounds the backstop.
 */
export const SYNC_CANCELLED_LOOKBACK_DAYS = 400;

/**
 * The nightly pass (E6): every gateway-billed subscription that is live, paused, or cancelled within the
 * lookback, one at a time (each on its own provider; one at a time keeps the gateway calls polite and the
 * runtime predictable: ~2 gateway reads per subscription). Reports every difference and what it did.
 */
export async function SyncProviderSubscriptions(
    input: SyncProviderSubscriptionsInput,
    shared: IMetadataProvider | undefined,
    user: UserInfo,
): Promise<SyncProviderSubscriptionsResult> {
    const provider = shared ?? (Metadata.Provider as unknown as IMetadataProvider);
    const rv = new RunView(provider as unknown as IRunViewProvider);
    const now = runInstant(input.Now);
    let filter: string;
    if (input.SubscriptionIDs?.length) {
        filter = `ID IN (${input.SubscriptionIDs.map((s) => `'${RequireUUID(s, 'SubscriptionID')}'`).join(',')})`;
    } else {
        const since = AddDays(ToCalendarDay(now)!, -SYNC_CANCELLED_LOOKBACK_DAYS);
        filter =
            `ProviderSubscriptionID IS NOT NULL AND (Status IN ('Active','Trialing','Paused') ` +
            `OR (Status = 'Canceled' AND (CanceledAt IS NULL OR CanceledAt >= '${since}')))`;
    }
    const rows = await rv.RunView<{ ID: string }>(
        { EntityName: SUBSCRIPTION_ENTITY, ExtraFilter: filter, Fields: ['ID'], OrderBy: 'SubscriptionNumber', ResultType: 'simple', IgnoreMaxRows: true, BypassCache: true },
        user,
    );
    if (!rows.Success) {
        return { Success: false, Read: 0, Changed: 0, NeedsPerson: 0, Failed: 0, Differences: 0, Results: [], Message: `Could not select the gateway-billed subscriptions: ${rows.ErrorMessage}` };
    }
    const results: SyncProviderSubscriptionResult[] = [];
    for (const row of rows.Results ?? []) {
        const synced = await SyncProviderSubscription(row.ID, { Preview: input.Preview, Now: now }, provider, user);
        results.push(synced);
        // A subscription the nightly pass cannot sync (a renewal that will not book, a gateway it cannot read)
        // tells a person every night it fails, preview or not: one open Task, urgent.
        if (synced.Outcome === 'Failed') {
            await raiseProviderSubscriptionAlert(
                {
                    SubscriptionID: row.ID,
                    SubscriptionNumber: synced.SubscriptionNumber ?? row.ID,
                    Code: 'GatewaySyncFailed',
                    Reason: `the nightly sync of ${synced.ProviderSubscriptionID ?? 'its gateway subscription'} failed: ${synced.Error ?? 'unknown error'}`,
                    Urgent: true,
                    Linked: true,
                },
                user,
                provider,
            ).catch((err) => LogError(`[ProviderSubscriptionSync] could not raise GatewaySyncFailed for ${row.ID}: ${err}`));
        }
    }
    const count = (o: SyncOutcome) => results.filter((r) => r.Outcome === o).length;
    const differences = results.reduce((n, r) => n + r.Differences.length, 0);
    const summary = {
        Read: results.length,
        Changed: count('Changed') + count('Previewed'),
        NeedsPerson: count('NeedsPerson'),
        Failed: count('Failed'),
        Differences: differences,
    };
    return {
        Success: summary.Failed === 0,
        ...summary,
        Results: results,
        Message:
            `${input.Preview ? 'Preview: ' : ''}${summary.Read} read · ${summary.Changed} ${input.Preview ? 'would change' : 'brought in line'} · ` +
            `${summary.NeedsPerson} need a person · ${summary.Failed} failed · ${differences} difference(s) found`,
    };
}
