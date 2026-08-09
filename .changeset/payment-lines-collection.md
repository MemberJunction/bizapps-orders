---
"@mj-biz-apps/orders-core-entities-server": minor
---

Move payment allocations onto a related-record collection, and let the graph write them.

`Payment Headers → Payment Lines` is declared as `RelatedRecordCollection` metadata, so `Lines`
exists on both tiers. `PaymentHeaderEntityServer` drops its `_lines` array and its `savePendingLines`
loop entirely: a payment's allocations are complete when they arrive — the caller supplies them,
whether that is manual entry, an order's initial payment or a reversal — and the gateway has already
settled by then, so there is nothing left to decide and no reason to keep ownership of the write.

The graph does it better than the loop it replaces: removals run before inserts, and the foreign key
is stamped at execution time, so it is correct even though the header's key is minted by that same
save.

No `Sequence` policy, unlike order lines: an allocation is identified by which order line it pays,
not by position, and `PaymentLine` has no line-number column.

`AllocatedAt` is now defaulted before the header save rather than during the line loop. It is
`NOT NULL` and no caller is required to author it, so companion validation — which runs from the
parent's save, before any line's own `Save()` — would otherwise reject allocations from every caller
that relied on the fallback.
