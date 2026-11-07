/**
 * Subscription server subclass — the writes allowed to change a gateway-billed subscription.
 *
 * The shared entity refuses any change to the billing columns of a subscription a payment gateway bills
 * (`PROVIDER_BILLED_FIELDS`), on every tier. The server writes that keep Orders and the gateway in step are
 * the exceptions, each sanctioned where the subscription is loaded for it:
 *   · CancelSubscriptionOperation, after the gateway confirmed the cancel;
 *   · the order save that reactivates a cancelled one as a fresh start, retiring its old gateway id;
 *   · the order save of a renewal the gateway already charged (E4), which reactivates a cancelled one
 *     keeping its gateway id (`SanctionGatewayRenewal`).
 * The sanction is a module-private set rather than a property, so nothing outside this server can grant
 * it: a client that set a flag on its own object would still be refused.
 *
 * CONNECTS TO:
 *   CALLERS: ./ProviderSubscriptions.ts (the hand-over records the gateway id) · ./CancelSubscriptionOperation.ts ·
 *            ./OrderEntityServer.ts (touchExistingSubscription) · ./ProviderSubscriptionSync.ts · ./LinkProviderSubscription.ts
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

const MONEY_ONLY_REVERSALS = new WeakSet<object>();

/**
 * Mark a reversal order that credits MONEY only (D20: the gateway refunded a renewal it charged): its lines reverse
 * part of the sale's amount, but no grant is reduced and no term changes, because a refund is not a cancel.
 */
export function SanctionMoneyOnlyReversal(order: object): void {
    MONEY_ONLY_REVERSALS.add(order);
}

/** True for a money-only reversal order (no access is taken away). Only this server can mark one. */
export function IsMoneyOnlyReversal(order: object): boolean {
    return MONEY_ONLY_REVERSALS.has(order);
}

const GATEWAY_RENEWALS = new WeakSet<object>();

/**
 * Mark the order E4 books for a renewal the payment gateway already charged (`BookProviderRenewal`). Its
 * renewal line may extend, or reactivate, the subscription the gateway bills, keeping the gateway id; any
 * other order that would renew it is refused (`ProviderBilledPurchaseVerdict`). Only this server can mark
 * one: a client building its own order object cannot.
 */
export function SanctionGatewayRenewal(order: object): void {
    GATEWAY_RENEWALS.add(order);
}

/** True for an order `SanctionGatewayRenewal` marked. */
export function IsGatewayRenewal(order: object): boolean {
    return GATEWAY_RENEWALS.has(order);
}

/** Tree-shaking anchor — call from the server bootstrap so @RegisterClass is retained. */
export function LoadSubscriptionEntityServer(): void {
    // intentionally empty
}
