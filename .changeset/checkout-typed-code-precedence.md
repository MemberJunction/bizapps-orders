---
'@mj-biz-apps/orders-core-entities-server': minor
'@mj-biz-apps/orders-ng': patch
---

A typed promotion code and a verified member code no longer stack at the public checkout. `CheckoutMemberDiscountDecision` gains `TypedCode`: `'Replace'` (the default) prices the member code and reports the typed code as not used; `'Yield'` prices the typed code and sets the member code aside with a `MemberDiscountMessage`. When the engine declines the winning code, the other is priced instead. The draft snapshots only the code it priced. The element's member-discount notice no longer says "standard rate" when the buyer's own code was priced.
