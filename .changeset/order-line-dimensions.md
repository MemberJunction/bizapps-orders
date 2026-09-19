---
'@mj-biz-apps/orders-ng': minor
---

Let an order line be tagged with GL dimensions, behind a details panel.

`OrderLineDimension` has been read at booking since the baseline — `OrderJournalEntryFactory` rides
every tag onto each journal entry line an order line produces, and the batch engine groups by
account plus dimension combination — but nothing in the repo ever wrote a row. So every
order-originated journal entry reached the ledger carrying no dimensions at all, silently and
permanently: the line freezes once `JournalEntryID` is stamped
(MemberJunction/bc-aidp-next-golive#236).

This adds the write path. A details button on each line card opens a slide-in panel holding one
picker per dimension, sourced from accounting's `Dimension` / `DimensionValue` rows as they stand on
the order's own date — the values are effective-dated, and a back-dated order has to offer the ones
that were live when it was placed. Edits land on the line's `Dimensions` related-record collection
and persist when the order saves, so an unsaved line can carry tags and the whole graph still lands
in one transaction.

A panel rather than fields on the card: the chart-of-accounts design puts five axes on a revenue
line, and the card already carries product, quantity, price, the override editor, consequence chips,
term start and the extension disclosure. A booked line shows its tags read-only, because they are
what its journal entry already carries.

No schema change: the table, its cross-schema foreign keys and the cascade on line removal all
already existed. The collection is declared by metadata on the existing
'Order Lines → Order Line Dimensions' relationship.
