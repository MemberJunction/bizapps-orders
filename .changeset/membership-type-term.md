---
"@mj-biz-apps/orders-core-entities-server": patch
"@mj-biz-apps/orders-entities": patch
---

Confirm inherits ProductType.DefaultSubscriptionTypeID when Product.SubscriptionTypeID is blank. Product Types and Subscription Types live in OrdersEngine; confirm still RunViews the product SKU (catalog, not a *Type lookup).
