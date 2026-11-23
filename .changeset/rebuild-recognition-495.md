---
"@mj-biz-apps/orders-core-entities-server": minor
"@mj-biz-apps/orders-entities": minor
"@mj-biz-apps/orders-ng": minor
"@mj-biz-apps/orders-server": minor
---

Finance can rebuild a confirmed line's revenue recognition after its product's recognition type changes (golive #495). `Orders.RebuildRecognition` voids the line's recognition entries still Pending in no batch and stages a new schedule from the product's current type over what is left of the service period; batched and posted entries stay. A preview shows the voided and new entries, and each run is recorded on the new `OrderLineRecognitionRebuild` table with who ran it, why and what changed. The action is in a booked line's details, for holders of the new `MJ.BizApps.Orders.Recognition.Rebuild` authorization (Finance, CFO, Developer). When a product's recognition type changes, the Product form lists the booked lines still on the old schedule (`Orders.ListRecognitionRebuildCandidates`). Voiding needs accounting's `Accounting.VoidPendingJournalEntries` (bizapps-accounting#518).
