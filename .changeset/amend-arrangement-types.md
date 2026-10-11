---
"@mj-biz-apps/orders-entities": patch
"@mj-biz-apps/orders-core-entities-server": patch
---

`Orders.AmendArrangement`'s generated input and output types now match the operation: `OrderHeaderID` and `NewPaymentTermsTypeID` for a change of payment terms, `SubscriptionTermID` and `NewEndDate` optional, and the payment-terms fields of the output. The input interface is declared once, and the server operation uses the generated types.
