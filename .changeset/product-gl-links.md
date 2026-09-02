---
'@mj-biz-apps/orders-ng': patch
---

Product GL account links widget (#113).

Products carried no revenue GL account, so every order line booked through the company
default and nothing could be attributed per product. The Product form's accounting tab now
embeds `product-gl-links`, which reads and writes the product's `GLAccountLink` rows by role,
so a product can name its own revenue (and contra) accounts. The existing
`product-accounting-widget` hands off to it rather than restating the same fields.

Patch, not minor: this is Angular code only — no migration. A minor here would claim a schema
change this release does not carry.

NOT in this release: the `DefaultInView` / orders-working-view work merged in #128 is
metadata-only (`metadata/entity-fields/.default-in-view.json`,
`metadata/user-views/.orders-working-view.json`). `metadata/` reaches a host ONLY through a
`*__Metadata_Sync.sql` migration, and this repo has none — so those rows ship to nobody until
the build engineer generates one. See docs/database-migrations.md, "Metadata reaches a host
only as a migration".
