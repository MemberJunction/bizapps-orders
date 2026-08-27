---
'@mj-biz-apps/orders-core-entities-server': patch
---

Declare `@mj-biz-apps/tasks-entities` as a type-only optional peer (devDependency + optional peerDependency). The import is `import type`, so hosts without bizapps-tasks must not be forced to install it.
