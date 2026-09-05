---
"@mj-biz-apps/orders-entities": minor
---

Rebuild `vwEventOrderLines` so Event Order Lines can be read again.

`EventOrderLine` IS-A `OrderLine`, and its base view lists every inherited column explicitly.
5.7.0 added `PriceOverridden` / `PriceOverrideReason` to `OrderLine` and rebuilt `vwOrderLines`,
but nothing rebuilt the **child** IS-A view — so it still carried the pre-5.7.0 parent column list.

CodeGen cannot heal this: a host's `mj.config.cjs` carries this app's schema in `excludeSchemas`
(written back on every `mj app install`/`upgrade`), because the BizApps apps own their own views.
So CodeGen registers the inherited fields on the child entity and then reports them as unreadable.

The failure is quiet, which is the dangerous part: every read of the entity fails with
"column … does not exist", and a grid renders that as **"no data"** rather than an error — Event
Order Lines looks empty while its table is full.

`vwEventOrderLines` is the only IS-A child of `OrderLine` in this schema, verified against a live
database where these were the only two unreadable fields across every `__mj_BizApps*` entity.
