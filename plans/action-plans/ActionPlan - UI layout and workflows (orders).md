# Plan — UI layout & workflows (orders)

> **Status:** ACTIVE (approved for execution — Marcelo review completed 2026-07-14; **mockup set
> approved + converted to per-screen build specs 2026-07-16 — §13 is the operative implementation
> spec**) · **Created:** 2026-07-11
> **Implements:** BACKLOG items "Order form: surface the full field set", "Compose Order takes the full
> available space", "Void affordance ≠ delete"; UPD-2/UPD-3 surfacing; the UI consequences of MOD-7/MOD-10.
> **Sources:** meetings/2026-07-10--Robert-demo-feedback.md, meetings/07102026 - Matt & Marcelo GUI Review.md,
> meetings/2026-07-10-decisions.md; MJ guides (DASHBOARD_BEST_PRACTICES, explorer-chrome-conventions,
> FORMS_ARCHITECTURE_GUIDE, KEYSET_PAGINATION_GUIDE); the Live Page System plan
> (`~/MJDev/shared-plans/live-page-system-accounting-orders.md`, approved).
> **Depends on:** schema S1/S2/S3 for the fields each screen shows; Feature F1–F4 for the actions each
> screen drives. This plan is **suggestions + layout direction** for Marcelo to prune — UI is the most
> taste-driven layer, so everything below is a proposal, not a commitment.

## 0. Cross-cutting direction (from the Matt GUI review — applies to every screen)

1. **Consistency beats novelty.** One table idiom everywhere: the AG-grid presentation (like the trial-balance
   screen) is the house style; the hand-rolled batch-approvals table and any Claude-improvised card layouts
   get migrated to it. When a screen needs grouping/expansion, prefer the standard grid + expandable rows
   over inventing a new element.
2. **Detail views open in the slide-in side panel** (MJ generic form slide-in per FORMS_ARCHITECTURE_GUIDE),
   not modals or inline cards — same behavior on every list screen.
3. **Every list defaults to a time window** (e.g. last 7/30 days, the shipped moving-window presets) — no
   unbounded "all records" loads. CFO-with-a-million-orders is the design case.
4. **Performance = UX here:** keyset pagination (composite AfterKey) + the **LiveDashboardBase** pattern
   (set-visible awareness, push-driven refresh, WebSocket-reconnect dirty-marking) per the approved Live Page
   System plan — orders screens adopt it as it lands; no per-button manual refresh wiring.
5. **Mobile/laptop-width tolerance:** compact layouts, no fixed 1080p assumptions (Matt).
6. All colors via `--mj-*` design tokens; `@if/@for`; `inject()`; PascalCase publics — house rules.

**Shared components (placements ruled 2026-07-15):** orders IMPORTS from accounting (dependency
direction: common → accounting → orders) — the domain trio (schedule/waterfall viewer ·
GL-resolution preview · Customer A/R base view, which orders wraps with its verbs) plus the
framework-clean set PARKED there for iteration speed (approval inbox, list-screen scaffold,
role-gating directive, cross-app deep-link helper — targets + triggers in accounting
`plans/TRANSFER-BACKLOG.md`). Orders OWNS: status stepper + money strip (single consumer today —
local, no premature abstraction; MJ-base candidacy tracked in the component inventory). Build each
shared thing ONCE.

**Mockup round 1 rulings (Marcelo, 2026-07-15 — bind the build; full list in the accounting UI
plan §0, identical shell):** top-nav categories (= Explorer app nav items) + collapsible nav rail;
no creation items in the rail; Filters + top-right create button per page; modal = quick baseline
with a pop-out (↗) to the full-depth home (order create modal → **Order editor**, the §1
full-window tabbed form); slide-in = quick view w/ pop-out; dashboards show "Recent orders" with
an "Only mine" toggle (not mine-only); expensive stats precomputed-on-schedule only; company scope
chip = rail-top (app-owned) pending an Explorer header-widget slot upstream. **Subscriptions &
renewals live in ORDERS** (a renewal materializes as an order; payments sees only the resulting
payment) — rail item under WORK, §11 surfaces.

## 1. Compose / edit Order (Robert's top feedback + Amith's 2026-07-11 UX direction)

- **Full-WINDOW order form** (Amith, resolving old Q2): composing/editing an order takes the full window —
  the user sees everything — with a **contemporary tabbed layout** between sections:
  **Details** (customer, dates, terms, status) · **Lines** · **Bill-To / Ship-To** · **Payments** ·
  **Accounting**. Keep the slide-in only for quick *viewing* from lists.
- **Payments tab + always-visible money strip** (Amith): the top-level form always shows **payments total
  and balance**; the Payments tab lists **all linked payments (zero to many)** via PaymentLines — what
  cleared this order, when, by which payment — with drill-through (S2/F3).
- **Accounting tab** (Amith): shows the order's **journal entry** (lines, Dr/Cr, status, batch membership)
  inline, with a deep link into the accounting app for full context. Replaces the improvised
  "open-an-accounting card" from the demo.
- **Full field set** (as S1 lands): Customer Organization (picker over common `Organization`), Customer
  Contact (Person picker filtered to the org via common `Relationship`/ContactMethod), Sales Rep (User
  picker), Order Date, Status, Payment Terms, Due Date (auto-derived, editable), Bill-To / Ship-To address
  pickers (common `Address` via `AddressLink`, with inline "new address"), External Document №, Notes.
  Totals strip (TotalGross / AmountPaid / Balance / PaymentStatus chip) always visible across tabs.
- **Line editor:** grid-style line entry (product picker, qty, unit price, discount %, line totals live-
  computed); per-line service-period dates VISIBLE when the product is Deferred (UPD-2); per-line
  fulfillment status chip when relevant. Deferred lines show a "recognition" affordance (F4 schedule
  preview) answering Robert's "how is Deferred determined / what moves it to revenue?" — show, don't tell.
- **Price resolution display (B.2 — added 2026-07-15, F9-gated):** the line editor autofills the resolved
  price with a source badge ("PriceList Standard · tier 10+"); manual edit flips an "overridden" marker
  (BO-D33 precedence: direct entry wins).
- **Status control:** a stepper showing the fixed stage order with **skip-ahead allowed** (MOD-10) — clicking
  Confirmed from Draft is legal; illegal moves disabled with tooltip reasons (from F1's matrix — the same
  declarative table drives UI affordance and server enforcement so they can't drift).
- **Void is a labeled button** (`Void order…`, confirm dialog, only enabled in Draft/Quoted) — clearly
  distinct from the trashcan/delete (Robert). Post-Confirm the affordance becomes **"Create reversal…"**
  (F2 flow: pick lines/quantities → preview credit order).
- **Confirm failure UX:** the F1 LOUD account-map error renders as a blocking, specific message (which line,
  which missing role) with a link to the accounting GLAccountLink screen for an admin to fix.

## 2. Order management board (the status-column screen from the demo)

Keep the Kanban-ish board but per Matt/Marcelo's own critique:
- Trim to the **working statuses** (Quoted/Confirmed/Posted/Fulfilled — Robert's "active" flow); Drafts and
  terminal states live in Order History.
- Default time window (week/month picker, presets already shipped).
- Column cards compact; click → slide-in panel (not the current card/modal mix).
- Server-side search + keyset paging behind the board's search box (today's local-only search is a trap at
  volume). Evaluate the accordion-per-status alternative Matt sketched IF the board's vertical imbalance
  stays annoying after trimming — decide by using it, not upfront.

## 3. Order History

- The archival/query surface: AG grid, all statuses, time-window default, keyset pagination, server search,
  saved filter presets (moving-window presets already shipped). This is where the million-order CFO case
  lives, per the GUI review.
- Row → slide-in; bulk export later.

## 4. Payments UI (with S2/F3)

New screens, same idioms:
- **Payment entry** (Manual provider): amount, method, date, receiving company, customer; then an
  **application panel** — the customer's open orders (from `vw_AROpenByCustomer` + order Balance) with
  amount-to-apply per order, auto-suggest oldest-first (F3.3 when built), running unapplied remainder.
  This is Jeremy's daily workflow — design review with him before build.
- **Payment list** on the order detail (slide-in shows PaymentLines: what cleared this order, when, by what
  payment) and on the customer view (payments by customer).
- **Refund flow** from a captured payment: amount (≤ remaining), reason → reversal payment + JE (F3.4).
- **Apply-credit-to-order (D.5 — added 2026-07-15):** from a negative-balance credit order, an
  "Apply credit…" action opens the SAME application panel in credit mode (customer's open orders with
  balances, amount-per-order, running remainder) — one component, two modes. Write-off stays deferred (Q4).
- **Payment-method vault (F.9 — added 2026-07-15):** per-customer masked-methods panel here and on the
  Customer A/R view (§5): list (brand/last4/expiry), default toggle, remove with confirm; "Add" is
  provider-hosted tokenization only, enabled when Stripe REAL (F.4) is live and hidden for manual-only
  deployments. No PAN entry ever renders in our UI.
- **Stripe status surfaces (F.4 — added 2026-07-15, lands with F3.5b):** PaymentIntent lifecycle chip
  (RequiresPayment / Processing / Succeeded / Failed) on payment rows + the order form's Payments tab;
  failed-intent retry affordance. Hosted-checkout return/cancel is LXP-side — orders shows the resulting
  state only. Webhook receiver (F.10) has no UI.

## 5. Customer A/R view (Jeremy's sub-ledger, order-side surface)

A per-customer page (routed from any customer link): identity block (from common: name, emails via
ContactMethod incl. CC list, addresses), open orders w/ balances, payment history, **aging strip**
(current/30/60/90+ from `vw_ARAging`), total balance. Read-model-backed (accounting views) — no new
storage. This is the "who owes me what" screen; weekly-overdue workflow reads it.

## 6. Product & catalog forms (with S1/S3/S5 fields)

- Product form: RevenueRecognitionType prominently + `DeferredRecognitionShape` when Deferred (UPD-2), with
  plain-language helper text ("Single date: 100% recognized on the event date · Service period: spread over
  the line's service dates") — Robert explicitly asked for more clarity here.
- ProductType form: `RequiresFulfillment` with helper ("physical products hold Posted orders for a
  fulfiller") (UPD-3).
- GL mapping visibility: read-only panel on Product/Category showing resolved GLAccountLink roles ("Revenue →
  4000 Sales (via category Software)"), so missing-map problems are visible BEFORE Confirm fails.

## 7. Fulfillment queue (F1.6 + Fulfiller role)

Minimal list: Posted orders having lines `FulfillmentStatus='Pending'`, filtered to the Fulfiller role;
per-line "Mark fulfilled" → order auto-advances when all lines done. No logistics depth (BizAppsInventory
later).

## 8. Cross-app navigation

Reconciled with Amith's Accounting-tab direction (§1): the order form's **Accounting tab shows the JE
inline** (Amith), and a **deep link** from that tab navigates to the accounting app's full JE view
(Marcelo's GUI-review fix — no more improvised embedded accounting card). Symmetrically, accounting's JE
detail links back to the originating order (JournalEntryLink lineage).

## 9. Sales rules — admin, editor, approval surfacing (H.1–H.4 — added 2026-07-15; F8 unblocked)

- **Admin list:** house grid over `SalesRule` (name, scope/condition summary, routed authority, active,
  last-fired).
- **Editor v1 — form-based builder (ruled 2026-07-15):** condition pickers (order total threshold,
  product/category, customer org, discount %) + authority routing (role picker), with a plain-language
  sentence preview ("Orders over $10k route to Sales Manager for approval"). No free-form expression
  language in v1.
- **Order-side surfacing:** the status stepper (§1) gains a "Pending approval" state; Confirm shows a
  blocking banner with the approval-task link; approve → Confirm proceeds, reject → back to Draft with
  the reason shown. Reviewer side = the shared approval inbox (§0).

## 10. Pricing admin (B.1 — added 2026-07-15)

- PriceList grid → slide-in with a ProductPrice child grid (product, pricing model, fee type, effective
  from/to) + inline PriceTier editor (qty breaks) for tiered rows.
- Overlapping-effective-date conflicts surface as row warnings; "duplicate list" action for
  season/segment rollovers.

## 11. Subscriptions & rev-rec visibility (G.1–G.4 — added 2026-07-15)

- Subscriptions list (customer, plan, status, current term, next renewal) → slide-in: the
  SubscriptionEvent timeline, linked orders, and the shared rev-rec **waterfall viewer**
  (recognized-to-date / deferred / remaining; per-line materialization status).
- §1's line-editor recognition affordance opens this same viewer scoped to the line — one viewer, two
  entry points.

## 12. Entitlement grants view (I.1 — added 2026-07-15)

- Read-only grid over `EntitlementGrant` (beneficiary, product, entitlement, status, source order line,
  granted/expires), filter presets by customer + product, deep links to order line and product.
  Provisioning/enforcement stays deferred (I.3).

## 13. Mockup conversion — per-screen build specs (2026-07-16, binds the build)

> The full interactive mockup set (`design-docs/ui-design/mockups/nav-shell-*.html`, 17 linked
> pages, committed) was APPROVED for implementation by Marcelo 2026-07-16 ("run with it"). This
> section is the authoritative per-screen spec; §§1–12 remain the feature-level intent it
> implements. **Mockup retention:** `mockups/` is RETAINED as the build agents' visual reference
> until this plan's build completes, then deleted (frame improvements fold into `shell/` first).
>
> **MJ-wins rule (binds every screen):** where MJ base already ships the idiom — page chrome, form
> slide-in, AG grid, `mj-loading`, dialogs, `--mj-*` tokens — USE IT. Mockups are directionally
> binding (layout, hierarchy, content, flows), not pixel-binding; `.mjm-*`/`.x-*` classes never
> ship. Element doctrine + navigation map: `design-docs/ui-design/README.md` (standing design
> record) — identical shell rules to accounting's UI plan §8.0 (shared nav-rail + workspace-tab
> framework, imported from accounting where parked).

### 13.0 App shell (build FIRST)

- **Top-nav categories = Explorer app nav items** (`DefaultNavItems`): **Orders · Payments ·
  Products · Reports**. Category shells host the shared nav rail + routed pages.
- Rail configs (from the approved mockups):

| Category | MAIN | Second group |
|---|---|---|
| Orders | Dashboard · All orders · Order editor · Status board | WORK: Fulfillment queue · Overdue worklist (badge) · Subscriptions & renewals |
| Payments | Dashboard · All payments · Payment entry | WORK: Refunds & reversals · Payment methods |
| Products | Catalog · Categories · Pricing · GL mapping | — |
| Reports | Customer A/R · Overdue & dunning | — |

- **Company scope chip** (rail-top, same component + UserInfoEngine persistence as accounting;
  key `mj.bizappsord.companyScope.v1`).
- **Workspace-tab framework** (session-scoped, imported from accounting's parked component): used
  by the Order editor — draft orders keep state until tab close / session end, NOT DB-persisted
  in v1.

### 13.1 Orders category (7 pages)

- **Orders Dashboard** (`nav-shell-orders-dashboard.html`) — stat cards (open orders, awaiting
  fulfillment, overdue balance, this-month total — cheap counts only; heavy trends precomputed or
  omitted) + needs-attention list + **"Recent orders" with an "Only mine" toggle** (round-1 ruling:
  not mine-only).
- **All orders** (`nav-shell-all-orders.html`) — §3 Order History built to idiom: house grid, all
  statuses, time-window default, keyset Load-more, server search, saved filter presets; row
  slide-in (identity, lines, money strip, payment status) with ↗ "Open in editor".
- **Order editor** (`nav-shell-order-editor.html`) — §1 in full: session-tabbed workspace (New +
  in-progress drafts); **status stepper** with skip-ahead (MOD-10) + disabled/tooltip illegal moves
  (F1 matrix); **always-visible money strip** (TOTAL / PAID / BALANCE + payment-status chip);
  five tabs **Details · Lines · Bill-To/Ship-To · Payments · Accounting** (Q2 tab set now FINAL,
  mockup-approved). Line editor: product picker, qty, unit price, disc %, live totals; **price
  source badge** ("PriceList Standard · tier 10+") flipping to "overridden (direct entry)" on
  manual edit (B.2/BO-D33); rev-rec column + service-period dates on Deferred lines (UPD-2) with
  the recognition-preview affordance (waterfall viewer, §11). Header verbs: Void order… (Draft/
  Quoted; becomes "Create reversal…" post-Confirm, F2) · Confirm order. **Confirm-failure UX:**
  LOUD blocking banner naming the line + missing role, with the "Fix in Accounting → Account
  links" deep link (admins), then retry.
- **Status board** (`nav-shell-status-board.html`) — §2 trimmed to working statuses
  (Quoted/Confirmed/Posted/Fulfilled), time window, compact cards, click → slide-in, server search
  + keyset. Accordion alternative (§2/Q1) evaluated by use after trim — not built now.
- **Fulfillment queue** (`nav-shell-fulfillment-queue.html`) — §7 as specced: Posted orders with
  pending lines, Fulfiller-role gated (shared role-gating directive), per-line "Mark fulfilled",
  auto-advance when all lines done.
- **Overdue worklist** (`nav-shell-overdue-worklist.html`) — the weekly-overdue workflow (§5's
  verb side): overdue orders grid (customer, balance, days overdue, aging bucket), row → Customer
  A/R deep link + payment-entry shortcut. Also reachable from Reports ("Overdue & dunning").
- **Subscriptions & renewals** (`nav-shell-subscriptions.html`) — §11 as specced: list (customer,
  plan, status, current term, next renewal) → slide-in with SubscriptionEvent timeline, linked
  orders, shared **waterfall viewer**.

### 13.2 Payments category (5 pages)

- **Payments Dashboard** (`nav-shell-payments-dashboard.html`) — stat cards (payments this month,
  unapplied balance, failed intents, refunds pending) + recent payments + needs-attention.
- **All payments** (`nav-shell-all-payments.html`) — house grid (payment №, date, customer, method,
  amount, applied/unapplied, status incl. F.4 PaymentIntent lifecycle chip), time window, keyset;
  row slide-in → PaymentLines (which orders it cleared) + refund affordance.
- **Payment entry** (`nav-shell-payments.html`) — §4's Jeremy workflow: entry form (amount, method,
  date, receiving company, customer) + the **application panel** (open orders w/ balances,
  amount-to-apply per order, oldest-first auto-suggest, running unapplied remainder). SAME
  component serves credit mode (D.5 apply-credit). Design review w/ Jeremy = round-2 of this
  mockup (Q4 resolved: the mockup IS the wireframe for that conversation; build proceeds, iterate
  on his feedback).
- **Refunds & reversals** (`nav-shell-refunds.html`) — §4's refund flow: captured payments grid,
  refund action (amount ≤ remaining, reason → reversal payment + JE, F3.4), reversal history.
- **Payment methods** (`nav-shell-payment-methods.html`) — F.9 vault: per-customer masked methods
  (brand/last4/expiry), default toggle, remove w/ confirm; **"Add" disabled pending Stripe REAL
  (F.4)** and hidden for manual-only deployments. No PAN entry ever renders.

### 13.3 Products category (4 pages)

- **Catalog** (`nav-shell-products.html`) — §6: product grid (name, type, category, rev-rec type,
  price, active); expandable rows / slide-in show the **GL-resolution preview** ("Revenue → 4000
  Sales via category Software") with an **unresolved-mapping tripwire chip** so missing maps are
  visible BEFORE Confirm fails; RevenueRecognitionType + DeferredRecognitionShape prominent with
  plain-language helper text (UPD-2, Robert's clarity ask).
- **Categories** (`nav-shell-categories.html`) — category tree + per-category classification
  defaults (rev-rec defaults, GL-link inheritance shown via the same resolution preview).
- **Pricing** (`nav-shell-pricing.html`) — §10 as specced: PriceList grid → slide-in w/
  ProductPrice child grid + inline PriceTier editor; overlap warnings; duplicate-list action.
- **GL mapping** (`nav-shell-gl-mapping.html`) — read-only order-side view of resolved
  GLAccountLink roles per product/category (§6), with "Fix in Accounting ↗" deep links (the
  authoritative editor lives in accounting's Account links page — JEs/GL data is never duplicated
  in orders, only linked).

### 13.4 Reports category (1 page + crosslink)

- **Customer A/R** (`nav-shell-customer-ar.html`) — §5 as specced: the accounting-homed **Customer
  A/R base view** (identity block, open orders w/ balances, payment history, aging strip from
  `vw_ARAging`, total balance) wrapped with orders' verbs (record payment, open order, dunning
  note). Q3 RESOLVED by mockup approval: **homed in orders' Reports category**, base component
  imported from accounting; accounting links to it.
- **Overdue & dunning** = crosslink to the Overdue worklist (13.1) — one page, two nav entries.

### 13.5 Build sequencing (resolves wave Q10 for this app)

1. **Shell** (13.0) — nav items + category shells + rail configs + scope chip (rail + workspace-tab
   framework imported from accounting once its Phase-1 lands; coordinate).
2. **Order editor** (13.1) — the anchor screen (S1 + F1/F2 dependent); stepper + money strip built
   here (orders-local).
3. **All orders + Status board trim** — list idiom clones from accounting's scaffold.
4. **Payment entry + All payments** (S2 + F3; iterate with Jeremy on the built v1).
5. **Customer A/R + Overdue worklist** (read models flowing).
6. **Products category** (S3/S5 fields; GL-resolution preview imported from accounting).
7. **Refunds, Payment methods, Subscriptions, Fulfillment queue** — as their features (F3.4, F.9,
   G.*, F1.6) land.
8. **Dashboards** last within each category (cheap stats only); sales-rules (§9) + grants (§12)
   surfaces ride their feature plans (no mockup this round — mock at their build).

## Sequencing

1. Compose/edit Order full-space + field set + status stepper + Void/Reverse affordances (needs S1+F1/F2)
2. Board trim + time windows + slide-in consistency (no schema dep — can start now)
3. Payments entry + application (S2+F3; design review w/ Jeremy)
4. Customer A/R view (S2 data flowing)
5. Product form rev-rec clarity (S3)
6. Fulfillment queue (F1.6 + roles)
7. LiveDashboardBase adoption as the shared substrate lands (Live Page System plan)
8. 2026-07-15 additions (§9–§12 + the §1/§4 additions): sequenced at the mockup-cycle scoping (wave Q10).

**Superseded 2026-07-16: §13.5 is the operative build order** (per-screen, shell-first).

## Questions for Marcelo

1. **Board vs accordion (§2):** trim-and-keep-board (my lean) or adopt Matt's accordion sketch now?
   **RESOLVED 2026-07-16 by mockup approval: trimmed board ships (§13.1); accordion re-evaluated by
   use.**
2. ~~Compose full-space: route page vs maximized slide-in?~~ **RESOLVED 2026-07-11 (Amith): full-window
   tabbed order form** (§1). Tab set/order **FINAL 2026-07-16 (mockup-approved):** Details · Lines ·
   Bill-To/Ship-To · Payments · Accounting.
3. **Customer A/R view home:** ~~orders app, accounting app, or both?~~ **RESOLVED 2026-07-16 by
   mockup approval: orders Reports category hosts the page; the read-only base component is
   accounting-homed (§0 placement ruling) and orders wraps it with its verbs (§13.4).**
4. **Payment entry design review with Jeremy (§4):** **RESOLVED 2026-07-16 — the approved mockup
   (`nav-shell-payments.html`) is the wireframe for that conversation; build v1 from it and iterate
   on Jeremy's feedback against the real thing.**
5. UI work owner: ~~suggestions-level or per-screen specs before handoff?~~ **RESOLVED 2026-07-16:
   per-screen specs written (§13) — this plan is the build handoff.**
