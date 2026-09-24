---
'@mj-biz-apps/orders-core-entities-server': minor
'@mj-biz-apps/orders-entities': minor
'@mj-biz-apps/orders-ng': minor
---

Freeze the selling company, order date and parties on a confirmed order.

- A line on a Confirmed order keeps the company it was sold under. `OrderLineEntityServer` no
  longer re-stamps `CompanyID` from the product once the order is booked, and trigger 51003 now
  refuses a change to it. Draft and Quoted orders still re-stamp from the product.
- A booked header refuses changes to `OrderDate`, `OrderType` and `ReversesOrderHeaderID` (added to
  `ORDER_HEADER_MONEY_FIELDS` alongside `CompanyID`) and to a bill-to party that is already set
  (new `ORDER_HEADER_SET_ONCE_FIELDS`), from `Validate()`, with a message naming the field.
- New trigger `trg_OrderHeader_ImmutableAfterConfirm` backs that at the database: the same columns
  (51013), and `Status` cannot leave Confirmed (51014).
- The order form shows Order Date and the bill-to party read-only on a booked order, as it already
  did Company and Order Type, with a note saying why.
- The guest-order claim no longer re-points a booked order's bill-to. It fills an empty one, and
  moves the ship-to on its own, so the claim succeeds.

Direct SQL that rewrote these columns on booked orders is now refused; stand the trigger down the
way the existing immutability triggers are for a data reset.
