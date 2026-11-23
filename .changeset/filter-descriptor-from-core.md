---
'@mj-biz-apps/orders-ng': patch
---

The product pricing widget imports `CompositeFilterDescriptor` from `@memberjunction/core`, where MJ has always defined it. MJ `next` no longer re-exports it from `@memberjunction/ng-filter-builder`, so the old import did not compile against MJ `next`.
