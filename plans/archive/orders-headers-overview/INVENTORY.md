# Orders form headers + Overview — inventory

Static mockup (review first, no Angular until you approve):

`plans/orders-headers-overview/mockups/orders-headers-overview-showcase.html`

Open it from disk. Entity chips at the top swap the always-on banner and the Overview. Nothing is wired.

---

## Remembered — implement after the mockup is approved

These stay on the list. They are **not** in this mockup as production work.

1. **Order Details accordion does not actually shrink** when you collapse it. Fix the height so collapse frees vertical space.
2. **Order header should be collapsible.** Collapsed state keeps customer name + date (and the money trio if you still want it). Goal: a big order can give almost all vertical space to lines.
3. **Accordion leftovers on the custom Order form.** Recommendation: **block** leftover related (`FormInclusion: None` / hide accordion chrome), do **not** let a generic More dump grids the custom form already owns (Payments, Charges, Subscriptions, journals). If something truly new appears later, add it as an explicit first-class tab — not a leftover More. Confirm or override when we implement.
4. **Bring Order / Payment / Subscription onto the same header + Overview-first pattern** as the catalogue entities (see below). They already have heroes; they do not have Overview as the first clickable section, and Order’s header is not collapsible.

---

## Are the existing custom forms “with the pattern”?

Two patterns are in play.

| Pattern | Who uses it | Header | Body |
|---|---|---|---|
| **A — generated chrome + slots** | Person, Org (Common + Orders contributions) | Slot `header` (`contributionKey: 'header'`) | Left-nav rail. Overview is a Primary contribution and should be first. |
| **B — full custom compose** | Order Header, Payment Header, Subscription, Subscription Term, Product, Price List, Promotion | Hand-built hero inside the custom form (`mjo-oh-hero` or `mjo-doc-hero`) | Custom tabs / custom left-nav. Generated related sections are supposed to stay out. |

**Order / Payment / Subscription are Pattern B**, not A.

- **Order Header** — richest hero (`mjo-oh-hero`: identity, money trio, ship/bill bubbles, confirm). Body is context **tabs** (Payment / Details / Charges / Accounting / Subscriptions), not left-nav chrome. No Overview. Header is not collapsible. Accordion leftovers are the open question in #3.
- **Payment Header / Subscription / Term** — `mjo-doc-hero` identity + stats. Custom forms. No Overview-first rail.
- **Product** — closest to the destination: its own left-nav already leads with “Overview & Profile”, plus a custom header card. Still Pattern B (owns chrome), and the header is a different CSS family (`mjo-record-header-card`) than `mjo-doc-hero`.
- **Price List / Promotion** — `mjo-doc-hero` only. No Overview.

So: identity banners exist and are good. They are **not** the Person/Org “always-on banner + Overview as first rail item on generated chrome” pattern. The mockup shows that destination for every major Orders entity, including evolving the three custom documents.

---

## Schema — 49 tables, who gets a banner

Product is the catalogue hub (10 inbound). OrderLine is the money unit (13 inbound). OrderHeader groups it. Read the app as **catalogue → price/promo → order → payment / subscription**.

### Tier 1 — always-on banner + Overview first (in the mockup)

These are the records a user opens as a destination.

| Entity | Why it’s “big” | Header says | Overview says |
|---|---|---|---|
| **Product Type** | Stamps defaults onto every product of that kind | Name, code, active, fulfillment | Defaults, product mix, extension entities, entitlement defaults |
| **Product Category** | Company tree; products + promo targets hang here | Name, code, parent, active | Tree, products in category, targeting promos, inherited tax/entitlement |
| **Product** | Hub of the app | Name, SKU, type, status, price / rev-rec / tax | What it is, live prices, entitlements, recent sales; event/bundle satellites |
| **Subscription Type** | Policy template for every live sub | Name, cadence, term, auto-renew | Lifecycle rules, billing vs recognition, products using it, live count |
| **Revenue Recognition Type** | Join to accounting; deferred vs immediate | Name, deferred?, driver | How money is earned, products using it, open deferred |
| **Price List** | Price is **not** on Product; lists + assignments decide | Name, code, window, status | Assignments, price rows, simulator hook |
| **Promotion** | Discount policy (codes are children) | Name, value, stacking, window | Qualifiers, targets, codes, redemptions |
| **Charge Type** | Shipping / tax / fee vocabulary | Name, category, basis | Override rules, recent usage |
| **Sales Authority** | Who may discount, and by how much | Rep, max %, active | Limits, allowed categories, recent auths |
| **Order Header** | Container; totals roll up from lines | Number, customer, date, status, money trio | Parties, line rollup, payments, subs spawned |
| **Payment Header** | The receipt (lines are the application) | Number, type, status, gross/fee/net, payer | Application lines, instrument, journal |
| **Subscription** | Durable; terms are the billable slices | Number, status, auto-renew, coverage, holder | Next term, remaining deferred, grants, events |
| **Subscription Term** | The billable / recognisable slice | Term #, coverage, amount, prorated | Rev-rec, originating line, grants this term |
| **Stored Value Account** | Gift card / credit balance | Code, status, remaining / initial | Ledger, issued-from, expiry |
| **Payment Provider** | Stripe/etc instance per company | Name, live/test, type | Capabilities, recent charges, intents |
| **Payment Type** | ACH / card / check vocabulary | Name, flags | Required instrument/reference, volume |

### Tier 2 — no gorgeous banner (children, instruments, sequences)

Open as grids under a parent. A thin generated form is enough.

- Product: `ProductBundleItem`, `ProductEntitlement`, `EventProduct` (EventProduct facts live on the Product overview when the satellite exists)
- Price: `ProductPrice`, `PriceTier`, `PriceListAssignment`
- Promo: `PromotionCode`, `PromotionTarget`, `PromotionType`
- Order: `OrderLine` and its dimensions / price components / event attendee, `OrderCharge` + allocation, `OrderAdjustment` + allocation, `OrderSequence`, `OrderCompanyPolicy`
- Sub: `SubscriptionEvent`, `SubscriptionSequence`, `EntitlementGrant`
- Pay: `PaymentDetail`, `PaymentLine`, `PaymentIntent`, `PaymentSequence`, `PaymentProviderType`, `CustomerPaymentMethod`
- Customer deviations: `CustomerPaymentTerms`, `CustomerTaxExemption`, `PaymentTermsType`
- Guardrails: `SalesRule`

---

## What “done” looks like after you approve

1. One shared header vocabulary (`mjo-doc-hero` evolved, Order keeps the richer `mjo-oh-hero` and becomes collapsible).
2. Overview as the first clickable section on every Tier 1 entity (Primary contribution, `sortKey` in the lead band).
3. Catalogue entities that are still generated forms stay on Pattern A (slot header + Overview). Product / Order / Payment / Sub stay Pattern B but **look like** A from the outside.
4. Then the four remembered Order-form fixes.
