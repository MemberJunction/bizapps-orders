---
"@mj-biz-apps/orders-entities": minor
---

Optimize OrdersEngine with deferred browser startup and O(1) Map-indexed lookups:
- Defer browser startup via `@RegisterForStartup({ deferred: typeof window !== 'undefined' })` so client cold-start is not blocked on catalog loading.
- Add lazy O(1) Map indexes for all 11 catalog and lookup collections (PaymentTypes, PaymentProviderTypes, PaymentTermsTypes, ChargeTypes, ProductTypes, SubscriptionTypes, RevenueRecognitionTypes, Products, EventProducts, ProductPrices, ProductCategories).
- Invalidate indexes via `NotifyDataChange` invalidation generation checks, array reference comparison, and length tracking.
- Pre-sort base product prices and return defensive copies to prevent cache mutation.
- Deduplicate prices in `ProductPricesFor` and optimize `CategoryChain` to O(depth) ancestor traversal.
- Ensure lazy per-collection error propagation for permission-constrained datasets.
