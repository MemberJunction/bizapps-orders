---
"@mj-biz-apps/orders-ng": patch
---

The overdue badge on a payment's open orders asks the app's own overdue rule.

The badge counted days itself, by subtracting instants, so it counted a day as soon as twenty-four hours had passed. After 7pm in Chicago the UTC date has already rolled over, and an order due that same day reported "1d overdue" beside a due date still reading today; an order due six days ago reported seven. The due dates themselves were already on the business calendar, so only this counter was reading UTC.

It now calls `DaysOverdue`, where this app states once what overdue means, next to the predicate the grids filter on and the SQL the view is built from. Besides counting calendar days against the business day, that rule also knows an order with no balance left and a voided order are not overdue, so the badge no longer appears on rows the overdue filter leaves out.
