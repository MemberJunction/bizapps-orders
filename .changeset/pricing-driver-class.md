---
"@mj-biz-apps/orders-entities": minor
---

`PricingDriverClass` on Product, ProductCategory, ProductType and OrderCompanyPolicy, plus `ResolvePricingDriver` — the four-level walk that answers whether a given product prices from metadata alone or needs a server-side `BasePriceResolver` plugin. This is the seam client-side pricing needs: the metadata walk can run in the browser, a plugin cannot, and the client has to know which it is facing WITHOUT asking the server or the round trip defeats the point. Every uncertain case — a read that fails, a product that does not exist, an id that is not a UUID — resolves to ESCALATE, because escalating costs a round trip nobody notices while guessing costs a wrong price on screen that corrects itself at confirm.
