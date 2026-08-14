---
"@mj-biz-apps/orders-ng": patch
---

Custom Products form overrides the CodeGen layout via ClassFactory.

`BizAppsProductFormComponent` extends the generated Products form and
registers under `MJ_BizApps_Orders: Products` after the generated module
loads, so Explorer opens the custom form (identification + prices panels,
optional EventProduct IS-A extension) instead of the generated field list.
