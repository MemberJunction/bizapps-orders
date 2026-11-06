---
"@mj-biz-apps/orders-core-entities-server": patch
---

The payment poll now re-checks open Unmatched Bill.com payments from their stored record on every pass, and captures one once every invoice it settles has been loaded, however long ago Bill.com last changed it.
