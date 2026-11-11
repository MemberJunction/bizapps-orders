---
"@mj-biz-apps/orders-entities": minor
"@mj-biz-apps/orders-core-entities-server": minor
"@mj-biz-apps/orders-ng": minor
---

Delegate `OrderLine` extension provisioning (`CheckoutSessionService`, `OrderHeaderEntity.SplitLineIntoSeats`, `OrderLineExtensionCompanion`, and `order-lines-editor.component`) to declarative zero-argument `EnsureISAChild()` rather than duplicating `ProductType.OrderLineExtensionEntity` lookups across tiers, avoid creating empty `EventOrderLine` rows on general-admission checkout lines with no unit payload, and clear `BaseEntity.ClearSubtypeLookupCache()` when `Product.ProductTypeID` or `ProductType` extension mappings change.
