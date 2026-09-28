---
'@mj-biz-apps/orders-entities': patch
'@mj-biz-apps/orders-core-entities-server': patch
'@mj-biz-apps/orders-server': patch
'@mj-biz-apps/orders-ng': patch
---

The anonymous checkout now keeps the buyer's card when the order sells an auto-renewing subscription, so the renewal can be charged later. Before paying, it reuses or creates the buyer's gateway customer (found through their own wallet, never by e-mail) and asks the gateway to keep the card (`setup_future_usage: off_session` on Stripe); after the capture books, it files the card in the buyer's wallet (`PaymentDetail` + `CustomerPaymentMethod`) and sets it as each new subscription's renewal card (new `Subscription.DefaultCustomerPaymentMethodID`). Keeping the card is fail-soft: a failure is logged and never blocks or reverses the sale.

A widget can require an automatic-renewal agreement (`autoRenewConsentText`): the widget shows a required checkbox, the server refuses to open a payment intent without it, and the checkout session records the widget's own wording and the time (new `CheckoutSession.AutoRenewConsentAt` / `AutoRenewConsentText`).

New on the payment driver seam: `BasePaymentProvider.EnsureCustomer`, `CreateIntentRequest.SaveInstrumentForReuse`, and `RetrieveIntentResult.Instrument` (the paid card's token and display fields). Charging the kept card at renewal is not in this release.
