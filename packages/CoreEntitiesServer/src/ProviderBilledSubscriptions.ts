/**
 * ProviderBilledSubscriptions — which subscriptions Orders renews, and which a gateway bills.
 *
 * A gateway such as Stripe Billing can bill a subscription itself: it charges the card each period and
 * sends its own receipt. Such a subscription carries the gateway's id in `ProviderSubscriptionID`
 * (Stripe's `sub_...`), and the gateway is the one named by `PaymentProviderID`
 * (`CK_Subscription_ProviderSubscriptionHasProvider` keeps the two together and refuses an empty id). For it, Orders' own
 * renewal jobs must do nothing: a renewal order from Spawn Renewals, or a charge from Charge Renewals,
 * would bill the customer a second time.
 *
 * THE RULE IS THE MARKER, AND ONLY THE MARKER. Two other columns sound related and are deliberately not
 * part of it:
 *   · `PaymentProviderType.SupportsSubscriptionBilling` — the gateway CAN bill subscriptions;
 *   · `PaymentProvider.BillsSubscriptions` — this account DOES bill the subscriptions sold through it.
 * Both govern CREATING a gateway subscription. Neither may decide whether Orders renews an existing one:
 * if a host turned an account's switch off later, every subscription the gateway still bills would
 * otherwise start renewing in Orders as well, and every customer would be charged twice.
 *
 * Example: Jane's SUB-000110 has `ProviderSubscriptionID = 'sub_A1'` on a Stripe account, so
 * neither job selects it, whatever that account's switch says. A team subscription invoiced through
 * Bill.com has no id, so both jobs treat it exactly as before.
 *
 * One rule, three forms: `NotProviderBilledSql` for the jobs' SQL selections, `ProviderBilledSql` for a
 * filter that wants the gateway-billed ones, `IsProviderBilled` for code that holds a row. They agree by
 * construction (all are `ProviderSubscriptionID IS NOT NULL`, or its negation).
 *
 *   READERS: ./SpawnRenewalsOperation.ts (findDue) · ./RenewalCharging.ts (findCandidates, OUTER WHERE) ·
 *            ./ProviderSubscriptions.ts (which subscriptions still need a gateway subscription) ·
 *            ./CheckoutPrePurchaseCheck.ts (the returning buyer the gateway already bills)
 *   SCHEMA:  migrations/V202610230200__v5.39.x__Provider_Billed_Subscriptions.sql
 */

import { IsProviderBilled } from '@mj-biz-apps/orders-entities';

/** The row form lives in the shared package so the entity rule on every tier uses the same predicate. */
export { IsProviderBilled };

/** A plain SQL identifier, which is all a table alias here can be. */
const SQL_ALIAS = /^[A-Za-z_][A-Za-z0-9_]*$/;

/**
 * The SQL condition "Orders renews this subscription": no gateway bills it.
 *
 * Put it at the top level of the selection's `WHERE`, never inside an `OR` group, so it holds for every
 * branch (Charge Renewals has a branch that selects without `AutoRenew`).
 *
 * @param alias - the alias the statement gives `__mj_BizAppsOrders.Subscription`, e.g. `s`.
 */
export function NotProviderBilledSql(alias: string): string {
    if (!SQL_ALIAS.test(alias)) {
        throw new Error(`NotProviderBilledSql: '${alias}' is not a plain SQL table alias.`);
    }
    return `${alias}.ProviderSubscriptionID IS NULL`;
}

/**
 * The SQL condition "a gateway bills this subscription": the positive twin of `NotProviderBilledSql`.
 *
 * @param alias - the alias of `__mj_BizAppsOrders.Subscription`, or none for a RunView `ExtraFilter`
 *                on the Subscriptions entity.
 */
export function ProviderBilledSql(alias?: string): string {
    if (alias === undefined) return 'ProviderSubscriptionID IS NOT NULL';
    if (!SQL_ALIAS.test(alias)) {
        throw new Error(`ProviderBilledSql: '${alias}' is not a plain SQL table alias.`);
    }
    return `${alias}.ProviderSubscriptionID IS NOT NULL`;
}

/**
 * What an order may do to a subscription it would attach to, when a payment gateway bills that
 * subscription (E2b). Pure: the caller passes the decision `SubscriptionBehavior.Decide` made.
 *
 *   · a new subscription, or one no gateway bills → as before
 *   · a CANCELLED one coming back (`Reactivate`)  → `FreshStart`: its old gateway id is retired (the
 *     cancel already stopped that gateway subscription) and the checkout hand-over creates a new one
 *   · anything else (extend, renew, reactivate a live one) → refused: Orders would bill or cover a period
 *     the gateway also charges for, or change one the gateway keeps charging as it was
 *
 * Example: Jane's SUB-000110 is Stripe-billed through 30 Oct 2027. An admin order for another year of
 * Professional for Jane would extend it to 2028 and invoice her, while Stripe charges her on 30 Oct 2027
 * as well: refused. After Sess cancelled SUB-000110 (and Stripe with it), a new Professional order
 * reactivates it, without the old `sub_...`, and the checkout gives it a new Stripe subscription.
 */
export type ProviderBilledPurchaseVerdictResult = { Kind: 'Allow' } | { Kind: 'FreshStart' } | { Kind: 'Refuse'; Message: string };

export function ProviderBilledPurchaseVerdict(
    action: 'CreateNew' | 'ExtendExisting' | 'Reactivate' | 'Reject',
    existing: { Status: string; ProviderSubscriptionID?: string | null; SubscriptionNumber?: string | null } | null | undefined,
    isRenewal: boolean,
    /**
     * The order books a renewal the gateway already charged (E4, marked by `SanctionGatewayRenewal`).
     * It may extend or reactivate the subscription the gateway bills, and nothing else may.
     */
    gatewayRenewal = false,
): ProviderBilledPurchaseVerdictResult {
    if (action === 'CreateNew' || action === 'Reject' || !existing || !IsProviderBilled(existing)) return { Kind: 'Allow' };
    if (gatewayRenewal && isRenewal && (action === 'ExtendExisting' || action === 'Reactivate')) return { Kind: 'Allow' };
    if (action === 'Reactivate' && !isRenewal && existing.Status === 'Canceled') return { Kind: 'FreshStart' };
    const name = existing.SubscriptionNumber ?? 'The subscription';
    return {
        Kind: 'Refuse',
        Message:
            `${name} is billed by the payment gateway (${existing.ProviderSubscriptionID}), so this order cannot ` +
            `${isRenewal ? 'renew' : action === 'Reactivate' ? 'reactivate' : 'extend'} it: the gateway charges for its periods ` +
            `itself and would charge for the same period again. Cancel it first (which also cancels it at the gateway), ` +
            `or change it at the gateway.`,
    };
}

