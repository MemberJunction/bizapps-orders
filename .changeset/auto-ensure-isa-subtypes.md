---
"@mj-biz-apps/orders-entities": minor
"@mj-biz-apps/orders-core-entities-server": minor
"@mj-biz-apps/orders-ng": minor
---

Enable `SubtypeSelector.AutoEnsureOnSave` on `MJ_BizApps_Orders: Products` and delegate `OrderLine` extension provisioning (`CheckoutSessionService`, `OrderHeaderEntity.SplitLineIntoSeats`, `OrderLineExtensionCompanion`, and `order-lines-editor.component`) to declarative zero-argument `EnsureISAChild()` rather than duplicating `ProductType.OrderLineExtensionEntity` lookups across tiers.
