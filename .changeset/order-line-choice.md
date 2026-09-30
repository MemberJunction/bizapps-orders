---
"@mj-biz-apps/orders-entities": minor
"@mj-biz-apps/orders-server": minor
"@mj-biz-apps/orders-ng": minor
---

Migration `V202609291307` adds the OrderLineChoice table: one row per option a buyer chose from a checkout choice group ("choose N of M"), recorded on the order line. It adds `ChoiceGroupKey` and `ChoiceOptionValue` to ProductEntitlement, set together or not at all; set, the entitlement is granted only on a line that carries that choice. Includes its CodeGen output: the generated entity class, GraphQL type and form, and the regenerated Product Entitlement view and procs.
