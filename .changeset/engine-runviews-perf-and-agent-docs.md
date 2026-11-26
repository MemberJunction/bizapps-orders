---
"@mj-biz-apps/orders-entities": patch
"@mj-biz-apps/orders-core-entities-server": patch
"@mj-biz-apps/orders-ng": patch
---

Upgrade `OrdersEngine` with impersonation-safe `ProviderToUse` routing, client-side user-change cache eviction, explicit `CacheLocal: true` reference metadata flags, and O(1) indexed caches for `Payment Providers`, `Price Lists`, `Price Tiers`, `Promotion Types`, `Order Company Policies`, `Subscription Families`, `Product Bundle Items`, and `Dimension Defaults`. Collapse unbatched `RunView` waterfalls across Angular form panels, pages, data queries, pricing resolvers, and server worklist operations into `OrdersEngine` reads and single-request `rv.RunViews([...])` batches.
