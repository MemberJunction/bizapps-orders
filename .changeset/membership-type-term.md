---
"@mj-biz-apps/orders-core-entities-server": patch
---

Confirm inherits ProductType.DefaultSubscriptionTypeID when Product.SubscriptionTypeID is blank, so Membership SKUs (Enthusiast, etc.) still get an Annual Rolling term and EvenOverTime has a service period.
