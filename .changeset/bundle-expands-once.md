---
"@mj-biz-apps/orders-core-entities-server": patch
"@mj-biz-apps/orders-integration-tests": patch
---

A bundle line is expanded once. Saving a draft again after its lines changed used to add a second set of component lines, doubling the order, and the new set carried none of the edits made to the first, so an overlap acknowledged on a band inside a bundle came back unacknowledged and confirm refused it. A bundle line that already has children now updates them to its current quantity and price instead (a child whose quantity or price was set by hand keeps it). An overlap acknowledgment on the bundle line is copied to its component lines, so a bundle confirmed in one step can acknowledge a band inside it.
