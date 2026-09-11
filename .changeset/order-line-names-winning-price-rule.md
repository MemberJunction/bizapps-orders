---
"@mj-biz-apps/orders-core-entities-server": patch
"@mj-biz-apps/orders-ng": patch
---

Name the price rule that actually won on the order line instead of labelling every resolved price "base price". The winning rule's name already reached the browser as the resolution walk's `Base`/`Rule` component label and was being discarded, so a line priced off a member list read as base-priced. Also fixes both component mappers, which read a field named `Kind` where the resolver emits `ComponentType`, and names the rule (with a currency symbol) in the override picker's `Default` row.
