---
"@mj-biz-apps/orders-entities": patch
"@mj-biz-apps/orders-core-entities-server": patch
"@mj-biz-apps/orders-ng": patch
---

The order header Total now includes tax and charges when lines are priced in the browser (#405). Both pricing paths read a priced line back through one shared helper, `ReadPricedLineAmounts`, so the local path's gross is net plus charges plus tax, matching `Orders.PriceOrder`.
