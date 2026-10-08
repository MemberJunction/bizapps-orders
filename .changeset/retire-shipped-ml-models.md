---
"@mj-biz-apps/orders-entities": patch
---

The three ML models shipped in `metadata/ml-models` and their scoring bindings are retired with `deleteRecord`. They were trained on sample data and had no artifact file on any install. The training pipelines still ship; an install trains its own model from one. `scripts/rebuild-db.sh` now pushes the whole `metadata/` folder.
