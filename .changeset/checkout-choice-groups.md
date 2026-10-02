---
'@mj-biz-apps/orders-entities': patch
'@mj-biz-apps/orders-core-entities-server': patch
'@mj-biz-apps/orders-server': patch
'@mj-biz-apps/orders-ng': patch
---

Checkout widgets can offer choice groups ("choose N of M") in `Configuration.choiceGroups`: options, `min` and `max`. The widget renders them as checkboxes and keeps Pay disabled until each group has its minimum. `/draft` accepts `choices`. The payment intent and completion refuse picks outside `min`..`max` or options not in the list. `CompleteCheckout` records each pick on the order line as an Order Line Choice before `Confirm()`. A Product Entitlement with `ChoiceGroupKey` / `ChoiceOptionValue` set is granted only on a line carrying that pick, and `Orders.SpawnRenewals` copies the picks onto the renewal line so those entitlements renew. The shared check is `CheckCheckoutChoices` (`checkout-choices.ts`).
