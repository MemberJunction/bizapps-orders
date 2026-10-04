---
"@mj-biz-apps/orders-core-entities-server": patch
---

Reject a bill-to name or invoice number too long for the invoice rail instead of failing at send time. When an order whose selling company invoices through Bill.com is created, changes payer, or books, the bill-to organization or person name is checked against BILL's customer name. The check runs again before the BILL customer is created, and the invoice number is checked against BILL's before the invoice is sent. The message names the field and the limit, and nothing is truncated. Limits come from the BillCom connector's integration metadata.
