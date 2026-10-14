---
'@mj-biz-apps/orders-entities': minor
'@mj-biz-apps/orders-ng': patch
'@mj-biz-apps/orders-core-entities-server': patch
---

`OrderLine.CoverageOverlapReason` (migration `V202610131506`): why a line marked to run alongside existing coverage in its subscription family should be billed as well (bizapps-orders#511). Nullable, with no constraint; confirm is what requires it.
