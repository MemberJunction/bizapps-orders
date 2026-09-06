---
"@mj-biz-apps/orders-entities": minor
---

Forward CodeGen remainder for V202609031400 (ProductPrice.Name / ProductCategoryID / Applicability). That file added the columns and SPs but omitted EntityField inserts. Recaptured on a clean DB with includeSchemas limited to __mj_BizAppsOrders; the migration is the full SQL log, not a subset.
