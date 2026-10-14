---
"@mj-biz-apps/orders-entities": minor
"@mj-biz-apps/orders-server": minor
"@mj-biz-apps/orders-ng": minor
---

Order Concessions gain the fields of a change to a booked term's amount (#506): `NewAmount`, `AppliesToPaymentScheduleID` (the invoiced instalment the reduction is about) and `ScheduleReduction` (what an approved change took off the instalments not yet invoiced). An order's `Balance` subtracts its approved schedule reductions. `ReasonCategory` gains `Dispute`, and Subscription Events gain the `AmountChanged` event type.
