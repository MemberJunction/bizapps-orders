---
"@mj-biz-apps/orders-entities": patch
"@mj-biz-apps/orders-ng": patch
---

`FindExistingHolding` and `FindUnansweredHeldLines` count every subscription that has not ended (Active, Trialing, Paused) as held, so the extend-or-new question is asked for a paused subscription too. The status set is exported as `EXISTING_HOLDING_STATUSES`.

The order screen's "extend" choice now says what confirm will do: a next term for an active holding, or the subscription type's reactivation rule (reactivate, or a separate subscription) for a paused one. `ExtendOutcomeFor` and `ExtendChoiceTextFor` give the same wording to other screens.
