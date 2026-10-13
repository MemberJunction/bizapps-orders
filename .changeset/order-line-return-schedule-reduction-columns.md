---
"@mj-biz-apps/orders-entities": minor
"@mj-biz-apps/orders-server": minor
"@mj-biz-apps/orders-ng": minor
---

Order Lines gain two fields for a return against an order billed by instalment (#661): `ScheduleReduction` (the returned units' share of what the origin's instalments had not yet invoiced) and `CreditMemoAmount` (the credit memo the return booked). An origin order's `Balance` subtracts what its returns took off its instalments, and a return order's `Balance` counts each such line at its credit memo rather than its full value.
