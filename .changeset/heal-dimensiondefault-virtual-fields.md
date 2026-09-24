---
'@mj-biz-apps/orders-entities': minor
---

Register the metadata `V202609221500` left behind for `DimensionDefault`'s name fields (golive #236 follow-up).

`V202609221500` created `vwDimensionDefaults` with three denormalized name columns — `Entity`, `Dimension` and `DimensionValue` — but registered `EntityField` rows for the table's eleven columns only. On any database built from migrations alone the view has 14 columns against 11 registered fields, and every `DimensionDefault` INSERT fails with `Column name or number of supplied values does not match table definition`, so no product can carry a default dimension. `V202609241200` inserts the three rows, guarded on `(EntityID, Name)` and sequenced with the apply-time `MAX + 1` expression. Data only — no schema change and no CodeGen output.
