---
"@mj-biz-apps/orders-ng": patch
---

Catalog: the New button opens a New product dialog instead of a blank form. Step 1 saves the product as Draft with a base price (default 0) in one save; step 2 shows the GL accounts it inherits, lets the user link any that are missing, and activates it after the same readiness check the product header runs. The readiness check moved into a shared `CheckProductReadiness`.
