# DEFERRALS — bizapps-orders

Time/dependency deferrals of master-plan scope. Per the planning system (§5.2, added 2026-07-14 on
Marcelo's ruling): **a deferral is a plan-time sequencing decision, NOT a master-plan contradiction** —
everything here is still to be implemented; the CA ledger is not the place for it. Entry: item · source ·
rationale · revisit trigger. Remove a row only when the item ships (note the plan) or Marcelo strikes it.

| Deferred item | Source | Rationale | Revisit trigger |
|---|---|---|---|
| Currency/FX columns + realized-FX emission (BO-D22, §5 FX, Phase G) | MOD-4 (Robert 07-10: "day one? No") | single-currency reality today | multi-currency activates |
| Product variants (SKU matrix) | BO-D32 (master's own v2 call) | heavier + rarer for SaaS | a variant-shaped product need |
| Metered/usage billing ENGINE (aggregation + overage invoicing) | BO-D36 (master v2) | pricing/product side ships in S5 | a metered consumer |
| ASC-606 bundle revenue-ALLOCATION engine | BO-D35 (master v2) | SSP fields + obligations ship in S5 | bundle selling goes live |
| Payment dispute case mgmt (evidence/won-lost) | BO-D47 (master v2) | chargeback = reversal Payment + Disputed status now | dispute volume |
| Gift-card cross-company redemption + breakage rev-rec | BO-D44 (master v1.5/v2) | single-company issue/redeem ships in S5/F7 | cross-company redemption need |
| Provider expansion: PayPal / Square / Authorize / Adyen | BO-D23/D29 (master v1.5/v2) | Stripe + Manual are the v1 providers | demand per provider |
| Statements / consolidated-bill packaged reports | BO-D45, §15 Q13 | presentation-layer reports; per-order rendered bill ships first | Jeremy asks / cutover reporting pack scope |
| Bulk bill/statement email send + bill.com delivery workflow | §15 Q8 + Q-D | **decision-gated**: delivery path (AIDP→BC→bill.com vs direct) undecided | Q-D decision (Robert/Amith) |
| Stripe REAL integration — recon + forensics log + idempotency stress suite (the DEEP half) | Phase C/H; Marcelo 2026-07-14 | **Stub-first, then the checkout subset (Marcelo 2026-07-14, LXP D8):** F3.5's success-stub ships FIRST and stays the default test provider; then the LXP-checkout-critical subset (PaymentIntent lifecycle + hosted checkout + webhook→capture) UN-DEFERS into F3 for LH4I launch. Reconciliation/forensics/stress remain deferred | Stripe integration research done + LXP launch window |
| CDP data migration (§13) | master §13 (aidp Stage 4) | external program dependency | aidp Stage 4 starts |
| Customer portal / storefront | §15 Q9 / §16 | out of v1 by master | v2 scoping |
| Lightweight BROWSER catalog config (lazy/paged products) for OrdersEngineBase | F0 engine split (2026-07-15) | `OrdersEngineBase.Config` now caches ALL products/categories (needed for booking resolution); fine for v1 catalogs, but a very large catalog would bloat the browser bundle/cache | a real catalog grows large enough to matter in the Explorer |
| F2b — FORMAL JE reversal linkage (EntryType='Reversal' + ReversesJournalEntryID + trg_JE_ReversalConsistency + per-company source-JE matching) | F2 (2026-07-15) | F2 books the correct MIRROR JE (flipped Dr/Cr, net-zero) marked at the ORDER level (OrderType=Return, ReversesOrderID) — the financial substance. Formal JE-to-JE marking needs a cross-app draft-contract field (ReversesJournalEntryID) + the reversal booking to look up the source order's per-company JEs and set EntryType='Reversal'. Contained but cross-app | picked up when the reversal audit trail (JE→JE) is needed, or alongside F3 credit-memo settlement |
| F1 fulfillment QUEUE — per-line Fulfiller flip Pending→Fulfilled + last-line auto-advance to Fulfilled | F1 (2026-07-15) | F1 does the auto-advance-on-Post decision (no-fulfillment → Fulfilled; else hold + mark lines Pending). The per-line flip workflow that completes a held order is OrderLine-save-driven + role-gated | F6/A2 permissions land (Order Fulfiller role) |
| F3 processing-fee JE leg — needs a "Processing Fee" GLAccountRole + company-level link seeded | F3 (2026-07-15) | Manual/stub payments have fee=0, so the fee leg (Dr Processing Fee) is coded but never exercised; a fee>0 payment fails-loud until the role+account are seeded | Stripe-real (F3.5b) or a real fee'd provider lands |
| F4 Subscription find-or-create/extend + renewal-order spawning (scheduled job) | F4 (2026-07-15) | F4 delivered the rev-rec RECOGNITION (waterfall + schedule + materialize). The Subscription-record lifecycle (find/extend on first Confirm) + the renewal-spawn scheduled job (renewals default Draft per Marcelo) are the remaining F4 pieces | subscription lifecycle prioritized / a renewal consumer |
| F7 bundle expansion + gift-card StoredValue/liability-JE + ProductBehavior plugin seam | F7 (2026-07-15) | F7 v1 shipped entitlement grants. Bundle fast-path (SourceBundleProductID explode), gift-card issue (StoredValueAccount + Dr Cash/Cr Gift-Card-Liability — needs a "Gift Card Liability" role seed), and the ProductBehavior ClassFactory seam remain (schema is ready) | a bundle/gift-card consumer |
| F3.6 dunning reminder DELIVERY channel + provider retry policy | F3.6 (2026-07-15) | overdue DETECTION + worklist shipped (Orders.GetOverdueWorklist). The reminder delivery (email / bill.com) is integration-phase, decision-gated (Q-D, Robert/Amith) | Q-D delivery-path decision |
| Daily materialization MJ Scheduled Action metadata row (auto-fires B3.2) | B3.2 (2026-07-15) | Accounting.MaterializeDueScheduledEntries is the invokable core; a daily Scheduled-Action row (metadata seed) is needed to auto-run it. The manual admin/op path works now | a scheduled-action seeding pass |

> **Struck 2026-07-14 (Marcelo):** *Pricing BUILD* — un-deferred (MOD-6 revised): tables → S5, engine →
> F9; UnitPrice direct entry stays the precedence base so baseline testing is never blocked.
> **Struck 2026-07-14 (Marcelo):** *Sales rules + approvals* — un-deferred; bizapps-tasks is believed ready
> (the batch-approval gate already runs on it). Now schema plan **S6** + feature plan **F8**.
> **Tax note (Marcelo 2026-07-14, re-affirmed after the LXP doc):** tax + FX stay deferred by
> complexity — baseline tests first, added later; **no tax stub** (even a stub is complex enough to
> become a blocker). **⚠ LXP dependency recorded (their D13/A4):** the LXP expects Orders to compute
> sales/use tax at checkout (~30-day launch window) and long-term wants a rate/exemption package — so
> this deferral now has a REAL consumer and a clock. The S4 Option-A-vs-B structure decision is a
> HIGH-PRIORITY open question with Robert (`plans/QUESTIONS.md#q21`); revisit trigger updated:
> Robert's structure ruling OR the LXP launch-scope call (A7), whichever first.
