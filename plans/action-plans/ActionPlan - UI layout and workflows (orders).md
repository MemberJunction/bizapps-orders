# Plan — UI layout & workflows (orders)

> **Status:** ACTIVE (approved for execution — Marcelo review completed 2026-07-14) · **Created:** 2026-07-11
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

## Sequencing

1. Compose/edit Order full-space + field set + status stepper + Void/Reverse affordances (needs S1+F1/F2)
2. Board trim + time windows + slide-in consistency (no schema dep — can start now)
3. Payments entry + application (S2+F3; design review w/ Jeremy)
4. Customer A/R view (S2 data flowing)
5. Product form rev-rec clarity (S3)
6. Fulfillment queue (F1.6 + roles)
7. LiveDashboardBase adoption as the shared substrate lands (Live Page System plan)

## Questions for Marcelo

1. **Board vs accordion (§2):** trim-and-keep-board (my lean) or adopt Matt's accordion sketch now?
2. ~~Compose full-space: route page vs maximized slide-in?~~ **RESOLVED 2026-07-11 (Amith): full-window
   tabbed order form** (§1). Remaining detail only: exact tab set/order — current proposal Details ·
   Lines · Bill-To/Ship-To · Payments · Accounting.
3. **Customer A/R view home:** orders app, accounting app, or both (shared component)? It straddles the
   boundary — data is accounting views, workflow is orders. I lean **shared component in orders** (Jeremy's
   entry point is invoices/payments) with accounting linking to it.
4. **Payment entry design review with Jeremy before building (§4)** — want me to prep a mock/wireframe for
   that conversation, or build v0 first and iterate on the real thing (Robert's build-see-correct posture)?
5. UI work owner: these screens go to the other agents (per your division) — should this plan stay
   suggestions-level (current form) or do you want per-screen component-level specs written before handoff?
