---
"@mj-biz-apps/orders-entities": patch
"@mj-biz-apps/orders-ng": patch
---

The order screen shows a saved price override as the line total and header Total.

Once an overridden price was saved and the order reopened, the pricing pass re-resolved the line at
list price, so the line total and the header Total showed list price while the unit price, Balance
and the stored line carried the override. `StatedLineUnitPrice` now holds a line's price when it is
being edited or flagged `PriceOverridden`, and both pricing paths use it.
