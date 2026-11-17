---
'@mj-biz-apps/orders-entities': minor
'@mj-biz-apps/orders-core-entities-server': minor
'@mj-biz-apps/orders-ng': minor
---

Screens show a foreign-currency order's amounts with its currency code, and the Order Headers grids gain a Currency column. Totals that add amounts from several orders (orders dashboard, Customer A/R, the overdue worklist, party lifetime value and overview, staff LTV) add them in the functional currency at each order's booking rate; a foreign order with no rate yet is left out and the screen says how many were. `Orders.GetOverdueWorklist` rows gain `CurrencyCode` and `FunctionalBalance`, its output gains `UnconvertedCount`, and its totals, buckets and credit are in the functional currency. New helpers in `@mj-biz-apps/orders-entities`: `ForeignCurrencyOf`, `FunctionalRateOf`, `ToFunctionalAmount`, `SumInFunctional`, `UnconvertedNote`.
