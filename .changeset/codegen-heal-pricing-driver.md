---
'@mj-biz-apps/orders-entities': minor
'@mj-biz-apps/orders-ng': minor
'@mj-biz-apps/orders-server': minor
---

Fold inspected CodeGen output into a new migration so CRUD procedures and EntityField rows match columns added by later V migrations (PricingDriverClass, ProductType.Configuration, and related). A clean install was failing mj sync push of product-types on a stale spCreateProductType signature.
