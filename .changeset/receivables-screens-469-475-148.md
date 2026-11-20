---
'@mj-biz-apps/orders-core-entities-server': patch
'@mj-biz-apps/orders-ng': patch
---

Receivables screens: the billing worklist lists only confirmed orders' instalments and disables Issue invoice otherwise (golive #469); Account credits re-reads its credits when shown again or when a selected row is missing from them (golive #475); the external payment poll holds a payment that would pay more than an order or instalment still owes, instead of capturing it twice (golive #148).
