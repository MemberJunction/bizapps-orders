---
"@mj-biz-apps/orders-entities": patch
"@mj-biz-apps/orders-ng": patch
---

The overdue badge on a payment's open orders counts calendar days, not elapsed hours.

The counter subtracted instants, so it counted a day as soon as twenty-four hours had passed. After 7pm in Chicago the UTC date has already rolled over, and an order due that same day reported "1d overdue" beside a due date still reading today; an order due six days ago reported seven. The due dates themselves moved to the business calendar earlier, so only this counter was still reading UTC.

`DaysLate` is a new helper beside `IsBefore` in the date-cell rules, pinned to midnight UTC on both sides so the difference is whole days with no time of day to round up. It cannot disagree with `IsBefore`, which is what the grids filter on, so a row can no longer read "due today" and "1d overdue" at once.
