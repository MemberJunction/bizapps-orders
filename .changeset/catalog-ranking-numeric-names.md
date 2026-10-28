---
'@mj-biz-apps/orders-ng': minor
---

The add-product picker orders numbers in product names by value, so revenue bands list as $1M-$2M, $2M-$5M, $10M-$15M instead of putting $10M first. `RankCatalogMatches` now accepts any row with `Name`, `SKU` and `CompanyID` (the new `RankableProduct`) and returns the same row type, so another app's picker can rank its own rows.
