---
"@mj-biz-apps/orders-core-entities-server": patch
---

A checkout whose payment succeeded but whose browser never sent the final complete call (the tab closed, the page dropped) is now completed by the signed `payment_intent.succeeded` webhook, through the same path the browser uses. A refusal on that path, or a paid session that expires uncompleted, raises the "Checkout payment settled with no order" Task. A complete call that finds the webhook completing the session waits for it and returns the same order.
