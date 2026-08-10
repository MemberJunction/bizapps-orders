---
'@mj-biz-apps/orders-entities': patch
'@mj-biz-apps/orders-core-entities-server': patch
'@mj-biz-apps/orders-ng': patch
---

Read date cells through `ToISODate` instead of `String(cell).slice(0, 10)`, which yields
`'Thu Jul 30'` for a `Date` and compares as less than nothing. Fixes two all-zero dashboard charts,
a year column reading `'Mon '`, and an expired tax-exemption certificate that never warned.
