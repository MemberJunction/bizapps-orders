---
"@mj-biz-apps/orders-entities": patch
---

`FindExistingHolding` and `FindUnansweredHeldLines` count every subscription that has not ended (Active, Trialing, Paused) as held, so the extend-or-new question is asked for a paused subscription too. The status set is exported as `EXISTING_HOLDING_STATUSES`.
