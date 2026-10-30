---
"@mj-biz-apps/orders-entities": minor
"@mj-biz-apps/orders-core-entities-server": minor
"@mj-biz-apps/orders-server": minor
"@mj-biz-apps/orders-ng": minor
---

The order form shows an order's lines read-only when a registered order-line veto would refuse an edit (bizapps-sales#328), instead of letting someone type changes the save then refuses. `Orders.CheckOrderLinesEditable` (new, read-only, `orders:read`) asks the veto the line save asks, as the caller, and returns the refusal for adding, changing and removing a line, or null; with no vetoer registered all three are null. The order lines editor calls it when a saved order loads and after each save, and while any refusal stands it disables line inputs, the product picker and Remove, showing the vetoer's own text. While the first answer is pending, and when the check fails, the lines are read-only too, with a message saying so. The new remote operation is metadata, so it reaches hosts through the next release's Metadata_Sync migration.
