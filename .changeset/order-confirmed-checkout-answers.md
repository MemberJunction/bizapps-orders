---
'@mj-biz-apps/orders-entities': patch
'@mj-biz-apps/orders-core-entities-server': minor
---

The `OrderConfirmed` outbound event carries the buyer's checkout answers as `CheckoutAnswers[]` (`QuestionKey`, `QuestionLabel`, `Answer`, `OtherText`), empty when the checkout asked nothing (#322). Confirming an order now writes the answers attached to it: the booking save skipped the order's related collections so it could price the lines first, and that skip also left the answers unwritten. The "Other" text of a select question is capped at the question's own `maxLength`, as the answer is.
