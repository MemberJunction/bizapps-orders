---
"@mj-biz-apps/orders-entities": minor
"@mj-biz-apps/orders-core-entities-server": minor
---

Self-serve checkout refuses another subscription purchase from a buyer who already holds a subscription their payment gateway bills (option E). When the draft sells a subscription product and the Person the e-mail resolves to holds an Active or Trialing subscription in the widget's company with `ProviderSubscriptionID` set, the draft and the payment-intent step refuse the purchase, whatever the plan, with the new refusal code `ProviderBilledSubscription`: Orders would extend or add a term the gateway knows nothing about while the gateway still charged at its own renewal. A purchase with no subscription product is not refused. The message is the new widget setting `providerBilledSubscriptionMessage` (a neutral default otherwise), with `{renewalDate}` replaced by the day the gateway next charges.
