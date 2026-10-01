---
'@mj-biz-apps/orders-ng': patch
---

Date-only fields read one day early in the payment and order headers, the subscription, term, promotion, price list and product forms, and the party orders overview for anyone west of UTC. A payment dated Oct 1 showed "Sep 30" (golive #168). `FormatDate` and `DaysSince` now read a date column's `Date` by its UTC day, and read any other instant as the business day it fell on. The hand-rolled `toLocaleDateString` formatters now go through `FormatDate`. The orders dashboard, overdue, customer AR, order document, product and party stats screens now take "today" from the business calendar instead of the UTC day, which was already tomorrow for the whole American evening.
