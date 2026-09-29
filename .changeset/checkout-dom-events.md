---
'@mj-biz-apps/orders-ng': patch
---

`<mj-orders-checkout>` dispatches bubbling, composed DOM events for the host page: `checkout-state-change` `{ state }` (`LOADING`, `CHECKOUT`, `PROCESSING`, `SUCCESS`, `ERROR`), `checkout-complete` `{ sessionId, productName, productId, amount, currency, coupon }` (amount in major units, currency upper-case, dispatched before any redirect), and `checkout-error` `{ message }`. No detail carries personal data.
