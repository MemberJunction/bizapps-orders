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
--
-- Cross-app references are SOFT (plain UNIQUEIDENTIFIER, no FK) so Orders never
-- couples to another app's schema:
--   * Order.CustomerOrganizationID  → __mj_BizAppsCommon.Organization (soft)
--   * Order.JournalEntryID          → __mj_BizAppsAccounting.JournalEntry (soft lineage back-ref)
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
    Name NVARCHAR(100) NOT NULL,
    Description NVARCHAR(MAX) NULL,
    RequiresFulfillment BIT NOT NULL DEFAULT 0,
    IsActive BIT NOT NULL DEFAULT 1,
    CONSTRAINT PK_ProductType PRIMARY KEY (ID),
    CONSTRAINT UQ_ProductType_Name UNIQUE (Name)
);
GO

---------------------------------------------------------------------------
-- 3.2 ProductCategory — hierarchical grouping. ParentID self-FK builds the tree the
--     account resolver walks upward (product → category → parent category → …).
---------------------------------------------------------------------------
CREATE TABLE __mj_BizAppsOrders.ProductCategory (
    ID UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    Name NVARCHAR(200) NOT NULL,
    ParentID UNIQUEIDENTIFIER NULL,
    Description NVARCHAR(MAX) NULL,
    IsActive BIT NOT NULL DEFAULT 1,
    CONSTRAINT PK_ProductCategory PRIMARY KEY (ID),
    CONSTRAINT CK_ProductCategory_NoSelfParent CHECK (ParentID IS NULL OR ParentID <> ID)
);
GO

---------------------------------------------------------------------------
-- 3.3 Product — a catalog item. RevenueRecognitionType drives the credit side of the
--     order-booking JE (Immediate → Sales; Deferred → Deferred Revenue). NO GL columns (S3).
---------------------------------------------------------------------------
CREATE TABLE __mj_BizAppsOrders.Product (
    ID UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    Name NVARCHAR(200) NOT NULL,
    ProductTypeID UNIQUEIDENTIFIER NOT NULL,
    ProductCategoryID UNIQUEIDENTIFIER NULL,
    RevenueRecognitionType NVARCHAR(20) NOT NULL DEFAULT 'Immediate',
    Description NVARCHAR(MAX) NULL,
    IsActive BIT NOT NULL DEFAULT 1,
    CONSTRAINT PK_Product PRIMARY KEY (ID),
    CONSTRAINT CK_Product_RevenueRecognitionType CHECK (RevenueRecognitionType IN ('Immediate','Deferred'))
);
GO

---------------------------------------------------------------------------
-- 3.4 Order — the order header AND the A/R primitive (order = invoice, CA-2 2026-07-14).
--     JEs are booked EXACTLY ONCE, on the first flip to 'Confirmed' (S4). Booking emits
--     ONE JE PER COMPANY (MOD-11); JournalEntryID holds the single-company case's entry,
--     the order-level booked guard is ConfirmedAt + JE existence (F1.2 reworks the engine).
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
    Description NVARCHAR(MAX) NULL,
    Notes NVARCHAR(MAX) NULL,
    JournalEntryID UNIQUEIDENTIFIER NULL,
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
    Description NVARCHAR(500) NULL,
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
--      the accounting JE booked at capture (mirrors Order.JournalEntryID).
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
    Description NVARCHAR(MAX) NULL,
    Notes NVARCHAR(MAX) NULL,
    CONSTRAINT PK_Payment PRIMARY KEY (ID),
    CONSTRAINT UQ_Payment_PaymentNumber UNIQUE (PaymentNumber),
    CONSTRAINT CK_Payment_Method CHECK (Method IN ('CreditCard','ACH','Wire','Check','Cash','InternalTransfer','Refund','Chargeback','BankReturn')),
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

-- =============================================================================
-- 5. TRIGGERS — DB-level enforcement of master-plan financial invariants
--    (schema action plan §6.1; house pattern per accounting's locked-JE triggers,
--    Marcelo 2026-07-11 directive). Workflow rules (transition matrix, totals,
--    cross-field validation) stay in the entity server — these guard only the
--    invariants that must hold even against raw SQL.
-- =============================================================================

---------------------------------------------------------------------------
-- 5.1 trg_Order_JournalEntryIDImmutable
--     The booking record: once JournalEntryID is set it may never be cleared or
--     replaced. Corrections happen via reversal orders (new JEs), never by
--     re-pointing the booked entry.
---------------------------------------------------------------------------
CREATE TRIGGER __mj_BizAppsOrders.trg_Order_JournalEntryIDImmutable
ON __mj_BizAppsOrders.[Order]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    IF EXISTS (
        SELECT 1
        FROM deleted d
        JOIN inserted i ON i.ID = d.ID
        WHERE d.JournalEntryID IS NOT NULL
          AND (i.JournalEntryID IS NULL OR i.JournalEntryID <> d.JournalEntryID)
    )
    BEGIN
        ROLLBACK TRANSACTION;
        THROW 51001, 'Order.JournalEntryID cannot be cleared or replaced once set. Corrections happen via a reversal order, not by re-pointing the booked journal entry.', 1;
    END;
END;
GO

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
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Soft reference (no FK) to the __mj_BizAppsAccounting.JournalEntry booked on Confirm. Non-null means the JE has already been booked (idempotency guard).', @level0type=N'SCHEMA', @level0name=N'__mj_BizAppsOrders', @level1type=N'TABLE', @level1name=N'Order', @level2type=N'COLUMN', @level2name=N'JournalEntryID';
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
