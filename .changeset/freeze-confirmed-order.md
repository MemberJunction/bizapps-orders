---
'@mj-biz-apps/orders-core-entities-server': minor
---

Freeze the selling company, order date and parties on a confirmed order, at the database.

- A line on a Confirmed order keeps the company it was sold under. `OrderLineEntityServer` no
  longer re-stamps `CompanyID` from the product once the order is booked, and trigger 51003 now
  refuses a change to it. Draft and Quoted orders still re-stamp from the product.
- New trigger `trg_OrderHeader_ImmutableAfterConfirm`: on a Confirmed order, `OrderDate`,
  `CompanyID`, `OrderType` and `ReversesOrderHeaderID` cannot change, and a bill-to party that is
  set cannot be replaced or cleared (51013). An empty bill-to party may still be filled, which is how
  a guest order is claimed. `Status` cannot leave Confirmed (51014).

Direct SQL that rewrote these columns on booked orders is now refused; stand the trigger down the
way the existing immutability triggers are for a data reset.
