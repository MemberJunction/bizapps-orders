---
"@mj-biz-apps/orders-ng": patch
"@mj-biz-apps/orders-core-entities-server": patch
"@mj-biz-apps/orders-server": patch
---

Accounting ranges accept 1.x (`>=0.24.0 <2.0.0`), here and in `mj-app.json`. Accounting's first release from the `lts/6.2` line is 1.0.0, so a `<1.0.0` bound would keep a host on that line from installing it with orders.
