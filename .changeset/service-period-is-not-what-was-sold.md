---
"@mj-biz-apps/orders-core-entities-server": patch
---

A service period can be set on the order of a closed deal.

The deal lock refuses order-line edits while the deal is closed, and its message says what it protects: "before changing what was sold". It covered every field, including the service period — which is the coverage window, not the thing sold.

That blocked an ordinary close. `ConfirmEligibility` will not confirm a line whose product requires a service period until it has both a start and an end; Sales can state a term start on a deal line and nothing more, because `DealLine` carries no date columns. So the end could only be set on the order, the lock refused it, and the only route to a confirmable order ran through reopening the deal, setting the dates and closing it again.

An update that touches ONLY `ServicePeriodStart` and `ServicePeriodEnd` now skips the lock. A save that also moves the quantity or the price still meets it, a create is untouched, and a line on a booked order still meets it — after confirm the stored period is the settled term that recognition is derived from, and trigger 51003 does not freeze these two columns, so the exemption is bounded here rather than left to the database.
