---
"@mj-biz-apps/orders-core-entities-server": patch
---

Buying again after a subscription was cancelled immediately now starts the new term on the purchase's own date (golive #384). A cancelled subscription whose coverage still runs is continued from the day that coverage ends, and coverage was measured by the latest term's end date, which an immediate cancellation leaves unchanged. The rest of the cancelled term therefore counted as coverage, and the new term was placed after it, a year late on an annual term. Coverage is now measured by the day the cancelled subscription's access ended when that is before the term's end. A subscription cancelled at the end of its term is continued as before.
