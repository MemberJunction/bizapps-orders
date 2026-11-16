---
"@mj-biz-apps/orders-core-entities-server": minor
"@mj-biz-apps/orders-entities": minor
"@mj-biz-apps/orders-ng": minor
---

A subscription's deferred revenue shows what a return or cancellation took back, and the cancel screen offers the refund choice (golive #474, golive #384).

- **Deferred Revenue nets reversals.** The subscription's schedule now also loads the entries of order lines that reverse its terms (a return, or a cancellation's reversal). A month they take back in full is left out with them, and a note says how many months were reversed; the journal grid lists both sides. A canceled term is labelled "(canceled)". A month only partly taken back still shows at its full amount until the accounting waterfall can read a reversal as negative.
- **The cancel screen offers what is given back.** `Orders.CancelSubscription`'s remote contract carries the `Refund` choice (`Full` or `ProrateUnused`; absent, the type decides). The screen starts on `Full` for a term that has not started and whose order has received no money, so cancelling it takes back the amount still owed and the revenue still scheduled and refunds nothing; any other term starts on the type's rule.
- **The preview says what happens to revenue.** The cancellation explanations now say whether deferred revenue stays scheduled or is taken back, not only whether money is refunded, and the preview row is "Reversed" rather than "Refund".
