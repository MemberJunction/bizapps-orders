# Pricing, adjustments, charges and promotions — design

> **Status:** Phases 1–3 BUILT and green (2026-07-27); phase 4 (tax data, nexus, exemptions) next.
> **Parent plan:** [`bizapps-orders-master.md`](./bizapps-orders-master.md) §10, D21/D22/D23.
> **Supersedes:** the "tables built, engine future" position in D21 — the tables are incomplete and
> the engine is the point.
> **Proposed schema:** [`pricing-schema.md`](./pricing-schema.md)

---

## 1. The separation everything else rests on

Four kinds of money land on an order, and they compose by different rules. Conflating them is the
mistake that makes pricing systems unexplainable.

| | What it is | Composition rule |
|---|---|---|
| **Price** | what the product costs | **ONE** resolver wins |
| **Adjustment** | promotions, discounts | **MANY** stack, in a declared order |
| **Charge** | shipping, handling, **tax** | **MANY** apply, in sequence, each on a declared basis |
| **Tax** | a *kind of charge*, not a fourth thing | as charges (Amith 2026-07-26) |

Treating tax as a charge is the unlock. Multi-layer tax (state + county + city + district) stops
being a special case and becomes what it obviously is: several charges. The GL treatment, the
ordering, the allocation to lines, and the override path are then written once and apply to all of
them.

### The pipeline

Every line's total is produced by ordered stages, each of which records what it did:

```
  1. RESOLVE BASE        one resolver wins    → UnitPrice
  2. PRICE RULES         qty bands, tiers, windows, seasons
                                              → LineGross
  3. ADJUSTMENTS         line promotions, then allocated order promotions
                                              → LineNet          ← the taxable base
  4. CHARGES             in ChargeType.Sequence, each on its declared basis
                         shipping, handling, then the tax layers
                                              → LineTotal
```

Stage 3 must fully complete before stage 4 begins: the taxable base is the *discounted* amount, so
an order-level promotion has to be allocated to lines before any tax is computed. That ordering is
not a preference, it is arithmetic.

---

## 2. Price resolution — mirror `GLAccountResolver` exactly

The walk is already in this codebase and proven:

```
Product:<id>  →  Category:<id>  →  category ancestors  →  Company:<id>  →  global default
```

`@RegisterClass(BasePriceResolver, '<key>')`, most-specific-first, **first match ends the walk**.
Not a chain where each transforms the previous — that makes "why is this £40?" unanswerable.

Mirroring `GLAccountResolver` is deliberate: anyone who understands GL resolution understands this,
the walk logic is shared rather than duplicated, and the two cannot drift.

**Custom resolvers plug in at any level.** A company with genuinely bespoke pricing registers a
resolver for its ID and owns the whole decision; everyone else uses the default rule-driven one.

---

## 3. Price rules — expressiveness is easy, determinism is not

A rule carries **applicability predicates** and an **outcome**:

- quantity band (min/max)
- absolute window (`EffectiveFrom` / `EffectiveTo`)
- **recurrence** — month, day-of-month, day-of-week, time-of-day (seasonal, happy-hour)
- customer segment / price list membership
- an explicit **`Priority`**

### Two rulings

**Ties are a configuration error, refused at write time.** Two applicable rules with equal priority
must not be silently resolved at read time — the winner would be arbitrary, stable in testing, and
liable to flip in production. This is the same line held for `IntercompanyAccountMatch`, for the
same reason: a wrong price still *looks* like a price.

**Recurrence is evaluated in TypeScript, not SQL.** "Every December" is not a date range. Absolute
windows stay as columns for indexed filtering; recurrence is a small structured field the engine
evaluates. Recurrence math in T-SQL is misery and would be the least testable part of the system.

**Time-of-day needs a timezone, and the answer is the owning company's** —
`Company.OperatingTimeZone` already exists. Left unstated, happy hour runs at the wrong hour for
every entity but one.

### Volume vs Tiered, pinned

The industry uses these inconsistently, so they are defined here. 100 units, bands 1–50 @ £10 and
51+ @ £8:

- **Volume** — the whole quantity at the band it lands in → 100 × 8 = **£800**
- **Tiered (graduated)** — each band's units at its own rate → (50 × 10) + (50 × 8) = **£900**

### Usage is explicitly deferred

Metered billing needs a usage-record pipeline that does not exist. A stub would be complex enough to
become a blocker — the same reasoning D23 applies to tax. `PricingModel='Usage'` stays in the enum
and refuses at resolution until it is built.

---

## 4. Promotions (the thing we have been calling coupons)

**Naming:** `Promotion` is the *offer and its rules*; `PromotionCode` is a *redeemable string
pointing at one*. "Coupon" is the informal word for a code. This is Stripe's split (Coupon vs
Promotion Code) and D22 makes Stripe the launch provider, so the mapping is one-to-one rather than a
translation layer.

The split earns its keep immediately: one promotion, many codes — per-customer codes, per-campaign
tracking codes, a public code plus a private one — without duplicating the offer.

### What a Promotion carries

- **Value**: percentage, fixed amount, or override price
- **Scope**: a specific product, a category (with descendants), or global
- **Level**: applies at line, at order, or either
- **Windows**: absolute and recurring, as price rules
- **Limits**: total redemptions, per-customer redemptions, one-and-done
- **Stacking**: whether it combines with others, and its position in the order of application
- **Qualification**: declarative rules, plus a plugin seam

### Qualification is pluggable

`@RegisterClass(BasePromotionQualifier, 'Promotion:<id>')` — arbitrary logic (member for 2+ years,
first-time buyer, has an active subscription) without a schema change. Declarative rules cover the
common cases; the plugin covers the rest. Same pattern as everything else here.

### Three decisions that leak money

1. **Stacking arithmetic.** Two 10% promotions — additive (20%) or multiplicative (19%)? On £1,000
   that is £10 an order, forever. **Must be an explicit property, not an emergent one.**
2. **Exclusivity.** A promotion may refuse to combine. When a customer presents two exclusives,
   the resolution rule (highest value wins? first applied?) must be stated.
3. **Order-level promotions MUST allocate to lines.** Not optional: tax and GL are per line. Pro-rata
   by line value, largest line absorbing the rounding remainder — the same rule the intercompany
   allocation uses. On a **multi-company** order this is sharp: £50 off spanning two companies'
   products reduces each company's revenue proportionally, and getting it wrong misstates both books
   while the order total still looks right.

---

## 5. Charges

### `OrderCharge` + allocation

```
OrderCharge            the charge itself, order-scoped
  ChargeTypeID         shipping | handling | tax layer | surcharge | …
  Amount               computed, or overridden
  Basis                what it was computed on
  Sequence             from the type, stamped for audit
  IsOverridden / OverrideReason / OverriddenByUserID / OverriddenAt

OrderChargeAllocation  which lines are responsible
  OrderChargeID
  OrderLineID
  Amount
```

A line-level charge is one allocation row; an order-level charge is N rows pro-rata. **One shape,
not two** — and it answers "which order lines are responsible for this charge?" directly, which
matters for tax (per line), GL (per line's company) and returns (refunding a line refunds its share).

### Charges are computed, never hand-typed — but overridable ON THE RECORD

Amith: *"we control/automate charges completely and never let user manipulate these directly."*
Agreed as the default. But real operations waive shipping and dispute tax, so the answer is not
"never editable" — it is **never silently editable**. An override stores who, when and why, and the
computed value it replaced. A system that forbids the override entirely gets worked around with a
fake discount line, which is worse.

**This is why shipping is a charge and not an order line** (reversing my earlier lean). A line is a
user-editable thing in a catalog; a charge is a system-computed thing with an override trail. The
control model decides it, and Amith's control model is the right one.

### `ChargeType.Basis` — the field that makes tax-on-shipping work

Each charge type declares what it computes on:

- `LineNet` — the discounted line amount
- `LineNetPlusCharges` — after earlier charges in sequence

Tax on shipping is exactly the second case, and it is jurisdiction-dependent — which is why basis is
configuration rather than code.

---

## 6. Tax — outsource the DATA, insource the DECISION and the RECORD

Amith: *"outsourcing the entirety of properly calculating and applying taxes and having sufficient
detail in our system is a flaw."* Agreed, and the split is cleaner than it first looks.

**Genuinely hard to insource:** rate maintenance (the US alone has ~13,000 taxing jurisdictions,
changing monthly) and product-taxability matrices (is a digital download taxable in Texas? depends
on the year).

**Must be ours regardless:** the computed result at full granularity, which GL account and dimensions
each tax component books to, which exemption applied and why, and enough detail to reproduce and
defend the number years later under audit.

### Accounting already owns most of the vocabulary

`TaxAuthority` · `TaxJurisdiction` (hierarchical, with postal/city matching — so state → county →
city layers already model) · `TaxRate` (by category, effective-dated, **with a `Source` column
defaulting to `'Manual'`** — built anticipating external feeds) · `CustomerTaxProfile` (exemption
flag, certificate ref, expiry) · `TaxLiability` · `TaxRemittance`.

**We do not duplicate any of it.** Rates and jurisdictions live in accounting; orders records the
per-line result and the provenance.

### The three gaps

1. **Exemptions are not product-scoped.** `CustomerTaxProfile` is (Organization, Jurisdiction) — it
   cannot express "this non-profit is exempt from state sales tax on publications but not on
   merchandise." Needs a product-tax-category dimension, nullable meaning "all".
2. **No nexus model.** Nexus is per **legal entity**, and each company here is one. Needs
   `CompanyTaxNexus` (Company × Jurisdiction, registration number, dates).
3. **No per-line tax result in orders.** D23 named `OrderLineTaxLine`; it was never built. Under this
   design it is not a separate table — it is `OrderCharge` rows of a tax `ChargeType`, allocated to
   lines, which is the same information with one fewer concept.

### Multi-company nexus falls out, and that is the point

Tax resolves **per line**. A line knows its company (`OrderLine.CompanyID`, D6). Nexus is per
company. So a three-company order asks the nexus question three times, independently, without any
special multi-company code path — exactly as GL resolution and intercompany already do.

This is the strongest argument that the per-line-company grain (D13, settled) was right: every
downstream financial question decomposes along it.

### The provider seam

`BaseTaxProvider`, pluggable by company, in three shapes:

- **Rate-table sync** — pull rates into accounting's `TaxRate` (`Source='Avalara'`), compute
  ourselves. Full detail, our arithmetic, their data. **The default posture.**
- **Live calculation** — call out per order, record what came back at full granularity.
- **None** — no tax, an explicit configured choice rather than a silent zero.

---

## 7. Every adjustment and every charge books its own GL treatment

Amith: *"we need to handle the journal entry for each adjustment and each charge."*

This extends the existing `GLAccountLink` role mechanism rather than inventing anything: **roles are
additive at runtime and seeded via metadata**, which is precisely the extension point.

| Component | Resolves | Fallback |
|---|---|---|
| Discount / promotion | `Sales Discounts` contra account, + dimensions | **nets into the Sales credit** when no contra role resolves (already D11's behaviour) |
| Shipping | its own revenue account, + dimensions | hard refusal — a charge with no account must not book |
| Each tax layer | its own liability account, + dimensions | hard refusal |

Every one may carry its own **dimensions and dimension values**, resolved the same way
`GLAccountLink` → `GLAccountLinkDimension` already works.

So a single line's journal entry grows from three amounts to a decomposed set — and because
`OrderChargeAllocation` says which line each charge belongs to, and each line knows its company, the
entries stay single-company and bookable without any new machinery.

---

## 8. The audit trail is the deliverable

Every stage writes a component row, so a total decomposes:

```
Widget A  ×10                                base    450.00   ProductPrice #a1f…  (WHOLESALE)
          volume band 51+                    rule    -50.00   PriceRule #7c2…  priority 100
          SPRING10 (line promotion)          adj     -40.00   Promotion #b31…
          WELCOME50 (order, pro-rata share)  adj     -18.60   Promotion #c04…
          shipping (order, allocated)        charge  +12.40   ChargeType Shipping, basis LineNet
          WA state sales tax 6.5%            charge  +22.24   TaxRate #d19…  jurisdiction WA
          King County 2.1%                   charge   +7.19   TaxRate #e88…  jurisdiction WA-KING
                                                     ───────
                                                     383.23
```

Pricing disputes are inevitable and *"the system computed it"* is not an answer to a customer, a
finance team, or an auditor. This is nearly free once the pipeline is staged rather than a formula —
and it is what makes the dry-run tool honest.

---

## 9. Dry run — same code path or it lies

`Orders.PreviewPrice`: given a product, quantity, customer and date, return the full component
breakdown **without writing**. Amith asked for this at product level ("what price would this
person/org get") and it is cheap once the pipeline exists.

The one rule that matters: **it must execute the real pipeline**, not a parallel simplified one. A
preview that diverges from what the order actually charges is worse than no preview, because it is
trusted.

---

## 10. Build order

Each phase ships something usable rather than half of everything.

| Phase | Delivers | Unblocks |
|---|---|---|
| **1** ✅ | resolver walk + price rules + price lists + customer→list link + `PreviewPrice` | staff stop typing prices |
| **2** ✅ | promotions + codes + qualification + stacking + GL treatment | campaigns |
| **3** ✅ | `OrderCharge` + allocation + shipping + **tax as a charge** + override trail + GL | real order totals |
| **4** | tax DATA — rate feed, `CompanyTaxNexus`, product-scoped exemptions, provider seam | launch-with-tax |

**Phase 3 already computes and books tax**, because tax is a charge and charges were built. What
phase 4 adds is where the RATES come from and who is exempt — the data problem, not the mechanism.

### What phases 1–3 found that review would not have

Seven defects, and most share a shape worth remembering: **the wrong answer still looked like a
right one.**

- Date bounds were read with local getters, expiring every price rule a day early west of UTC.
- `Tiered` lost its rate above a bounded top band, so a bounded table silently stopped charging.
- `Package` rounded whole packs only, so 13 of a 12-pack cost the same as 24.
- `AppliesAt: 'Either'` applied a promotion at BOTH levels — 19% for a 10% offer.
- A promotion that LOST a line-level collision came back at order level and applied anyway.
- A fully-comped line could not be booked at all, so a free item was unsellable.
- **Tax had sat in the AR debit with no matching credit for as long as booking existed**, having
  simply never been non-zero.
- `GLAccountLink` had no company dimension, so a globally-shared record could only ever have one
  account across every company.

Phase 1 is the one that pays immediately and carries the most design risk; it should land and be
lived with before phase 2 starts.

---

## 11. Open questions

1. **Stacking arithmetic** — additive or multiplicative, as the system default.
2. **Exclusive-promotion collision** — highest value wins, or first applied?
3. **Nothing resolves and no `UnitPrice` given** — refuse the line (D12's precedent) or fall back to
   direct entry? Recommendation: refuse; a silently-zero price is an invoice for nothing that looks
   deliberate.
4. **Price list scope** — global, or per-company like `ProductCategory` (D7)?
5. **Rate feed** — which provider for the sync posture, and who owns the credentials?
