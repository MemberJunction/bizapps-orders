---
"@mj-biz-apps/orders-core-entities-server": patch
"@mj-biz-apps/orders-entities": patch
"@mj-biz-apps/orders-server": patch
---

A concession's `OrderNetTotal` and `CumulativeShare` are measured again when it is decided, not only when it is recorded. The record shows the share the decision was made at, not the one the draft had when the concession was recorded.
