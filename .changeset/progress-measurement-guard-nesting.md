---
"@mj-biz-apps/orders-entities": minor
---

Migration `V202610032200` makes `trg_OrderLineProgressMeasurement_Immutable` skip the nested UPDATE issued by the `__mj_UpdatedAt` trigger. When that trigger fired first, promoting a Draft progress observation to Posted raised 51030 (posted rows are immutable) instead of 51031 (Draft cannot be promoted). It now raises 51031 whichever trigger fires first.
