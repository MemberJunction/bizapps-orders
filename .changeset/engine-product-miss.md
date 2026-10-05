---
"@mj-biz-apps/orders-entities": patch
"@mj-biz-apps/orders-core-entities-server": patch
---

An order line for a product written outside the API process after it started (a catalog loader, raw SQL, another replica) no longer fails with "CompanyID: Company cannot be null". `OrdersEngine.EnsureProducts` / `RequireProduct` reload the product catalog once on a cache miss; the company stamp, subscription term and service period, journal-entry and progress recognition lookups use them, and fail naming the product when it is still missing.
