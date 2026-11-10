---
"@mj-biz-apps/orders-ng": patch
---

Products, Price Lists, Subscriptions and Subscription Terms forms keep the side-rail items they had before MJ 6.2. MJ 6.2 files every panel mounted at a field slot, and every panel that replaces a generated field section, inside the Details rail item. Promotions, Accounting, Fulfillment, Subscriptions, Volume simulator and both Deferred Revenue panels now mount after related, so each stays its own rail item after Details. The Products header claims the generated sections Accounting and Subscriptions draw, and the Details panel claims `catalogLifecycle` itself, which retires the render-nothing lifecycle claim panel.
