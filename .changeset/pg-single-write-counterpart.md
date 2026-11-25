---
"@mj-biz-apps/orders-entities": minor
---

Add the PostgreSQL counterpart of the single-write `spUpdate*` and trigger-guard migration. It changes nothing on PostgreSQL, where the `__mj_UpdatedAt` trigger already stamps the row in the same write; it keeps the two migration sets in step so the release can ship.
