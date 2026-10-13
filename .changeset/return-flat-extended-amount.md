---
'@mj-biz-apps/orders-core-entities-server': patch
---

A return of a Flat-priced line now credits the amount the line was booked at, not quantity × unit price (#651). A full return of Flat 100.00 at quantity 3 credits −100.00 instead of −99.99, and at quantity 7 −100.00 instead of −100.03. The return line takes its share of the origin's `ExtendedAmount`, negated, while it is at the origin's unit price; a stated unit price or amount is kept as stated. Partial returns split the amount, and the allocated `DiscountAmount`, by cumulative rounding, as returned tax already was, so a series of returns gives back exactly what was booked (33.33, 33.34, 33.33). An origin booked before `ExtendedAmount` was stored uses the invoice's test: with no discount and a net within half a cent per unit of quantity × unit price, the net is the amount. A subscription cancellation's reversal line no longer copies the unit price itself; the order save settles it from the origin like any return.
