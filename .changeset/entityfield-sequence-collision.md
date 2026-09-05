---
"@mj-biz-apps/orders-entities": minor
---

Stop the PriceOverride metadata seed hard-coding EntityField `Sequence`.

`V202609041600` inserted `PriceOverridden` and `PriceOverrideReason` at Sequence **43** and **44** —
whatever happened to be free on the authoring database. On AIDP stage 42/43/44 are held by
`ParentOrderLineIDPath`, `ParentOrderLineIDIsLeaf` and `ParentOrderLineIDChildCount`: CodeGen
hierarchy virtuals, which exist per host depending on schema shape. The insert hit
`UQ_EntityField_EntityID_Sequence` and the 5.7.0 upgrade stopped at batch 1/10, taking sales down
with it as a dependent.

Both values are now `MAX(Sequence) + 1`, evaluated per host. The two inserts are separate
statements, so the second sees the first.
