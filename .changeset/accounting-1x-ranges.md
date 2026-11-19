---
"@mj-biz-apps/orders-ng": patch
"@mj-biz-apps/orders-core-entities-server": patch
"@mj-biz-apps/orders-server": patch
---

The accounting ranges (peers and `mj-app.json`) now accept accounting 1.x as well as 0.x (`>=0.24.0 <2.0.0`). bizapps-accounting leaves 0.x with its first release-line release, 1.0.0; without this, a host could not install that release alongside orders.
