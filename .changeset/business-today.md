---
"@mj-biz-apps/orders-entities": minor
"@mj-biz-apps/orders-core-entities-server": minor
"@mj-biz-apps/orders-ng": minor
---

Order Date defaults to today in the business time zone, "overdue" is judged against it, and the
Orders/Payments dashboards' day bars no longer disagree with themselves (bc-aidp-next-golive#168).

An order entered at 9 PM Eastern on the 27th was dated the 28th: `new Date()` is an instant and an
instant serialises in UTC. `OrderDate` now defaults to `TodayAsDateValue()`, the business calendar
day pinned to UTC midnight, on the entity, in checkout and in the overdue worklist's "as of" default.
`Today()` and `LocalDay()` in `date-cell.ts` read the zone from bizapps-common's
`BusinessTimeZoneEngine` instead of the browser. `vwOrderHeaders.IsOverdue` compares `DueDate`
against `bt.Today` from `fnBusinessToday()` rather than `CAST(GETUTCDATE() AS date)`, and the view
text is now emitted by `OverdueViewSQL()` with a test that the committed migration matches it.

That same `LocalDay()` switch from the browser's zone to the business zone exposed a latent bug in
the Orders and Payments dashboards: each "last 7 days" bar chart keyed its bars by business day but
labelled them with the viewer's own local weekday, so a viewer sitting in a different zone than the
business one saw a bar labelled with one day counting another day's rows. Both dashboards now build
their bars with a shared `BuildDayBars` helper that derives the label from the same calendar-day key
used to filter, so the two cannot diverge.

Requires `@mj-biz-apps/common-entities` 5.43.0.
