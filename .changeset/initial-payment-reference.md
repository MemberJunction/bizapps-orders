---
"@mj-biz-apps/orders-entities": patch
"@mj-biz-apps/orders-core-entities-server": patch
"@mj-biz-apps/orders-ng": patch
---

A check number typed on Fast Entry never reached confirm.

`InitialPaymentTypeID` and `InitialPaymentAmount` are columns and already crossed
the wire. The reference is not a column — it lives on `PaymentDetail` after
confirm — so both screens kept it as page state. The server only looked at
`InitialPaymentDetailID`, which Fast Entry never set, and refused with
"Check payments need a reference number".

The typed number now rides `Order.InitialPaymentReference` (a companion, like
promotion codes). Confirm creates the `PaymentDetail` from it and attaches that
to the payment.
