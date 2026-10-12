---
"@mj-biz-apps/orders-entities": patch
"@mj-biz-apps/orders-core-entities-server": patch
"@mj-biz-apps/orders-ng": patch
---

An event product with `RequiresAttendeeInfo` set now sells one seat per line, each naming its attendee (#590). Confirm refuses a line of such an event whose quantity is not 1 or that has no Event Order Line; reversal lines are exempt. Checkout refuses a line whose attendee details do not match its ticket count before writing anything. The order-lines editor holds such a line at one seat and adds an "Add seat" action that adds another line for the same event.
