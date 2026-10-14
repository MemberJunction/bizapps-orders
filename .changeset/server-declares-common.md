---
"@mj-biz-apps/orders-server": patch
---

`@mj-biz-apps/orders-server` declares `@mj-biz-apps/common-entities` and `@mj-biz-apps/common-server` (peers `^5.52.0`, exact devDependencies), which accounting's server package needs as peers. Without them, `auto-install-peers` picked a `common-entities` version for this package on its own, and the workspace installed a second copy of the common entity classes.
