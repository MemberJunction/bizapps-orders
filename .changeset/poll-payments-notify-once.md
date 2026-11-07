---
"@mj-biz-apps/orders-core-entities-server": minor
"@mj-biz-apps/orders-entities": minor
"@mj-biz-apps/orders-server": minor
"@mj-biz-apps/orders-ng": minor
---

The external payment poll no longer reports a failed run while payments wait for a person. A run that leaves unmatched, refused, re-applied or reversal-needed payments now succeeds with `ATTENTION`, and each payment the run moved into one of those states (or from one to another) gets one "Payment Needs Review" notification, in-app and email by default, sent to the poll job's notify user, else its owner, else the user running the poll. Payments already waiting from earlier runs are not announced again, so the hourly job stops sending the same failure notice every hour. A notice that cannot be sent is logged and does not fail the run. Adds the notification type, its email template and a template category in `metadata/`; the release's Metadata_Sync migration carries them.
