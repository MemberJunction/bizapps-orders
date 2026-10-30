/**
 * Subscription server subclass — the writes allowed to change a gateway-billed subscription.
 *
 * The shared entity refuses any change to the billing columns of a subscription a payment gateway bills
 * (`PROVIDER_BILLED_FIELDS`), on every tier. The server writes that keep Orders and the gateway in step are
 * the exceptions, each sanctioned where the subscription is loaded for it:
 *   · CancelSubscriptionOperation, after the gateway confirmed the cancel;
 *   · the order save that reactivates a cancelled one as a fresh start, retiring its old gateway id.
 * The sanction is a module-private set rather than a property, so nothing outside this server can grant
 * it: a client that set a flag on its own object would still be refused.
 *
 * CONNECTS TO:
 *   CALLERS: ./CancelSubscriptionOperation.ts · ./OrderEntityServer.ts (touchExistingSubscription)
 *   BASE:    @mj-biz-apps/orders-entities SubscriptionEntity
 */
import { BaseEntity } from '@memberjunction/core';
import { RegisterClass } from '@memberjunction/global';
import { SubscriptionEntity } from '@mj-biz-apps/orders-entities';

const SANCTIONED = new WeakSet<object>();

@RegisterClass(BaseEntity, 'MJ_BizApps_Orders: Subscriptions')
export class SubscriptionEntityServer extends SubscriptionEntity {
    protected override ProviderBilledChangeSanctioned(): boolean {
        return SANCTIONED.has(this);
    }
}

/**
 * Let this subscription's next saves change its gateway-billed columns. Call it only once the gateway has
 * been told (or, for a fresh start, once its old gateway subscription is known to be ended or ending).
 * Refuses an object the server subclass did not produce, which would mean the sanction does nothing.
 */
export function SanctionProviderBilledChange(subscription: BaseEntity): void {
    if (!(subscription instanceof SubscriptionEntityServer)) {
        throw new Error(
            "The subscription was not loaded through the orders server's entity subclass, so a change the " +
                'payment gateway has been told of cannot be sanctioned on it.',
        );
    }
    SANCTIONED.add(subscription);
}

const CANCELLATION_REVERSALS = new WeakSet<object>();

/**
 * Mark the reversal order `Orders.CancelSubscription` books as the cancel's own: a gateway-billed
 * subscription's sale may be reversed by it, because the cancel has already stopped the gateway
 * billing. Any other return of that sale is refused (`IsCancellationReversal`, E2b).
 */
export function SanctionCancellationReversal(order: object): void {
    CANCELLATION_REVERSALS.add(order);
}

/** True for the reversal order a gateway-confirmed cancel books. Only this server can mark one. */
export function IsCancellationReversal(order: object): boolean {
    return CANCELLATION_REVERSALS.has(order);
}

/** Tree-shaking anchor — call from the server bootstrap so @RegisterClass is retained. */
export function LoadSubscriptionEntityServer(): void {
    // intentionally empty
}
