---
"@mj-biz-apps/orders-core-entities-server": minor
"@mj-biz-apps/orders-ng": minor
---

Checkout account step: a host can set or remove the verification wording. `CheckoutAccountResult` takes `VerificationNote` (text, or `null` for none) and `PasswordSetMessage` on a `Created` answer; the widget shows them in place of its default verification text, and keeps the default when a host gives none. The contract now lets a host allow sign-in before verification as its own choice, while still not linking the login to the matched Person until the e-mail is verified.
