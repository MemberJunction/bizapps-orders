---
'@mj-biz-apps/orders-core-entities-server': patch
---

Confirming an order no longer clears `OrderLine.SubscriptionID` or the term's service period on subscription lines (#631). Booking now stamps the journal entry and advances the running totals on the line copies it read and the subscription step saved, instead of the copies held in `this.Lines`, which predate the subscription step and wrote its columns back as NULL. The lines in `this.Lines` then take the booked values without being marked dirty. New integration check SB33 covers it.
