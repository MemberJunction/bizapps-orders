---
"@mj-biz-apps/orders-entities": patch
"@mj-biz-apps/orders-core-entities-server": minor
---

A change to a term's dates is split by kind instead of measured as one number (#307, #507). `SplitTermDateChange` replaces `TermDateChangeDays` and returns the shift (start and end moving together), the days added and the days removed. `MaxTermExtensionDays` again limits days added only, as its column description says: a shift is a term change, not a sales concession, and a shortening is an early termination that is always an exception. `AssessConcession` takes the days added; `ConcessionTierMeasure.TermDateChangeDays` becomes `TermLengthChangeDays`, the days added or removed, so a shift meets no tier's day threshold. New pure rules for the amendment path: `RouteTermShortening` (the ConcessionLimit tier whose thresholds a shortening meets, else finance review; the threshold-free floor tier does not count) and `ShiftNeedsFinanceReview`. A new Orders setting, `TermShiftReviewDays`, is the day count at or above which a shift goes to finance review; empty, the shipped value, reviews every shift. A Duration concession is always a pure extension, so its checks and routing are unchanged.
