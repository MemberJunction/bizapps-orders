---
"@mj-biz-apps/orders-entities": minor
"@mj-biz-apps/orders-server": minor
"@mj-biz-apps/orders-ng": minor
"@mj-biz-apps/orders-core-entities-server": minor
---

Subscriptions a payment gateway bills itself (option E, E1). A subscription whose `ProviderSubscriptionID` is set (Stripe's `sub_...`) is billed by the gateway named in its `PaymentProviderID`, so Spawn Renewals no longer places a renewal order for it and Charge Renewals no longer charges or captures one. Both jobs share one rule, `NotProviderBilledSql`, keyed on that marker alone. Orders itself has never written a gateway id, so on a host that hasn't imported any nothing renews differently today; the migration header has a two-line pre-flight for hosts that have.

The migration adds the columns the next change reads to create gateway subscriptions: `PaymentProviderType.SupportsSubscriptionBilling` (the gateway can bill subscriptions; set for Stripe), `PaymentProvider.BillsSubscriptions` (this account does; off everywhere), and `PaymentProviderPrice.UseForNewSubscriptions` (the one price a new gateway subscription to a product uses). It also adds `UQ_Subscription_ProviderSubscriptionID` (one Orders subscription per provider and gateway id), `CK_Subscription_ProviderSubscriptionHasProvider` (an id needs its provider) and `UQ_PaymentProviderPrice_NewSubscriptionProduct` (one flagged active price per provider and product).
