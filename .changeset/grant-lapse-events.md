---
'@mj-biz-apps/orders-core-entities-server': patch
---

Outbound consumers now hear when access ends by lapse (#857). The scheduled dispatch pass, on its quarter-hour sweep, records one `GrantStatusChanged` (`ToStatus` `Expired`, `Lapsed: true`) for each `Active` grant whose `ValidTo` passed in the last 7 days with nothing said about it since. The grant itself is not changed.
