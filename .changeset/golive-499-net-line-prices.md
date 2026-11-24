---
"@mj-biz-apps/orders-core-entities-server": minor
"@mj-biz-apps/orders-entities": minor
"@mj-biz-apps/orders-ng": minor
---

The confirm gate judges an order as a whole on price (golive #499). A line priced below its engine price is no longer a concession when the order's lines priced above a positive engine price make up for it, as when an upgrade is split into the existing plan and an upsell line. A product sold at a negotiated price lists at 0 and makes up for nothing. `Orders.ConfirmReadiness` returns the new `ConcessionNotes`, and the order form lists them under "When this is confirmed". Discounts, held manual discounts and products given away are still counted, a line whose Price or Scope concession was rejected is not netted, a netted line counts at its stated price in the concession share's catalog total, and booking raises no price-below-engine exception for a netted line.
