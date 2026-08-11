---
'@mj-biz-apps/orders-entities': patch
'@mj-biz-apps/orders-core-entities-server': patch
---

State the overdue rule once, in `overdue.ts`, and have `GetOverdueWorklist` read it. Three surfaces
derived it independently and only one excluded a voided order — so a voided order with a stale
balance appeared on collections lists as money owed.
