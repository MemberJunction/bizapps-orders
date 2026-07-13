# Amendment — 2026-07-02 Engine Meeting (+ 2026-07-03 Amith response)
**bizapps-orders · v1.2 (RECREATED 2026-07-06)**

> ## ⚠ Recreation notice
> The v1.1 original was lost with the deleted `accounting-engine-work` instance (it was never committed).
> This v1.2 is a faithful re-authoring from the surviving change ledger
> (`~/MJDev/reports/accounting-engine-meeting-changes/CHANGES.md`, which carries the full CH-1..14 + AM-1..7
> detail with transcript ¶ references) and the review report
> (`~/MJDev/reports/orders-accounting-system-explained/REPORT.md`). Content is equivalent; wording differs.
> The two meeting source docs (`meeting-with-marcelo-t-amith-n-and-ian-z.md`, the 07-02 transcript, and
> `26-7-3-Post-meeting-update-midifications.md`, Amith's 07-03 response) were also lost — Marcelo to
> re-supply; until then, CHANGES.md is the closest surviving record of both.

**Authority chain (highest first):** Amith's 07-03 response (AM-1..7) → 2026-07-02 meeting transcript (¶) →
2026-07-01 first meeting → this amendment → orders build plan v0.1 (`reports/orders-build-plan/PLAN.md`) →
`bizapps-orders-master.md` → README. Where this amendment contradicts the master plan or build plan, **this
amendment wins**.

Companion accounting-side plan: `…/bizapps-accounting/plans/accounting-engine-plan.md`. Target-schema
diagrams: `erd-orders-target.md` (this folder), `erd-accounting-target.md` (accounting plans),
plus the interface + full-system ERDs in `~/MJDev/instances/develop-accounting-engine/`.

---

## S. Supersession table — what the meetings killed or changed

| # | Old ruling (where) | New ruling | Why |
|---|---|---|---|
| S1 | Plug = thin stateless `AccountingService` class Orders imports (build plan C8/A1, accounting AD-14, issue #9) | **Dead — will never exist.** The plug is the `AccountingEngine` (server) exposed via the remotable op **`Accounting.CreateJournalEntry`**. Orders codes against the op's typed input/output, not a service import. | Amith: engine pair modeled on AIEngineBase/AIEngine; remotable ops replace custom resolvers/services (CH-10, ¶170-178) |
| S2 | Account refs cross the boundary as company-scoped `GLAccount.Code` ("code only, strict Amith") — and before that, a hybrid UUID/role scheme (BP-D3/C2) | Orders resolves accounts itself via the mapping system and hands the engine **resolved `GLAccountID` UUIDs**. Account **numbers** are only the ERP wire format at the batch boundary (AM-4). | The catalog mapping stores real FKs; the resolver's output is IDs (¶93-100, AM-4) |
| S3 | `Product.RevenueGLAccountID` / `DeferredRevenueGLAccountID` / `COGSGLAccountID` columns (master plan draft) | **Killed** ("those fields go away" — "very, very limiting"). Replaced by accounting's polymorphic **`GLAccountLink`** system (AM-5): a product can carry any number of role-mapped, date-effective account links. `RevenueRecognitionType` stays. | CH-6/7, AM-5 |
| S4 | "JE fires at order lock/Post" (wording drifted across docs) | **JEs are generated exactly once, on the FIRST transition to `Confirmed`.** Draft/Quoted have no financial meaning; Voided is reachable only pre-Confirmed. | CH-14, ¶130-150 |
| S5 | `Order.ReceivingCompanyID` required (build plan C6/BP-D5) | **Dead.** Orders and their JEs are **multi-company by definition** — one order can sell Izzy + Sidecar products at once. Company is per JE **line**, implicit via the resolved `GLAccount.CompanyID`. No company column on Order. | CH-2, ¶19-33 |
| S6 | Locked-period handling (reject vs auto-roll vs caller flag — the big open question) | **Moot.** `AccountingPeriod` is removed entirely; the ERP owns periods and assigns them at posting. Orders never thinks about periods. | CH-1, ¶5-7, ¶65-67 |
| S7 | Dimension values auto-created on first use (session decision, later reversed) | **Validate-only, never auto-created.** Unknown dimension or value = typed rejection. Dimensions are ERP-sourced vocabulary. | CH-12, ¶75-79 |
| S8 | Orders pre-aggregates/pre-sorts JE lines before submitting | **Engine's job.** Orders sends RAW debit/credit lines; the engine merges duplicate (account + dimensions) same-side lines and orders debits before credits. That's accounting knowledge, kept in one place. | CH-11, ¶53-58, ¶158-163 |
| S9 | Post-Confirmed cancellation semantics (unspecified) | A **cancelling order** books reverting JEs (`EntryType='Reversal'` + `ReversesJournalEntryID`); **partial reverts supported** (return one product, keep another). Not accounting's whole-JE `generateReversal`. | ¶130-150 |
| S10 | Build plan Blocks B–E sequencing incl. Block C FX and Block G tax | **Frozen — scope fence.** FX, tax, subscriptions/rev-rec, approvals, inventory/COGS are all OUT of this build. "Tell Claude to F off about everything else — just build this" (¶173). | §E of CHANGES.md, AM-7 |
| S11 | Intercompany = payment-time, Payments' job (BP-D4) | **Unaddressed by both meetings — still open.** Keep BP-D4 parked; re-raise with Amith before Payments work starts. | — |

## 3. Orders-side schema (REVISED — the scope fence build)

**Orders builds NO GL-mapping tables.** The 07-02 meeting designed `ProductGLAccount` /
`ProductCategoryGLAccount` (+ dimension side-tables); Amith's 07-03 response replaced all of that with
accounting's single polymorphic **`GLAccountLink`** (+ `GLAccountRole`, `GLAccountLinkDimension`), whose
`EntityID`/`RecordID` pairs point AT orders records (Product, ProductCategory) and at Company for defaults.
Orders' schema is therefore just the catalog + order lifecycle:

- **`ProductType`** — flat lookup.
- **`ProductCategory`** — hierarchical (`ParentID` self-FK).
- **`Product`** — name, type, category, `RevenueRecognitionType` (kept). **No GL columns** (S3).
- **`Order`** — `Status` CHECK: `Draft | Quoted | Confirmed | Posted | Fulfilled | Voided`; Voided only from
  Draft/Quoted. No CompanyID (S5), no currency (FX deferred, S10).
- **`OrderLine`** — ProductID, Quantity, UnitPrice, line total.

Rules that ride along: an order's JEs land in exactly **ONE batch** (¶44); JE generation on first
`Confirmed` (S4); the **one reusable Angular GL-account-link picker** (accounting builds it, AM-5) is
embedded in the Company / ProductCategory / Product forms.

## 4. Orders-side code

- **`OrdersEngine`** (`BaseEngine` cache over the catalog): the account resolver
  `ResolveAccount(product, role, asOfDate)` walks **product → up the category tree → company default**,
  filtering `GLAccountLink` rows by `Status='Active'` + StartedAt/EndedAt as of the order date, via
  `AccountingEngineBase.ResolveLinkedAccount`. Also surfaces each link's `GLAccountLinkDimension` list
  (values from order context — ⚠ OQ-I, Robert).
- **`OrderEntityServer`** — entity server subclass detecting the first flip to `Confirmed`: builds the raw
  Dr/Cr draft per line (AR / Sales / Deferred Revenue per `RevenueRecognitionType`), calls
  `new CreateJournalEntryOperation().Execute(draft, {provider, user})` in-process, stores lineage
  (`JournalEntry.OrderID` comes back via the draft), and on failure **alerts / reservoirs the failure — the
  financial effect never silently disappears**.
- **Basic order-entry UI** — the step-5 proof: enter an order, confirm it, watch the JE + batch appear.

## 5. Build order (AM-7 — orders is step 5)

1. Accounting: fix schema (baseline edit) → 2. clean DB + CodeGen → 3. batching update →
4. AccountingEngineBase / AccountingEngine + the op → **5. Orders**: schema migration (§3) + CodeGen,
OrdersEngine + resolver, OrderEntityServer hook, basic UI, end-to-end validation
(order → Confirmed → JE → batch), dual-layer per TEST-PROTOCOL.

**Prerequisite reality check (2026-07-06):** the bizapps-orders repo is currently **docs-only** (plans +
README — no app manifest, no packages). Step 5 begins by scaffolding the app from the canonical template
(`mj-sample-open-app`, per the validated open-app-template work) on a dev branch (`engine-development`).

## 6. Open questions carried

| # | Question | Status |
|---|---|---|
| OQ-F | Multi-company batch shape (header CompanyID vs per-company grouping) | Robert, during accounting step 3 |
| OQ-G | `GLAccountLink.GLAccountRoleID` — absent from Amith's field list, assumed added | confirm w/ Amith |
| OQ-H | `Deferred Revenue` missing from the GLAccountRole seed | assumed added; confirm |
| OQ-I | Where dimension VALUES come from at JE-build time (order context assumed) | Robert |
| S11 | Intercompany ownership/timing | re-raise before Payments |
