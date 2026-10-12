---
"@mj-biz-apps/orders-ng": patch
---

The Order Header form shows `IPCountry` and `CardIssuingCountry` under Billing and Shipping. `metadata/entity-fields` now carries the display names and System Metadata section for the four bill-to/ship-to latitude and longitude fields, and sections for `IPCountry`, `CardIssuingCountry`, `SourceCheckoutWidget` and `ConfirmedByUser`, so CodeGen on a database built from migrations reproduces the committed Order Header code and form (#491).
