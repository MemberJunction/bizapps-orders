---
'@mj-biz-apps/orders-core-entities-server': patch
---

Checkout completion creates a new payer's and new attendees' Person records only after the payment checks out, so a refused payment leaves none behind; existing Persons are still resolved first and priced with. A per-unit product line whose quantity differs from the number of unit-detail sets sent is refused at draft and completion instead of booking a different number of units (#583 items 13, 14).
