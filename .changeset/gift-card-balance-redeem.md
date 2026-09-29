---
'@mj-biz-apps/orders-core-entities-server': patch
---

Spending a gift card now reduces its balance: capturing a gift-card payment passes the card to the stored-value driver, writes a Redeem StoredValueTransaction and lowers CurrentBalance in the payment's transaction (Depleted at zero). An overdraw is refused with nothing spent. Refunding it writes a Refund transaction and restores the balance. Closes #302.
