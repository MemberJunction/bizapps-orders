---
'@mj-biz-apps/orders-core-entities-server': patch
'@mj-biz-apps/orders-entities': patch
'@mj-biz-apps/orders-server': patch
---

A card payment that matched no order or invoice can become a paid order. The `Orders.CreateOrderFromProviderPayment` remote operation reads a charge from the payment gateway and, in the payment provider's company, creates and confirms an order with one line of the product the caller names, at the charge's gross amount, billed to the buyer the caller names. It records the gateway intent and captures the charge against the order, so the gateway's fee is booked and the bank deposit that follows, net of that fee, matches. It refuses a charge that has not succeeded, has any refund, has no gateway intent, is in another currency, or belongs to an intent Orders opened. The order confirms through the ordinary path, so a charge below the product's price waits on an approved concession, and an order that would total more than the charge (tax or charges) is refused. One order per charge: a repeat call returns the first order and finishes its capture if that had failed. These orders carry `Origin = 'ProviderPayment'`.
