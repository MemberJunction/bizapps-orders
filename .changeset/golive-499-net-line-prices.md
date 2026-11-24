---
"@mj-biz-apps/orders-core-entities-server": minor
"@mj-biz-apps/orders-entities": minor
"@mj-biz-apps/orders-ng": minor
---

The confirm gate judges an order as a whole on price (golive #499). A line priced below its engine price is no longer a concession when the order's lines priced above theirs make up for it, as when an upgrade is split into the existing plan and an upsell line. `Orders.ConfirmReadiness` returns the new `ConcessionNotes`, and the order form lists them under "When this is confirmed". Discounts, held manual discounts and products given away are still counted, and booking raises no price-below-engine exception for a netted line.
