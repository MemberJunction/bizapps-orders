-- =============================================================================
-- BizApps Orders — Baseline Schema (v0.1.0)
-- =============================================================================
-- Creates the entire __mj_BizAppsOrders schema: the product catalog + order
-- lifecycle. Per the 2026-07-02 engine-meeting amendment (§3), extended 2026-07-14
-- with the S1 "Order as the A/R primitive" wave (ActionPlan - Schema alignment §1;
-- collapse-into-baseline strategy — this file is edited in place pre-release):
--   * ProductType        — flat lookup + RequiresFulfillment (UPD-3 fulfillment hold)
--   * ProductCategory     — hierarchical (ParentID self-FK)
--   * Product             — RevenueRecognitionType kept; NO GL columns (S3 — accounting's
--                           polymorphic GLAccountLink points AT Product/ProductCategory rows)
--   * Order               — Status lifecycle + the A/R field set (order = invoice: totals /
--                           paid / balance / due, terms, customer wiring, reversal, posting);
--                           NO CompanyID (S5 — multi-company via the resolved
--                           GLAccount.CompanyID per JE line); NO currency (FX deferred, S10)
--   * OrderLine           — ProductID / Quantity / UnitPrice + line totals, service period,
--                           fulfillment status, reversal lineage
--   * PaymentTermsType    — payment-terms lookup (Net30 …; seed rows via metadata/)
--   * OrderSequence       — global singleton counter for gap-conscious ORD-{seq} numbers
--   * Payments subsystem (S2, §4.5): PaymentProvider / CustomerPaymentMethod /
--                           PaymentIntent / Payment / PaymentLine / PaymentSequence —
--                           receipts, reversals, cash application; NO currency columns (MOD-4)
--   * Subscriptions + rev-rec bridge (S3, §4.4/§4.6): SubscriptionPlan / Subscription /
--                           SubscriptionEvent / RevenueRecognitionSchedule / RevRecScheduleLine —
--                           schedules hang off ORDER LINES (renewals carry their own)
--   * Catalog depth (S5, §4.1): ProductType/Product behavior + lifecycle fields, bundles,
--                           entitlements + grants, PPO, EventProduct/EventOrderLine (IsA),
--                           StoredValue pair, OrderLineDimension, PriceList/ProductPrice/PriceTier;
--                           seeded product types via metadata/. NO GL columns (MOD-2), NO currency (MOD-4)
--   * Sales rules (S6, §4.8): SalesRule / SalesAuthority + Order.ApprovalTaskID —
--                           evaluation engine + tasks-app routing = feature F8
--
-- Cross-app references are SOFT (plain UNIQUEIDENTIFIER, no FK) so Orders never
-- couples to another app's schema:
--   * Order.CustomerOrganizationID  → __mj_BizAppsCommon.Organization (soft)
--   * OrderLine.JournalEntryID      → __mj_BizAppsAccounting.JournalEntry (soft per-line lineage; MOD-15)
--
-- CodeGen handles __mj_CreatedAt/__mj_UpdatedAt and FK indexes — do NOT add them here.
-- SQL Server is the source of truth; the PostgreSQL counterpart is produced via
-- @memberjunction/sql-converter (see migrations-pg/README.md).
-- References: repos/apps/bizapps-orders/plans/2026-07-02-engine-meeting-amendment.md §3,
--             erd-orders-target.md.
-- =============================================================================

-- =============================================================================
-- 1. SCHEMA
-- =============================================================================
IF NOT EXISTS (SELECT 1 FROM sys.schemas WHERE name = '__mj_BizAppsOrders')
    EXEC('CREATE SCHEMA __mj_BizAppsOrders');
GO

-- =============================================================================
-- 2. SCHEMA INFO — entity-name prefix for CodeGen (must match mj.config.cjs)
-- =============================================================================
INSERT INTO __mj.SchemaInfo
(
  ID,
  SchemaName,
  EntityIDMin, EntityIDMax,
  Comments,
  Description,
  EntityNamePrefix, EntityNameSuffix
)
VALUES
(
  'B6E2A4C1-7F03-4E52-9C8A-2D6F1B0E9A47',
  '__mj_BizAppsOrders',
  1, 1000000,
  NULL,
  'MemberJunction: BizApps Orders — product catalog + order lifecycle',
  'MJ_BizApps_Orders: ', NULL
);
GO

-- =============================================================================
-- 3. TABLES
-- =============================================================================

---------------------------------------------------------------------------
-- 3.1 ProductType — flat lookup classifying products (e.g. Physical Good, Service, Subscription).
---------------------------------------------------------------------------
CREATE TABLE __mj_BizAppsOrders.ProductType (
    ID UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    Code NVARCHAR(40) NULL,
    Name NVARCHAR(100) NOT NULL,
    Description NVARCHAR(MAX) NULL,
    RequiresFulfillment BIT NOT NULL DEFAULT 0,
    DefaultRevenueRecognitionType NVARCHAR(20) NULL,
    DefaultIsTaxable BIT NOT NULL DEFAULT 1,
    IsBillableRecurring BIT NOT NULL DEFAULT 0,
    DefaultSubscriptionType NVARCHAR(20) NOT NULL DEFAULT 'None',
    ProductExtensionEntity NVARCHAR(255) NULL,
    OrderLineExtensionEntity NVARCHAR(255) NULL,
    BehaviorClass NVARCHAR(100) NULL,
    IsActive BIT NOT NULL DEFAULT 1,
    CONSTRAINT PK_ProductType PRIMARY KEY (ID),
    CONSTRAINT UQ_ProductType_Name UNIQUE (Name),
    CONSTRAINT CK_ProductType_DefaultRevRecType CHECK (DefaultRevenueRecognitionType IN ('Immediate','Deferred')),
    CONSTRAINT CK_ProductType_DefaultSubscriptionType CHECK (DefaultSubscriptionType IN ('None','Standard','Membership'))
);
GO

CREATE UNIQUE NONCLUSTERED INDEX UQ_ProductType_Code
    ON __mj_BizAppsOrders.ProductType (Code)
    WHERE Code IS NOT NULL;
GO

---------------------------------------------------------------------------
-- 3.2 ProductCategory — hierarchical grouping. ParentID self-FK builds the tree the
--     account resolver walks upward (product → category → parent category → …).
---------------------------------------------------------------------------
CREATE TABLE __mj_BizAppsOrders.ProductCategory (
    ID UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    Code NVARCHAR(40) NULL,
    Name NVARCHAR(200) NOT NULL,
    ParentID UNIQUEIDENTIFIER NULL,
    Description NVARCHAR(MAX) NULL,
    IsActive BIT NOT NULL DEFAULT 1,
    CONSTRAINT PK_ProductCategory PRIMARY KEY (ID),
    CONSTRAINT CK_ProductCategory_NoSelfParent CHECK (ParentID IS NULL OR ParentID <> ID)
);
GO

CREATE UNIQUE NONCLUSTERED INDEX UQ_ProductCategory_Code
    ON __mj_BizAppsOrders.ProductCategory (Code)
    WHERE Code IS NOT NULL;
GO

---------------------------------------------------------------------------
-- 3.3 Product — a catalog item. RevenueRecognitionType drives the credit side of the
--     order-booking JE (Immediate → Sales; Deferred → Deferred Revenue). NO GL columns (S3).
---------------------------------------------------------------------------
CREATE TABLE __mj_BizAppsOrders.Product (
    ID UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    Name NVARCHAR(200) NOT NULL,
    SKU NVARCHAR(80) NULL,
    ProductTypeID UNIQUEIDENTIFIER NOT NULL,
    ProductCategoryID UNIQUEIDENTIFIER NULL,
    OwningCompanyID UNIQUEIDENTIFIER NULL,
    Status NVARCHAR(20) NOT NULL DEFAULT 'Draft',
    SuccessorProductID UNIQUEIDENTIFIER NULL,
    AvailableFrom DATE NULL,
    AvailableTo DATE NULL,
    RevenueRecognitionType NVARCHAR(20) NOT NULL DEFAULT 'Immediate',
    DeferredRecognitionShape NVARCHAR(20) NULL,
    StandaloneSellingPrice DECIMAL(19,4) NULL,
    SubscriptionType NVARCHAR(20) NOT NULL DEFAULT 'None',
    BehaviorClass NVARCHAR(100) NULL,
    DefaultBillingCycle NVARCHAR(20) NULL,
    DefaultSubscriptionTermMonths INT NULL,
    IsTaxable BIT NOT NULL DEFAULT 1,
    Description NVARCHAR(MAX) NULL,
    IsActive BIT NOT NULL DEFAULT 1,
    CONSTRAINT PK_Product PRIMARY KEY (ID),
    CONSTRAINT CK_Product_RevenueRecognitionType CHECK (RevenueRecognitionType IN ('Immediate','Deferred')),
    CONSTRAINT CK_Product_DeferredRecognitionShape CHECK (DeferredRecognitionShape IN ('SingleDate','ServicePeriod')),
    CONSTRAINT CK_Product_SubscriptionType CHECK (SubscriptionType IN ('None','Standard','Membership')),
    CONSTRAINT CK_Product_Status CHECK (Status IN ('Draft','Active','Discontinued','EOL')),
    CONSTRAINT CK_Product_DefaultBillingCycle CHECK (DefaultBillingCycle IN ('Monthly','Quarterly','Annual','Custom')),
    CONSTRAINT CK_Product_NoSelfSuccessor CHECK (SuccessorProductID IS NULL OR SuccessorProductID <> ID),
    CONSTRAINT CK_Product_Availability CHECK (AvailableFrom IS NULL OR AvailableTo IS NULL OR AvailableTo >= AvailableFrom)
);
GO

CREATE UNIQUE NONCLUSTERED INDEX UQ_Product_SKU
    ON __mj_BizAppsOrders.Product (SKU)
    WHERE SKU IS NOT NULL;
GO

---------------------------------------------------------------------------
-- 3.4 Order — the order header AND the A/R primitive (order = invoice, CA-2 2026-07-14).
--     JEs are booked EXACTLY ONCE, on the first flip to 'Confirmed' (S4). Booking emits
--     ONE JE PER ORDER LINE (MOD-15, Amith 2026-07-21) — the Order carries NO JournalEntryID;
--     each line's entry lives on OrderLine.JournalEntryID. The order-level booked guard is
--     ConfirmedAt (order already booked). The order's JE is the aggregate of its lines' JEs.
--     NO CompanyID (S5); NO currency (FX deferred, S10). Totals (TotalGross/AmountPaid/
--     Balance) and PaymentStatus are engine-materialized, never user-entered.
--     [Order] is a T-SQL reserved word — always bracket it in raw SQL.
---------------------------------------------------------------------------
CREATE TABLE __mj_BizAppsOrders.[Order] (
    ID UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    OrderNumber NVARCHAR(40) NOT NULL,
    OrderType NVARCHAR(20) NOT NULL DEFAULT 'Sale',
    OrderDate DATE NOT NULL,
    Status NVARCHAR(20) NOT NULL DEFAULT 'Draft',
    CustomerOrganizationID UNIQUEIDENTIFIER NULL,
    CustomerPersonID UNIQUEIDENTIFIER NULL,
    SalesRepUserID UNIQUEIDENTIFIER NULL,
    BillToAddressID UNIQUEIDENTIFIER NULL,
    ShipToAddressID UNIQUEIDENTIFIER NULL,
    PaymentTermsTypeID UNIQUEIDENTIFIER NULL,
    TotalGross DECIMAL(18,2) NULL,
    AmountPaid DECIMAL(18,2) NOT NULL DEFAULT 0,
    Balance DECIMAL(18,2) NULL,
    DueDate DATE NULL,
    PaymentStatus NVARCHAR(20) NOT NULL DEFAULT 'Unpaid',
    ExternalDocumentNumber NVARCHAR(80) NULL,
    PostedAt DATETIMEOFFSET NULL,
    PostedByUserID UNIQUEIDENTIFIER NULL,
    ReversesOrderID UNIQUEIDENTIFIER NULL,
    ReversalReason NVARCHAR(MAX) NULL,
    ContractID UNIQUEIDENTIFIER NULL,
    RequestedDeliveryDate DATE NULL,
    ApprovalTaskID UNIQUEIDENTIFIER NULL,
    Description NVARCHAR(MAX) NULL,
    Notes NVARCHAR(MAX) NULL,
    ConfirmedAt DATETIMEOFFSET NULL,
    CONSTRAINT PK_Order PRIMARY KEY (ID),
    CONSTRAINT UQ_Order_OrderNumber UNIQUE (OrderNumber),
    CONSTRAINT CK_Order_Status CHECK (Status IN ('Draft','Quoted','Confirmed','Posted','Fulfilled','Voided')),
    CONSTRAINT CK_Order_OrderType CHECK (OrderType IN ('Sale','Return','Cancellation','Amendment','CreditMemoOrder')),
    CONSTRAINT CK_Order_PaymentStatus CHECK (PaymentStatus IN ('Unpaid','PartiallyPaid','Paid','Overdue','WrittenOff'))
);
GO

---------------------------------------------------------------------------
-- 3.5 OrderLine — a line on an order. Line totals are engine-computed and STORED
--     (LineTotalNet = Qty × UnitPrice × (1−DiscountPct); LineTotalGross = Net + Tax).
--     Quantity <> 0: NEGATIVE quantities are the reversal mechanism (BO-D10) — the
--     "negative only on reversal lines" cross-field rule is entity-server ValidateAsync,
--     not a DB CHECK. ServicePeriod dates drive Deferred rev-rec (UPD-2). OrderLineID
--     flows to the JE line as soft lineage.
---------------------------------------------------------------------------
CREATE TABLE __mj_BizAppsOrders.OrderLine (
    ID UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    OrderID UNIQUEIDENTIFIER NOT NULL,
    ProductID UNIQUEIDENTIFIER NOT NULL,
    LineNumber INT NOT NULL,
    Quantity DECIMAL(18,4) NOT NULL,
    UnitPrice DECIMAL(19,4) NOT NULL,
    DiscountPct DECIMAL(7,4) NOT NULL DEFAULT 0,
    LineTotalNet DECIMAL(18,2) NULL,
    LineTax DECIMAL(18,2) NOT NULL DEFAULT 0,
    LineTotalGross DECIMAL(18,2) NULL,
    ServicePeriodStart DATE NULL,
    ServicePeriodEnd DATE NULL,
    FulfillmentStatus NVARCHAR(20) NULL,
    ReversesOrderLineID UNIQUEIDENTIFIER NULL,
    SourceBundleProductID UNIQUEIDENTIFIER NULL,
    SubscriptionID UNIQUEIDENTIFIER NULL,
    RevenueRecognitionScheduleID UNIQUEIDENTIFIER NULL,
    Description NVARCHAR(500) NULL,
    -- MOD-15 (Amith 2026-07-21): each line books its OWN journal entry; this is the per-line link.
    -- SOFT ref (no FK yet — CodeGen include-mode PR pending; becomes a hard, nullable FK after).
    JournalEntryID UNIQUEIDENTIFIER NULL,
    CONSTRAINT PK_OrderLine PRIMARY KEY (ID),
    CONSTRAINT UQ_OrderLine_Order_LineNumber UNIQUE (OrderID, LineNumber),
    CONSTRAINT CK_OrderLine_Quantity CHECK (Quantity <> 0),
    CONSTRAINT CK_OrderLine_UnitPrice CHECK (UnitPrice >= 0),
    CONSTRAINT CK_OrderLine_DiscountPct CHECK (DiscountPct >= 0 AND DiscountPct <= 1),
    CONSTRAINT CK_OrderLine_FulfillmentStatus CHECK (FulfillmentStatus IN ('Pending','Fulfilled','Returned')),
    CONSTRAINT CK_OrderLine_ServicePeriod CHECK (ServicePeriodStart IS NULL OR ServicePeriodEnd IS NULL OR ServicePeriodEnd >= ServicePeriodStart)
);
GO

---------------------------------------------------------------------------
-- 3.6 PaymentTermsType — payment-terms lookup (master §15 Q11 — OWNED by Orders;
--     accounting's AccountingCompanyProfile.DefaultPaymentTermsTypeID soft-refs it).
--     Seed rows (Net 15/30/60/90, Due on Receipt, Prepaid) live in
--     metadata/payment-terms-types/ (mj-sync), NOT SQL INSERTs.
---------------------------------------------------------------------------
CREATE TABLE __mj_BizAppsOrders.PaymentTermsType (
    ID UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    Code NVARCHAR(40) NOT NULL,
    Name NVARCHAR(200) NOT NULL,
    NetDays INT NOT NULL DEFAULT 0,
    Description NVARCHAR(MAX) NULL,
    IsActive BIT NOT NULL DEFAULT 1,
    CONSTRAINT PK_PaymentTermsType PRIMARY KEY (ID),
    CONSTRAINT UQ_PaymentTermsType_Code UNIQUE (Code),
    CONSTRAINT CK_PaymentTermsType_NetDays CHECK (NetDays >= 0)
);
GO

---------------------------------------------------------------------------
-- 3.7 OrderSequence — GLOBAL singleton counter for gap-conscious ORD-{seq}
--     numbers (§15 Q1; same pattern as accounting's JournalEntryBatchSequence).
--     Consumed ONLY by the entity server (never client-side). Seeded here so the
--     minting path can UPDATE .. WITH (HOLDLOCK, UPDLOCK) without an insert race.
---------------------------------------------------------------------------
CREATE TABLE __mj_BizAppsOrders.OrderSequence (
    ID INT NOT NULL DEFAULT 1,
    NextSequenceNumber INT NOT NULL DEFAULT 1,
    CONSTRAINT PK_OrderSequence PRIMARY KEY (ID),
    CONSTRAINT CK_OrderSequence_Singleton CHECK (ID = 1),
    CONSTRAINT CK_OrderSequence_NextSeq CHECK (NextSequenceNumber > 0)
);
GO

INSERT INTO __mj_BizAppsOrders.OrderSequence (ID, NextSequenceNumber) VALUES (1, 1);
GO

---------------------------------------------------------------------------
-- 3.8 PaymentProvider — a configured payment-processing account (S2, master §4.5).
--     ProviderType widens as providers land (BO-D29). CredentialsRef is an MJ
--     Credentials engine key — NEVER a secret at rest.
---------------------------------------------------------------------------
CREATE TABLE __mj_BizAppsOrders.PaymentProvider (
    ID UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    ProviderType NVARCHAR(40) NOT NULL,
    CompanyID UNIQUEIDENTIFIER NOT NULL,
    Name NVARCHAR(200) NOT NULL,
    CredentialsRef NVARCHAR(200) NULL,
    IsLiveMode BIT NOT NULL DEFAULT 0,
    IsActive BIT NOT NULL DEFAULT 1,
    CONSTRAINT PK_PaymentProvider PRIMARY KEY (ID),
    CONSTRAINT CK_PaymentProvider_ProviderType CHECK (ProviderType IN ('Stripe','Manual'))
);
GO

---------------------------------------------------------------------------
-- 3.9 CustomerPaymentMethod — provider token vault (BO-D46). Token references
--     only; NEVER a PAN or full card data. Created before Payment so the FK
--     targets exist.
---------------------------------------------------------------------------
CREATE TABLE __mj_BizAppsOrders.CustomerPaymentMethod (
    ID UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    CustomerOrganizationID UNIQUEIDENTIFIER NOT NULL,
    PaymentProviderID UNIQUEIDENTIFIER NOT NULL,
    ProviderCustomerID NVARCHAR(100) NULL,
    ProviderPaymentMethodID NVARCHAR(100) NULL,
    MethodType NVARCHAR(20) NULL,
    Brand NVARCHAR(40) NULL,
    Last4 CHAR(4) NULL,
    ExpiryMonth INT NULL,
    ExpiryYear INT NULL,
    IsDefault BIT NOT NULL DEFAULT 0,
    IsActive BIT NOT NULL DEFAULT 1,
    CONSTRAINT PK_CustomerPaymentMethod PRIMARY KEY (ID),
    CONSTRAINT CK_CustomerPaymentMethod_ExpiryMonth CHECK (ExpiryMonth IS NULL OR (ExpiryMonth >= 1 AND ExpiryMonth <= 12))
);
GO

---------------------------------------------------------------------------
-- 3.10 PaymentIntent — provider-side collection state (BO-D26). Stripe-shaped;
--      the Manual provider skips it entirely. ProviderEventID carries webhook
--      idempotency (unique filtered index below).
---------------------------------------------------------------------------
CREATE TABLE __mj_BizAppsOrders.PaymentIntent (
    ID UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    PaymentProviderID UNIQUEIDENTIFIER NOT NULL,
    ProviderIntentID NVARCHAR(100) NOT NULL,
    Status NVARCHAR(30) NOT NULL,
    Amount DECIMAL(18,2) NOT NULL,
    OrderID UNIQUEIDENTIFIER NULL,
    CustomerOrganizationID UNIQUEIDENTIFIER NULL,
    ProviderEventID NVARCHAR(100) NULL,
    LastEventAt DATETIMEOFFSET NULL,
    CONSTRAINT PK_PaymentIntent PRIMARY KEY (ID),
    CONSTRAINT UQ_PaymentIntent_ProviderIntentID UNIQUE (ProviderIntentID),
    CONSTRAINT CK_PaymentIntent_Status CHECK (Status IN ('RequiresPayment','Processing','Succeeded','Canceled','Failed'))
);
GO

CREATE UNIQUE NONCLUSTERED INDEX UQ_PaymentIntent_ProviderEventID
    ON __mj_BizAppsOrders.PaymentIntent (ProviderEventID)
    WHERE ProviderEventID IS NOT NULL;
GO

---------------------------------------------------------------------------
-- 3.11 Payment — a money movement (receipt or reversal). Gross Amount is the
--      customer-side truth; NetAmount = Amount − ProcessingFeeAmount (BO-D47).
--      Negative Amount for reversal methods. JournalEntryID is a SOFT ref to
--      the accounting JE booked at capture (same NULL->value-once rule as OrderLine.JournalEntryID).
---------------------------------------------------------------------------
CREATE TABLE __mj_BizAppsOrders.Payment (
    ID UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    PaymentNumber NVARCHAR(40) NOT NULL,
    ReceivingCompanyID UNIQUEIDENTIFIER NOT NULL,
    CustomerOrganizationID UNIQUEIDENTIFIER NULL,
    PaymentDate DATE NOT NULL,
    Method NVARCHAR(20) NOT NULL,
    Amount DECIMAL(18,2) NOT NULL,
    ProcessingFeeAmount DECIMAL(18,2) NOT NULL DEFAULT 0,
    NetAmount DECIMAL(18,2) NULL,
    PaymentProviderID UNIQUEIDENTIFIER NULL,
    PaymentIntentID UNIQUEIDENTIFIER NULL,
    PaymentMethodID UNIQUEIDENTIFIER NULL,
    ProviderChargeID NVARCHAR(100) NULL,
    ProviderRefundID NVARCHAR(100) NULL,
    ReversesPaymentID UNIQUEIDENTIFIER NULL,
    ReversalReason NVARCHAR(MAX) NULL,
    Status NVARCHAR(20) NOT NULL DEFAULT 'Pending',
    JournalEntryID UNIQUEIDENTIFIER NULL,
    StoredValueAccountID UNIQUEIDENTIFIER NULL,
    Description NVARCHAR(MAX) NULL,
    Notes NVARCHAR(MAX) NULL,
    CONSTRAINT PK_Payment PRIMARY KEY (ID),
    CONSTRAINT UQ_Payment_PaymentNumber UNIQUE (PaymentNumber),
    CONSTRAINT CK_Payment_Method CHECK (Method IN ('CreditCard','ACH','Wire','Check','Cash','InternalTransfer','GiftCard','Refund','Chargeback','BankReturn')),
    CONSTRAINT CK_Payment_Status CHECK (Status IN ('Pending','Captured','Failed','Refunded','Disputed'))
);
GO

---------------------------------------------------------------------------
-- 3.12 PaymentLine — cash application junction (BO-D16/D45): which order(s)
--      a payment settles, and by how much. Jeremy's "applying a payment".
--      Negative Amount applies a credit memo. AllocatedByUserID NULL = auto.
---------------------------------------------------------------------------
CREATE TABLE __mj_BizAppsOrders.PaymentLine (
    ID UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    PaymentID UNIQUEIDENTIFIER NOT NULL,
    OrderID UNIQUEIDENTIFIER NOT NULL,
    OrderLineID UNIQUEIDENTIFIER NULL,
    Amount DECIMAL(18,2) NOT NULL,
    AllocatedAt DATETIMEOFFSET NOT NULL,
    AllocatedByUserID UNIQUEIDENTIFIER NULL,
    CONSTRAINT PK_PaymentLine PRIMARY KEY (ID),
    CONSTRAINT CK_PaymentLine_Amount CHECK (Amount <> 0)
);
GO

---------------------------------------------------------------------------
-- 3.13 PaymentSequence — GLOBAL singleton counter for PAY-{seq} numbers
--      (same pattern as OrderSequence). Seeded here.
---------------------------------------------------------------------------
CREATE TABLE __mj_BizAppsOrders.PaymentSequence (
    ID INT NOT NULL DEFAULT 1,
    NextSequenceNumber INT NOT NULL DEFAULT 1,
    CONSTRAINT PK_PaymentSequence PRIMARY KEY (ID),
    CONSTRAINT CK_PaymentSequence_Singleton CHECK (ID = 1),
    CONSTRAINT CK_PaymentSequence_NextSeq CHECK (NextSequenceNumber > 0)
);
GO

INSERT INTO __mj_BizAppsOrders.PaymentSequence (ID, NextSequenceNumber) VALUES (1, 1);
GO

---------------------------------------------------------------------------
-- 3.14 SubscriptionPlan — OPTIONAL elaboration of a subscription product
--      (BO-D40); simple memberships need none.
---------------------------------------------------------------------------
CREATE TABLE __mj_BizAppsOrders.SubscriptionPlan (
    ID UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    ProductID UNIQUEIDENTIFIER NOT NULL,
    Name NVARCHAR(200) NOT NULL,
    BillingCycle NVARCHAR(20) NOT NULL,
    CustomCycleDays INT NULL,
    PricePerCycle DECIMAL(18,2) NULL,
    TrialDays INT NOT NULL DEFAULT 0,
    IsActive BIT NOT NULL DEFAULT 1,
    CONSTRAINT PK_SubscriptionPlan PRIMARY KEY (ID),
    CONSTRAINT CK_SubscriptionPlan_BillingCycle CHECK (BillingCycle IN ('Monthly','Quarterly','Annual','Custom')),
    CONSTRAINT CK_SubscriptionPlan_CustomCycleDays CHECK (CustomCycleDays IS NULL OR CustomCycleDays > 0),
    CONSTRAINT CK_SubscriptionPlan_TrialDays CHECK (TrialDays >= 0)
);
GO

---------------------------------------------------------------------------
-- 3.15 Subscription — the recurring relationship (Product, Customer,
--      Beneficiary) born from an order line (BO-D39/D40). Renewal cycles spawn
--      new Orders under it; each renewal ORDER LINE carries its own rev-rec
--      schedule, so there is deliberately NO schedule FK here (design deviation
--      from master §4.4, flagged in the schema plan §3.2). No OwningCompanyID
--      (MOD-3: company via the resolved account).
---------------------------------------------------------------------------
CREATE TABLE __mj_BizAppsOrders.Subscription (
    ID UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    SubscriptionNumber NVARCHAR(40) NOT NULL,
    OrderLineID UNIQUEIDENTIFIER NOT NULL,
    SubscriptionPlanID UNIQUEIDENTIFIER NULL,
    ProductID UNIQUEIDENTIFIER NOT NULL,
    CustomerOrganizationID UNIQUEIDENTIFIER NULL,
    BeneficiaryPersonID UNIQUEIDENTIFIER NULL,
    Status NVARCHAR(20) NOT NULL,
    StartDate DATE NOT NULL,
    CurrentPeriodStart DATE NOT NULL,
    CurrentPeriodEnd DATE NOT NULL,
    TrialEndDate DATE NULL,
    CanceledAt DATETIMEOFFSET NULL,
    EndDate DATE NULL,
    AutoRenew BIT NOT NULL DEFAULT 1,
    RenewalLeadDays INT NOT NULL DEFAULT 90,
    PaymentProviderID UNIQUEIDENTIFIER NULL,
    ProviderSubscriptionID NVARCHAR(100) NULL,
    MigratesFromSubscriptionID UNIQUEIDENTIFIER NULL,
    MigratesToSubscriptionID UNIQUEIDENTIFIER NULL,
    CONSTRAINT PK_Subscription PRIMARY KEY (ID),
    CONSTRAINT UQ_Subscription_Number UNIQUE (SubscriptionNumber),
    CONSTRAINT CK_Subscription_Status CHECK (Status IN ('Active','Paused','Canceled','Migrated','Trialing')),
    CONSTRAINT CK_Subscription_Period CHECK (CurrentPeriodEnd >= CurrentPeriodStart),
    CONSTRAINT CK_Subscription_RenewalLeadDays CHECK (RenewalLeadDays >= 0),
    CONSTRAINT CK_Subscription_NoSelfMigrateFrom CHECK (MigratesFromSubscriptionID IS NULL OR MigratesFromSubscriptionID <> ID),
    CONSTRAINT CK_Subscription_NoSelfMigrateTo CHECK (MigratesToSubscriptionID IS NULL OR MigratesToSubscriptionID <> ID)
);
GO

---------------------------------------------------------------------------
-- 3.16 SubscriptionEvent — immutable lifecycle log (§4.4). ProviderEventID is
--      the webhook idempotency key (unique filtered index below).
---------------------------------------------------------------------------
CREATE TABLE __mj_BizAppsOrders.SubscriptionEvent (
    ID UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    SubscriptionID UNIQUEIDENTIFIER NOT NULL,
    EventType NVARCHAR(40) NOT NULL,
    OccurredAt DATETIMEOFFSET NOT NULL,
    EventData NVARCHAR(MAX) NULL,
    ProviderEventID NVARCHAR(100) NULL,
    RelatedPaymentID UNIQUEIDENTIFIER NULL,
    RelatedOrderID UNIQUEIDENTIFIER NULL,
    CONSTRAINT PK_SubscriptionEvent PRIMARY KEY (ID),
    CONSTRAINT CK_SubscriptionEvent_EventType CHECK (EventType IN ('Created','Activated','TrialStarted','TrialEnded','PaymentSucceeded','PaymentFailed','Paused','Resumed','CancellationRequested','Canceled','Migrated','RenewalOrderSpawned'))
);
GO

CREATE UNIQUE NONCLUSTERED INDEX UQ_SubscriptionEvent_ProviderEventID
    ON __mj_BizAppsOrders.SubscriptionEvent (ProviderEventID)
    WHERE ProviderEventID IS NOT NULL;
GO

---------------------------------------------------------------------------
-- 3.17 RevenueRecognitionSchedule — lightweight computation source + MRR/ARR
--      display (BO-D11). 'SingleDate' = UPD-2 shape (a): 100% on the event
--      date; 'StraightLine' = shape (b): spread over the line's service period.
---------------------------------------------------------------------------
CREATE TABLE __mj_BizAppsOrders.RevenueRecognitionSchedule (
    ID UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    SchedulingMethod NVARCHAR(20) NOT NULL,
    StartDate DATE NOT NULL,
    EndDate DATE NOT NULL,
    TotalAmount DECIMAL(18,2) NOT NULL,
    TotalRecognized DECIMAL(18,2) NOT NULL DEFAULT 0,
    IsComplete BIT NOT NULL DEFAULT 0,
    CONSTRAINT PK_RevenueRecognitionSchedule PRIMARY KEY (ID),
    CONSTRAINT CK_RevRecSchedule_Method CHECK (SchedulingMethod IN ('StraightLine','SingleDate','Milestone','Custom')),
    CONSTRAINT CK_RevRecSchedule_Dates CHECK (EndDate >= StartDate)
);
GO

---------------------------------------------------------------------------
-- 3.18 RevRecScheduleLine — one row per recognition period; line 1 carries the
--      rounding remainder. Soft refs to accounting's ScheduledJournalEntry /
--      JournalEntry (dated-entry model, accounting MOD-11).
---------------------------------------------------------------------------
CREATE TABLE __mj_BizAppsOrders.RevRecScheduleLine (
    ID UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    ScheduleID UNIQUEIDENTIFIER NOT NULL,
    PeriodStart DATE NOT NULL,
    PeriodEnd DATE NOT NULL,
    Amount DECIMAL(18,2) NOT NULL,
    ScheduledJournalEntryID UNIQUEIDENTIFIER NULL,
    RecognizedJournalEntryID UNIQUEIDENTIFIER NULL,
    RecognizedAt DATETIMEOFFSET NULL,
    IsRecognized BIT NOT NULL DEFAULT 0,
    CONSTRAINT PK_RevRecScheduleLine PRIMARY KEY (ID),
    CONSTRAINT CK_RevRecScheduleLine_Period CHECK (PeriodEnd >= PeriodStart)
);
GO

---------------------------------------------------------------------------
-- 3.19 ProductBundleItem — composite products (BO-D32/D41). One structure,
--      two order modes: bundle-line (single line, SSP allocation later) and
--      fast-path expansion (components explode into normal lines with
--      OrderLine.SourceBundleProductID provenance).
---------------------------------------------------------------------------
CREATE TABLE __mj_BizAppsOrders.ProductBundleItem (
    ID UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    BundleProductID UNIQUEIDENTIFIER NOT NULL,
    ComponentProductID UNIQUEIDENTIFIER NOT NULL,
    Quantity DECIMAL(18,4) NOT NULL DEFAULT 1,
    PricingMode NVARCHAR(20) NOT NULL DEFAULT 'Bundled',
    SortOrder INT NOT NULL DEFAULT 0,
    CONSTRAINT PK_ProductBundleItem PRIMARY KEY (ID),
    CONSTRAINT UQ_ProductBundleItem_Pair UNIQUE (BundleProductID, ComponentProductID),
    CONSTRAINT CK_ProductBundleItem_Quantity CHECK (Quantity > 0),
    CONSTRAINT CK_ProductBundleItem_PricingMode CHECK (PricingMode IN ('Bundled','SumOfParts')),
    CONSTRAINT CK_ProductBundleItem_NoSelfBundle CHECK (BundleProductID <> ComponentProductID)
);
GO

---------------------------------------------------------------------------
-- 3.20 ProductPerformanceObligation — ASC 606 (BO-D35): one+ per product
--      (esp. bundles); SSP drives allocation. Fields now, allocation engine
--      later. NO GL columns (MOD-2 — GLAccountLink can point at PPO rows).
---------------------------------------------------------------------------
CREATE TABLE __mj_BizAppsOrders.ProductPerformanceObligation (
    ID UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    ProductID UNIQUEIDENTIFIER NOT NULL,
    Name NVARCHAR(200) NULL,
    RevenueRecognitionType NVARCHAR(20) NOT NULL,
    StandaloneSellingPrice DECIMAL(19,4) NOT NULL,
    CONSTRAINT PK_ProductPerformanceObligation PRIMARY KEY (ID),
    CONSTRAINT CK_PPO_RevRecType CHECK (RevenueRecognitionType IN ('Immediate','Deferred')),
    CONSTRAINT CK_PPO_SSP CHECK (StandaloneSellingPrice >= 0)
);
GO

---------------------------------------------------------------------------
-- 3.21 ProductEntitlement — the DEFINITION of what a purchase grants
--      (BO-D34/D39). EntitlementGrant (3.22) is the instance.
---------------------------------------------------------------------------
CREATE TABLE __mj_BizAppsOrders.ProductEntitlement (
    ID UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    ProductID UNIQUEIDENTIFIER NOT NULL,
    EntitlementType NVARCHAR(40) NOT NULL,
    Code NVARCHAR(80) NOT NULL,
    Name NVARCHAR(200) NULL,
    Quantity DECIMAL(18,4) NULL,
    UnitOfMeasure NVARCHAR(40) NULL,
    IsActive BIT NOT NULL DEFAULT 1,
    CONSTRAINT PK_ProductEntitlement PRIMARY KEY (ID),
    CONSTRAINT UQ_ProductEntitlement_Product_Code UNIQUE (ProductID, Code),
    CONSTRAINT CK_ProductEntitlement_Type CHECK (EntitlementType IN ('Feature','AccessLevel','ResourceQuantity','Custom'))
);
GO

---------------------------------------------------------------------------
-- 3.22 EntitlementGrant — the INSTANCE created at Post / subscription
--      activation, carrying the beneficiary (defaults to the buyer; an order
--      line may designate another — attendee, gift recipient, honoree).
---------------------------------------------------------------------------
CREATE TABLE __mj_BizAppsOrders.EntitlementGrant (
    ID UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    ProductEntitlementID UNIQUEIDENTIFIER NOT NULL,
    OrderLineID UNIQUEIDENTIFIER NULL,
    SubscriptionID UNIQUEIDENTIFIER NULL,
    BeneficiaryPersonID UNIQUEIDENTIFIER NULL,
    BeneficiaryOrganizationID UNIQUEIDENTIFIER NULL,
    Quantity DECIMAL(18,4) NULL,
    ValidFrom DATE NULL,
    ValidTo DATE NULL,
    Status NVARCHAR(20) NOT NULL DEFAULT 'Active',
    ProvisionedAt DATETIMEOFFSET NULL,
    CONSTRAINT PK_EntitlementGrant PRIMARY KEY (ID),
    CONSTRAINT CK_EntitlementGrant_Status CHECK (Status IN ('Active','Suspended','Revoked','Expired')),
    CONSTRAINT CK_EntitlementGrant_Validity CHECK (ValidFrom IS NULL OR ValidTo IS NULL OR ValidTo >= ValidFrom)
);
GO

---------------------------------------------------------------------------
-- 3.23 EventProduct — IsA Disjoint child of Product (BO-D37): PK = the SAME
--      UUID as the parent Product row (accounting's ACP ⊂ __mj.Company
--      pattern). First of the type-driven extension pairs; the other seeded
--      types get their extension entities as their features land.
---------------------------------------------------------------------------
CREATE TABLE __mj_BizAppsOrders.EventProduct (
    ID UNIQUEIDENTIFIER NOT NULL,
    EventStartsAt DATETIMEOFFSET NOT NULL,
    EventEndsAt DATETIMEOFFSET NULL,
    VenueName NVARCHAR(300) NULL,
    VenueAddressID UNIQUEIDENTIFIER NULL,
    Capacity INT NULL,
    RequiresAttendeeInfo BIT NOT NULL DEFAULT 1,
    CONSTRAINT PK_EventProduct PRIMARY KEY (ID),
    CONSTRAINT CK_EventProduct_Capacity CHECK (Capacity IS NULL OR Capacity > 0),
    CONSTRAINT CK_EventProduct_Ends CHECK (EventEndsAt IS NULL OR EventEndsAt >= EventStartsAt)
);
GO

---------------------------------------------------------------------------
-- 3.24 EventOrderLine — IsA Disjoint child of OrderLine (BO-D37): the
--      per-line attendee detail; the attendee is typically the
--      EntitlementGrant beneficiary (BO-D39).
---------------------------------------------------------------------------
CREATE TABLE __mj_BizAppsOrders.EventOrderLine (
    ID UNIQUEIDENTIFIER NOT NULL,
    AttendeeName NVARCHAR(300) NULL,
    AttendeeEmail NVARCHAR(255) NULL,
    CheckInAt DATETIMEOFFSET NULL,
    CONSTRAINT PK_EventOrderLine PRIMARY KEY (ID)
);
GO

---------------------------------------------------------------------------
-- 3.25 StoredValueAccount — gift-card / stored-value instrument (BO-D44).
--      Selling issues one and books a LIABILITY (not revenue); redeeming is a
--      Payment with Method='GiftCard'. NO CurrencyCode (MOD-4).
---------------------------------------------------------------------------
CREATE TABLE __mj_BizAppsOrders.StoredValueAccount (
    ID UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    Code NVARCHAR(60) NOT NULL,
    IssuingCompanyID UNIQUEIDENTIFIER NOT NULL,
    InitialAmount DECIMAL(18,2) NOT NULL,
    CurrentBalance DECIMAL(18,2) NOT NULL,
    Status NVARCHAR(20) NOT NULL DEFAULT 'Active',
    IssuedFromOrderLineID UNIQUEIDENTIFIER NULL,
    BeneficiaryPersonID UNIQUEIDENTIFIER NULL,
    BeneficiaryOrganizationID UNIQUEIDENTIFIER NULL,
    ExpiresAt DATE NULL,
    CONSTRAINT PK_StoredValueAccount PRIMARY KEY (ID),
    CONSTRAINT UQ_StoredValueAccount_Code UNIQUE (Code),
    CONSTRAINT CK_StoredValueAccount_Status CHECK (Status IN ('Active','Depleted','Expired','Suspended','Voided')),
    CONSTRAINT CK_StoredValueAccount_InitialAmount CHECK (InitialAmount > 0)
);
GO

---------------------------------------------------------------------------
-- 3.26 StoredValueTransaction — the stored-value balance ledger (BO-D44).
--      Signed Amount; BalanceAfter is the running balance.
---------------------------------------------------------------------------
CREATE TABLE __mj_BizAppsOrders.StoredValueTransaction (
    ID UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    StoredValueAccountID UNIQUEIDENTIFIER NOT NULL,
    TransactionType NVARCHAR(20) NOT NULL,
    Amount DECIMAL(18,2) NOT NULL,
    BalanceAfter DECIMAL(18,2) NOT NULL,
    RelatedPaymentID UNIQUEIDENTIFIER NULL,
    RelatedOrderID UNIQUEIDENTIFIER NULL,
    OccurredAt DATETIMEOFFSET NOT NULL,
    CONSTRAINT PK_StoredValueTransaction PRIMARY KEY (ID),
    CONSTRAINT CK_StoredValueTransaction_Type CHECK (TransactionType IN ('Issue','Redeem','Refund','Adjust','Expire')),
    CONSTRAINT CK_StoredValueTransaction_Amount CHECK (Amount <> 0)
);
GO

---------------------------------------------------------------------------
-- 3.27 OrderLineDimension — order lines tag accounting Dimensions (§15 Q5;
--      REQUIRED for Jeremy's batch-dimension detail). Soft refs (no FK) to
--      __mj_BizAppsAccounting.Dimension / DimensionValue; the booking draft
--      propagates them onto JE lines.
---------------------------------------------------------------------------
CREATE TABLE __mj_BizAppsOrders.OrderLineDimension (
    ID UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    OrderLineID UNIQUEIDENTIFIER NOT NULL,
    DimensionID UNIQUEIDENTIFIER NOT NULL,
    DimensionValueID UNIQUEIDENTIFIER NOT NULL,
    CONSTRAINT PK_OrderLineDimension PRIMARY KEY (ID),
    CONSTRAINT UQ_OrderLineDimension_Line_Dimension UNIQUE (OrderLineID, DimensionID)
);
GO

---------------------------------------------------------------------------
-- 3.28 PriceList — pricing segmentation (BO-D33): region / channel /
--      customer-tier scoping, effective-dated. NO CurrencyCode (MOD-4).
---------------------------------------------------------------------------
CREATE TABLE __mj_BizAppsOrders.PriceList (
    ID UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    Code NVARCHAR(40) NOT NULL,
    Name NVARCHAR(200) NOT NULL,
    Segment NVARCHAR(40) NULL,
    EffectiveFrom DATE NULL,
    EffectiveTo DATE NULL,
    IsActive BIT NOT NULL DEFAULT 1,
    CONSTRAINT PK_PriceList PRIMARY KEY (ID),
    CONSTRAINT UQ_PriceList_Code UNIQUE (Code),
    CONSTRAINT CK_PriceList_Effective CHECK (EffectiveFrom IS NULL OR EffectiveTo IS NULL OR EffectiveTo >= EffectiveFrom)
);
GO

---------------------------------------------------------------------------
-- 3.29 ProductPrice — an effective-dated price for a product (BO-D33).
--      PricingModel/FeeType structure now; the resolution engine is feature
--      F9 (UnitPrice direct entry stays the precedence base). NO currency
--      column (MOD-4).
---------------------------------------------------------------------------
CREATE TABLE __mj_BizAppsOrders.ProductPrice (
    ID UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    ProductID UNIQUEIDENTIFIER NOT NULL,
    PriceListID UNIQUEIDENTIFIER NULL,
    PricingModel NVARCHAR(20) NOT NULL DEFAULT 'Flat',
    FeeType NVARCHAR(20) NOT NULL DEFAULT 'Standard',
    Amount DECIMAL(19,4) NOT NULL,
    UnitOfMeasure NVARCHAR(40) NULL,
    MinQuantity DECIMAL(18,4) NULL,
    MaxQuantity DECIMAL(18,4) NULL,
    EffectiveFrom DATE NOT NULL,
    EffectiveTo DATE NULL,
    CONSTRAINT PK_ProductPrice PRIMARY KEY (ID),
    CONSTRAINT CK_ProductPrice_PricingModel CHECK (PricingModel IN ('Flat','PerUnit','Tiered','Volume','Package','Usage')),
    CONSTRAINT CK_ProductPrice_FeeType CHECK (FeeType IN ('Standard','Setup','Recurring','Overage')),
    CONSTRAINT CK_ProductPrice_Effective CHECK (EffectiveTo IS NULL OR EffectiveTo >= EffectiveFrom),
    CONSTRAINT CK_ProductPrice_QuantityRange CHECK (MinQuantity IS NULL OR MaxQuantity IS NULL OR MaxQuantity >= MinQuantity)
);
GO

-- Price-resolution seek index (not an FK index — CodeGen owns those).
CREATE NONCLUSTERED INDEX IX_ProductPrice_Resolution
    ON __mj_BizAppsOrders.ProductPrice (ProductID, EffectiveFrom DESC);
GO

---------------------------------------------------------------------------
-- 3.30 PriceTier — volume / quantity breaks under a Tiered/Volume
--      ProductPrice (BO-D33).
---------------------------------------------------------------------------
CREATE TABLE __mj_BizAppsOrders.PriceTier (
    ID UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    ProductPriceID UNIQUEIDENTIFIER NOT NULL,
    MinQuantity DECIMAL(18,4) NOT NULL,
    MaxQuantity DECIMAL(18,4) NULL,
    Amount DECIMAL(19,4) NOT NULL,
    SortOrder INT NOT NULL DEFAULT 0,
    CONSTRAINT PK_PriceTier PRIMARY KEY (ID),
    CONSTRAINT CK_PriceTier_Range CHECK (MaxQuantity IS NULL OR MaxQuantity >= MinQuantity)
);
GO

---------------------------------------------------------------------------
-- 3.31 SalesRule — metadata-driven sales constraints evaluated at Confirm
--      (§4.8, BO-D17/D18): discount limits, required terms, product
--      authorization, credit limits. Violations raise an Approval Request
--      Task in bizapps-tasks routed to ApprovalRequiredRoleID (engine = F8).
---------------------------------------------------------------------------
CREATE TABLE __mj_BizAppsOrders.SalesRule (
    ID UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    Name NVARCHAR(200) NOT NULL,
    RuleType NVARCHAR(40) NOT NULL,
    Scope NVARCHAR(40) NOT NULL DEFAULT 'Global',
    ScopeReferenceID UNIQUEIDENTIFIER NULL,
    PredicateJson NVARCHAR(MAX) NULL,
    ApprovalRequiredRoleID UNIQUEIDENTIFIER NULL,
    IsActive BIT NOT NULL DEFAULT 1,
    CONSTRAINT PK_SalesRule PRIMARY KEY (ID),
    CONSTRAINT CK_SalesRule_RuleType CHECK (RuleType IN ('DiscountLimit','PaymentTermsRequired','ProductAuthorization','CreditLimit','Custom')),
    CONSTRAINT CK_SalesRule_Scope CHECK (Scope IN ('Global','PerProduct','PerCustomer','PerSalesRep'))
);
GO

---------------------------------------------------------------------------
-- 3.32 SalesAuthority — per-rep limits (§4.8): the caps within which a rep
--      Confirms without approval (e.g. Johanna's max discount).
---------------------------------------------------------------------------
CREATE TABLE __mj_BizAppsOrders.SalesAuthority (
    ID UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    SalesRepUserID UNIQUEIDENTIFIER NOT NULL,
    MaxDiscountPct DECIMAL(7,4) NULL,
    MaxOrderValue DECIMAL(18,2) NULL,
    AllowedPaymentTermsTypeIDs NVARCHAR(MAX) NULL,
    AllowedProductCategoryIDs NVARCHAR(MAX) NULL,
    IsActive BIT NOT NULL DEFAULT 1,
    CONSTRAINT PK_SalesAuthority PRIMARY KEY (ID),
    CONSTRAINT CK_SalesAuthority_MaxDiscountPct CHECK (MaxDiscountPct IS NULL OR (MaxDiscountPct >= 0 AND MaxDiscountPct <= 1)),
    CONSTRAINT CK_SalesAuthority_MaxOrderValue CHECK (MaxOrderValue IS NULL OR MaxOrderValue >= 0)
);
GO

-- =============================================================================
-- 4. FOREIGN KEYS (same-schema; created after all tables exist)
-- =============================================================================
ALTER TABLE __mj_BizAppsOrders.ProductCategory
    ADD CONSTRAINT FK_ProductCategory_Parent
    FOREIGN KEY (ParentID) REFERENCES __mj_BizAppsOrders.ProductCategory(ID);
GO

ALTER TABLE __mj_BizAppsOrders.Product
    ADD CONSTRAINT FK_Product_ProductType
    FOREIGN KEY (ProductTypeID) REFERENCES __mj_BizAppsOrders.ProductType(ID);
GO

ALTER TABLE __mj_BizAppsOrders.Product
    ADD CONSTRAINT FK_Product_ProductCategory
    FOREIGN KEY (ProductCategoryID) REFERENCES __mj_BizAppsOrders.ProductCategory(ID);
GO

ALTER TABLE __mj_BizAppsOrders.OrderLine
    ADD CONSTRAINT FK_OrderLine_Order
    FOREIGN KEY (OrderID) REFERENCES __mj_BizAppsOrders.[Order](ID);
GO

ALTER TABLE __mj_BizAppsOrders.OrderLine
    ADD CONSTRAINT FK_OrderLine_Product
    FOREIGN KEY (ProductID) REFERENCES __mj_BizAppsOrders.Product(ID);
GO

ALTER TABLE __mj_BizAppsOrders.[Order]
    ADD CONSTRAINT FK_Order_PaymentTermsType
    FOREIGN KEY (PaymentTermsTypeID) REFERENCES __mj_BizAppsOrders.PaymentTermsType(ID);
GO

ALTER TABLE __mj_BizAppsOrders.[Order]
    ADD CONSTRAINT FK_Order_ReversesOrder
    FOREIGN KEY (ReversesOrderID) REFERENCES __mj_BizAppsOrders.[Order](ID);
GO

ALTER TABLE __mj_BizAppsOrders.OrderLine
    ADD CONSTRAINT FK_OrderLine_ReversesOrderLine
    FOREIGN KEY (ReversesOrderLineID) REFERENCES __mj_BizAppsOrders.OrderLine(ID);
GO

ALTER TABLE __mj_BizAppsOrders.OrderLine
    ADD CONSTRAINT FK_OrderLine_SourceBundleProduct
    FOREIGN KEY (SourceBundleProductID) REFERENCES __mj_BizAppsOrders.Product(ID);
GO

-- FKs to __mj core are allowed (precedent: common's FK_Person_LinkedUser).
ALTER TABLE __mj_BizAppsOrders.[Order]
    ADD CONSTRAINT FK_Order_SalesRepUser
    FOREIGN KEY (SalesRepUserID) REFERENCES __mj.[User](ID);
GO

ALTER TABLE __mj_BizAppsOrders.[Order]
    ADD CONSTRAINT FK_Order_PostedByUser
    FOREIGN KEY (PostedByUserID) REFERENCES __mj.[User](ID);
GO

-- Payments subsystem (S2)
ALTER TABLE __mj_BizAppsOrders.PaymentProvider
    ADD CONSTRAINT FK_PaymentProvider_Company
    FOREIGN KEY (CompanyID) REFERENCES __mj.Company(ID);
GO

ALTER TABLE __mj_BizAppsOrders.CustomerPaymentMethod
    ADD CONSTRAINT FK_CustomerPaymentMethod_PaymentProvider
    FOREIGN KEY (PaymentProviderID) REFERENCES __mj_BizAppsOrders.PaymentProvider(ID);
GO

ALTER TABLE __mj_BizAppsOrders.PaymentIntent
    ADD CONSTRAINT FK_PaymentIntent_PaymentProvider
    FOREIGN KEY (PaymentProviderID) REFERENCES __mj_BizAppsOrders.PaymentProvider(ID);
GO

ALTER TABLE __mj_BizAppsOrders.PaymentIntent
    ADD CONSTRAINT FK_PaymentIntent_Order
    FOREIGN KEY (OrderID) REFERENCES __mj_BizAppsOrders.[Order](ID);
GO

ALTER TABLE __mj_BizAppsOrders.Payment
    ADD CONSTRAINT FK_Payment_ReceivingCompany
    FOREIGN KEY (ReceivingCompanyID) REFERENCES __mj.Company(ID);
GO

ALTER TABLE __mj_BizAppsOrders.Payment
    ADD CONSTRAINT FK_Payment_PaymentProvider
    FOREIGN KEY (PaymentProviderID) REFERENCES __mj_BizAppsOrders.PaymentProvider(ID);
GO

ALTER TABLE __mj_BizAppsOrders.Payment
    ADD CONSTRAINT FK_Payment_PaymentIntent
    FOREIGN KEY (PaymentIntentID) REFERENCES __mj_BizAppsOrders.PaymentIntent(ID);
GO

ALTER TABLE __mj_BizAppsOrders.Payment
    ADD CONSTRAINT FK_Payment_PaymentMethod
    FOREIGN KEY (PaymentMethodID) REFERENCES __mj_BizAppsOrders.CustomerPaymentMethod(ID);
GO

ALTER TABLE __mj_BizAppsOrders.Payment
    ADD CONSTRAINT FK_Payment_ReversesPayment
    FOREIGN KEY (ReversesPaymentID) REFERENCES __mj_BizAppsOrders.Payment(ID);
GO

ALTER TABLE __mj_BizAppsOrders.PaymentLine
    ADD CONSTRAINT FK_PaymentLine_Payment
    FOREIGN KEY (PaymentID) REFERENCES __mj_BizAppsOrders.Payment(ID);
GO

ALTER TABLE __mj_BizAppsOrders.PaymentLine
    ADD CONSTRAINT FK_PaymentLine_Order
    FOREIGN KEY (OrderID) REFERENCES __mj_BizAppsOrders.[Order](ID);
GO

ALTER TABLE __mj_BizAppsOrders.PaymentLine
    ADD CONSTRAINT FK_PaymentLine_OrderLine
    FOREIGN KEY (OrderLineID) REFERENCES __mj_BizAppsOrders.OrderLine(ID);
GO

ALTER TABLE __mj_BizAppsOrders.PaymentLine
    ADD CONSTRAINT FK_PaymentLine_AllocatedByUser
    FOREIGN KEY (AllocatedByUserID) REFERENCES __mj.[User](ID);
GO

-- Subscriptions + rev-rec bridge (S3)
ALTER TABLE __mj_BizAppsOrders.SubscriptionPlan
    ADD CONSTRAINT FK_SubscriptionPlan_Product
    FOREIGN KEY (ProductID) REFERENCES __mj_BizAppsOrders.Product(ID);
GO

ALTER TABLE __mj_BizAppsOrders.Subscription
    ADD CONSTRAINT FK_Subscription_OrderLine
    FOREIGN KEY (OrderLineID) REFERENCES __mj_BizAppsOrders.OrderLine(ID);
GO

ALTER TABLE __mj_BizAppsOrders.Subscription
    ADD CONSTRAINT FK_Subscription_SubscriptionPlan
    FOREIGN KEY (SubscriptionPlanID) REFERENCES __mj_BizAppsOrders.SubscriptionPlan(ID);
GO

ALTER TABLE __mj_BizAppsOrders.Subscription
    ADD CONSTRAINT FK_Subscription_Product
    FOREIGN KEY (ProductID) REFERENCES __mj_BizAppsOrders.Product(ID);
GO

ALTER TABLE __mj_BizAppsOrders.Subscription
    ADD CONSTRAINT FK_Subscription_PaymentProvider
    FOREIGN KEY (PaymentProviderID) REFERENCES __mj_BizAppsOrders.PaymentProvider(ID);
GO

ALTER TABLE __mj_BizAppsOrders.Subscription
    ADD CONSTRAINT FK_Subscription_MigratesFrom
    FOREIGN KEY (MigratesFromSubscriptionID) REFERENCES __mj_BizAppsOrders.Subscription(ID);
GO

ALTER TABLE __mj_BizAppsOrders.Subscription
    ADD CONSTRAINT FK_Subscription_MigratesTo
    FOREIGN KEY (MigratesToSubscriptionID) REFERENCES __mj_BizAppsOrders.Subscription(ID);
GO

ALTER TABLE __mj_BizAppsOrders.SubscriptionEvent
    ADD CONSTRAINT FK_SubscriptionEvent_Subscription
    FOREIGN KEY (SubscriptionID) REFERENCES __mj_BizAppsOrders.Subscription(ID);
GO

ALTER TABLE __mj_BizAppsOrders.SubscriptionEvent
    ADD CONSTRAINT FK_SubscriptionEvent_RelatedPayment
    FOREIGN KEY (RelatedPaymentID) REFERENCES __mj_BizAppsOrders.Payment(ID);
GO

ALTER TABLE __mj_BizAppsOrders.SubscriptionEvent
    ADD CONSTRAINT FK_SubscriptionEvent_RelatedOrder
    FOREIGN KEY (RelatedOrderID) REFERENCES __mj_BizAppsOrders.[Order](ID);
GO

ALTER TABLE __mj_BizAppsOrders.RevRecScheduleLine
    ADD CONSTRAINT FK_RevRecScheduleLine_Schedule
    FOREIGN KEY (ScheduleID) REFERENCES __mj_BizAppsOrders.RevenueRecognitionSchedule(ID);
GO

-- The deliberate OrderLine ↔ Subscription pair (deferred from S1 so both are real FKs)
ALTER TABLE __mj_BizAppsOrders.OrderLine
    ADD CONSTRAINT FK_OrderLine_Subscription
    FOREIGN KEY (SubscriptionID) REFERENCES __mj_BizAppsOrders.Subscription(ID);
GO

ALTER TABLE __mj_BizAppsOrders.OrderLine
    ADD CONSTRAINT FK_OrderLine_RevRecSchedule
    FOREIGN KEY (RevenueRecognitionScheduleID) REFERENCES __mj_BizAppsOrders.RevenueRecognitionSchedule(ID);
GO

-- Catalog depth parity wave (S5)
ALTER TABLE __mj_BizAppsOrders.Product
    ADD CONSTRAINT FK_Product_OwningCompany
    FOREIGN KEY (OwningCompanyID) REFERENCES __mj.Company(ID);
GO

ALTER TABLE __mj_BizAppsOrders.Product
    ADD CONSTRAINT FK_Product_SuccessorProduct
    FOREIGN KEY (SuccessorProductID) REFERENCES __mj_BizAppsOrders.Product(ID);
GO

ALTER TABLE __mj_BizAppsOrders.ProductBundleItem
    ADD CONSTRAINT FK_ProductBundleItem_BundleProduct
    FOREIGN KEY (BundleProductID) REFERENCES __mj_BizAppsOrders.Product(ID);
GO

ALTER TABLE __mj_BizAppsOrders.ProductBundleItem
    ADD CONSTRAINT FK_ProductBundleItem_ComponentProduct
    FOREIGN KEY (ComponentProductID) REFERENCES __mj_BizAppsOrders.Product(ID);
GO

ALTER TABLE __mj_BizAppsOrders.ProductPerformanceObligation
    ADD CONSTRAINT FK_PPO_Product
    FOREIGN KEY (ProductID) REFERENCES __mj_BizAppsOrders.Product(ID);
GO

ALTER TABLE __mj_BizAppsOrders.ProductEntitlement
    ADD CONSTRAINT FK_ProductEntitlement_Product
    FOREIGN KEY (ProductID) REFERENCES __mj_BizAppsOrders.Product(ID);
GO

ALTER TABLE __mj_BizAppsOrders.EntitlementGrant
    ADD CONSTRAINT FK_EntitlementGrant_ProductEntitlement
    FOREIGN KEY (ProductEntitlementID) REFERENCES __mj_BizAppsOrders.ProductEntitlement(ID);
GO

ALTER TABLE __mj_BizAppsOrders.EntitlementGrant
    ADD CONSTRAINT FK_EntitlementGrant_OrderLine
    FOREIGN KEY (OrderLineID) REFERENCES __mj_BizAppsOrders.OrderLine(ID);
GO

ALTER TABLE __mj_BizAppsOrders.EntitlementGrant
    ADD CONSTRAINT FK_EntitlementGrant_Subscription
    FOREIGN KEY (SubscriptionID) REFERENCES __mj_BizAppsOrders.Subscription(ID);
GO

-- IsA pairs: PK = parent PK (same UUID)
ALTER TABLE __mj_BizAppsOrders.EventProduct
    ADD CONSTRAINT FK_EventProduct_Product
    FOREIGN KEY (ID) REFERENCES __mj_BizAppsOrders.Product(ID);
GO

ALTER TABLE __mj_BizAppsOrders.EventOrderLine
    ADD CONSTRAINT FK_EventOrderLine_OrderLine
    FOREIGN KEY (ID) REFERENCES __mj_BizAppsOrders.OrderLine(ID);
GO

ALTER TABLE __mj_BizAppsOrders.StoredValueAccount
    ADD CONSTRAINT FK_StoredValueAccount_IssuingCompany
    FOREIGN KEY (IssuingCompanyID) REFERENCES __mj.Company(ID);
GO

ALTER TABLE __mj_BizAppsOrders.StoredValueAccount
    ADD CONSTRAINT FK_StoredValueAccount_IssuedFromOrderLine
    FOREIGN KEY (IssuedFromOrderLineID) REFERENCES __mj_BizAppsOrders.OrderLine(ID);
GO

ALTER TABLE __mj_BizAppsOrders.StoredValueTransaction
    ADD CONSTRAINT FK_StoredValueTransaction_Account
    FOREIGN KEY (StoredValueAccountID) REFERENCES __mj_BizAppsOrders.StoredValueAccount(ID);
GO

ALTER TABLE __mj_BizAppsOrders.StoredValueTransaction
    ADD CONSTRAINT FK_StoredValueTransaction_RelatedPayment
    FOREIGN KEY (RelatedPaymentID) REFERENCES __mj_BizAppsOrders.Payment(ID);
GO

ALTER TABLE __mj_BizAppsOrders.StoredValueTransaction
    ADD CONSTRAINT FK_StoredValueTransaction_RelatedOrder
    FOREIGN KEY (RelatedOrderID) REFERENCES __mj_BizAppsOrders.[Order](ID);
GO

ALTER TABLE __mj_BizAppsOrders.Payment
    ADD CONSTRAINT FK_Payment_StoredValueAccount
    FOREIGN KEY (StoredValueAccountID) REFERENCES __mj_BizAppsOrders.StoredValueAccount(ID);
GO

ALTER TABLE __mj_BizAppsOrders.OrderLineDimension
    ADD CONSTRAINT FK_OrderLineDimension_OrderLine
    FOREIGN KEY (OrderLineID) REFERENCES __mj_BizAppsOrders.OrderLine(ID);
GO

ALTER TABLE __mj_BizAppsOrders.ProductPrice
    ADD CONSTRAINT FK_ProductPrice_Product
    FOREIGN KEY (ProductID) REFERENCES __mj_BizAppsOrders.Product(ID);
GO

ALTER TABLE __mj_BizAppsOrders.ProductPrice
    ADD CONSTRAINT FK_ProductPrice_PriceList
    FOREIGN KEY (PriceListID) REFERENCES __mj_BizAppsOrders.PriceList(ID);
GO

ALTER TABLE __mj_BizAppsOrders.PriceTier
    ADD CONSTRAINT FK_PriceTier_ProductPrice
    FOREIGN KEY (ProductPriceID) REFERENCES __mj_BizAppsOrders.ProductPrice(ID);
GO

-- Sales rules + approvals (S6)
ALTER TABLE __mj_BizAppsOrders.SalesRule
    ADD CONSTRAINT FK_SalesRule_ApprovalRequiredRole
    FOREIGN KEY (ApprovalRequiredRoleID) REFERENCES __mj.[Role](ID);
GO

ALTER TABLE __mj_BizAppsOrders.SalesAuthority
    ADD CONSTRAINT FK_SalesAuthority_SalesRepUser
    FOREIGN KEY (SalesRepUserID) REFERENCES __mj.[User](ID);
GO

-- =============================================================================
-- 5. TRIGGERS — DB-level enforcement of master-plan financial invariants
--    (schema action plan §6.1; house pattern per accounting's locked-JE triggers,
--    Marcelo 2026-07-11 directive). Workflow rules (transition matrix, totals,
--    cross-field validation) stay in the entity server — these guard only the
--    invariants that must hold even against raw SQL.
-- =============================================================================

---------------------------------------------------------------------------
-- 5.1 trg_Order_JournalEntryIDImmutable — REMOVED (MOD-15, Amith 2026-07-21).
--     The Order no longer carries a JournalEntryID: each line books its OWN journal entry, so the
--     booking link + its NULL→value-once immutability moved to OrderLine.JournalEntryID (enforced in
--     trg_OrderLine_ImmutableAfterConfirm below). The order's "journal entry" is the virtual
--     aggregate of its lines' JEs. (THROW code 51001 retired.)
---------------------------------------------------------------------------

---------------------------------------------------------------------------
-- 5.2 trg_OrderLine_ImmutableAfterConfirm
--     Booked lines must not change under the journal entry: once the parent
--     order is Confirmed or beyond, the financial columns (ProductID, Quantity,
--     UnitPrice, DiscountPct, LineTotalNet, LineTax, LineTotalGross) are frozen
--     and lines cannot be DELETEd. FulfillmentStatus is the deliberate carve-out
--     (the Fulfiller role flips it per line, UPD-3/F1.6); descriptive fields stay
--     editable. Corrections go through reversal orders (MOD-7 / BO-D10).
--     Voided is reachable only from Draft/Quoted, so 'Confirmed or beyond'
--     = Confirmed | Posted | Fulfilled.
---------------------------------------------------------------------------
CREATE TRIGGER __mj_BizAppsOrders.trg_OrderLine_ImmutableAfterConfirm
ON __mj_BizAppsOrders.OrderLine
AFTER UPDATE, DELETE
AS
BEGIN
    SET NOCOUNT ON;

    -- DELETE: block if any deleted line belongs to a Confirmed+ order
    IF NOT EXISTS (SELECT 1 FROM inserted)
       AND EXISTS (
           SELECT 1
           FROM deleted d
           JOIN __mj_BizAppsOrders.[Order] o ON o.ID = d.OrderID
           WHERE o.Status IN ('Confirmed','Posted','Fulfilled')
       )
    BEGIN
        ROLLBACK TRANSACTION;
        THROW 51002, 'OrderLine cannot be deleted once its order is Confirmed (the line is booked under a journal entry). Use a reversal order.', 1;
    END;

    -- UPDATE: block changes to the frozen financial columns on lines of Confirmed+ orders
    IF EXISTS (
        SELECT 1
        FROM deleted d
        JOIN inserted i ON i.ID = d.ID
        JOIN __mj_BizAppsOrders.[Order] o ON o.ID = d.OrderID
        WHERE o.Status IN ('Confirmed','Posted','Fulfilled')
          AND (
            i.ProductID      <> d.ProductID      OR
            i.Quantity       <> d.Quantity       OR
            i.UnitPrice      <> d.UnitPrice      OR
            i.DiscountPct    <> d.DiscountPct    OR
            i.LineTax        <> d.LineTax        OR
            ISNULL(i.LineTotalNet,   0) <> ISNULL(d.LineTotalNet,   0) OR
            ISNULL(i.LineTotalGross, 0) <> ISNULL(d.LineTotalGross, 0)
          )
    )
    BEGIN
        ROLLBACK TRANSACTION;
        THROW 51003, 'OrderLine financial fields (ProductID/Quantity/UnitPrice/DiscountPct/LineTotalNet/LineTax/LineTotalGross) are frozen once the order is Confirmed. Use a reversal order.', 1;
    END;

    -- JournalEntryID (MOD-15): the per-line booking record — NULL→value once, never cleared or
    -- replaced (any status). Set when the line's JE is booked at Confirm. Corrections go through a
    -- reversal order, not by re-pointing the booked entry. (Mirrors the retired Order-level rule.)
    IF EXISTS (
        SELECT 1
        FROM deleted d
        JOIN inserted i ON i.ID = d.ID
        WHERE d.JournalEntryID IS NOT NULL
          AND (i.JournalEntryID IS NULL OR i.JournalEntryID <> d.JournalEntryID)
    )
    BEGIN
        ROLLBACK TRANSACTION;
        THROW 51008, 'OrderLine.JournalEntryID cannot be cleared or replaced once set. Corrections happen via a reversal order, not by re-pointing the booked journal entry.', 1;
    END;
END;
GO

---------------------------------------------------------------------------
-- 5.3 trg_Payment_ImmutableAfterCapture (S2 — BO-D14)
--     Once a payment reaches Captured (or beyond: Refunded/Disputed), its
--     financial identity (Amount, ProcessingFeeAmount, NetAmount, Method,
--     PaymentDate, ReceivingCompanyID, CustomerOrganizationID) is frozen and
--     the row cannot be DELETEd. Status may still advance (Captured→Refunded/
--     Disputed) and provider artifacts (ProviderRefundID) may land. The
--     JournalEntryID booking record follows the Order rule: NULL→value once,
--     never cleared or replaced. Corrections happen via a reversal Payment.
---------------------------------------------------------------------------
CREATE TRIGGER __mj_BizAppsOrders.trg_Payment_ImmutableAfterCapture
ON __mj_BizAppsOrders.Payment
AFTER UPDATE, DELETE
AS
BEGIN
    SET NOCOUNT ON;

    -- DELETE: block once captured+ (Pending/Failed payments may be deleted)
    IF NOT EXISTS (SELECT 1 FROM inserted)
       AND EXISTS (SELECT 1 FROM deleted WHERE Status IN ('Captured','Refunded','Disputed'))
    BEGIN
        ROLLBACK TRANSACTION;
        THROW 51004, 'Payment cannot be deleted once Captured. Use a reversal payment (Refund/Chargeback) instead.', 1;
    END;

    -- UPDATE: frozen financial fields once the PREVIOUS status was Captured+
    -- (the capture transition itself may set them in the same statement).
    IF EXISTS (
        SELECT 1
        FROM deleted d
        JOIN inserted i ON i.ID = d.ID
        WHERE d.Status IN ('Captured','Refunded','Disputed')
          AND (
            i.Amount               <> d.Amount               OR
            i.ProcessingFeeAmount  <> d.ProcessingFeeAmount  OR
            ISNULL(i.NetAmount, 0) <> ISNULL(d.NetAmount, 0) OR
            i.Method               <> d.Method               OR
            i.PaymentDate          <> d.PaymentDate          OR
            i.ReceivingCompanyID   <> d.ReceivingCompanyID   OR
            ISNULL(i.CustomerOrganizationID, '00000000-0000-0000-0000-000000000000') <> ISNULL(d.CustomerOrganizationID, '00000000-0000-0000-0000-000000000000')
          )
    )
    BEGIN
        ROLLBACK TRANSACTION;
        THROW 51005, 'Payment financial fields (Amount/Fees/Method/PaymentDate/ReceivingCompanyID/Customer) are frozen once Captured. Use a reversal payment.', 1;
    END;

    -- JournalEntryID: never cleared or replaced once set (any status)
    IF EXISTS (
        SELECT 1
        FROM deleted d
        JOIN inserted i ON i.ID = d.ID
        WHERE d.JournalEntryID IS NOT NULL
          AND (i.JournalEntryID IS NULL OR i.JournalEntryID <> d.JournalEntryID)
    )
    BEGIN
        ROLLBACK TRANSACTION;
        THROW 51006, 'Payment.JournalEntryID cannot be cleared or replaced once set. Corrections happen via a reversal payment.', 1;
    END;

    -- Status may not regress out of a terminal/locked state
    IF EXISTS (
        SELECT 1
        FROM deleted d
        JOIN inserted i ON i.ID = d.ID
        WHERE (d.Status = 'Captured'  AND i.Status IN ('Pending','Failed'))
           OR (d.Status = 'Refunded'  AND i.Status <> 'Refunded')
           OR (d.Status = 'Disputed'  AND i.Status NOT IN ('Disputed','Refunded'))
    )
    BEGIN
        ROLLBACK TRANSACTION;
        THROW 51007, 'Payment.Status cannot regress (Captured may only advance to Refunded/Disputed; Refunded is terminal).', 1;
    END;
END;
GO

-- =============================================================================
-- 6. EXTENDED PROPERTIES (MS_Description — CodeGen turns these into field docs).
--    Skipped for PK (ID) and FK columns, which CodeGen documents automatically.
-- =============================================================================

-- ProductType
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Classifies products (e.g. Physical Good, Service, Subscription).', @level0type=N'SCHEMA', @level0name=N'__mj_BizAppsOrders', @level1type=N'TABLE', @level1name=N'ProductType';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Display name of the product type. Unique.', @level0type=N'SCHEMA', @level0name=N'__mj_BizAppsOrders', @level1type=N'TABLE', @level1name=N'ProductType', @level2type=N'COLUMN', @level2name=N'Name';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Optional description of the product type.', @level0type=N'SCHEMA', @level0name=N'__mj_BizAppsOrders', @level1type=N'TABLE', @level1name=N'ProductType', @level2type=N'COLUMN', @level2name=N'Description';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Whether this type is active and selectable.', @level0type=N'SCHEMA', @level0name=N'__mj_BizAppsOrders', @level1type=N'TABLE', @level1name=N'ProductType', @level2type=N'COLUMN', @level2name=N'IsActive';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'When 1, orders containing products of this type hold at Posted until a fulfiller marks every such line Fulfilled; when no line requires fulfillment the order auto-advances to Fulfilled.', @level0type=N'SCHEMA', @level0name=N'__mj_BizAppsOrders', @level1type=N'TABLE', @level1name=N'ProductType', @level2type=N'COLUMN', @level2name=N'RequiresFulfillment';
GO

-- ProductCategory
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Hierarchical grouping of products; the account resolver walks the ParentID tree upward.', @level0type=N'SCHEMA', @level0name=N'__mj_BizAppsOrders', @level1type=N'TABLE', @level1name=N'ProductCategory';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Display name of the category.', @level0type=N'SCHEMA', @level0name=N'__mj_BizAppsOrders', @level1type=N'TABLE', @level1name=N'ProductCategory', @level2type=N'COLUMN', @level2name=N'Name';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Optional description of the category.', @level0type=N'SCHEMA', @level0name=N'__mj_BizAppsOrders', @level1type=N'TABLE', @level1name=N'ProductCategory', @level2type=N'COLUMN', @level2name=N'Description';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Whether this category is active and selectable.', @level0type=N'SCHEMA', @level0name=N'__mj_BizAppsOrders', @level1type=N'TABLE', @level1name=N'ProductCategory', @level2type=N'COLUMN', @level2name=N'IsActive';
GO

-- Product
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'A catalog item that can be ordered. GL accounts are NOT stored here — accounting''s GLAccountLink points at Product rows (role-mapped, date-effective).', @level0type=N'SCHEMA', @level0name=N'__mj_BizAppsOrders', @level1type=N'TABLE', @level1name=N'Product';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Display name of the product.', @level0type=N'SCHEMA', @level0name=N'__mj_BizAppsOrders', @level1type=N'TABLE', @level1name=N'Product', @level2type=N'COLUMN', @level2name=N'Name';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Immediate (Dr AR / Cr Sales) or Deferred (Dr AR / Cr Deferred Revenue). Drives the credit side of the order-booking journal entry.', @level0type=N'SCHEMA', @level0name=N'__mj_BizAppsOrders', @level1type=N'TABLE', @level1name=N'Product', @level2type=N'COLUMN', @level2name=N'RevenueRecognitionType';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Optional description of the product.', @level0type=N'SCHEMA', @level0name=N'__mj_BizAppsOrders', @level1type=N'TABLE', @level1name=N'Product', @level2type=N'COLUMN', @level2name=N'Description';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Whether this product is active and orderable.', @level0type=N'SCHEMA', @level0name=N'__mj_BizAppsOrders', @level1type=N'TABLE', @level1name=N'Product', @level2type=N'COLUMN', @level2name=N'IsActive';
GO

-- Order
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'An order header. On the FIRST transition to Confirmed, a balanced journal entry is booked into BizApps Accounting. No CompanyID (multi-company via each line''s resolved GLAccount.CompanyID); no currency (FX deferred v1).', @level0type=N'SCHEMA', @level0name=N'__mj_BizAppsOrders', @level1type=N'TABLE', @level1name=N'Order';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Human-readable order identifier. Unique.', @level0type=N'SCHEMA', @level0name=N'__mj_BizAppsOrders', @level1type=N'TABLE', @level1name=N'Order', @level2type=N'COLUMN', @level2name=N'OrderNumber';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Effective date of the order; used as the journal entry EffectiveDate and the as-of date for GL-account link resolution.', @level0type=N'SCHEMA', @level0name=N'__mj_BizAppsOrders', @level1type=N'TABLE', @level1name=N'Order', @level2type=N'COLUMN', @level2name=N'OrderDate';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Draft | Quoted | Confirmed | Posted | Fulfilled | Voided. Voided is reachable only from Draft/Quoted; the JE fires once on the first Confirmed.', @level0type=N'SCHEMA', @level0name=N'__mj_BizAppsOrders', @level1type=N'TABLE', @level1name=N'Order', @level2type=N'COLUMN', @level2name=N'Status';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Soft reference (no FK) to __mj_BizAppsCommon.Organization — the customer. Nullable.', @level0type=N'SCHEMA', @level0name=N'__mj_BizAppsOrders', @level1type=N'TABLE', @level1name=N'Order', @level2type=N'COLUMN', @level2name=N'CustomerOrganizationID';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Optional free-text description / memo for the order.', @level0type=N'SCHEMA', @level0name=N'__mj_BizAppsOrders', @level1type=N'TABLE', @level1name=N'Order', @level2type=N'COLUMN', @level2name=N'Description';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Soft reference (no FK yet, MOD-15) to the __mj_BizAppsAccounting.JournalEntry booked for THIS line at Confirm. NULL until booked; NULL->value once, never cleared or replaced (trigger). The order''s journal entry is the aggregate of its lines'' JEs.', @level0type=N'SCHEMA', @level0name=N'__mj_BizAppsOrders', @level1type=N'TABLE', @level1name=N'OrderLine', @level2type=N'COLUMN', @level2name=N'JournalEntryID';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'UTC timestamp of the first transition to Confirmed.', @level0type=N'SCHEMA', @level0name=N'__mj_BizAppsOrders', @level1type=N'TABLE', @level1name=N'Order', @level2type=N'COLUMN', @level2name=N'ConfirmedAt';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Sale | Return | Cancellation | Amendment | CreditMemoOrder. Non-Sale types are the correction/reversal document family (BO-D9/D15).', @level0type=N'SCHEMA', @level0name=N'__mj_BizAppsOrders', @level1type=N'TABLE', @level1name=N'Order', @level2type=N'COLUMN', @level2name=N'OrderType';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Soft reference (no FK) to __mj_BizAppsCommon.Person — the buyer/contact person at the customer organization. Nullable.', @level0type=N'SCHEMA', @level0name=N'__mj_BizAppsOrders', @level1type=N'TABLE', @level1name=N'Order', @level2type=N'COLUMN', @level2name=N'CustomerPersonID';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Soft reference (no FK) to __mj_BizAppsCommon.Address — the billing address for this order/invoice. Nullable.', @level0type=N'SCHEMA', @level0name=N'__mj_BizAppsOrders', @level1type=N'TABLE', @level1name=N'Order', @level2type=N'COLUMN', @level2name=N'BillToAddressID';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Soft reference (no FK) to __mj_BizAppsCommon.Address — the shipping/service address; drives tax jurisdiction when tax lands. Nullable.', @level0type=N'SCHEMA', @level0name=N'__mj_BizAppsOrders', @level1type=N'TABLE', @level1name=N'Order', @level2type=N'COLUMN', @level2name=N'ShipToAddressID';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Engine-materialized order total = SUM(OrderLine.LineTotalGross). Never user-entered; frozen after Confirm.', @level0type=N'SCHEMA', @level0name=N'__mj_BizAppsOrders', @level1type=N'TABLE', @level1name=N'Order', @level2type=N'COLUMN', @level2name=N'TotalGross';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Engine-materialized total cash applied to this order = SUM(posted PaymentLine.Amount). Never user-entered.', @level0type=N'SCHEMA', @level0name=N'__mj_BizAppsOrders', @level1type=N'TABLE', @level1name=N'Order', @level2type=N'COLUMN', @level2name=N'AmountPaid';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Engine-materialized open balance = TotalGross - AmountPaid. Negative means a credit memo owed to the customer.', @level0type=N'SCHEMA', @level0name=N'__mj_BizAppsOrders', @level1type=N'TABLE', @level1name=N'Order', @level2type=N'COLUMN', @level2name=N'Balance';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Payment due date, derived at Confirm/Post from PaymentTermsType.NetDays (posting date + net days) when not manually supplied. Editable override.', @level0type=N'SCHEMA', @level0name=N'__mj_BizAppsOrders', @level1type=N'TABLE', @level1name=N'Order', @level2type=N'COLUMN', @level2name=N'DueDate';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Unpaid | PartiallyPaid | Paid | Overdue | WrittenOff. Engine-derived from AmountPaid vs TotalGross; Overdue is time-derived in views/UI, WrittenOff is an explicit action.', @level0type=N'SCHEMA', @level0name=N'__mj_BizAppsOrders', @level1type=N'TABLE', @level1name=N'Order', @level2type=N'COLUMN', @level2name=N'PaymentStatus';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'External document/invoice number for downstream systems (e.g. bill.com sync, UPD-1). Free-form; may equal OrderNumber. Not unique pending the dual-numbering decision.', @level0type=N'SCHEMA', @level0name=N'__mj_BizAppsOrders', @level1type=N'TABLE', @level1name=N'Order', @level2type=N'COLUMN', @level2name=N'ExternalDocumentNumber';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'UTC timestamp of the transition to Posted — the issue/tax-point date of the invoice.', @level0type=N'SCHEMA', @level0name=N'__mj_BizAppsOrders', @level1type=N'TABLE', @level1name=N'Order', @level2type=N'COLUMN', @level2name=N'PostedAt';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Reason this order reverses another (required by validation when ReversesOrderID is set).', @level0type=N'SCHEMA', @level0name=N'__mj_BizAppsOrders', @level1type=N'TABLE', @level1name=N'Order', @level2type=N'COLUMN', @level2name=N'ReversalReason';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Soft reference (no FK) to the governing contract record (contracts envelope, BO-D21; ownership pending the AIDP-contracts decision). Nullable.', @level0type=N'SCHEMA', @level0name=N'__mj_BizAppsOrders', @level1type=N'TABLE', @level1name=N'Order', @level2type=N'COLUMN', @level2name=N'ContractID';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Customer-requested delivery/service date. Informational.', @level0type=N'SCHEMA', @level0name=N'__mj_BizAppsOrders', @level1type=N'TABLE', @level1name=N'Order', @level2type=N'COLUMN', @level2name=N'RequestedDeliveryDate';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Soft reference (no FK) to the __mj_BizAppsTasks Task raised when a sales rule blocked Confirm (BO-D17). Convenience pointer; Task Links carry the authoritative linkage.', @level0type=N'SCHEMA', @level0name=N'__mj_BizAppsOrders', @level1type=N'TABLE', @level1name=N'Order', @level2type=N'COLUMN', @level2name=N'ApprovalTaskID';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Internal notes on the order (Description is the customer-facing memo).', @level0type=N'SCHEMA', @level0name=N'__mj_BizAppsOrders', @level1type=N'TABLE', @level1name=N'Order', @level2type=N'COLUMN', @level2name=N'Notes';
GO

-- OrderLine
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'A line item on an order. Line amount = Quantity * UnitPrice.', @level0type=N'SCHEMA', @level0name=N'__mj_BizAppsOrders', @level1type=N'TABLE', @level1name=N'OrderLine';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Order-scoped line sequence (1..n), unique within the order.', @level0type=N'SCHEMA', @level0name=N'__mj_BizAppsOrders', @level1type=N'TABLE', @level1name=N'OrderLine', @level2type=N'COLUMN', @level2name=N'LineNumber';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Quantity ordered (> 0).', @level0type=N'SCHEMA', @level0name=N'__mj_BizAppsOrders', @level1type=N'TABLE', @level1name=N'OrderLine', @level2type=N'COLUMN', @level2name=N'Quantity';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Unit price (>= 0). Multiplied by Quantity to get the line amount booked to revenue.', @level0type=N'SCHEMA', @level0name=N'__mj_BizAppsOrders', @level1type=N'TABLE', @level1name=N'OrderLine', @level2type=N'COLUMN', @level2name=N'UnitPrice';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Optional free-text description for the line.', @level0type=N'SCHEMA', @level0name=N'__mj_BizAppsOrders', @level1type=N'TABLE', @level1name=N'OrderLine', @level2type=N'COLUMN', @level2name=N'Description';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Line discount as a fraction (0 to 1; e.g. 0.10 = ten percent off). Applied in LineTotalNet = Quantity * UnitPrice * (1 - DiscountPct).', @level0type=N'SCHEMA', @level0name=N'__mj_BizAppsOrders', @level1type=N'TABLE', @level1name=N'OrderLine', @level2type=N'COLUMN', @level2name=N'DiscountPct';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Engine-computed stored net line total = Quantity * UnitPrice * (1 - DiscountPct). Frozen after Confirm.', @level0type=N'SCHEMA', @level0name=N'__mj_BizAppsOrders', @level1type=N'TABLE', @level1name=N'OrderLine', @level2type=N'COLUMN', @level2name=N'LineTotalNet';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Tax amount for this line. 0 until the tax subsystem lands (O4).', @level0type=N'SCHEMA', @level0name=N'__mj_BizAppsOrders', @level1type=N'TABLE', @level1name=N'OrderLine', @level2type=N'COLUMN', @level2name=N'LineTax';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Engine-computed stored gross line total = LineTotalNet + LineTax. Frozen after Confirm.', @level0type=N'SCHEMA', @level0name=N'__mj_BizAppsOrders', @level1type=N'TABLE', @level1name=N'OrderLine', @level2type=N'COLUMN', @level2name=N'LineTotalGross';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Start of the service period for Deferred products (UPD-2 service-period recognition shape). Nullable.', @level0type=N'SCHEMA', @level0name=N'__mj_BizAppsOrders', @level1type=N'TABLE', @level1name=N'OrderLine', @level2type=N'COLUMN', @level2name=N'ServicePeriodStart';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'End of the service period for Deferred products (>= ServicePeriodStart). Nullable.', @level0type=N'SCHEMA', @level0name=N'__mj_BizAppsOrders', @level1type=N'TABLE', @level1name=N'OrderLine', @level2type=N'COLUMN', @level2name=N'ServicePeriodEnd';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Pending | Fulfilled | Returned. NULL when the product type does not require fulfillment. The one line column a Fulfiller may change on Confirmed+ orders (trigger carve-out).', @level0type=N'SCHEMA', @level0name=N'__mj_BizAppsOrders', @level1type=N'TABLE', @level1name=N'OrderLine', @level2type=N'COLUMN', @level2name=N'FulfillmentStatus';
GO

-- PaymentTermsType
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Payment terms lookup (Net 30, Due on Receipt, ...). Owned by Orders; NetDays derives Order.DueDate from the posting date. Seed rows via metadata sync.', @level0type=N'SCHEMA', @level0name=N'__mj_BizAppsOrders', @level1type=N'TABLE', @level1name=N'PaymentTermsType';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Stable machine code (Net30, DueOnReceipt, Prepaid, ...). Unique.', @level0type=N'SCHEMA', @level0name=N'__mj_BizAppsOrders', @level1type=N'TABLE', @level1name=N'PaymentTermsType', @level2type=N'COLUMN', @level2name=N'Code';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Display name of the payment terms.', @level0type=N'SCHEMA', @level0name=N'__mj_BizAppsOrders', @level1type=N'TABLE', @level1name=N'PaymentTermsType', @level2type=N'COLUMN', @level2name=N'Name';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Days from the posting date to DueDate (0 = due on receipt).', @level0type=N'SCHEMA', @level0name=N'__mj_BizAppsOrders', @level1type=N'TABLE', @level1name=N'PaymentTermsType', @level2type=N'COLUMN', @level2name=N'NetDays';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Optional description of the terms.', @level0type=N'SCHEMA', @level0name=N'__mj_BizAppsOrders', @level1type=N'TABLE', @level1name=N'PaymentTermsType', @level2type=N'COLUMN', @level2name=N'Description';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Whether these terms are active and selectable.', @level0type=N'SCHEMA', @level0name=N'__mj_BizAppsOrders', @level1type=N'TABLE', @level1name=N'PaymentTermsType', @level2type=N'COLUMN', @level2name=N'IsActive';
GO

-- OrderSequence
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Global singleton counter (ID=1) minting gap-conscious ORD-{seq} order numbers. Consumed only by the entity server.', @level0type=N'SCHEMA', @level0name=N'__mj_BizAppsOrders', @level1type=N'TABLE', @level1name=N'OrderSequence';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'The next order sequence number to assign.', @level0type=N'SCHEMA', @level0name=N'__mj_BizAppsOrders', @level1type=N'TABLE', @level1name=N'OrderSequence', @level2type=N'COLUMN', @level2name=N'NextSequenceNumber';
GO

-- PaymentProvider
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'A configured payment-processing account (Stripe account, or the built-in Manual provider) owned by one company.', @level0type=N'SCHEMA', @level0name=N'__mj_BizAppsOrders', @level1type=N'TABLE', @level1name=N'PaymentProvider';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Stripe | Manual. Widens as additional processors land.', @level0type=N'SCHEMA', @level0name=N'__mj_BizAppsOrders', @level1type=N'TABLE', @level1name=N'PaymentProvider', @level2type=N'COLUMN', @level2name=N'ProviderType';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Display name of this provider account.', @level0type=N'SCHEMA', @level0name=N'__mj_BizAppsOrders', @level1type=N'TABLE', @level1name=N'PaymentProvider', @level2type=N'COLUMN', @level2name=N'Name';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'MJ Credentials engine key referencing the provider credentials. NEVER a secret value at rest.', @level0type=N'SCHEMA', @level0name=N'__mj_BizAppsOrders', @level1type=N'TABLE', @level1name=N'PaymentProvider', @level2type=N'COLUMN', @level2name=N'CredentialsRef';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Whether this account points at the provider''s live environment (vs test/sandbox).', @level0type=N'SCHEMA', @level0name=N'__mj_BizAppsOrders', @level1type=N'TABLE', @level1name=N'PaymentProvider', @level2type=N'COLUMN', @level2name=N'IsLiveMode';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Whether this provider account is active.', @level0type=N'SCHEMA', @level0name=N'__mj_BizAppsOrders', @level1type=N'TABLE', @level1name=N'PaymentProvider', @level2type=N'COLUMN', @level2name=N'IsActive';
GO

-- CustomerPaymentMethod
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'A stored payment method token for a customer (BO-D46). Provider token references only — never card data.', @level0type=N'SCHEMA', @level0name=N'__mj_BizAppsOrders', @level1type=N'TABLE', @level1name=N'CustomerPaymentMethod';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Soft reference (no FK) to __mj_BizAppsCommon.Organization — the customer who owns this method.', @level0type=N'SCHEMA', @level0name=N'__mj_BizAppsOrders', @level1type=N'TABLE', @level1name=N'CustomerPaymentMethod', @level2type=N'COLUMN', @level2name=N'CustomerOrganizationID';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Provider-side customer identifier (e.g. Stripe cus_...).', @level0type=N'SCHEMA', @level0name=N'__mj_BizAppsOrders', @level1type=N'TABLE', @level1name=N'CustomerPaymentMethod', @level2type=N'COLUMN', @level2name=N'ProviderCustomerID';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Provider-side payment method token (e.g. Stripe pm_...).', @level0type=N'SCHEMA', @level0name=N'__mj_BizAppsOrders', @level1type=N'TABLE', @level1name=N'CustomerPaymentMethod', @level2type=N'COLUMN', @level2name=N'ProviderPaymentMethodID';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Kind of method (card, us_bank_account, ...). Provider vocabulary, informational.', @level0type=N'SCHEMA', @level0name=N'__mj_BizAppsOrders', @level1type=N'TABLE', @level1name=N'CustomerPaymentMethod', @level2type=N'COLUMN', @level2name=N'MethodType';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Card brand for display (Visa, Mastercard, ...).', @level0type=N'SCHEMA', @level0name=N'__mj_BizAppsOrders', @level1type=N'TABLE', @level1name=N'CustomerPaymentMethod', @level2type=N'COLUMN', @level2name=N'Brand';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Last four digits for display. Never more.', @level0type=N'SCHEMA', @level0name=N'__mj_BizAppsOrders', @level1type=N'TABLE', @level1name=N'CustomerPaymentMethod', @level2type=N'COLUMN', @level2name=N'Last4';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Card expiry month (1-12) for display/expiry warnings.', @level0type=N'SCHEMA', @level0name=N'__mj_BizAppsOrders', @level1type=N'TABLE', @level1name=N'CustomerPaymentMethod', @level2type=N'COLUMN', @level2name=N'ExpiryMonth';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Card expiry year for display/expiry warnings.', @level0type=N'SCHEMA', @level0name=N'__mj_BizAppsOrders', @level1type=N'TABLE', @level1name=N'CustomerPaymentMethod', @level2type=N'COLUMN', @level2name=N'ExpiryYear';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Whether this is the customer''s default method for charge-on-file.', @level0type=N'SCHEMA', @level0name=N'__mj_BizAppsOrders', @level1type=N'TABLE', @level1name=N'CustomerPaymentMethod', @level2type=N'COLUMN', @level2name=N'IsDefault';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Whether this method is active/usable.', @level0type=N'SCHEMA', @level0name=N'__mj_BizAppsOrders', @level1type=N'TABLE', @level1name=N'CustomerPaymentMethod', @level2type=N'COLUMN', @level2name=N'IsActive';
GO

-- PaymentIntent
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Provider-side collection state (BO-D26; Stripe-shaped). The Manual provider skips intents entirely.', @level0type=N'SCHEMA', @level0name=N'__mj_BizAppsOrders', @level1type=N'TABLE', @level1name=N'PaymentIntent';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Provider-side intent identifier (e.g. Stripe pi_...). Unique.', @level0type=N'SCHEMA', @level0name=N'__mj_BizAppsOrders', @level1type=N'TABLE', @level1name=N'PaymentIntent', @level2type=N'COLUMN', @level2name=N'ProviderIntentID';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'RequiresPayment | Processing | Succeeded | Canceled | Failed. Mirrors the provider lifecycle.', @level0type=N'SCHEMA', @level0name=N'__mj_BizAppsOrders', @level1type=N'TABLE', @level1name=N'PaymentIntent', @level2type=N'COLUMN', @level2name=N'Status';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Amount being collected.', @level0type=N'SCHEMA', @level0name=N'__mj_BizAppsOrders', @level1type=N'TABLE', @level1name=N'PaymentIntent', @level2type=N'COLUMN', @level2name=N'Amount';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Soft reference (no FK) to __mj_BizAppsCommon.Organization — the paying customer.', @level0type=N'SCHEMA', @level0name=N'__mj_BizAppsOrders', @level1type=N'TABLE', @level1name=N'PaymentIntent', @level2type=N'COLUMN', @level2name=N'CustomerOrganizationID';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Last processed provider webhook event id — the idempotency key (unique when present).', @level0type=N'SCHEMA', @level0name=N'__mj_BizAppsOrders', @level1type=N'TABLE', @level1name=N'PaymentIntent', @level2type=N'COLUMN', @level2name=N'ProviderEventID';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'UTC timestamp of the last provider event applied to this intent.', @level0type=N'SCHEMA', @level0name=N'__mj_BizAppsOrders', @level1type=N'TABLE', @level1name=N'PaymentIntent', @level2type=N'COLUMN', @level2name=N'LastEventAt';
GO

-- Payment
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'A money movement: a customer receipt or a reversal (refund/chargeback/bank return). Booked to accounting at capture; applied to orders via PaymentLine.', @level0type=N'SCHEMA', @level0name=N'__mj_BizAppsOrders', @level1type=N'TABLE', @level1name=N'Payment';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Human-readable payment identifier (PAY-{seq}). Unique.', @level0type=N'SCHEMA', @level0name=N'__mj_BizAppsOrders', @level1type=N'TABLE', @level1name=N'Payment', @level2type=N'COLUMN', @level2name=N'PaymentNumber';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Soft reference (no FK) to __mj_BizAppsCommon.Organization — the payer. NULL only for anonymous/e-commerce edge cases.', @level0type=N'SCHEMA', @level0name=N'__mj_BizAppsOrders', @level1type=N'TABLE', @level1name=N'Payment', @level2type=N'COLUMN', @level2name=N'CustomerOrganizationID';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Date the money moved (bank date, not entry date).', @level0type=N'SCHEMA', @level0name=N'__mj_BizAppsOrders', @level1type=N'TABLE', @level1name=N'Payment', @level2type=N'COLUMN', @level2name=N'PaymentDate';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'CreditCard | ACH | Wire | Check | Cash | InternalTransfer | Refund | Chargeback | BankReturn. Reversal methods carry negative Amount.', @level0type=N'SCHEMA', @level0name=N'__mj_BizAppsOrders', @level1type=N'TABLE', @level1name=N'Payment', @level2type=N'COLUMN', @level2name=N'Method';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Gross amount received (negative for reversal methods).', @level0type=N'SCHEMA', @level0name=N'__mj_BizAppsOrders', @level1type=N'TABLE', @level1name=N'Payment', @level2type=N'COLUMN', @level2name=N'Amount';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Processor fee withheld from this payment.', @level0type=N'SCHEMA', @level0name=N'__mj_BizAppsOrders', @level1type=N'TABLE', @level1name=N'Payment', @level2type=N'COLUMN', @level2name=N'ProcessingFeeAmount';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Net cash = Amount - ProcessingFeeAmount (engine-computed, BO-D47).', @level0type=N'SCHEMA', @level0name=N'__mj_BizAppsOrders', @level1type=N'TABLE', @level1name=N'Payment', @level2type=N'COLUMN', @level2name=N'NetAmount';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Provider-side charge identifier (e.g. Stripe ch_...).', @level0type=N'SCHEMA', @level0name=N'__mj_BizAppsOrders', @level1type=N'TABLE', @level1name=N'Payment', @level2type=N'COLUMN', @level2name=N'ProviderChargeID';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Provider-side refund identifier when this payment is a provider refund.', @level0type=N'SCHEMA', @level0name=N'__mj_BizAppsOrders', @level1type=N'TABLE', @level1name=N'Payment', @level2type=N'COLUMN', @level2name=N'ProviderRefundID';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Reason this payment reverses another (required by validation when ReversesPaymentID is set).', @level0type=N'SCHEMA', @level0name=N'__mj_BizAppsOrders', @level1type=N'TABLE', @level1name=N'Payment', @level2type=N'COLUMN', @level2name=N'ReversalReason';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Pending | Captured | Failed | Refunded | Disputed. Financial fields freeze at Captured (DB trigger); corrections via reversal payments.', @level0type=N'SCHEMA', @level0name=N'__mj_BizAppsOrders', @level1type=N'TABLE', @level1name=N'Payment', @level2type=N'COLUMN', @level2name=N'Status';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Soft reference (no FK) to the __mj_BizAppsAccounting.JournalEntry booked at capture. Never cleared or replaced once set (trigger).', @level0type=N'SCHEMA', @level0name=N'__mj_BizAppsOrders', @level1type=N'TABLE', @level1name=N'Payment', @level2type=N'COLUMN', @level2name=N'JournalEntryID';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Customer-facing description / memo.', @level0type=N'SCHEMA', @level0name=N'__mj_BizAppsOrders', @level1type=N'TABLE', @level1name=N'Payment', @level2type=N'COLUMN', @level2name=N'Description';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Internal notes.', @level0type=N'SCHEMA', @level0name=N'__mj_BizAppsOrders', @level1type=N'TABLE', @level1name=N'Payment', @level2type=N'COLUMN', @level2name=N'Notes';
GO

-- PaymentLine
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Cash application junction (BO-D16/D45): how much of a payment settles which order (optionally which line). Negative Amount applies a credit memo.', @level0type=N'SCHEMA', @level0name=N'__mj_BizAppsOrders', @level1type=N'TABLE', @level1name=N'PaymentLine';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Amount of the payment applied to this order (<> 0; negative when applying a credit memo).', @level0type=N'SCHEMA', @level0name=N'__mj_BizAppsOrders', @level1type=N'TABLE', @level1name=N'PaymentLine', @level2type=N'COLUMN', @level2name=N'Amount';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'UTC timestamp when this application was made.', @level0type=N'SCHEMA', @level0name=N'__mj_BizAppsOrders', @level1type=N'TABLE', @level1name=N'PaymentLine', @level2type=N'COLUMN', @level2name=N'AllocatedAt';
GO

-- PaymentSequence
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Global singleton counter (ID=1) minting gap-conscious PAY-{seq} payment numbers. Consumed only by the entity server.', @level0type=N'SCHEMA', @level0name=N'__mj_BizAppsOrders', @level1type=N'TABLE', @level1name=N'PaymentSequence';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'The next payment sequence number to assign.', @level0type=N'SCHEMA', @level0name=N'__mj_BizAppsOrders', @level1type=N'TABLE', @level1name=N'PaymentSequence', @level2type=N'COLUMN', @level2name=N'NextSequenceNumber';
GO

-- Product (S3 additions)
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'For Deferred products: SingleDate (100 percent recognized on the event date) or ServicePeriod (spread over the line''s service dates). Robert''s two deferred shapes on their own axis (UPD-2).', @level0type=N'SCHEMA', @level0name=N'__mj_BizAppsOrders', @level1type=N'TABLE', @level1name=N'Product', @level2type=N'COLUMN', @level2name=N'DeferredRecognitionShape';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'None | Standard | Membership. Drives find-or-extend-or-create of a Subscription at order Confirm (BO-D40).', @level0type=N'SCHEMA', @level0name=N'__mj_BizAppsOrders', @level1type=N'TABLE', @level1name=N'Product', @level2type=N'COLUMN', @level2name=N'SubscriptionType';
GO

-- OrderLine (S3 additions)
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'The revenue recognition schedule this line carries (Deferred products). Each renewal order line carries its own schedule.', @level0type=N'SCHEMA', @level0name=N'__mj_BizAppsOrders', @level1type=N'TABLE', @level1name=N'OrderLine', @level2type=N'COLUMN', @level2name=N'RevenueRecognitionScheduleID';
GO

-- SubscriptionPlan
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Optional elaboration of a subscription product: billing cadence, price per cycle, trial (BO-D40). Simple memberships need no plan.', @level0type=N'SCHEMA', @level0name=N'__mj_BizAppsOrders', @level1type=N'TABLE', @level1name=N'SubscriptionPlan';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Display name of the plan.', @level0type=N'SCHEMA', @level0name=N'__mj_BizAppsOrders', @level1type=N'TABLE', @level1name=N'SubscriptionPlan', @level2type=N'COLUMN', @level2name=N'Name';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Monthly | Quarterly | Annual | Custom (CustomCycleDays).', @level0type=N'SCHEMA', @level0name=N'__mj_BizAppsOrders', @level1type=N'TABLE', @level1name=N'SubscriptionPlan', @level2type=N'COLUMN', @level2name=N'BillingCycle';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Cycle length in days when BillingCycle = Custom.', @level0type=N'SCHEMA', @level0name=N'__mj_BizAppsOrders', @level1type=N'TABLE', @level1name=N'SubscriptionPlan', @level2type=N'COLUMN', @level2name=N'CustomCycleDays';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Price per billing cycle. NULL = derive from the product/pricing engine.', @level0type=N'SCHEMA', @level0name=N'__mj_BizAppsOrders', @level1type=N'TABLE', @level1name=N'SubscriptionPlan', @level2type=N'COLUMN', @level2name=N'PricePerCycle';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Free-trial length in days (0 = none).', @level0type=N'SCHEMA', @level0name=N'__mj_BizAppsOrders', @level1type=N'TABLE', @level1name=N'SubscriptionPlan', @level2type=N'COLUMN', @level2name=N'TrialDays';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Whether this plan is active and selectable.', @level0type=N'SCHEMA', @level0name=N'__mj_BizAppsOrders', @level1type=N'TABLE', @level1name=N'SubscriptionPlan', @level2type=N'COLUMN', @level2name=N'IsActive';
GO

-- Subscription
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'A recurring (Product, Customer, Beneficiary) relationship born from an order line (BO-D39/D40). Renewal cycles spawn new Orders under it; schedules hang off order lines, not here.', @level0type=N'SCHEMA', @level0name=N'__mj_BizAppsOrders', @level1type=N'TABLE', @level1name=N'Subscription';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Human-readable subscription identifier. Unique.', @level0type=N'SCHEMA', @level0name=N'__mj_BizAppsOrders', @level1type=N'TABLE', @level1name=N'Subscription', @level2type=N'COLUMN', @level2name=N'SubscriptionNumber';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Soft reference (no FK) to __mj_BizAppsCommon.Organization — the paying customer.', @level0type=N'SCHEMA', @level0name=N'__mj_BizAppsOrders', @level1type=N'TABLE', @level1name=N'Subscription', @level2type=N'COLUMN', @level2name=N'CustomerOrganizationID';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Soft reference (no FK) to __mj_BizAppsCommon.Person — who benefits (the member/seat), when distinct from the payer (BO-D39).', @level0type=N'SCHEMA', @level0name=N'__mj_BizAppsOrders', @level1type=N'TABLE', @level1name=N'Subscription', @level2type=N'COLUMN', @level2name=N'BeneficiaryPersonID';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Active | Paused | Canceled | Migrated | Trialing.', @level0type=N'SCHEMA', @level0name=N'__mj_BizAppsOrders', @level1type=N'TABLE', @level1name=N'Subscription', @level2type=N'COLUMN', @level2name=N'Status';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Date the subscription began.', @level0type=N'SCHEMA', @level0name=N'__mj_BizAppsOrders', @level1type=N'TABLE', @level1name=N'Subscription', @level2type=N'COLUMN', @level2name=N'StartDate';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Start of the current paid-through period.', @level0type=N'SCHEMA', @level0name=N'__mj_BizAppsOrders', @level1type=N'TABLE', @level1name=N'Subscription', @level2type=N'COLUMN', @level2name=N'CurrentPeriodStart';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'End of the current paid-through period (renewal boundary).', @level0type=N'SCHEMA', @level0name=N'__mj_BizAppsOrders', @level1type=N'TABLE', @level1name=N'Subscription', @level2type=N'COLUMN', @level2name=N'CurrentPeriodEnd';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'When the trial ends (Trialing status).', @level0type=N'SCHEMA', @level0name=N'__mj_BizAppsOrders', @level1type=N'TABLE', @level1name=N'Subscription', @level2type=N'COLUMN', @level2name=N'TrialEndDate';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'UTC timestamp the cancellation was recorded.', @level0type=N'SCHEMA', @level0name=N'__mj_BizAppsOrders', @level1type=N'TABLE', @level1name=N'Subscription', @level2type=N'COLUMN', @level2name=N'CanceledAt';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Final service date after cancellation/migration.', @level0type=N'SCHEMA', @level0name=N'__mj_BizAppsOrders', @level1type=N'TABLE', @level1name=N'Subscription', @level2type=N'COLUMN', @level2name=N'EndDate';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Whether renewal orders spawn automatically (Jeremy: auto-renew flag).', @level0type=N'SCHEMA', @level0name=N'__mj_BizAppsOrders', @level1type=N'TABLE', @level1name=N'Subscription', @level2type=N'COLUMN', @level2name=N'AutoRenew';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'How many days before CurrentPeriodEnd the renewal order is raised (Jeremy: invoice about three months ahead).', @level0type=N'SCHEMA', @level0name=N'__mj_BizAppsOrders', @level1type=N'TABLE', @level1name=N'Subscription', @level2type=N'COLUMN', @level2name=N'RenewalLeadDays';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Provider-side subscription identifier (e.g. Stripe sub_...), when provider-billed.', @level0type=N'SCHEMA', @level0name=N'__mj_BizAppsOrders', @level1type=N'TABLE', @level1name=N'Subscription', @level2type=N'COLUMN', @level2name=N'ProviderSubscriptionID';
GO

-- SubscriptionEvent
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Immutable subscription lifecycle log (§4.4). One row per event; EventData carries the JSON payload.', @level0type=N'SCHEMA', @level0name=N'__mj_BizAppsOrders', @level1type=N'TABLE', @level1name=N'SubscriptionEvent';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'The lifecycle event kind (Created ... RenewalOrderSpawned).', @level0type=N'SCHEMA', @level0name=N'__mj_BizAppsOrders', @level1type=N'TABLE', @level1name=N'SubscriptionEvent', @level2type=N'COLUMN', @level2name=N'EventType';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'UTC timestamp the event occurred.', @level0type=N'SCHEMA', @level0name=N'__mj_BizAppsOrders', @level1type=N'TABLE', @level1name=N'SubscriptionEvent', @level2type=N'COLUMN', @level2name=N'OccurredAt';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'JSON event payload (provider webhook body or internal context).', @level0type=N'SCHEMA', @level0name=N'__mj_BizAppsOrders', @level1type=N'TABLE', @level1name=N'SubscriptionEvent', @level2type=N'COLUMN', @level2name=N'EventData';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Provider webhook event id — the idempotency key (unique when present).', @level0type=N'SCHEMA', @level0name=N'__mj_BizAppsOrders', @level1type=N'TABLE', @level1name=N'SubscriptionEvent', @level2type=N'COLUMN', @level2name=N'ProviderEventID';
GO

-- RevenueRecognitionSchedule
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Lightweight recognition computation source + MRR/ARR display (BO-D11). Owned by an order line; accounting''s dated ScheduledJournalEntry rows are the booked counterpart (accounting MOD-11).', @level0type=N'SCHEMA', @level0name=N'__mj_BizAppsOrders', @level1type=N'TABLE', @level1name=N'RevenueRecognitionSchedule';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'StraightLine (service-period spread) | SingleDate (100 percent on the event date) | Milestone | Custom.', @level0type=N'SCHEMA', @level0name=N'__mj_BizAppsOrders', @level1type=N'TABLE', @level1name=N'RevenueRecognitionSchedule', @level2type=N'COLUMN', @level2name=N'SchedulingMethod';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'First recognition date.', @level0type=N'SCHEMA', @level0name=N'__mj_BizAppsOrders', @level1type=N'TABLE', @level1name=N'RevenueRecognitionSchedule', @level2type=N'COLUMN', @level2name=N'StartDate';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Last recognition date.', @level0type=N'SCHEMA', @level0name=N'__mj_BizAppsOrders', @level1type=N'TABLE', @level1name=N'RevenueRecognitionSchedule', @level2type=N'COLUMN', @level2name=N'EndDate';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Total amount to recognize across all schedule lines.', @level0type=N'SCHEMA', @level0name=N'__mj_BizAppsOrders', @level1type=N'TABLE', @level1name=N'RevenueRecognitionSchedule', @level2type=N'COLUMN', @level2name=N'TotalAmount';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Amount recognized so far (engine-maintained).', @level0type=N'SCHEMA', @level0name=N'__mj_BizAppsOrders', @level1type=N'TABLE', @level1name=N'RevenueRecognitionSchedule', @level2type=N'COLUMN', @level2name=N'TotalRecognized';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Whether every line has been recognized.', @level0type=N'SCHEMA', @level0name=N'__mj_BizAppsOrders', @level1type=N'TABLE', @level1name=N'RevenueRecognitionSchedule', @level2type=N'COLUMN', @level2name=N'IsComplete';
GO

-- ProductType (S5 behavior fields)
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Stable machine code (Event, Membership, PhysicalGood, ...). Unique when present; seeded types carry codes.', @level0type=N'SCHEMA', @level0name=N'__mj_BizAppsOrders', @level1type=N'TABLE', @level1name=N'ProductType', @level2type=N'COLUMN', @level2name=N'Code';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Default recognition type stamped onto new products of this type (Immediate | Deferred).', @level0type=N'SCHEMA', @level0name=N'__mj_BizAppsOrders', @level1type=N'TABLE', @level1name=N'ProductType', @level2type=N'COLUMN', @level2name=N'DefaultRevenueRecognitionType';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Default taxability stamped onto new products of this type.', @level0type=N'SCHEMA', @level0name=N'__mj_BizAppsOrders', @level1type=N'TABLE', @level1name=N'ProductType', @level2type=N'COLUMN', @level2name=N'DefaultIsTaxable';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Whether products of this type bill on a recurring cadence (memberships, subscriptions, usage).', @level0type=N'SCHEMA', @level0name=N'__mj_BizAppsOrders', @level1type=N'TABLE', @level1name=N'ProductType', @level2type=N'COLUMN', @level2name=N'IsBillableRecurring';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'None | Standard | Membership — the subscription semantics stamped onto new products of this type (BO-D40).', @level0type=N'SCHEMA', @level0name=N'__mj_BizAppsOrders', @level1type=N'TABLE', @level1name=N'ProductType', @level2type=N'COLUMN', @level2name=N'DefaultSubscriptionType';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'MJ entity name of the IsA Product-level extension for this type (e.g. MJ_BizApps_Orders: Event Products). NULL = no extension (BO-D37).', @level0type=N'SCHEMA', @level0name=N'__mj_BizAppsOrders', @level1type=N'TABLE', @level1name=N'ProductType', @level2type=N'COLUMN', @level2name=N'ProductExtensionEntity';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'MJ entity name of the IsA OrderLine-level extension for this type (e.g. MJ_BizApps_Orders: Event Order Lines). NULL = no extension (BO-D37).', @level0type=N'SCHEMA', @level0name=N'__mj_BizAppsOrders', @level1type=N'TABLE', @level1name=N'ProductType', @level2type=N'COLUMN', @level2name=N'OrderLineExtensionEntity';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'ClassFactory key of the ProductBehavior plugin for this type; Product.BehaviorClass overrides; default behavior otherwise (BO-D38).', @level0type=N'SCHEMA', @level0name=N'__mj_BizAppsOrders', @level1type=N'TABLE', @level1name=N'ProductType', @level2type=N'COLUMN', @level2name=N'BehaviorClass';
GO

-- ProductCategory (S5)
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Stable machine code for the category. Unique when present.', @level0type=N'SCHEMA', @level0name=N'__mj_BizAppsOrders', @level1type=N'TABLE', @level1name=N'ProductCategory', @level2type=N'COLUMN', @level2name=N'Code';
GO

-- Product (S5 lifecycle/commerce fields)
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Stock-keeping unit / product code. Unique when present.', @level0type=N'SCHEMA', @level0name=N'__mj_BizAppsOrders', @level1type=N'TABLE', @level1name=N'Product', @level2type=N'COLUMN', @level2name=N'SKU';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'The subsidiary whose revenue this product accrues to. NULLABLE pending Robert''s owning-company ruling (Q2 residue); GL routing is via GLAccountLink regardless (MOD-2/MOD-3).', @level0type=N'SCHEMA', @level0name=N'__mj_BizAppsOrders', @level1type=N'TABLE', @level1name=N'Product', @level2type=N'COLUMN', @level2name=N'OwningCompanyID';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Draft | Active | Discontinued | EOL — catalog lifecycle. Data-only until the catalog engine gates ordering on it.', @level0type=N'SCHEMA', @level0name=N'__mj_BizAppsOrders', @level1type=N'TABLE', @level1name=N'Product', @level2type=N'COLUMN', @level2name=N'Status';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'First date the product may be sold.', @level0type=N'SCHEMA', @level0name=N'__mj_BizAppsOrders', @level1type=N'TABLE', @level1name=N'Product', @level2type=N'COLUMN', @level2name=N'AvailableFrom';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Last date the product may be sold.', @level0type=N'SCHEMA', @level0name=N'__mj_BizAppsOrders', @level1type=N'TABLE', @level1name=N'Product', @level2type=N'COLUMN', @level2name=N'AvailableTo';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Standalone selling price for ASC 606 bundle revenue allocation (BO-D35; fields now, allocation engine later).', @level0type=N'SCHEMA', @level0name=N'__mj_BizAppsOrders', @level1type=N'TABLE', @level1name=N'Product', @level2type=N'COLUMN', @level2name=N'StandaloneSellingPrice';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'ClassFactory key of this product''s ProductBehavior plugin; falls back to ProductType.BehaviorClass then the default (BO-D38).', @level0type=N'SCHEMA', @level0name=N'__mj_BizAppsOrders', @level1type=N'TABLE', @level1name=N'Product', @level2type=N'COLUMN', @level2name=N'BehaviorClass';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Default billing cycle for subscription-creating products (Monthly | Quarterly | Annual | Custom).', @level0type=N'SCHEMA', @level0name=N'__mj_BizAppsOrders', @level1type=N'TABLE', @level1name=N'Product', @level2type=N'COLUMN', @level2name=N'DefaultBillingCycle';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Default subscription term in months.', @level0type=N'SCHEMA', @level0name=N'__mj_BizAppsOrders', @level1type=N'TABLE', @level1name=N'Product', @level2type=N'COLUMN', @level2name=N'DefaultSubscriptionTermMonths';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Whether this product is subject to tax (tax subsystem lands at O4).', @level0type=N'SCHEMA', @level0name=N'__mj_BizAppsOrders', @level1type=N'TABLE', @level1name=N'Product', @level2type=N'COLUMN', @level2name=N'IsTaxable';
GO

-- ProductBundleItem
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Component membership of a bundle product (BO-D32/D41): one structure powering bundle-line ordering and fast-path expansion.', @level0type=N'SCHEMA', @level0name=N'__mj_BizAppsOrders', @level1type=N'TABLE', @level1name=N'ProductBundleItem';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Quantity of the component per one bundle.', @level0type=N'SCHEMA', @level0name=N'__mj_BizAppsOrders', @level1type=N'TABLE', @level1name=N'ProductBundleItem', @level2type=N'COLUMN', @level2name=N'Quantity';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Bundled (fixed bundle price, SSP-allocated) | SumOfParts (components price individually).', @level0type=N'SCHEMA', @level0name=N'__mj_BizAppsOrders', @level1type=N'TABLE', @level1name=N'ProductBundleItem', @level2type=N'COLUMN', @level2name=N'PricingMode';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Display order of components within the bundle.', @level0type=N'SCHEMA', @level0name=N'__mj_BizAppsOrders', @level1type=N'TABLE', @level1name=N'ProductBundleItem', @level2type=N'COLUMN', @level2name=N'SortOrder';
GO

-- ProductPerformanceObligation
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'ASC 606 performance obligation (BO-D35): one or more per product; SSP drives bundle allocation. Fields now; the allocation engine is deferred. GL routing via GLAccountLink (MOD-2).', @level0type=N'SCHEMA', @level0name=N'__mj_BizAppsOrders', @level1type=N'TABLE', @level1name=N'ProductPerformanceObligation';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Display name of the obligation.', @level0type=N'SCHEMA', @level0name=N'__mj_BizAppsOrders', @level1type=N'TABLE', @level1name=N'ProductPerformanceObligation', @level2type=N'COLUMN', @level2name=N'Name';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Recognition pattern for THIS obligation (Immediate | Deferred), independent of siblings.', @level0type=N'SCHEMA', @level0name=N'__mj_BizAppsOrders', @level1type=N'TABLE', @level1name=N'ProductPerformanceObligation', @level2type=N'COLUMN', @level2name=N'RevenueRecognitionType';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Standalone selling price used for relative-SSP allocation across obligations.', @level0type=N'SCHEMA', @level0name=N'__mj_BizAppsOrders', @level1type=N'TABLE', @level1name=N'ProductPerformanceObligation', @level2type=N'COLUMN', @level2name=N'StandaloneSellingPrice';
GO

-- ProductEntitlement
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'The DEFINITION of what purchasing a product grants (BO-D34): feature, access level, or resource quantity. EntitlementGrant is the per-purchase instance.', @level0type=N'SCHEMA', @level0name=N'__mj_BizAppsOrders', @level1type=N'TABLE', @level1name=N'ProductEntitlement';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Feature | AccessLevel | ResourceQuantity | Custom.', @level0type=N'SCHEMA', @level0name=N'__mj_BizAppsOrders', @level1type=N'TABLE', @level1name=N'ProductEntitlement', @level2type=N'COLUMN', @level2name=N'EntitlementType';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Machine key consumed by downstream apps (unique per product).', @level0type=N'SCHEMA', @level0name=N'__mj_BizAppsOrders', @level1type=N'TABLE', @level1name=N'ProductEntitlement', @level2type=N'COLUMN', @level2name=N'Code';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Display name of the entitlement.', @level0type=N'SCHEMA', @level0name=N'__mj_BizAppsOrders', @level1type=N'TABLE', @level1name=N'ProductEntitlement', @level2type=N'COLUMN', @level2name=N'Name';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Granted quantity for ResourceQuantity entitlements (e.g. 100 GB, 5 seats).', @level0type=N'SCHEMA', @level0name=N'__mj_BizAppsOrders', @level1type=N'TABLE', @level1name=N'ProductEntitlement', @level2type=N'COLUMN', @level2name=N'Quantity';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Unit for Quantity (GB, seats, hours, ...).', @level0type=N'SCHEMA', @level0name=N'__mj_BizAppsOrders', @level1type=N'TABLE', @level1name=N'ProductEntitlement', @level2type=N'COLUMN', @level2name=N'UnitOfMeasure';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Whether this entitlement is currently granted by new purchases.', @level0type=N'SCHEMA', @level0name=N'__mj_BizAppsOrders', @level1type=N'TABLE', @level1name=N'ProductEntitlement', @level2type=N'COLUMN', @level2name=N'IsActive';
GO

-- EntitlementGrant
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'A granted entitlement instance created at Post / subscription activation (BO-D39), carrying the beneficiary (defaults to the buyer; a line may designate another). Downstream apps read grants to provision access.', @level0type=N'SCHEMA', @level0name=N'__mj_BizAppsOrders', @level1type=N'TABLE', @level1name=N'EntitlementGrant';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Soft reference (no FK) to __mj_BizAppsCommon.Person — the benefiting person (attendee, recipient, honoree).', @level0type=N'SCHEMA', @level0name=N'__mj_BizAppsOrders', @level1type=N'TABLE', @level1name=N'EntitlementGrant', @level2type=N'COLUMN', @level2name=N'BeneficiaryPersonID';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Soft reference (no FK) to __mj_BizAppsCommon.Organization — the benefiting organization.', @level0type=N'SCHEMA', @level0name=N'__mj_BizAppsOrders', @level1type=N'TABLE', @level1name=N'EntitlementGrant', @level2type=N'COLUMN', @level2name=N'BeneficiaryOrganizationID';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Granted quantity (defaults from the entitlement definition).', @level0type=N'SCHEMA', @level0name=N'__mj_BizAppsOrders', @level1type=N'TABLE', @level1name=N'EntitlementGrant', @level2type=N'COLUMN', @level2name=N'Quantity';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Grant validity start.', @level0type=N'SCHEMA', @level0name=N'__mj_BizAppsOrders', @level1type=N'TABLE', @level1name=N'EntitlementGrant', @level2type=N'COLUMN', @level2name=N'ValidFrom';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Grant validity end.', @level0type=N'SCHEMA', @level0name=N'__mj_BizAppsOrders', @level1type=N'TABLE', @level1name=N'EntitlementGrant', @level2type=N'COLUMN', @level2name=N'ValidTo';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Active | Suspended | Revoked | Expired.', @level0type=N'SCHEMA', @level0name=N'__mj_BizAppsOrders', @level1type=N'TABLE', @level1name=N'EntitlementGrant', @level2type=N'COLUMN', @level2name=N'Status';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'UTC timestamp downstream provisioning completed (NULL until provisioned).', @level0type=N'SCHEMA', @level0name=N'__mj_BizAppsOrders', @level1type=N'TABLE', @level1name=N'EntitlementGrant', @level2type=N'COLUMN', @level2name=N'ProvisionedAt';
GO

-- EventProduct / EventOrderLine (IsA pair)
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'IsA Disjoint child of Product (same UUID): event-specific catalog fields (BO-D37). A product is at most one subtype.', @level0type=N'SCHEMA', @level0name=N'__mj_BizAppsOrders', @level1type=N'TABLE', @level1name=N'EventProduct';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'UTC start of the event (also the SingleDate recognition date for Deferred event products).', @level0type=N'SCHEMA', @level0name=N'__mj_BizAppsOrders', @level1type=N'TABLE', @level1name=N'EventProduct', @level2type=N'COLUMN', @level2name=N'EventStartsAt';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'UTC end of the event.', @level0type=N'SCHEMA', @level0name=N'__mj_BizAppsOrders', @level1type=N'TABLE', @level1name=N'EventProduct', @level2type=N'COLUMN', @level2name=N'EventEndsAt';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Venue display name.', @level0type=N'SCHEMA', @level0name=N'__mj_BizAppsOrders', @level1type=N'TABLE', @level1name=N'EventProduct', @level2type=N'COLUMN', @level2name=N'VenueName';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Soft reference (no FK) to __mj_BizAppsCommon.Address — the venue address.', @level0type=N'SCHEMA', @level0name=N'__mj_BizAppsOrders', @level1type=N'TABLE', @level1name=N'EventProduct', @level2type=N'COLUMN', @level2name=N'VenueAddressID';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Maximum attendee count. NULL = uncapped.', @level0type=N'SCHEMA', @level0name=N'__mj_BizAppsOrders', @level1type=N'TABLE', @level1name=N'EventProduct', @level2type=N'COLUMN', @level2name=N'Capacity';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Whether order lines for this event require attendee info (EventOrderLine).', @level0type=N'SCHEMA', @level0name=N'__mj_BizAppsOrders', @level1type=N'TABLE', @level1name=N'EventProduct', @level2type=N'COLUMN', @level2name=N'RequiresAttendeeInfo';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'IsA Disjoint child of OrderLine (same UUID): per-line attendee detail; the attendee is typically the EntitlementGrant beneficiary (BO-D39).', @level0type=N'SCHEMA', @level0name=N'__mj_BizAppsOrders', @level1type=N'TABLE', @level1name=N'EventOrderLine';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Attendee full name.', @level0type=N'SCHEMA', @level0name=N'__mj_BizAppsOrders', @level1type=N'TABLE', @level1name=N'EventOrderLine', @level2type=N'COLUMN', @level2name=N'AttendeeName';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Attendee email.', @level0type=N'SCHEMA', @level0name=N'__mj_BizAppsOrders', @level1type=N'TABLE', @level1name=N'EventOrderLine', @level2type=N'COLUMN', @level2name=N'AttendeeEmail';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'UTC timestamp the attendee checked in.', @level0type=N'SCHEMA', @level0name=N'__mj_BizAppsOrders', @level1type=N'TABLE', @level1name=N'EventOrderLine', @level2type=N'COLUMN', @level2name=N'CheckInAt';
GO

-- StoredValueAccount / StoredValueTransaction
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Gift-card / stored-value instrument (BO-D44). Selling one books a LIABILITY (not revenue); redemption is a Payment with Method=GiftCard relieving the liability.', @level0type=N'SCHEMA', @level0name=N'__mj_BizAppsOrders', @level1type=N'TABLE', @level1name=N'StoredValueAccount';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'The gift-card number / instrument code. Unique.', @level0type=N'SCHEMA', @level0name=N'__mj_BizAppsOrders', @level1type=N'TABLE', @level1name=N'StoredValueAccount', @level2type=N'COLUMN', @level2name=N'Code';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Face value at issuance.', @level0type=N'SCHEMA', @level0name=N'__mj_BizAppsOrders', @level1type=N'TABLE', @level1name=N'StoredValueAccount', @level2type=N'COLUMN', @level2name=N'InitialAmount';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Current remaining balance (ledger-maintained via StoredValueTransaction).', @level0type=N'SCHEMA', @level0name=N'__mj_BizAppsOrders', @level1type=N'TABLE', @level1name=N'StoredValueAccount', @level2type=N'COLUMN', @level2name=N'CurrentBalance';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Active | Depleted | Expired | Suspended | Voided.', @level0type=N'SCHEMA', @level0name=N'__mj_BizAppsOrders', @level1type=N'TABLE', @level1name=N'StoredValueAccount', @level2type=N'COLUMN', @level2name=N'Status';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Soft reference (no FK) to __mj_BizAppsCommon.Person — the card recipient.', @level0type=N'SCHEMA', @level0name=N'__mj_BizAppsOrders', @level1type=N'TABLE', @level1name=N'StoredValueAccount', @level2type=N'COLUMN', @level2name=N'BeneficiaryPersonID';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Soft reference (no FK) to __mj_BizAppsCommon.Organization — the benefiting organization.', @level0type=N'SCHEMA', @level0name=N'__mj_BizAppsOrders', @level1type=N'TABLE', @level1name=N'StoredValueAccount', @level2type=N'COLUMN', @level2name=N'BeneficiaryOrganizationID';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Expiration date where legally permitted. NULL = never.', @level0type=N'SCHEMA', @level0name=N'__mj_BizAppsOrders', @level1type=N'TABLE', @level1name=N'StoredValueAccount', @level2type=N'COLUMN', @level2name=N'ExpiresAt';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Stored-value balance ledger (BO-D44): every issue/redeem/refund/adjust/expire with the running balance.', @level0type=N'SCHEMA', @level0name=N'__mj_BizAppsOrders', @level1type=N'TABLE', @level1name=N'StoredValueTransaction';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Issue | Redeem | Refund | Adjust | Expire.', @level0type=N'SCHEMA', @level0name=N'__mj_BizAppsOrders', @level1type=N'TABLE', @level1name=N'StoredValueTransaction', @level2type=N'COLUMN', @level2name=N'TransactionType';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Signed amount (+issue/refund, -redeem/expire).', @level0type=N'SCHEMA', @level0name=N'__mj_BizAppsOrders', @level1type=N'TABLE', @level1name=N'StoredValueTransaction', @level2type=N'COLUMN', @level2name=N'Amount';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Account balance after applying this transaction.', @level0type=N'SCHEMA', @level0name=N'__mj_BizAppsOrders', @level1type=N'TABLE', @level1name=N'StoredValueTransaction', @level2type=N'COLUMN', @level2name=N'BalanceAfter';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'UTC timestamp of the transaction.', @level0type=N'SCHEMA', @level0name=N'__mj_BizAppsOrders', @level1type=N'TABLE', @level1name=N'StoredValueTransaction', @level2type=N'COLUMN', @level2name=N'OccurredAt';
GO

-- Payment (S5 addition)
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'The stored-value account redeemed when Method = GiftCard (BO-D44).', @level0type=N'SCHEMA', @level0name=N'__mj_BizAppsOrders', @level1type=N'TABLE', @level1name=N'Payment', @level2type=N'COLUMN', @level2name=N'StoredValueAccountID';
GO

-- OrderLineDimension
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Analytical dimension tag on an order line (one value per dimension). Soft refs to __mj_BizAppsAccounting Dimension/DimensionValue; the booking draft propagates tags onto JE lines for batch-dimension detail.', @level0type=N'SCHEMA', @level0name=N'__mj_BizAppsOrders', @level1type=N'TABLE', @level1name=N'OrderLineDimension';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Soft reference (no FK) to __mj_BizAppsAccounting.Dimension.', @level0type=N'SCHEMA', @level0name=N'__mj_BizAppsOrders', @level1type=N'TABLE', @level1name=N'OrderLineDimension', @level2type=N'COLUMN', @level2name=N'DimensionID';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Soft reference (no FK) to __mj_BizAppsAccounting.DimensionValue.', @level0type=N'SCHEMA', @level0name=N'__mj_BizAppsOrders', @level1type=N'TABLE', @level1name=N'OrderLineDimension', @level2type=N'COLUMN', @level2name=N'DimensionValueID';
GO

-- PriceList / ProductPrice / PriceTier
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Pricing segmentation container (BO-D33): region/channel/customer-tier scope, effective-dated. Currency column deferred with FX (MOD-4).', @level0type=N'SCHEMA', @level0name=N'__mj_BizAppsOrders', @level1type=N'TABLE', @level1name=N'PriceList';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Stable machine code. Unique.', @level0type=N'SCHEMA', @level0name=N'__mj_BizAppsOrders', @level1type=N'TABLE', @level1name=N'PriceList', @level2type=N'COLUMN', @level2name=N'Code';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Display name.', @level0type=N'SCHEMA', @level0name=N'__mj_BizAppsOrders', @level1type=N'TABLE', @level1name=N'PriceList', @level2type=N'COLUMN', @level2name=N'Name';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Region / channel / customer-tier scope label.', @level0type=N'SCHEMA', @level0name=N'__mj_BizAppsOrders', @level1type=N'TABLE', @level1name=N'PriceList', @level2type=N'COLUMN', @level2name=N'Segment';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'List validity start.', @level0type=N'SCHEMA', @level0name=N'__mj_BizAppsOrders', @level1type=N'TABLE', @level1name=N'PriceList', @level2type=N'COLUMN', @level2name=N'EffectiveFrom';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'List validity end.', @level0type=N'SCHEMA', @level0name=N'__mj_BizAppsOrders', @level1type=N'TABLE', @level1name=N'PriceList', @level2type=N'COLUMN', @level2name=N'EffectiveTo';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Whether this list participates in resolution.', @level0type=N'SCHEMA', @level0name=N'__mj_BizAppsOrders', @level1type=N'TABLE', @level1name=N'PriceList', @level2type=N'COLUMN', @level2name=N'IsActive';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'An effective-dated price for a product (BO-D33). Resolution engine = feature F9; direct UnitPrice entry remains the precedence base so order entry never blocks.', @level0type=N'SCHEMA', @level0name=N'__mj_BizAppsOrders', @level1type=N'TABLE', @level1name=N'ProductPrice';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Flat | PerUnit | Tiered | Volume | Package | Usage.', @level0type=N'SCHEMA', @level0name=N'__mj_BizAppsOrders', @level1type=N'TABLE', @level1name=N'ProductPrice', @level2type=N'COLUMN', @level2name=N'PricingModel';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Standard | Setup | Recurring | Overage.', @level0type=N'SCHEMA', @level0name=N'__mj_BizAppsOrders', @level1type=N'TABLE', @level1name=N'ProductPrice', @level2type=N'COLUMN', @level2name=N'FeeType';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Base/flat amount; tier detail lives in PriceTier.', @level0type=N'SCHEMA', @level0name=N'__mj_BizAppsOrders', @level1type=N'TABLE', @level1name=N'ProductPrice', @level2type=N'COLUMN', @level2name=N'Amount';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Pricing unit (each, month, hour, GB, seat, ...).', @level0type=N'SCHEMA', @level0name=N'__mj_BizAppsOrders', @level1type=N'TABLE', @level1name=N'ProductPrice', @level2type=N'COLUMN', @level2name=N'UnitOfMeasure';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Minimum quantity this price applies to.', @level0type=N'SCHEMA', @level0name=N'__mj_BizAppsOrders', @level1type=N'TABLE', @level1name=N'ProductPrice', @level2type=N'COLUMN', @level2name=N'MinQuantity';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Maximum quantity this price applies to.', @level0type=N'SCHEMA', @level0name=N'__mj_BizAppsOrders', @level1type=N'TABLE', @level1name=N'ProductPrice', @level2type=N'COLUMN', @level2name=N'MaxQuantity';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Price validity start.', @level0type=N'SCHEMA', @level0name=N'__mj_BizAppsOrders', @level1type=N'TABLE', @level1name=N'ProductPrice', @level2type=N'COLUMN', @level2name=N'EffectiveFrom';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Price validity end.', @level0type=N'SCHEMA', @level0name=N'__mj_BizAppsOrders', @level1type=N'TABLE', @level1name=N'ProductPrice', @level2type=N'COLUMN', @level2name=N'EffectiveTo';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Volume/quantity break under a Tiered or Volume ProductPrice (BO-D33).', @level0type=N'SCHEMA', @level0name=N'__mj_BizAppsOrders', @level1type=N'TABLE', @level1name=N'PriceTier';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Tier lower bound (inclusive).', @level0type=N'SCHEMA', @level0name=N'__mj_BizAppsOrders', @level1type=N'TABLE', @level1name=N'PriceTier', @level2type=N'COLUMN', @level2name=N'MinQuantity';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Tier upper bound. NULL = unbounded top tier.', @level0type=N'SCHEMA', @level0name=N'__mj_BizAppsOrders', @level1type=N'TABLE', @level1name=N'PriceTier', @level2type=N'COLUMN', @level2name=N'MaxQuantity';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Per-unit (or flat) price within this tier.', @level0type=N'SCHEMA', @level0name=N'__mj_BizAppsOrders', @level1type=N'TABLE', @level1name=N'PriceTier', @level2type=N'COLUMN', @level2name=N'Amount';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Display order of tiers.', @level0type=N'SCHEMA', @level0name=N'__mj_BizAppsOrders', @level1type=N'TABLE', @level1name=N'PriceTier', @level2type=N'COLUMN', @level2name=N'SortOrder';
GO

-- SalesRule / SalesAuthority (S6)
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Metadata-driven sales constraint evaluated at Confirm (BO-D17/D18). Violations raise an Approval Request Task routed to ApprovalRequiredRoleID; golden path confirms instantly.', @level0type=N'SCHEMA', @level0name=N'__mj_BizAppsOrders', @level1type=N'TABLE', @level1name=N'SalesRule';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Display name of the rule.', @level0type=N'SCHEMA', @level0name=N'__mj_BizAppsOrders', @level1type=N'TABLE', @level1name=N'SalesRule', @level2type=N'COLUMN', @level2name=N'Name';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'DiscountLimit | PaymentTermsRequired | ProductAuthorization | CreditLimit | Custom.', @level0type=N'SCHEMA', @level0name=N'__mj_BizAppsOrders', @level1type=N'TABLE', @level1name=N'SalesRule', @level2type=N'COLUMN', @level2name=N'RuleType';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Global | PerProduct | PerCustomer | PerSalesRep — what ScopeReferenceID points at.', @level0type=N'SCHEMA', @level0name=N'__mj_BizAppsOrders', @level1type=N'TABLE', @level1name=N'SalesRule', @level2type=N'COLUMN', @level2name=N'Scope';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Soft reference (no FK) to the scoped Product / Customer Organization / Sales Rep User when Scope is not Global.', @level0type=N'SCHEMA', @level0name=N'__mj_BizAppsOrders', @level1type=N'TABLE', @level1name=N'SalesRule', @level2type=N'COLUMN', @level2name=N'ScopeReferenceID';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'JSON rule expression (admin-editable; evaluated by the F8 engine).', @level0type=N'SCHEMA', @level0name=N'__mj_BizAppsOrders', @level1type=N'TABLE', @level1name=N'SalesRule', @level2type=N'COLUMN', @level2name=N'PredicateJson';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Whether this rule participates in Confirm evaluation.', @level0type=N'SCHEMA', @level0name=N'__mj_BizAppsOrders', @level1type=N'TABLE', @level1name=N'SalesRule', @level2type=N'COLUMN', @level2name=N'IsActive';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Per-rep authority limits (§4.8): the caps within which a sales rep confirms without approval.', @level0type=N'SCHEMA', @level0name=N'__mj_BizAppsOrders', @level1type=N'TABLE', @level1name=N'SalesAuthority';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Maximum discount fraction (0-1) this rep may grant unaided.', @level0type=N'SCHEMA', @level0name=N'__mj_BizAppsOrders', @level1type=N'TABLE', @level1name=N'SalesAuthority', @level2type=N'COLUMN', @level2name=N'MaxDiscountPct';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Maximum order value this rep may confirm unaided.', @level0type=N'SCHEMA', @level0name=N'__mj_BizAppsOrders', @level1type=N'TABLE', @level1name=N'SalesAuthority', @level2type=N'COLUMN', @level2name=N'MaxOrderValue';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'JSON array of PaymentTermsType IDs this rep may offer. NULL = all.', @level0type=N'SCHEMA', @level0name=N'__mj_BizAppsOrders', @level1type=N'TABLE', @level1name=N'SalesAuthority', @level2type=N'COLUMN', @level2name=N'AllowedPaymentTermsTypeIDs';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'JSON array of ProductCategory IDs this rep may sell. NULL = all.', @level0type=N'SCHEMA', @level0name=N'__mj_BizAppsOrders', @level1type=N'TABLE', @level1name=N'SalesAuthority', @level2type=N'COLUMN', @level2name=N'AllowedProductCategoryIDs';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Whether this authority row is in force.', @level0type=N'SCHEMA', @level0name=N'__mj_BizAppsOrders', @level1type=N'TABLE', @level1name=N'SalesAuthority', @level2type=N'COLUMN', @level2name=N'IsActive';
GO

-- RevRecScheduleLine
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'One recognition period of a schedule. Line 1 carries the rounding remainder. Soft refs to accounting''s ScheduledJournalEntry / recognized JournalEntry.', @level0type=N'SCHEMA', @level0name=N'__mj_BizAppsOrders', @level1type=N'TABLE', @level1name=N'RevRecScheduleLine';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Start of this recognition period.', @level0type=N'SCHEMA', @level0name=N'__mj_BizAppsOrders', @level1type=N'TABLE', @level1name=N'RevRecScheduleLine', @level2type=N'COLUMN', @level2name=N'PeriodStart';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'End of this recognition period.', @level0type=N'SCHEMA', @level0name=N'__mj_BizAppsOrders', @level1type=N'TABLE', @level1name=N'RevRecScheduleLine', @level2type=N'COLUMN', @level2name=N'PeriodEnd';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Amount recognized in this period.', @level0type=N'SCHEMA', @level0name=N'__mj_BizAppsOrders', @level1type=N'TABLE', @level1name=N'RevRecScheduleLine', @level2type=N'COLUMN', @level2name=N'Amount';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Soft reference (no FK) to __mj_BizAppsAccounting.ScheduledJournalEntry — the dated future entry created at booking-lock (accounting MOD-11).', @level0type=N'SCHEMA', @level0name=N'__mj_BizAppsOrders', @level1type=N'TABLE', @level1name=N'RevRecScheduleLine', @level2type=N'COLUMN', @level2name=N'ScheduledJournalEntryID';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Soft reference (no FK) to the __mj_BizAppsAccounting.JournalEntry that recognized this period.', @level0type=N'SCHEMA', @level0name=N'__mj_BizAppsOrders', @level1type=N'TABLE', @level1name=N'RevRecScheduleLine', @level2type=N'COLUMN', @level2name=N'RecognizedJournalEntryID';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'UTC timestamp this period was recognized.', @level0type=N'SCHEMA', @level0name=N'__mj_BizAppsOrders', @level1type=N'TABLE', @level1name=N'RevRecScheduleLine', @level2type=N'COLUMN', @level2name=N'RecognizedAt';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Whether this period has been recognized.', @level0type=N'SCHEMA', @level0name=N'__mj_BizAppsOrders', @level1type=N'TABLE', @level1name=N'RevRecScheduleLine', @level2type=N'COLUMN', @level2name=N'IsRecognized';
GO
