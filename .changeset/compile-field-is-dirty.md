---
"@mj-biz-apps/orders-entities": patch
"@mj-biz-apps/orders-ng": patch
---

Compile against published `@memberjunction/core` without `BaseEntity.FieldIsDirty` (MJ 4219 is not released yet). Callers use a helper that prefers the core method when present and otherwise reads `GetFieldByName().Dirty`. Unused `Products$` / `ProductPrices$` getters are removed so declaration emit does not require a direct rxjs import.
