---
"@mj-biz-apps/orders-entities": minor
"@mj-biz-apps/orders-server": minor
"@mj-biz-apps/orders-ng": minor
---

Migration `V202609291306` adds the EntitlementAccessOverride table: a recorded exception to payment-gated access on one order (`WaivePaymentHold` or `DeferCutoff`), with a required reason and last day, its Tasks approval, and who decided it and when. A trigger stops the request and the decision being rewritten and limits the status moves. Includes its CodeGen output: the generated entity class, GraphQL type and form.
