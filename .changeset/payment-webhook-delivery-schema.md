---
"@mj-biz-apps/orders-entities": minor
"@mj-biz-apps/orders-server": minor
"@mj-biz-apps/orders-ng": minor
---

Migration `V202610081700` adds `PaymentWebhookDelivery`: one row per verified payment-gateway webhook event, with what Orders did with it (`Outcome`: Applied, AlreadyApplied, Ignored, Rejected, Failed), a `ReasonCode`, the intent and charge ids, and when it happened and arrived. Unique per provider and gateway event id. The entity class, GraphQL type and generated form carry it.
