---
"@mj-biz-apps/orders-core-entities-server": minor
"@mj-biz-apps/orders-entities": minor
---

Lift the pricing walk out of `OrderEntityServer` into `OrderPricingService`, and expose it as
`Orders.PriceOrder` so a whole order can be priced without saving it.

The walk — resolve each line's price, then promotions, then charges, then tax — was private methods
on the entity reading its own fields. That meant the UI could not ask what an order would cost
without saving one, and `Orders.PreviewPrice` could only answer for a single line, which its own
description admits is advisory: promotions stack against ORDER totals, charges apportion ACROSS
lines, and tax computes on the discounted amount.

Now one implementation with two callers. `OrderEntityServer.Save()` prices before it persists;
`Orders.PriceOrder` prices and persists nothing. The operation's input mirrors the entity shape
rather than being a DTO, so the object the client prices is the object it later saves.

Also adds section mapping to `OrderHeaderEntity` — which editing section a validation failure belongs
to. Metadata-only logic, so the browser gets it without a round trip.
