# QUESTIONS — bizapps-orders (plans-level question stock)

> Structured per the questions convention (`~/MJDev/shared-plans/questions-convention.md`): stable
> append-only body + ONE derived priority index. **ANSWER-FIRST (restructured 2026-07-16, Marcelo
> ruling):** new entries LEAD with a **Proposed solution** (the action we are implementing) and
> PROCEED with it by default — the question is supporting info for the **Requested reviewer**;
> mark **⏸ HOLD** only where proceeding is expensive to reverse. Field order for NEW entries:
> Status · Requested reviewer · Features · Proposed solution · The question · Context to share ·
> What motivates this now (opt) · Fixed constraints (opt) · Additional context · Answer. Existing
> OPEN entries adopt the new shape when next touched; frozen entries are never edited. Trivially
> reversible micro-decisions do NOT get entries — they go in the active action plan's "Decisions
> taken" list. **Migrated 2026-07-16 from the instance stock** — original IDs + anchors preserved
> (never renumber); new questions append with the next free Qn.
> Distribution copies for the team: `~/MJDev/reports/team-questions-2026-07-16/`.

## Index — by priority (open only)

| Ask order | Q | Ask | Status |
|---|---|---|---|
| 1 | [Q22](#q22) | LH4I launch timing — AGENDA ITEM for Monday's Robert meeting (2026-07-20), not the doc | OPEN — proceeding ★HIGH |
| 2 | [Q25](#q25) | Robert+Jeremy — re-close seller-of-record: Amith's per-line-company AR + payment-side IC supersedes MOD-14 (building Amith's shape) | OPEN — proceeding ★HIGH |
| — | [Q23](#q23) | ANSWERED 2026-07-20 (written doc: role-GRANT visibility, not auto-involvement; owner-scoped RLS) | ANSWERED |
| 3 | [Q10](#q10) | Marcelo — branch strategy + diverged main (internal) | OPEN |
| — | [Q24](#q24) | category model — ANSWERED 2026-07-21 (Robert confirmed per-company rows; "crossing them, no") | ANSWERED |
| — | [Q21](#q21) | tax structure — ANSWERED (Option B durable shape; engine = buy; finance calls → Q22) | ANSWERED |
| — | [Q2](#q2) | owning-company field — ANSWERED (add Order.CompanyID; resolution rung; renames) | ANSWERED |

(Also open, tracked in the repo BACKLOG decision-needed roster: S7 coupons schema review — Robert ·
C.12 order numbering — Jeremy · renewals spawn mode — Jeremy/Robert · rev-rec cadence — Amith ·
invoice delivery + open-AR cutover — park with owners. Distribution doc:
`~/MJDev/reports/team-questions-2026-07-16/ORDERS-QUESTIONS.md`.)

*(Feature index removed 2026-07-16 per convention — each entry's **Features** field is the
queryable surface for "which questions touch feature X".)*

## Questions (append-only body)

<a id="q21"></a>
### Q21 · Tax structure for orders — ask Robert — added 2026-07-14 (reformatted 2026-07-16)
- **Status:** ANSWERED (Robert, 2026-07-16 draft-answers doc + his A4 position) — frozen. The two
  remaining FINANCE calls (launch-tax yes/no; engine selection) are NOT Robert's and move to
  [Q22](#q22) (LH4I launch-scope sitting).
- **Who to ask:** Robert (structure ruling); Amith context optional (he made the LXP D13 call)
- **Features:** ORD-K.1 (tax structure decision — gates K.2 / S4)
- **Background (self-contained):** Order tax is currently DEFERRED (Marcelo: complexity; baseline
  first — no stub). The schema already anticipates both candidate shapes: S1 ships
  `LineTax`/`LineTotalGross`, so either option slots in without reworking totals or JE booking.
- **What motivates this now:** the LXP decided 2026-07-14 that **Orders computes sales/use tax at
  checkout** (their D13) with a **~30-day launch window**, and long-term wants a sales-&-use-tax
  rate/exemption package (their A4, assigned Marcelo/Robert) — the structure choice needs a ruling
  so the deferral can end cleanly when scheduled.
- **The question for Robert:** (1) which structure — **Option A** (tax as an order line of a `Tax`
  ProductType: zero schema, seeds + engine only; jurisdiction reporting via accounting's existing
  tax tables at remittance) vs **Option B** (the master plan's durable shape: `ProductTaxCategory`,
  `Product.ProductTaxCategoryID`, `OrderLineTaxLine` per-jurisdiction breakdown, pluggable
  `TaxCalculationProvider` accounting-side) vs **A now → B** when provider work schedules (the
  schema plan's standing recommendation)? (2) is any tax launch-REQUIRED for LH4I, or can launch
  run tax-exempt/manual? (LH4I = 3 fixed digital tiers — low jurisdiction complexity, but
  nexus/digital-goods taxability is a real accountant question.) (3) long-term rate-package
  posture: build vs buy (provider integration)?
- **Context to share:** `meetings/2026-07-14 - LXP Requirements.md` D13/A4/§7.
- **Additional context (for a verifying agent):** `plans/action-plans/ActionPlan - Schema
  alignment...md` §4 (S4 options) · `plans/DEFERRALS.md` tax note.
- **Answer:** (1) **Option B's durable shape — skip A entirely** (a `Tax`-type order line is a fake
  catalog item with no per-jurisdiction breakdown; unwinding it is the rework S1 pre-paid to
  avoid): `ProductTaxCategory` + `OrderLineTaxLine` per-jurisdiction snapshot rows + the
  `TaxCalculationProvider` seam — but Orders does NOT calculate tax; a **third-party engine**
  (Stripe Tax / Avalara class) does, and our tables record what it returned (accounting MOD-18).
  Stripe Tax = natural first provider if launch needs tax (attaches to the checkout we already
  use). (2) Launch-required? **Explicitly a Jeremy/John finance call** — pull Stripe Tax forward
  OR ship tax-exempt/manual as an explicit decision, never a default (LH4I = 3 fixed digital
  tiers, low jurisdiction complexity, but digital-goods nexus/taxability is a real Jeremy
  question). (3) Rate package: **buy, not build** — the engine IS the rate package.
  Source: `meetings/2026-07-16 - marcelo-questions-draft-answers.md` §Q21. Routed onward: accounting MOD-18; K.1/K.2 feature rows; Q22.


<a id="q2"></a>
### Q2 · Company context on the Order — ask Robert — 2026-07-08 (narrowed 2026-07-13; reformatted 2026-07-16)
- **Status:** ANSWERED (Robert, 2026-07-16 draft-answers doc) — frozen. (The JE-splitting half was
  already RESOLVED via orders MOD-11 / accounting MOD-12.)
- **Who to ask:** Robert
- **Features:** ORD-C.1 (order entity shape), ORD-J.1 (multi-company orders)
- **Background (self-contained):** `Order` deliberately has NO company column — an order is
  multi-company through each line's resolved `GLAccount.CompanyID` (MOD-3); resolution walks
  product → category tree → company default. Consequence (Amith's "Izzy" example, OQ-I): a
  company-LEVEL revenue default can't be reached when a product/category link misses, because
  there's no company on the order to resolve against.
- **The question for Robert:** (1) does Order carry an OWNING-company field? (He leans yes — "a
  company owns an order"; if yes, that's an S1 amendment against MOD-3's no-company-columns.)
  (2) how should the company-level revenue default resolve when a product/category link misses —
  require reaching a link at product/category level (current behavior, fails loudly at Confirm),
  or resolve via the new owning-company field?
- **Context to share:** the GL-mapping mockup page (the loud unresolved-mapping tripwire current
  behavior produces).
- **Additional context (for a verifying agent):** amendment OQ-I; `OrdersEngine.ResolveAccount`.
- **Answer:** (1) **YES — add `Order.CompanyID`** (owning company; owns the customer relationship +
  document, defaulted from the sales channel; does NOT override line-level revenue ownership).
  Named plain `CompanyID`; `Product.OwningCompanyID`/`Subscription.OwningCompanyID` rename to
  plain `CompanyID` too (role-qualified names only where the role is the point). (2) Resolution
  walk gains a final rung: product → category tree → **owning-company default** (Amith's "Izzy"
  case); if even that misses, keep failing loudly — the tripwire stays. Landed as the MOD-3
  revision. Source: `meetings/2026-07-16 - marcelo-questions-draft-answers.md` §Q2.

<a id="q10"></a>
### Q10 · Orders branch strategy + diverged main — ask Marcelo — 2026-07-08 (reformatted 2026-07-16)
- **Status:** OPEN (internal process — not for team distribution)
- **Who to ask:** Marcelo
- **Features:** cross-cutting (process)
- **Background (self-contained):** accounting PRs target `next`; the orders repo's intended target
  is unstated, and the local `origin/main` in the central clone is diverged (ahead 13 / behind 14).
- **The question for Marcelo:** (1) orders PRs target `next` or `main`? (2) is the diverged local
  `main` intentional — reset it before any main-targeted work?
- **Additional context (for a verifying agent):** `repos/apps/bizapps-orders` clone is on `main`
  (diverged); the instance worktree is on `feature/accounting-integration`.
- **Answer:** _(pending)_

<a id="q1"></a>
### [ANSWERED] Q1 — Order "Posted": posted to GL/ERP, or to the accounting subledger? — 2026-07-08
- Status: ANSWERED
- Ask: Robert
- Asked by: accounting-engine-dev agent (2026-07-08)
- Where: bizapps-orders + bizapps-accounting · accounting-engine-dev · feature/accounting-integration, feature/je-entry-engine
- Question: JEs already book on the first transition to `Confirmed`. What does the order-status **`Posted`** mean — posted to the **GL/ERP** (after batch dispatch → JE `GLPosted`) or posted to the **accounting subledger** (JE booked/`Pending` on Confirm)? And what should advance an order `Confirmed → Posted` (a link-back from accounting, a manual step, or does the status collapse)?
- Context to share: Orders currently books the JE on Confirm and leaves the order at `Confirmed`; nothing advances it to `Posted`. Amendment S4 supersedes BO-D8's "`Posted` is the commit."
- Additional context: `plans/2026-07-02-engine-meeting-amendment.md` (S4); `OrderEntityServer` books on `Confirmed`; JE lifecycle Pending→Batched→GLPosted proven in `order-to-glposted.ts`.
- Answer: **Robert + Marcelo's notes (2026-07-08 meeting):** `Posted` = **the journal entries are IN the accounting subledger** (created on Confirm). NOT batching, NOT GL-posting (`Batched` = the GL lock). `Confirmed` triggers the posting op, so Confirmed→Posted is near-instant. Keep the flow **linear** for v1 (each stage required; can't Fulfill before Posted; Void only from Draft/Quoted, else reversing/credit order). => task #20 is unblocked: the order should reach `Posted` once the JE books. Recorded in `bizapps-orders/plans/2026-07-08-robert-meeting-decisions.md` D1. See Q11 for the deferred order-status/financial-status split.

<a id="q11"></a>
### [ANSWERED] Q11 — Split order-status vs financial-status? (fulfillment vs GL are independent) — 2026-07-08
- Status: ANSWERED (deferred for v1)
- Ask: Robert
- Asked by: accounting-engine-dev agent (2026-07-08)
- Where: bizapps-orders · accounting-engine-dev · feature/accounting-integration
- Question: Robert flagged (2026-07-08) that **fulfillment** and **financial (GL)** progress are independent concerns, so the single overloaded `Order.Status` may want to become **two fields**: an order status (draft/quoted/confirmed/fulfilled/voided) + a **financial status** (created/posted/…/batched). He leaned toward keeping the single **linear** flow for v1 and revisiting. Do we split now or keep the single status for v1? If split, what are the financial-status values (does it include `Batched`)?
- Context to share: Today `Order.Status` is one linear list (Draft→Quoted→Confirmed→Posted→Fulfilled/Voided) that overloads order + financial progress. An order can conceptually be fulfilled independent of GL/batch progress.
- Additional context: 2026-07-08 transcript (~12:10–13:45); `bizapps-orders/plans/2026-07-08-robert-meeting-decisions.md` D2. Deferred for v1; kept linear per D1.
- Answer: **Marcelo (2026-07-08): DEFER for v1 — keep the single linear `Order.Status`; revisit the order-status / financial-status split post-baseline.**

<a id="q16"></a>
### [ANSWERED] Q16 — Fulfilled stage ↔ deferred revenue: what does moving an order to Fulfilled do? — 2026-07-08
- Status: ANSWERED (Robert, 2026-07-09)
- Answer: **Robert (2026-07-09): fulfillment and revenue recognition are DISCONNECTED.** Fulfillment = the
  delivery-of-value event (physical: product in hand + boxed + shipping label; electronic/contract: can be
  immediate — auto-fulfill when no line needs physical fulfillment). It is NOT the deferred-revenue recognition
  trigger. **Deferred revenue is recognized by SCHEDULED TRANSACTIONS**, not the Fulfilled flip: a scheduled
  transaction moves an amount out of Deferred Revenue into Revenue on its date — one per event (conference =
  event date) or one per month (subscription = 1/12, GAAP monthly buckets). Three things create JEs: orders,
  payments, scheduled transactions. So: **do NOT book a recognition JE on Posted→Fulfilled** (the earlier intent
  is superseded); keep the Fulfilled UI as a delivery-of-value marker. This validates accounting's planned
  **AD-11 `ScheduledJournalEntry`** rev-rec engine (backlogged; the methodology is owned by Orders/subscriptions
  upstream). See `bizapps-orders/plans/2026-07-09-robert-meeting-decisions.md` D-O1.
- Ask: Robert — **tomorrow's meeting** (Marcelo won't recall the details cold — context below)
- Asked by: accounting-engine-dev agent (Task 30, orders kanban) · feature/accounting-integration
- Where: bizapps-orders + bizapps-accounting · accounting-engine-dev · feature/accounting-integration, feature/je-entry-engine
- Question: The order lifecycle ends Draft→Quoted→Confirmed→Posted→**Fulfilled**. Marcelo's intent: moving an order
  **Posted → Fulfilled** should **recognize (move over) any DEFERRED revenue that is NOT on a scheduled recognition
  system**. We need Robert to define the accounting mechanics: (a) When an order confirms, deferred-revenue products
  post to a **Deferred Revenue** liability (not Revenue). At **Fulfilled**, for products WITHOUT a rev-rec schedule,
  should the system book a recognition JE (**Dr Deferred Revenue / Cr Revenue**) for the full deferred amount? (b) How
  do we tell "scheduled" vs "recognize-at-fulfillment" — off `Product.RevenueRecognitionType`, or a separate flag? (c)
  Is **Fulfilled** the correct trigger for this recognition, or should recognition be independent of the order's
  fulfillment status? (d) What happens to scheduled deferred revenue at fulfillment — nothing (the schedule owns it)?
- Context to share: Orders books a balanced JE on first **Confirmed** (Dr AR / Cr Revenue-or-Deferred-Revenue per line).
  "Immediate" revenue goes to Revenue; "deferred" goes to a Deferred Revenue liability. There is (as yet) no rev-rec
  schedule engine wired, so deferred amounts currently just sit in the liability. Marcelo wants **Fulfilled** to be the
  point where un-scheduled deferred revenue gets recognized. He asked to capture this so he doesn't forget it before
  the meeting.
- Additional context: `Product.RevenueRecognitionType` (the generated union); `orderJournalDraft.ts` (Dr/Cr assembly);
  accounting's Deferred Revenue account + the (planned) rev-rec schedule. Drives Task 30 (the Posted→Fulfilled
  confirmation dialog wording + whether fulfillment books a JE).
- Answer: _(see top of entry)_

<a id="t48"></a>
### [ANSWERED] T48 — Fulfilled → deferred-revenue JE contradicts Robert ruling D-O1 (Task 48) — 2026-07-10 → 2026-07-13
- Status: ANSWERED (Robert 2026-07-13 meeting ruling; Marcelo adopted + directed this update)
- Raised: 2026-07-10 · branch: feature/accounting-integration (bizapps-orders) · instance: accounting-engine-dev
- Question (original): should Posted→Fulfilled recognize deferred revenue by booking a NEW journal entry,
  contradicting Robert's D-O1 (fulfillment DISCONNECTED from revenue recognition)?
- Answer: **D-O1 stands — do NOT book a recognition JE on the Fulfilled flip.** Robert's 2026-07-13 ruling
  (MOD-11 / `meetings/2026-07-13-robert-meeting-decisions.md` D1) specifies the mechanism definitively:
  deferred + scheduled revenue is recognized via **FORWARD-DATED scheduled journal entries created up-front
  at booking-lock** — a $1,200 annual sub yields 12 × $100 entries dated on the monthly anniversaries; an
  event product yields ONE entry dated the event date; each is a Dr Deferred Revenue / Cr Revenue transfer
  that materializes when its date arrives and is picked up by batches by date window. Marcelo: "so much
  simpler… a much better approach" — adopted. The Fulfilled-recognition JE + side-panel display from the
  original Task 48 ask will NOT be built; the order side panel can instead SHOW the line's scheduled-entry
  waterfall (orders UI plan §1/§6, feature plan F4).


## Entry template (Q22/Q24 model — ratified 2026-07-16)
```markdown
<a id="qN"></a>
### QN · <title> — ask <person> — added <date>
- **Status:** OPEN
- **Who to ask:** …
- **Features:** <FEATURE-LIST IDs>
- **Background (self-contained):** …
- **What motivates this now:** _(optional)_
- **Fixed constraints (not up for debate):** _(optional)_
- **The question for <person>:** (1) … (2) …
- **Context to share:** …
- **Additional context (for a verifying agent):** …
- **Answer:** _(pending)_
```

<a id="q22"></a>
### Q22 · LH4I launch-scope sitting — BAO-ready date (A7) · tax-at-launch · coupon surfaces — review: Robert/Jeremy/John/Ethan — added 2026-07-17
- **Status:** OPEN — proceeding · **routed to MONDAY'S MEETING with Robert (2026-07-20) as a live
  agenda item, NOT the question doc** (Marcelo 2026-07-18). Removed from the distribution package;
  bring the roadmap (slice board + V2 gate) as the talking basis.
- **Requested reviewer:** Marcelo convenes; Robert + Ethan (date), Jeremy + John (tax call),
  John/Sidecar marketing (coupon surfaces & shapes)
- **Features:** ORD-N.1 (LH4I launch composite), ORD-K.1/K.2 (tax), ORD-B.3 (coupons), MOD-13
- **Proposed solution (what we are implementing):** the LXP launch decisions are locked (D1–D16:
  Orders exclusive, LXP→Orders DIRECT for launch per MOD-13); the one open item is **timing** —
  their A7 asks Robert + Marcelo for "a realistic date for a minimal BizApps Orders that can
  support LH4I" (products/tiers, coupons, entitlement-via-ProductType, payment, DueDate/overdue,
  read/notify path). We are building toward that scope in validation-first order per
  **`plans/ROADMAP-lxp-launch.md`** (the scope basis for the date estimate); the date itself is
  Marcelo's + Robert's to state after reviewing the roadmap's V0–V2 tiers. Bundled into the same
  sitting because they gate the same launch scope:
  (a) **Tax at launch?** (Jeremy/John — explicit decision, never a default: pull Stripe Tax
  forward, or launch tax-exempt/manual; Q21's answer holds the structure either way);
  (b) **Coupon surfaces + shapes** (Robert's three A2 questions to Sidecar: any coupon surface
  beyond the Stripe-hosted checkout at launch? which shapes are actually used — percent / fixed /
  order-level / repeating, incl. today's ASAE coupon config? does the LXP need to display/validate
  codes in its own UI, or is Stripe-page entry fine as today?).
- **The question:** (1) BAO-ready date for the minimal LH4I scope — commit or give Ethan the
  fast-follow signal (his §8 explicitly supports Teams-first if the date slips). (2) Tax at LH4I
  launch: yes (Stripe Tax pulled forward) or no (explicit tax-exempt launch)? (3) The three coupon
  questions above.
- **Context to share:** `meetings/2026-07-14 - lxp-commerce-and-fulfillment 2.md` §8 (their lean +
  contingency) · `plans/ROADMAP-lxp-launch.md` · Q21's answer (tax structure ruled).
- **What motivates this now:** the ~30-day LXP launch window; Ethan's doc names this "the one open
  item."
- **Additional context (for a verifying agent):** UPD-8 (coupon launch path), MOD-13, accounting
  MOD-18.
- **Answer:** _(pending)_

<a id="q23"></a>
### Q23 · Cross-company order visibility — if an order owned by Company A contains Company B's products, can B's users see it? — review: Robert — added 2026-07-17
- **Status:** ANSWERED (Robert, 2026-07-20 Monday meeting) — frozen.
- **Requested reviewer:** Robert (pairs with the `UserCompanyRole`/RLS design he owns — acct Q22
  answer; Jeremy input welcome on accounting-parity expectations)
- **Features:** ORD-C.1 (Order.CompanyID), ORD-M.1 (orders RLS), ORD-J.1 (multi-company orders)
- **Proposed solution (what we are implementing):** **YES — every INVOLVED company can see the
  order.** With `Order.CompanyID` now the owning company (MOD-3 rev.), visibility scoping should
  key on *involvement*, not just ownership: a user may see an order when their granted companies
  (per the `UserCompanyRole` table) include the owning company OR any company that owns a line
  (via the line's resolved account / the per-company JEs). Rationale: B's accountants must be able
  to trace B's revenue and B's JE legs back to the source order; hiding the order from them breaks
  drill-through and reconciliation. The RLS filter shape is an involved-companies subquery
  (owning-company column + line-company derivation); write access can stay owner-scoped even
  while read is involvement-scoped.
- **The question for Robert:** (1) Confirm involvement-based READ visibility (vs owner-only).
  (2) Should WRITE (edit/confirm/void) be owner-company-scoped only? (Our lean: yes.) (3) Does the
  line-company derivation need materializing (a stored per-line company) for the RLS filter to be
  efficient, or is the resolved-account join acceptable? (Ties into his Izzy/ACR dig.)
- **Context to share:** acct Q22/Q24 answers (`UserCompanyRole` design); MOD-3 revision;
  MOD-11 (one JE per company).
- **What motivates this now:** `Order.CompanyID` lands with the V1 schema amendments — the RLS
  story should be designed against the same shape.
- **Additional context (for a verifying agent):** orders MOD-3/MOD-11; acct MOD-15;
  `OrdersEngine.ResolveAccount`.
- **Answer (Robert, 2026-07-20 — his WRITTEN answers doc supersedes the looser in-meeting
  version on point 1):** (1) **Visibility is ROLE-GRANT-DRIVEN, not auto-involvement** — a user
  sees an order only when their `UserCompanyRole` grants include the order's OWNING company;
  sees a product only when granted that product's company. So adding B's product to an order
  requires B-product view permission, and B's users do NOT automatically see A's order off a
  shared line (supersedes this entry's involvement-based proposal). BCHQ order-desk users get
  all companies (deployment config, not code). Accounting drill-through survives regardless (the
  sister's revenue is in her own JE). (2) WRITE stays owner-company-scoped. (3) RLS filter =
  owner-scoped ONE leg (no involvement EXISTS clause); `OrderLine.CompanyID` is NOT an RLS need
  but IS added as a denormalized perf/reporting column (MOD-3 rev-3). Routed onward: MOD-3
  rev-3 · K.2/A2 filter shape · S1.

<a id="q24"></a>
### Q24 · Category model RESOLVED: per-company category rows + identical-name display-collapse — review: Robert — added 2026-07-21
- **Status:** ANSWERED (Robert, 2026-07-21 meeting) — frozen. **CONFIRMED, unambiguously:**
  categories are company-level — "even if they have the same t-shirts… five companies, you're
  going to have 5 t-shirt categories… this idea of crossing them, no. I don't see a lot of
  value in the share." His 2026-07-20 written "shared" phrasing was doc-interpretation drift,
  acknowledged in-meeting. Name-collapse display stands (Marcelo, unchallenged). Routed onward:
  UPD-5 item 1 confirm cleared; S1 proceeds as planned.
  *(Original status at mint: OPEN — proceeding, Marcelo ruling w/ Robert review pending.)*
- **Requested reviewer:** Robert
- **Features:** ORD-A.2 (ProductCategory), ACC-B (GL mapping), S1 slice
- **Proposed solution (what we are implementing — Marcelo, 2026-07-21, CONFIRMED GO):**
  **Option 1 — every company owns its own category ROWS** (`ProductCategory.CompanyID` NOT
  NULL). **The load-bearing UX mechanic is GROUPING BY NAME:** wherever categories display
  across companies, rows with identical names collapse into ONE visual entry (e.g.
  "Memberships" once, with the supporting companies listed under it) — the shared-label feel
  without any shared DB object. The UI (one visual "Memberships" entry listing the
  companies that carry it; pickers scope to the product's company so no verbose "name (company)"
  noise for single-company users). The rejected alternative was a **category REGISTRY** (shared
  name table + per-company overrides): simpler naming consistency, but it creates a shared
  document across companies (permissions complexity), and a category created by one company
  surfacing for all others is surprising behavior. The permissions angle decides it: company-
  scoped rows are the only shape that RLS-scopes cleanly with everything else.
- **Why this dissolves your two statements:** the meeting ruling (company-owned categories) is
  the SCHEMA; the written doc's "shared label with per-company routes" is the UX — delivered by
  name-collapse display instead of a shared DB object. Naming consistency comes from soft
  suggestion (autocomplete over category names visible to the user), not a registry row.
- **The question for Robert:** confirm, or name a case where a true shared registry object is
  needed (e.g. cross-company reporting rollups by category NAME — under option 1 those group by
  name string, not by ID).
- **Additional context (for a verifying agent):** S1 plan P1 (the un-held bullet); UPD-5 item 1
  (accounting); `meetings/2026-07-20-Robert-q23-q38-q39-answers.md` §Q38.3 vs the meeting
  transcript ~13:00.
- **Answer:** _(pending)_

<a id="q25"></a>
### Q25 · Seller-of-record vs per-line-company AR — re-close with Robert/Jeremy after Amith's booking rework — review: Robert + Jeremy — added 2026-07-21
- **Status:** OPEN — proceeding (building Amith's shape now)
- **Requested reviewer:** Robert (his 2026-07-20 ruling is superseded) + Jeremy (his finance
  co-sign was still pending on the old shape)
- **Features:** ORD-E (booking JEs), ORD-J.1 (multi-company orders), ACC intercompany (MOD-5 family)
- **Proposed solution (what we are implementing):** Amith's 2026-07-21 architecture (orders
  MOD-15): every order line books its OWN single-company JE — Dr the LINE company's AR, Cr its
  revenue/DefRev — and **orders create NO due-to/due-from; intercompany starts on the PAYMENT
  side** ("you don't know about intercompany anything until you get cash"). This replaces
  Robert's 2026-07-20 seller-of-record booking shape (owner holds the FULL customer AR; mirrored
  IC legs at booking; MOD-14). The customer-facing invoice can still present as one document
  (the order's JE is a virtual aggregation), but the LEDGER holds per-line-company AR until
  payment allocates cash and raises the IC legs.
- **The question for Robert/Jeremy:** (1) Confirm you're aligned with booking-side AR sitting
  with each line's company and IC deferred to payment (Amith's model) — or does the
  seller-of-record concern (one receivable, sisters never chase the customer) need the payment
  engine to REALLOCATE at capture rather than at booking? (2) Jeremy: does the tax-remit
  position (selling company collects/remits) survive unchanged under per-line-company AR?
- **Context to share:** orders MOD-15 vs MOD-14 (superseded, retained text); the 2026-07-21
  Amith meeting (t-shirt/Yeti walkthrough ~minute 4–8); acct Q39's frozen answer.
- **What motivates this now:** MOD-14 was priced into the BAO date and flagged as real scope
  growth — Amith's model shrinks booking scope (no IC legs, no IntercompanyFlow at booking) and
  moves that scope to payments; the roadmap V1.7 row needs re-costing either way.
- **Answer:** _(pending)_
