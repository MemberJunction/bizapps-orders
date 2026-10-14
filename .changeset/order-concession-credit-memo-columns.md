---
"@mj-biz-apps/orders-entities": minor
"@mj-biz-apps/orders-server": minor
"@mj-biz-apps/orders-ng": minor
---

Order Concessions gain the credit memo an amount change issues (#662): `CreditMemoAmount`, `CreditMemoNumber` (unique) and `RefundRequested`. Order Header Payment Schedules gain `AmountCredited`, what credit memos credited on an invoiced instalment; its `Balance` and the cash cascade net it out. An order's `Balance` subtracts approved credit memos as well as schedule reductions.
