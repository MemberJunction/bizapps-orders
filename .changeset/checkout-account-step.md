---
'@mj-biz-apps/orders-core-entities-server': patch
'@mj-biz-apps/orders-server': patch
'@mj-biz-apps/orders-ng': patch
---

Checkout can run a host's account step after payment. A host registers a `CheckoutAccountStep` subclass. `/complete` confirms the order without waiting on the host and answers `AccountStep: true`; the widget then calls `POST /checkout/account`, which calls the host's `EnsureAccount` (limited to `HostTimeoutSeconds`, default 10) and returns `Account: { Outcome, Message?, CanSetPassword, VerificationRequired }` (`Created`, `Exists` or `Failed`). For `Created` the public checkout shows a password form, and `POST /checkout/account/password` passes the password to the host's `SetPassword` — once, only for the account this checkout created, within `PasswordWindowMinutes` (default 5), never stored or logged. `Failed` offers "Try again". A host answers `NotApplicable` for a checkout it makes no logins for, which then has no account step. The seam requires the host to keep a created account unable to sign in, and unlinked from the Person, until the e-mail is verified. With no step registered, checkout behaves as before.
