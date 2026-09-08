---
"@mj-biz-apps/orders-ng": patch
---

Import `CreateEmptyFilter` under its current name so `orders-ng` compiles against MJ `next`.

MJ renamed the export from `createEmptyFilter` to `CreateEmptyFilter` in `dd4432ea07` (the
`CompositeFilter` class refactor). `product-pricing-widget.component.ts` still asked for the old
lowercase name, so `ngc` failed with `TS2724: '"@memberjunction/ng-filter-builder"' has no exported
member named 'createEmptyFilter'` and the package could not be built against a current MJ.

Nothing about the call changes; `CreateEmptyFilter()` is the same function under the name it now
ships with. This is the only place in the repo that referenced the old name.
