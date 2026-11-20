---
'@mj-biz-apps/orders-core-entities-server': minor
'@mj-biz-apps/orders-entities': minor
---

A new sale's payment timing needs approval before confirm (golive #268): a delayed service start, an instalment due after the service starts, or payment terms other than due on receipt. The rep records a `Timing` concession, decided by the active `PaymentTiming` sales rule's role; with no such rule the check is off. New Orders setting `DelayedStartToleranceDays`; migration adds `OrderConcession.TimingFacts`, the `Timing` delivery form and the `PaymentTiming` rule type.
