---
'@mj-biz-apps/orders-core-entities-server': patch
'@mj-biz-apps/orders-server': patch
'@mj-biz-apps/orders-ng': patch
---

Checkout can run a host's account step after payment. A host registers a `CheckoutAccountStep` subclass; after `/complete` confirms the order, Orders calls `EnsureAccount` and returns `Account: { Outcome, Message?, CanSetPassword }` with the completion (`Created`, `Exists` or `Failed`). For `Created` the public checkout shows a password form, and `POST /checkout/account/password` passes the password to the host's `SetPassword` — once, only for the account this checkout created, never stored or logged. `POST /checkout/account` returns the recorded outcome and asks the host again only after a failure. With no step registered, checkout behaves as before.
