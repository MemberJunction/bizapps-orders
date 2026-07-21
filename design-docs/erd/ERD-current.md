# BizApps Orders — ERD (CURRENT, as-built)

- **Date:** 2026-07-20
- **Source of truth:** `migrations/B202607061431__v0.1.x__Schema_and_Tables.sql` (the collapse-into-baseline
  file, edited in place pre-release through waves S1–S6; **no later `V*.sql` migrations exist** — the
  `migrations/codegen/CodeGen_Run_*.sql` files are CodeGen output, not schema deltas).
- **Schema:** `__mj_BizAppsOrders` — 32 tables.
- Every table additionally carries CodeGen's `__mj_CreatedAt` / `__mj_UpdatedAt` timestamp columns —
  **omitted from all diagrams** (CodeGen-owned, uniform).
- Types are simplified: `UUID`, `string`, `decimal`, `datetime` (DATETIMEOFFSET), `date`, `bool`, `int`.
- **Dashed lines = soft references** (plain UNIQUEIDENTIFIER, no FK constraint — cross-app / cross-schema
  seams). Solid lines = real FKs.

---

## 1. Overview — all entities and relationships

Interface pseudo-entities (not owned by this schema) are included: `__mj.Company`, `__mj.User`,
`__mj.Role`, `BizAppsCommon.Organization` / `Person` / `Address`, and accounting-side
`Accounting.JournalEntry` + `Accounting.GLAccountLink` (the polymorphic account-resolution seam that
points **AT** Product / ProductCategory / Company rows — Orders carries **no GL columns**).

```mermaid
erDiagram
    %% ── Catalog ──
    ProductType ||--o{ Product : "classifies"
    ProductCategory |o--o{ Product : "groups"
    ProductCategory |o--o{ ProductCategory : "parent of"
    Product |o--o{ Product : "succeeded by"
    Product ||--o{ ProductBundleItem : "bundle"
    Product ||--o{ ProductBundleItem : "component"
    Product ||--o{ ProductPerformanceObligation : "obligations"
    Product ||--o{ ProductEntitlement : "grants defined"
    Product ||--|| EventProduct : "IsA extension"
    PriceList |o--o{ ProductPrice : "scopes"
    Product ||--o{ ProductPrice : "priced by"
    ProductPrice ||--o{ PriceTier : "tiers"

    %% ── Orders ──
    Order ||--o{ OrderLine : "lines"
    Product ||--o{ OrderLine : "sells"
    Product |o--o{ OrderLine : "source bundle"
    PaymentTermsType |o--o{ Order : "terms"
    Order |o--o{ Order : "reverses"
    OrderLine |o--o{ OrderLine : "reverses"
    OrderLine ||--|| EventOrderLine : "IsA extension"
    OrderLine ||--o{ OrderLineDimension : "tagged"
    SalesAuthority }o--|| User__mj : "rep limits"
    SalesRule }o--o| Role__mj : "approval role"

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

    %% ── Subscriptions & rev-rec ──
    Product ||--o{ SubscriptionPlan : "plans"
    OrderLine ||--o{ Subscription : "born from"
    SubscriptionPlan |o--o{ Subscription : "elaborates"
    Product ||--o{ Subscription : "of product"
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
    Company__mj ||--o{ PaymentProvider : "owns"
    Company__mj ||--o{ Payment : "receiving company"
    Company__mj ||--o{ StoredValueAccount : "issuing company"
    Company__mj |o--o{ Product : "owning company (nullable)"

    %% ── Cross-app SOFT references (no FK) ──
    Organization_Common |o..o{ Order : "CustomerOrganizationID (soft)"
    Person_Common |o..o{ Order : "CustomerPersonID (soft)"
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

    %% ── Accounting-side seams (soft) ──
    JournalEntry_Acct |o..o{ Order : "JournalEntryID (soft lineage)"
    JournalEntry_Acct |o..o{ Payment : "JournalEntryID (soft)"
    JournalEntry_Acct |o..o{ RevRecScheduleLine : "scheduled / recognized JE (soft)"
    Dimension_Acct |o..o{ OrderLineDimension : "DimensionID + ValueID (soft)"
    GLAccountLink_Acct }o..o| Product : "accounting-owned link points AT"
    GLAccountLink_Acct }o..o| ProductCategory : "accounting-owned link points AT"
    GLAccountLink_Acct }o..o| Company__mj : "accounting-owned link points AT"
```

> Naming in diagrams: `User__mj` = `__mj.User`, `Company__mj` = `__mj.Company`, `Role__mj` = `__mj.Role`,
> `*_Common` = `__mj_BizAppsCommon.*`, `*_Acct` = `__mj_BizAppsAccounting.*`. Mermaid entity names can't
> carry dots/brackets, so aliases are used; `Order` is the bracketed `[Order]` table.

---

## 2. Catalog piece

ProductType is the behavior lookup (extension-entity + behavior-class seams); ProductCategory is the
hierarchy the account resolver walks upward; Product carries **RevenueRecognitionType but NO GL columns**
(S3 — accounting's polymorphic `GLAccountLink` points at Product/ProductCategory/Company rows) and **no
currency** (MOD-4). `EventProduct` is an IsA-Disjoint child: its PK **is** the parent Product's UUID —
it is the only seeded type-extension pair as-built (others land as their features do). Pricing tables
(S5) exist as structure; the resolution engine is feature F9 (UnitPrice direct entry is the precedence
base).

```mermaid
erDiagram
    ProductType ||--o{ Product : "classifies"
    ProductCategory |o--o{ Product : "groups"
    ProductCategory |o--o{ ProductCategory : "parent"
    Product ||--|| EventProduct : "IsA (shared PK)"
    Product ||--o{ ProductBundleItem : "bundle"
    Product ||--o{ ProductBundleItem : "component"
    Product ||--o{ ProductPerformanceObligation : "PPO"
    Product ||--o{ ProductEntitlement : "entitlement defs"
    Product ||--o{ ProductPrice : "prices"
    PriceList |o--o{ ProductPrice : "scopes"
    ProductPrice ||--o{ PriceTier : "tiers"

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
        string Description "nullable"
        bool IsActive "default 1"
    }
    Product {
        UUID ID PK
        string Name
        string SKU UK "nullable; filtered unique"
        UUID ProductTypeID FK
        UUID ProductCategoryID FK "nullable"
        UUID OwningCompanyID FK "nullable -> __mj.Company"
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
```

---

## 3. Orders piece

`Order` is the header **and the A/R primitive** (order = invoice, CA-2): totals / paid / balance / due /
PaymentStatus are engine-materialized, never user-entered. The JE is booked **exactly once, on the first
flip to `Confirmed`** (`trg_Order_JournalEntryIDImmutable` makes the booked `JournalEntryID` permanent;
corrections are reversal orders, never re-pointing). **No CompanyID as-built** (S5 — company via each
line's resolved account) and **no currency** (MOD-4). `trg_OrderLine_ImmutableAfterConfirm` freezes
financial line fields after Confirm; negative `Quantity` is the reversal mechanism (BO-D10 —
cross-field rule lives in the entity server, not a CHECK). `EventOrderLine` is the IsA child of
OrderLine (shared PK).

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
    User__mj |o--o{ SalesAuthority : "per-rep caps"
    Role__mj |o--o{ SalesRule : "approval role"

    Order {
        UUID ID PK
        string OrderNumber UK "ORD-{seq} via OrderSequence"
        string OrderType "Sale|Return|Cancellation|Amendment|CreditMemoOrder; default Sale"
        date OrderDate
        string Status "Draft|Quoted|Confirmed|Posted|Fulfilled|Voided; default Draft"
        UUID CustomerOrganizationID "nullable; SOFT ref common Organization"
        UUID CustomerPersonID "nullable; SOFT ref common Person"
        UUID SalesRepUserID FK "nullable -> __mj.User"
        UUID BillToAddressID "nullable; SOFT ref common Address"
        UUID ShipToAddressID "nullable; SOFT ref common Address"
        UUID PaymentTermsTypeID FK "nullable"
        decimal TotalGross "nullable; engine-materialized"
        decimal AmountPaid "default 0; engine-materialized"
        decimal Balance "nullable; engine-materialized"
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
        UUID JournalEntryID "nullable; SOFT ref Accounting.JournalEntry; immutable once set"
        datetime ConfirmedAt "nullable; booking idempotency guard"
    }
    OrderLine {
        UUID ID PK
        UUID OrderID FK "UQ (OrderID, LineNumber)"
        UUID ProductID FK
        int LineNumber
        decimal Quantity "CK <> 0; negative = reversal"
        decimal UnitPrice "CK >= 0"
        decimal DiscountPct "default 0; CK 0..1"
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

---

## 4. Payments piece

Receipts, reversals, and cash application (S2, master §4.5). `Payment.Amount` is gross customer-side
truth (`NetAmount = Amount − ProcessingFeeAmount`); negative amounts are reversal methods.
`PaymentLine` is the cash-application junction (which orders a payment settles). `PaymentIntent` is
Stripe-shaped provider collection state (the Manual provider skips it); `ProviderEventID` filtered
uniques carry webhook idempotency. `trg_Payment_ImmutableAfterCapture` freezes captured payments.
**No currency columns** (MOD-4). `CustomerPaymentMethod` stores provider tokens only — never PANs.

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
        UUID ReceivingCompanyID FK "-> __mj.Company"
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

## 5. Subscriptions & revenue recognition piece

A Subscription is born from an **order line** (BO-D39/D40); renewal cycles spawn new Orders under it,
and **each renewal order line carries its own rev-rec schedule** — deliberately no schedule FK on
Subscription (design deviation from master §4.4, flagged in the schema plan §3.2). No
`OwningCompanyID` as-built. Rev-rec schedules are a lightweight computation envelope + MRR/ARR display
(BO-D11); `RevRecScheduleLine` line 1 carries the rounding remainder and soft-refs accounting's
ScheduledJournalEntry / JournalEntry.

```mermaid
erDiagram
    Product ||--o{ SubscriptionPlan : "optional elaboration"
    OrderLine ||--o{ Subscription : "born from"
    SubscriptionPlan |o--o{ Subscription : "plan"
    Product ||--o{ Subscription : "product"
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
        bool IsActive "default 1"
    }
    Subscription {
        UUID ID PK
        string SubscriptionNumber UK
        UUID OrderLineID FK
        UUID SubscriptionPlanID FK "nullable"
        UUID ProductID FK
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
        UUID ID PK
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
        UUID ScheduledJournalEntryID "nullable; SOFT ref Accounting.ScheduledJournalEntry"
        UUID RecognizedJournalEntryID "nullable; SOFT ref Accounting.JournalEntry"
        datetime RecognizedAt "nullable"
        bool IsRecognized "default 0"
    }
```

---

## 6. Entitlements piece

`ProductEntitlement` (in the Catalog piece, §2) is the **definition**; `EntitlementGrant` is the
**instance** created at Post / subscription activation, carrying the beneficiary (defaults to the
buyer; a line may designate an attendee / gift recipient / honoree — BO-D39).

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

## 7. Interfaces with other apps

All cross-app references are **soft** (plain UNIQUEIDENTIFIER, no FK) so Orders never couples to
another app's schema; FKs to `__mj` core ARE real (precedent: common's `FK_Person_LinkedUser`).

- **Accounting (`__mj_BizAppsAccounting`)** — the defining integration. On the first flip to
  `Confirmed`, `OrderEntityServer` books a balanced JE via the **`Accounting.CreateJournalEntry`
  remote operation** (MOD-5) and stamps `Order.JournalEntryID` + `ConfirmedAt` (failure blocks the
  Confirm). Account resolution uses accounting's **polymorphic `GLAccountLink`** pointing AT
  Product / ProductCategory / Company rows (product link → up the category tree → company default) —
  the reason Orders carries no GL columns. Soft back-refs: `Order.JournalEntryID`,
  `Payment.JournalEntryID`, `RevRecScheduleLine.ScheduledJournalEntryID` / `RecognizedJournalEntryID`,
  `OrderLineDimension.DimensionID` / `DimensionValueID`.
- **BizApps Common (`__mj_BizAppsCommon`)** — customers and people: `CustomerOrganizationID`
  (Order, CustomerPaymentMethod, PaymentIntent, Payment, Subscription, EntitlementGrant beneficiary,
  StoredValueAccount beneficiary), `CustomerPersonID` / `BeneficiaryPersonID`, and Address soft refs
  (`Order.BillToAddressID` / `ShipToAddressID`, `EventProduct.VenueAddressID`).
- **MJ core (`__mj`)** — real FKs: `__mj.User` (Order.SalesRep/PostedBy, PaymentLine.AllocatedBy,
  SalesAuthority.SalesRepUser), `__mj.Company` (PaymentProvider, Payment.ReceivingCompany,
  StoredValueAccount.IssuingCompany, Product.OwningCompany), `__mj.Role`
  (SalesRule.ApprovalRequiredRole).
- **Tasks app** — `Order.ApprovalTaskID` (soft; sales-rule violations raise an approval task, F8).

```mermaid
erDiagram
    Order }o..|| JournalEntry_Acct : "booked on first Confirm (CreateJournalEntry remote op)"
    Payment }o..|| JournalEntry_Acct : "booked at capture"
    GLAccountLink_Acct }o..o| Product : "resolution: product link"
    GLAccountLink_Acct }o..o| ProductCategory : "... up category tree"
    GLAccountLink_Acct }o..o| Company__mj : "... company default"
    Order }o..o| Organization_Common : "customer"
    Order }o..o| Person_Common : "customer person"
    Order }o..o| Address_Common : "bill-to / ship-to"
    Order }o--o| User__mj : "sales rep (real FK)"
    PaymentProvider }o--|| Company__mj : "real FK"
```

### Financial-invariant triggers (DB-level, hold even against raw SQL)

1. `trg_Order_JournalEntryIDImmutable` — a booked `JournalEntryID` may never be cleared/replaced.
2. `trg_OrderLine_ImmutableAfterConfirm` — financial line fields freeze once the order is Confirmed.
3. `trg_Payment_ImmutableAfterCapture` — captured payments freeze.

Workflow rules (transition matrix, totals, cross-field validation) live in the entity server, not
triggers.
