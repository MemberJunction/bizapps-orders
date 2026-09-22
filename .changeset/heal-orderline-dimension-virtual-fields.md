---
'@mj-biz-apps/orders-entities': minor
---

Register the metadata `V202609191200` left behind for `OrderLine`'s dimension columns (golive #256).

`V202609191200` regenerated `vwOrderLines` with the two denormalized dimension name columns but registered `EntityField` rows for `DimensionID` and `DimensionValueID` only. On any database built from migrations alone the view has 51 columns against 49 registered fields, MJ's save-capture falls back to view column order, and every OrderLine INSERT fails with `Column name or number of supplied values does not match table definition`. `V202609221600` inserts the two rows, guarded on `(EntityID, Name)` and sequenced with the apply-time `MAX + 1` expression. Data only — no schema change and no CodeGen output.

The same run also left two `EntityRelationship` rows unregistered, `Dimension` and `DimensionValue` to Order Lines, so on a host built from migrations the accounting vocabulary is not reachable from an order line in the API or on its form. Both are healed in the same file, guarded on id and on their natural key.
