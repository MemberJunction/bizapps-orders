---
'@mj-biz-apps/orders-entities': patch
'@mj-biz-apps/orders-core-entities-server': patch
'@mj-biz-apps/orders-ng': patch
---

A deferred line that neither an event nor a subscription dates can now be given its service period on the order screen, and Confirm stays disabled, naming the line, until both dates are set. `OrdersEngine.ServicePeriodSource(productID)` says where a line's window comes from (`NotRequired`, `Event`, `Subscription` or `Line`); `OrderHeaderEntity.LinesMissingServicePeriod()` lists the lines still without one. A refused Confirm, Void or Reopen now puts the previous status back (`OrderHeaderEntity.SaveStatus`) and shows the reason, instead of leaving the order reading the new status with every later save failing.
