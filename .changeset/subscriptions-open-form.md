---
"@mj-biz-apps/orders-ng": patch
---

Receivables → Subscriptions opens a subscription's form (#932). Double-clicking a row, or pressing the new
**Open** button in the side panel, now opens the Subscription form, where **Cancel subscription** is.
Before, double-click only filled the side panel, the page had no output for the section to route, and the
form (and so Cancel) could not be reached from the app. New `SubscriptionOpened` output, wired in the
section shell beside `OrderOpened` / `PaymentOpened` / `ProductOpened`.
