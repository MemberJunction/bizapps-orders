---
"@mj-biz-apps/orders-ng": patch
---

One Order Header form for new and existing records.

`BizAppsOrderHeaderFormComponent` extends the generated form and wins
ClassFactory for `MJ_BizApps_Orders: Order Headers`. Bill-to / ship-to
summaries, context tabs (payment, charges, accounting, subscriptions),
and always-visible lines use MJ collapsible panels (UserInfoEngine via
FormStateService) and entity-viewer lists for related records. The Orders
dashboard/list open a record through NavigationService.OpenEntityRecord.
