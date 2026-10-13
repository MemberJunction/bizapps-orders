---
'@mj-biz-apps/orders-core-entities-server': patch
'@mj-biz-apps/orders-server': patch
---

Renewals of subscriptions with a kept card are now charged. A new daily job, `Orders — Charge Renewals (daily)` (Action `Orders.ChargeRenewals`, shipped disabled and set to preview), charges the subscription's renewal card off-session on the renewal order's due day and captures the payment through `Orders.CapturePayment`, dated the business day the gateway took the money. A declined charge, or a demand that the absent customer authenticate (SCA), is retried on the days in the new `RenewalChargeRetryDays` setting (default `3,7,11` days after the due day) and stops at the access cutoff. Each attempt is its own payment intent and a `PaymentSucceeded` or `PaymentFailed` subscription event naming the attempt, the reason and the next attempt day. The gateway idempotency key is the order and the attempt day, so a second run on the same day charges nothing.

`Orders.SpawnRenewals` now makes a renewal-card subscription's renewal due on the new term's first day, so the access cutoff counts from the first charge. Subscriptions without a renewal card keep the invoice-day due date and are not charged.

On the payment driver seam: a saved-card charge the gateway declines now returns the intent it opened (`CreateIntentResult.ProviderIntentID`, `FailureCode`, `RequiresAuthentication`), and `OpenPaymentIntent` records it as a Failed intent. A successful saved-card charge reports `CapturedAt`. The Stripe stub answers saved-card charges by Stripe's test card names (`pm_card_chargeDeclined`, `pm_card_authenticationRequired`).
