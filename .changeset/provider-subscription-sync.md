---
"@mj-biz-apps/orders-core-entities-server": minor
"@mj-biz-apps/orders-server": minor
"@mj-biz-apps/orders-integration-tests": minor
---

Orders now hears what a gateway that bills a subscription did, and books it (option E, E3 + E4 + E6).

- **The sync.** `SyncProviderSubscription` reads the gateway subscription and its invoices since the latest term
  began, plans with the pure `PlanProviderSubscriptionSync`, and brings Orders in line, reporting every difference.
  Events only trigger a re-read; the gateway's records are the truth.
- **Renewals booked (E4).** A renewal the gateway charged becomes a confirmed renewal order on the subscription's own
  product at what was charged, its payment captured keyed by the gateway charge, `PaymentSucceeded` and
  `RenewalOrderSpawned` events, and the next term; any refund the gateway already made is booked after the capture.
  Only this order may renew a gateway-billed subscription (`SanctionGatewayRenewal`); a cancelled one is reactivated,
  keeping its gateway id, with a Task for support. A $0 renewal is booked at the last price, 100% off.
- **Failures and the end state.** Each failed attempt is a `PaymentFailed` event; no order until paid; access is kept
  to the end of the gateway's next retry day (capped at 45 days past coverage). A portal cancel turns automatic renewal
  off (and back on when withdrawn); a subscription the gateway ended is cancelled in Orders.
- **The webhook** routes the driver's subscription event kinds to the sync (500 on failure so the gateway redelivers);
  a gateway subscription no Orders subscription records is classified (`not_ours`, `unknown_subscription` with one
  Task). An account whose `BillsSubscriptions` switch is off changes nothing (`provider_off`).
- **New actions:** `Orders.SyncProviderSubscriptions` (nightly job, ships Disabled and in Preview) and
  `Orders.LinkProviderSubscription` (checked link of an existing subscription, then a sync).
- **Driver:** `HandledSubscriptionEventKinds`, `ListProviderSubscriptionInvoices` and a richer
  `DescribeProviderSubscription` (price, quantity, customer, e-mail, metadata, `EndedAt`); Stripe implements them.

No migration. Integration checks SR75–SR88.
