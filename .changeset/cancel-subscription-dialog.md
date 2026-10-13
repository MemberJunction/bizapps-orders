---
"@mj-biz-apps/orders-ng": patch
---

The subscription form has a Cancel subscription control (#702). The person cancelling keeps the subscription type's own rule (the default, which sends no timing) or overrides it with end of term or immediately, adds a reason, previews what `Orders.CancelSubscription` would do (coverage end, access end, refund, later terms), and then confirms; changing the choice discards the preview. It is offered to a viewer who may update subscriptions, on an Active, Trialing or Paused subscription.
