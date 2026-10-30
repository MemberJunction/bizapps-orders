---
"@mj-biz-apps/orders-ng": patch
---

Grids built on a preset view finish loading.

Customer A/R's Open items and Payments' Account credits sat on "Loading MJ_BizApps_Orders: Order Headers..." with 0 records, under headers that had already counted the money correctly. The data was never the problem: a reproduction showed around 2,800 API calls, every one returning the right rows, while the grid rendered nothing.

Each page handed `mj-entity-viewer` a view it built in a getter that returned a fresh object literal. Angular compares an `@Input()` by reference, so the viewer's `ViewEntity` setter ran on every change-detection pass, and its last branch reloads whenever the records are not in yet, which is exactly the state an unfinished load is in. Each pass restarted the load, and the response triggered the next pass.

The four pages that build their own view - Customer A/R, Account credits, Overdue worklist and Fulfillment queue - now hold the object and hand back the same reference until its inputs change. The two that were not reported shared the pattern and so shared the defect, waiting on timing rather than on being noticed.
