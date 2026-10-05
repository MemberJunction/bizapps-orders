---
'@mj-biz-apps/orders-entities': minor
---

The 5.27 Metadata_Sync brings the Generate Invoice action's description and its CompanyID, HTML and DocumentCount parameter descriptions up to date on hosts: an order produces one document, from the order's company, and naming any other company is refused with NOT_ORDER_COMPANY. The seed is idempotent and safe on a host that already ran `mj sync push`. The ML bench output under metadata/ is not included.
