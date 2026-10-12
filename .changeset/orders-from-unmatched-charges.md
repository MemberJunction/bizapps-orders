---
'@mj-biz-apps/orders-core-entities-server': patch
'@mj-biz-apps/orders-entities': patch
'@mj-biz-apps/orders-server': patch
---

The charge reconciliation turns a card charge that matched no order into a paid order (#481). On a real run (not Preview), a charge without a payment, on a gateway intent Orders did not open, becomes an order when every gateway price its hosted checkout or payment link sold maps to one product in the provider's price map (`Payment Provider Prices`) and its buyer e-mail finds a person, or carries a name to create one with. The order is created through `Orders.CreateOrderFromProviderPayment`'s path, so the same checks apply. Created orders come back in the output's `OrdersCreated` (and the Action's `OrdersCreated` output) and are not raised; a charge the rules cannot decide is raised as before, with the reason added. A provider with no mapped price is not read and behaves as before.
