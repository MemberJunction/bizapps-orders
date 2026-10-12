---
"@mj-biz-apps/orders-entities": patch
---

The three scoring record processes in `metadata/record-processes` are retired with `deleteRecord`. Each scored with one of the ML models already retired, and no release seed carried them. `scripts/check-release-seed-coverage.mjs` no longer counts a retired record that no migration ever created, since no host has it.
