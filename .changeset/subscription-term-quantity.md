---
'@mj-biz-apps/orders-entities': minor
---

`SubscriptionTerm.Quantity` records how many seats a term covers (#589). Existing terms are backfilled from the order line that bought them, with proration undone and rounded to whole seats.
