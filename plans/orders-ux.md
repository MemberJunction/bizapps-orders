# BizApps Orders — UX plan (Order Entry & Payments)

> Companion to `bizapps-orders-master.md` (the schema/engine plan). That plan's §15 states the
> binding UI-architecture rules; this plan is the design that satisfies them. Decisions here are
> numbered **U1…** so they can be cited the way D-numbers are.
>
> Status: DESIGN. Mockups live in `/mockups` (interactive HTML, opens from `file://`). Nothing is
> built in Angular until the mockups are signed off.

---

## 0. Table of contents

1. [Who this is for](#1-who-this-is-for)
2. [The thesis](#2-the-thesis)
3. [Design decisions (U1–U20)](#3-design-decisions)
4. [Information architecture — jobs, not entities](#4-information-architecture)
5. [Screen inventory](#5-screen-inventory)
6. [Component inventory](#6-component-inventory)
7. [Hero flow specs](#7-hero-flow-specs)
8. [Visual language](#8-visual-language)
9. [Mockup data — the eight scenarios](#9-mockup-data)
10. [Angular build mapping](#10-angular-build-mapping)
11. [Gaps this design exposes](#11-gaps-this-design-exposes)
12. [Build sequencing](#12-build-sequencing)

---

## 1. Who this is for

**Two internal audiences. No e-commerce, no self-service buyer, ruled by Amith 2026-07-29.**

| Audience | What they do all day | What they need |
|---|---|---|
| **Order taker** (staff, phone/back office) | Enters orders for members and organizations, takes a card or a check, answers "what do I owe?" | Speed. Keyboard. One screen. Six decisions. To know the customer before quoting. |
| **Accounting team** | Applies cash, chases A/R, issues refunds and credits, reconciles to the ledger | Traceability. Every number's provenance. The sub-ledger tying to the GL. |

The **LXP** (§16 of the master plan) is a *third-party* front end: it drives the engine through the
API and gets its own UX in its own codebase. Our obligation is **visibility** — an LXP-originated
order must be as legible here as a staff-entered one, and identifiable as LXP's (U18).

Everything else follows from these three sentences. The order taker's screen is not the
accountant's screen, and neither is a generic entity grid.

---

## 2. The thesis

**Order entry is not a CRUD problem, and every ERP order screen that treats it as one is bad.**

A CRUD design is a form over `OrderHeader` plus a grid over `OrderLine`. But look at what the engine
does inside `Save()`:

- price resolves product → category → ancestors → company → default resolver (D69)
- promotions stack sequentially or additively per company; losers are recorded as offered-not-applied (D70)
- charges layer, tax IS a charge, and the taxable base grows with non-tax charges but never with tax charges (D71)
- taxability inherits down its own chain, terminating NOT NULL at product type (D73)
- subscriptions decide extend-vs-create *before* lines insert, and scale line quantity for proration (D54)
- GL roles resolve per line, per company, or the confirm is **refused** (D5)
- reversal lines inherit price from the origin line, and over-returning is refused (D74)

Every one of those is a *computation the user cannot see*. In a CRUD design the user types blind and
learns the truth at Confirm — which is why the prototype's order editor needed a loud red
Confirm-failure banner with a "go fix account mappings and retry" deep link. That banner is the
design admitting the user finds out last.

**The thesis: the order tells you what it will do before you commit it.** Continuous preview, not
deferred validation. Three moves, and they are the whole design:

1. **Live decomposition.** Totals broken out the way the engine breaks them — net → promotions →
   charges → tax layers → gross — every number traceable to the rule that produced it.
2. **Confirm is a review, not a leap.** A pre-flight showing the journal entries that will book, the
   subscription that will be created or extended, the grants that will issue, the approval that will
   be raised. Blockers appear *before* the button, not in a banner after it.
3. **Lines get a real editor.** Five numbers on the row; everything else behind progressive
   disclosure keyed to what the product already knows.

### Simple, not simplistic

Simplistic is one screen that is too heavy for the common order and too shallow for the hard one.
Simple is **two lanes** (U3) — a fast lane that covers the 80% order in one column, and a full editor
for depth, with the fast lane escalating into the editor without losing state.

And: **never ask what the product already knows.** An event product's service period is stamped from
the event (D67) — show it, don't prompt for it. A product type that doesn't require fulfillment
doesn't get a fulfillment field. The engine's inheritance chains are a UX asset.

---

## 3. Design decisions

| # | Decision | Rationale |
|---|---|---|
| **U1** | **Screens are organized by JOB, not by entity.** The nav says "Take an order", "Get paid", "Give money back" — not "OrderHeader", "PaymentLine". Generated entity forms remain the admin fallback for every table and are reachable, but they are not the navigation. | Amith 2026-07-29. An entity-per-screen IA makes the user assemble the workflow in their head; 51 tables would be 51 destinations. |
| **U2** | **Every computed number carries a "why".** Any figure the engine derived — resolved price, discount, charge, tax layer, line net, balance — has an inline disclosure revealing the rule chain that produced it. Never a bare number. | The engine's value IS the computation; hiding it makes the app feel arbitrary and makes every disagreement a support ticket. Cheap to build: the engines already return component detail (`OrderLinePriceComponent`, `OrderCharge.BasisAmount/Rate`). |
| **U3** | **Two lanes into an order: Fast entry and Full editor.** Fast entry is one centered column, keyboard-first, ~6 decisions, no tabs. The Full editor is the tabbed workspace for depth. **Escalation is one click and loses nothing** — the same draft opens in the editor. | Amith 2026-07-29 approved the split. The 80% order is one member, one or two products, one tender; making that order pay the cost of the multi-company/charge/dimension case is the usual ERP mistake. |
| **U4** | **Confirm is a pre-flight review overlay, never a bare button.** It states, before committing: N journal entries across M companies (balanced ✓), subscriptions created vs extended, entitlement grants issuing, approvals that will be raised, and any hard blocker with the reason from `LatestResult` (D50). | Thesis move #2. D8 makes the first Confirm the irreversible booking event; an irreversible action gets a review step. |
| **U5** | **Drafts are persisted, not session-scoped.** `Draft` is a real status with a real row. Tabs restore across sessions and devices. | The prototype's session-only drafts were a self-inflicted limitation — the schema already models Draft, and an order taker who loses a half-entered order to a browser refresh stops trusting the tool. |
| **U6** | **The order document is a first-class deliverable, not a report afterthought.** D2 says the confirmed Order IS the receivable and the bill is the Order rendered. So there is a real, print-quality document surface with remittance detail, tax breakdown, and a paid state. | Amith 2026-07-29: in scope. It is what the customer actually sees; the internal screens are scaffolding around it. |
| **U7** | **Money typography is a component, not ad-hoc CSS.** Tabular numerals, right-aligned, decimal-aligned, gross as the hero weight, negatives in error color with parentheses in document contexts. | Numbers that don't align cannot be scanned or summed by eye, which is the entire job of an A/R screen. |
| **U8** | **The shared MJ chrome trio is mandatory** — `<mj-page-layout>` / `<mj-page-header>` / `<mj-page-body>`, and `<mj-page-header-interior>` for sub-pages inside a left-nav shell. Slots obey MJ's rules: `[meta]` = state, `[actions]` = verbs with the primary rightmost, `[toolbar]` = search/filter row. | MJ's `DASHBOARD_BEST_PRACTICES.md` "Page Chrome" is binding for Explorer dashboards. The prototype hand-rolled a frame per mockup — 20 copies to fix whenever a token moves. The mockup style kit reproduces the trio's real CSS so the mockups and the build are the same design. |
| **U9** | **Panels are the unit of reuse, via `BaseFormPanel` + slots.** Money strip, status stepper, charge/tax ladder, JE preview, recognition waterfall, promotion ledger, payment allocations: each is ONE component that mounts into the generated entity form via its slot AND composes directly into the workspace editor. | This is the honest implementation of D33 ("reusable widgets dashboards embed directly"). `PANELS.md` documents the out-of-slot composition case explicitly. Write once; appears in form, dialog, slide-in, window, and editor. |
| **U10** | **Overlays only through `MJFormPresenterService` / the three shells** (`mj-form-dialog`, `mj-form-slide-in`, `mj-form-window`). No bespoke pop-ups, ever. | D33. The stack already ships modal, right-edge, and floating-window presentations with per-entity width persistence; a hand-built dialog is strictly worse and a maintenance tax. |
| **U11** | **Element doctrine** (carried over from the prototype's ratified doctrine, which was sound): **modal** = a single-record action that passes the encapsulation test; **page/workspace** = depth, criteria-driven, or multi-record; **slide-in** = quick view of a related record; every modal/slide-in carries a pop-out ↗ to its full-depth home; **never two filter systems on one page**; dashboard stats are cheap counts or precomputed, never on-demand heavy aggregates. | Ratified 2026-07-16 and still correct. Adopting it wholesale is cheaper than re-deriving it. |
| **U12** | **Journal entries are shown but never edited here, and never duplicated.** Order- and payment-side accounting surfaces are read-only projections with `Open in Accounting ↗`. | Also carried from the prototype. Matches the app boundary: orders creates Pending JEs and owns nothing in the ledger (§2). |
| **U13** | **Progressive disclosure is keyed to inheritance, not to a "show advanced" toggle.** A field is present when the record's own metadata makes it answerable and absent when a parent already answered it. Stamped values render as *stated facts with provenance*, not as pre-filled inputs. | D67's event dates, D64's inferred organization, D73's inherited taxability, D6's line company. An "Advanced" accordion hides the wrong axis — the axis that matters is "did something upstream already decide this?" |
| **U14** | **Line editing: five numbers on the row, the rest in a drawer.** Row = product · qty · unit price (with source badge) · discount · line total. The drawer carries ship-to trio, service period, subscription target, dimensions, reversal origin, per-line company, charge allocations. | `OrderLine` has ~18 meaningful columns (D61/D62 added the party trio; D31 dimensions). Eighteen inline inputs is a spreadsheet without a spreadsheet's affordances. |
| **U15** | **Required-state is a red dot on the tab, and save is completeness-gated.** Never a disabled Save with no explanation. | §15.6 (Matt), whose named concern case was exactly the order editor. |
| **U16** | **Edit gating comes from status, and shows the state's real verbs.** A posted order offers `Create reversal…` / `Refund` / `Cancel` — not a greyed-out Save. The DB triggers (51001–51005, 51010/51011) are the enforcement authority; the UI mirrors them and never invents a rule. | §15.3 + D8/D9 (`Voided` reachable only from Draft/Quoted) + D68 (payment lines frozen after capture). |
| **U17** | **Cash application always shows the unallocated remainder, and it must reach zero.** Over-applying an order is legal and is surfaced as *"creates a $250 account credit"* — never as an error, never as silent unapplied cash. | D68: the payment↔lines equality is checked at capture, and the negative order balance IS the credit. There is no "unapplied cash" concept to model, so the UI must not invent one. |
| **U18** | **Origin is a first-class, filterable attribute of an order.** Staff-entered vs LXP checkout vs renewal-spawned vs migration is visible in the list, in the identity bar, and as a dashboard cut. | Amith 2026-07-29: LXP drives the engine and "we need to SEE them here." Also operationally necessary — a support call about a self-serve purchase needs the origin without inference. **Requires a schema addition; see §11.** |
| **U19** | **Light and dark, both first-class, driven by MJ tokens only.** No hardcoded hex anywhere in app CSS. | MJ ships a full dark token set and a theme engine that re-tints brand overlays; hardcoding breaks org branding, not just dark mode. |
| **U20** | **Keyboard is a designed surface, not an afterthought.** Fast entry is completable without the mouse: `/` focus search, `↵` commit the current step, `⌘↵` confirm, `⌘S` save draft, `⌥↑/↓` move between lines, `Esc` close any overlay. Shortcuts are *visible* in the footer strip, not hidden in a help modal. | The order taker is a repeat user doing the same six keystrokes hundreds of times a day. This is where perceived quality actually lives for the primary audience. |

---

## 4. Information architecture

Four top-level categories (Explorer app nav items), each hosting a left rail of single-purpose pages
grouped by job. Top nav = across categories; left nav = within (MJ's rule).

```
ORDERS            Dashboard · All orders · Fast entry · Order editor†
                  WORK: Fulfillment queue · Returns

PAYMENTS          Dashboard · All payments · Take a payment
                  WORK: Refunds · Account credits

RECEIVABLES       Customer A/R · Overdue worklist · Subscriptions & renewals

CATALOG           Products & categories · Pricing · Promotions · Charges & tax
```

† The editor is reachable from the rail as "new order" for convenience, but it is *not* a
destination in the IA sense — it is always opened against a record or a new draft. Creation lives on
the page's primary action button, never in the rail (carried from the prototype's doctrine; no FAB).

**Why RECEIVABLES is its own category** rather than "Reports": the accounting audience's daily work
is A/R, aging, and renewals — that is an operational job with worklists and actions, not a reporting
surface. Calling it Reports would tell them their work is a read-only afterthought.

**Subscriptions sits under RECEIVABLES**, not Orders, because a subscription's daily question is
"will this renew and will it get paid" — a receivables question. Renewals spawn Orders (D20/D55), so
the link is one click, but the *job* is retention and collection.

---

## 5. Screen inventory

19 screens. Each maps to a job; the "engine" column names the behaviour it must make legible.

### Orders

| Screen | Job | Engine it exposes |
|---|---|---|
| `orders/fast-entry.html` | Take the common order in one column, keyboard-only | PriceResolver, SubscriptionBehavior, ChargeEngine, TaxResolver — all live |
| `orders/editor.html` | Build the hard order; 5 tabs + confirm pre-flight | everything above + GLAccountResolver, dimensions, per-line parties, proration |
| `orders/list.html` | Find any order; work a filtered set | rollup fields (D41), `IsOverdue` (D32), origin (U18) |
| `orders/document.html` | The bill the customer sees | D2 order-as-invoice, charge/tax breakdown, remittance |
| `orders/return.html` | Return part of a shipped order | ReversalBehavior/ReversalResolver (D74) — returnable qty, inherited price |
| `orders/fulfillment.html` | Work the physical queue | D15 fulfillment ⟂ revenue, auto-advance |
| `orders/dashboard.html` | Is the day healthy? | cheap counts only (U11) |

### Payments

| Screen | Job | Engine it exposes |
|---|---|---|
| `payments/entry.html` | Take money and apply it to orders | D68 equality, D58 guards, PaymentAllocationFactory, D66 intercompany legs |
| `payments/list.html` | Find any payment | capture/refund status, tender mix |
| `payments/refund.html` | Give money back for a payment | D59 proportional un-application, fee not reversed |
| `payments/credit.html` | Spend a customer's credit on another order | D68 `AccountCredit` zero-amount payment, two offsetting lines |
| `payments/dashboard.html` | Cash position today | cheap counts |

### Receivables

| Screen | Job | Engine it exposes |
|---|---|---|
| `receivables/aging.html` | One customer's whole money picture | aging buckets, open items, credits, history |
| `receivables/overdue.html` | Chase what's late | D32 grace period, notify-CS-not-auto-cancel |
| `receivables/subscriptions.html` | Retention + renewals (2 segments) | SubscriptionTerm timeline, D55 spawn window, D52 cancellation preview, recognition waterfall |

### Catalog

| Screen | Job | Engine it exposes |
|---|---|---|
| `catalog/products.html` | Run the catalog | per-company categories (D7), type-driven behavior (D4), IsA extensions |
| `catalog/pricing.html` | Set and debug prices | D69 resolution walk visualizer, tiers, effective dating |
| `catalog/promotions.html` | Run offers | D70 stacking config, codes, offered-not-applied |
| `catalog/charges-tax.html` | Configure charges, tax, nexus, exemptions | D71 basis/sequence, D72 nexus vs exemption, D73 taxability chain |

Plus `mockups/index.html` — the gallery, with the rationale for each screen and the shortcut map.

---

## 6. Component inventory

The reusable set. Each becomes a `BaseFormPanel` (U9) or a shared presentational component, and each
is used in ≥2 screens or it doesn't belong on this list.

| Component | What it is | Used by | Angular home |
|---|---|---|---|
| **Money strip** | TotalGross · AmountPaid · Balance · payment-status chip, with the decomposition disclosure | editor, document, list preview, aging | `BaseFormPanel` (OrderHeader) |
| **Status stepper** | Fixed stages, legal-skip moves, illegal moves disabled with the reason, real verbs for the current state | editor, list preview | `BaseFormPanel` — **MJ-base candidate** (generic state-machine stepper) |
| **Decomposition ladder** | net → promotions → charges → tax layers → gross, each row expandable to its rule | fast entry, editor, document | shared component |
| **Price source badge** | "Price list: Standard · tier 10+" / "overridden (direct entry)" + the resolution walk on hover | fast entry, editor, pricing | shared component |
| **Consequence chips** | Per-line derived facts: "extends Jane's membership to 2027-07-31", "recognizes on event date", "ships to header default" | fast entry, editor | shared component |
| **Line detail drawer** | The other 13 line fields (U14) | editor | `mj-form-slide-in` |
| **Confirm pre-flight** | JEs · subscriptions · grants · approvals · blockers | fast entry, editor | `mj-form-dialog` |
| **JE preview** | Read-only Dr/Cr per line per company, resolved roles, `Open in Accounting ↗` | editor, payment entry, document | `BaseFormPanel` |
| **Recognition waterfall** | Forward-dated entries by period (D14) | subscriptions, editor line drawer | `BaseFormPanel` — consumed-not-owned candidate (accounting) |
| **Allocation grid** | Open orders × applied amount, running unallocated, auto-apply | payment entry, refund, credit | shared component |
| **Aging bar** | Current/30/60/90 as one stacked bar with amounts | aging, overdue, dashboards | shared component |
| **Party pair card** | Person + Organization + Address, with inference provenance (D64) | editor Parties tab, payment entry | `BaseFormPanel` |
| **Worklist table** | Dense table + preset chips + column filters + row slide-in | list, overdue, fulfillment, renewals | shared component |
| **Stat tile** | Cheap count + label + trend sparkline | both dashboards | `<mj-stat-badge>` where it fits, else shared |

---

## 7. Hero flow specs

### 7.1 Fast entry — the 80% order

One centered column, max 760px, sticky decomposition rail on wide viewports (collapses under the
column below 1100px). Four steps, no tabs, no page reload.

**Step 1 — Who.** One search field. Type-ahead over people and organizations with a badge for which.
On selection the field collapses into a **customer card**: name, organization (with the D64 inference
note when inferred), payment terms, **open balance**, **available credit**, saved payment method.
This is deliberate: the order taker learns the customer's money situation *before* quoting, which is
when it's useful.

**Step 2 — What.** One "Add product…" field. Type-ahead over the catalog showing name, type badge,
company, and resolved price. On selection a **line row card** appears: product, qty stepper, unit
price with source badge, line net. Consequence chips render underneath automatically. The next
"Add product…" field focuses. `↵` on an empty add-field advances to step 3.

**Step 3 — Money.** The decomposition ladder updates on every keystroke (debounced), calling what
will be `Orders.PreviewOrder`. Rows: Subtotal · Promotions (each named, with offered-not-applied
listed quietly) · Charges (shipping, handling) · Tax (one row per jurisdiction layer, with the
taxable base shown so it's visible that tax doesn't compound) · **Total**. Every row expands.

**Step 4 — Tender.** Segmented: `Invoice on terms` · `Card on file` · `New card` · `Check` ·
`Account credit`. Account credit shows the available amount and applies it, driving the remainder.
Choosing a tender writes the D42 initial-payment *intent*, which the pre-flight then explains will
generate a PaymentHeader on confirm.

**Footer.** `Save draft ⌘S` · `Open in full editor ⇧⌘E` · `Confirm order ⌘↵`. Visible shortcut strip.

### 7.2 Full editor — the hard order

Persistent chrome: identity bar (order number · type · origin · dates · sales rep) + status stepper +
money strip. Tabs with red-dot required-state:

- **Lines** — worklist table, five numbers per U14, row click opens the line detail drawer. Per-line
  company badge makes the multi-company case obvious at a glance.
- **Parties** — Bill-to pair card and Ship-to pair card side by side, with the "lines override
  independently" rule stated once and per-line overrides listed as exceptions.
- **Charges & Tax** — the layered table: sequence · charge type · basis · basis amount · rate ·
  amount · overridden?. Below it the **taxable-base ladder** proving non-tax charges enlarge the base
  and tax charges do not (D71). Override captures who/when/why/replaced-value inline.
- **Payment** — initial-payment intent (D42) plus applied payments with their allocation shares.
- **Accounting** — per-line JE preview, grouped by company, each balanced, roles named
  (AR / Sales / Deferred Revenue / Sales Discounts), read-only, `Open in Accounting ↗`.

### 7.3 Confirm pre-flight

A modal, four sections, each collapsible and each answering "what will happen":

1. **Journal entries** — "4 entries across 2 companies, all balanced" with the Dr/Cr detail.
2. **Subscriptions** — "Extends Jane Chen's Annual Membership through 2027-07-31" vs "Creates a new
   subscription", with the proration note when the quantity was scaled (D54).
3. **Entitlements** — grants issuing, with beneficiary.
4. **Approvals** — sales-rule violations that will raise a Task, with the approver role.

**Blockers** render above all of it in error styling with the actual reason and a deep link to the
fix — and the confirm button is genuinely unavailable, not just red. Buttons: `Back to editing` /
`Confirm & book`.

### 7.4 Take a payment

Two panels. Left: payment facts (customer, date, tender, amount, instrument, receiving company).
Right: **allocation grid** — the customer's open orders, oldest first, with an `Auto-apply` action, a
per-row applied amount, and a persistent **Unallocated: $0.00** readout that must reach zero to
capture (U17/D68). Over-applying a row is allowed and surfaces "drives ORD-1041 to −$250.00 —
creates account credit". When the allocation spans companies, a note names the intercompany legs that
will book at allocation, not capture (D66).

---

## 8. Visual language

- **Tokens only** (U19). MJ's `_tokens.scss` is the source; the mockup style kit is a synced copy.
  Brand `#0076b6`, neutral slate scale, semantic status colors. Light + dark, `data-theme` on root.
- **Type.** Inter/system stack. Money and quantities in tabular numerals. 13–14px body in dense
  surfaces, 19px page titles. Weight carries hierarchy, not size inflation.
- **Surface.** 1px `--mj-border-default` rules, `--mj-radius-md` (8px), cards on
  `--mj-bg-surface`, page on `--mj-bg-page`. Shadows only on overlays. No gradients.
- **Density with hierarchy.** Tables run to the container edge; hierarchy comes from weight, rule
  lines, and whitespace between groups — never from nested boxes.
- **Motion.** 120–180ms ease on disclosure and slide-ins. Nothing animates on data change except a
  brief highlight on a recomputed total, which is meaningful.
- **Icons.** Font Awesome 6 (MJ's convention). Never the only carrier of meaning.

---

## 9. Mockup data

The mockups use the **eight seeded scenarios** from `test-harnesses/seed-review-data.mjs`
(documented in `docs/reviewing-the-data.md`) — real engine output, not invented numbers — inlined as
plain JS objects in the mockup (per Amith: keep it simple, no fetch, opens from `file://`).

| # | Scenario | What it proves in the UI |
|---|---|---|
| 1 | plain taxed sale | the baseline decomposition ladder |
| 2 | two companies on one order | per-line company badges, two balanced JE groups from one document |
| 3 | annual subscription | term timeline, deferred revenue, recognition waterfall |
| 4 | event ticket | service period stamped from the event (U13 provenance rendering) |
| 5 | the everything-order | line promo + order promo + shipping + layered CA tax together — the ladder's hardest case (Net 320 on 400 of goods) |
| 6 | return of one unit from (1) | mirrored entry, tax given back, returnable-quantity math |
| 7 | paid order | allocation grid, rollups, capture JE |
| 8 | overpaid order | negative balance rendered as **available credit**, not as an error |

Using real numbers means the mockups double as acceptance criteria: if a built screen shows a
different total than its mockup, one of them is wrong and it's worth finding out which.

---

## 10. Angular build mapping

| Mockup surface | Angular realization |
|---|---|
| Shell frame | Explorer app nav items + `BaseResourceComponent` per category, left-nav shell inside |
| Any page | chrome trio + `<mj-page-header-interior>` for rail sub-pages (U8) |
| Money strip, stepper, JE preview, waterfall, party card, charge ladder | `BaseFormPanel` subclasses in slots + composed into the editor (U9) |
| Line detail drawer | `<mj-form-slide-in>` on `MJ_BizApps_Orders: Order Lines` |
| Confirm pre-flight | `<mj-form-dialog>` with a custom body (not an entity form — it's a projection, not a record) |
| Order editor | the ONE sanctioned whole-form `*Extended` override (§15.2 names it the pilot) |
| Everything else | generated forms + slots; `MJFormPresenterService.Open()` for overlays (U10) |
| Lists | `<mj-explorer-entity-data-grid>` / worklist component with column filters + preset chips (§15.5) |
| Dashboards | `BaseResourceComponent`, cheap counts, inline SVG marks (no chart lib) |

---

## 11. Gaps this design exposes

Named honestly, because each is a prerequisite the mockups will stub.

1. **No client-callable atomic order save.** `Lines`, `Charges`, `PromotionCodes`, `ManualDiscounts`
   are transient arrays on the **server** entity subclass (`OrderEntityServer`); a browser
   `Save()` marshals scalars only. A browser therefore cannot create an order with lines through the
   entity API at all, and doing it as N sequential saves violates guiding principle #4. **Needs:**
   `Orders.SaveOrder`, `Orders.ConfirmOrder`.
2. **No preview operation.** The thesis depends on it. `Orders.PreviewPrice` proves the pattern (D69:
   it runs the real pipeline, never a parallel one) but covers one line's price. **Needs:**
   `Orders.PreviewOrder` returning the full decomposition, and `Orders.PreviewConfirm` returning the
   pre-flight (JEs, subscription decision, grants, approvals, blockers) without writing.
3. **No origin/channel column on `OrderHeader`** (U18). `ExternalDocumentNumber` is a document
   number, not a provenance field, and inferring LXP from a null `SalesRepUserID` is guesswork.
   **Needs:** a nullable `OriginChannel` (or an `OrderSource` lookup, consistent with D36/D37's
   "lookup, not CHECK" precedent) plus `OriginExternalID`. Renewal-spawned orders (D55) and migrated
   orders (§17) want the same field, so this is not an LXP special case.
4. **No overdue worklist operation.** D32 names `Orders.GetOverdueWorklist`; it isn't built.
5. **`IsOverdue` is view-computed** (D32) — fine, but the UI must not sort or filter on it as if it
   were a column without confirming the view exposes it.

These are engine work, not UI work. Mockups stub them and annotate the call site, per Amith
2026-07-29: "stub out on mockups and otherwise where they would be called."

---

## 12. Build sequencing

**Now — mockups** (this wave):
1. Style kit + shell harness + inline scenario data
2. The three thesis screens: fast entry · full editor · confirm pre-flight
3. Orders: list · document · return · fulfillment · dashboard
4. Payments: entry · list · refund · credit · dashboard
5. Receivables: aging · overdue · subscriptions
6. Catalog: products · pricing · promotions · charges & tax
7. `index.html` gallery tying it together

**After sign-off — build:**
1. The three remote operations from §11 (prerequisite; nothing works without them)
2. `OriginChannel` schema addition + CodeGen
3. Shared components + `BaseFormPanel` set (U9) — build once, they carry every screen
4. Order editor pilot (`*Extended`), then fast entry
5. Payments + receivables surfaces
6. Catalog admin surfaces
7. Dashboards last (§15.7: they ship as-is and improve on feedback)

Validation per the master plan's discipline: cheap tiers before and after, GUI validation once after
the structural work, a demo artifact per vertical.
