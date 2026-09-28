---
"@mj-biz-apps/orders-entities": minor
"@mj-biz-apps/orders-core-entities-server": minor
"@mj-biz-apps/orders-server": minor
"@mj-biz-apps/orders-ng": minor
---

Paid checkouts now record each post-payment step (Confirm, Capture) in `CheckoutSessionStep`: every attempt, its source (checkout, webhook or replay), and how it ended. A shared view, "Checkouts: Needs Review", lists failed steps and steps left running for more than 15 minutes. `Orders.ReplayCheckoutStep` lets a holder of `MJ.BizApps.Orders.Checkout.Replay` (the new Checkout Operator role) re-drive a failed Capture through the same idempotent CapturePayment. Replaying a succeeded step does nothing, and Confirm is not replayable. The terminal-capture Task is now raised once per terminal failure instead of once per replay. Adds the generated CheckoutSessionStep entity class, GraphQL type and form.
