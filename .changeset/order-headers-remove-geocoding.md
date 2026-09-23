---
'@mj-biz-apps/orders-entities': minor
'@mj-biz-apps/orders-core-entities-server': minor
'@mj-biz-apps/orders-server': minor
'@mj-biz-apps/orders-ng': minor
---

Order Headers: stop emitting the geocoding columns, so the view and the generated types agree again.

`Entity.SupportsGeoCoding` was set on Order Headers at some point, so CodeGen emitted `__mj_Latitude` /
`__mj_Longitude` into `vwOrderHeadersGenerated` along with a join to `[__mj].[vwRecordGeoCodes]`. The
generated TypeScript was later regenerated with the flag off, dropping both fields from the entity and
GraphQL types — but **CodeGen only adds geo columns, it never removes them**, so the view kept them.

Between 5.13.0 and 5.14.0 the two halves diverged:

| | `__mj_Latitude` |
|---|---|
| 5.13.0 generated code | present |
| 5.14.0 generated code | **gone** |
| the view, both releases | present |

A client builds its query from live `__mj.EntityField` metadata, which reflects the **view**, so it asks
for `_mj__Latitude` (GraphQL reserves a leading `__`). The API type, built from the generated code, has
no such field:

    Cannot query field "_mj__Latitude" on type "mjBizAppsOrdersOrderHeader_"

Single-record load and save on Order Headers both fail. Grids keep working, because views do not go
through the generated type — which is what made it look like a deployment problem rather than a
packaging one. Reported as MemberJunction/bc-aidp-next-golive#251; root cause in #238.

**The view loses the columns rather than the generated code regaining them.** Order Headers has no use
for geocoding and the columns have never carried a value — 120 rows on the reporting host, none with a
latitude.

Both statements in the migration are required, and neither is sufficient alone: clearing the flag leaves
the existing columns in place, and recreating the view without also clearing the flag lets the next
CodeGen run add them straight back. `AutoUpdateSupportsGeoCoding` is cleared too, so the flag is not
re-derived.

The recreated view is the CodeGen output from `V202609061900` minus exactly the two select expressions
and the `vwRecordGeoCodes` join, so a later regeneration against a host with the flag off is a no-op.
`CREATE OR ALTER` because the view exists on every installed host.
