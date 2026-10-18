---
"@mj-biz-apps/orders-ng": patch
---

Call NotifyLoadComplete() when the initial Orders section page finishes mounting, and replace capped 500-row entity_object GetOrders({ Preset: 'all' }) reads on the Orders dashboard, order document, and Customer AR pages with targeted/uncapped queries.
