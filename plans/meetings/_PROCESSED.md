# Meetings — processed index (orders)

Tracks which meeting recordings in this folder have been read + distilled into decision docs. When you process a
new meeting, add a row (newest first) and prepend a `> ✅ PROCESSED` banner to the recording file itself.

| Meeting recording | Date | Status | Distilled into |
| --- | --- | --- | --- |
| `07102026 - Marcelo Ian & Robert Accounting Check-in 2.md` | 2026-07-10 | ✅ PROCESSED (2026-07-10) | `2026-07-10-decisions.md` (this folder) §A–I. Orders=invoices=AR primitive; payments/Stripe/PaymentLine; subscriptions+deferred-rev; taxes; contracts/LXP/intercompany/multi-currency; SCHEMA-GAP directive (re-pass orders master, compare built vs plan). |
| `07102026 - Marcelo & Jeremy H Accounting Feature Collection.md` | 2026-07-10 | ✅ PROCESSED (2026-07-10) | `2026-07-10-decisions.md` §C–H. Customer/contact schema (multiple emails, address, contacts, sales rep), external doc number (bill.com), posting/due dates, AR customer subledger + payment application, invoice numbering, deferred-rev cadence. |
| `07102026 - Matt & Marcelo GUI Review.md` | 2026-07-10 | ✅ PROCESSED (2026-07-10) | UI direction (full write-up in the accounting companion `bizapps-accounting/plans/meetings/2026-07-10-decisions.md` §1). |

> Note: the 2026-07-10 domain decisions are ORDERS-heavy (orders=invoices, payments, subscriptions, taxes, customer schema),
> so the fuller domain write-up lives here; the accounting companion owns the UI/UX direction. The 2026-07-08/09 Robert
> meetings were distilled into `2026-07-08-robert-meeting-decisions.md` / `2026-07-09-robert-meeting-decisions.md` (this folder).

### 2026-07-11--Amith's Demo Feedback.md — ✅ PROCESSED 2026-07-11
Triaged per the planning system (Amith = master-plan-level authority, non-extension → MOD/UPD):
- Remotable-ops-for-big-work principle + singular transactional `CreateJournalEntry` + JE-logic-in-OrdersEngine
  → **MOD-5 enriched in place** (confirmations of as-built + the general principle).
- OrdersEngineBase/OrdersEngine split (AIEngineBase/AIEngine pattern) → **UPD-5** (+ ➕ marker at §3
  BO-D30) → feature action plan **F0**.
- UX (full-window tabbed order form; Accounting tab w/ JE; payments list + total/balance) → UI action plan
  §1/§8 updated; old UI Q2 resolved.
- His "please confirm" → answered in feature plan F0 (relay: yes as-built except the packaging split = F0).

### 2026-07-13 - Marcelo & Robert accounting meeting.md — ✅ PROCESSED 2026-07-13
Distilled → `2026-07-13-robert-meeting-decisions.md` (identical in accounting). Orders-side landings:
UPD-2 enriched (dated recognition entries, anniversary dates, created at booking-lock); feature plan F4.2
reworked to dated rows + CA-2 ungated; schema plan S3 ungated; Q2 ESCALATED (Robert's company-owns-order
model vs as-built CH-2 multi-company JE — research pending, no change). Accounting-side: MOD-11 (CA-2
resolved), Q18 progressed, change ledger imported for Robert.

### 2026-07-14 - LXP Requirements.md — ✅ PROCESSED 2026-07-14
Ethan's requirements doc (decisions by Amith + John): BizApps Orders = exclusive commerce engine, own
Sidecar instance, BCSaaS wraps, LH4I checkout is the launch surface. Triaged (Marcelo review P1–P6) into:
**UPD-6** (consumer record + IsOverdue + configurable grace) · **MOD-6 extension** (coupons v1; plan at
`action-plans/ActionPlan - Coupons (schema to UI).md`, Robert to review schema) · DEFERRALS (Stripe
stub-first → F3.5b subset; tax deferred + LXP note) · instance QUESTIONS **Q21** (tax structure, Robert,
HIGH) · F1.2b unit-of-work committed next wave. No accounting-side changes.

### 2026-07-17 intake batch (seven docs) — ✅ PROCESSED 2026-07-17 (orchestrator Task 97a)
Same seven docs as the accounting copy (see that repo's `_PROCESSED.md` for the per-doc table).
Orders-side landings: **MOD-12** (forward-dated rev-rec JEs; BO-D11 rewrite), **MOD-13** (LXP→Orders
DIRECT launch wiring + Teams-first contingency), **MOD-3 revised** (Order.CompanyID per Q2),
**UPD-6 v3 addendum**, **UPD-7** (OrderJournalEntry junction), **UPD-8** (coupons provider model /
OS7 review-blocked), **UPD-9** (RenewalSpawnStatus), **UPD-10** (email-first delivery + open-AR
cutover rule); **Q2/Q21 ANSWERED**; **Q22** (LH4I launch-scope sitting) minted;
**`ROADMAP-lxp-launch.md`** created; FEATURE-LIST trued up.

### 2026-07-17 - Amith Demo Feedback.md — ✅ PROCESSED 2026-07-17 (Task 98a)
Orders landing: **forms-first ruling block in UI plan §13** (Entity Forms for Order/Payment/
Subscription/Product; dashboard-shared widgets; no custom pop-ups — Amith's explicit orders
comment; Order editor = pilot). Robert owns detailed Products/Orders/Payments/Subs flow work with
Marcelo. Accounting-side landings in that repo's `_PROCESSED.md`.

### 2026-07-20 meetings (Robert/Ian + Matt UI review) — ✅ PROCESSED 2026-07-20 (Task 116a)
Orders landings: **MOD-14** (seller-of-record booking JE shape; V1.7/S3) · Q23 ANSWERED ·
UPD-13 (Matt UI rulings mirror) · S1 plan scope updated (ProductCategory.CompanyID; revised
hard-blocks) · fulfillment-groups BACKLOG row · routing row updated. Accounting-side landings in
that repo's _PROCESSED.md.
