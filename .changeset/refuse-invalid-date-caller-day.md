---
"@mj-biz-apps/orders-core-entities-server": patch
---

An invalid `Date` passed as a caller-supplied day is refused rather than read as today (#272).

`Orders.PreviewPrice` (`AsOf`), `Orders.SpawnRenewals` (`AsOfDate`) and `Orders.CancelSubscription` (`RequestDate`) accept `Date | string`, but only the string form was validated. `new Date('garbage')` reached `CalendarDayOrToday`, which reads it as no day and falls back to today — a quote, a renewal pass or a cancellation for a day the caller never named. Each now refuses it with `Success: false` and "`<field>` is not a valid date." before any provider work.

The three sites share one boundary check, `RequireOptionalDay` in `sql-guards.ts`, which validates both forms: an empty value is `null`, a string goes through `RequireDate`, and a `Date` is accepted only when it names an instant. `Orders.CancelSubscription` now returns a malformed `RequestDate` as its own refusal instead of throwing.
