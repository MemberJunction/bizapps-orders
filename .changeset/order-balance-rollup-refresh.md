---
"@mj-biz-apps/orders": minor
---

Stop the order Balance rendering as a dash, and stop it erasing itself (#147).

`TotalGross`, `AmountPaid`, `Balance` and `FulfillmentStatus` on `OrderHeader` are maintained by
`spRecalcOrderHeaderTotals`, which the OrderLine and PaymentLine triggers fire. On a
create-and-confirm the header is written before any line exists, so `Balance` is legitimately NULL
at that moment — and `OrderEntityServer.Save()` never read the refreshed row back onto the entity.
`SaveEntityGraphOperation` returns `root.GetAll()`, so the browser adopted that NULL, and
`FormatMoney` renders NULL as an em-dash. A confirmed, unpaid $895 order therefore reported its
balance as `—`, which in that formatter means "not computed", not "nothing owed".

The stored value did not survive either. Every SP-parameter field is sent on the next update
regardless of dirty state, and a nullable column carrying NULL emits `@<Col>_Clear=1`, which
`spUpdateOrderHeader` obeys by writing NULL over the trigger's value; a stale `AmountPaid = 0` needs
no flag at all to overwrite a captured payment. So editing anything on a confirmed order erased its
totals — the figures payment allocation and the aging report read.

- `OrderEntityServer` now adopts the row's rollups before `Save()` returns, on the full path (after
  lines, payments, entitlements, inside the transaction) and on the header-only shortcut, where the
  refresh exists to overwrite whatever the caller believed about those four columns before the
  update is sent.
- The merge rule moved to `OrderRollupBehavior` and is explicit that the ROW wins, including when it
  reports NULL: a row saying "not computed yet" is more current than an entity's leftover figure.
- The order form's Balance and Paid tiles no longer return a bare dash for a record that exists.
  `AmountPaid` is NOT NULL, and the balance falls back to the pricing preview's total less anything
  paid, so an unsaved draft shows real figures instead of two dashes.
- `V202609021530__v0.1.x__Repair_OrderHeader_Rollups.sql` re-derives `TotalGross`, `AmountPaid` and
  `Balance` from lines and captured payments for the rows that disagree with them, repairing orders
  already erased. It deliberately leaves `FulfillmentStatus` alone: that column has unrelated drift
  from never being backfilled when it was added, and correcting it inside a money repair would
  quietly change what the fulfilment queue shows.
