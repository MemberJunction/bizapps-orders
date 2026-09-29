---
"@mj-biz-apps/orders-entities": patch
"@mj-biz-apps/orders-ng": patch
---

The order screen shows a saved line's stored price as the line total and header Total.

Once a line was saved and the order reopened, the pricing pass re-resolved it from today's rules
unless its price was being edited, so the line total and the header Total could show list price
while the unit price, Balance and the stored line carried the stored one. `StatedLineUnitPrice` now
holds a line's price when it is being edited or is a positive stored price, the same test the save
walk applies, and both pricing paths use it. The rules' price is still offered as the picker's
Default, and a held line not overridden by hand keeps its rule's name on the price badge.
