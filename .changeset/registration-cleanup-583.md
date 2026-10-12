---
'@mj-biz-apps/orders-core-entities-server': patch
'@mj-biz-apps/orders-server': patch
'@mj-biz-apps/orders-ng': patch
---

The server bootstrap now calls `LoadProductPriceEntityServer()`, so the price-rule collision check survives tree-shaking like its neighbours (#583). `orders-ng` drops the unregistered PriceList, Promotion, Subscription and SubscriptionTerm form components and `BizAppsProductFormComponent` (none rendered as an entity's form), and the parked `transfer-pending/` workspace-tabs copy, which `@memberjunction/ng-ui-components` 6.1.5 now exports.
