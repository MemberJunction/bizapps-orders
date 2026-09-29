---
'@mj-biz-apps/orders-entities': patch
---

Orders now ships the API scopes its entitlement operations require: a parent `orders` scope with `orders:entitlement-check` (`Orders.CheckEntitlement`) and `orders:entitlement-read` (`Orders.ListEntitlements`), both allowed at the MJAPI application ceiling (`*`, Include). Before this, every API-key call to either operation was refused on a host that installed Orders until the scopes were created by hand. The rows are in `metadata/` and reach hosts through the release's metadata sync migration.
