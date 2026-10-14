---
'@mj-biz-apps/orders-entities': minor
'@mj-biz-apps/orders-core-entities-server': minor
'@mj-biz-apps/orders-ng': minor
---

Running a band alongside existing coverage now needs a permission and a reason (bizapps-orders#511).

- At confirm, a line whose overlap passes only because it is marked to run alongside (`ExtendExisting`) is refused unless the confirming user holds the new `MJ.BizApps.Orders.Coverage.RunAlongside` authorization and the line's `CoverageOverlapReason` is not blank. The check fails closed: without the authorization row, no line can run alongside. The Account Director role holds it.
- The order lines editor shows a required reason box once the box is ticked, and disables the tick for a user without the grant. Unticking clears the reason.
- A bundle line's reason reaches the band lines it expands to, as its acknowledgment does.
- The "Overlapping Subscriptions" query returns `LaterOverlapReason`.
- New shared helpers: `COVERAGE_RUN_ALONGSIDE_AUTH`, `CoverageOverlapReasonMissing`, `UserCanRunAlongside`, `RunAlongsideRefusal`.
