---
"@mj-biz-apps/orders-entities": patch
---

Realign the cross-app references so orders installs onto an empty database

Orders could not be installed from zero at all, and it had never been noticed: an incrementally-built
instance already carries the rows and views the baseline expects, so the defect is invisible until
the database is wiped.

Orders is downstream, and both breaks are ours — upstream moved deliberately and our generated tail
kept pointing at where things used to be. Nothing in accounting or common is changed.

The baseline writes EntityFields and an EntityRelationship against accounting's `Dimension Values`,
`Dimensions` and `Journal Entries` entities but never creates them — it expects accounting to, by ID.
Accounting re-minted those IDs when it re-baked, so the insert failed on
`FK_EntityRelationship_EntityID`. Separately, our generated views joined
`__mj_BizAppsCommon.vwPeopleExtended`, which common retired once `Person.DisplayName` became a
computed column; the join target is now `vwPeople`, which carries it.

All ten cross-app references were audited rather than only the one that failed — common's other three
and MJ core's four are still valid and were left alone.

**This will recur.** The tail hardcodes upstream entity IDs, so every upstream re-bake re-mints them
and silently breaks the from-zero install again while every existing instance keeps working. The
durable fix is to resolve cross-app entities by schema and table name instead of embedding a GUID.
