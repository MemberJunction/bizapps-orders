---
'@mj-biz-apps/orders-entities': minor
---

Release seed for 5.39: `V202610300200__v5.39.x__Metadata_Sync.sql` and its PostgreSQL counterpart carry this release's metadata to hosts, which install by migration and never read `metadata/`: the Replace Payment Schedule remote operation, the Create Provider Subscriptions action with its nine params and its daily job (created Disabled), Cancel Subscription's new description, name search by any part of the name on Products, Price Lists and Product Entitlements, and the Referral Programs grid columns. Creates are guarded on ID or their unique key, so a host that already pushed this metadata is unchanged. Also adds the PostgreSQL counterpart of `V202610230200__v5.39.x__Provider_Billed_Subscriptions`.
