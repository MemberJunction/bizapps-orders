---
'@mj-biz-apps/orders-entities': patch
'@mj-biz-apps/orders-core-entities-server': patch
'@mj-biz-apps/orders-ng': patch
---

SQL literals now route through the sanctioned escaping helpers instead of inline `.replace(/'/g, "''")`. `EscapeText` delegates to MJ's `EscapeSQLString`, so every call site gains null-byte stripping; caller-supplied ids (`FromPersonID`, charge-type ids) are validated with `RequireUUID`/`RequireUUIDs` rather than escaped; the order-list search fragment also neutralizes SQL Server `LIKE` metacharacters (`[`, `%`, `_`); and the decomposition ladder renders a row's `Why` provenance as plain text instead of `[innerHTML]`. The pricing source-guard test now polices the whole `orders-entities` package, not just `pricing/`. No behavior change for well-formed input.
