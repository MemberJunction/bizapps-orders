---
'@mj-biz-apps/orders-entities': minor
---

Release seed for 5.40: `V202611011530__v5.40.x__Metadata_Sync.sql` and its PostgreSQL counterpart carry this release's metadata to hosts, which install by migration and never read `metadata/`: the Confirm Readiness remote operation, the Sync Provider Subscriptions and Link Provider Subscription actions with their nine params each, and the nightly Sync Provider Subscriptions job (created Disabled). Creates are guarded on ID or their unique key, so a host that already pushed this metadata is unchanged.
