---
"@mj-biz-apps/orders-ng": patch
---

The Orders home shows the Order Review tasks waiting on the signed-in user, through the Tasks approval inbox, so finance can review and decide them without opening the Tasks app (bc-aidp-next-golive#442). orders-ng now declares `@mj-biz-apps/tasks-ng` as a peer (`^1.8.0`).
