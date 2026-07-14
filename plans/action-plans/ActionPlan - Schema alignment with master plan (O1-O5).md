# Plan — Schema alignment with the master plan (phases O1–O5)

> **Status:** Draft (awaiting Marcelo review) · **Created:** 2026-07-11
> **Implements:** MASTER-PLAN §4.1–§4.6, §4.3 (Order as A/R primitive), §15 Q11 (PaymentTermsType) — **as
> overlaid by** MOD-1..10 and UPD-1..3. Phasing follows the gap analysis
> (`~/MJDev/reports/schema-functionality-gap-analysis/REPORT.md` §6: O1→O5).
> **Sources:** MASTER-PLAN.md, MASTER-PLAN-MODIFICATIONS.md, MASTER-PLAN-UPDATES.md, BACKLOG.md, ISSUES.md,
> meetings/2026-07-10-decisions.md, meetings/2026-07-10--Robert-demo-feedback.md, the built baseline
> `migrations/V202607061431__v0.1.x__Schema_and_Tables.sql`, bizapps-common baseline (customer wiring targets),
> accounting baseline (JE-side counterparts).
> **Companions:** `ActionPlan - Feature build (lifecycle, payments, rev-rec).md` (the engine/code that consumes
> each stage) · `ActionPlan - UI layout and workflows.md` · accounting repo
> `ActionPlan - Schema alignment (IntercompanyRelationship, roles, RLS).md` (the parallel A1 work).

## 0. Purpose and scope

Bring the built `__mj_BizAppsOrders` schema (5 stripped tables) up to the master plan's functional intent —
**with every MOD/UPD applied**, so we do NOT blindly re-add things the overlays killed. This plan covers
**database structure only**: tables, columns, constraints, sequences, seeds, permissions/RLS metadata, and the
codegen loop per stage. Engine/UI behavior that consumes the schema lives in the companion plans.

**What this plan deliberately does NOT add (overlay compliance — the "do-not-re-add" list):**

| Master-plan item | Why not | Authority |
|---|---|---|
| `Product.RevenueGLAccountID / DeferredRevenueGLAccountID / COGSGLAccountID` | GL routing is role-based via accounting `GLAccountLink` | MOD-2 |
| `Order.CompanyID` / `OrderLine.CompanyID` | company resolved per line via `GLAccount.CompanyID` at booking | MOD-3 |
| Currency/FX columns (`CurrencyCode`, `ExchangeRateUsed`, `FunctionalCurrencyAmount`, …) on Order/OrderLine/Payment | FX deferred from baseline; add when multi-currency activates | MOD-4 |
| `PriceList` / `ProductPrice` / `PriceTier` tables | pricing BUILD deferred — order-line `UnitPrice` only | MOD-6 → `plans/DEFERRALS.md` |
| Any period/closed-period structure ANYWHERE | **no periods, no close guard — FINAL** (accounting MOD-1; the brief MOD-13 reinstatement was withdrawn 2026-07-14). Orders/JEs carry only dates; accountants batch into the right periods | accounting MOD-1 (final); MOD-9(b) |
| `IntercompanyFlow` | intercompany legs generate in Payments per accounting MOD-5; revisit at O2+ when intercompany activates (see §6 Q7). **Note (2026-07-13): the per-pair Due-To/Due-From WIRING table is also Payments-side** — accounting's baseline deliberately dropped `IntercompanyRelationship` ("the Payments component owns due-to/due-from"); Amith's OQ-A shape (accounting MOD-5) is the reference when it lands here with O2 | accounting MOD-5 + 2026-07-06 baseline ruling |

**Migration ground rules (every stage) — REVISED 2026-07-14 (Marcelo): COLLAPSE INTO THE BASELINE.**
We are not versioning the app yet — we are bringing the baseline to full feature. So: per stage, **edit
the baseline migration (`V202607061431`) in place**; dev loop = `mjdev app drop-schema` → `migrate` →
`codegen` → `build` (destructive re-migrate is fine — demo data is regenerable/reseeded). Commits still
land per stage (the history lives in git, not in migration files). At the end of the schema waves:
**recapture the codegen migration and the metadata-sync migration fresh** (the schema changes too much to
patch them); if the stale codegen/metadata migrations block interim migrates, delete them for now and
regenerate at recapture time. (This supersedes the never-edit-applied-migrations rule for THIS
pre-release phase only; once the app versions/publishes, the additive V*-file rule + publish-no-break
policy resume.) T-SQL stays the source of truth; PG conversion at recapture.
- No `__mj_CreatedAt/UpdatedAt`, no FK indexes (CodeGen owns both). `sp_addextendedproperty` for every new
  column. One consolidated `ALTER TABLE … ADD col, col, …` per table. Hardcoded UUIDs for seed rows.
- Cross-app references are **SOFT** (plain `UNIQUEIDENTIFIER`, no FK) — matches the as-built baseline
  convention (baseline header: "Orders never couples to another app's schema"). In-schema FKs are hard.
  FKs to `__mj` core (`User`) are allowed (precedent: common's `FK_Person_LinkedUser`).
- After each stage: `mjdev app migrate` → `mjdev app codegen` → `mjdev app build` → commit migration +
  regenerated code together. **No TypeScript that references new columns before codegen has run** (rule 2b).
- Value lists via CHECK constraints (CodeGen turns them into unions); changing one = drop + re-add in one
  migration.

---

## 1. Stage S1 — Order as the A/R primitive + customer wiring (phase O1; biggest unlock)

One migration: `V<TS>__v0.2.x__Order_AR_Primitive_And_Customer_Wiring.sql`.

### 1.1 New table: `PaymentTermsType` (§15 Q11 — owned by Orders)

```sql
__mj_BizAppsOrders.PaymentTermsType
  ID UNIQUEIDENTIFIER PK DEFAULT NEWSEQUENTIALID(),
  Code NVARCHAR(40) NOT NULL UNIQUE,          -- 'Net30', 'Net60', 'DueOnReceipt', 'Net15', 'Prepaid'
  Name NVARCHAR(200) NOT NULL,
  NetDays INT NOT NULL DEFAULT 0,             -- days from posting date to DueDate (0 = due on receipt)
  Description NVARCHAR(MAX) NULL,
  IsActive BIT NOT NULL DEFAULT 1
```
- Seed rows (Net 15/30/60/90, Due on Receipt, Prepaid) via the **metadata folder** (`metadata/payment-terms-types/`
  + `.mj-sync.json`), NOT SQL INSERTs — MJ convention for lookup seeds. Hardcoded UUIDs in the metadata files.
- Closes the dangling soft ref: accounting's `AccountingCompanyProfile.DefaultPaymentTermsTypeID` (verified
  present in the accounting baseline) finally has a target.

### 1.2 `Order` — add the A/R + customer + reversal field set (§4.2 as overlaid)

Single consolidated `ALTER TABLE __mj_BizAppsOrders.[Order] ADD`:

| Column | Type / constraint | Source |
|---|---|---|
| `OrderType` | `NVARCHAR(20) NOT NULL DEFAULT 'Sale'`, CHECK `('Sale','Return','Cancellation','Amendment','CreditMemoOrder')` | §4.2, BO-D9/D15 |
| `CustomerPersonID` | soft ref → common `Person` (buyer/contact), NULL | §4.2, Jeremy §C |
| `SalesRepUserID` | FK → `__mj.[User]`, NULL | §4.2, Jeremy §C |
| `BillToAddressID` | soft ref → common `Address`, NULL | §4.2, Jeremy §C |
| `ShipToAddressID` | soft ref → common `Address`, NULL (drives tax jurisdiction later) | §4.2, Jeremy §E |
| `PaymentTermsTypeID` | FK → `PaymentTermsType`, NULL | §4.2, Q11 |
| `TotalGross` | `DECIMAL(18,2) NULL` (materialized = Σ line gross; engine-maintained) | BO-D45 |
| `AmountPaid` | `DECIMAL(18,2) NOT NULL DEFAULT 0` (materialized = Σ posted PaymentLine.Amount) | BO-D45 |
| `Balance` | `DECIMAL(18,2) NULL` (= TotalGross − AmountPaid; negative = credit memo) | BO-D45 |
| `DueDate` | `DATE NULL` (derived from terms at Confirm/Post; overridable) | BO-D45, Jeremy §C |
| `PaymentStatus` | `NVARCHAR(20) NOT NULL DEFAULT 'Unpaid'`, CHECK `('Unpaid','PartiallyPaid','Paid','Overdue','WrittenOff')` | BO-D45 |
| `ExternalDocumentNumber` | `NVARCHAR(80) NULL` (bill.com sync requirement) | **UPD-1** |
| `PostedAt` | `DATETIMEOFFSET NULL` (issue/tax-point date; UTC) | §4.2 |
| `PostedByUserID` | FK → `__mj.[User]`, NULL | §4.2 |
| `ReversesOrderID` | FK → `[Order]`, NULL (self-FK is in-schema → hard) | BO-D9 |
| `ReversalReason` | `NVARCHAR(MAX) NULL` | BO-D9 |
| `ContractID` | soft ref, NULL (contracts envelope; AIDP contracts port pending Q-E) | BO-D21 |
| `RequestedDeliveryDate` | `DATE NULL` | §4.2 |
| `Notes` | `NVARCHAR(MAX) NULL` (Description already exists) | §4.2 |

**Not added** (overlay/deferral): `ApprovalTaskID` (Phase F), currency trio (MOD-4), CompanyID (MOD-3).

### 1.3 `OrderLine` — line totals, service period, reversal, fulfillment

Consolidated `ALTER TABLE`:

| Column | Type / constraint | Source |
|---|---|---|
| `DiscountPct` | `DECIMAL(7,4) NOT NULL DEFAULT 0`, CHECK `(DiscountPct >= 0 AND DiscountPct <= 1)` | §4.2 |
| `LineTotalNet` | `DECIMAL(18,2) NULL` (= Qty × UnitPrice × (1−DiscountPct); engine-computed, stored) | §4.2 |
| `LineTax` | `DECIMAL(18,2) NOT NULL DEFAULT 0` (0 until tax lands, O4) | §4.2 |
| `LineTotalGross` | `DECIMAL(18,2) NULL` (= LineTotalNet + LineTax) | §4.2 |
| `ServicePeriodStart` / `ServicePeriodEnd` | `DATE NULL` ×2, CHECK `(ServicePeriodEnd IS NULL OR ServicePeriodStart IS NULL OR ServicePeriodEnd >= ServicePeriodStart)` | **UPD-2** |
| `FulfillmentStatus` | `NVARCHAR(20) NULL`, CHECK `('Pending','Fulfilled','Returned')` — the BO-D43 seam; needed by UPD-3 auto-advance | §4.2, UPD-3 |
| `ReversesOrderLineID` | FK → `OrderLine`, NULL | BO-D10 |
| `SourceBundleProductID` | FK → `Product`, NULL (bundle fast-path provenance; harmless ahead of O5) | BO-D41 |

**Constraint change:** drop `CK_OrderLine_Quantity (Quantity > 0)` → re-add as `CHECK (Quantity <> 0)`.
Negative quantities are the reversal mechanism (BO-D10); "negative only when `ReversesOrderLineID` set /
reversal OrderType" is a **cross-field rule → entity-server `ValidateAsync`**, not a DB CHECK (MJ convention).

**Not added yet:** `SubscriptionID`, `RevenueRecognitionScheduleID` (S3 — their target tables don't exist;
adding FK-less stubs now buys nothing), currency trio (MOD-4), CompanyID (MOD-3).

### 1.4 `ProductType` — the one S1 behavior field

`ALTER TABLE ProductType ADD RequiresFulfillment BIT NOT NULL DEFAULT 0` — required NOW by UPD-3
(auto-advance Posted→Fulfilled when no line requires fulfillment). The rest of the ProductType behavior
columns wait for O5 (§5). Seed update: mark the future `PhysicalGood` type row `RequiresFulfillment=1`
(metadata).

### 1.5 Order-number sequence

- Add `__mj_BizAppsOrders.OrderSequence` — global singleton counter, exactly the accounting
  `JournalEntryBatchSequence` pattern (`ID INT PK CHECK (ID=1)`, `NextSequenceNumber INT`), consumed by the
  entity server to mint gap-conscious `ORD-{seq}` numbers (§15 Q1 lean: global sequence).
- **Dual numbering (draft seq → posted seq) is NOT built** — `[decision needed: Jeremy]` (BACKLOG). The
  schema choice is forward-compatible: if Jeremy wants a posted sequence, that becomes a second singleton
  row/table + a `PostedNumber` column later; nothing here blocks it. `ExternalDocumentNumber` ships now
  regardless (UPD-1: may equal OrderNumber, exists as its own column).

### 1.6 S1 validation gate (schema-level)

- Migrate + codegen clean on the dev instance; regenerated entities show the new unions
  (`OrderType`, `PaymentStatus`, `FulfillmentStatus`).
- Existing order→JE integration harness (`test-harnesses/server/order-to-je.ts`) still green — S1 must be
  **behavior-neutral** for the booking path (all new columns nullable/defaulted).
- New tier-1 unit specs for draft assembly unchanged; entity-server totals/validation code lands in the
  Feature plan, not here.

---

## 2. Stage S2 — Payments subsystem (phase O2; critical path: LXP + Jeremy cash application)

One migration: `V<TS>__v0.3.x__Payments_Subsystem.sql`. Tables per §4.5 as overlaid (MOD-4 strips currency
columns; StoredValue* deferred, see §5).

### 2.1 Tables

```sql
PaymentProvider
  ID PK, ProviderType NVARCHAR(40) NOT NULL CHECK ('Stripe','Manual'),   -- widen when providers land (BO-D29)
  CompanyID UNIQUEIDENTIFIER NOT NULL,        -- FK → __mj.Company (which sub uses this provider account)
  Name NVARCHAR(200) NOT NULL,
  CredentialsRef NVARCHAR(200) NULL,          -- MJ Credentials engine key; NEVER a secret at rest
  IsLiveMode BIT NOT NULL DEFAULT 0, IsActive BIT NOT NULL DEFAULT 1

PaymentIntent                                  -- provider-side state (BO-D26); Stripe-shaped, Manual skips it
  ID PK, PaymentProviderID FK NOT NULL,
  ProviderIntentID NVARCHAR(100) NOT NULL UNIQUE,
  Status NVARCHAR(30) NOT NULL CHECK ('RequiresPayment','Processing','Succeeded','Canceled','Failed'),
  Amount DECIMAL(18,2) NOT NULL,
  OrderID FK → [Order] NULL,                   -- the Order being collected (BO-D47)
  CustomerOrganizationID UNIQUEIDENTIFIER NULL (soft),
  ProviderEventID NVARCHAR(100) NULL,          -- webhook idempotency (unique filtered index WHERE NOT NULL)
  LastEventAt DATETIMEOFFSET NULL

Payment
  ID PK, PaymentNumber NVARCHAR(40) NOT NULL UNIQUE,
  ReceivingCompanyID UNIQUEIDENTIFIER NOT NULL,        -- FK → __mj.Company (where cash hits; §5 "receiving company")
  CustomerOrganizationID UNIQUEIDENTIFIER NULL (soft), -- payer; NULL only for anonymous/e-comm edge
  PaymentDate DATE NOT NULL,
  Method NVARCHAR(20) NOT NULL CHECK ('CreditCard','ACH','Wire','Check','Cash','InternalTransfer','Refund','Chargeback','BankReturn'),  -- BO-D14 (GiftCard joins with StoredValue, §5)
  Amount DECIMAL(18,2) NOT NULL,                       -- gross; negative for reversal methods
  ProcessingFeeAmount DECIMAL(18,2) NOT NULL DEFAULT 0,
  NetAmount DECIMAL(18,2) NULL,                        -- = Amount − ProcessingFeeAmount (BO-D47)
  PaymentProviderID FK NULL, PaymentIntentID FK NULL, PaymentMethodID FK → CustomerPaymentMethod NULL,
  ProviderChargeID NVARCHAR(100) NULL, ProviderRefundID NVARCHAR(100) NULL,
  ReversesPaymentID FK → Payment NULL, ReversalReason NVARCHAR(MAX) NULL,
  Status NVARCHAR(20) NOT NULL DEFAULT 'Pending' CHECK ('Pending','Captured','Failed','Refunded','Disputed'),
  JournalEntryID UNIQUEIDENTIFIER NULL (soft → accounting JE; mirrors Order.JournalEntryID convention),
  Description NVARCHAR(MAX) NULL, Notes NVARCHAR(MAX) NULL

PaymentLine                                    -- cash application junction (BO-D16/D45) — Jeremy's "applying"
  ID PK, PaymentID FK NOT NULL, OrderID FK NOT NULL, OrderLineID FK NULL,
  Amount DECIMAL(18,2) NOT NULL CHECK (Amount <> 0),   -- negative when applying a credit memo
  AllocatedAt DATETIMEOFFSET NOT NULL, AllocatedByUserID FK → __mj.[User] NULL  -- NULL = auto-allocated

CustomerPaymentMethod                          -- token vault (BO-D46); token only, NEVER PAN
  ID PK, CustomerOrganizationID UNIQUEIDENTIFIER NOT NULL (soft),
  PaymentProviderID FK NOT NULL,
  ProviderCustomerID NVARCHAR(100) NULL, ProviderPaymentMethodID NVARCHAR(100) NULL,
  MethodType NVARCHAR(20) NULL, Brand NVARCHAR(40) NULL, Last4 CHAR(4) NULL,
  ExpiryMonth INT NULL, ExpiryYear INT NULL,
  IsDefault BIT NOT NULL DEFAULT 0, IsActive BIT NOT NULL DEFAULT 1
```

Plus `PaymentSequence` (same singleton pattern) for `PAY-{seq}` numbers.

### 2.2 Design notes

- **`Payment.JournalEntryID` soft ref, not the master's `PostedJournalEntryID` hard FK** — consistency with
  the as-built soft-ref convention (`Order.JournalEntryID`). Naming matches the Order column.
- **ReceivingCompanyID hard-FKs `__mj.Company`** — MOD-3 killed company columns on Order/OrderLine, NOT on
  Payment; the master explicitly keeps "receiving company" on Payment (MOD-3 note: "§5's receiving-company
  concept lives on `Payment.ReceivingCompanyID`, which is unaffected").
- **No currency columns anywhere** (MOD-4). Single-currency until multi-currency activates; the FX/intercompany
  responsibilities that land "in Payments" (accounting MOD-5/6) get columns when they activate — tracked in
  accounting ISSUES ("UNOWNED"), see §6 Q7.
- **CustomerOrganizationID on Payment** is needed so a receipt can be booked to the customer subledger
  (accounting `JournalEntryLine.CounterpartyOrganizationID`) even before it's applied to specific orders
  (Jeremy: book to customer AND against the invoice — two distinct facts).
- **Intercompany wiring is THIS subsystem's future scope (2026-07-13):** accounting's baseline
  deliberately dropped `IntercompanyRelationship` — "the Payments component owns due-to/due-from." When
  intercompany activates (O2+ fast-follow per Robert), the per-pair wiring table lands on this side
  (Amith's OQ-A reference shape is preserved in accounting MOD-5; the per-pair GL accounts themselves
  are still `GLAccount` rows in accounting's COA — provisioning mechanism to settle at that design,
  QUESTIONS Q20 residual w/ Amith). NOT in the S2 baseline migration.

### 2.3 S2 validation gate

- Migrate/codegen/build clean. Application-math invariants (Σ PaymentLine.Amount per payment ≤ |Payment.Amount|,
  Order.AmountPaid/Balance/PaymentStatus maintenance) are **entity-server rules** — specified in the Feature
  plan F3 with tier-1 pure-function tests + a tier-2 harness (payment → JE → application → vw_AROpenByCustomer
  reflects it end-to-end).

---

## 3. Stage S3 — Subscriptions + rev-rec bridge (phase O3)

One migration: `V<TS>__v0.4.x__Subscriptions_And_RevRec_Bridge.sql`. Sequenced AFTER S2 (renewal orders +
charge-on-file want Payments) but NOT blocked by CA-1 — persisting schedules is legal now; only accounting's
**materialization trigger timing** was gated (accounting CA-2) — **RESOLVED 2026-07-13 by accounting
MOD-11 (date-driven recognition)**; S3 is now ungated.

### 3.1 Tables (per §4.4/§4.6 as overlaid; UPD-2 shapes)

```sql
SubscriptionPlan            -- OPTIONAL elaboration (BO-D40); simple memberships need none
  ID PK, ProductID FK NOT NULL, Name NVARCHAR(200) NOT NULL,
  BillingCycle NVARCHAR(20) NOT NULL CHECK ('Monthly','Quarterly','Annual','Custom'),
  CustomCycleDays INT NULL, PricePerCycle DECIMAL(18,2) NULL,
  TrialDays INT NOT NULL DEFAULT 0, IsActive BIT NOT NULL DEFAULT 1

Subscription
  ID PK, SubscriptionNumber NVARCHAR(40) NOT NULL UNIQUE,
  OrderLineID FK NOT NULL,                       -- the birthing line
  SubscriptionPlanID FK NULL,                    -- NULL for plan-less products (BO-D40 refinement)
  ProductID FK NOT NULL,                         -- denormalized root for find-or-extend (BO-D40)
  CustomerOrganizationID UNIQUEIDENTIFIER NULL (soft),
  BeneficiaryPersonID UNIQUEIDENTIFIER NULL (soft),  -- BO-D39/D40 (Product, Customer, Beneficiary) key
  Status NVARCHAR(20) NOT NULL CHECK ('Active','Paused','Canceled','Migrated','Trialing'),
  StartDate DATE NOT NULL, CurrentPeriodStart DATE NOT NULL, CurrentPeriodEnd DATE NOT NULL,
  TrialEndDate DATE NULL, CanceledAt DATETIMEOFFSET NULL, EndDate DATE NULL,
  AutoRenew BIT NOT NULL DEFAULT 1,              -- Jeremy §C: auto-renew flag
  RenewalLeadDays INT NOT NULL DEFAULT 90,       -- Jeremy §C: invoice ~3 months ahead
  PaymentProviderID FK NULL, ProviderSubscriptionID NVARCHAR(100) NULL,
  MigratesFromSubscriptionID FK → Subscription NULL, MigratesToSubscriptionID FK → Subscription NULL
  -- NO OwningCompanyID (MOD-3: company via resolved account); NO RevenueRecognitionScheduleID NOT NULL —
  -- schedules hang off ORDER LINES (each renewal order line carries its own), see 3.2

SubscriptionEvent            -- immutable log (§4.4)
  ID PK, SubscriptionID FK NOT NULL,
  EventType NVARCHAR(40) NOT NULL CHECK ('Created','Activated','TrialStarted','TrialEnded','PaymentSucceeded',
    'PaymentFailed','Paused','Resumed','CancellationRequested','Canceled','Migrated','RenewalOrderSpawned'),
  OccurredAt DATETIMEOFFSET NOT NULL,
  EventData NVARCHAR(MAX) NULL,                  -- JSON payload
  ProviderEventID NVARCHAR(100) NULL,            -- unique filtered index WHERE NOT NULL (webhook idempotency)
  RelatedPaymentID FK NULL, RelatedOrderID FK NULL

RevenueRecognitionSchedule   -- lightweight computation source + MRR/ARR display (BO-D11)
  ID PK,
  SchedulingMethod NVARCHAR(20) NOT NULL CHECK ('StraightLine','SingleDate','Milestone','Custom'),
    -- 'SingleDate' = UPD-2 shape (a): event-date, 100% on the date (accounting ScheduleCount=1)
    -- 'StraightLine' = UPD-2 shape (b): waterfall over the line's service period
  StartDate DATE NOT NULL, EndDate DATE NOT NULL,
  TotalAmount DECIMAL(18,2) NOT NULL, TotalRecognized DECIMAL(18,2) NOT NULL DEFAULT 0,
  IsComplete BIT NOT NULL DEFAULT 0

RevRecScheduleLine           -- one per recognition period
  ID PK, ScheduleID FK NOT NULL,
  PeriodStart DATE NOT NULL, PeriodEnd DATE NOT NULL,
  Amount DECIMAL(18,2) NOT NULL,                 -- line 1 carries the rounding remainder
  ScheduledJournalEntryID UNIQUEIDENTIFIER NULL (soft → accounting SJE),
  RecognizedJournalEntryID UNIQUEIDENTIFIER NULL (soft → accounting JE),
  RecognizedAt DATETIMEOFFSET NULL, IsRecognized BIT NOT NULL DEFAULT 0
```

### 3.2 Column additions to existing tables

- `OrderLine ADD SubscriptionID FK → Subscription NULL, RevenueRecognitionScheduleID FK → RevenueRecognitionSchedule NULL`
  (deferred from S1 to here so they're real FKs).
- `Product`: widen `CK_Product_RevenueRecognitionType` from `('Immediate','Deferred')` →
  `('Immediate','Deferred')` **unchanged**, and instead add
  `DeferredRecognitionShape NVARCHAR(20) NULL CHECK ('SingleDate','ServicePeriod')` — Robert's two deferred
  shapes ride a separate axis rather than exploding the recognition-type union (UPD-2; keeps the existing
  engine switch total). Add `SubscriptionType NVARCHAR(20) NOT NULL DEFAULT 'None' CHECK ('None','Standard','Membership')`
  (BO-D40 — drives find-or-extend-or-create on Confirm).
- **Design deviation to flag in review:** master's `Subscription.RevenueRecognitionScheduleID NOT NULL` is
  dropped — under Order-as-A/R-primitive each *renewal order line* carries its own schedule; a sub-level
  NOT NULL schedule contradicts that. (Mirrors BO-D40's "many per-cycle Orders under one Subscription".)

### 3.3 S3 validation gate

Migrate/codegen/build clean; waterfall math is pure-function tier-1 territory (Feature plan F4: rounding
remainder front-loaded, uneven starts, SingleDate degenerate case, leap-period). Bridge harness: order line
with Deferred product + service period → schedule rows → accounting `ScheduledJournalEntry` rows exist and
sum to the line total.

---

## 4. Stage S4 — Tax v0 (phase O4) — **decision-gated, two candidate shapes**

`[decision needed: Robert — quick path vs tables]` (accounting BACKLOG has the same open decision.)

- **Option A (Robert's quick path, no schema):** tax = an order line of a `Tax` product type — seed a `Tax`
  ProductType + one product per taxing jurisdiction; grand total = product lines + tax lines. Zero migration;
  entirely seeds + engine. Cheap, honest v0; jurisdiction reporting comes from accounting's existing tax
  tables at remittance time, not from order lines.
- **Option B (master §4.2/§4.1):** `ProductTaxCategory` + `Product.ProductTaxCategoryID` +
  `OrderLineTaxLine` (per-jurisdiction breakdown, soft refs → accounting `TaxJurisdiction`/`TaxRate`) —
  the durable shape, needed when the accounting `TaxCalculationProvider` (not yet built) lands.
- **Recommendation:** ship A now (it's UI+seed work only), author B's migration when accounting's provider
  work is scheduled; A's tax lines remain valid history either way. LineTax/LineTotalGross columns (S1)
  serve both.

---

## 5. Stage S5 — Catalog depth (phase O5) — **UPGRADED 2026-07-14 to a full PARITY wave**

> Marcelo directive: the goal is PARITY with the modified master plan — not consumer-gated minimalism.
> S5 is a real, planned phase (one or two migrations), not a wish-list. Only `plans/DEFERRALS.md` items
> stay out.

- `ProductType` remaining behavior columns: `Code` (unique), `DefaultRevenueRecognitionType`,
  `DefaultIsTaxable`, `IsBillableRecurring`, `DefaultSubscriptionType`, `ProductExtensionEntity`,
  `OrderLineExtensionEntity`, `BehaviorClass` (BO-D31/D37/D38) + the seeded out-of-the-box types (BO-D42).
- `Product` lifecycle/commerce fields: `SKU`, `Status` + `SuccessorProductID` + `AvailableFrom/To`,
  `OwningCompanyID`, `StandaloneSellingPrice`, `IsTaxable`, `DefaultBillingCycle`,
  `DefaultSubscriptionTermMonths` (BO-D35 fields-now-engine-later).
- Bundles (`ProductBundleItem`), entitlements (`ProductEntitlement` + `EntitlementGrant`),
  `ProductPerformanceObligation` (BO-D32/34/35/39/41).
- IsA extensions per BO-D37/D42: `EventProduct` + `EventOrderLine` FIRST, then Membership/PhysicalGood/
  DigitalGood/Service/Donation/GiftCard extension entities as seeded types.
- StoredValue pair (`StoredValueAccount` + `StoredValueTransaction`) + `Payment.Method='GiftCard'` CHECK
  widening + `Payment.StoredValueAccountID` (BO-D44).
- **`OrderLineDimension` junction** (§15 Q5, lean-yes — REQUIRED for Jeremy's batch-dimension detail:
  order lines tag accounting Dimensions; the booking draft propagates them to JE lines).
- Pricing tables: `plans/DEFERRALS.md` (MOD-6) — target shape unchanged.

## 5b. Stage S6 — Sales rules + approvals (UN-DEFERRED 2026-07-14 — Marcelo: "tasks is ready")

`SalesRule` + `SalesAuthority` (§4.8) + `Order.ApprovalTaskID` convenience pointer + the Approval-Request
Task wiring (BO-D17/D27). **Pre-step:** verify bizapps-tasks' current capabilities cover the #8 feature
list (outcome/decision model, reject hook, role routing) — strong evidence it does: accounting's
batch-approval `TasksAppApprovalGate` already runs on it. Enforcement engine = feature plan **F8**.

---

## 6. Triggers, permissions, and DB-level enforcement (cross-stage)

### 6.1 Enforcement placement (the rule this plan follows)

Accounting puts **financial invariants** (balance, immutability) in DB triggers because JEs must be safe even
against raw SQL. Orders' invariants are **workflow** rules (status transitions, totals consistency, reversal
cross-field checks) — MJ convention places those in the entity server (`ValidateAsync` / `Save()` overrides;
see MJ BASE_ENTITY_SERVER_PATTERNS: cross-record invariants via ValidateAsync, NOT DB triggers). So:

> **Marcelo directive 2026-07-11:** triggers ARE the house pattern for enforcing master-plan rules (the
> accounting locked-JE triggers are deliberate) — use them per the master plan and SUGGEST them wherever
> DB-level enforcement protects a master-plan invariant. The table below reflects that directive.

| Rule | Enforcement |
|---|---|
| Status CHECK value lists, Quantity <> 0, DiscountPct range, date sanity | **DB CHECK** (in the stage migrations above) |
| Transition legality (MOD-10 forward-skip matrix), Voided only from Draft/Quoted (MOD-7) | **Entity server** (Feature plan F1) |
| Booking idempotency (JournalEntryID guard), totals materialization, PaymentStatus derivation | **Entity server** |
| Negative-qty-only-on-reversal, PaymentLine over-application, credit-memo settlement rules | **Entity server ValidateAsync** |
| **Post-Confirm line immutability** — booked lines must not change under the JE | **DB TRIGGER (planned, S1):** `trg_OrderLine_ImmutableAfterConfirm` — blocks UPDATE of `ProductID/Quantity/UnitPrice/DiscountPct/LineTotalNet/LineTax/LineTotalGross` and DELETE on lines of Confirmed+ orders (reversal orders are the correction path, MOD-7/BO-D10) |
| **Booking-record protection** — `Order.JournalEntryID` must never be cleared/replaced once set | **DB TRIGGER (planned, S1):** `trg_Order_JournalEntryIDImmutable` (small, accounting-style; entity server also guards) |
| **Payment immutability after Capture** (S2) — captured payments' `Amount/Method/ReceivingCompanyID/JournalEntryID` frozen; reversal Payment is the correction path (BO-D14) | **DB TRIGGER (planned, S2):** `trg_Payment_ImmutableAfterCapture` |

### 6.2 Permissions (MOD-9(a) — Orders seeds its own roles)

Deliverable: metadata-seeded roles + entity permissions + RLS, mirroring accounting MOD-9 exactly so the two
apps present one permission model:

- Roles: **Orders User** (order entry: create/edit Draft/Quoted, confirm), **Orders Fulfiller** (the UPD-3/
  MOD-9 fulfiller: sees Posted orders with fulfillment-requiring lines, flips Fulfilled),
  **Orders Admin** (catalog + terms + providers + void/reversal authority).
- Entity CRUD permission rows per role over the orders entities; catalog entities read-only for User/Fulfiller.
- RLS scoping **deferred alongside accounting's** (their MOD-9 scopes by company; orders has no company column
  by design — scoping axis would be sales-rep/customer, which nobody has asked for). Row in QUESTIONS below (Q6).
- Seeded via the metadata folder (`metadata/roles/…`) + documented in an install doc; co-design the role tree
  with Marcelo before executing (same instruction accounting MOD-9 carries).

### 6.3 Sequences

`OrderSequence` (S1) + `PaymentSequence` (S2), both the accounting singleton pattern, consumed only by entity
servers (never client-side).

---

## 7. Execution order + effort map

| # | Stage | Migration | Blockers | Est. size |
|---|---|---|---|---|
| 1 | S1 Order A/R + customer + PaymentTermsType + OrderSequence | v0.2.x | none — ready on approval | 1 migration, ~15 col adds + 2 tables + seeds |
| 2 | S2 Payments | v0.3.x | none (Manual provider needs no Stripe creds) | 1 migration, 5 tables + 1 sequence |
| 3 | S3 Subscriptions + rev-rec | v0.4.x | none — CA-2 resolved 2026-07-13 (accounting MOD-11, date-driven) | 1 migration, 5 tables + col adds |
| 4 | S4 Tax v0 | none (A) / v0.5.x (B) | Robert decision | seeds or 2 tables |
| 5 | S5 Catalog depth (full parity wave) | v0.5.x/v0.6.x | none — planned phase (2026-07-14 upgrade) | 1-2 migrations, ~12 tables + col adds |
| 5b | S6 Sales rules + approvals | baseline edit | tasks-capability verification only (un-deferred 2026-07-14) | 2 tables + ApprovalTaskID + wiring |
| — | §6.2 roles/permissions | metadata | Marcelo co-design | metadata only |

Each stage = migrate → codegen → build → harness re-run → commit (migration + regenerated code together).
Marcelo executes/validates schema stages personally (his call: schema correctness is on the orchestrator).

## 8. Questions for Marcelo (blocking or shaping THIS plan)

1. **S1 scope check — anything you want pulled forward/pushed back?** (e.g., ContractID now vs when the
   AIDP-contracts question (Q-E) resolves; RequestedDeliveryDate is cheap but nobody asked for it explicitly.)
2. **`ExternalDocumentNumber` unique?** Bill.com needs it present; should the DB enforce uniqueness (filtered
   unique index WHERE NOT NULL) or can two orders legitimately share one (e.g., a reversal citing the
   original's external doc)? I lean **not unique** until Jeremy's numbering decision (Q-B) lands.
3. **Money precision:** master says `DECIMAL(18,2)` for totals; built `UnitPrice` is `DECIMAL(19,4)`. I plan
   18,2 for all new total/amount columns and leave UnitPrice as-is. OK, or standardize everything to 19,4?
4. **`Payment.ReceivingCompanyID` → hard FK to `__mj.Company` vs soft ref?** Master says FK; MOD-3's note keeps
   the concept. Accounting FKs `__mj.Company` from ACP, so hard FK has precedent. I lean **hard FK**.
5. ~~Post-Confirm line immutability: DB trigger or entity-server only?~~ **RESOLVED 2026-07-11 (Marcelo):
   triggers are the house pattern — enforce master-plan invariants at the DB level.** §6.1 now plans three
   triggers (line immutability after Confirm, JournalEntryID protection, payment immutability after
   Capture). Review the exact frozen-column lists at finalization.
6. **RLS for orders:** defer (my lean) or scope now — and if now, by what axis (sales rep? customer? none)?
7. **IntercompanyFlow timing:** master §4.7 puts it in Orders; accounting MOD-5 moves leg *generation* to
   Payments — and (2026-07-13) the per-pair WIRING table is Payments-side too (accounting dropped it from
   its baseline). Build `IntercompanyFlow` + the wiring table with S2, or wait for a real multi-company
   consumer? I lean **wait** (recon/analytics plumbing + wiring with no consumer yet; design both together
   at O2+ with the Q20-residual Amith check).

## 9. Questions to route to others (tracked in BACKLOG/ISSUES; do not block S1–S3)

- **Q-B / Jeremy:** single vs dual numbering; ExternalDocumentNumber semantics (= posted number or free-form?).
- **Robert:** tax v0 shape (§4 A vs B); contracts ownership vs AIDP contracts (Q-E — shapes `Order.ContractID`
  semantics); Employee entity for approver links (Q-F, accounting D-Q1).
- **Periods: SETTLED — FINAL (Marcelo 2026-07-14; the same-day MOD-13 manual-close detour was
  withdrawn)** — follow the removal; backdating ships unguarded; no period machinery anywhere (CA-3 +
  accounting CA-1 resolved; CA-2 resolved by MOD-11). Accountants batch entries into the right periods.
  **Schema here is deliberately decision-proof** (PostedAt/OrderDate both stored). Q2's remaining half
  (owning-company field + company revenue default) still with Robert.
  *Marcelo 2026-07-11: circle back to him on this one IN DETAIL at plan finalization (before executing).*
- **Amith:** rev-rec cadence — batch-monthly vs continuous (UPD-2 note; affects Feature F4, not schema).

---

## Appendix — Parity coverage matrix (master plan → where it lands) — added 2026-07-14

Every §4 entity + major feature of the MODIFIED master plan, mapped. **Nothing is unplanned**: each row
is a schema stage (S*), a feature phase (F*), the UI plan, or an explicit `plans/DEFERRALS.md` row.

| Master item | Covered by |
|---|---|
| ProductType (full behavior fields) | built (base) + S1.4 + **S5** |
| ProductCategory | built (+`Code` in S5) |
| Product (lifecycle/SSP/subscription fields) | built (base) + **S5**; GL columns never return (MOD-2) |
| ProductBundleItem + two bundle modes | **S5** + F7 (fast-path expansion; bundle-line); allocation engine → DEFERRALS |
| ProductPerformanceObligation | **S5** (fields; engine → DEFERRALS per BO-D35) |
| ProductEntitlement + EntitlementGrant | **S5** + F7 (grant creation at booking; provisioning engine later per BO-D34/D39) |
| PriceList/ProductPrice/PriceTier | DEFERRALS (MOD-6) |
| ProductTaxCategory + OrderLineTaxLine | **S4** (Option B; Option A quick path = seeds only) |
| IsA extensions (Event first; 6 more types) | **S5** + F7 |
| Order (full §4.2 field set as overlaid) | **S1** |
| OrderLine (full set + ServicePeriod + dimensions) | **S1** + S3 (sub/rev-rec FKs) + **S5** (OrderLineDimension) |
| PaymentTermsType | **S1** |
| Order sequences / numbering | **S1** (dual numbering pending Q-B) |
| Subscription / SubscriptionPlan / SubscriptionEvent | **S3** + F4 |
| RevenueRecognitionSchedule + RevRecScheduleLine (dated rows) | **S3** + F4 (MOD-11 accounting counterpart) |
| Payment / PaymentLine / PaymentProvider / PaymentIntent / CustomerPaymentMethod | **S2** + F3 |
| StoredValueAccount / StoredValueTransaction + gift-card flows | **S5** + F7 |
| IntercompanyFlow + per-pair wiring table | O2+ with Payments maturity (accounting MOD-5; Q20 residual) |
| SalesRule / SalesAuthority + approvals | **S6** + **F8** (un-deferred 2026-07-14; tasks-capability check first) |
| JE emission (booking, per-company split, reversals) | built + F1/F2 (MOD-11-orders) |
| Payment JEs + cash application | F3 |
| Rev-rec bridge (CreateScheduledJournalEntries) | F4 + accounting B3 |
| Fulfillment (per-line flips by Fulfiller role + auto-advance) | F1.6 + F6 + UI §7 (MOD-8/UPD-3 — Marcelo 2026-07-14 confirm) |
| Sales-rule evaluation at Confirm | **F8** (with S6) |
| Tax invocation at line time | F5 (provider half = accounting DEFERRALS) |
| Dunning workflow (master Phase E) | **F3.6** (added 2026-07-14) |
| Manual subscription billing cron (Phase E) | **F4.4** (renewal spawning covers it; non-Stripe cadence) |
| Webhooks + Stripe lifecycle | F3-Stripe |
| Reversals at every layer | F2 (orders/payments) + F4 (sub cancellation/proration) |
| Multi-company mechanics (§5) | F1.2 per-company split (MOD-11); intercompany legs → Payments (O2+) |
| Backdating (no guard — final) | F1.7 (seam only; accountants batch into right periods) |
| Statements/portal/variants/metered/dispute/recon/CDP-migration | DEFERRALS (each with trigger) |
