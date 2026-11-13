---
"@mj-biz-apps/orders-entities": patch
"@mj-biz-apps/orders-core-entities-server": patch
"@mj-biz-apps/orders-ng": patch
---

A renewal takes its annual increase when the expiring term is not the first term its order line bought (golive #478). The anniversary test now measures from the start of the earliest term that line bought, where its price began, instead of from the expiring term's start. A 13-month line booked as a year and a remainder, or an annual line with a one-day last term, used to renew flat because the last term already started on the anniversary. A line that bought one term renews as before: annual on every renewal, quarterly and monthly once a year.
