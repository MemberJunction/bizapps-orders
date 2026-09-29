---
'@mj-biz-apps/orders-entities': patch
---

Requires bizapps-accounting 0.16.0 or later, the release that seeds the Customer Deposits and Unbilled Receivable GL account roles. Without Customer Deposits, a host on an older accounting refuses scheduled-order payments that need that leg. The higher floor stops orders 5.20 from installing there.
