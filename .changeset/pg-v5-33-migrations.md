---
'@mj-biz-apps/orders-entities': minor
---

The seventeen schema migrations in this release (V202610131500 through V202610131516) gain PostgreSQL counterparts: tables, columns, constraints, indexes, views, data and grants converted by `mj sql-convert`, and the order-total rollups, payment-schedule allocation, concession and order-line rollup triggers and the order-line guard written by hand in PL/pgSQL. CodeGen's CRUD procedures, timestamp triggers and hierarchy functions are not included; a PostgreSQL host generates them with `mj codegen`.
