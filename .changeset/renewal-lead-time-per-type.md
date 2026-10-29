---
"@mj-biz-apps/orders-integration-tests": patch
---

Two renewal checks for lead times other than 90 days: a lead time changed on the subscription type is the one the renewal job uses, with a subscription's own lead days still overriding it, and a subscription moved to another type renews on that type's lead time.
