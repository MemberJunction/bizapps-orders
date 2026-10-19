---
"@mj-biz-apps/orders-ng": minor
---

Checkout: a verified member sees their discount before pressing Pay (#919). With a `member-token` on `<mj-orders-checkout>`, once the e-mail is valid and the billing location is complete, the element drafts the form in the background (debounced 400 ms, again when the e-mail, location or quantity changes, stale answers dropped) with the token and no typed code. When the draft reports `MemberDiscountApplied`, the widget shows "<code> member discount: −<amount>", the total and the Pay button show the server's total, and the promo-code box is hidden, so one press of Pay charges it. A token that earns nothing keeps the full price and the notice at Pay, as before; without a token nothing is sent early. When the host also sets `email`, the e-mail field is read-only while the token is attached. The widget gains the `memberDiscount` and `lockEmail` inputs and the `quoteRequested` output.
