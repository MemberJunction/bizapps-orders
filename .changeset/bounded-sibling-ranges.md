---
"@mj-biz-apps/orders-server": patch
---

Peer ranges on other BizApps packages now have an upper bound at the next major (accounting `<1.0.0`, tasks `<2.0.0`, common `<6.0.0`), matching `mj-app.json`. An open `>=` range would let a host pair this release with another app's next major, which belongs to a different release line.
