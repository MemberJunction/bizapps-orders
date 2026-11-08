# Plans

This folder is no longer the source of truth for how Orders works. `docs/` describes the system as built ([index](../docs/README.md)).

| File | Role |
|---|---|
| [`../docs/HOW_THE_SYSTEM_WORKS.md`](../docs/HOW_THE_SYSTEM_WORKS.md) | How the system actually works today |
| [`entitlement-read-contract.md`](entitlement-read-contract.md) | **Shipped 2026-08-27:** the design that `Orders.CheckEntitlement` / `Orders.ListEntitlements` implement, which supersedes D27's poll. `ViaOrganizationID`, `Orders.ListBeneficiaries` and team inheritance were not built. It stays here rather than in `archive/` because source files and a released migration cite this path. |
| [`provider-subscription-sync.md`](provider-subscription-sync.md) | **In review:** hearing the gateway that bills a subscription and booking its renewals (option E, E3 + E4 + E6). Move to `archive/` when it ships. |
| [`product-options-and-variants.md`](product-options-and-variants.md) | **Not started, post go-live:** product options (Tier, Size) on one product, inherited from product type through the category tree to the product, driving price, entitlements and reporting; plus the variant-SKU schema, refused on save until its wiring and inventory are planned. |
| [`archive/`](archive/) | History, not a description of the running system: the master plan and its decision log, design plans whose work shipped (each opens with a status line saying how much), the UX plan and its header/Overview mockup inventory (`orders-headers-overview/`, no status line), sequencing notes, and the 2026-08-15 plan-vs-shipped report. |

**Do not delete the decision log.** [`archive/bizapps-orders-master.md`](archive/bizapps-orders-master.md) §3 records decisions up to D84, and code, tests and migrations cite those D-numbers and some of the plan's sections, such as §21b. Code also cites decisions numbered above D84; those are not in this log.

Add a plan here only while its work has not started. When it ships, move it to `archive/` with a status line saying what shipped and where, and update `docs/HOW_THE_SYSTEM_WORKS.md`.
