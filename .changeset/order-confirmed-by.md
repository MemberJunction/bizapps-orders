---
'@mj-biz-apps/orders-entities': minor
'@mj-biz-apps/orders-core-entities-server': minor
'@mj-biz-apps/orders-server': minor
---

Orders now record who confirmed them. `OrderHeader.ConfirmedByUserID` (FK to `__mj.User`) is written by the booking save from the save's context user, in the same write as `ConfirmedAt`, and is NULL when the booking has no context user. Orders booked before this release keep NULL: who confirmed them is not recorded anywhere, so nothing is backfilled. Once an order has a `ConfirmedAt` the column cannot change: `Validate()` refuses it with the other booked header fields, and trigger 51017 refuses it at the database. Migration `V202609281000` adds the column, the trigger and their CodeGen output.
