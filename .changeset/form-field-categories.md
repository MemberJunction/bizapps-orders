---
'@mj-biz-apps/orders-ng': patch
---

Orders entity forms no longer put fields in the generic Details panel (#276). CodeGen's AI layout pass fills a blank field category only when it sees a new entity or field, so fields added later landed in Details. They now get a section in `metadata/entity-fields`, with `GeneratedFormSection` set to `Category` (the existing renewal-pricing and concession-limit entries lacked it, so those fields stayed in Details too), and the forms are regenerated. CI fails a PR whose generated forms put fields in Details.
