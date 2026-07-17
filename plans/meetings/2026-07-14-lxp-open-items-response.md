# BizApps Orders — Responses to the LXP Open Items (A1–A4)

> **Date:** 2026-07-14
> **Author:** Robert Kihm (BizApps Orders)
> **Audience:** Ethan (LXP), Amith, and whoever at Sidecar can answer the coupon/entitlement questions (John / CS / Soham as appropriate)
> **Purpose:** Answer what can be answered now from the LXP doc's action items, state the Orders position where a decision is ours to make, and ask precise questions where we need information back before we can commit.

| Item | LXP action | Status |
|---|---|---|
| A1 | Confirm `DueDate` on the Order schema | ✅ **Answered: yes** |
| A2 | Spec coupons in Orders v1 | 🟡 Provider-model design proposed; 3 questions + 2 investigations open below |
| A3 | Confirm ProductType → entitlement robustness | 🟡 Blocked on a precise definition of what LXP needs |
| A4 | Tax approach | ✅ **Position stated below** — engine selection + timing open |

---

## A1 — DueDate: **yes, it exists**

The Order schema carries the full A/R field set: `TotalGross`, `AmountPaid`, `Balance`, `DueDate`, `PaymentStatus`. `DueDate` is derived from the customer's `PaymentTerms` when the Order is posted. The "overdue" signal the LXP doc asks for (D15) works exactly as Amith described:

```
Overdue = Balance > 0 AND DueDate < now
```

exposed as a computed/virtual field on the Order. There is no separate Invoice entity — the posted Order **is** the receivable (BO-D45), so dunning/grace UI in the LXP reads Order state directly. **This item can be closed.**

---

## A2 — Coupons: three questions before we spec

**What exists today (we checked the CDP code).** Sidecar's current individual checkout does coupons **entirely inside Stripe**: the hosted Stripe Checkout session is created with `allow_promotion_codes` (the buyer types a promo code on Stripe's page), and verified ASAE members get a preconfigured **Stripe coupon** applied server-side (`CDP/apps/Public/src/routes/stripe.ts`). No coupon records exist in CDP's own tables or in LearnWorlds — Stripe is the system of record for what discount applied.

**What exists in Orders today.** Line-level `DiscountPct` on OrderLine, plus sales-rule discount limits (`SalesRule`/`SalesAuthority` — max discount per rep, approval routing when exceeded). There is **no coupon/promo-code entity** yet.

**The design fork.** Two viable shapes:

- **Option A — a coupon *provider* model; the provider owns coupon configuration and application, Orders records the outcome.** Coupons are configured and applied in an external system behind a `CouponProvider` abstraction — **Stripe is the first provider** (matches today exactly: hosted checkout + promotion codes). Orders receives the applied discounts and records them against the Order and OrderLine. Fastest to launch; no coupon-validation machinery of our own. Limitation: coupons only work on channels that check out through a provider — they can't apply to AD-entered or manual orders.
- **Option B — Orders owns coupons.** A `Coupon` entity in Orders (code, type percent/fixed, scope order/line/product, validity window, usage limit, stackability), validated and applied at order entry regardless of channel; Stripe just charges the final amount. Channel-agnostic and reportable in one place; more build inside the launch window.

**If Option A: the provider-model design work.** Two investigations are needed before the schema freezes, so the abstraction is a genuine provider model and not a Stripe schema with a rename:

1. **Map Stripe's coupon model end-to-end.** How coupons are *configured* — Stripe splits the discount definition (**Coupon**: `percent_off` or `amount_off` + currency; duration once/repeating/forever; `applies_to` specific products; `max_redemptions`, `redeem_by`) from the customer-facing **Promotion Code** (the typed code, with its own restrictions: minimum amount, first-purchase-only, per-customer limits). And how applied discounts are *reported back* — order-level via the Checkout Session's `total_details.amount_discount` and `discounts[]`, line-level via per-line discount amounts (Stripe prorates an order-level coupon across lines on the invoice). Our schema must capture what Stripe reports at **both** levels, plus the provider identifiers (coupon ID, promotion-code ID, the code string) so a discount on an Order is traceable back to the provider object that produced it.
2. **Evaluate a second provider's capabilities** (e.g., Square's Orders-API discounts, or a cart platform like Shopify's discount codes) specifically to find where its model *differs* from Stripe's — discount-definition vs. code split, order-level vs. line-level attribution, how proration is reported, stacking rules. The differences define what belongs in the abstraction versus in the Stripe adapter. This is an evaluation, not a build — the second adapter itself can come whenever a channel needs it.

Schema implication either way: discount recording needs to live at **both** the Order level (code used, provider, provider refs, total discount) and the OrderLine level (per-line discount amount as prorated/attributed by the provider), because tax and GL both operate on line amounts. `DiscountPct` alone does not capture fixed-amount or order-level discounts — we add `DiscountAmount` at the line and an order-level discount structure regardless of which option wins.

**Questions we need answered:**

1. **(Sidecar/John/Ethan)** At launch, do coupons need to work anywhere other than the LH4I Stripe checkout (e.g., AD/CS-entered team orders, manual orders)? If Stripe checkout is the only coupon surface, Option A covers launch and Option B becomes a fast-follow.
2. **(Sidecar/marketing)** What coupon shapes are actually used or planned — percent only, or also fixed-amount ($ off), order-level (vs. per-line), repeating-over-a-subscription? What is today's ASAE coupon configured as in Stripe? This tells us which provider capabilities the launch flow actually exercises.
3. **(Ethan)** Does the LXP need to *display or validate* coupon codes in its own UI before handing off to payment, or is entering the code on the Stripe-hosted page acceptable at launch? (The latter is what customers see today.)

**Our lean:** Option A for launch, built as the provider model above — the `CouponProvider` abstraction with Stripe as the first adapter, the two investigations (Stripe mapping + second-provider evaluation) done before the recording schema freezes, and order-level + line-level discount recording added now so nothing is lost. Option B's Orders-native `Coupon` entity remains the fast-follow for channels that don't check out through a provider (AD/manual orders) — and it slots in as just another provider when it comes.

---

## A3 — Entitlements: what we have, and what we need defined

**What Orders already models.** Entitlements are first-class in the v1 plan, split into definition and instance (BO-D34/BO-D39):

- **`ProductEntitlement`** — the template on a Product/Plan: what a purchase grants. `EntitlementType` = `Feature` | `AccessLevel` | `ResourceQuantity` | `Custom`.
- **`EntitlementGrant`** — the instance created when the Order posts (or the subscription activates), carrying a **beneficiary** (Person or Org — defaults to the buyer; an order line may designate someone else). Downstream apps read grants to provision access.
- **`ProductType`** drives default behavior per kind of product (BO-D31), and **Bundle** is a product type — a bundle purchase can fan out grants for its components.

So the LXP doc's "entitlements via ProductType" (D12) maps onto real, planned entities. What we **cannot** yet confirm is "robustness" (their word), because that depends on semantics only the LXP can define.

**Questions we need answered (Ethan/LXP):**

1. **Grant granularity for tracks/bundles.** When an individual buys the "marketing track" bundle, does the LXP want **one grant for the bundle** (LXP resolves bundle → courses itself) or **one grant per course** in the bundle? Who owns the bundle→course mapping — the Orders catalog or the LXP?
2. **Lifecycle coupling.** Should a grant carry its own start/end dates, or is it valid-while-the-subscription-is-active (LXP derives access from grant + subscription status)? What exactly happens at lapse — is the grant revoked, suspended, or does the LXP just stop honoring it during/after the ~1-week grace (D16)?
3. **Read contract.** What fields does the LXP need on a grant to gate access — beneficiary, product/track identifier, status, dates, anything else? This becomes the schema we freeze. Consumption is via the standard MJ mechanisms already agreed (D14 — polling or entity events), so only the *shape* is open.
4. **Beneficiary semantics for teams (later).** For LH4T, users associate to an org via email domain (D9) — are grants expected at the **Org** level with the LXP resolving members, or per-Person? (Not a launch blocker since LH4T is manual, but it affects whether we freeze the beneficiary model now.)

With answers to 1–3 we can give a firm yes/no on robustness for LH4I, and adjust the entity if needed — the definition/grant split was designed for exactly this kind of consumer.

---

## A4 — Taxes: Orders records, a third-party engine calculates

**Position.** BizApps Orders will **not** implement tax calculation. Tax is delegated to a **third-party tax calculation engine** (Avalara / Stripe Tax / Vertex class). Orders' responsibilities are exactly two:

1. **Send** the engine what it needs at order-line time: ship-to/customer address, product tax category, customer tax profile (including exemption status).
2. **Record** what comes back, on the Order — supporting **multiple taxes per line for different jurisdictions**.

**The data structures already exist in the plan** and match this posture (BO-D20):

- `OrderLine.LineTax` and `LineTotalGross` — the rolled-up result per line.
- **`OrderLineTaxLine`** — one row per jurisdiction per line: jurisdiction, rate reference, `TaxableAmount`, `TaxAmount`. This is the multi-jurisdiction breakdown.
- `ProductTaxCategory` on the product, and a customer tax-exemption profile (nonprofit customers are a known requirement) — the *inputs* we send.
- The engine sits behind the already-planned pluggable provider seam (`TaxCalculationProvider`), so the third-party engine is a provider implementation, not an architecture change.

**One consequence of delegating:** the jurisdiction/rate tables on our side become **reference/snapshot data recording what the engine returned** (jurisdiction name, rate applied at the time), not a rate authority we maintain. This removes the "build and maintain a sales-&-use-tax rate package" burden the LXP doc mentions (D13's long-term wish) — the engine *is* that package.

**Open items:**

1. **Engine selection** — Stripe Tax is the low-friction candidate for the LH4I flow (it attaches to the checkout we already use); Avalara-class engines matter if/when non-Stripe channels need tax and for exemption-certificate management. Needs a finance + cost conversation. *(Robert/Marcelo + Jeremy)*
2. **Launch timing** — per the engine-meeting priorities, tax integration is deliberately **not phase one** of the Orders build. If LH4I must collect tax at launch, either the Stripe Tax path gets pulled forward (small, since it lives in the checkout), or launch ships without tax collection — that's a finance/business call to make explicitly, not a default. *(Jeremy/John)*
3. **Exemption certificates** — we sell to nonprofits; exemption status must be verifiable per jurisdiction and product type. The customer exemption profile is ours; certificate *validation* may come from the engine. Scope for the engine-selection conversation. *(Jeremy)*
