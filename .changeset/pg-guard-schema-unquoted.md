---
'@mj-biz-apps/orders-entities': minor
---

The PostgreSQL counterpart of the guard-trigger migration (`V202610091200`) now runs. It quoted the `${flyway:defaultSchema}` placeholder, which on PostgreSQL resolves to the mixed-case `__mj_BizAppsOrders`; quoted, that names a different schema from the lowercase one the orders tables live in, so the migration failed with `relation "__mj_BizAppsOrders.OrderHeader" does not exist`. The placeholder is now unquoted. No SQL Server change.
