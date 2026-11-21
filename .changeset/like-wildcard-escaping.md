---
'@mj-biz-apps/orders-core-entities-server': patch
---

Escape LIKE wildcards (with an explicit ESCAPE clause) in the two dedupe/failure-count filters that match gateway-originated identifiers: a `%` or `_` in an invoice or gateway id could broaden the match, reporting a renewal as already booked or miscounting sync failures.
