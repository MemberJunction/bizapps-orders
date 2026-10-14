---
"@mj-biz-apps/orders-core-entities-server": patch
"@mj-biz-apps/orders-server": patch
"@mj-biz-apps/orders-integration-tests": patch
---

An amount change's credit memo has a customer document (#684). `Orders.GenerateInvoice` and `Orders.SendDocument` take `OrderConcessionID` and render the credit memo that approved change issued: its number, the line's net and tax credited, the invoice or order it was applied to, and the credit left to the customer (refunded when they asked for it). It is built from what the approval logged on the `AmountChanged` subscription event, not recomputed. `Orders.SendDocument` sends it by email also when the order's company invoices through Bill.com, which carries no credit memos, and another concession still pending on the order does not hold it. Re-rendered invoices show the credit: an instalment invoice lists the memos that credited it and asks for its balance, and a whole-order document subtracts each approved amount change's memo and schedule reduction, as the order's balance does. The acknowledgment task for an amount change with a memo tells accounting to send it. Integration checks AC7–AC9 render the memo and the credited invoices.
