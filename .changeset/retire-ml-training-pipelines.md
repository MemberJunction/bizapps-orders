---
"@mj-biz-apps/orders-entities": patch
---

The nine training pipelines in `metadata/ml-training-pipelines` are retired with `deleteRecord`. Each selects feature and target columns that no shipped schema has, and no release seed carried them. The developer scripts that trained and scored the LTV models from them, and wrote their output back into `metadata/`, are removed. `scripts/check-release-seed-coverage.mjs` now passes.
