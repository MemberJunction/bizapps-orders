---
"@mj-biz-apps/orders-core-entities-server": patch
---

An order save that deleted removed lines now clears them from the order's line collection once it commits. Before, the removal stayed pending: every later save of the same object took the full line walk, and confirming an order whose lines were built in code rather than loaded failed with "cannot load over unsaved changes" (#1045).
