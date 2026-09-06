---
"@mj-biz-apps/orders-ng": patch
---

Make "Manage columns" work on the Catalog grids by hosting them in `mj-view-workspace`.

The kebab item was a dead control. `mj-entity-data-grid` does not own a column-management UI — it
raises `ManageColumnsRequested`, the grid renderer forwards it as `configureRequested`, and
`mj-entity-viewer` re-emits it as `ConfigureRequested`. The Catalog pages dropped
`<mj-entity-viewer>` straight into their templates and subscribed to none of that, so the chain
ended at an emitter with no listener: the menu closed and nothing happened, with no error anywhere
to say why.

`mj-view-workspace` is the host that closes the chain. It binds `(ConfigureRequested)` and owns
`mj-view-config-panel`, where columns, sort and filters are actually chosen. All four Catalog grids
(products, charge types, price rules, promotions) now go through it.

The workspace brings its saved-view toolbar with it, so those grids also gain a view selector, a
view-type switcher and view save/duplicate/delete. `AutoSaveView` is `true`, so the workspace
persists view CRUD itself against `MJ: User Views` — a host that only forwarded the events would
have replaced one dead control with several.
