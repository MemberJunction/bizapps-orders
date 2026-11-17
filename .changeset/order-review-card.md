---
"@mj-biz-apps/orders-ng": patch
---

The Orders home shows an "Orders awaiting review" card: the Order Review tasks assigned to the signed-in user or to a role they hold, through the Tasks approval inbox, so finance can review and decide them without opening the Tasks app (bc-aidp-next-golive#442). orders-ng now declares `@mj-biz-apps/tasks-ng` as a peer (`^1.13.0`, the release with role-assigned tasks), and the app manifest requires bizapps-tasks 1.13.0 or later.
