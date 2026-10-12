---
"@mj-biz-apps/orders-entities": patch
"@mj-biz-apps/orders-core-entities-server": patch
"@mj-biz-apps/orders-ng": patch
---

The peer ranges for `@mj-biz-apps/common-entities` and `@mj-biz-apps/common-ng` start at 5.52.0 instead of 5.49.0. `@mj-biz-apps/common-server` 5.52.0, which accounting's server package needs, pins `common-entities` 5.52.0 exactly, so a host that resolved orders' floor got a second copy of the common entity classes. With the floor at 5.52.0 the workspace resolves one copy.
