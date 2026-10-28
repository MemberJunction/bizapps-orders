---
'@mj-biz-apps/orders-entities': minor
---

The 5.39 Metadata_Sync ships the `Orders.ReplacePaymentSchedule` remote operation and the default list columns and user-search settings that metadata/ changed since 5.38, so a host that upgrades by migration gets the same metadata as one that ran `mj sync push`. It and the Provider_Billed_Subscriptions migration have Postgres counterparts.
