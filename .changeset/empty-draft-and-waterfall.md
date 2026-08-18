---
"@mj-biz-apps/orders-core-entities-server": patch
"@mj-biz-apps/orders-ng": patch
---

A new Draft with no lines now mints OrderNumber instead of failing the insert. Subscriptions consume accounting-ng's deferred-revenue waterfall (the 3-column stub is gone) and label the rail Terms. Event-line extensions reload CompanyID/UnitPrice from the saved parent after the graph returns.
