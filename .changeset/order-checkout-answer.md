---
"@mj-biz-apps/orders-entities": minor
"@mj-biz-apps/orders-server": minor
"@mj-biz-apps/orders-ng": minor
---

Migration `V202609291304` adds the OrderCheckoutAnswer table: one row per order per question a checkout widget asked the buyer, with the question's key, its label as the buyer saw it, the answer, and the free-text answer given after choosing "Other". Includes its CodeGen output: the generated entity class, GraphQL type and form.
