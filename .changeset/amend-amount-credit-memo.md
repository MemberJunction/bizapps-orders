---
"@mj-biz-apps/orders-entities": minor
"@mj-biz-apps/orders-core-entities-server": minor
"@mj-biz-apps/orders-integration-tests": minor
---

An amount change that needs a credit memo is no longer refused (#662). The approved change is the credit memo: it carries the memo's amount and number (`<order number>-CM<n>`), posts its entry dated the effective day (deferred revenue and tax debited, the receivable credited), credits the invoice named in `AppliesToInvoiceID` up to its open amount, and lowers the line's `BilledToDate` by the memo's net. What no invoice takes stays on the order's balance as the customer's credit. `RefundRequested` against a paid invoice records the credit on that invoice; the acknowledgment task asks finance to pay it with `Orders.RefundPayment`. Payments landing on a credited invoice settle only what it still owes. Integration bundle `amount-change` gains AC8 and AC9, and AC7 now applies a credit on an invoice already sent.
