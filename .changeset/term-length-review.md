---
"@mj-biz-apps/orders-core-entities-server": minor
---

A subscription line whose stated period gives it a length other than its type's term is raised for finance review at confirm (golive #338), as finance exception `SUBSCRIPTION_TERM_LENGTH`: one per line, deduplicated on the line. The summary says whether the line carries the one-term list price ("priced at 11000.00, the list price for 12 months, so 1 month is not charged for") or a different price, and the amount is the difference between the length at the list rate and what the line charges. Nothing is refused or repriced, and nothing is raised until accounting has an active type with that code. `SubscriptionBehavior.Decide` reports the stated length and the type's term length in `StatedLength`.
