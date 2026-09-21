---
"@mj-biz-apps/orders-core-entities-server": patch
---

`PaymentHeader.PaymentDate` is stamped as the business calendar day rather than the clock instant
(#209).

`PaymentDate` is a SQL `DATE` — a calendar day — and three server paths wrote `new Date()` into it.
An instant serialises in UTC, so a payment written at 9 PM Eastern was dated tomorrow: a reversal
landed in a different period from the capture it reverses, and an applied account credit settled an
order on a day that had not started yet. Same defect shape as the order-date case
(bc-aidp-next-golive#168), fixed the same way: `TodayAsDateValue()`, the business day pinned to UTC
midnight, with `BusinessTimeZoneEngine.Instance.Config()` warmed first so a cold engine cannot
answer from whatever state it happened to be in.

The three sites are `PaymentReversalFactory.CreateReversingPayment`,
`ApplyAccountCreditOperation` (where the warm-up sits before the write transaction opens, so a
metadata read is never enlisted in it), and the `OrderDate` fallback in
`OrderEntityServer.createInitialPayment` — that last one branched rather than `??`, so the engine is
only warmed when its answer is actually used.

No schema change: a `DATE` column is read from UTC parts and written as UTC midnight. The business
time zone decides only what "today" is.
