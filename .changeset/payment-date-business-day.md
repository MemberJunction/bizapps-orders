---
"@mj-biz-apps/orders-entities": minor
"@mj-biz-apps/orders-core-entities-server": patch
"@mj-biz-apps/orders-ng": patch
---

Dates that name a calendar day are derived from the business day rather than the clock instant
(#209).

`PaymentHeader.PaymentDate` is a SQL `DATE` — a calendar day — and eleven places wrote an instant
into it or into a value derived from it. An instant serialises in UTC, so a payment written at 9 PM
Eastern was dated tomorrow: a reversal fell in a different period from the capture it reverses, a
credit settled an order on a day that had not started yet, and the journal entries followed the
wrong day with them. Same defect shape as the order-date case (bc-aidp-next-golive#168), fixed the
same way.

Two new helpers hold the rule so it is stated once rather than re-derived per site.
`AsDateValue(cell)` (orders-entities) gives the calendar day a value names, pinned to midnight UTC —
which also fixes a supplied instant keeping its time into a `date` column. `CalendarDayOrToday(cell,
provider, user)` (core-entities-server) adds the fallback: today's business day when the value names
no day, warming `BusinessTimeZoneEngine` only on that path, so a metadata read never runs inside a
write transaction to compute a day that was supplied anyway.

Converted: the reversal factory and the applied-account-credit operation (both always "today"), the
capture operation's `PaymentDate`, the initial payment and the entitlement grant's validity start on
order confirm, the allocation and processing-fee journal entries on the payment header, the
allocation entry on the payment line, the order journal entry's effective date, the checkout
service's pricing as-of day, and the Angular payment form's date field when it is cleared.

A package-wide source guard now fails if any file in core-entities-server — or the Angular payment
form — stamps `PaymentDate` or `OrderDate` from a bare `new Date()` again.

No schema change: a `DATE` column is read from UTC parts and written as UTC midnight. The business
time zone decides only what "today" is.
