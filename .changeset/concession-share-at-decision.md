---
"@mj-biz-apps/orders-core-entities-server": patch
"@mj-biz-apps/orders-entities": patch
"@mj-biz-apps/orders-server": patch
---

A concession's `OrderNetTotal` and `CumulativeShare` are measured again when it is decided, not only when it is recorded. The confirm gate treats an approved concession's share as what its approver saw, so a draft that changed while the concession was Pending no longer lets a share the approver never saw through.
