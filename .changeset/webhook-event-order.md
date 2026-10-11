---
'@mj-biz-apps/orders-core-entities-server': patch
---

A payment webhook event older than the one that set an intent's current status no longer moves the status backwards. `PaymentIntent.LastEventAt` now holds the gateway's time of that event (Stripe `created`) rather than the time Orders received it, and a status-bearing event created before it is answered as already applied and changes nothing; on a same-second tie a settled status (Succeeded, Canceled) is kept. A checkout's gateway read stamps `LastEventAt` too. New exports: `IsOutOfOrderIntentEvent`, `SETTLED_INTENT_STATUSES`.
