---
"@mj-biz-apps/orders-ng": patch
---

Make the full order editor able to take an order

It was a viewer. Opening it without a record handed it an undefined draft, so every field
rendered its "— none —" fallback; and even with a draft it could only REMOVE lines, never
add one, so its empty state named a requirement it gave you no way to meet.

Adds an order workspace — several orders open at once, one tab each, on the same
`mj-workspace-card` accounting uses rather than a second implementation of it. "New order"
mints a real draft. Adds the inputs that were missing: a product picker that adds lines,
party pickers in place of printed GUIDs, and the order's own fields (type, dates, PO number,
initial payment tender and amount).

An existing order now opens with its number, its real stage, and READ-ONLY once past Draft.
It had been opening as an editable Draft, which invited edits to money that is already
booked and that the immutability triggers would refuse anyway.
