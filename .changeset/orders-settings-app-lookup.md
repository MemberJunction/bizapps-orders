---
'@mj-biz-apps/orders-core-entities-server': patch
---

Orders settings are read from the `__mj_BizAppsOrders` application even when the `Orders` navigation app is listed first. Before, every app-scoped Orders setting could read as unset, which left order review off on a host that had configured it. The order review task type is renamed `Order Trigger Review`, so it no longer shares the name `Order Review` with sales' won-deal task type, which kept it from being created on hosts where sales was installed first.
