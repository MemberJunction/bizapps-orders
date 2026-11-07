---
'@mj-biz-apps/orders-ng': minor
---

The order line editor keeps showing the name, subscription flag and quantity cap of a line whose product is not sold new; only its add-product picker leaves such products out. `GetCatalogOptions` takes `includeNotSellableNew` (default off), which keeps those products and marks them `NotSellableNew`. Product names sort decimals by value, so "$1.25M" comes before "$1.5M" (`CompareProductNames`).
