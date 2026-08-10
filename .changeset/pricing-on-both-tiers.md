---
"@mj-biz-apps/orders-entities": minor
"@mj-biz-apps/orders-core-entities-server": minor
"@mj-biz-apps/orders-ng": minor
---

The pricing engine moves into the browser-safe package and the price strip runs it locally. `OrderPricingService`, `PriceResolver`, `PromotionEngine`, `TaxResolver`, `ChargeEngine`, `OrdersEngine` and the three behaviour modules — 3,716 lines — always could run on either tier: they use `RunView`, `IMetadataProvider` and `MJGlobal` and nothing else. They sat in the server package by convention, and that convention was the only thing making a price preview cost a round trip. An order with no promotion code and no custom pricing plugin now prices with no server call at all, from the SAME code the booking walk runs. Anything a plugin decides, or any promotion code, escalates to `Orders.PriceOrder` — plugins are server-side code the browser's class factory does not have, and redemption caps change with orders other people are placing.
