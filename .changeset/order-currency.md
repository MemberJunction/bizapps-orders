---
'@mj-biz-apps/orders-entities': minor
'@mj-biz-apps/orders-core-entities-server': minor
'@mj-biz-apps/orders-server': minor
'@mj-biz-apps/orders-ng': minor
---

Orders record the currency they are contracted in. `OrderHeader` gains `CurrencyCode` (NULL means the selling company's functional currency, so existing orders are unchanged), `BookingExchangeRate` and `BookingRateDate`. The currency can change only while an order is Draft or Quoted. The first confirm of an order in another currency stores the latest spot rate to the functional currency on or before the confirm day, and is refused when there is none. Invoices, quotes and credit memos print in the order's currency, and the order form shows it.
