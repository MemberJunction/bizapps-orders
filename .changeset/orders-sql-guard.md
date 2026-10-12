---
"@mj-biz-apps/orders-core-entities-server": patch
---

Security: escape the remote-supplied IdempotencyKey via EscapeSQLString (not inline regex) in the payment capture idempotency lookups, and validate PaymentDetail UUIDs at the operation boundary.
