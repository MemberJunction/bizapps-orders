/**
 * ProviderBilledSubscriptions — which subscriptions Orders renews, and which a gateway bills.
 *
 * A gateway such as Stripe Billing can bill a subscription itself: it charges the card each period and
 * sends its own receipt. Such a subscription carries the gateway's id in `ProviderSubscriptionID`
 * (Stripe's `sub_...`), and the gateway is the one named by `PaymentProviderID`
 * (`CK_Subscription_ProviderSubscriptionHasProvider` keeps the two together). For it, Orders' own
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
 * One rule, two forms: `NotProviderBilledSql` for the jobs' SQL selections, `IsProviderBilled` for code
 * that holds a row. They agree by construction (both are `ProviderSubscriptionID IS NOT NULL`).
 *
 *   READERS: ./SpawnRenewalsOperation.ts (findDue) · ./RenewalCharging.ts (findCandidates, OUTER WHERE)
 *   SCHEMA:  migrations/V202610230200__v5.39.x__Provider_Billed_Subscriptions.sql
 */

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
 * True when a gateway bills this subscription, so Orders must not renew or charge it. Takes the
 * subscription alone, on purpose: see the header for why the account's switch is not consulted.
 */
export function IsProviderBilled(subscription: { ProviderSubscriptionID?: string | null }): boolean {
    return subscription.ProviderSubscriptionID != null;
}
