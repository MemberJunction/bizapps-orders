---
'@mj-biz-apps/orders-entities': patch
---

A product that is not `Active`, or an order dated outside the product's `AvailableFrom` / `AvailableTo`, is now refused when the line states its own `UnitPrice`, not only when the engine prices it (#578). The check also reaches lines saved earlier, which reload with a price and used to skip it on every later save. Reversal lines are still exempt, so a retired product can be returned.
