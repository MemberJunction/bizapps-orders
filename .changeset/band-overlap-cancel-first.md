---
"@mj-biz-apps/orders-core-entities-server": patch
---

A band-overlap refusal at confirm (and from `Orders.CheckCoverageOverlap`) now offers cancelling the held band first when that would let the line confirm: every overlapping band is an existing subscription that is not already cancelled, and its type's `CancellationMode` is `Immediate`. The message says when to start the new band: the day after the cancellation date, or after the type's grace period when it has one, since grace keeps access and access is what the check reads. Under `EndOfTerm` and `EndOfBillingPeriod`, coverage runs on after a cancellation, so the option is not offered. `FamilyCoverageTerm` and `CoverageOverlap` carry the band's `CancellationMode`, `GracePeriodDays` and whether it can still be cancelled.
