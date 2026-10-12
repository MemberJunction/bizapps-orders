---
'@mj-biz-apps/orders-entities': patch
'@mj-biz-apps/orders-server': patch
'@mj-biz-apps/orders-ng': patch
---

New table `PaymentProviderPrice` (entity `Payment Provider Prices`): which Orders product a payment gateway's price sells, per payment provider. The charge reconciliation reads it to choose the product of an order created from a card payment that matched no order (#481). A price with no active row creates no order, so an empty table changes nothing.
