---
'@mj-biz-apps/orders-core-entities-server': patch
---

Classify checkout CapturePayment webhook failures: terminal refusals (and events older than 12h) return 200 plus a `[CHECKOUT-CAPTURE-TERMINAL]` marker so Stripe does not retry for three days; transient failures still 500. Stripe `created` is carried as `WebhookEvent.OccurredAt`.
