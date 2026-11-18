---
"@mj-biz-apps/orders-core-entities-server": patch
---

Issuing an instalment invoice no longer fails on an order whose lines another app has frozen. When an order's deal is closed, Sales refuses edits to the order's lines. Issuing an instalment advances `BilledToDate` on each line it bills, and that write was treated as an edit, so the order could not be confirmed while an instalment was already due ("This deal is closed. Set the status back to Open before changing what was sold.") and a later instalment could not be invoiced either. The write is now marked as Orders' own bookkeeping, like the journal entry stamp and the fulfilment writes. The same applies to the two other writes of a line's running totals: recording progress (`RecognizedToDate`) and an amount change's credit memo (`BilledToDate`).
