---
"@mj-biz-apps/orders-entities": patch
"@mj-biz-apps/orders-ng": patch
"@mj-biz-apps/orders-core-entities-server": patch
"@mj-biz-apps/orders-server": patch
---

Checkout element: `capture-cookies` attribute, the embedding page URL and its referrer host, kept on the checkout session as `MetadataJSON.Tracking` for outbound consumers. The page URL keeps only its origin, path and tracking parameters (`utm_*` and ad click ids).
