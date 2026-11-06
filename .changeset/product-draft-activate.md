---
'@mj-biz-apps/orders-ng': patch
---

A Draft product now shows a banner in its header, "Draft — not sellable on deals or orders", with an Activate button. Activate first checks for a price in force today and for Sales and Deferred Revenue GL accounts, lists anything missing, and lets the user activate anyway or cancel. The Status field moved out of Fulfillment into a new Lifecycle section with Available From and Available To.
