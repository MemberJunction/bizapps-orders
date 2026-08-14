---
"@mj-biz-apps/orders-entities": patch
"@mj-biz-apps/orders-core-entities-server": patch
---

Confirm-after-draft loads Lines and writes them before Status flips.

A GraphQL form save reloads the header only. Changing Status to Confirmed then
walked an empty collection, created no membership term, and EvenOverTime
refused. Existing draft lines were then UPDATEd after the header was already
Confirmed, so trigger 51003 rolled back inside INSERT-EXEC.

`OrderHeaderEntity.EnsureLinesLoaded` is the shared read. The server persists
prorated line money while the header is still Draft, then flips Status.
