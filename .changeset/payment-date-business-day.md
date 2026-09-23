---
"@mj-biz-apps/orders-entities": minor
"@mj-biz-apps/orders-core-entities-server": minor
"@mj-biz-apps/orders-ng": patch
"@mj-biz-apps/orders-server": patch
---

Every value that names a calendar day is derived from the business day rather than the clock instant
(#209).

A SQL `DATE` is a calendar day with no time. `new Date()` is an instant, and an instant serialises in
UTC — so a record stamped at 9 PM Eastern was dated tomorrow. A reversal fell in a different period
from the capture it reverses, a credit settled an order on a day that had not started, an invoice was
printed with tomorrow's date beside a due date counted from a different calendar, and the journal
entries followed the wrong day with them. Same defect shape as the order-date case
(bc-aidp-next-golive#168), fixed the same way.

Two helpers hold the rule so it is stated once rather than re-derived per site. `AsDateValue(cell)`
(orders-entities) gives the calendar day a value names, pinned to midnight UTC — which also stops a
supplied instant carrying its time into a `date` column. `CalendarDayOrToday(cell, provider, user)`
(core-entities-server) adds the fallback: today's business day when the value names no day, warming
`BusinessTimeZoneEngine` only on that path, so a metadata read never runs inside a write transaction
to compute a day that was supplied anyway. Where no provider exists — the browser, the entity layer —
the pairing is `AsDateValue(x) ?? TodayAsDateValue()`.

Converted, twenty-eight sites: the reversal factory and the applied-account-credit operation, the
capture operation, the initial payment, the entitlement grant's validity start, the subscription
booking day and the cancellation request day, the allocation and processing-fee journal entries, the
payment line's allocation entry, the order journal entry's effective date, the affiliation as-of day
on both sides, `PreviewPrice` and `SpawnRenewals`, the checkout service's pricing as-of day, the
pricing service's four `AsOf` values and the order-line and order-header ones, the order-lines
editor's dimension catalog and pricing context, the Angular payment form's cleared date field, the
invoice document's printed date and days-until-due countdown, and the integration harness's own
fixtures — a test suite that dates its rows from the clock cannot measure this defect.

Caller-supplied days are refused rather than absorbed. `AsDateValue` answers `null` for a well-formed
day that does not exist (`2026-02-30`) instead of throwing a `RangeError` its callers cannot defend
against; `RequireDate` rejects such a day rather than letting `Date.parse` roll it forward to another
one; and `Orders.CapturePayment`, `Orders.PreviewPrice`, `Orders.SpawnRenewals` and
`Orders.CancelSubscription` each refuse it at their boundary, because a quote, a renewal pass or a
payment silently answered for today is wrong with nothing to notice.

Two source guards cover all five packages — core-entities-server, entities, orders-ng, orders-server
and the integration harness. One fails if any file stamps a column the migrations declare as `DATE`
from a bare `new Date()`; the other fails on "a day in hand, else the clock" under any binding name,
which is the spelling that twice reached a date column through a differently-named variable. Sites
that cannot be driven in a unit test are pinned positively to the expression they must use.

No schema change: a `DATE` column is read from UTC parts and written as UTC midnight. The business
time zone decides only what "today" is.
