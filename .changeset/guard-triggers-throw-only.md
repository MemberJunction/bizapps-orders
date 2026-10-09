---
'@mj-biz-apps/orders-entities': minor
---

Guard triggers report their own rule again when a write goes through MemberJunction. The order, payment, payment schedule, progress measurement and access override guards refused a write with `ROLLBACK TRANSACTION` before `THROW`; under the `INSERT ... EXEC` that every MemberJunction save and tracked delete uses, SQL Server rejects that `ROLLBACK` with error 3915, so the caller saw "Cannot use the ROLLBACK statement within an INSERT-EXEC statement" instead of the rule. A new migration recreates the eight triggers with `THROW` alone, which still rolls the whole transaction back.
