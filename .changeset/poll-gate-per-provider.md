---
'@mj-biz-apps/orders-entities': patch
'@mj-biz-apps/orders-core-entities-server': patch
'@mj-biz-apps/orders-server': patch
'@mj-biz-apps/orders-ng': patch
---

The payment poll gate is per provider (#608). A scheduled poll job that sets `PaymentProviderID` governs only that provider; jobs that set none govern every provider without a job of its own. `Orders.PollExternalPayments` gates each provider in the run separately: a provider whose job is off is skipped, one in Preview runs as a preview, and the run fails only when every provider was skipped. The Bill.com webhook checks the notified provider's jobs. Adds `ClassifyPollJobsFor`, `ClassifyPollJobGroups`, `PollJobProviderID` and `LoadPollJobs` to `orders-entities`; `LoadPollJobState` takes an optional provider ID.
