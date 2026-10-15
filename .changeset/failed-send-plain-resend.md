---
"@mj-biz-apps/orders-core-entities-server": patch
"@mj-biz-apps/orders-ng": patch
"@mj-biz-apps/orders-integration-tests": patch
---

A send Bill.com refused before creating an invoice is resent as an ordinary send (#739). A `Failed` external invoice with no rail reference (for example, the customer had no email) no longer needs `AllowReissue`, keeps the order's document number, and the order form no longer warns about billing the customer twice. The rail gets `CheckCustomer`, which a preview now runs: `Orders.IssueExternalInvoice` with `Preview` answers `NO_CUSTOMER_EMAIL` for a bill-to party Bill.com cannot take, and the order form disables Send and names the missing email.
