---
"@mj-biz-apps/orders-core-entities-server": patch
---

`Orders.DetectOverlappingSubscriptions` uses AccountingBridge's finance exception contract and operation lookup instead of its own copy, so every orders detector changes in one place when accounting's contract does. Behaviour is unchanged: a refused batch is still reported pair by pair and later batches still run.
