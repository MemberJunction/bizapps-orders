---
'@mj-biz-apps/orders-entities': patch
---

`@mj-biz-apps/orders-entities` exports `ResolveLinePriceStandings(lines, provider, user)`, which resolves several order lines' price standing at once. It reads each order's header and parties once and answers each line as `ResolveLinePriceStanding` would alone, so a screen listing every discounted line of an order no longer repeats those reads per line (#1009).
