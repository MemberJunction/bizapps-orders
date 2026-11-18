---
"@mj-biz-apps/orders-entities": minor
"@mj-biz-apps/orders-core-entities-server": minor
"@mj-biz-apps/orders-ng": minor
"@mj-biz-apps/orders-integration-tests": minor
---

Five go-live fixes on order lines.

- A confirmed line's service period can no longer be changed (golive #391). `ServicePeriodStart` and `ServicePeriodEnd` join the booked-line fields, and migration `V202611161530` adds them to trigger 51003. Orders still re-dates a booked line where the subscription term moves with it: confirm, a term extension and a term shift. The trigger accepts a new period only when it is one of the line's own subscription terms' windows, or the span of all of them.
- A later order for the same product no longer reopens a canceled subscription (golive #384, part 2). Confirm skips a canceled subscription that is not gateway-billed and starts a new one. The order's Subscriptions tab also lists a subscription its line bought a term on, not only one it started.
- The attendee chosen in an event line's Event details is saved (golive #382). The line's extension was not sent when it was the line's IS-A child, and the server dropped the values of an extension it attached that way. The order form's "Before this can be confirmed" list now names an event line with no attendee.
- A payment receipt's AR credit carries the dimension held in the order line's own `DimensionID`/`DimensionValueID` columns, as the booking entry's AR debit does (golive #383). No `DimensionDefault` mapping is consulted.
- On the order of a closed sales deal, a line's stated term start is shown read-only with the deal lock's message (golive #393). `Orders.ConfirmReadiness` returns the new `LineEditRefusal`. Discard on the order form now puts back an edited line's values.
