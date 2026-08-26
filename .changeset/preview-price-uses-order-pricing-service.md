---
'@mj-biz-apps/orders-entities': patch
'@mj-biz-apps/orders-core-entities-server': patch
---

Route `Orders.PreviewPrice` through `OrderPricingService` (the same walk save and `Orders.PriceOrder` use) instead of calling `ResolvePrice` directly. Price resolution now loads rules from every in-force list assigned to the customer, so a member list cannot lose to catalog `BCP-STD` when both assignments are Priority 0.
