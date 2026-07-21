# BizApps Orders — ERD (PLANNED)

- **Date:** 2026-07-21
- **PLANNED = plan chain through MOD-14/UPD-13 as of 2026-07-20; ⏸/gated items marked.** One ruling
  landed 2026-07-21 and is folded in: the ProductCategory company model is **DECIDED** (Marcelo,
  orders Q24 — company-owned rows; see §2).
- **This document is fully self-contained:** every planned table (all **38**) appears below with its
  complete column set. Changed / new / gated elements are marked inline with `%% MOD-x` / `%% UPD-x`
  comments; unmarked columns are as-built (source:
  `migrations/B202607061431__v0.1.x__Schema_and_Tables.sql`; the pure as-built view is
  `ERD-current.md`).
- Authorities: `plans/MASTER-PLAN.md` (+§4.7/§5), `plans/MASTER-PLAN-MODIFICATIONS.md` (through
  MOD-14), `plans/MASTER-PLAN-UPDATES.md` (through UPD-13), `plans/QUESTIONS.md` Q21 + Q24 ruling,
  `plans/action-plans/ActionPlan - Coupons (schema to UI).md` (S7 draft).
- Conventions: schema `__mj_BizAppsOrders`; simplified types (`UUID`, `string`, `decimal`,
  `datetime`, `date`, `bool`, `int`); CodeGen's `__mj_CreatedAt`/`__mj_UpdatedAt` on every table are
  omitted from diagrams; **dashed lines = soft references** (plain UNIQUEIDENTIFIER, no FK). Cross-app
  entities (`__mj.*`, `BizAppsCommon.*`, `Accounting.*`) appear as **linked pseudo-entities only** —
  we do not document other apps' internals.

## Delta summary (vs as-built)

| # | Delta | Authority | Status |
|---|-------|-----------|--------|
| 1 | `Order.CompanyID` + `OrderLine.CompanyID` + `Product.OwningCompanyID`→`CompanyID` (NOT NULL) + `Subscription.CompanyID` | MOD-3 rev-2/rev-3 | Accepted — V1.1 amendment |
| 2 | `ProductCategory.CompanyID` (FK `__mj.Company`, NOT NULL — company-owned rows; identical-name display-collapse handled in UI, no registry table) | **Q24 ruling (Marcelo 2026-07-21)**, MOD-3 family | **Decided — committed** |
| 3 | `OrderJournalEntry` junction; `Order.JournalEntryID` deprecated | UPD-7 (with MOD-11) | Accepted |
| 4 | `RevRecScheduleLine.ScheduledJournalEntryID` retired | MOD-12 | Accepted |
| 5 | `IntercompanyFlow` pulled forward to launch + 2 new accounting GLAccountRoles | MOD-14 (+ master §4.7/§5, BO-D6) | Accepted — V1.7/S3, shape finalizes in S3 |
| 6 | Coupons: `Coupon` + `CouponRedemption` + order/line discount recording | UPD-8 (MOD-6 S7 draft) | Accepted — **schema freeze pending** |
| 7 | Tax Option B: `ProductTaxCategory` + `Product.ProductTaxCategoryID` + `OrderLineTaxLine` | Q21 answer (V2.7) | **Gated on launch-tax finance call** |
| 8 | `SubscriptionPlan.RenewalSpawnStatus` | UPD-9 | Accepted |
| 9 | `DunningGracePeriodDays` Orders configuration setting | UPD-6.3 | Accepted — entity TBD (no table drawn) |

Table count: 32 as-built + 6 new (`OrderJournalEntry`, `IntercompanyFlow`, `Coupon`,
`CouponRedemption`, `ProductTaxCategory`, `OrderLineTaxLine`) = **38**.

---

## 1. Overview — planned entity set (no attributes)

```mermaid
erDiagram
    %% ── Catalog ──
    ProductType ||--o{ Product : "classifies"
    ProductCategory |o--o{ Product : "groups"
    ProductCategory |o--o{ ProductCategory : "parent of"
    Company__mj ||--o{ ProductCategory : "CompanyID (Q24 — company-owned rows)"
    Company__mj ||--o{ Product : "CompanyID (MOD-3, NOT NULL)"
    Product |o--o{ Product : "succeeded by"
    Product ||--o{ ProductBundleItem : "bundle"
    Product ||--o{ ProductBundleItem : "component"
    Product ||--o{ ProductPerformanceObligation : "obligations"
    Product ||--o{ ProductEntitlement : "grants defined"
    Product ||--|| EventProduct : "IsA extension"
    PriceList |o--o{ ProductPrice : "scopes"
    Product ||--o{ ProductPrice : "priced by"
    ProductPrice ||--o{ PriceTier : "tiers"
    ProductTaxCategory |o..o{ Product : "tax category (Q21 — gated)"

    %% ── Orders ──
    Order ||--o{ OrderLine : "lines"
    Product ||--o{ OrderLine : "sells"
    Product |o--o{ OrderLine : "source bundle"
    PaymentTermsType |o--o{ Order : "terms"
    Order |o--o{ Order : "reverses"
    OrderLine |o--o{ OrderLine : "reverses"
    OrderLine ||--|| EventOrderLine : "IsA extension"
    OrderLine ||--o{ OrderLineDimension : "tagged"
    Company__mj ||--o{ Order : "CompanyID owning company (MOD-3 rev-2)"
    Company__mj ||--o{ OrderLine : "CompanyID denormalized (MOD-3 rev-3)"
    OrderLine ||--o{ OrderLineTaxLine : "per-jurisdiction tax (Q21 — gated)"
    SalesAuthority }o--|| User__mj : "rep limits"
    SalesRule }o--o| Role__mj : "approval role"

    %% ── Order ↔ JE junction (UPD-7) ──
    Order ||--o{ OrderJournalEntry : "booked as (1 JE per company, MOD-11)"
    OrderJournalEntry }o..|| JournalEntry_Acct : "JournalEntryID (soft)"

    %% ── Intercompany (MOD-14) ──
    Order |o--o{ IntercompanyFlow : "originates"
    Subscription |o--o{ IntercompanyFlow : "recurring flows"
    Company__mj ||--o{ IntercompanyFlow : "from company"
    Company__mj |o--o{ IntercompanyFlow : "to company"
    IntercompanyFlow }o..o| JournalEntry_Acct : "from/to JE legs (soft)"

    %% ── Coupons (UPD-8, freeze pending) ──
    Coupon ||--o{ CouponRedemption : "redeemed as"
    Order ||--o{ CouponRedemption : "discounts"
    Product |o--o{ Coupon : "scopes (optional)"

    %% ── Payments ──
    PaymentProvider ||--o{ CustomerPaymentMethod : "vaults"
    PaymentProvider ||--o{ PaymentIntent : "intents"
    PaymentIntent }o--o| Order : "collects for"
    PaymentProvider |o--o{ Payment : "processes"
    PaymentIntent |o--o{ Payment : "captures"
    CustomerPaymentMethod |o--o{ Payment : "pays with"
    Payment |o--o{ Payment : "reverses"
    Payment ||--o{ PaymentLine : "applies"
    Order ||--o{ PaymentLine : "settled by"
    OrderLine |o--o{ PaymentLine : "line-applied"
    StoredValueAccount |o--o{ Payment : "gift-card tender"
    StoredValueAccount ||--o{ StoredValueTransaction : "ledger"
    Payment |o--o{ StoredValueTransaction : "related"
    Order |o--o{ StoredValueTransaction : "related"
    OrderLine |o--o{ StoredValueAccount : "issued from"
    Company__mj ||--o{ PaymentProvider : "owns"
    Company__mj ||--o{ Payment : "receiving"
    Company__mj ||--o{ StoredValueAccount : "issuing"

    %% ── Subscriptions & rev-rec ──
    Product ||--o{ SubscriptionPlan : "plans"
    OrderLine ||--o{ Subscription : "born from"
    SubscriptionPlan |o--o{ Subscription : "elaborates"
    Product ||--o{ Subscription : "of product"
    Company__mj ||--o{ Subscription : "CompanyID (MOD-3c)"
    PaymentProvider |o--o{ Subscription : "billed via"
    Subscription |o--o{ Subscription : "migrates"
    Subscription ||--o{ SubscriptionEvent : "lifecycle log"
    Payment |o--o{ SubscriptionEvent : "related"
    Order |o--o{ SubscriptionEvent : "related"
    RevenueRecognitionSchedule ||--o{ RevRecScheduleLine : "periods"
    Subscription |o--o{ OrderLine : "recurring lines"
    RevenueRecognitionSchedule |o--o{ OrderLine : "schedule of line"

    %% ── Entitlements ──
    ProductEntitlement ||--o{ EntitlementGrant : "instantiated"
    OrderLine |o--o{ EntitlementGrant : "from line"
    Subscription |o--o{ EntitlementGrant : "from subscription"

    %% ── __mj core (real FKs) ──
    User__mj |o--o{ Order : "sales rep / posted by"
    User__mj |o--o{ PaymentLine : "allocated by"

    %% ── Cross-app SOFT references (no FK) ──
    Organization_Common |o..o{ Order : "customer (soft)"
    Person_Common |o..o{ Order : "customer person (soft)"
    Address_Common |o..o{ Order : "bill-to / ship-to (soft)"
    Organization_Common |o..o{ CustomerPaymentMethod : "customer (soft)"
    Organization_Common |o..o{ PaymentIntent : "customer (soft)"
    Organization_Common |o..o{ Payment : "customer (soft)"
    Organization_Common |o..o{ Subscription : "customer (soft)"
    Person_Common |o..o{ Subscription : "beneficiary (soft)"
    Person_Common |o..o{ EntitlementGrant : "beneficiary (soft)"
    Organization_Common |o..o{ EntitlementGrant : "beneficiary org (soft)"
    Person_Common |o..o{ StoredValueAccount : "beneficiary (soft)"
    Address_Common |o..o{ EventProduct : "venue (soft)"

    %% ── Accounting seams (soft) ──
    JournalEntry_Acct |o..o{ Order : "JournalEntryID (soft) — DEPRECATED by UPD-7"
    JournalEntry_Acct |o..o{ Payment : "JournalEntryID (soft)"
    JournalEntry_Acct |o..o{ RevRecScheduleLine : "recognized JE (soft)"
    Dimension_Acct |o..o{ OrderLineDimension : "DimensionID + ValueID (soft)"
    GLAccountLink_Acct }o..o| Product : "accounting-owned link points AT"
    GLAccountLink_Acct }o..o| ProductCategory : "accounting-owned link points AT"
    GLAccountLink_Acct }o..o| Company__mj : "accounting-owned link points AT"
```

> Naming: `User__mj` = `__mj.User`, `Company__mj` = `__mj.Company`, `Role__mj` = `__mj.Role`,
> `*_Common` = `__mj_BizAppsCommon.*`, `*_Acct` = `__mj_BizAppsAccounting.*` — linked pseudo-entities
> only. `Order` = the bracketed `[Order]` table.

---

## 2. Catalog piece (11 tables)

MOD-3 lands the company columns: `Product.CompanyID` is the rename of `OwningCompanyID`, flipped NOT
NULL — the line's company (and revenue-side account resolution) anchors to the **product's** company.
**ProductCategory is company-owned (Q24 ruling, Marcelo 2026-07-21):** `ProductCategory.CompanyID`
FK `__mj.Company` NOT NULL; identical-name categories across companies are display-collapsed **in the
UI** — no registry table. Still **no GL columns** anywhere (accounting's polymorphic `GLAccountLink`
points AT Product / ProductCategory / Company rows); resolution walks product link → the
product-company's category tree → the product-company's default, failing loudly (MOD-3d).
`EventProduct` is an IsA-Disjoint child (PK = the parent Product's UUID). Pricing tables are
structure; the resolution engine is F9 (UnitPrice direct entry stays the precedence base, MOD-6).

```mermaid
erDiagram
    ProductType ||--o{ Product : "classifies"
    ProductCategory |o--o{ Product : "groups"
    ProductCategory |o--o{ ProductCategory : "parent"
    Company__mj ||--o{ ProductCategory : "owns (Q24)"
    Company__mj ||--o{ Product : "owns (MOD-3)"
    Product ||--|| EventProduct : "IsA (shared PK)"
    Product ||--o{ ProductBundleItem : "bundle"
    Product ||--o{ ProductBundleItem : "component"
    Product ||--o{ ProductPerformanceObligation : "PPO"
    Product ||--o{ ProductEntitlement : "entitlement defs"
    Product ||--o{ ProductPrice : "prices"
    PriceList |o--o{ ProductPrice : "scopes"
    ProductPrice ||--o{ PriceTier : "tiers"
    ProductTaxCategory |o..o{ Product : "gated (Q21)"

    ProductType {
        UUID ID PK
        string Code UK "nullable; filtered unique"
        string Name UK
        string Description "nullable"
        bool RequiresFulfillment "default 0"
        string DefaultRevenueRecognitionType "nullable; Immediate|Deferred"
        bool DefaultIsTaxable "default 1"
        bool IsBillableRecurring "default 0"
        string DefaultSubscriptionType "None|Standard|Membership; default None"
        string ProductExtensionEntity "nullable"
        string OrderLineExtensionEntity "nullable"
        string BehaviorClass "nullable"
        bool IsActive "default 1"
    }
    ProductCategory {
        UUID ID PK
        string Code UK "nullable; filtered unique"
        string Name
        UUID ParentID FK "nullable; self-FK; CK no self-parent"
        UUID CompanyID FK "NEW %% Q24 (2026-07-21, MOD-3 family) — NOT NULL -> __mj.Company; company-owned trees; identical-name display-collapse in UI, no registry table"
        string Description "nullable"
        bool IsActive "default 1"
    }
    Product {
        UUID ID PK
        string Name
        string SKU UK "nullable; filtered unique"
        UUID ProductTypeID FK
        UUID ProductCategoryID FK "nullable"
        UUID CompanyID FK "%% MOD-3c — RENAMED from OwningCompanyID, flipped NOT NULL -> __mj.Company; anchors line company + revenue-side resolution"
        UUID ProductTaxCategoryID FK "NEW %% Q21 Option B — nullable; gated on launch-tax call"
        string Status "Draft|Active|Discontinued|EOL; default Draft"
        UUID SuccessorProductID FK "nullable; self-FK; CK no self"
        date AvailableFrom "nullable; CK To>=From"
        date AvailableTo "nullable"
        string RevenueRecognitionType "Immediate|Deferred; default Immediate"
        string DeferredRecognitionShape "nullable; SingleDate|ServicePeriod"
        decimal StandaloneSellingPrice "nullable"
        string SubscriptionType "None|Standard|Membership; default None"
        string BehaviorClass "nullable"
        string DefaultBillingCycle "nullable; Monthly|Quarterly|Annual|Custom"
        int DefaultSubscriptionTermMonths "nullable"
        bool IsTaxable "default 1"
        string Description "nullable"
        bool IsActive "default 1"
    }
    EventProduct {
        UUID ID PK "FK = Product.ID (IsA shared PK)"
        datetime EventStartsAt
        datetime EventEndsAt "nullable; CK >= starts"
        string VenueName "nullable"
        UUID VenueAddressID "nullable; SOFT ref common Address"
        int Capacity "nullable; CK > 0"
        bool RequiresAttendeeInfo "default 1"
    }
    ProductBundleItem {
        UUID ID PK
        UUID BundleProductID FK "UQ pair; CK no self-bundle"
        UUID ComponentProductID FK
        decimal Quantity "default 1; CK > 0"
        string PricingMode "Bundled|SumOfParts; default Bundled"
        int SortOrder "default 0"
    }
    ProductPerformanceObligation {
        UUID ID PK
        UUID ProductID FK
        string Name "nullable"
        string RevenueRecognitionType "Immediate|Deferred"
        decimal StandaloneSellingPrice "CK >= 0"
    }
    ProductEntitlement {
        UUID ID PK
        UUID ProductID FK "UQ (ProductID, Code)"
        string EntitlementType "Feature|AccessLevel|ResourceQuantity|Custom"
        string Code
        string Name "nullable"
        decimal Quantity "nullable"
        string UnitOfMeasure "nullable"
        bool IsActive "default 1"
    }
    PriceList {
        UUID ID PK
        string Code UK
        string Name
        string Segment "nullable"
        date EffectiveFrom "nullable; CK To>=From"
        date EffectiveTo "nullable"
        bool IsActive "default 1"
    }
    ProductPrice {
        UUID ID PK
        UUID ProductID FK "seek index (ProductID, EffectiveFrom DESC)"
        UUID PriceListID FK "nullable"
        string PricingModel "Flat|PerUnit|Tiered|Volume|Package|Usage; default Flat"
        string FeeType "Standard|Setup|Recurring|Overage; default Standard"
        decimal Amount
        string UnitOfMeasure "nullable"
        decimal MinQuantity "nullable; CK Max>=Min"
        decimal MaxQuantity "nullable"
        date EffectiveFrom
        date EffectiveTo "nullable; CK >= From"
    }
    PriceTier {
        UUID ID PK
        UUID ProductPriceID FK
        decimal MinQuantity "CK Max>=Min"
        decimal MaxQuantity "nullable"
        decimal Amount
        int SortOrder "default 0"
    }
    ProductTaxCategory {
        UUID ID PK "NEW %% Q21 Option B; gated on launch-tax call"
        string Code "%% verify — columns not yet specified beyond entity names"
        string Name
        string Description "nullable"
        bool IsActive
    }
```

---

## 3. Orders piece (11 tables)

`Order` stays the A/R primitive (order = invoice; totals engine-materialized; JE booked exactly once
on first Confirm; the three financial-invariant triggers stand — `trg_Order_JournalEntryIDImmutable`,
`trg_OrderLine_ImmutableAfterConfirm`, `trg_Payment_ImmutableAfterCapture`). MOD-3 rev-2 adds
`Order.CompanyID` (owning company — document/visibility anchor, NOT a GL-resolution driver); rev-3
adds `OrderLine.CompanyID` (denormalized copy of `Product.CompanyID` stamped at line save —
performance/reporting; JE per-company splitting reads it hot). UPD-7 replaces the single
`Order.JournalEntryID` with the `OrderJournalEntry` junction (one JE per company, MOD-11). UPD-8
lands the discount-recording columns now regardless of the coupon provider model.

```mermaid
erDiagram
    Order ||--o{ OrderLine : "lines (UQ Order+LineNumber)"
    PaymentTermsType |o--o{ Order : "terms"
    Order |o--o{ Order : "ReversesOrderID"
    Product ||--o{ OrderLine : "product"
    Product |o--o{ OrderLine : "SourceBundleProductID"
    OrderLine |o--o{ OrderLine : "ReversesOrderLineID"
    OrderLine ||--|| EventOrderLine : "IsA (shared PK)"
    OrderLine ||--o{ OrderLineDimension : "dimension tags"
    OrderLine ||--o{ OrderLineTaxLine : "tax snapshot (gated)"
    Order ||--o{ OrderJournalEntry : "all JEs (UPD-7)"
    Company__mj ||--o{ Order : "owning company"
    Company__mj ||--o{ OrderLine : "line company"
    User__mj |o--o{ SalesAuthority : "per-rep caps"
    Role__mj |o--o{ SalesRule : "approval role"

    Order {
        UUID ID PK
        string OrderNumber UK "ORD-{seq} via OrderSequence"
        string OrderType "Sale|Return|Cancellation|Amendment|CreditMemoOrder; default Sale"
        date OrderDate
        string Status "Draft|Quoted|Confirmed|Posted|Fulfilled|Voided; default Draft"
        UUID CompanyID FK "NEW %% MOD-3 rev-2 — NOT NULL -> __mj.Company; OWNING company (customer relationship + document, defaulted from sales channel); doc/visibility anchor, does NOT drive GL resolution"
        UUID CustomerOrganizationID "nullable; SOFT ref common Organization"
        UUID CustomerPersonID "nullable; SOFT ref common Person"
        UUID SalesRepUserID FK "nullable -> __mj.User"
        UUID BillToAddressID "nullable; SOFT ref common Address"
        UUID ShipToAddressID "nullable; SOFT ref common Address"
        UUID PaymentTermsTypeID FK "nullable"
        decimal TotalGross "nullable; engine-materialized"
        decimal AmountPaid "default 0; engine-materialized"
        decimal Balance "nullable; engine-materialized"
        decimal DiscountTotal "NEW %% UPD-8 / S7 — engine-materialized = sum of redemption DiscountAmount; default 0; awaiting freeze"
        string CouponProviderRecording "NEW %% UPD-8b placeholder — code used, provider, provider coupon/promo-code IDs, total discount; verify exact columns at freeze"
        date DueDate "nullable"
        string PaymentStatus "Unpaid|PartiallyPaid|Paid|Overdue|WrittenOff; default Unpaid"
        string ExternalDocumentNumber "nullable"
        datetime PostedAt "nullable"
        UUID PostedByUserID FK "nullable -> __mj.User"
        UUID ReversesOrderID FK "nullable; self-FK"
        string ReversalReason "nullable"
        UUID ContractID "nullable; SOFT ref (future contracts)"
        date RequestedDeliveryDate "nullable"
        UUID ApprovalTaskID "nullable; SOFT ref tasks app"
        string Description "nullable"
        string Notes "nullable"
        UUID JournalEntryID "DEPRECATED %% UPD-7 — single-company legacy soft ref; removal later"
        datetime ConfirmedAt "nullable; booking idempotency guard (with junction rows, UPD-7)"
    }
    OrderLine {
        UUID ID PK
        UUID OrderID FK "UQ (OrderID, LineNumber)"
        UUID ProductID FK
        UUID CompanyID FK "NEW %% MOD-3 rev-3 — denormalized copy of Product.CompanyID stamped at line save; perf/reporting (JE per-company split), not RLS"
        int LineNumber
        decimal Quantity "CK <> 0; negative = reversal"
        decimal UnitPrice "CK >= 0"
        decimal DiscountPct "default 0; CK 0..1"
        decimal DiscountAmount "NEW %% UPD-8b — line-level recording (providers prorate order-level coupons; DiscountPct alone cannot capture fixed/order-level discounts); awaiting freeze"
        decimal LineTotalNet "nullable; engine-computed, stored"
        decimal LineTax "default 0"
        decimal LineTotalGross "nullable; engine-computed, stored"
        date ServicePeriodStart "nullable; CK End>=Start"
        date ServicePeriodEnd "nullable"
        string FulfillmentStatus "nullable; Pending|Fulfilled|Returned"
        UUID ReversesOrderLineID FK "nullable; self-FK"
        UUID SourceBundleProductID FK "nullable -> Product"
        UUID SubscriptionID FK "nullable -> Subscription"
        UUID RevenueRecognitionScheduleID FK "nullable -> RevenueRecognitionSchedule"
        string Description "nullable"
    }
    OrderJournalEntry {
        UUID ID PK "NEW %% UPD-7 junction (one JE per company, MOD-11)"
        UUID OrderID FK "-> Order (real FK)"
        UUID JournalEntryID "SOFT ref Accounting.JournalEntry; UNIQUE (OrderID, JournalEntryID)"
    }
    EventOrderLine {
        UUID ID PK "FK = OrderLine.ID (IsA shared PK)"
        string AttendeeName "nullable"
        string AttendeeEmail "nullable"
        datetime CheckInAt "nullable"
    }
    OrderLineDimension {
        UUID ID PK
        UUID OrderLineID FK "UQ (OrderLineID, DimensionID)"
        UUID DimensionID "SOFT ref Accounting.Dimension"
        UUID DimensionValueID "SOFT ref Accounting.DimensionValue"
    }
    OrderLineTaxLine {
        UUID ID PK "NEW %% Q21 Option B; gated on launch-tax call"
        UUID OrderLineID FK
        string Jurisdiction "%% verify — snapshot shape not yet column-specified"
        decimal Rate
        decimal Amount
        string ProviderReference "nullable — what the tax engine returned"
    }
    PaymentTermsType {
        UUID ID PK
        string Code UK
        string Name
        int NetDays "default 0; CK >= 0"
        string Description "nullable"
        bool IsActive "default 1"
    }
    OrderSequence {
        int ID PK "CK singleton (ID = 1)"
        int NextSequenceNumber "default 1; CK > 0"
    }
    SalesRule {
        UUID ID PK
        string Name
        string RuleType "DiscountLimit|PaymentTermsRequired|ProductAuthorization|CreditLimit|Custom"
        string Scope "Global|PerProduct|PerCustomer|PerSalesRep; default Global"
        UUID ScopeReferenceID "nullable; polymorphic scope target"
        string PredicateJson "nullable"
        UUID ApprovalRequiredRoleID FK "nullable -> __mj.Role"
        bool IsActive "default 1"
    }
    SalesAuthority {
        UUID ID PK
        UUID SalesRepUserID FK "-> __mj.User"
        decimal MaxDiscountPct "nullable; CK 0..1"
        decimal MaxOrderValue "nullable; CK >= 0"
        string AllowedPaymentTermsTypeIDs "nullable; JSON array"
        string AllowedProductCategoryIDs "nullable; JSON array"
        bool IsActive "default 1"
    }
```

%% verify — UPD-7 says "real FK constraints", but a hard FK to
`__mj_BizAppsAccounting.JournalEntry` would violate the baseline's soft-cross-app-ref rule; drawn as
OrderID = real FK, JournalEntryID = soft + unique pair. Confirm at implementation.

%% verify — the order-level provider-recording columns (`CouponProviderRecording` is a placeholder)
are required by UPD-8(b) (code used / provider / provider coupon + promotion-code IDs / total
discount) but not yet column-specified; `Order.DiscountTotal` is the only order-level column the S7
draft defines.

---

## 4. Payments piece (8 tables — unchanged from as-built)

No plan-chain deltas land here. Gross `Amount` / `NetAmount` split (BO-D47), negative amounts on
reversal methods, `PaymentLine` cash application, webhook idempotency via filtered-unique
`ProviderEventID`, no currency columns (MOD-4). Payment-side ownership under MOD-14 is unchanged:
Payments clears the owner's AR to cash and clears the Due-To/Due-From pair on the cash transfer.

```mermaid
erDiagram
    PaymentProvider ||--o{ CustomerPaymentMethod : "vaults"
    PaymentProvider ||--o{ PaymentIntent : "intents"
    PaymentIntent }o--o| Order : "collects for"
    PaymentProvider |o--o{ Payment : "processes"
    PaymentIntent |o--o{ Payment : "captured as"
    CustomerPaymentMethod |o--o{ Payment : "method"
    Payment |o--o{ Payment : "ReversesPaymentID"
    Payment ||--o{ PaymentLine : "allocations"
    Order ||--o{ PaymentLine : "settles"
    OrderLine |o--o{ PaymentLine : "line-level"
    StoredValueAccount |o--o{ Payment : "gift-card tender"
    StoredValueAccount ||--o{ StoredValueTransaction : "ledger"
    Company__mj ||--o{ PaymentProvider : "owns"
    Company__mj ||--o{ Payment : "receives"
    Company__mj ||--o{ StoredValueAccount : "issues"

    PaymentProvider {
        UUID ID PK
        string ProviderType "Stripe|Manual (widens per BO-D29)"
        UUID CompanyID FK "-> __mj.Company"
        string Name
        string CredentialsRef "nullable; MJ Credentials key, never a secret"
        bool IsLiveMode "default 0"
        bool IsActive "default 1"
    }
    CustomerPaymentMethod {
        UUID ID PK
        UUID CustomerOrganizationID "SOFT ref common Organization"
        UUID PaymentProviderID FK
        string ProviderCustomerID "nullable"
        string ProviderPaymentMethodID "nullable"
        string MethodType "nullable"
        string Brand "nullable"
        string Last4 "nullable; CHAR(4)"
        int ExpiryMonth "nullable; CK 1..12"
        int ExpiryYear "nullable"
        bool IsDefault "default 0"
        bool IsActive "default 1"
    }
    PaymentIntent {
        UUID ID PK
        UUID PaymentProviderID FK
        string ProviderIntentID UK
        string Status "RequiresPayment|Processing|Succeeded|Canceled|Failed"
        decimal Amount
        UUID OrderID FK "nullable"
        UUID CustomerOrganizationID "nullable; SOFT ref"
        string ProviderEventID UK "nullable; filtered unique — webhook idempotency"
        datetime LastEventAt "nullable"
    }
    Payment {
        UUID ID PK
        string PaymentNumber UK "PAY-{seq} via PaymentSequence"
        UUID ReceivingCompanyID FK "-> __mj.Company (role-qualified name stays, MOD-3c)"
        UUID CustomerOrganizationID "nullable; SOFT ref"
        date PaymentDate
        string Method "CreditCard|ACH|Wire|Check|Cash|InternalTransfer|GiftCard|Refund|Chargeback|BankReturn"
        decimal Amount "gross; negative on reversal methods"
        decimal ProcessingFeeAmount "default 0"
        decimal NetAmount "nullable; = Amount - fee"
        UUID PaymentProviderID FK "nullable"
        UUID PaymentIntentID FK "nullable"
        UUID PaymentMethodID FK "nullable -> CustomerPaymentMethod"
        string ProviderChargeID "nullable"
        string ProviderRefundID "nullable"
        UUID ReversesPaymentID FK "nullable; self-FK"
        string ReversalReason "nullable"
        string Status "Pending|Captured|Failed|Refunded|Disputed; default Pending"
        UUID JournalEntryID "nullable; SOFT ref Accounting.JournalEntry"
        UUID StoredValueAccountID FK "nullable"
        string Description "nullable"
        string Notes "nullable"
    }
    PaymentLine {
        UUID ID PK
        UUID PaymentID FK
        UUID OrderID FK
        UUID OrderLineID FK "nullable"
        decimal Amount "CK <> 0; negative applies credit memo"
        datetime AllocatedAt
        UUID AllocatedByUserID FK "nullable -> __mj.User; NULL = auto"
    }
    PaymentSequence {
        int ID PK "CK singleton (ID = 1)"
        int NextSequenceNumber "default 1; CK > 0"
    }
    StoredValueAccount {
        UUID ID PK
        string Code UK
        UUID IssuingCompanyID FK "-> __mj.Company"
        decimal InitialAmount "CK > 0"
        decimal CurrentBalance
        string Status "Active|Depleted|Expired|Suspended|Voided; default Active"
        UUID IssuedFromOrderLineID FK "nullable -> OrderLine"
        UUID BeneficiaryPersonID "nullable; SOFT ref common Person"
        UUID BeneficiaryOrganizationID "nullable; SOFT ref common Organization"
        date ExpiresAt "nullable"
    }
    StoredValueTransaction {
        UUID ID PK
        UUID StoredValueAccountID FK
        string TransactionType "Issue|Redeem|Refund|Adjust|Expire"
        decimal Amount "signed; CK <> 0"
        decimal BalanceAfter "running balance"
        UUID RelatedPaymentID FK "nullable"
        UUID RelatedOrderID FK "nullable"
        datetime OccurredAt
    }
```

---

## 5. Subscriptions & revenue recognition piece (5 tables)

MOD-3(c) adds `Subscription.CompanyID`; UPD-9 adds `SubscriptionPlan.RenewalSpawnStatus` (renewals
spawn as Draft at launch — a human confirms; Confirm books the JE). **MOD-12 rewrites the rev-rec
mechanism:** at booking-lock, Orders writes the recognition waterfall as **real forward-dated JEs**
into accounting (12-month sub → 12 real JEs, own `EffectiveDate` each) via the singular transactional
call (MOD-5) — no materializer, no daily job; change/cancel = a correcting Order whose entries NET
against the staged ones. The schedule tables **stay as the compute envelope** (waterfall math +
MRR/ARR display); the `ScheduledJournalEntryID` bridge column is **retired**.

```mermaid
erDiagram
    Product ||--o{ SubscriptionPlan : "optional elaboration"
    OrderLine ||--o{ Subscription : "born from"
    SubscriptionPlan |o--o{ Subscription : "plan"
    Product ||--o{ Subscription : "product"
    Company__mj ||--o{ Subscription : "company (MOD-3c)"
    PaymentProvider |o--o{ Subscription : "billed via"
    Subscription |o--o{ Subscription : "migrates from/to"
    Subscription ||--o{ SubscriptionEvent : "immutable log"
    Payment |o--o{ SubscriptionEvent : "related"
    Order |o--o{ SubscriptionEvent : "related"
    RevenueRecognitionSchedule ||--o{ RevRecScheduleLine : "period lines"
    RevenueRecognitionSchedule |o--o{ OrderLine : "schedule of"
    Subscription |o--o{ OrderLine : "recurring line"

    SubscriptionPlan {
        UUID ID PK
        UUID ProductID FK
        string Name
        string BillingCycle "Monthly|Quarterly|Annual|Custom"
        int CustomCycleDays "nullable; CK > 0"
        decimal PricePerCycle "nullable"
        int TrialDays "default 0; CK >= 0"
        string RenewalSpawnStatus "NEW %% UPD-9 — Draft|Quoted|Confirmed; default Draft at launch"
        bool IsActive "default 1"
    }
    Subscription {
        UUID ID PK
        string SubscriptionNumber UK
        UUID OrderLineID FK
        UUID SubscriptionPlanID FK "nullable"
        UUID ProductID FK
        UUID CompanyID FK "NEW %% MOD-3c -> __mj.Company; verify — worded as OwningCompanyID rename, but baseline has no such column (effectively an ADD)"
        UUID CustomerOrganizationID "nullable; SOFT ref common Organization"
        UUID BeneficiaryPersonID "nullable; SOFT ref common Person"
        string Status "Active|Paused|Canceled|Migrated|Trialing"
        date StartDate
        date CurrentPeriodStart "CK End>=Start"
        date CurrentPeriodEnd
        date TrialEndDate "nullable"
        datetime CanceledAt "nullable"
        date EndDate "nullable"
        bool AutoRenew "default 1"
        int RenewalLeadDays "default 90; CK >= 0"
        UUID PaymentProviderID FK "nullable"
        string ProviderSubscriptionID "nullable"
        UUID MigratesFromSubscriptionID FK "nullable; self-FK; CK no self"
        UUID MigratesToSubscriptionID FK "nullable; self-FK; CK no self"
    }
    SubscriptionEvent {
        UUID ID PK
        UUID SubscriptionID FK
        string EventType "Created|Activated|TrialStarted|TrialEnded|PaymentSucceeded|PaymentFailed|Paused|Resumed|CancellationRequested|Canceled|Migrated|RenewalOrderSpawned"
        datetime OccurredAt
        string EventData "nullable; JSON"
        string ProviderEventID UK "nullable; filtered unique — webhook idempotency"
        UUID RelatedPaymentID FK "nullable"
        UUID RelatedOrderID FK "nullable"
    }
    RevenueRecognitionSchedule {
        UUID ID PK "stays — compute envelope (MOD-12)"
        string SchedulingMethod "StraightLine|SingleDate|Milestone|Custom"
        date StartDate "CK End>=Start"
        date EndDate
        decimal TotalAmount
        decimal TotalRecognized "default 0"
        bool IsComplete "default 0"
    }
    RevRecScheduleLine {
        UUID ID PK
        UUID ScheduleID FK
        date PeriodStart "CK End>=Start"
        date PeriodEnd
        decimal Amount "line 1 carries rounding remainder"
        UUID ScheduledJournalEntryID "RETIRED %% MOD-12 — ScheduledJournalEntry bridge removed; recognition = real forward-dated JEs"
        UUID RecognizedJournalEntryID "nullable; SOFT ref Accounting.JournalEntry (stays)"
        datetime RecognizedAt "nullable"
        bool IsRecognized "default 0"
    }
```

%% verify — UPD-9 says the setting lives "on SubscriptionType/SubscriptionPlan"; no SubscriptionType
table exists (subscription typing rides `Product.SubscriptionType`), so it is drawn on
SubscriptionPlan per this document's scope instruction.

---

## 6. Entitlements piece (1 table — unchanged from as-built)

`ProductEntitlement` (§2) is the definition; `EntitlementGrant` is the instance created at Post /
subscription activation, carrying the beneficiary (defaults to the buyer; a line may designate an
attendee / gift recipient / honoree — BO-D39).

```mermaid
erDiagram
    ProductEntitlement ||--o{ EntitlementGrant : "instantiated as"
    OrderLine |o--o{ EntitlementGrant : "from line"
    Subscription |o--o{ EntitlementGrant : "from subscription"
    Person_Common |o..o{ EntitlementGrant : "beneficiary (soft)"
    Organization_Common |o..o{ EntitlementGrant : "beneficiary org (soft)"

    EntitlementGrant {
        UUID ID PK
        UUID ProductEntitlementID FK
        UUID OrderLineID FK "nullable"
        UUID SubscriptionID FK "nullable"
        UUID BeneficiaryPersonID "nullable; SOFT ref common Person"
        UUID BeneficiaryOrganizationID "nullable; SOFT ref common Organization"
        decimal Quantity "nullable"
        date ValidFrom "nullable; CK To>=From"
        date ValidTo "nullable"
        string Status "Active|Suspended|Revoked|Expired; default Active"
        datetime ProvisionedAt "nullable"
    }
```

---

## 7. Intercompany piece (1 table, NEW — MOD-14; master §4.7/§5, BO-D6)

Pulled **forward from deferred to the launch model** by MOD-14. When a line's company differs from
the order's owning company, booking emits mirrored legs (owner: Dr AR full amount / Cr own revenue /
Cr Due-To per sibling; sibling: Dr Due-From / Cr own revenue-or-DefRev against ITS OWN accounts) and
an `IntercompanyFlow` record per non-owning line — feeding consolidation analytics + recon. Shape
below = master plan §4.7.

```mermaid
erDiagram
    Order |o--o{ IntercompanyFlow : "originating order"
    Subscription |o--o{ IntercompanyFlow : "recurring (per period)"
    Company__mj ||--o{ IntercompanyFlow : "FromCompanyID"
    Company__mj |o--o{ IntercompanyFlow : "ToCompanyID"
    IntercompanyFlow }o..o| JournalEntry_Acct : "From/To JE legs (soft)"

    IntercompanyFlow {
        UUID ID PK "NEW %% MOD-14 pulls forward; shape finalizes in S3 (roadmap V1.7)"
        UUID OrderID FK "nullable — if originated from an order"
        UUID SubscriptionID FK "nullable — if recurring, per period"
        UUID FromCompanyID FK "NOT NULL -> __mj.Company; sub originating the flow"
        UUID ToCompanyID FK "nullable -> __mj.Company; destination if internal"
        UUID ToExternalPartyID "nullable — waterfall external parties (Contracts case)"
        string FlowType "IntercompanyAR|Distribution|MgmtFee|RevShare"
        decimal Amount
        string CurrencyCode "%% verify — master §4.7 has it NOT NULL, but MOD-4 deferred all currency columns"
        date PeriodStart "nullable"
        UUID FromJournalEntryID "SOFT ref Due-From JE (From company)"
        UUID ToJournalEntryID "SOFT ref Due-To JE (To company); NULL for external"
        string Description "nullable"
    }
```

Accounting-side companions (not Orders schema, noted for the seam): **two NEW GLAccountRoles** —
**Intercompany AR (Due-From)** on each sister and **Intercompany AP (Due-To)** on the owner, per
counterparty (affiliate CONTROL accounts, separate from trade AR/AP; + Sales Tax Payable if tax
launches). The **per-affiliate resolution key (entity × counterparty)** is richer than
ResolveAccount's (product × role × company) — **routing-shape decision pending; decide BEFORE
building legs**.

---

## 8. Coupons piece (2 tables, NEW — UPD-8 / S7 draft) — %% awaiting freeze

Launch path is **Option A** (provider-owned coupons, Stripe first; Orders records the outcome); the
Orders-native `Coupon` entity is the fast-follow provider. The **recording columns land now either
way** (§3: `Order.DiscountTotal` + provider-recording fields, `OrderLine.DiscountAmount`). Freeze is
blocked on the two UPD-8(c) investigations (Stripe coupon-vs-promotion-code mapping; a second
provider) + Robert's OS7 review + Sidecar answers. Shapes = the S7 draft in
`ActionPlan - Coupons (schema to UI).md`. Redemption rows are immutable once their order is
Confirmed (joins the `trg_OrderLine_ImmutableAfterConfirm` family).

```mermaid
erDiagram
    Coupon ||--o{ CouponRedemption : "redeemed as"
    Order ||--o{ CouponRedemption : "discounts (UQ per order in v1)"
    Product |o--o{ Coupon : "scopes (optional)"

    Coupon {
        UUID ID PK "NEW %% UPD-8 / S7 draft; awaiting freeze"
        string Code UK "normalized UPPER, no spaces"
        string Name
        string DiscountType "PercentOff|AmountOff; CK shape coherence"
        decimal PercentOff "0..1; NULL unless PercentOff"
        decimal AmountOff "> 0; NULL unless AmountOff"
        string AppliesTo "Order|Product"
        UUID ProductID FK "required iff AppliesTo=Product"
        date ValidFrom "NULL = immediately"
        date ValidTo "NULL = forever; CK To>=From"
        int MaxRedemptions "NULL = unlimited"
        int MaxRedemptionsPerCustomer "NULL = unlimited"
        int RedemptionCount "engine-maintained counter"
        bool IsActive
        string Description
    }
    CouponRedemption {
        UUID ID PK "NEW %% UPD-8 / S7 draft; awaiting freeze"
        UUID CouponID FK
        UUID OrderID FK "UNIQUE in v1 (one coupon per order); immutable once order Confirmed"
        UUID CustomerOrganizationID "SOFT ref (per-customer limits)"
        decimal DiscountAmount "SNAPSHOT of computed discount"
        string DiscountTypeApplied "snapshot: PercentOff|AmountOff"
        decimal PercentApplied "snapshot when percent"
        datetime RedeemedAt "UTC"
    }
```

---

## 9. Tax piece (Q21 answer, Option B) — %% gated on launch-tax call

The two tax tables carry full attributes where they live: **`ProductTaxCategory` in §2 (Catalog)**
and **`OrderLineTaxLine` in §3 (Orders)**, plus `Product.ProductTaxCategoryID` (§2). Ruled durable
shape (skip Option A entirely): per-jurisdiction snapshot rows + the accounting-side
`TaxCalculationProvider` seam (accounting MOD-18). Orders does **NOT** calculate tax — a third-party
engine (Stripe Tax / Avalara class) does; these tables record what it returned. Whether any tax is
launch-required is explicitly a Jeremy/John finance decision; builds at roadmap V2.7.

%% verify — Q21's answer fixes the entity names + per-jurisdiction-snapshot intent only; the column
lists in §2/§3 are the minimal implied shape, to be specified when the slice schedules.

---

## 10. Configuration (no table drawn) — `DunningGracePeriodDays` (UPD-6.3)

An **Orders configuration setting** (default **7** days): how long after a failed renewal payment
access-relevant state holds before cut-off; dunning notifies CS rather than auto-cancelling. Ruled
config-not-hardcoded; explicitly NOT on `AccountingCompanyProfile` (wrong side). **Entity TBD** — a
single setting suffices for launch, per-owning-company when multi-company needs it; consumed by F3.6.
No table is drawn until the configuration entity is decided.

---

## Non-schema notes carried by the same plan chain

- **MOD-14 booking shape** (engine, not schema): seller-of-record AR — the owner's JE carries the
  FULL order AR + Due-To legs per sibling; each sibling's JE carries Due-From + its own
  revenue/DefRev, resolved against ITS OWN accounts. Revenue is never recognized in the owner for a
  sibling's product. Anchor split: revenue-side resolution → product's company; AR/cash/due-to-from →
  order-owning company. Tax remit: selling company.
- **UPD-6.2 `IsOverdue`** is an explicit computed/virtual surface (`Balance > 0 AND DueDate < now`) —
  never a stored column, so it does not appear in the ERD.
- **UPD-13** (Matt UI-review rulings) — UI-only; no schema impact. The Q24 identical-name
  display-collapse for company-owned ProductCategory rows is likewise a UI concern (no registry
  table).
