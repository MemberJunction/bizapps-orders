---
"@mj-biz-apps/orders-entities": minor
---

Cancelling a subscription, refunding a payment, moving an account credit and lowering an agreed amount now need the new `MJ.BizApps.Orders.Order.Reverse` authorization, granted to the Finance and Developer roles; the matching screens hide or disable those actions for everyone else. Records of what the payment gateway already did are exempt, and returns stay open to whoever books orders.
