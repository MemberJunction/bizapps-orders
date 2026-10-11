---
'@mj-biz-apps/orders-core-entities-server': patch
---

Every verified payment webhook delivery is now recorded in `PaymentWebhookDelivery`, including the ones Orders does not apply: an event kind it does not act on (`kind_not_handled`), an intent it did not open (`unknown_intent`, for example a payment taken in the gateway's dashboard), an unreadable body, a duplicate, an out-of-order event, or one it failed to apply. A redelivery updates its row. The duplicate check now also reads this table, so an event applied earlier is recognised even after a later event replaced the id stamped on the intent. Recording never changes the response the gateway gets. A shared default view, "Payment Webhook Deliveries: Not Applied", lists the skipped and failed deliveries without the kinds Orders does not act on. New exports: `RecordWebhookDelivery`, `FindPriorDelivery`, `DeliveryOutcomeFor`, `WebhookReasonCode` and the delivery types.
