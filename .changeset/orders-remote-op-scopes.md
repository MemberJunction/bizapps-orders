---
'@mj-biz-apps/orders-entities': patch
---

Orders now ships an API scope for every remote operation that declares one. New scopes under `orders`: `orders:read`, `orders:write`, `orders:payments:refund`, `orders:payments:write` and `orders:subscriptions:write`, each allowed at the MJAPI application ceiling (`*`, Include). The payment and subscription operations' `RequiredScope` moves from `payments:refund`, `payments:write` and `subscriptions:write` to the `orders:` names; those old scopes were never created, so no API key could carry them. Before this, API-key calls to these operations were refused on every host. The rows are in `metadata/` and reach hosts through the release's metadata sync migration.
