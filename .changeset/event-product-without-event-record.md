---
'@mj-biz-apps/orders-entities': patch
'@mj-biz-apps/orders-ng': patch
---

An event-type product with no Event Products row now shows the service-period fields on its order line, and Confirm names the line until both dates are set, instead of offering no fields while the server refuses every confirm. `OrdersEngine` caches Event Products (`EventProducts`, `EventProductByID`), and `ServicePeriodSource` returns `Event` only when the row exists — the same test the order save uses to stamp event dates. An order line whose service period ends before it starts is now refused by the line's own validation with a plain message, and the line editor shows it as the dates are typed.
