---
'@mj-biz-apps/orders-entities': patch
---

Ship the `Overlapping Subscriptions` query for finance's month-end exception review (golive #279,
type 5): pairs of live subscriptions for one holder whose terms overlap, for the same product or a
band of it (same category and subscription type). Each overlap is billed and recognized twice
unless one is cancelled. Metadata only; no schema change.
