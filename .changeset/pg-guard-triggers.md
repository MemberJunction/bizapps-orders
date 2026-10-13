---
'@mj-biz-apps/orders-entities': minor
---

The guard-trigger migration `V202610091200` gains its Postgres counterpart. The eight guards (order header and line, payment header, line and detail, payment schedule, progress measurement and access override) refuse the same writes on Postgres with the same messages, as statement-level triggers that raise an exception; the T-SQL error number is in the exception's DETAIL.
