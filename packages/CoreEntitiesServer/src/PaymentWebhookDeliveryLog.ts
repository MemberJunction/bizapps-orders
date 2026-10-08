/**
 * PaymentWebhookDeliveryLog — the durable record of every verified webhook delivery (#474).
 *
 * Before this, a delivery the handler chose not to apply left only a log line: a payment taken from
 * the gateway's dashboard, an event kind Orders does not act on, a body with no event id. Nothing in
 * the database showed the event had arrived, so monitoring could not see it.
 *
 * ONE ROW PER EVENT, NOT PER DELIVERY. The gateway's event id is unique per provider; a redelivery
 * updates the row (`LastReceivedAt`, `DeliveryCount`, the latest outcome) instead of adding one. A
 * verified body with no event id cannot be matched to anything, so each one gets its own row.
 *
 * ONLY VERIFIED DELIVERIES. The route is unauthenticated (D19). Recording a request whose signature
 * failed would let any caller write rows here, so the handler records only after the signature check.
 *
 * RECORDING NEVER CHANGES THE ANSWER. A failure to write the row is logged and the gateway gets the
 * same response it would have got without this module: the payment notification matters more than
 * its audit row, and a 500 caused by the audit row alone would make the gateway redeliver an event
 * that was applied correctly.
 *
 * CONNECTS TO:
 *   ROUTE:  ./PaymentWebhookHandler.ts
 *   TABLE:  __mj_BizAppsOrders.PaymentWebhookDelivery
 */
import {
    LogError,
    RunView,
    type IMetadataProvider,
    type IRunViewProvider,
    type UserInfo,
} from '@memberjunction/core';
import { mjBizAppsOrdersPaymentWebhookDeliveryEntity } from '@mj-biz-apps/orders-entities';
import type { WebhookAction, WebhookReasonCode } from './PaymentProviderBehavior.js';
import { EscapeSQLString } from './sql-guards.js';

const DELIVERY_ENTITY = 'MJ_BizApps_Orders: Payment Webhook Deliveries';

/** `PaymentWebhookDelivery.Outcome` — the CHECK-constrained set. */
export type WebhookDeliveryOutcome = mjBizAppsOrdersPaymentWebhookDeliveryEntity['Outcome'];

/**
 * `PaymentWebhookDelivery.ReasonCode`. Short and stable so a view can filter on it; the words live
 * in `Reason`.
 */
export type WebhookDeliveryReasonCode = WebhookReasonCode | 'unreadable' | 'apply_failed';

/** What the handler decided about one delivery. */
export interface WebhookDeliveryRecord {
    PaymentProviderID: string;
    ProviderEventID?: string | null;
    EventKind?: string | null;
    /** Our `PaymentIntent.ID`, when the event names an intent we opened. */
    PaymentIntentID?: string | null;
    ProviderIntentID?: string | null;
    ProviderChargeID?: string | null;
    Outcome: WebhookDeliveryOutcome;
    ReasonCode?: WebhookDeliveryReasonCode | null;
    Reason?: string | null;
    OccurredAt?: Date | null;
}

/** The decision's action as a stored outcome. */
export function DeliveryOutcomeFor(action: WebhookAction): WebhookDeliveryOutcome {
    switch (action) {
        case 'Apply':
            return 'Applied';
        case 'AlreadyApplied':
            return 'AlreadyApplied';
        case 'Ignore':
            return 'Ignored';
        case 'Reject':
            return 'Rejected';
    }
}

/** The fields of an earlier delivery of the same event the handler reads. */
export interface PriorDelivery {
    ID: string;
    Outcome: WebhookDeliveryOutcome;
}

/**
 * The row already recorded for this event, if any. Null for an event with no id.
 *
 * Read before the decision so the duplicate check is exact: an event this table records as applied
 * is a duplicate even when a later event has since replaced the id stamped on the intent.
 */
export async function FindPriorDelivery(
    paymentProviderID: string,
    providerEventID: string | null | undefined,
    provider: IMetadataProvider,
    user: UserInfo,
): Promise<PriorDelivery | null> {
    if (!providerEventID) return null;
    const rv = new RunView(provider as unknown as IRunViewProvider);
    const result = await rv.RunView<PriorDelivery>(
        {
            EntityName: DELIVERY_ENTITY,
            ExtraFilter:
                `PaymentProviderID = '${EscapeSQLString(paymentProviderID)}' AND ` +
                `ProviderEventID = '${EscapeSQLString(providerEventID)}'`,
            Fields: ['ID', 'Outcome'],
            ResultType: 'simple',
            // A redelivery can arrive moments after the first delivery wrote its row.
            BypassCache: true,
        },
        user,
    );
    if (!result.Success) {
        throw new Error(`Could not read earlier deliveries of event ${providerEventID}: ${result.ErrorMessage}`);
    }
    return result.Results?.[0] ?? null;
}

/**
 * Write or update the row for one delivery. Never throws — see the header.
 *
 * @param prior the row `FindPriorDelivery` returned for this event, so the common case is one write
 */
export async function RecordWebhookDelivery(
    record: WebhookDeliveryRecord,
    prior: PriorDelivery | null,
    provider: IMetadataProvider,
    user: UserInfo,
): Promise<void> {
    try {
        if (await saveDelivery(record, prior, provider, user)) return;
        // Two deliveries of the same new event raced and the other one inserted first; the unique key
        // refused ours. Update the row it wrote.
        const raced = await FindPriorDelivery(record.PaymentProviderID, record.ProviderEventID, provider, user);
        if (!prior && raced && (await saveDelivery(record, raced, provider, user))) return;
        LogError(`Could not record webhook delivery ${record.ProviderEventID ?? '(no event id)'} as ${record.Outcome}.`);
    } catch (err) {
        LogError(
            `Could not record webhook delivery ${record.ProviderEventID ?? '(no event id)'} as ${record.Outcome}: ` +
                `${err instanceof Error ? err.message : String(err)}`,
        );
    }
}

async function saveDelivery(
    record: WebhookDeliveryRecord,
    prior: PriorDelivery | null,
    provider: IMetadataProvider,
    user: UserInfo,
): Promise<boolean> {
    const row = await provider.GetEntityObject<mjBizAppsOrdersPaymentWebhookDeliveryEntity>(DELIVERY_ENTITY, user);
    const now = new Date();
    if (prior) {
        if (!(await row.Load(prior.ID))) return false;
        row.DeliveryCount = (row.DeliveryCount ?? 0) + 1;
    } else {
        row.NewRecord();
        row.PaymentProviderID = record.PaymentProviderID;
        row.ProviderEventID = record.ProviderEventID ?? null;
        row.FirstReceivedAt = now;
        row.DeliveryCount = 1;
    }
    row.LastReceivedAt = now;
    row.Outcome = record.Outcome;
    row.ReasonCode = record.ReasonCode ?? null;
    row.Reason = record.Reason ? record.Reason.slice(0, 1000) : null;
    // Facts about the event only ever fill in; a later delivery that knows less does not erase them.
    if (record.EventKind) row.EventKind = record.EventKind;
    if (record.PaymentIntentID) row.PaymentIntentID = record.PaymentIntentID;
    if (record.ProviderIntentID) row.ProviderIntentID = record.ProviderIntentID;
    if (record.ProviderChargeID) row.ProviderChargeID = record.ProviderChargeID;
    if (record.OccurredAt) row.OccurredAt = record.OccurredAt;
    return row.Save();
}
