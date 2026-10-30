---
"@mj-biz-apps/orders-core-entities-server": minor
"@mj-biz-apps/orders-entities": minor
"@mj-biz-apps/orders-ng": minor
"@mj-biz-apps/orders-server": minor
"@mj-biz-apps/orders-integration-tests": minor
---

Orders now hears what a gateway that bills a subscription did, and books it (option E, E3 + E4 + E6).

- **The sync.** `SyncProviderSubscription` reads the gateway subscription and its invoices since the latest term
  began, plans with the pure `PlanProviderSubscriptionSync`, and brings Orders in line, reporting every difference.
  Events only trigger a re-read; the gateway's records are the truth.
- **Renewals booked (E4).** A renewal the gateway charged becomes a confirmed renewal order on the subscription's own
  product at what was charged, its payment captured keyed by the gateway charge (only for a period Orders has not
  booked: an imported subscriber's current year is never booked again; a taxed renewal goes to a person), `PaymentSucceeded` and
  `RenewalOrderSpawned` events, and the next term; any refund the gateway already made is booked after the capture.
  Only this order may renew a gateway-billed subscription (`SanctionGatewayRenewal`); a cancelled one is reactivated,
  keeping its gateway id, with a Task for support. A $0 renewal is booked at the last price, 100% off.
- **A gateway refund of a renewal (D20)** is a money-only credit order applied to the renewal (`Orders.ApplyAccountCredit`),
  so the renewal owes nothing, full refund or partial; access is unchanged; a Task per credit. The refund door and a
  recorded cancel decide under one subscription lock and never credit one refund twice.
- **Spending a return's credit.** An order's applied total may go below zero by the credit the order itself carries
  (a return or cancellation), never by cash; `Orders.ApplyAccountCredit` now settles only the credit's own customer's
  orders, only between CONFIRMED orders (a Draft, Quoted or Voided order holds no credit and owes nothing), and locks
  both orders, so one credit is spent once. The Account Credit page lists the same (orders-ng: Credits Held and the
  targets leave out Draft, Quoted and Voided orders).
- **End of term on a subscription the gateway still bills (D19)** ends with the latest booked term the gateway had
  charged by the request day and has not refunded in full: a cancel on the renewal day keeps the paid year; a
  request dated before the renewal (recorded later) and a fully refunded renewal keep the term covering the request,
  the refunded term reversing what the gateway refunded. Terms ridden past are stamped Completed at their own end.
- **Failures and the end state.** Each failed attempt is a `PaymentFailed` event; no order until paid; access is kept
  to the end of the gateway's next retry day (capped at 45 days past coverage). A portal cancel turns automatic renewal
  off (and back on when withdrawn); a subscription the gateway ended is cancelled in Orders.
- **The webhook endpoint check** (at every server start, and the hourly job) now judges the subscription event kinds
  too, so an endpoint that predates this release reports `Drift` with the ten kinds it does not send.
- **The webhook** routes the driver's subscription event kinds to the sync (500 on failure so the gateway redelivers);
  a gateway subscription no Orders subscription records is classified (`not_ours`, `unknown_subscription` with one
  Task); the third failed delivery for one subscription raises an urgent `GatewaySyncFailed` Task. The account's
  `BillsSubscriptions` switch gates new hand-overs only; subscriptions the gateway already bills are always followed.
- **New actions:** `Orders.SyncProviderSubscriptions` (nightly job, ships Disabled and in Preview) and
  `Orders.LinkProviderSubscription` (checked link of an existing subscription, then a sync: the account must be the
  subscription's company's, the gateway subscription must not name another Orders subscription, an existing
  provider is never overwritten, a customer e-mail that differs refuses and one that cannot be compared needs a person's `CustomerConfirmed`,
  and an older price is linked with `AllowPriceOfAnotherProduct`).
- **Entity (orders-entities):** `Linking` now covers a NEW subscription created already carrying a gateway id (the
  same write and the same guess as a saved one gaining it), so that too is refused from any form or API unless a
  server door sanctioned it.
- **Driver:** `HandledSubscriptionEventKinds`, `ListProviderSubscriptionInvoices` and a richer
  `DescribeProviderSubscription` (price, quantity, customer, e-mail, metadata, `EndedAt`); Stripe implements them.

No migration. Integration checks SR75–SR98-OT (subscription-renewal) and AC-OT1 (account-credit).
