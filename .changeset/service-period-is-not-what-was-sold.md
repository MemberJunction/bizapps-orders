---
"@mj-biz-apps/orders-core-entities-server": patch
---

A blank service period can be filled in on the order of a closed deal.

The deal lock refuses order-line edits while the deal is closed, and its message says what it protects: "before changing what was sold". It covered every field, including the service period — which is the coverage window, not the thing sold.

That blocked an ordinary close. `ConfirmEligibility` will not confirm a line whose product requires a service period until it has both a start and an end; Sales can state a term start on a deal line and nothing more, because `DealLine` carries no date columns. So the end could only be set on the order, the lock refused it, and the only route to a confirmable order ran through reopening the deal, setting the dates and closing it again.

An update now skips the lock only when it is FILLING those columns in: every field it changes is `ServicePeriodStart` or `ServicePeriodEnd`, and every one of them was empty beforehand. A date that is already set still meets the lock, so correcting one continues to go through reopening the deal — a date that was never set has nowhere else it could have come from, while one that is already there had a source, and moving it changes the window agreed at the close.

A save that also moves the quantity or the price still meets the lock, a create is untouched, and a line on a booked order still meets it: after confirm the stored period is the settled term that recognition is derived from.
