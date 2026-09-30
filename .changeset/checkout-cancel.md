---
'@mj-biz-apps/orders-ng': patch
---

Cancel on the public checkout resets the form (every field, the error banner and the card entry) and dispatches bubbling, composed `checkout-cancel` and `checkout-close` DOM events, so a host page that opens the checkout in a modal can close it. Cancel is ignored while a payment is in flight.
