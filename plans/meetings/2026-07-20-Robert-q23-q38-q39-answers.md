# Answers — Q23 (order visibility) · Q38 (product↔account company) · Q39 (multi-company receivable)

> **Author:** Robert Kihm — 2026-07-20. Rulings for the three questions addressed to me in the
> 2026-07-16 team package, plus the follow-up on intercompany AR/AP account types. Verified against
> the code on `feature/accounting-integration` (the branch that carries the engine + schema; `next`/
> `main` are plan-only). Where a ruling changes what is currently built, the implementation delta is
> called out so it lands with the MOD-3 rev-2 / S1 schema amendment rather than as a second design.

## Summary of rulings

| Q | Ruling (short form) |
|---|---|
| Q23 | **Roles/permissions drive cross-company visibility of BOTH Orders and Products** — not auto-involvement. To add Company B's product to an order you must hold view permission on Company B. BCHQ order-desk users are granted all companies; other deployments choose their cross-company grants. |
| Q38 | **`Product.CompanyID` NOT NULL** (rename from `OwningCompanyID`, already ruled — apply it). Every GL account a product resolves to — via product link, category route, or company default — **must be linked to the product's own company**. UX auto-populates CompanyID when only one company is in play. |
| Q39 | **The company that owns the Order owns the receivable**, settled to the sisters via **due-to/due-from**. Single receivable at the owning company; not per-company AR. |

---

## Q23 — Cross-company order/product visibility: **role/permission driven, not auto-involvement**

**Ruling.** Visibility of Orders and Products across companies is governed by **explicit per-company
role/permission grants** (the `UserCompanyRole` grant table), *not* by auto-derived "involvement."
A user sees an order when their grants include that order's **owning company** (`Order.CompanyID`),
and sees a product when their grants include that product's **company** (`Product.CompanyID`).

The load-bearing consequence: **to add Company B's product to an order, the creator must hold view
permission on Company B's products.** Cross-company orders are therefore only buildable by users
whose grants span the companies involved. At BCHQ, the people creating and maintaining orders are
granted **all** companies, so they build cross-company orders freely. Other deployments of Orders
decide for themselves which users get visibility into other companies' products and orders — the
grant table makes that a per-deployment configuration, not a code change.

**Direct answer to the question as posed** ("if an order owned by A contains B's products, can B's
users see it?"): **not automatically.** B's users see A's order only if they are granted visibility
into Company A. This **supersedes the earlier involvement-based-READ proposal** in the Q23 stub —
we are not opening A's orders to B's users on the strength of a shared line. Accounting drill-through
still works, because a sister's revenue lands in the sister's own company-scoped JE (the accounting
record); the *sales* record (the order) follows the sales-side grant, which is the correct boundary.

**Filter shape (owner-scoped, one leg — simpler than the involvement design):**
- Orders read **and** write:
  `Order.CompanyID IN (SELECT CompanyID FROM UserCompanyRole WHERE UserID = '{{UserID}}' AND IsActive = 1)`
- Products read (gates the product picker, hence gates cross-company order building):
  `Product.CompanyID IN (SELECT CompanyID FROM UserCompanyRole WHERE UserID = '{{UserID}}' AND IsActive = 1)`

Because order visibility keys on the **owning** company only, the involvement `OR EXISTS(lines…)`
leg is **not needed** — which also settles Q23 sub-question 3: materializing `OrderLine.CompanyID`
is **no longer required for the visibility filter**. It remains worth doing for JE per-company
splitting and per-company reporting (both read line company hot, and it removes the account-derivation
inversion noted under Q38) — so keep it as a denormalized copy of `Product.CompanyID` stamped at line
save, but it is now a performance/reporting choice, not an RLS requirement.

**Code reality:** `UserCompanyRole`, the RLS filters, `Order.CompanyID`, and `OrderLine.CompanyID`
are **not built yet** — the schema comment still reads *"No CompanyID (multi-company via each line's
resolved GLAccount.CompanyID)."* This lands with the S1 / MOD-3 rev-2 amendment. The product-scoping
pattern already exists (`Product.OwningCompanyID` is used by the catalog/GL-mapping pages), so the
product read filter has a home the day the grant table exists.

---

## Q38 — Product↔account company edges: **company is required and every route stays in-company**

**1. `Product.CompanyID`, NOT NULL.** Yes — we already ruled the rename `OwningCompanyID → CompanyID`
(plain FK name; owning-company semantics in the extended property). **Apply it, and make it NOT
NULL** — a product is always owned by exactly one company, so there is no valid null. This makes
company a guaranteed input to account resolution, which is what keeps cross-company results
unrepresentable.

- *Code reality:* the column is still `OwningCompanyID UNIQUEIDENTIFIER **NULL**` in the migration,
  and its extended property literally says *"NULLABLE pending Robert's owning-company ruling."* This
  ruling closes that: rename to `CompanyID`, flip to NOT NULL, backfill.

**2. UX auto-populates CompanyID.** When only one company exists in the deployment, or the user has
access to only one company, the product editor sets `CompanyID` automatically (no picker friction);
the picker only appears when the user genuinely has a choice.

**3. Every resolved GL account must belong to the product's company — enforced at all three rungs.**
Company A's products may use **only** GL accounts linked to Company A. This holds for:
- **Product-level links** — the product's account link must point at an account in the product's company;
- **Product Category routes** — a category is a shared label with **per-company account routes**; the
  route chosen must resolve to an account in the product's company (no route for that company →
  keep climbing);
- **Company defaults** — the company default is same-company by construction.

A link to another company's account is **invalid data, blocked at creation**, not merely refused at
resolution. This is the company-scoped walk (posting-group shape); resolution takes company as an
input and a fallback may reduce *specificity* but never change *company*.

- *Code reality:* `ResolveAccount(productID, role, asOfDate, companyID)` **already takes company as an
  input** — good. But two gaps remain: (a) line company is currently **derived from the resolved
  account** (`CompanyID: account.CompanyID`) instead of read off the product — the exact inversion
  this ruling removes; MOD-3 rev-2 text is finalized but the code still does account-derivation; and
  (b) **no enforcement exists yet** — no block on a product/category link to another company's account,
  no uniqueness on (target × role × company). Both land with this amendment.

**4. Cross-company account borrowing: no.** "Company A's products use only Company A accounts" means
there is no genuine mapping-table case for A's product to book into B's account. Any real
cross-entity revenue arrangement is an **intercompany transaction** (due-to/due-from — see Q39),
never a mapping route. This keeps the company-derivation model closed (nothing reopens deriving a
line's company from the link).

**5. Bundles (the one edge left to state):** a bundle owned by A containing B's components **fans out
per the component's company** — same rule one level down: each component line takes its own
`Product.CompanyID`, and a component owned by B books into B's books via the intercompany path. No
fan-out logic exists in the booking path today (`ProductBundleItem` + `OrderLine.SourceBundleProductID`
are in the schema but unused), so this is net-new work when bundles activate.

---

## Q39 — Multi-company orders: **the owning company owns the receivable**

**Ruling.** The company that owns the Order (`Order.CompanyID`) **owns the entire customer
receivable.** The customer gets one invoice, owes the owning company alone, and pays it alone. The
sister companies get their share **internally via due-to/due-from**, recorded at time of sale — each
sister still books its own product revenue. This is the seller-of-record / single-receivable model
(BO-D6), and it settles the open confirmation: **not** per-company AR against the customer.

- *Code reality — this changes what's built.* The current booking engine (MOD-11, tested) splits the
  order into **one AR debit per company** — i.e., each company holds its own receivable against the
  customer, which is precisely the model this ruling rejects. The intercompany legs and the
  `IntercompanyFlow` record are **not built** (deferred to Payments O2+). So confirming owning-company-
  owns-the-receivable requires:
  1. reworking the order JE from per-company AR → **one AR leg at the owning company** for the full
     customer amount;
  2. generating **intercompany due-to/due-from legs** at book time (see account types below);
  3. pulling **`IntercompanyFlow`** forward from "wait for a real consumer" to the launch model.

  This is a real scope item, not a no-op confirmation — worth surfacing alongside the BAO-date
  discussion.

---

## Follow-up — which account types do intercompany transactions involve?

**The intercompany link itself is one account-type pair:** **Intercompany AR (Due-From)** and
**Intercompany AP (Due-To)** — affiliate *control* accounts, kept separate from trade AR / trade AP.
On settlement (cash sweeping between entities) only Cash + this same IC AR/AP pair move; no revenue
touches the settlement.

**But a multi-company order as a whole touches more** — Revenue and Deferred Revenue are involved,
not as "intercompany accounts" but as each entity's **own ordinary revenue recognition**. The
intercompany leg simply substitutes for the customer receivable on the non-owning entity. Canonical
three-company order (owning company = BCHQ):

```
BCHQ (owns the order → owns the receivable):
    Dr Accounts Receivable (customer)     ← real trade AR, the whole invoice
    Cr Sales Revenue                      ← BCHQ's own product portion
    Cr Intercompany AP (Sidecar)          ← IC pair, one payable per counterparty
    Cr Intercompany AP (Cimatri)          ← IC pair
    Cr Sales Tax Payable                  ← owning company collects/remits (nexus = Jeremy/John)
Sidecar (sister):
    Dr Intercompany AR (BCHQ)             ← IC pair; replaces the customer AR on the sister
    Cr Deferred Revenue                   ← its product is a subscription → ratable
Cimatri (sister):
    Dr Intercompany AR (BCHQ)             ← IC pair
    Cr Sales Revenue                      ← immediate-recognition product
```

| Account type | Where | Intercompany-specific? |
|---|---|---|
| **Intercompany AR (Due-From)** | each sister | **Yes — the link** |
| **Intercompany AP (Due-To)** | owning co., per counterparty | **Yes — the link** |
| Trade Accounts Receivable | owning company only | No — the real customer receivable |
| Sales Revenue **or** Deferred Revenue | the entity that owns the product | No — ordinary rev-rec, one or the other per `RevenueRecognitionType` |
| Sales Tax Payable | owning company only | No |

**No product / inventory / COGS accounts** are involved — this is digital goods; `Product` carries
no GL columns and resolves through `GLAccountLink` to revenue-side roles only. A "product account" is
always just the Sales or Deferred-Revenue account the product routes to. (Physical goods with COGS
would add a `Dr COGS / Cr Inventory` pair per entity — out of v1 scope.)

**Two implementation flags for the `IntercompanyFlow` build:**
1. The resolver knows only four roles today — **Cash, Accounts Receivable, Sales, Deferred Revenue.**
   Intercompany requires adding **Intercompany AR** and **Intercompany AP** as new GLAccountRoles
   (and **Sales Tax Payable** if tax launches).
2. Intercompany AP/AR are **per-affiliate** (`Intercompany AP (Sidecar)` ≠ `(Cimatri)`), so their
   resolution key is **(entity × counterparty-entity)** — a richer shape than the product-routed
   `(product × role × company)` the current `ResolveAccount` signature covers. Decide this routing
   shape before building the legs.

---

## Consolidated implementation delta (for the S1 / MOD-3 rev-2 amendment)

1. `Product.OwningCompanyID` → **`Product.CompanyID`, NOT NULL** (backfill); UX auto-populate.
2. Add **`Order.CompanyID`** (owning company) + **`OrderLine.CompanyID`** (denormalized from
   `Product.CompanyID` at line save); stop deriving line company from the resolved account.
3. Stand up **`UserCompanyRole`** + attach the owner-scoped RLS filters on Order (R/W) and Product (R).
4. Add **creation-time enforcement**: block any product/category link to an out-of-company account;
   uniqueness on (target × role × company) category routes.
5. Rework the order JE to **one AR leg at the owning company** + **intercompany due-to/due-from legs**;
   build **`IntercompanyFlow`**; add the **Intercompany AR/AP** roles with per-counterparty routing.
6. Bundle fan-out per component's company (when bundles activate).
