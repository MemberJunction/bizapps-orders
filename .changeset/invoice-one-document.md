---
'@mj-biz-apps/orders-core-entities-server': minor
'@mj-biz-apps/orders-server': minor
---

An order is invoiced as one document, from the order's company, whatever company owns each product: one per instalment when it has a schedule, one for the whole order otherwise. The -A/-B company letters are gone from new document numbers. Only an instalment of a schedule written per product company before this release, on an order that had already issued under it, is still rebuilt per company under the number it froze. Asking for a product company's document (`OnlyCompanyID`, the `CompanyID` action input) now returns a refusal with result code `NOT_ORDER_COMPANY` that names the order's company. `Orders: Generate Invoice` no longer returns `SPLIT_BY_COMPANY`.
