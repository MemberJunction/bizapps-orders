---
'@mj-biz-apps/orders-entities': minor
---

The 5.42 Metadata_Sync ships what metadata/ changed since 5.41: three progress-observation entity fields, the Record Progress remote operation's output type, the Percentage of Completion revenue recognition type, and the Payment Webhook Deliveries: Not Applied view, so a host that upgrades by migration gets the same metadata as one that ran `mj sync push`. It has a Postgres counterpart.
