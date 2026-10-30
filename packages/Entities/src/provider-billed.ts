/**
 * @fileoverview Which subscriptions a payment gateway bills, and what about them is the gateway's.
 *
 * A gateway such as Stripe Billing can bill a subscription itself. Such a subscription carries the
 * gateway's id in `ProviderSubscriptionID` (Stripe's `sub_...`) and the account in `PaymentProviderID`.
 * From then on the gateway decides when and how much the customer is charged, so a change on the Orders
 * side that the gateway never hears about leaves the two out of step: a cancelled member still charged
 * next year, a cleared id that Orders then renews as well.
 *
 * `IsProviderBilled` is the one predicate for "a gateway bills this" on every tier. The SQL forms for the
 * renewal jobs live beside the server's readers (`CoreEntitiesServer/src/ProviderBilledSubscriptions.ts`)
 * and agree with it by construction: all are `ProviderSubscriptionID IS NOT NULL` or its negation.
 *
 * `PROVIDER_BILLED_FIELDS` names the columns the gateway's billing depends on. `SubscriptionEntity`
 * refuses any change to them on a gateway-billed subscription unless the server sanctions the write
 * after telling the gateway (`SanctionProviderBilledChange`).
 *
 * @module @mj-biz-apps/orders-entities
 */

/**
 * True when a gateway bills this subscription, so Orders must neither renew it nor change it without
 * telling the gateway. Takes the subscription alone, on purpose: neither the gateway type's capability
 * nor the account's `BillsSubscriptions` switch may decide this for a subscription already linked, or
 * turning a switch off would start Orders renewing everything the gateway still bills.
 */
export function IsProviderBilled(subscription: { ProviderSubscriptionID?: string | null }): boolean {
    return subscription.ProviderSubscriptionID != null;
}

/**
 * Subscription columns that decide what the gateway charges, or whether Orders renews it.
 *
 * Example: unticking `AutoRenew` on Jane's Stripe-billed SUB-000110 in the edit form would tell staff
 * she won't renew while Stripe charges her $599 at the anchor; clearing `ProviderSubscriptionID` would
 * make Spawn Renewals bill her a second time.
 */
export const PROVIDER_BILLED_FIELDS = [
    'Status',
    'AutoRenew',
    'StartDate',
    'EndDate',
    'CanceledAt',
    'ProductID',
    'SubscriptionTypeID',
    'MigratesToSubscriptionID',
    'MigratesFromSubscriptionID',
    'PaymentProviderID',
    'ProviderSubscriptionID',
] as const;

/** The refusal shown wherever a gateway-billed subscription would change without the gateway hearing. */
export function ProviderBilledChangeRefusal(providerSubscriptionID: string | null | undefined, what?: string): string {
    const id = providerSubscriptionID ? ` (${providerSubscriptionID})` : '';
    const change = what ? `${what} ` : 'it ';
    return (
        `The payment gateway bills this subscription${id}, so ${change}cannot be changed here without the ` +
        `gateway hearing of it. To end it, use Cancel subscription, which also cancels it at the gateway. ` +
        `Card changes, and refunds of what the gateway charged, are made at the gateway.`
    );
}

/** The refusal for a gateway id typed onto an existing subscription. */
export function ProviderLinkRefusal(): string {
    return (
        `The payment gateway id is recorded by Orders when it creates the gateway subscription after checkout, ` +
        `so it cannot be entered here. A wrong id would stop Orders renewing this subscription and point its ` +
        `Cancel at another gateway subscription, and it could not be removed again.`
    );
}
