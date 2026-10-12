---
'@mj-biz-apps/orders-entities': patch
---

The Payment Webhook Deliveries list shows its useful columns by default: first and last received time, outcome, reason code, event kind, and the Stripe event, intent and charge ids. Every field had `DefaultInView` off, because CodeGen's AI picks default columns only for an entity it creates, and on a database built from migrations this entity already exists. The flags are set in `metadata/entity-fields/.default-in-view.json` and ship in the release metadata migration.
