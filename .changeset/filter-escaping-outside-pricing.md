---
"@mj-biz-apps/orders-entities": patch
"@mj-biz-apps/orders-ng": patch
---

The employer lookup, order-list search, party order counts and price-override role check build their filters with the shared guards instead of doubling quotes by hand: IDs that are not UUIDs are refused, and search text goes through `EscapeSQLString`.
