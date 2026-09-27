---
"@mj-biz-apps/orders-core-entities-server": patch
---

`Orders.SpawnRenewals` renews a subscription every cycle, not only the first (#267).

The idempotency guard treated any order line naming the subscription in `RenewsSubscriptionID` as this cycle's renewal, and returned true on both of its branches. Once a subscription had renewed once, every later cycle was skipped as "a renewal order already exists for this term", and the subscription ended at the close of its second term.

The guard now counts only a renewal line on an order that is not voided and that has not yet produced a term. Earlier cycles' renewals each booked a term naming their line, so they no longer count. A renewal drafted or quoted by hand for the current cycle still holds the job off, so the customer is not billed twice. A voided renewal no longer blocks the job.
