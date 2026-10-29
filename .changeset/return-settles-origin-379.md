---
"@mj-biz-apps/orders-core-entities-server": patch
"@mj-biz-apps/orders-ng": patch
---

A full return now closes out the order it reverses (golive #379).

- Confirming a return applies its credit to the original order, up to what that order still owes, through `Orders.ApplyAccountCredit`. A returned unpaid order and its return both end at a zero balance, and the original leaves the Bill.com send queue. A paid original gets nothing applied; the credit stays on the return for the refund.
- The payment allocation guard lets a return's credit be spent: the least that can be applied to an order is now zero or its own total, whichever is lower. Before, a return's negative total was refused with "nothing more to un-apply".
- When the whole order has come back, the return page offers to cancel each invoice the original still has open on Bill.com. `Orders.CancelExternalInvoice` no longer counts the original's own return credit as money paid, so the netting does not block that cancel.
- A fully returned subscription line cancels its term, effective the return's date, and cancels the subscription once no other term keeps it open. A partial return leaves both alone.
- Account credits default the target to the order a return reverses. The External invoicing panel says "queued" only for an order with a balance due, as the scheduled send does.
