---
'@mj-biz-apps/orders-entities': minor
---

The 5.26 Metadata_Sync brings three remote-operation contracts on hosts up to date: Orders.CancelSubscription's output type, Orders.CheckEntitlement's description and input type (an email resolves to one Person by the checkout's rule), and Orders.RecordProgress's description and output type (the date warnings). The seed is idempotent and safe on a host that already ran `mj sync push`. The ML bench output under metadata/ is not included.
