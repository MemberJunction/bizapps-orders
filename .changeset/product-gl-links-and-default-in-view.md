---
'@mj-biz-apps/orders-ng': minor
---

Product GL account links widget, and `DefaultInView` metadata for the orders working view.

**Product GL links (#113).** Products carried no revenue GL account, so every order line
booked through the company default and nothing could be attributed per product. The
Product form's accounting tab now embeds `product-gl-links`, which reads and writes the
product's `GLAccountLink` rows by role, so a product can name its own revenue (and contra)
accounts. The existing `product-accounting-widget` hands off to it rather than restating
the same fields.

**Named-view defaults.** `metadata/entity-fields/.default-in-view.json` marks the fields an
orders grid should show without a saved user view, and `metadata/user-views/.orders-working-view.json`
seeds the shared working view. Both are metadata seeds — no schema change, no migration.

Minor rather than patch: the GL links widget is new user-visible capability.
