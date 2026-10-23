---
'@mj-biz-apps/orders-entities': minor
---

Release seed for 5.38: `V202610230130__v5.38.x__Metadata_Sync.sql` and its PostgreSQL counterpart carry `EntityIDFieldName` on the three polymorphic RecordID fields (#946) to hosts, which install by migration and never read `metadata/`.
