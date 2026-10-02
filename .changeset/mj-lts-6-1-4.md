---
"@mj-biz-apps/orders-actions": patch
"@mj-biz-apps/orders-ng": patch
"@mj-biz-apps/orders-core-entities-server": patch
"@mj-biz-apps/orders-entities": patch
"@mj-biz-apps/orders-integration-tests": patch
"@mj-biz-apps/orders-server": patch
---

Move to MemberJunction 6.1.4 (the 6.1 LTS line) from 6.1.0-edge.5, and require BizApps Accounting 0.17.0 or later, the first release with the finance exception operations that progress posting, the overlap check and the below-engine check call. `mjVersionRange` is now `>=6.1.4 <7.0.0`.
