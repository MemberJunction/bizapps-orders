---
"@mj-biz-apps/orders-entities": minor
"@mj-biz-apps/orders-core-entities-server": minor
"@mj-biz-apps/orders-server": minor
"@mj-biz-apps/orders-ng": minor
---

Checkout widgets can ask the buyer questions before payment (#322). `CheckoutWidgetConfiguration.questions` defines `select` or `text` questions, with `required` and an `otherOptionKey` whose choice requires a free-text answer. The widget renders them and keeps Pay disabled until required ones are answered. `/draft` stores the answers; `/payment-intent` and `/complete` refuse a missing required answer, before any intent opens or Person is created. The confirmed order records each answer as an Order Checkout Answer, saved in the booking transaction through the new `OrderHeader.CheckoutAnswers` collection. The check is shared: `CheckCheckoutAnswers` in `@mj-biz-apps/orders-entities`.
