---
'@mj-biz-apps/orders-entities': minor
---

The 5.29 Metadata_Sync ships what metadata/ changed since 5.28: the API scopes orders:read, orders:write, orders:payments:refund, orders:payments:write and orders:subscriptions:write, an MJAPI application scope (`*`, Include) for each, and the `orders:`-prefixed RequiredScope on Refund Payment, Apply Account Credit, Cancel Subscription, Spawn Renewals, Amend Arrangement and Detect Overlapping Subscriptions. The seed is idempotent and safe on a host that already ran `mj sync push`. The ML bench output under metadata/ is not included.
