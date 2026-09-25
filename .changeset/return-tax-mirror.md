---
"@mj-biz-apps/orders-entities": patch
"@mj-biz-apps/orders-core-entities-server": patch
---

A return refunds the tax its sale collected, in the jurisdictions that collected it.

A reversal line's tax is no longer resolved from the return's own ship-to address and date. It is
the origin line's tax charges, per jurisdiction, scaled by the quantity returned and negated, with
cumulative rounding so a series of partial returns refunds exactly what was collected. Before this, a
return that named no address refunded no tax, and one that named an address refunded at that
address's current rate.

A reversal order that states no address now takes its bill-to and ship-to from the order it
reverses, and a reversal line its origin line's ship-to; confirm copies the origin's address
snapshot rather than re-reading the Address row. A subscription cancellation now records the order
it reverses.
