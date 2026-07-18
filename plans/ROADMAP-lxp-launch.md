# ROADMAP — LXP launch (validation-first)

> Created 2026-07-17 (Marcelo directive). Cross-app: orders-led, accounting-supporting — the
> accounting tiers reference `ACC-*` FEATURE-LIST IDs. This is the **scope basis for the A7
> BAO-ready-date answer** ([Q22](QUESTIONS.md#q22)) and the working order-of-attack for the build.
> DERIVED planning surface (like FEATURE-LIST): the plan chain + Ethan's requirements doc are the
> authorities. Sources: `meetings/2026-07-14 - lxp-commerce-and-fulfillment 2.md` (D1–D16 + §8),
> MOD-12/13 + UPD-6..10 (orders), MOD-15..18 + UPD-2 (accounting), both FEATURE-LISTs @ 2026-07-17.

## Slice board (LIVE — update at every slice mint + close-out)

| Slice | Scope | Status | Plan | Blocked on |
|---|---|---|---|---|
| S0a | V0 orders spine validation (cheap tiers) | IN PROGRESS (accounting agent testing wave) | agent ledgers | T36 ✅ answered (per-run seed) |
| S0b | V0 accounting spine validation (cheap tiers) | IN PROGRESS (same wave) | agent ledgers | — |
| S1 | V1.1+V1.2 order lineage & product ownership (orders schema) | QUEUED — parallel w/ S2 | to mint | S0 baseline |
| S2 | V1.3+V1.4 batch rework + posting date (+ V1.6 approver-enforcement rider) | QUEUED — parallel w/ S1 | to mint | S0 baseline |
| S3 | V1.5 forward-dated rev-rec (spans both repos) | QUEUED | to mint | S1+S2 |
| S4 | Full GUI validation pass (section-by-section, ONCE, post-structural) | QUEUED | to mint | S3 |
| S5+ | V2 LH4I feature slices (per roadmap rows; entitlement read path pulled early) | QUEUED | to mint per row | gates per row |

Sequencing rule (Marcelo 2026-07-18): cheap tiers validate before AND after structural changes
(nearly free); GUI validates ONCE, after them (expensive, weakest agent skill). GUI development
beyond validation is deferred to feature-enabling changes only.

## The premise: we start from (approximately) zero VALIDATION

Most launch-relevant features exist as code, but: (a) many carry the **◇ claimed-not-verified**
flag (agent-ledger statuses pending the waived Task 65b sign-off review); (b) the 2026-07-14/17
rulings just **invalidated real chunks of the as-built shape** (multi-company batches, the
ScheduledJournalEntry bridge, single `Order.JournalEntryID`, unenforced approval deciders);
(c) the UI wave is mid-flight. So this roadmap treats **"built" as a claim, not a fact** — every
tier's exit gate is validation (committed tests green + a demo artifact), not code merged. Order
of attack is driven by **Ethan's minimal-BAO list** (§8: products/tiers · coupons ·
entitlement-via-ProductType · payment · DueDate/overdue · read/notify path), then by what the
rulings force us to rework before that surface can be trusted.

**Ethan's contingency frame (locked):** LXP→Orders DIRECT at launch (MOD-13); if the date slips,
Teams-first launches with zero checkout dependency and LH4I self-serve follows BAO — so a slipped
date degrades gracefully. The date we owe (A7) = end of **V2**.

---

## V0 — Re-validate the spine (nothing new; prove what we claim)

*The order→accounting core on the CURRENT schema, exactly as the test protocol demands. This is
cheap (harnesses exist) and it converts every ◇ on the spine into a verified fact — or a bug list.*

| # | What | Features | Gate |
|---|---|---|---|
| V0.1 | Order lifecycle: Draft→Confirmed→Posted (+skip, void-from-Draft, totals) | ORD-C.2–C.5 | tier 1–3 harnesses green |
| V0.2 | JE booking on first Confirm: one JE per company, atomic, failure-blocks-Confirm | ORD-E.1–E.3, E.7 | order-to-je live harness green (multi-company case incl.) |
| V0.3 | A/R surface: TotalGross/AmountPaid/Balance/DueDate/PaymentStatus + IsOverdue | ORD-D.2, D.3 | exact-value API checks |
| V0.4 | Payments happy path (manual provider + capture JE + application) | ORD-F.1–F.3, F.6–F.7 | tier 2/3 green |
| V0.5 | Batch build→approve→(mock) dispatch on current schema | ACC-D.1–D.4 | accounting harnesses green |
| V0.6 | Entitlement grant emission on Posted (definitions → grants w/ beneficiary) | ORD-I.1 | tier 2/3 checks + a grant-read demo |

**Exit demo:** one scripted end-to-end run (order entry → confirm → JEs → batch → approve) with
real numbers, recorded as the V0 demo artifact. Known-broken items become the V1 worklist.

## V1 — Rework what the rulings just changed (launch-blocking correctness)

*The 2026-07-14/17 MODs made parts of the as-built shape wrong. These are schema/engine changes —
do them BEFORE building more on top.*

| # | What | Ruling | Notes |
|---|---|---|---|
| V1.1 | `Order.CompanyID` + company renames + **line-company derivation from `Product.CompanyID`** + resolution walk re-anchored to the product's company (+ same-company account validation per acct Q38 lean) | MOD-3 rev-2 | S1 amendment; tripwire stays; ⚠ resolution perf/complexity deep dive backlogged |
| V1.2 | `OrderJournalEntry` junction (real FKs) replaces `Order.JournalEntryID`; idempotency = order-already-booked | UPD-7 / MOD-11 | |
| V1.3 | Single-company batches: batch header CompanyID, line company dropped, triggers folded, `buildBatch(companyId, dateFilter)` | ACC MOD-15 | Jeremy's 2 conditions surface in config/UI |
| V1.4 | Batch `PostingDate` (singular, accountant-set; one aggregated JE per batch; netting key GLAccount × dims) + closed-period HOLD/flag exceptions | ACC MOD-16 (rev. — Amith model, Q37) | |
| V1.5 | Forward-dated rev-rec JEs replace ScheduledJournalEntry (+ default cutoff=today filter; correcting-order netting) | MOD-12 / ACC MOD-17 | retires the G.3/G.4 + ACC E.1–E.5 as-built |
| V1.6 | Approval-decider enforcement: `recordDecision` requires Accounting Approver for the batch's company (minimal `UserCompanyRole` table) | Q6/Q22 answers | REQUIRED "before anything beyond dev" — Robert. Full RLS stays later (K.2) |

**Exit gate:** V0's spine harnesses re-run green ON the new shape (downstream re-run discipline) +
a delta demo (multi-company order → per-company JEs → per-company batches → per-company approvals).

## V2 — The LH4I minimal-BAO surface (what Ethan's launch needs)

| # | What | Features | Notes |
|---|---|---|---|
| V2.1 | Products: the 3 LH4I tiers + learning-track bundles seeded & validated (ProductType behavior, bundle fan-out of grants) | ORD-A.1–A.6, I.1 | D11/D12; Robert's A3 questions to Ethan gate the grant SHAPE freeze |
| V2.2 | Stripe REAL — LXP-checkout subset: PaymentIntent lifecycle + hosted checkout + webhook→capture | ORD-F.4, F.10 | the critical un-deferred build |
| V2.3 | Coupons launch path: provider recording (order-level + line `DiscountAmount`) + Stripe adapter | ORD-B.3 (UPD-8) | schema freeze after the 2 investigations + Sidecar answers (Q22) |
| V2.4 | Entitlement read/notify path for the LXP: Scheduled-Job + Record-Set-Processing poll (D14) + the grant read contract | ORD-I.2 | shape per Robert's A3 answers |
| V2.5 | Overdue/grace: `DunningGracePeriodDays` config + notify-CS worklist | ORD-G.7, G.8 | D15/D16 |
| V2.6 | Subscription booking for tiers (find-or-create at Confirm) + forward-dated rev-rec on the V1.5 shape | ORD-G.1, G.2, G.11, G.5 | renewals themselves = V4 (annual terms; not a 30-day need) |
| V2.7 | Tax IF the Q22 finance call says launch-with-tax: Stripe Tax as first provider on the Option-B shape | ORD-K.1/K.2 | else explicitly tax-exempt launch |

**Exit gate = the A7 date target:** a full LH4I dry run — buy a tier with a coupon through Stripe
checkout (test mode) → order books → entitlement grants emitted → LXP-style poll reads them →
sub + forward-dated rev-rec staged → payment captured → A/R correct. Committed harness + recorded
demo. **This gate passing IS "BAO ready for LH4I."**

## V3 — Sidecar finance backend (parallel track; NOT LXP-blocking)

| # | What | Features | Notes |
|---|---|---|---|
| V3.1 | BC API dispatch: journalLines v2.0, OAuth client-credentials, write-scoped registration | ACC-D.10 (UPD-2) | external dep: Jeremy's company-config standardization |
| V3.2 | Closed-period exception flagging (hold-and-flag on BC rejection) | ACC-D.9 (MOD-16) | |
| V3.3 | Posting-date settability verified with a real test post | UPD-2 | Jeremy: "worth testing to verify" |
| V3.4 | Intercompany rec: "posted in source, not yet in BC" reconciling-item type | ACC-H.3 | Jeremy's MOD-15 condition (2) |

## V4 — Fast-follows (post-launch, already ruled)

Orders-native Coupon entity (as another provider) · BCSaaS wrap (D4) · renewals spawning w/
`RenewalSpawnStatus` (UPD-9) · full company-scoped RLS + role screens (ACC-K.2/K.3, Q22 answer
shape) · invoice email delivery (UPD-10a) · CDP open-AR migration per the UPD-10 cutover rule ·
Avalara-class tax + exemption certs · seats/Model-2 readiness (design-for only) · Teams (LH4T)
admin tooling (mostly LXP-owned; A5/A6).

---

## Slice-ordering influences (Marcelo, 2026-07-17)

- **Dashboards ship as-is** — Amith: "don't put too much more work into this… improve based on
  user feedback." UI polish is de-prioritized; correctness tiers (V0–V2) and the forms-first work
  (UPD-11/acct UPD-3) take the slots.
- **The forms design pass** (UPD-11.4) slots before the form-family build-out — it shapes every
  drill-in surface, so running it early prevents rework across V2 screens.

## Standing risks the date must price in

1. **The V1 rework is real schema surgery** on shipped tables (batches, scheduled entries, order
   linkage) — with migrations, codegen, and the downstream re-run of every spine test.
2. **The UI wave is mid-flight** on the pre-MOD-15/16/17 shape (see the UI plan §8 2026-07-17
   note) — batch/scheduled-entry screens must not run ahead of V1.
3. **External answer dependencies:** Robert's A3 entitlement questions (Ethan), coupon Sidecar
   answers (John/marketing), the Q22 finance calls, Jeremy's BC config standardization.
4. **Honesty rule:** nothing on this roadmap is "done" until its gate's tests are green and the
   demo artifact exists — a ◇ is a claim.
