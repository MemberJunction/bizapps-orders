---
"@mj-biz-apps/orders-core-entities-server": patch
---

Stamp JournalEntryID on the Order Line parent and skip re-saving a clean IS-A line extension. Confirming an event order no longer fails with Field OrderHeader does not exist on Event Order Lines.
