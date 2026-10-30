---
"@mj-biz-apps/orders-core-entities-server": patch
"@mj-biz-apps/orders-integration-tests": patch
---

The gateway subscription sync no longer reports a false difference for an imported subscriber in its first year. Their current gateway invoice is the creation invoice (`subscription_create`), and the importer's term-1 payment already records its charge, yet the planner reported "charged … at creation" for each one (372 of 509 in a full-size import rehearsal), so a nightly preview could never show 0 differences. `PlanProviderSubscriptionSync` now checks whether an Orders payment records the invoice's charge before classifying any paid invoice that is not a renewal: a recorded charge is in line. A creation charge that no payment records (the gateway charging on top of checkout) is still reported, and a proration or one-off invoice whose charge someone booked by hand no longer raises its Task. Nothing is booked differently.
