---
"@mj-biz-apps/orders-ng": patch
---

The order line product picker shows the list price from the product's base price row only. It no longer shows `StandaloneSellingPrice`, which the line never prices from, and shows "No price" instead of $0.00 when the product has no base price row.
