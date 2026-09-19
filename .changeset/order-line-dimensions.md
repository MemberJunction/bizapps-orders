---
'@mj-biz-apps/orders-core-entities-server': minor
'@mj-biz-apps/orders-entities': minor
'@mj-biz-apps/orders-ng': minor
---

Let an order line state a GL dimension, and carry it down to the journal entry.

`OrderJournalEntryFactory` has ridden dimension tags onto every journal entry line an order line
produces since the baseline — the AR debit, the revenue or deferred credit, the discount debit, each
charge and tax credit, and both legs of every recognition release. But nothing ever tagged an order
line, so every order-originated entry reached the ledger carrying none, silently and permanently:
the line freezes once `JournalEntryID` is stamped (MemberJunction/bc-aidp-next-golive#236).

`OrderLine` gains nullable `DimensionID` and `DimensionValueID`, both foreign-keyed into
`__mj_BizAppsAccounting`. Both, not one: a dimension names the axis and the value names the point on
it, and a journal entry line's tag is the pair — so a dimension id alone could not be passed down.
`CK_OrderLine_DimensionPair` makes "both or neither" a database rule, and
`OrderLineEntityServer.ValidateAsync` reports it in words before the constraint has to.

A details button on each line card opens a slide-in panel holding the two pickers, with values read
from accounting as they stand on the order's own date — `DimensionValue` is effective-dated, and a
back-dated order has to offer the values that were live when it was placed. Changing the dimension
clears the value, because a value belongs to exactly one axis. A booked line shows its tag
read-only.

The factory now merges the line's column tag with any `OrderLineDimension` child rows, with the
column winning on its own axis: accounting refuses a journal entry line tagged twice on one
dimension, so a conflict would otherwise fail the whole booking rather than show itself.

Note the shape this fixes and the shape it does not: one tag per line means a revenue line can be
filed under Venture **or** Product **or** ARR-Type, not all of them. The chart-of-accounts design
asks for five axes on a revenue line.
