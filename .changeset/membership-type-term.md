---
"@mj-biz-apps/orders-core-entities-server": patch
"@mj-biz-apps/orders-entities": patch
"@mj-biz-apps/orders-ng": patch
---

OrdersEngine now caches Products, Product Prices, Product Categories, Product Types, and Subscription Types (@RegisterForStartup). Confirm, pricing, checkout, fulfilment, and the catalog picker read those arrays instead of per-call RunView. GL Account Roles stay on AccountingEngineBase; booking no longer force-refreshes that cache. Confirm also inherits ProductType.DefaultSubscriptionTypeID when the product left SubscriptionTypeID blank. `@mj-biz-apps/accounting-engine-base` is a real dependency of orders-core-entities-server (static import, declared in package.json), not a peer. Local filter-eval helpers are PascalCase (`EvaluateFilter`, `IsCompositeFilter`, `ParseFilterField`).

