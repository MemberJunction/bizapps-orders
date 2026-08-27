# Plans

This folder is no longer the source of truth for how Orders works.

| File | Role |
|---|---|
| [`../docs/HOW_THE_SYSTEM_WORKS.md`](../docs/HOW_THE_SYSTEM_WORKS.md) | How the system actually works today |
| [`entitlement-read-contract.md`](entitlement-read-contract.md) | **Shipped (an-dev-13):** LXP ask/answer — `Orders.CheckEntitlement` / `Orders.ListEntitlements`. Supersedes D27's poll as the source of truth. |
| [`checkout-url-and-openapp-server-extensions.md`](checkout-url-and-openapp-server-extensions.md) | Shipped: public `GET /checkout/:slug` + MJ auto-load of Open App `serverExtensions` (#115/#116; follow-up #117) |
| [`orders-plan-gap-report.html`](orders-plan-gap-report.html) | Snapshot of plan-vs-shipped as of 2026-08-15 |
| [`archive/`](archive/) | Historical design docs (D1–D84, UX thesis, pricing, subscriptions, ITs). Decisions still cited as D-numbers live there; the running system is documented in `docs/`. |

Do not add new "what we will build" plans here unless they describe work that has not started. If the system changed, update `docs/HOW_THE_SYSTEM_WORKS.md`.
