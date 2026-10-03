---
'@mj-biz-apps/orders-ng': patch
'@mj-biz-apps/orders-core-entities-server': patch
---

Checkout account step: every `Created` account now gets the verification wording (#395). After the buyer sets a password the widget tells them to verify the e-mail before signing in, instead of saying they can sign in straight away when the host left out `VerificationRequired`. `/checkout/account` reports `VerificationRequired: true` for every `Created` account. `CheckoutAccountResult.VerificationRequired` is deprecated and ignored; hosts need not set it.
