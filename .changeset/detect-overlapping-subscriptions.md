---
'@mj-biz-apps/orders-entities': minor
'@mj-biz-apps/orders-core-entities-server': minor
'@mj-biz-apps/orders-server': minor
---

A nightly check raises a finance exception for each pair of live subscriptions for one holder whose terms overlap (finance exception type `OVERLAPPING_SUBSCRIPTION`). The new remote operation `Orders.DetectOverlappingSubscriptions` reads the type's settings through `Accounting.GetFinanceExceptionTypes` and does nothing when the type is missing or inactive, runs the saved query "Overlapping Subscriptions", leaves out same-category pairs when `IncludeSameCategory` is false, and raises through `Accounting.RaiseFinanceExceptions`: one exception per pair against the later subscription, dated to the business day, attributed to whoever confirmed the later order, or marked creator-unresolved when that is not recorded. A re-run raises nothing new. A pair that could not be raised is reported and fails the run. The `Orders.DetectOverlappingSubscriptions` Action is the scheduler's way in, and the daily job "Orders — Detect Overlapping Subscriptions (daily)" ships disabled. Requires the BizApps Accounting release that provides the finance exception operations.
