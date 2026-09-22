---
'@mj-biz-apps/orders-ng': patch
---

The Product form's Accounting section now badges on the left rail when Company or Revenue
Recognition Type is missing, before a save and after a failed one.

Both columns are NOT NULL, so a new product cannot be saved without them, yet the rail put an error
badge only on Details (Product Type, Product Category) and left Accounting clean. The section's four
fields were declared inside the widget component's own template, and MemberJunction's collapsible
panel reads its fields through a content query that cannot see past a child component's view. A
section that sees no fields reports no required-and-empty count and claims none of the field-named
errors a failed save publishes, so the two errors were left with no rail item to land on.

The fields are now declared in the panel template and projected into the widget, the same shape the
Fulfillment and Subscription sections already use. The widget keeps rendering the GL links.
