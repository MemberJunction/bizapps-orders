---
'@mj-biz-apps/orders-ng': patch
---

The Payment Webhook Deliveries form groups its fields in sections (Delivery Details, Payment References, Outcome, Receipt History, System Metadata) instead of the generic Details panel. The entity was created by a CodeGen run without its AI layout pass, so no field had a category; they are set in `metadata/entity-fields`.
