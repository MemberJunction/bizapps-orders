---
'@mj-biz-apps/orders-core-entities-server': patch
'@mj-biz-apps/orders-entities': patch
'@mj-biz-apps/orders-server': patch
'@mj-biz-apps/orders-ng': patch
---

A finance reviewer can turn a charge-without-payment finance exception into a paid order without leaving the app. On accounting's Finance Exception form, an open `PROVIDER_CHARGE_MISMATCH` exception for a gateway charge Orders holds nothing for shows a panel that asks for the product, the buyer and an optional organization. It calls the new `Orders.ResolveChargeException` remote operation, which reads the payment provider and charge from the exception, books the order through `Orders.CreateOrderFromProviderPayment`, then clears the exception as Corrected with a note naming the order and payment. The caller must hold the authorization to clear finance exceptions; that is checked before anything is booked. Other kinds of mismatch, and charges Orders opened itself, are refused and the panel does not show on them. If the clear fails after the order is booked, running it again clears the exception without booking a second order.
