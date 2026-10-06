---
"@mj-biz-apps/orders-entities": minor
"@mj-biz-apps/orders-server": minor
"@mj-biz-apps/orders-ng": minor
---

Migration `V202610060656` adds `RenewalIncreasePercent` to `OrderCompanyPolicy`, `ProductCategory`, `Product` and `Subscription`, and `Subscription.CarryDiscountOnRenewal` (default off), the inputs the renewal pass uses to reprice a renewal. Includes its CodeGen output: entity fields, the Event Products IS-A field, the affected views and CRUD procs, and the generated entity, GraphQL and form fields.
