---
"@mj-biz-apps/orders-core-entities-server": patch
---

Delete removed order lines when the order save takes line persistence over from MJ's standard companion pass.

`OrderEntityServer.Save()` passes `SkipRelatedCollections` so that lines can be expanded, priced and taxed before they are written, and `savePendingLines()` stands in for the pass it skipped. That stand-in only ever inserted and updated — `Lines.Removed` was never drained — so a line removed from a draft stayed in the database. With a replacement added, the orphan still held `LineNumber 1`, the replacement was re-sequenced to `1`, and the insert failed on `UQ_OrderLine_OrderHeader_LineNumber`. With nothing added there was no error at all: the save reported success and the row remained.

Removals are now issued at the top of the save transaction, before anything renumbers or writes a line — the order MJ's own collection pass uses, and for the same reason. A removed line's price components, charge and adjustment allocations, adjustments and dimensions come out with it, because the generated `spDeleteOrderLine` does not cascade.

The delete fires `trg_OrderLine_RollupTotals`, so the header's totals are re-read from the row before the header itself is written. Without that, the save puts the caller's pre-delete figures back — invisible when a replacement line is added, because its insert fires the trigger again, but a removal that empties an order left it reading a total for lines it no longer had.
