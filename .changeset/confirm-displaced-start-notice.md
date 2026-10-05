---
"@mj-biz-apps/orders-entities": patch
"@mj-biz-apps/orders-core-entities-server": patch
"@mj-biz-apps/orders-ng": patch
---

Confirm now says when it moves a subscription line's service dates. A line for a product the subscriber already holds extends that subscription and starts the day after current coverage ends; the stated start used to disappear with only a server log line. The confirm records the stated and settled dates on the subscription's `Extended` event, `OrderHeaderEntity.Confirm()` reloads the lines and returns the moved lines, `OrderHeaderEntity.LoadDisplacedTermStarts()` reads them back for a booked order, and the order form shows a notice after Confirm and whenever the order is opened.
