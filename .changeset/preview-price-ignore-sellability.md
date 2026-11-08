---
'@mj-biz-apps/orders-entities': minor
'@mj-biz-apps/orders-core-entities-server': minor
'@mj-biz-apps/orders-ng': minor
---

`Orders.PreviewPrice` takes `IgnoreSellability`, which prices a product whatever its Status and availability window. The product header's Activate check uses it, so a priced Draft product no longer reads as "could not be checked". Entering edit mode closes the readiness warning, and Activate refuses to save once the form is in edit mode.
