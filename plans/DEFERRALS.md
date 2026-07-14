# DEFERRALS — bizapps-orders

Time/dependency deferrals of master-plan scope. Per the planning system (§5.2, added 2026-07-14 on
Marcelo's ruling): **a deferral is a plan-time sequencing decision, NOT a master-plan contradiction** —
everything here is still to be implemented; the CA ledger is not the place for it. Entry: item · source ·
rationale · revisit trigger. Remove a row only when the item ships (note the plan) or Marcelo strikes it.

| Deferred item | Source | Rationale | Revisit trigger |
|---|---|---|---|
| Pricing BUILD: `PriceList`/`ProductPrice`/`PriceTier` + resolution engine (§4.1, BO-D33) | MOD-6 (Robert 07-08 D3; ex-CA-1) | order-line `UnitPrice` suffices for the baseline; model is the locked target shape | catalog pricing demanded (Robert re-flagged 07-10) |
| Currency/FX columns + realized-FX emission (BO-D22, §5 FX, Phase G) | MOD-4 (Robert 07-10: "day one? No") | single-currency reality today | multi-currency activates |
| Sales rules + approvals: `SalesRule`/`SalesAuthority` + Approval-Request Tasks (§4.8, §10, BO-D17/D27) | BO-D29 sequencing | **dependency**: bizapps-tasks #8 (approval features) not landed | tasks #8 lands → schema plan S6 + feature phase |
| Product variants (SKU matrix) | BO-D32 (master's own v2 call) | heavier + rarer for SaaS | a variant-shaped product need |
| Metered/usage billing ENGINE (aggregation + overage invoicing) | BO-D36 (master v2) | pricing/product side ships in S5 | a metered consumer |
| ASC-606 bundle revenue-ALLOCATION engine | BO-D35 (master v2) | SSP fields + obligations ship in S5 | bundle selling goes live |
| Payment dispute case mgmt (evidence/won-lost) | BO-D47 (master v2) | chargeback = reversal Payment + Disputed status now | dispute volume |
| Gift-card cross-company redemption + breakage rev-rec | BO-D44 (master v1.5/v2) | single-company issue/redeem ships in S5/F7 | cross-company redemption need |
| Provider expansion: PayPal / Square / Authorize / Adyen | BO-D23/D29 (master v1.5/v2) | Stripe + Manual are the v1 providers | demand per provider |
| Statements / consolidated-bill packaged reports | BO-D45, §15 Q13 | presentation-layer reports; per-order rendered bill ships first | Jeremy asks / cutover reporting pack scope |
| Bulk bill/statement email send + bill.com delivery workflow | §15 Q8 + Q-D | **decision-gated**: delivery path (AIDP→BC→bill.com vs direct) undecided | Q-D decision (Robert/Amith) |
| Stripe↔Payments recon + webhook forensics log + idempotency stress suite | Phase H | Stripe wave not started | F3-Stripe lands |
| CDP data migration (§13) | master §13 (aidp Stage 4) | external program dependency | aidp Stage 4 starts |
| Customer portal / storefront | §15 Q9 / §16 | out of v1 by master | v2 scoping |
