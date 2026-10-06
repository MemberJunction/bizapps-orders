---
'@mj-biz-apps/orders-entities': minor
---

The 5.28 Metadata_Sync ships what metadata/ changed since 5.27: the Orders.CheckCoverageOverlap remote operation, the Spawn Renewals output contract, the Overlapping Subscriptions query (SQL, description and its new LaterOverlapAcknowledged field), the Subscription and Project / Implementation product types' default entitlement grant timing, and the renewal-pricing field categories. The seed is idempotent and safe on a host that already ran `mj sync push`. The ML bench output under metadata/ is not included.
