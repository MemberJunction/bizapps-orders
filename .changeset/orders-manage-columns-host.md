---
"@mj-biz-apps/orders-ng": patch
---

Make "Manage columns" work on the All Orders page and the Orders dashboard grids (Active Orders,
Orders Explorer, Fulfillment Queue, Overdue Collections) by hosting them in `mj-view-workspace`, as
the Catalog grids already are.

The workspace takes no `GridState` input; it reads column state off the view it shows. So these
grids now open on a real `MJ: User Views` row instead of the in-code grid state:

- the unfiltered grids open on the shared "Orders: Working" view shipped in `metadata/user-views`,
  which carries the same columns and money formatting;
- each preset (unpaid, overdue, credits, drafts, fulfillment queue) is a new, unsaved view owned by
  the current user, with the preset's filter and the working view's columns. Saving one from the
  workspace creates that user's own view rather than overwriting the shared one.

If the shared view cannot be loaded, the Order Headers grids show an error instead of silently
falling back to default columns.
