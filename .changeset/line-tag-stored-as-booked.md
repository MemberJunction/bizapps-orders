---
'@mj-biz-apps/orders-core-entities-server': patch
---

A tag set by hand on an order line is now written to the line's stored dimension rows when the order saves, replacing the derived value on that axis. Before, only the journal entry used the hand-set tag, so the line's stored tags kept the default and disagreed with what was booked (golive #321). Clearing the hand-set tag restores the derived value on the next save.
