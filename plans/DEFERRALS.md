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
| Stripe REAL integration (live API + webhooks) + recon + forensics log + idempotency stress suite | Phase C/H; Marcelo 2026-07-14 | **Stripe IS in plan (F3.5)** — ships first as a **success-stub provider** (like the BC dispatch stub) so payment flows test end-to-end; the real API wiring lands after integration research | Stripe integration research / LXP go-live |
| CDP data migration (§13) | master §13 (aidp Stage 4) | external program dependency | aidp Stage 4 starts |
| Customer portal / storefront | §15 Q9 / §16 | out of v1 by master | v2 scoping |

> **Struck 2026-07-14 (Marcelo):** *Pricing BUILD* — un-deferred (MOD-6 revised): tables → S5, engine →
> F9; UnitPrice direct entry stays the precedence base so baseline testing is never blocked.
> **Struck 2026-07-14 (Marcelo):** *Sales rules + approvals* — un-deferred; bizapps-tasks is believed ready
> (the batch-approval gate already runs on it). Now schema plan **S6** + feature plan **F8**.
> **Tax note (Marcelo 2026-07-14):** tax + FX stay deferred by complexity — baseline tests first, added
> later; **no tax stub** (even a stub is complex enough to become a blocker).
