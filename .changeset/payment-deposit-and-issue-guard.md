---
'@mj-biz-apps/orders-core-entities-server': minor
---

Cash against a scheduled order is a customer deposit until the instalment is billed (D91, golive #240 follow-up).

A scheduled company books no value at confirm, so until an instalment is invoiced there is no receivable for cash to clear. `PaymentAllocationFactory` now credits Accounts Receivable only up to what that company has actually invoiced on the order and credits Deferred Revenue for the rest, labelled as a customer deposit; a payment naming a `Scheduled` instalment is a deposit in full. The facts are read before the payment line is saved and passed in, because the rollup moves `AmountPaid` on those rows the moment it lands. An order with no schedule rows takes the same code path and produces the single AR credit it always did.

`spRecalcOrderHeaderPaymentSchedule` now cascades unnamed cash into invoiced instalments before merely scheduled ones, so the rollup and the ledger agree about which instalment the money settled (`V202609221500`).

`OrderHeaderPaymentScheduleEntityServer` refuses a `Scheduled` row reaching `Invoiced`, or acquiring a `DocumentNumber` or `InvoicedAt`, unless `Orders.IssueInstalmentInvoice` is the caller. Invoicing freezes the number and posts the billing entry together; doing half of it by hand left a row the immutability trigger then froze with no entry behind it.
