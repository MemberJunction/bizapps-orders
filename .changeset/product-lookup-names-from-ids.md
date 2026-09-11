---
"@mj-biz-apps/orders-ng": patch
---

Resolve the product header and overview lookup names (type, category, rev-rec, successor) from their ids instead of the record's virtual name columns, which load null and go stale after a save.
