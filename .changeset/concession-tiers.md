---
"@mj-biz-apps/orders-entities": minor
"@mj-biz-apps/orders-core-entities-server": minor
---

Concession approval tiers (#308). Several active ConcessionLimit rules are approval tiers: a concession goes to the highest-ranked one (`ConcessionTier`, NULL as 0) whose thresholds it meets (`MinConcessionValue`, `MinConcessionPctOfContract`, `MinTermExtensionDays`; any one set threshold, at or above), and only that tier's role decides it; `OrderConcession.SalesRuleID` names the tier. A rule with no thresholds takes every concession, so a single untiered rule behaves as before. A tier with `RequiresDecisionWithinAuthority` holds a concession routed to it Pending even when the requester's SalesAuthority covers it (recording that authority too), and the requester cannot decide it even holding the role. Two met tiers of one rank refuse the concession with a message naming them. `orders-entities` exports `PickConcessionTier` and `ConcessionTierMet`; `orders-core-entities-server` replaces `FindConcessionLimitRule` with `LoadConcessionTiers` and `FindConcessionTier`.
