---
"@mj-biz-apps/orders-core-entities-server": minor
"@mj-biz-apps/orders-integration-tests": minor
---

A partial return against an order billed by instalment lowers the origin's instalments not yet invoiced by the returned units' share of what they still bill, pro rata, and records it on the returning line (`ScheduleReduction`) (#661). A whole-order return records it too and cancels the instalments as before. The schedule check and each instalment invoice read the origin's lines less these reductions, alongside approved amount changes, so the lowered instalments still invoice. A reduction that needs a credit memo (more than the uninvoiced instalments bill, or below what is already paid on one) refuses the return. `contract-reversal` gains RV11; RV7's figures follow the lowered instalments.
