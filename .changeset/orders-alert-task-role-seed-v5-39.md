---
'@mj-biz-apps/orders-entities': minor
---

Second part of the 5.39 release seed: `V202610300700__v5.39.x__Metadata_Sync_AlertTaskRole.sql` and its PostgreSQL counterpart carry the `AlertTaskRole` Orders setting (#987) to hosts, which install by migration and never read `metadata/`. It is created empty, so alert Tasks stay unassigned until a host names a role. The create is guarded on ID or app and name, so a host that already pushed this metadata is unchanged.
