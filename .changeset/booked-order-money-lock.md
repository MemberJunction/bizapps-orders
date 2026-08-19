---
"@mj-biz-apps/orders-entities": patch
"@mj-biz-apps/orders-core-entities-server": patch
"@mj-biz-apps/orders-ng": patch
---

A booked order can no longer add, remove, or reprice lines, or restate the initial tender. Validate refuses those edits, the form hides the catalog picker, and the unused Fast Entry page is removed.
