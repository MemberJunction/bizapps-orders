-- =============================================================================
-- BizApps Orders — Baseline Schema (v0.1.0)
-- =============================================================================
-- Creates the entire __mj_BizAppsOrders schema: the product catalog + order
-- lifecycle. Per the 2026-07-02 engine-meeting amendment (§3):
--   * ProductType        — flat lookup
--   * ProductCategory     — hierarchical (ParentID self-FK)
--   * Product             — RevenueRecognitionType kept; NO GL columns (S3 — accounting's
--                           polymorphic GLAccountLink points AT Product/ProductCategory rows)
--   * Order               — Status lifecycle; NO CompanyID (S5 — multi-company via the
--                           resolved GLAccount.CompanyID per JE line); NO currency (FX deferred, S10)
--   * OrderLine           — ProductID / Quantity / UnitPrice
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
-- 3.4 Order — the order header. JEs are booked EXACTLY ONCE, on the first flip to
--     'Confirmed' (S4); JournalEntryID records the booked entry (non-null = already booked,
--     the idempotency guard). NO CompanyID (S5); NO currency (FX deferred, S10).
--     [Order] is a T-SQL reserved word — always bracket it in raw SQL.
---------------------------------------------------------------------------
CREATE TABLE __mj_BizAppsOrders.[Order] (
    ID UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    OrderNumber NVARCHAR(40) NOT NULL,
    OrderDate DATE NOT NULL,
    Status NVARCHAR(20) NOT NULL DEFAULT 'Draft',
    CustomerOrganizationID UNIQUEIDENTIFIER NULL,
    Description NVARCHAR(MAX) NULL,
    JournalEntryID UNIQUEIDENTIFIER NULL,
    ConfirmedAt DATETIMEOFFSET NULL,
    CONSTRAINT PK_Order PRIMARY KEY (ID),
    CONSTRAINT UQ_Order_OrderNumber UNIQUE (OrderNumber),
    CONSTRAINT CK_Order_Status CHECK (Status IN ('Draft','Quoted','Confirmed','Posted','Fulfilled','Voided'))
);
GO

---------------------------------------------------------------------------
-- 3.5 OrderLine — a line on an order. Line amount = Quantity * UnitPrice (computed in code,
--     not stored). OrderLineID flows to the JE line as soft lineage.
---------------------------------------------------------------------------
CREATE TABLE __mj_BizAppsOrders.OrderLine (
    ID UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    OrderID UNIQUEIDENTIFIER NOT NULL,
    ProductID UNIQUEIDENTIFIER NOT NULL,
    LineNumber INT NOT NULL,
    Quantity DECIMAL(18,4) NOT NULL,
    UnitPrice DECIMAL(19,4) NOT NULL,
    Description NVARCHAR(500) NULL,
    CONSTRAINT PK_OrderLine PRIMARY KEY (ID),
    CONSTRAINT UQ_OrderLine_Order_LineNumber UNIQUE (OrderID, LineNumber),
    CONSTRAINT CK_OrderLine_Quantity CHECK (Quantity > 0),
    CONSTRAINT CK_OrderLine_UnitPrice CHECK (UnitPrice >= 0)
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

-- =============================================================================
-- 5. EXTENDED PROPERTIES (MS_Description — CodeGen turns these into field docs).
--    Skipped for PK (ID) and FK columns, which CodeGen documents automatically.
-- =============================================================================

-- ProductType
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Classifies products (e.g. Physical Good, Service, Subscription).', @level0type=N'SCHEMA', @level0name=N'__mj_BizAppsOrders', @level1type=N'TABLE', @level1name=N'ProductType';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Display name of the product type. Unique.', @level0type=N'SCHEMA', @level0name=N'__mj_BizAppsOrders', @level1type=N'TABLE', @level1name=N'ProductType', @level2type=N'COLUMN', @level2name=N'Name';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Optional description of the product type.', @level0type=N'SCHEMA', @level0name=N'__mj_BizAppsOrders', @level1type=N'TABLE', @level1name=N'ProductType', @level2type=N'COLUMN', @level2name=N'Description';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Whether this type is active and selectable.', @level0type=N'SCHEMA', @level0name=N'__mj_BizAppsOrders', @level1type=N'TABLE', @level1name=N'ProductType', @level2type=N'COLUMN', @level2name=N'IsActive';
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
GO

-- OrderLine
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'A line item on an order. Line amount = Quantity * UnitPrice.', @level0type=N'SCHEMA', @level0name=N'__mj_BizAppsOrders', @level1type=N'TABLE', @level1name=N'OrderLine';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Order-scoped line sequence (1..n), unique within the order.', @level0type=N'SCHEMA', @level0name=N'__mj_BizAppsOrders', @level1type=N'TABLE', @level1name=N'OrderLine', @level2type=N'COLUMN', @level2name=N'LineNumber';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Quantity ordered (> 0).', @level0type=N'SCHEMA', @level0name=N'__mj_BizAppsOrders', @level1type=N'TABLE', @level1name=N'OrderLine', @level2type=N'COLUMN', @level2name=N'Quantity';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Unit price (>= 0). Multiplied by Quantity to get the line amount booked to revenue.', @level0type=N'SCHEMA', @level0name=N'__mj_BizAppsOrders', @level1type=N'TABLE', @level1name=N'OrderLine', @level2type=N'COLUMN', @level2name=N'UnitPrice';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Optional free-text description for the line.', @level0type=N'SCHEMA', @level0name=N'__mj_BizAppsOrders', @level1type=N'TABLE', @level1name=N'OrderLine', @level2type=N'COLUMN', @level2name=N'Description';
GO
