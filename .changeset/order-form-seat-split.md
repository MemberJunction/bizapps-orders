---
'@mj-biz-apps/orders-ng': minor
'@mj-biz-apps/orders-entities': minor
---

The order form splits a line of an event that requires attendee information into one line per seat (#615).

- Raising quantity above 1 on such a line turns it into that many quantity-1 lines, each opening on its own attendee block, with a notice saying so. Confirm books that event only in this shape.
- The new lines copy the product, price (including an override and its reason), dimension, ship-to and service period. A manual discount stays on the first line; the notice says so when there was one.
- `OrderHeaderEntity.SplitLineIntoSeats` and the `attendee-seats` helpers (`RequiresAttendeePerSeat`, `ExtraSeatLinesNeeded`, `SplitIntoSeatLines`) hold the rule, so any order editor can use it.
