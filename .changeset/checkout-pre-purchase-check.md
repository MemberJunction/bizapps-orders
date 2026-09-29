---
'@mj-biz-apps/orders-core-entities-server': patch
'@mj-biz-apps/orders-ng': patch
---

Self-serve checkout refuses a purchase the buyer already has (#323). The draft step refuses when the resolved Person holds an Active or Trialing subscription to a product on the draft, and a host can refuse for its own reasons by registering a `CheckoutPrePurchaseCheck` subclass. The payment-intent step runs both checks again. The draft now resolves the Person again when the buyer changes their e-mail. `<mj-orders-checkout>` shows the refusal and, when the reason is an existing subscription, dispatches a `checkout-already-subscribed` DOM event whose detail carries product ids and no personal data.
