---
'@mj-biz-apps/orders-server': patch
'@mj-biz-apps/orders-core-entities-server': patch
---

Public checkout URL is `GET /checkout/:slug` on the existing `OrdersCheckoutEdge` (vanilla HTML talking to the POST edge). The server package publishes `MJ_SERVER_EXTENSIONS` (and `package.json` `memberjunction.serverExtensions`) so a host that lists `@mj-biz-apps/orders-server` in `dynamicPackages.server[]` auto-loads the webhook and checkout edge. Initialize writes a SKU-resolved `productId` onto Configuration so that page can draft a line.
