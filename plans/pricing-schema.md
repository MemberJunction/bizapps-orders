# Pricing, promotions and charges — proposed schema

> **Status:** Schema for review (2026-07-26). Nothing built.
> **Design:** [`pricing-charges-and-promotions.md`](./pricing-charges-and-promotions.md)
> **Convention:** phase markers show what lands when. Everything is `__mj_BizAppsOrders` unless noted.

---

## Phase 1 — price resolution

### `PriceList` *(revise)*

```sql
CREATE TABLE PriceList (
    ID              UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    Code            NVARCHAR(40)  NOT NULL,
    Name            NVARCHAR(200) NOT NULL,
    Description     NVARCHAR(MAX) NULL,
    EffectiveFrom   DATE NULL,
    EffectiveTo     DATE NULL,
    Status          NVARCHAR(10) NOT NULL DEFAULT 'Active',
    CONSTRAINT UQ_PriceList_Code UNIQUE (Code),
    CONSTRAINT CK_PriceList_Status CHECK (Status IN ('Active','Inactive'))
);
```

**`Segment` is dropped.** It was `NVARCHAR(40)` matched against nothing — the assignment table below
replaces it with something FK-enforced.

**No `CompanyID` at all** — I proposed one and then withdrew it (Amith, 2026-07-26: *"not sure what
this means since a product is company specific"*, which is the right instinct).

A price list is a **container of prices**, and every price in it points at a `Product` that already
carries its company. So the company is fully determined per row, and a column on the list would only
be an administrative guardrail — "this list may contain nothing but CoA products" — enforcing a
constraint nobody asked for.

Dropping it is also the shape the business wants. A trade association whose three companies sell
publications, events and courses gives its members one member rate across all three; that is ONE
list containing prices for products from three companies, not three lists to keep in sync. And it
costs nothing on visibility: a user granted only CoA sees the list, with the rows they are entitled
to see, through the ordinary per-company rules (D28).

### `PriceListAssignment` *(new — the missing link)*

```sql
CREATE TABLE PriceListAssignment (
    ID              UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    PriceListID     UNIQUEIDENTIFIER NOT NULL,
    OrganizationID  UNIQUEIDENTIFIER NULL,   -- bizapps-common
    PersonID        UNIQUEIDENTIFIER NULL,   -- bizapps-common
    Priority        INT NOT NULL DEFAULT 0,
    StartedAt       DATETIMEOFFSET NULL,
    EndedAt         DATETIMEOFFSET NULL,
    Status          NVARCHAR(10) NOT NULL DEFAULT 'Active',
    CONSTRAINT CK_PriceListAssignment_Party
        CHECK ((OrganizationID IS NULL) <> (PersonID IS NULL))
);
```

This is the table nothing in the current schema provides. `Organization` lives in bizapps-common so
the assignment cannot live there.

**No "default list" row is needed** — a product's base price is the `ProductPrice` row with
`PriceListID IS NULL`. A customer with no assignment simply resolves to base.

`Priority` breaks ties when a person's assignment and their organization's both apply.

### `ProductPrice` *(revise — it becomes the price RULE)*

One row **is** one rule. Several rows per (product, list) express bands, seasons and windows;
`Priority` disambiguates.

```sql
CREATE TABLE ProductPrice (
    ID                  UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    ProductID           UNIQUEIDENTIFIER NOT NULL,
    PriceListID         UNIQUEIDENTIFIER NULL,         -- NULL = the product's base price
    PricingModel        NVARCHAR(20) NOT NULL DEFAULT 'Flat',
    FeeType             NVARCHAR(20) NOT NULL DEFAULT 'Standard',
    Amount              DECIMAL(19,4) NOT NULL,
    UnitOfMeasure       NVARCHAR(40) NULL,
    PackageQuantity     DECIMAL(18,4) NULL,            -- Package model: N units for Amount

    -- applicability: quantity
    MinQuantity         DECIMAL(18,4) NULL,
    MaxQuantity         DECIMAL(18,4) NULL,

    -- applicability: absolute window
    EffectiveFrom       DATE NOT NULL,
    EffectiveTo         DATE NULL,

    -- applicability: RECURRING window (evaluated in TypeScript, never in SQL)
    RecurrenceMonths       NVARCHAR(40) NULL,   -- '11,12'
    RecurrenceDaysOfWeek   NVARCHAR(20) NULL,   -- '1,2,3,4,5' (Mon=1)
    RecurrenceDayOfMonthMin TINYINT NULL,
    RecurrenceDayOfMonthMax TINYINT NULL,
    TimeOfDayStart      TIME NULL,              -- in the OWNING COMPANY's timezone
    TimeOfDayEnd        TIME NULL,

    Priority            INT NOT NULL DEFAULT 0,
    Status              NVARCHAR(10) NOT NULL DEFAULT 'Active',
    Description         NVARCHAR(MAX) NULL,     -- why this rule exists
    CONSTRAINT CK_ProductPrice_PricingModel
        CHECK (PricingModel IN ('Flat','PerUnit','Tiered','Volume','Package','Usage')),
    CONSTRAINT CK_ProductPrice_FeeType
        CHECK (FeeType IN ('Standard','Setup','Recurring','Overage'))
);
```

**Recurrence as delimited strings**, not a child table. They are only ever evaluated in TypeScript,
never filtered in SQL, so a child table would add a join and a write path for zero query benefit.
The absolute window stays as real columns because that *is* filtered.

**Ties on `Priority` are refused at write time** by the entity server, not resolved at read time. Two
equally-applicable rules would otherwise produce an arbitrary winner — stable in test, liable to
flip in production. Same rule as `IntercompanyAccountMatch`.

### `PriceTier` *(unchanged)*

Hangs off a `ProductPrice` whose model is `Tiered` or `Volume`.

### `OrderLine` *(revise)*

```sql
ALTER TABLE OrderLine ADD ProductPriceID UNIQUEIDENTIFIER NULL;  -- which rule priced it
```

`UnitPrice` still stamps; this records *why*. Without it a disputed invoice cannot be traced back to
the rule that produced the number.

### `OrderLinePriceComponent` *(new — the audit trail)*

```sql
CREATE TABLE OrderLinePriceComponent (
    ID              UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    OrderLineID     UNIQUEIDENTIFIER NOT NULL,
    Sequence        INT NOT NULL,
    ComponentType   NVARCHAR(20) NOT NULL,      -- Base | Rule | Adjustment | Charge | Tax
    Label           NVARCHAR(200) NOT NULL,     -- human-readable
    Amount          DECIMAL(19,4) NOT NULL,     -- SIGNED
    RunningTotal    DECIMAL(19,4) NOT NULL,
    -- D25 polymorphic provenance: ProductPrice, Promotion, OrderCharge, TaxRate, …
    SourceEntityID  UNIQUEIDENTIFIER NULL,
    SourceRecordID  NVARCHAR(400) NULL,
    CONSTRAINT CK_OLPC_ComponentType
        CHECK (ComponentType IN ('Base','Rule','Adjustment','Charge','Tax')),
    CONSTRAINT CK_OLPC_SourcePair
        CHECK ((SourceEntityID IS NULL) = (SourceRecordID IS NULL))
);
```

Reuses accounting's D25 origin-pair pattern so a component can point at whatever produced it without
a column per source type.

### `OrderCompanyPolicy` *(new — per-company pricing policy)*

```sql
CREATE TABLE OrderCompanyPolicy (
    ID                      UNIQUEIDENTIFIER NOT NULL,  -- IS-A __mj.Company (AccountingCompanyProfile pattern)
    AllowPromotionStacking  BIT NOT NULL DEFAULT 0,     -- the company-level flip
    StackingMode            NVARCHAR(20) NOT NULL DEFAULT 'Sequential',
    RefuseUnpricedLines     BIT NOT NULL DEFAULT 1,
    DefaultPriceListID      UNIQUEIDENTIFIER NULL,
    CONSTRAINT CK_OrderCompanyPolicy_StackingMode
        CHECK (StackingMode IN ('Sequential','Additive'))
);
```

`ID` = `Company.ID`, mirroring `AccountingCompanyProfile`'s IS-A shape. A company with no row takes
the defaults, so this never needs backfilling.

**`StackingMode` is configurable per company, both modes supported** (Amith, 2026-07-26), defaulting
to `Sequential` as the conservative choice — it discounts less, so a misconfiguration costs nothing.

It is deliberately NOT per-promotion. The mode describes how a SET of promotions combines, not how
one behaves: two promotions, one claiming additive and one sequential, has no coherent answer. The
company is the smallest grain at which the question is well-posed.

---

## Phase 2 — promotions

### `PromotionType` *(new, lookup — seeded via metadata)*

```sql
CREATE TABLE PromotionType (
    ID          UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    Code        NVARCHAR(40)  NOT NULL,   -- PercentOff | AmountOff | OverridePrice | FreeShipping
    Name        NVARCHAR(200) NOT NULL,
    Description NVARCHAR(MAX) NULL,
    Sequence    INT NOT NULL DEFAULT 0,
    IsActive    BIT NOT NULL DEFAULT 1,
    CONSTRAINT UQ_PromotionType_Code UNIQUE (Code)
);
```

A lookup rather than a CHECK so types are additive at runtime, and so `Code` can key a ClassFactory
registration for custom behaviour. Same reasoning as accounting's `GLAccountRole`.

### `Promotion` *(new — the offer and its rules)*

```sql
CREATE TABLE Promotion (
    ID                      UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    Code                    NVARCHAR(40)  NOT NULL,   -- internal handle, NOT the redeemable code
    Name                    NVARCHAR(200) NOT NULL,
    Description             NVARCHAR(MAX) NULL,
    PromotionTypeID         UNIQUEIDENTIFIER NOT NULL,
    CompanyID               UNIQUEIDENTIFIER NULL,
    Value                   DECIMAL(19,4) NOT NULL,   -- 0.10 for 10%, or an amount
    AppliesAt               NVARCHAR(10) NOT NULL DEFAULT 'Either',  -- Line | Order | Either
    AllowsStacking          BIT NOT NULL DEFAULT 0,
    StackSequence           INT NOT NULL DEFAULT 0,
    MaxRedemptions          INT NULL,                 -- total, NULL = unlimited
    MaxRedemptionsPerCustomer INT NULL,
    MinimumOrderAmount      DECIMAL(19,4) NULL,
    MinimumQuantity         DECIMAL(18,4) NULL,
    EffectiveFrom           DATETIMEOFFSET NULL,
    EffectiveTo             DATETIMEOFFSET NULL,
    RecurrenceMonths        NVARCHAR(40) NULL,
    RecurrenceDaysOfWeek    NVARCHAR(20) NULL,
    TimeOfDayStart          TIME NULL,
    TimeOfDayEnd            TIME NULL,
    QualifierKey            NVARCHAR(100) NULL,       -- ClassFactory key for a plugin qualifier
    Status                  NVARCHAR(10) NOT NULL DEFAULT 'Draft',
    CONSTRAINT CK_Promotion_AppliesAt CHECK (AppliesAt IN ('Line','Order','Either')),
    CONSTRAINT CK_Promotion_Status CHECK (Status IN ('Draft','Active','Paused','Expired'))
);
```

`AllowsStacking` defaults **false** — the conservative default; a promotion must opt in. The
company-level flip lives on `OrderCompanyPolicy`.

**When two non-stacking promotions collide, the HIGHEST VALUE wins** (Amith, 2026-07-26). The loser
is still recorded — as an `OrderAdjustment`-shaped fact of what was offered and not applied — so
"why didn't my code work?" has an answer. Resolving by `StackSequence` instead was rejected: it is
deterministic but can silently hand the customer the worse of two offers, and reordering sequences
would change what people pay without anyone editing a promotion.

### `PromotionTarget` *(new — what it applies to)*

```sql
CREATE TABLE PromotionTarget (
    ID                  UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    PromotionID         UNIQUEIDENTIFIER NOT NULL,
    ProductID           UNIQUEIDENTIFIER NULL,
    ProductCategoryID   UNIQUEIDENTIFIER NULL,
    IncludeDescendants  BIT NOT NULL DEFAULT 1,
    CONSTRAINT CK_PromotionTarget_One
        CHECK ((ProductID IS NULL) <> (ProductCategoryID IS NULL))
);
```

**No rows = applies to everything.** Absence as "global" avoids a `Scope` enum whose values would
have to stay in sync with which columns are populated.

### `PromotionCode` *(new — the redeemable strings)*

```sql
CREATE TABLE PromotionCode (
    ID                      UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    PromotionID             UNIQUEIDENTIFIER NOT NULL,
    Code                    NVARCHAR(60) NOT NULL,
    MaxRedemptions          INT NULL,          -- per-code cap, distinct from the promotion's
    AssignedOrganizationID  UNIQUEIDENTIFIER NULL,
    AssignedPersonID        UNIQUEIDENTIFIER NULL,
    EffectiveFrom           DATETIMEOFFSET NULL,
    EffectiveTo             DATETIMEOFFSET NULL,
    Status                  NVARCHAR(10) NOT NULL DEFAULT 'Active',
    CONSTRAINT UQ_PromotionCode_Code UNIQUE (Code)
);
```

One promotion, many codes — public, per-campaign, per-customer — without duplicating the offer.
This is Stripe's Coupon / Promotion Code split (D22's launch provider), so it maps one-to-one.

**No `RedemptionCount` column.** A stored counter drifts; redemptions are counted from
`OrderAdjustment`, which is the record of what actually happened.

### `OrderAdjustment` *(new — an applied reduction)*

```sql
CREATE TABLE OrderAdjustment (
    ID              UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    OrderHeaderID   UNIQUEIDENTIFIER NOT NULL,
    OrderLineID     UNIQUEIDENTIFIER NULL,     -- NULL = order-level, allocated below
    PromotionID     UNIQUEIDENTIFIER NULL,     -- NULL = a manual discount
    PromotionCodeID UNIQUEIDENTIFIER NULL,
    Amount          DECIMAL(19,4) NOT NULL,    -- positive; it is a reduction
    Sequence        INT NOT NULL DEFAULT 0,
    Reason          NVARCHAR(MAX) NULL,        -- REQUIRED when PromotionID is NULL
    AppliedByUserID UNIQUEIDENTIFIER NULL,
    AppliedAt       DATETIMEOFFSET NOT NULL DEFAULT SYSDATETIMEOFFSET(),
    -- authorization trail for manual discounts
    AuthorizedBySalesAuthorityID UNIQUEIDENTIFIER NULL,  -- the authority that permitted it
    ApprovedByUserID             UNIQUEIDENTIFIER NULL,  -- set when it needed escalation
    ApprovedAt                   DATETIMEOFFSET NULL,
    CONSTRAINT CK_OrderAdjustment_Amount CHECK (Amount > 0),
    -- a discount tracing to no promotion must say why
    CONSTRAINT CK_OrderAdjustment_ManualReason
        CHECK (PromotionID IS NOT NULL OR (Reason IS NOT NULL AND LEN(LTRIM(Reason)) > 0))
);
```

Serves as both the applied discount **and** the redemption ledger — one concept, not two. Manual
discounts (no promotion) ride the same table, which is why `Reason` exists — and the CHECK makes an
unexplained manual discount unstorable rather than merely discouraged.

### Manual discounts need authority — and the table already exists

Amith asked whether manual discounts need an authorization level. They do, and **`SalesAuthority` was
built for exactly this and has never been used**:

```sql
SalesAuthority (
    SalesRepUserID,
    MaxDiscountPct,              -- <- the cap on a manual discount
    MaxOrderValue,
    AllowedProductCategoryIDs,
    IsActive
)
```

So the rule needs no new table: a manual `OrderAdjustment` is permitted when the applying user holds
an active `SalesAuthority` whose `MaxDiscountPct` covers the discount as a fraction of the line (or
order) it reduces. `AuthorizedBySalesAuthorityID` stamps WHICH authority permitted it, so revoking or
lowering a rep's limit later does not rewrite the history of what was legitimate at the time.

**Beyond the cap, it escalates rather than refusing.** `SalesRule` (also unused) already models this:
`RuleType='DiscountLimit'` with `ApprovalRequiredRoleID`. Over-limit discounts land needing approval
and stamp `ApprovedByUserID`/`ApprovedAt` when granted. A hard refusal at the cap is what pushes
people into recording the discount as something else, which is the outcome the cap exists to prevent.

A user with **no** `SalesAuthority` row cannot apply a manual discount at all — absence is not
permission.

### `OrderAdjustmentAllocation` *(new)*

```sql
CREATE TABLE OrderAdjustmentAllocation (
    ID                 UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    OrderAdjustmentID  UNIQUEIDENTIFIER NOT NULL,
    OrderLineID        UNIQUEIDENTIFIER NOT NULL,
    Amount             DECIMAL(19,4) NOT NULL,
    CONSTRAINT UQ_OrderAdjustmentAllocation UNIQUE (OrderAdjustmentID, OrderLineID)
);
```

A line-level adjustment gets one row; an order-level one gets N, pro-rata by line value with the
largest line absorbing the rounding remainder. **Mandatory, not optional** — tax and GL are per line,
and on a multi-company order the split decides whose revenue is reduced.

---

## Phase 3 — charges

### `ChargeType` *(new, lookup — seeded via metadata)*

```sql
CREATE TABLE ChargeType (
    ID              UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    Code            NVARCHAR(40)  NOT NULL,
    Name            NVARCHAR(200) NOT NULL,
    Category        NVARCHAR(20)  NOT NULL,   -- Shipping | Handling | Tax | Surcharge | Fee
    Basis           NVARCHAR(30)  NOT NULL,   -- what it computes on
    Sequence        INT NOT NULL DEFAULT 0,   -- application order
    AllowsOverride  BIT NOT NULL DEFAULT 1,
    IsActive        BIT NOT NULL DEFAULT 1,
    CONSTRAINT UQ_ChargeType_Code UNIQUE (Code),
    CONSTRAINT CK_ChargeType_Category
        CHECK (Category IN ('Shipping','Handling','Tax','Surcharge','Fee')),
    CONSTRAINT CK_ChargeType_Basis
        CHECK (Basis IN ('LineNet','LineNetPlusCharges','OrderNet','Flat'))
);
```

**`Basis` is the field that makes tax-on-shipping work.** Whether shipping is taxable is
jurisdiction-dependent, so it is configuration rather than code.

### `OrderCharge` *(new)*

```sql
CREATE TABLE OrderCharge (
    ID                  UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    OrderHeaderID       UNIQUEIDENTIFIER NOT NULL,
    ChargeTypeID        UNIQUEIDENTIFIER NOT NULL,
    Amount              DECIMAL(19,4) NOT NULL,
    BasisAmount         DECIMAL(19,4) NULL,      -- what it was computed on (audit)
    Rate                DECIMAL(9,6)  NULL,      -- for rate-driven charges
    Sequence            INT NOT NULL DEFAULT 0,  -- stamped from the type
    -- tax provenance (accounting FKs; NULL for non-tax charges)
    TaxJurisdictionID   UNIQUEIDENTIFIER NULL,
    TaxRateID           UNIQUEIDENTIFIER NULL,
    CalculationSource   NVARCHAR(50) NOT NULL DEFAULT 'Internal',
    -- override trail
    IsOverridden        BIT NOT NULL DEFAULT 0,
    ComputedAmount      DECIMAL(19,4) NULL,      -- what it would have been
    OverrideReason      NVARCHAR(MAX) NULL,
    OverriddenByUserID  UNIQUEIDENTIFIER NULL,
    OverriddenAt        DATETIMEOFFSET NULL,
    CONSTRAINT CK_OrderCharge_Override
        CHECK (IsOverridden = 0 OR (OverrideReason IS NOT NULL AND ComputedAmount IS NOT NULL))
);
```

The override CHECK makes "waived without saying why" unstorable.

### `OrderChargeAllocation` *(new)*

```sql
CREATE TABLE OrderChargeAllocation (
    ID              UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    OrderChargeID   UNIQUEIDENTIFIER NOT NULL,
    OrderLineID     UNIQUEIDENTIFIER NOT NULL,
    Amount          DECIMAL(19,4) NOT NULL,
    CONSTRAINT UQ_OrderChargeAllocation UNIQUE (OrderChargeID, OrderLineID)
);
```

Answers "which order lines are responsible for this charge" — needed for tax (per line), GL (per
line's company) and returns (refunding a line refunds its share).

---

## Phase 4 — tax

### Orders side

```sql
ALTER TABLE Product ADD TaxCategory NVARCHAR(50) NULL;
```

A string matching accounting's existing `TaxRate.TaxCategory`, rather than the new
`ProductTaxCategory` table D23 imagined. Accounting already keys taxability by string; a table here
would need syncing to it and could drift.

### Accounting side *(needs Marcelo)*

**`CompanyTaxNexus`** *(new)* — nexus is a property of a legal entity and a jurisdiction, so it
belongs with the entity, not the order:

```sql
CREATE TABLE __mj_BizAppsAccounting.CompanyTaxNexus (
    ID                  UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    CompanyID           UNIQUEIDENTIFIER NOT NULL,
    TaxJurisdictionID   UNIQUEIDENTIFIER NOT NULL,
    RegistrationNumber  NVARCHAR(100) NULL,
    RegisteredFrom      DATE NOT NULL,
    RegisteredTo        DATE NULL,
    Status              NVARCHAR(10) NOT NULL DEFAULT 'Active'
);
```

**`CustomerTaxProfile`** *(one column)* — today it is (Organization, Jurisdiction) and cannot express
"exempt from state sales tax on publications but not on merchandise":

```sql
ALTER TABLE __mj_BizAppsAccounting.CustomerTaxProfile
    ADD TaxCategory NVARCHAR(50) NULL;   -- NULL = every category
```

Everything else tax-related already exists there: `TaxAuthority`, hierarchical `TaxJurisdiction`,
`TaxRate` (already carrying `Source`, built for external feeds), `TaxLiability`, `TaxRemittance`.

**No `OrderLineTaxLine`.** D23 imagined one; under this design a tax result is an `OrderCharge` of a
tax `ChargeType` with its allocations — the same information with one fewer concept.

---

## GL treatment

No new mechanism. Each of these resolves its account **and dimensions** through the existing
`GLAccountLink` → `GLAccountLinkDimension` pattern, keyed polymorphically on the config record:

| Component | Link target | Missing account |
|---|---|---|
| Adjustment | `PromotionType` or `Promotion` | **nets into the Sales credit** (existing D11 behaviour) |
| Charge | `ChargeType` | **hard refusal** |
| Tax charge | `ChargeType` (+ jurisdiction) | **hard refusal** |

Roles are additive at runtime and seeded via metadata, which is exactly the extension point this
needs — no schema change in accounting for new charge or promotion kinds.

---

## Count

| Phase | New | Revised |
|---|---|---|
| 1 | `PriceListAssignment`, `OrderLinePriceComponent`, `OrderCompanyPolicy` | `PriceList`, `ProductPrice`, `OrderLine` |
| 2 | `PromotionType`, `Promotion`, `PromotionTarget`, `PromotionCode`, `OrderAdjustment`, `OrderAdjustmentAllocation` | — *(plus WIRING the existing unused `SalesAuthority` + `SalesRule`)* |
| 3 | `ChargeType`, `OrderCharge`, `OrderChargeAllocation` | — |
| 4 | `CompanyTaxNexus` *(accounting)* | `Product`, `CustomerTaxProfile` *(accounting)* |

**12 new tables, 5 revised**, of which 3 new and 3 revised are phase 1.

---

## Decisions taken (Amith, 2026-07-26)

| Question | Answer |
|---|---|
| `PriceList.CompanyID` | **Dropped entirely** — the product already determines company per row |
| Stacking arithmetic | **Both modes**, configured per company; `Sequential` default |
| Exclusive collision | **Highest value wins**; the loser is recorded as offered-not-applied |
| Manual discounts | **Allowed with a required reason**, gated by `SalesAuthority.MaxDiscountPct`, escalating via `SalesRule` rather than refusing |

## Still open

1. **`CompanyTaxNexus` placement** — accounting (proposed: it is a property of a legal entity and a
   jurisdiction, not of an order) or orders. Phase 4, so not blocking.
2. **Rate feed provider** — which service backs the sync posture, and who owns the credentials.
   Phase 4.
