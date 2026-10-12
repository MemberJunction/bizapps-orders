---
"@mj-biz-apps/orders-entities": patch
---

`ResolvePrice` now invokes the `BasePriceResolver` named by `PricingDriverClass` (product, category chain, product type, company policy; most specific first, through the same `ResolvePricingDriver` walk the browser uses) before the `Product:`/`Category:`/`Company:` ID keys. A named key with no registered resolver, or a driver lookup that cannot be read, refuses the line with a `PriceResolutionError`. The final fallback now picks the no-key registration explicitly, so a keyed plugin can no longer stand in as the default for products it was not named for.
