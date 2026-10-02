---
'@mj-biz-apps/orders-ng': patch
'@mj-biz-apps/orders-entities': patch
---

Days now display and compare correctly in every browser zone (golive #168).

- **Date columns** (`date` in SQL: order, due, payment, term and price-list dates) read as their own day. A payment dated Oct 1 showed "Sep 30" in its own header, and in the subscription, term, price list, product and pricing-widget forms and the party orders overview, for anyone west of UTC. `FormatDate` and `DaysSince` read a `Date` by its UTC day and a string by its leading `YYYY-MM-DD`.
- **Timestamps** (`datetimeoffset`: an event's start and end, a promotion's schedule, entitlement validity, subscription and stored-value events, an external invoice's sent date) display as the business-zone day they fell on, through the new `FormatInstantDate`, `FormatShortInstantDate` and `FormatInstantWindow`. Nothing infers which kind a value is from its time of day. A promotion starting at 7:00 PM Central now reads Oct 1, not Oct 2.
- The orders dashboard's "days past due", the pricing page's list windows, and the customer AR, charges and tax, and subscriptions page dates no longer read "0 days" or "—" when a cell is a `Date`.
- The party orders overview files orders by the month their date names and ends its six-month window at the business month. Its query and the party lifetime query count from the business day instead of the UTC clock.
- "Today" comes from the business calendar instead of the UTC day, which is already tomorrow for the whole American evening. This covers the orders dashboard, overdue, customer AR, order document, product and party stats, a new or retired product GL link, revenue-recognition release on the subscriptions page, and `ResolveActiveEmployerOrganization`'s default as-of day.
