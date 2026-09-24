---
'@mj-biz-apps/orders-core-entities-server': minor
---

Cash against a scheduled order is a customer deposit until the instalment is billed (golive #239 follow-up).

A scheduled company books no value at confirm, so until an instalment is invoiced there is no receivable for cash to clear. `PaymentAllocationFactory` now credits Accounts Receivable only up to what that company has invoiced and not been paid, and credits the new `Customer Deposits` GL role for the rest. The role resolves per order line through the same product, category, product type, company walk as every other role, and a payment that needs it with no account linked is refused, naming the role and the company. An order with no schedule rows books the single AR credit it always did.

Issuing an instalment posts the invoice at full value and then clears whatever the customer had prepaid with a separate `Dr Customer Deposits / Cr AR` pair, sized from how much the rows' held deposits fell when the row became billed. A refund mirrors what the payment booked: the part the refund takes out of held deposits debits Customer Deposits and the rest debits AR. The Pending-to-Captured webhook promotion reads the schedule before the header is saved, and two lines of one payment naming different instalments each consume their own row.

`spRecalcOrderHeaderPaymentSchedule` cascades unnamed cash into invoiced instalments before merely scheduled ones, so the rollup and the ledger agree about which instalment the money settled (`V202609231600`).

`OrderHeaderPaymentScheduleEntityServer` refuses a `Scheduled` row reaching `Invoiced`, or acquiring a `DocumentNumber` or `InvoicedAt`, unless `Orders.IssueInstalmentInvoice` is the caller.

Needs the `Customer Deposits` role from bizapps-accounting #194 on the target database.
