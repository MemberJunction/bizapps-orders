---
"@mj-biz-apps/orders-entities": patch
"@mj-biz-apps/orders-core-entities-server": patch
---

Pricing filters escape charge codes, promotion codes and fee types with `EscapeSQLString` from `@memberjunction/global`, and refuse price list, category, product and row IDs that are not UUIDs. The UUID guards now live in `orders-entities` and are re-exported from the server package's `sql-guards`, which also re-exports MJ's `EscapeSQLString` in place of its local copy.
