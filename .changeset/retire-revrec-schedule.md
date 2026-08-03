---
"@mj-biz-apps/orders-core-entities-server": minor
"@mj-biz-apps/orders-entities": minor
"@mj-biz-apps/orders-server": minor
---

Retire `RevenueRecognitionSchedule`, `RevRecScheduleLine` and `OrderLine.RevenueRecognitionScheduleID` (D84)

Kept as "the computed envelope for MRR/ARR display and the computation trail", and never written by
anything — 14 lines in the review seed carry a deferred recognition type and none had a schedule.

Both purposes are already served by what recognition actually produces. The releases ARE a schedule:
forward-dated, balanced and queryable in `JournalEntry`/`JournalEntryLine`, and the trail is those
entries plus `OrderLinePriceComponent`. A second copy of the same facts is free to drift, and empty
tables that look authoritative are worse than absent ones — a report writer finds them and assumes
they are the source of truth. Forecasting belongs in an FP&A layer, not beside the ledger.

Revenue recognition itself is unchanged; `RevenueRecognitionType` and the forward-dated entries stay.
