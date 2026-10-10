---
"@mj-biz-apps/orders-entities": minor
"@mj-biz-apps/orders-ng": minor
"@mj-biz-apps/orders-server": minor
---

Schema for concession approval tiers (#308). `SalesRule` gains, for ConcessionLimit rules only: `ConcessionTier` (rank), the thresholds `MinConcessionValue`, `MinConcessionPctOfContract` and `MinTermExtensionDays`, and `RequiresDecisionWithinAuthority` (bit, default 0). A CHECK keeps them empty on other rule types. Existing rules keep no tier, no thresholds and no sign-off. Schema only; the behaviour ships separately.
