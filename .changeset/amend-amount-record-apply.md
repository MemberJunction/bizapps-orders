---
"@mj-biz-apps/orders-entities": minor
"@mj-biz-apps/orders-core-entities-server": minor
"@mj-biz-apps/orders-integration-tests": minor
---

`Orders.AmendArrangement` records a lower amount on a booked term (#506). Without `Preview`, it records a Price concession carrying `NewAmount`, routed through the ConcessionLimit rule like any other. When approved, in the same transaction: the catch-up and the re-cut recognition entries are posted, the term's amount and the instalments not yet invoiced are lowered, an `AmountChanged` subscription event is logged, and accounting's acknowledgment task is raised. Later instalment invoices bill the lowered line, and the schedule check subtracts approved reductions. A change that needs a credit memo (a credit on an invoice already sent, an order billed as a whole, or a refund) is still refused. `ReasonCategory` accepts `Dispute`. Integration bundle `amount-change` gains AC5 to AC7.
