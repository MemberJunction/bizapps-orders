---
'@mj-biz-apps/orders-entities': patch
'@mj-biz-apps/orders-core-entities-server': patch
'@mj-biz-apps/orders-server': patch
'@mj-biz-apps/orders-ng': patch
---

`Orders.PollExternalPayments` follows the scheduled poll job's state on every run that would write, whoever calls it (#583): with no job installed or the job not Active it refuses and records nothing; with the job in Preview it runs as a preview and says so; only an Active job out of Preview records cash. The rule moved from the Bill.com webhook into `orders-entities` (`ClassifyPollJob`, `ClassifyPollJobs`, `LoadPollJobState`), and the webhook reads it from there. On the External Invoicing queue page, "Check for payments now" is disabled while the job is off, runs as a labelled preview while the job previews, and asks for confirmation before a live run.
