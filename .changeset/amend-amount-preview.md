---
"@mj-biz-apps/orders-entities": minor
"@mj-biz-apps/orders-core-entities-server": minor
"@mj-biz-apps/orders-integration-tests": minor
---

`Orders.AmendArrangement` previews a lower amount on a booked term (#506). With `NewAmount` and `Preview`, it returns the reduction and its tax, the catch-up on revenue already earned, the staged recognition entries it would offset and the new schedule, the uninvoiced instalments it would reduce or cancel, and the credit memo with where it is applied (`AppliesToInvoiceID`, `RefundRequested`). It writes nothing. Recording a change of amount is still refused until its application exists. New integration bundle `amount-change` (AC1 to AC4).
