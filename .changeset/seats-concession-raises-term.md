---
'@mj-biz-apps/orders-core-entities-server': patch
---

An approved Seats concession adds its seats to the subscription term (#686). Before, it recorded the added quantity and its value, but `SubscriptionTerm.Quantity` kept the seats bought, so grants and renewals ignored the added seats.

- Approved on a booked term, the term's seat count rises in the approval's transaction and the term's `PerUnit` entitlement grants are resized to it. The renewal, which buys the expiring term's seats, bills them at the full price.
- Approved on a draft order's line, confirm counts the line's approved Seats concessions with the seats bought when it creates the term.
- Recording one is refused when the term is not Scheduled or Active, or when its renewal is already placed (the renewal was priced from the old count), and when it adds a fractional number of seats.
- A Seats concession on a line that bought no term is recorded and valued as before.
