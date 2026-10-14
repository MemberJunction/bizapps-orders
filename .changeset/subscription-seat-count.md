---
'@mj-biz-apps/orders-core-entities-server': patch
'@mj-biz-apps/orders-ng': patch
---

A subscription bought at quantity N records N seats on its term (#589). Confirm writes the quantity as entered onto `SubscriptionTerm.Quantity`, before proration scales the line's quantity to price a short first period. Entitlement grants and renewals read the term's seats, so 10 seats bought over a half-length first period now grant and renew 10, not 5. A fractional quantity is refused. The subscription's term cards show the seat count.
