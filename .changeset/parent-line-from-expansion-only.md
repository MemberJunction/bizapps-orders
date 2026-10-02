---
"@mj-biz-apps/orders-core-entities-server": patch
"@mj-biz-apps/orders-integration-tests": patch
---

An order line refuses a `ParentOrderLineID` unless bundle expansion wrote it. The concession confirm gate does not re-price a bundle component, so a parent set through the API would have let an ordinary line skip it. Clearing a parent is still allowed. Integration check BN13 covers the refusal.
