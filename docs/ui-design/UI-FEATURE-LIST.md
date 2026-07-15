# UI-FEATURE-LIST — bizapps-orders

> Derived view over `plans/FEATURE-LIST.md` (same IDs — never its own numbering). Convention:
> `~/MJDev/shared-plans/ui-design-system.md` §2. Statuses:
> `Not started → Mockups-in-review → Mockup-selected → In build → Implemented` · `N/A — no UI`.
> `Implemented` requires DUAL-LAYER validation (GUI presence+behavior per TEST-PROTOCOL), cited.
>
> Baseline surface note: every entity has **generated MJ entity forms** (CRUD) — that default surface
> is not tracked per-row; rows track deliberate UI beyond it. The active
> `action-plans/ActionPlan - UI layout and workflows (orders).md` (§1–§8) predates this file and acts
> as the current cycle's selected design; ◇ = status claimed from working tree / plans, pending the
> Task 65b feature-wave sign-off review.
> The 2026-07-15 gap analysis is folded INTO the UI action plan (labeled "added 2026-07-15" §s/bullets);
> "UI plan §x" refs below are that plan.

| ID | Feature | UI status | Surface | Mockup | Action plan |
|---|---|---|---|---|---|
| A.1–A.6 | Catalog (types, products, categories, bundles) | In build ◇ | ProductCatalog + ProductCategoryTree dashboards + generated forms | — | UI plan §6 |
| A.7–A.10 | Behavior seam / ASC-606 / variants / metered | N/A — no UI (deferred features) | — | — | — |
| B.1 | Pricing tables admin | Not started | Pricing admin screen (PriceList/ProductPrice/PriceTier) | — | UI plan §10 |
| B.2 | Price resolution in order entry (suggested price + source badge) | Not started | Compose Order line editor | — | UI plan §1 (F9-gated) |
| B.3 | Coupon entry + redemption display | Not started (S7 gated) | Compose Order / checkout | — | Coupons plan (UI section) |
| C.1–C.5 | Compose/edit Order (full field set, lines grid, totals strip, status stepper w/ skip) | In build ◇ | OrdersConsole dashboard | — | UI plan §1 |
| C.6 | Backdating (OrderDate entry) | In build ◇ | Compose Order | — | UI plan §1 |
| C.7–C.8 | Fulfillment auto-advance display + fulfillment queue | Not started (C.8 deferred) | Fulfillment queue screen | — | UI plan §7 |
| C.9 | Order History + moving-window filter presets | Implemented ◇ (shipped per MOD-9c; validation cite pending 65b) | OrderHistory dashboard | — | UI plan §3 |
| C.10–C.11 | ExternalDocumentNumber + service period fields | In build ◇ | Compose Order / generated forms | — | UI plan §1 |
| D.1–D.3 | Order-as-invoice A/R display (balance, due date, overdue chip) | In build ◇ | OrdersConsole + OrdersManagement | — | UI plan §1/§2 |
| D.4–D.5 | Credit memo creation + settlement flows (reversal · refund · apply-credit) | Not started | reversal flow + shared application panel | — | UI plan §1/§4 |
| D.6–D.7 | Statements / rendered bill delivery | N/A — no UI yet (deferred features) | — | — | — |
| E.1–E.7 | JE booking visibility (booked-JE links from order) | Not started | cross-app navigation | — | UI plan §8 |
| F.1–F.3 | Payment entry (manual) + application to orders | Not started ◇ (plan §4 with S2/F3) | Payments UI | — | UI plan §4 |
| F.4 | Stripe checkout (LXP subset) — PaymentIntent status + retry surfaces | Not started | payment rows + order Payments tab | — | UI plan §4 · F3.5b |
| F.7 | Payment application UI (+ auto-apply suggestion later) | Not started | Payments UI | — | UI plan §4 |
| F.9 | Payment-method vault management (masked list, default, remove; add = hosted tokenization) | Not started (add gated on F.4) | Customer A/R view + payment entry | — | UI plan §4/§5 |
| F.10 | Webhook receiver | N/A — no UI | — | — | — |
| F.11–F.13 | Gift card / providers / disputes | N/A — no UI (deferred features) | — | — | — |
| G.1–G.4 | Subscription + rev-rec schedule visibility | Not started | Subscriptions list + shared waterfall viewer | — | UI plan §11 |
| G.7–G.8 | Overdue worklist + dunning grace display | Not started | Customer A/R view | — | UI plan §5 |
| H.1–H.4 | Sales rules admin + rule editor + approval flow surfacing | Not started | rule admin grid + form-based editor + shared inbox + stepper state | — | UI plan §9 |
| I.1 | Entitlement grants visibility | Not started | grants grid (customer/product presets) | — | UI plan §12 |
| J.1 | Multi-company order display (per-line company) | In build ◇ | Compose Order lines grid | — | UI plan §1 |
| K–L | Tax / FX | N/A — no UI (gated/deferred) | — | — | — |
| M.1 | Role-gated UI (fulfiller queue gating etc.) | Not started (A2/Q22 gated) | cross-cutting | — | — |
| N.1 | LXP checkout integration surface | Not started | LXP-side (consumes our API) | — | LXP plan |
| O.1–O.2 | Engine architecture | N/A — no UI | — | — | — |
