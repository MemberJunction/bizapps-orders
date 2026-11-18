-- =============================================================================
-- V202611181800 — Product options, and the schema for variant SKUs
-- =============================================================================
-- A product priced by tier and size had to be entered as one product per
-- combination, with the tier and size living only in each product's name. Nothing
-- the buyer chose on a line could change its price.
--
-- Options (Tier, Size) are now a catalog. A product type, a category at any level,
-- or the product itself assigns the options a product offers; the most specific
-- assignment of an option wins whole. The buyer's picks are recorded on the order
-- line in OrderLineChoice, which renewals and conditional entitlements already
-- read, and price rules test them through the Option applicability source.
--
-- Design: plans/product-options-and-variants.md.
--
-- What this file does, in order:
--   1. ProductOption: an option. CompanyID NULL is a shared option, the only kind
--      a product type (global) may assign; set, it is that company's own.
--   2. ProductOptionValue: an option's values.
--   3. ProductOptionAssignment: which options a type, category or product offers,
--      with required flag, default and Role (LineOption or Variant).
--   4. ProductOptionAssignmentValue: the values an assignment allows. None means
--      every active value of the option.
--   5. ProductSuccessorOptionValue: the picks a renewal line takes when a
--      subscription moves from this product to its successor. Lets per-combination
--      products be retired onto one optioned product at renewal.
--   6. Product.ParentProductID and ProductVariantValue: the schema for variant
--      SKUs. Refused on save by the entity servers until the engines use them.
--   7. OrderLineChoice gains ProductOptionID and ProductOptionValueID, set together
--      for an option pick and NULL for a checkout-widget choice, with one pick per
--      option per line.
--   8. ProductEntitlement: the (ProductID, Code) unique constraint becomes two
--      filtered unique indexes, so one code can be granted under different picks.
--      Two indexes rather than one wider constraint because SQL Server and
--      PostgreSQL treat NULLs in a unique constraint differently.
--   9. trg_OrderLineChoice_ImmutableAfterConfirm: an option pick on a line of a
--      Confirmed order cannot be changed or deleted. It decided the line's price
--      and entitlements, so it is part of the sale like the line's money.
-- =============================================================================
GO


-- -----------------------------------------------------------------------------
-- 1. ProductOption
-- -----------------------------------------------------------------------------
CREATE TABLE [${flyway:defaultSchema}].[ProductOption] (
    [ID] UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    [CompanyID] UNIQUEIDENTIFIER NULL,
    [Code] NVARCHAR(50) NOT NULL,
    [Name] NVARCHAR(100) NOT NULL,
    [Description] NVARCHAR(MAX) NULL,
    [SortOrder] INT NOT NULL DEFAULT 0,
    [IsActive] BIT NOT NULL DEFAULT 1,
    CONSTRAINT PK_ProductOption PRIMARY KEY ([ID]),
    CONSTRAINT FK_ProductOption_Company FOREIGN KEY ([CompanyID])
        REFERENCES [${mjSchema}].[Company]([ID]),
    CONSTRAINT CK_ProductOption_Code CHECK (LEN([Code]) > 0)
);
GO

CREATE UNIQUE INDEX [UX_ProductOption_SharedCode]
    ON [${flyway:defaultSchema}].[ProductOption] ([Code])
    WHERE [CompanyID] IS NULL;
GO

CREATE UNIQUE INDEX [UX_ProductOption_CompanyCode]
    ON [${flyway:defaultSchema}].[ProductOption] ([CompanyID], [Code])
    WHERE [CompanyID] IS NOT NULL;
GO

EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'A choice a buyer makes on a line, such as Tier or Size. Its values are in Product Option Values; which products offer it is set by Product Option Assignments.', @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'ProductOption';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'The company that owns this option. Empty for a shared option, usable by every company and the only kind a product type may assign.', @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'ProductOption', @level2type = N'COLUMN', @level2name = N'CompanyID';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Stable code for the option, used as the field name in price rules (Option.<Code>) and as the GroupKey of the picks recorded on a line. Unique among shared options, and within a company.', @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'ProductOption', @level2type = N'COLUMN', @level2name = N'Code';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Name shown to staff and buyers.', @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'ProductOption', @level2type = N'COLUMN', @level2name = N'Name';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Order in which options are shown on a line.', @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'ProductOption', @level2type = N'COLUMN', @level2name = N'SortOrder';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'An inactive option is no longer offered on new lines. Lines that picked it keep their picks.', @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'ProductOption', @level2type = N'COLUMN', @level2name = N'IsActive';
GO


-- -----------------------------------------------------------------------------
-- 2. ProductOptionValue
-- -----------------------------------------------------------------------------
CREATE TABLE [${flyway:defaultSchema}].[ProductOptionValue] (
    [ID] UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    [ProductOptionID] UNIQUEIDENTIFIER NOT NULL,
    [Code] NVARCHAR(50) NOT NULL,
    [Label] NVARCHAR(200) NOT NULL,
    [SortOrder] INT NOT NULL DEFAULT 0,
    [IsActive] BIT NOT NULL DEFAULT 1,
    CONSTRAINT PK_ProductOptionValue PRIMARY KEY ([ID]),
    CONSTRAINT FK_ProductOptionValue_ProductOption FOREIGN KEY ([ProductOptionID])
        REFERENCES [${flyway:defaultSchema}].[ProductOption]([ID]),
    CONSTRAINT UQ_ProductOptionValue_Option_Code UNIQUE ([ProductOptionID], [Code]),
    CONSTRAINT CK_ProductOptionValue_Code CHECK (LEN([Code]) > 0)
);
GO

EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'One value of a product option, such as Pro for Tier. A value a line has used is deactivated, never deleted.', @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'ProductOptionValue';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Stable code for the value, compared by price rules (Option.TIER eq PRO) and recorded as the OptionValue of a pick. Unique within its option.', @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'ProductOptionValue', @level2type = N'COLUMN', @level2name = N'Code';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Label shown to staff and buyers. Copied onto the pick when the line is recorded, so a later rename does not change past orders.', @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'ProductOptionValue', @level2type = N'COLUMN', @level2name = N'Label';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Order in which values are shown.', @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'ProductOptionValue', @level2type = N'COLUMN', @level2name = N'SortOrder';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'An inactive value can no longer be picked on a new line.', @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'ProductOptionValue', @level2type = N'COLUMN', @level2name = N'IsActive';
GO


-- -----------------------------------------------------------------------------
-- 3. ProductOptionAssignment
-- -----------------------------------------------------------------------------
CREATE TABLE [${flyway:defaultSchema}].[ProductOptionAssignment] (
    [ID] UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    [ProductTypeID] UNIQUEIDENTIFIER NULL,
    [ProductCategoryID] UNIQUEIDENTIFIER NULL,
    [ProductID] UNIQUEIDENTIFIER NULL,
    [ProductOptionID] UNIQUEIDENTIFIER NOT NULL,
    [IsExcluded] BIT NOT NULL DEFAULT 0,
    [IsRequired] BIT NOT NULL DEFAULT 0,
    [DefaultProductOptionValueID] UNIQUEIDENTIFIER NULL,
    [SortOrder] INT NOT NULL DEFAULT 0,
    [Role] NVARCHAR(20) NOT NULL DEFAULT N'LineOption',
    CONSTRAINT PK_ProductOptionAssignment PRIMARY KEY ([ID]),
    CONSTRAINT FK_ProductOptionAssignment_ProductType FOREIGN KEY ([ProductTypeID])
        REFERENCES [${flyway:defaultSchema}].[ProductType]([ID]),
    CONSTRAINT FK_ProductOptionAssignment_ProductCategory FOREIGN KEY ([ProductCategoryID])
        REFERENCES [${flyway:defaultSchema}].[ProductCategory]([ID]),
    CONSTRAINT FK_ProductOptionAssignment_Product FOREIGN KEY ([ProductID])
        REFERENCES [${flyway:defaultSchema}].[Product]([ID]),
    CONSTRAINT FK_ProductOptionAssignment_ProductOption FOREIGN KEY ([ProductOptionID])
        REFERENCES [${flyway:defaultSchema}].[ProductOption]([ID]),
    CONSTRAINT FK_ProductOptionAssignment_DefaultValue FOREIGN KEY ([DefaultProductOptionValueID])
        REFERENCES [${flyway:defaultSchema}].[ProductOptionValue]([ID]),
    CONSTRAINT CK_ProductOptionAssignment_OneScope CHECK (
        (CASE WHEN [ProductTypeID] IS NULL THEN 0 ELSE 1 END)
      + (CASE WHEN [ProductCategoryID] IS NULL THEN 0 ELSE 1 END)
      + (CASE WHEN [ProductID] IS NULL THEN 0 ELSE 1 END) = 1),
    CONSTRAINT CK_ProductOptionAssignment_Role CHECK ([Role] IN (N'LineOption', N'Variant'))
);
GO

CREATE UNIQUE INDEX [UX_ProductOptionAssignment_Type_Option]
    ON [${flyway:defaultSchema}].[ProductOptionAssignment] ([ProductTypeID], [ProductOptionID])
    WHERE [ProductTypeID] IS NOT NULL;
GO

CREATE UNIQUE INDEX [UX_ProductOptionAssignment_Category_Option]
    ON [${flyway:defaultSchema}].[ProductOptionAssignment] ([ProductCategoryID], [ProductOptionID])
    WHERE [ProductCategoryID] IS NOT NULL;
GO

CREATE UNIQUE INDEX [UX_ProductOptionAssignment_Product_Option]
    ON [${flyway:defaultSchema}].[ProductOptionAssignment] ([ProductID], [ProductOptionID])
    WHERE [ProductID] IS NOT NULL;
GO

EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Offers an option on a product type, a category (and everything below it) or one product. For each option the most specific assignment wins whole: product, then the nearest category, then the type.', @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'ProductOptionAssignment';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Set for a type-level default. Only a shared option may be assigned here. Exactly one of ProductTypeID, ProductCategoryID and ProductID is set.', @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'ProductOptionAssignment', @level2type = N'COLUMN', @level2name = N'ProductTypeID';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Set for a category-level assignment, inherited by every subcategory and product below it.', @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'ProductOptionAssignment', @level2type = N'COLUMN', @level2name = N'ProductCategoryID';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Set for a product-level assignment, which has the final say.', @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'ProductOptionAssignment', @level2type = N'COLUMN', @level2name = N'ProductID';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Removes an inherited option at this level and below, until a more specific assignment offers it again.', @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'ProductOptionAssignment', @level2type = N'COLUMN', @level2name = N'IsExcluded';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'A line for the product cannot be saved or priced without a pick for this option.', @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'ProductOptionAssignment', @level2type = N'COLUMN', @level2name = N'IsRequired';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Value a new line starts with; staff or the buyer can change it. Must be one of the allowed values.', @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'ProductOptionAssignment', @level2type = N'COLUMN', @level2name = N'DefaultProductOptionValueID';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Order in which this option is shown on a line.', @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'ProductOptionAssignment', @level2type = N'COLUMN', @level2name = N'SortOrder';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'LineOption: picked on the order line. Variant: the option defines a separate SKU; not supported yet and refused on save.', @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'ProductOptionAssignment', @level2type = N'COLUMN', @level2name = N'Role';
GO


-- -----------------------------------------------------------------------------
-- 4. ProductOptionAssignmentValue
-- -----------------------------------------------------------------------------
CREATE TABLE [${flyway:defaultSchema}].[ProductOptionAssignmentValue] (
    [ID] UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    [ProductOptionAssignmentID] UNIQUEIDENTIFIER NOT NULL,
    [ProductOptionValueID] UNIQUEIDENTIFIER NOT NULL,
    CONSTRAINT PK_ProductOptionAssignmentValue PRIMARY KEY ([ID]),
    CONSTRAINT FK_ProductOptionAssignmentValue_Assignment FOREIGN KEY ([ProductOptionAssignmentID])
        REFERENCES [${flyway:defaultSchema}].[ProductOptionAssignment]([ID]),
    CONSTRAINT FK_ProductOptionAssignmentValue_Value FOREIGN KEY ([ProductOptionValueID])
        REFERENCES [${flyway:defaultSchema}].[ProductOptionValue]([ID]),
    CONSTRAINT UQ_ProductOptionAssignmentValue_Pair UNIQUE ([ProductOptionAssignmentID], [ProductOptionValueID])
);
GO

EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'A value an option assignment allows. An assignment with no rows here allows every active value of its option.', @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'ProductOptionAssignmentValue';
GO


-- -----------------------------------------------------------------------------
-- 5. ProductSuccessorOptionValue
-- -----------------------------------------------------------------------------
CREATE TABLE [${flyway:defaultSchema}].[ProductSuccessorOptionValue] (
    [ID] UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    [ProductID] UNIQUEIDENTIFIER NOT NULL,
    [ProductOptionID] UNIQUEIDENTIFIER NOT NULL,
    [ProductOptionValueID] UNIQUEIDENTIFIER NOT NULL,
    CONSTRAINT PK_ProductSuccessorOptionValue PRIMARY KEY ([ID]),
    CONSTRAINT FK_ProductSuccessorOptionValue_Product FOREIGN KEY ([ProductID])
        REFERENCES [${flyway:defaultSchema}].[Product]([ID]),
    CONSTRAINT FK_ProductSuccessorOptionValue_Option FOREIGN KEY ([ProductOptionID])
        REFERENCES [${flyway:defaultSchema}].[ProductOption]([ID]),
    CONSTRAINT FK_ProductSuccessorOptionValue_Value FOREIGN KEY ([ProductOptionValueID])
        REFERENCES [${flyway:defaultSchema}].[ProductOptionValue]([ID]),
    CONSTRAINT UQ_ProductSuccessorOptionValue_Product_Option UNIQUE ([ProductID], [ProductOptionID])
);
GO

EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'The pick a renewal line takes when a subscription moves from this product to its successor product. Lets one product per combination be retired onto one product with options: the retired product names its successor and the tier and size it stood for.', @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'ProductSuccessorOptionValue';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'The product being moved away from, whose SuccessorProductID names the product the renewal books on.', @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'ProductSuccessorOptionValue', @level2type = N'COLUMN', @level2name = N'ProductID';
GO


-- -----------------------------------------------------------------------------
-- 6. Variant SKUs: Product.ParentProductID and ProductVariantValue
-- -----------------------------------------------------------------------------
ALTER TABLE [${flyway:defaultSchema}].[Product]
    ADD [ParentProductID] UNIQUEIDENTIFIER NULL
            CONSTRAINT FK_Product_ParentProduct FOREIGN KEY REFERENCES [${flyway:defaultSchema}].[Product]([ID]),
        CONSTRAINT CK_Product_NoSelfParent CHECK ([ParentProductID] IS NULL OR [ParentProductID] <> [ID]);
GO

EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'For a variant SKU, the product it is a variant of. One level only. Not supported yet: refused on save until the pricing, tax and entitlement walks use it.', @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'Product', @level2type = N'COLUMN', @level2name = N'ParentProductID';
GO

CREATE TABLE [${flyway:defaultSchema}].[ProductVariantValue] (
    [ID] UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    [ProductID] UNIQUEIDENTIFIER NOT NULL,
    [ProductOptionID] UNIQUEIDENTIFIER NOT NULL,
    [ProductOptionValueID] UNIQUEIDENTIFIER NOT NULL,
    CONSTRAINT PK_ProductVariantValue PRIMARY KEY ([ID]),
    CONSTRAINT FK_ProductVariantValue_Product FOREIGN KEY ([ProductID])
        REFERENCES [${flyway:defaultSchema}].[Product]([ID]),
    CONSTRAINT FK_ProductVariantValue_Option FOREIGN KEY ([ProductOptionID])
        REFERENCES [${flyway:defaultSchema}].[ProductOption]([ID]),
    CONSTRAINT FK_ProductVariantValue_Value FOREIGN KEY ([ProductOptionValueID])
        REFERENCES [${flyway:defaultSchema}].[ProductOptionValue]([ID]),
    CONSTRAINT UQ_ProductVariantValue_Product_Option UNIQUE ([ProductID], [ProductOptionID])
);
GO

EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'The value a variant SKU has on one option, such as Size L for one shirt variant. Not supported yet: refused on save.', @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'ProductVariantValue';
GO


-- -----------------------------------------------------------------------------
-- 7. OrderLineChoice: option picks
-- -----------------------------------------------------------------------------
ALTER TABLE [${flyway:defaultSchema}].[OrderLineChoice]
    ADD [ProductOptionID] UNIQUEIDENTIFIER NULL
            CONSTRAINT FK_OrderLineChoice_ProductOption FOREIGN KEY REFERENCES [${flyway:defaultSchema}].[ProductOption]([ID]),
        [ProductOptionValueID] UNIQUEIDENTIFIER NULL
            CONSTRAINT FK_OrderLineChoice_ProductOptionValue FOREIGN KEY REFERENCES [${flyway:defaultSchema}].[ProductOptionValue]([ID]),
        CONSTRAINT CK_OrderLineChoice_OptionPaired CHECK (
            ([ProductOptionID] IS NULL AND [ProductOptionValueID] IS NULL)
         OR ([ProductOptionID] IS NOT NULL AND [ProductOptionValueID] IS NOT NULL));
GO

CREATE UNIQUE INDEX [UX_OrderLineChoice_Line_Option]
    ON [${flyway:defaultSchema}].[OrderLineChoice] ([OrderLineID], [ProductOptionID])
    WHERE [ProductOptionID] IS NOT NULL;
GO

EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'For a product option pick, the option it answers; GroupKey is then the option code. Empty for a checkout-widget choice.', @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'OrderLineChoice', @level2type = N'COLUMN', @level2name = N'ProductOptionID';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'For a product option pick, the value picked; OptionValue is then the value code. Set together with ProductOptionID.', @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'OrderLineChoice', @level2type = N'COLUMN', @level2name = N'ProductOptionValueID';
GO


-- -----------------------------------------------------------------------------
-- 8. ProductEntitlement: one code per pick
-- -----------------------------------------------------------------------------
ALTER TABLE [${flyway:defaultSchema}].[ProductEntitlement]
    DROP CONSTRAINT UQ_ProductEntitlement_Product_Code;
GO

CREATE UNIQUE INDEX [UX_ProductEntitlement_Product_Code_Unconditional]
    ON [${flyway:defaultSchema}].[ProductEntitlement] ([ProductID], [Code])
    WHERE [ChoiceGroupKey] IS NULL;
GO

CREATE UNIQUE INDEX [UX_ProductEntitlement_Product_Code_Conditional]
    ON [${flyway:defaultSchema}].[ProductEntitlement] ([ProductID], [Code], [ChoiceGroupKey], [ChoiceOptionValue])
    WHERE [ChoiceGroupKey] IS NOT NULL;
GO


-- -----------------------------------------------------------------------------
-- 9. trg_OrderLineChoice_ImmutableAfterConfirm
-- -----------------------------------------------------------------------------
-- Covers option picks only (ProductOptionID set, before or after the change).
-- Checkout-widget choices are written in the graph that confirms the order, so
-- they are left to the application as before. Inserting a pick onto a booked line
-- is refused by the order line server, which already refuses new lines on a
-- booked order.
CREATE TRIGGER [${flyway:defaultSchema}].[trg_OrderLineChoice_ImmutableAfterConfirm]
ON [${flyway:defaultSchema}].[OrderLineChoice]
AFTER UPDATE, DELETE
AS
BEGIN
    -- The __mj_UpdatedAt trigger's nested UPDATE: the outer call checks these rows.
    IF TRIGGER_NESTLEVEL(OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateOrderLineChoice]')) > 0 RETURN;

    SET NOCOUNT ON;
    IF NOT EXISTS (SELECT 1 FROM inserted) AND NOT EXISTS (SELECT 1 FROM deleted) RETURN;

    IF EXISTS (
        SELECT 1
        FROM deleted d
        INNER JOIN [${flyway:defaultSchema}].[OrderLine] l ON l.ID = d.OrderLineID
        INNER JOIN [${flyway:defaultSchema}].[OrderHeader] o ON o.ID = l.OrderHeaderID
        LEFT JOIN inserted i ON i.ID = d.ID
        WHERE o.Status = 'Confirmed'
          AND (d.ProductOptionID IS NOT NULL OR i.ProductOptionID IS NOT NULL)
          AND (i.ID IS NULL
               OR i.OrderLineID <> d.OrderLineID
               OR i.GroupKey <> d.GroupKey
               OR i.OptionValue <> d.OptionValue
               OR ISNULL(CAST(i.ProductOptionID AS NVARCHAR(36)), N'') <> ISNULL(CAST(d.ProductOptionID AS NVARCHAR(36)), N'')
               OR ISNULL(CAST(i.ProductOptionValueID AS NVARCHAR(36)), N'') <> ISNULL(CAST(d.ProductOptionValueID AS NVARCHAR(36)), N''))
    )
        THROW 51034, 'An option pick on a line of a Confirmed order cannot be changed or deleted: it decided the line''s price and entitlements. Use a reversal order, or change the pick on the renewal while it is a draft.', 1;
END;
GO


















































-- =============================================================================
--
--   CODEGEN OUTPUT — GENERATED CODE BELOW THIS LINE (do not hand-edit)
--
--   Produced by MJ CodeGen 6.2.1 against a database built from migrations alone,
--   with the hand-authored DDL above applied. Contains the six new entities
--   (metadata, fields, relationships, views, CRUD procs, triggers, validators,
--   permissions) and the regenerated Products, Event Products and Order Line
--   Choices objects for their new columns.
--   Left out: SQL the same run re-emitted for entities this migration does not
--   touch, and the SuccessorProductID hierarchy functions (and their columns in
--   vwProducts) that CodeGen re-adds whenever it regenerates vwProducts;
--   V202608182055 removed them because succession is a pointer, not a tree.
--
-- =============================================================================


/* SQL generated to create new entity MJ_BizApps_Orders: Product Options */

      INSERT INTO [${mjSchema}].[Entity] (
         [ID],
         [Name],
         [DisplayName],
         [Description],
         [NameSuffix],
         [BaseTable],
         [BaseView],
         [SchemaName],
         [IncludeInAPI],
         [AllowUserSearchAPI],
         [AllowCaching],
         [TrackRecordChanges],
         [AuditRecordAccess],
         [AuditViewRuns],
         [AllowAllRowsAPI],
         [AllowCreateAPI],
         [AllowUpdateAPI],
         [AllowDeleteAPI],
         [UserViewMaxRows]
         , [__mj_CreatedAt]
         , [__mj_UpdatedAt]
      )
      VALUES (
         'f27481bd-a0da-47f7-a985-fa3c24fcccb7',
         'MJ_BizApps_Orders: Product Options',
         'Product Options',
         'A choice a buyer makes on a line, such as Tier or Size. Its values are in Product Option Values; which products offer it is set by Product Option Assignments.',
         NULL,
         'ProductOption',
         'vwProductOptions',
         '${flyway:defaultSchema}',
         1,
         1,
         0,
         1,
         0,
         0,
         0,
         1,
         1,
         1,
         1000
         , GETUTCDATE()
         , GETUTCDATE()
      );

/* SQL generated to add entity MJ_BizApps_Orders: Product Options to application ID: 'FB80FEB4-5505-49D1-93CE-2E7BD030B478' */
INSERT INTO [${mjSchema}].[ApplicationEntity]
                                    ([ApplicationID], [EntityID], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                    ('FB80FEB4-5505-49D1-93CE-2E7BD030B478', 'f27481bd-a0da-47f7-a985-fa3c24fcccb7', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [${mjSchema}].[ApplicationEntity] WHERE [ApplicationID] = 'FB80FEB4-5505-49D1-93CE-2E7BD030B478'), GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ_BizApps_Orders: Product Options for role UI */
INSERT INTO [${mjSchema}].[EntityPermission]
                ([EntityID], [RoleID], [Type], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt])
              SELECT CAST('f27481bd-a0da-47f7-a985-fa3c24fcccb7' AS uniqueidentifier), CAST('E0AFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier), 'Allow', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE()
              WHERE NOT EXISTS (
                SELECT 1 FROM [${mjSchema}].[EntityPermission]
                WHERE [EntityID] = CAST('f27481bd-a0da-47f7-a985-fa3c24fcccb7' AS uniqueidentifier) AND [RoleID] = CAST('E0AFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier) AND [Type] = 'Allow'
              );

/* SQL generated to add new permission for entity MJ_BizApps_Orders: Product Options for role Developer */
INSERT INTO [${mjSchema}].[EntityPermission]
                ([EntityID], [RoleID], [Type], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt])
              SELECT CAST('f27481bd-a0da-47f7-a985-fa3c24fcccb7' AS uniqueidentifier), CAST('DEAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier), 'Allow', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE()
              WHERE NOT EXISTS (
                SELECT 1 FROM [${mjSchema}].[EntityPermission]
                WHERE [EntityID] = CAST('f27481bd-a0da-47f7-a985-fa3c24fcccb7' AS uniqueidentifier) AND [RoleID] = CAST('DEAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier) AND [Type] = 'Allow'
              );

/* SQL generated to add new permission for entity MJ_BizApps_Orders: Product Options for role Integration */
INSERT INTO [${mjSchema}].[EntityPermission]
                ([EntityID], [RoleID], [Type], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt])
              SELECT CAST('f27481bd-a0da-47f7-a985-fa3c24fcccb7' AS uniqueidentifier), CAST('DFAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier), 'Allow', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE()
              WHERE NOT EXISTS (
                SELECT 1 FROM [${mjSchema}].[EntityPermission]
                WHERE [EntityID] = CAST('f27481bd-a0da-47f7-a985-fa3c24fcccb7' AS uniqueidentifier) AND [RoleID] = CAST('DFAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier) AND [Type] = 'Allow'
              );

/* SQL generated to create new entity MJ_BizApps_Orders: Product Option Values */

      INSERT INTO [${mjSchema}].[Entity] (
         [ID],
         [Name],
         [DisplayName],
         [Description],
         [NameSuffix],
         [BaseTable],
         [BaseView],
         [SchemaName],
         [IncludeInAPI],
         [AllowUserSearchAPI],
         [AllowCaching],
         [TrackRecordChanges],
         [AuditRecordAccess],
         [AuditViewRuns],
         [AllowAllRowsAPI],
         [AllowCreateAPI],
         [AllowUpdateAPI],
         [AllowDeleteAPI],
         [UserViewMaxRows]
         , [__mj_CreatedAt]
         , [__mj_UpdatedAt]
      )
      VALUES (
         '28f5b3d1-d0e5-4c52-aad0-0436287f32ce',
         'MJ_BizApps_Orders: Product Option Values',
         'Product Option Values',
         'One value of a product option, such as Pro for Tier. A value a line has used is deactivated, never deleted.',
         NULL,
         'ProductOptionValue',
         'vwProductOptionValues',
         '${flyway:defaultSchema}',
         1,
         1,
         0,
         1,
         0,
         0,
         0,
         1,
         1,
         1,
         1000
         , GETUTCDATE()
         , GETUTCDATE()
      );

/* SQL generated to add entity MJ_BizApps_Orders: Product Option Values to application ID: 'FB80FEB4-5505-49D1-93CE-2E7BD030B478' */
INSERT INTO [${mjSchema}].[ApplicationEntity]
                                    ([ApplicationID], [EntityID], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                    ('FB80FEB4-5505-49D1-93CE-2E7BD030B478', '28f5b3d1-d0e5-4c52-aad0-0436287f32ce', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [${mjSchema}].[ApplicationEntity] WHERE [ApplicationID] = 'FB80FEB4-5505-49D1-93CE-2E7BD030B478'), GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ_BizApps_Orders: Product Option Values for role UI */
INSERT INTO [${mjSchema}].[EntityPermission]
                ([EntityID], [RoleID], [Type], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt])
              SELECT CAST('28f5b3d1-d0e5-4c52-aad0-0436287f32ce' AS uniqueidentifier), CAST('E0AFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier), 'Allow', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE()
              WHERE NOT EXISTS (
                SELECT 1 FROM [${mjSchema}].[EntityPermission]
                WHERE [EntityID] = CAST('28f5b3d1-d0e5-4c52-aad0-0436287f32ce' AS uniqueidentifier) AND [RoleID] = CAST('E0AFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier) AND [Type] = 'Allow'
              );

/* SQL generated to add new permission for entity MJ_BizApps_Orders: Product Option Values for role Developer */
INSERT INTO [${mjSchema}].[EntityPermission]
                ([EntityID], [RoleID], [Type], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt])
              SELECT CAST('28f5b3d1-d0e5-4c52-aad0-0436287f32ce' AS uniqueidentifier), CAST('DEAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier), 'Allow', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE()
              WHERE NOT EXISTS (
                SELECT 1 FROM [${mjSchema}].[EntityPermission]
                WHERE [EntityID] = CAST('28f5b3d1-d0e5-4c52-aad0-0436287f32ce' AS uniqueidentifier) AND [RoleID] = CAST('DEAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier) AND [Type] = 'Allow'
              );

/* SQL generated to add new permission for entity MJ_BizApps_Orders: Product Option Values for role Integration */
INSERT INTO [${mjSchema}].[EntityPermission]
                ([EntityID], [RoleID], [Type], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt])
              SELECT CAST('28f5b3d1-d0e5-4c52-aad0-0436287f32ce' AS uniqueidentifier), CAST('DFAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier), 'Allow', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE()
              WHERE NOT EXISTS (
                SELECT 1 FROM [${mjSchema}].[EntityPermission]
                WHERE [EntityID] = CAST('28f5b3d1-d0e5-4c52-aad0-0436287f32ce' AS uniqueidentifier) AND [RoleID] = CAST('DFAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier) AND [Type] = 'Allow'
              );

/* SQL generated to create new entity MJ_BizApps_Orders: Product Option Assignments */

      INSERT INTO [${mjSchema}].[Entity] (
         [ID],
         [Name],
         [DisplayName],
         [Description],
         [NameSuffix],
         [BaseTable],
         [BaseView],
         [SchemaName],
         [IncludeInAPI],
         [AllowUserSearchAPI],
         [AllowCaching],
         [TrackRecordChanges],
         [AuditRecordAccess],
         [AuditViewRuns],
         [AllowAllRowsAPI],
         [AllowCreateAPI],
         [AllowUpdateAPI],
         [AllowDeleteAPI],
         [UserViewMaxRows]
         , [__mj_CreatedAt]
         , [__mj_UpdatedAt]
      )
      VALUES (
         '70e4b251-16ee-452b-b2e2-621c4e416609',
         'MJ_BizApps_Orders: Product Option Assignments',
         'Product Option Assignments',
         'Offers an option on a product type, a category (and everything below it) or one product. For each option the most specific assignment wins whole: product, then the nearest category, then the type.',
         NULL,
         'ProductOptionAssignment',
         'vwProductOptionAssignments',
         '${flyway:defaultSchema}',
         1,
         1,
         0,
         1,
         0,
         0,
         0,
         1,
         1,
         1,
         1000
         , GETUTCDATE()
         , GETUTCDATE()
      );

/* SQL generated to add entity MJ_BizApps_Orders: Product Option Assignments to application ID: 'FB80FEB4-5505-49D1-93CE-2E7BD030B478' */
INSERT INTO [${mjSchema}].[ApplicationEntity]
                                    ([ApplicationID], [EntityID], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                    ('FB80FEB4-5505-49D1-93CE-2E7BD030B478', '70e4b251-16ee-452b-b2e2-621c4e416609', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [${mjSchema}].[ApplicationEntity] WHERE [ApplicationID] = 'FB80FEB4-5505-49D1-93CE-2E7BD030B478'), GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ_BizApps_Orders: Product Option Assignments for role UI */
INSERT INTO [${mjSchema}].[EntityPermission]
                ([EntityID], [RoleID], [Type], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt])
              SELECT CAST('70e4b251-16ee-452b-b2e2-621c4e416609' AS uniqueidentifier), CAST('E0AFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier), 'Allow', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE()
              WHERE NOT EXISTS (
                SELECT 1 FROM [${mjSchema}].[EntityPermission]
                WHERE [EntityID] = CAST('70e4b251-16ee-452b-b2e2-621c4e416609' AS uniqueidentifier) AND [RoleID] = CAST('E0AFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier) AND [Type] = 'Allow'
              );

/* SQL generated to add new permission for entity MJ_BizApps_Orders: Product Option Assignments for role Developer */
INSERT INTO [${mjSchema}].[EntityPermission]
                ([EntityID], [RoleID], [Type], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt])
              SELECT CAST('70e4b251-16ee-452b-b2e2-621c4e416609' AS uniqueidentifier), CAST('DEAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier), 'Allow', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE()
              WHERE NOT EXISTS (
                SELECT 1 FROM [${mjSchema}].[EntityPermission]
                WHERE [EntityID] = CAST('70e4b251-16ee-452b-b2e2-621c4e416609' AS uniqueidentifier) AND [RoleID] = CAST('DEAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier) AND [Type] = 'Allow'
              );

/* SQL generated to add new permission for entity MJ_BizApps_Orders: Product Option Assignments for role Integration */
INSERT INTO [${mjSchema}].[EntityPermission]
                ([EntityID], [RoleID], [Type], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt])
              SELECT CAST('70e4b251-16ee-452b-b2e2-621c4e416609' AS uniqueidentifier), CAST('DFAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier), 'Allow', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE()
              WHERE NOT EXISTS (
                SELECT 1 FROM [${mjSchema}].[EntityPermission]
                WHERE [EntityID] = CAST('70e4b251-16ee-452b-b2e2-621c4e416609' AS uniqueidentifier) AND [RoleID] = CAST('DFAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier) AND [Type] = 'Allow'
              );

/* SQL generated to create new entity MJ_BizApps_Orders: Product Option Assignment Values */

      INSERT INTO [${mjSchema}].[Entity] (
         [ID],
         [Name],
         [DisplayName],
         [Description],
         [NameSuffix],
         [BaseTable],
         [BaseView],
         [SchemaName],
         [IncludeInAPI],
         [AllowUserSearchAPI],
         [AllowCaching],
         [TrackRecordChanges],
         [AuditRecordAccess],
         [AuditViewRuns],
         [AllowAllRowsAPI],
         [AllowCreateAPI],
         [AllowUpdateAPI],
         [AllowDeleteAPI],
         [UserViewMaxRows]
         , [__mj_CreatedAt]
         , [__mj_UpdatedAt]
      )
      VALUES (
         '677fd08d-f1d8-46c3-84a7-3f16f6e51806',
         'MJ_BizApps_Orders: Product Option Assignment Values',
         'Product Option Assignment Values',
         'A value an option assignment allows. An assignment with no rows here allows every active value of its option.',
         NULL,
         'ProductOptionAssignmentValue',
         'vwProductOptionAssignmentValues',
         '${flyway:defaultSchema}',
         1,
         1,
         0,
         1,
         0,
         0,
         0,
         1,
         1,
         1,
         1000
         , GETUTCDATE()
         , GETUTCDATE()
      );

/* SQL generated to add entity MJ_BizApps_Orders: Product Option Assignment Values to application ID: 'FB80FEB4-5505-49D1-93CE-2E7BD030B478' */
INSERT INTO [${mjSchema}].[ApplicationEntity]
                                    ([ApplicationID], [EntityID], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                    ('FB80FEB4-5505-49D1-93CE-2E7BD030B478', '677fd08d-f1d8-46c3-84a7-3f16f6e51806', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [${mjSchema}].[ApplicationEntity] WHERE [ApplicationID] = 'FB80FEB4-5505-49D1-93CE-2E7BD030B478'), GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ_BizApps_Orders: Product Option Assignment Values for role UI */
INSERT INTO [${mjSchema}].[EntityPermission]
                ([EntityID], [RoleID], [Type], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt])
              SELECT CAST('677fd08d-f1d8-46c3-84a7-3f16f6e51806' AS uniqueidentifier), CAST('E0AFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier), 'Allow', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE()
              WHERE NOT EXISTS (
                SELECT 1 FROM [${mjSchema}].[EntityPermission]
                WHERE [EntityID] = CAST('677fd08d-f1d8-46c3-84a7-3f16f6e51806' AS uniqueidentifier) AND [RoleID] = CAST('E0AFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier) AND [Type] = 'Allow'
              );

/* SQL generated to add new permission for entity MJ_BizApps_Orders: Product Option Assignment Values for role Developer */
INSERT INTO [${mjSchema}].[EntityPermission]
                ([EntityID], [RoleID], [Type], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt])
              SELECT CAST('677fd08d-f1d8-46c3-84a7-3f16f6e51806' AS uniqueidentifier), CAST('DEAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier), 'Allow', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE()
              WHERE NOT EXISTS (
                SELECT 1 FROM [${mjSchema}].[EntityPermission]
                WHERE [EntityID] = CAST('677fd08d-f1d8-46c3-84a7-3f16f6e51806' AS uniqueidentifier) AND [RoleID] = CAST('DEAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier) AND [Type] = 'Allow'
              );

/* SQL generated to add new permission for entity MJ_BizApps_Orders: Product Option Assignment Values for role Integration */
INSERT INTO [${mjSchema}].[EntityPermission]
                ([EntityID], [RoleID], [Type], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt])
              SELECT CAST('677fd08d-f1d8-46c3-84a7-3f16f6e51806' AS uniqueidentifier), CAST('DFAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier), 'Allow', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE()
              WHERE NOT EXISTS (
                SELECT 1 FROM [${mjSchema}].[EntityPermission]
                WHERE [EntityID] = CAST('677fd08d-f1d8-46c3-84a7-3f16f6e51806' AS uniqueidentifier) AND [RoleID] = CAST('DFAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier) AND [Type] = 'Allow'
              );

/* SQL generated to create new entity MJ_BizApps_Orders: Product Successor Option Values */

      INSERT INTO [${mjSchema}].[Entity] (
         [ID],
         [Name],
         [DisplayName],
         [Description],
         [NameSuffix],
         [BaseTable],
         [BaseView],
         [SchemaName],
         [IncludeInAPI],
         [AllowUserSearchAPI],
         [AllowCaching],
         [TrackRecordChanges],
         [AuditRecordAccess],
         [AuditViewRuns],
         [AllowAllRowsAPI],
         [AllowCreateAPI],
         [AllowUpdateAPI],
         [AllowDeleteAPI],
         [UserViewMaxRows]
         , [__mj_CreatedAt]
         , [__mj_UpdatedAt]
      )
      VALUES (
         '279ce520-5127-4fc5-be4d-dde4e415852f',
         'MJ_BizApps_Orders: Product Successor Option Values',
         'Product Successor Option Values',
         'The pick a renewal line takes when a subscription moves from this product to its successor product. Lets one product per combination be retired onto one product with options: the retired product names its successor and the tier and size it stood for.',
         NULL,
         'ProductSuccessorOptionValue',
         'vwProductSuccessorOptionValues',
         '${flyway:defaultSchema}',
         1,
         1,
         0,
         1,
         0,
         0,
         0,
         1,
         1,
         1,
         1000
         , GETUTCDATE()
         , GETUTCDATE()
      );

/* SQL generated to add entity MJ_BizApps_Orders: Product Successor Option Values to application ID: 'FB80FEB4-5505-49D1-93CE-2E7BD030B478' */
INSERT INTO [${mjSchema}].[ApplicationEntity]
                                    ([ApplicationID], [EntityID], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                    ('FB80FEB4-5505-49D1-93CE-2E7BD030B478', '279ce520-5127-4fc5-be4d-dde4e415852f', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [${mjSchema}].[ApplicationEntity] WHERE [ApplicationID] = 'FB80FEB4-5505-49D1-93CE-2E7BD030B478'), GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ_BizApps_Orders: Product Successor Option Values for role UI */
INSERT INTO [${mjSchema}].[EntityPermission]
                ([EntityID], [RoleID], [Type], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt])
              SELECT CAST('279ce520-5127-4fc5-be4d-dde4e415852f' AS uniqueidentifier), CAST('E0AFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier), 'Allow', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE()
              WHERE NOT EXISTS (
                SELECT 1 FROM [${mjSchema}].[EntityPermission]
                WHERE [EntityID] = CAST('279ce520-5127-4fc5-be4d-dde4e415852f' AS uniqueidentifier) AND [RoleID] = CAST('E0AFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier) AND [Type] = 'Allow'
              );

/* SQL generated to add new permission for entity MJ_BizApps_Orders: Product Successor Option Values for role Developer */
INSERT INTO [${mjSchema}].[EntityPermission]
                ([EntityID], [RoleID], [Type], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt])
              SELECT CAST('279ce520-5127-4fc5-be4d-dde4e415852f' AS uniqueidentifier), CAST('DEAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier), 'Allow', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE()
              WHERE NOT EXISTS (
                SELECT 1 FROM [${mjSchema}].[EntityPermission]
                WHERE [EntityID] = CAST('279ce520-5127-4fc5-be4d-dde4e415852f' AS uniqueidentifier) AND [RoleID] = CAST('DEAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier) AND [Type] = 'Allow'
              );

/* SQL generated to add new permission for entity MJ_BizApps_Orders: Product Successor Option Values for role Integration */
INSERT INTO [${mjSchema}].[EntityPermission]
                ([EntityID], [RoleID], [Type], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt])
              SELECT CAST('279ce520-5127-4fc5-be4d-dde4e415852f' AS uniqueidentifier), CAST('DFAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier), 'Allow', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE()
              WHERE NOT EXISTS (
                SELECT 1 FROM [${mjSchema}].[EntityPermission]
                WHERE [EntityID] = CAST('279ce520-5127-4fc5-be4d-dde4e415852f' AS uniqueidentifier) AND [RoleID] = CAST('DFAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier) AND [Type] = 'Allow'
              );

/* SQL generated to create new entity MJ_BizApps_Orders: Product Variant Values */

      INSERT INTO [${mjSchema}].[Entity] (
         [ID],
         [Name],
         [DisplayName],
         [Description],
         [NameSuffix],
         [BaseTable],
         [BaseView],
         [SchemaName],
         [IncludeInAPI],
         [AllowUserSearchAPI],
         [AllowCaching],
         [TrackRecordChanges],
         [AuditRecordAccess],
         [AuditViewRuns],
         [AllowAllRowsAPI],
         [AllowCreateAPI],
         [AllowUpdateAPI],
         [AllowDeleteAPI],
         [UserViewMaxRows]
         , [__mj_CreatedAt]
         , [__mj_UpdatedAt]
      )
      VALUES (
         '08cbd324-07b9-4b35-873b-368f90ebb601',
         'MJ_BizApps_Orders: Product Variant Values',
         'Product Variant Values',
         'The value a variant SKU has on one option, such as Size L for one shirt variant. Not supported yet: refused on save.',
         NULL,
         'ProductVariantValue',
         'vwProductVariantValues',
         '${flyway:defaultSchema}',
         1,
         1,
         0,
         1,
         0,
         0,
         0,
         1,
         1,
         1,
         1000
         , GETUTCDATE()
         , GETUTCDATE()
      );

/* SQL generated to add entity MJ_BizApps_Orders: Product Variant Values to application ID: 'FB80FEB4-5505-49D1-93CE-2E7BD030B478' */
INSERT INTO [${mjSchema}].[ApplicationEntity]
                                    ([ApplicationID], [EntityID], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                    ('FB80FEB4-5505-49D1-93CE-2E7BD030B478', '08cbd324-07b9-4b35-873b-368f90ebb601', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [${mjSchema}].[ApplicationEntity] WHERE [ApplicationID] = 'FB80FEB4-5505-49D1-93CE-2E7BD030B478'), GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ_BizApps_Orders: Product Variant Values for role UI */
INSERT INTO [${mjSchema}].[EntityPermission]
                ([EntityID], [RoleID], [Type], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt])
              SELECT CAST('08cbd324-07b9-4b35-873b-368f90ebb601' AS uniqueidentifier), CAST('E0AFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier), 'Allow', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE()
              WHERE NOT EXISTS (
                SELECT 1 FROM [${mjSchema}].[EntityPermission]
                WHERE [EntityID] = CAST('08cbd324-07b9-4b35-873b-368f90ebb601' AS uniqueidentifier) AND [RoleID] = CAST('E0AFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier) AND [Type] = 'Allow'
              );

/* SQL generated to add new permission for entity MJ_BizApps_Orders: Product Variant Values for role Developer */
INSERT INTO [${mjSchema}].[EntityPermission]
                ([EntityID], [RoleID], [Type], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt])
              SELECT CAST('08cbd324-07b9-4b35-873b-368f90ebb601' AS uniqueidentifier), CAST('DEAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier), 'Allow', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE()
              WHERE NOT EXISTS (
                SELECT 1 FROM [${mjSchema}].[EntityPermission]
                WHERE [EntityID] = CAST('08cbd324-07b9-4b35-873b-368f90ebb601' AS uniqueidentifier) AND [RoleID] = CAST('DEAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier) AND [Type] = 'Allow'
              );

/* SQL generated to add new permission for entity MJ_BizApps_Orders: Product Variant Values for role Integration */
INSERT INTO [${mjSchema}].[EntityPermission]
                ([EntityID], [RoleID], [Type], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt])
              SELECT CAST('08cbd324-07b9-4b35-873b-368f90ebb601' AS uniqueidentifier), CAST('DFAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier), 'Allow', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE()
              WHERE NOT EXISTS (
                SELECT 1 FROM [${mjSchema}].[EntityPermission]
                WHERE [EntityID] = CAST('08cbd324-07b9-4b35-873b-368f90ebb601' AS uniqueidentifier) AND [RoleID] = CAST('DFAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier) AND [Type] = 'Allow'
              );

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.ProductOptionValue */
ALTER TABLE [${flyway:defaultSchema}].[ProductOptionValue] ADD [__mj_CreatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.ProductOptionValue */
UPDATE [${flyway:defaultSchema}].[ProductOptionValue] SET [__mj_CreatedAt] = GETUTCDATE() WHERE [__mj_CreatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.ProductOptionValue */
ALTER TABLE [${flyway:defaultSchema}].[ProductOptionValue] ALTER COLUMN [__mj_CreatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.ProductOptionValue */
ALTER TABLE [${flyway:defaultSchema}].[ProductOptionValue] ADD CONSTRAINT [DF___mj_BizAppsOrders_ProductOptionValue___mj_CreatedAt] DEFAULT GETUTCDATE() FOR [__mj_CreatedAt];
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.ProductOptionValue */
ALTER TABLE [${flyway:defaultSchema}].[ProductOptionValue] ADD [__mj_UpdatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.ProductOptionValue */
UPDATE [${flyway:defaultSchema}].[ProductOptionValue] SET [__mj_UpdatedAt] = GETUTCDATE() WHERE [__mj_UpdatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.ProductOptionValue */
ALTER TABLE [${flyway:defaultSchema}].[ProductOptionValue] ALTER COLUMN [__mj_UpdatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.ProductOptionValue */
ALTER TABLE [${flyway:defaultSchema}].[ProductOptionValue] ADD CONSTRAINT [DF___mj_BizAppsOrders_ProductOptionValue___mj_UpdatedAt] DEFAULT GETUTCDATE() FOR [__mj_UpdatedAt];
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.ProductVariantValue */
ALTER TABLE [${flyway:defaultSchema}].[ProductVariantValue] ADD [__mj_CreatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.ProductVariantValue */
UPDATE [${flyway:defaultSchema}].[ProductVariantValue] SET [__mj_CreatedAt] = GETUTCDATE() WHERE [__mj_CreatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.ProductVariantValue */
ALTER TABLE [${flyway:defaultSchema}].[ProductVariantValue] ALTER COLUMN [__mj_CreatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.ProductVariantValue */
ALTER TABLE [${flyway:defaultSchema}].[ProductVariantValue] ADD CONSTRAINT [DF___mj_BizAppsOrders_ProductVariantValue___mj_CreatedAt] DEFAULT GETUTCDATE() FOR [__mj_CreatedAt];
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.ProductVariantValue */
ALTER TABLE [${flyway:defaultSchema}].[ProductVariantValue] ADD [__mj_UpdatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.ProductVariantValue */
UPDATE [${flyway:defaultSchema}].[ProductVariantValue] SET [__mj_UpdatedAt] = GETUTCDATE() WHERE [__mj_UpdatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.ProductVariantValue */
ALTER TABLE [${flyway:defaultSchema}].[ProductVariantValue] ALTER COLUMN [__mj_UpdatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.ProductVariantValue */
ALTER TABLE [${flyway:defaultSchema}].[ProductVariantValue] ADD CONSTRAINT [DF___mj_BizAppsOrders_ProductVariantValue___mj_UpdatedAt] DEFAULT GETUTCDATE() FOR [__mj_UpdatedAt];
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.ProductOptionAssignmentValue */
ALTER TABLE [${flyway:defaultSchema}].[ProductOptionAssignmentValue] ADD [__mj_CreatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.ProductOptionAssignmentValue */
UPDATE [${flyway:defaultSchema}].[ProductOptionAssignmentValue] SET [__mj_CreatedAt] = GETUTCDATE() WHERE [__mj_CreatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.ProductOptionAssignmentValue */
ALTER TABLE [${flyway:defaultSchema}].[ProductOptionAssignmentValue] ALTER COLUMN [__mj_CreatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.ProductOptionAssignmentValue */
ALTER TABLE [${flyway:defaultSchema}].[ProductOptionAssignmentValue] ADD CONSTRAINT [DF___mj_BizAppsOrders_ProductOptionAssignmentValue___mj_CreatedAt] DEFAULT GETUTCDATE() FOR [__mj_CreatedAt];
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.ProductOptionAssignmentValue */
ALTER TABLE [${flyway:defaultSchema}].[ProductOptionAssignmentValue] ADD [__mj_UpdatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.ProductOptionAssignmentValue */
UPDATE [${flyway:defaultSchema}].[ProductOptionAssignmentValue] SET [__mj_UpdatedAt] = GETUTCDATE() WHERE [__mj_UpdatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.ProductOptionAssignmentValue */
ALTER TABLE [${flyway:defaultSchema}].[ProductOptionAssignmentValue] ALTER COLUMN [__mj_UpdatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.ProductOptionAssignmentValue */
ALTER TABLE [${flyway:defaultSchema}].[ProductOptionAssignmentValue] ADD CONSTRAINT [DF___mj_BizAppsOrders_ProductOptionAssignmentValue___mj_UpdatedAt] DEFAULT GETUTCDATE() FOR [__mj_UpdatedAt];
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.ProductOptionAssignment */
ALTER TABLE [${flyway:defaultSchema}].[ProductOptionAssignment] ADD [__mj_CreatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.ProductOptionAssignment */
UPDATE [${flyway:defaultSchema}].[ProductOptionAssignment] SET [__mj_CreatedAt] = GETUTCDATE() WHERE [__mj_CreatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.ProductOptionAssignment */
ALTER TABLE [${flyway:defaultSchema}].[ProductOptionAssignment] ALTER COLUMN [__mj_CreatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.ProductOptionAssignment */
ALTER TABLE [${flyway:defaultSchema}].[ProductOptionAssignment] ADD CONSTRAINT [DF___mj_BizAppsOrders_ProductOptionAssignment___mj_CreatedAt] DEFAULT GETUTCDATE() FOR [__mj_CreatedAt];
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.ProductOptionAssignment */
ALTER TABLE [${flyway:defaultSchema}].[ProductOptionAssignment] ADD [__mj_UpdatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.ProductOptionAssignment */
UPDATE [${flyway:defaultSchema}].[ProductOptionAssignment] SET [__mj_UpdatedAt] = GETUTCDATE() WHERE [__mj_UpdatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.ProductOptionAssignment */
ALTER TABLE [${flyway:defaultSchema}].[ProductOptionAssignment] ALTER COLUMN [__mj_UpdatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.ProductOptionAssignment */
ALTER TABLE [${flyway:defaultSchema}].[ProductOptionAssignment] ADD CONSTRAINT [DF___mj_BizAppsOrders_ProductOptionAssignment___mj_UpdatedAt] DEFAULT GETUTCDATE() FOR [__mj_UpdatedAt];
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.ProductSuccessorOptionValue */
ALTER TABLE [${flyway:defaultSchema}].[ProductSuccessorOptionValue] ADD [__mj_CreatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.ProductSuccessorOptionValue */
UPDATE [${flyway:defaultSchema}].[ProductSuccessorOptionValue] SET [__mj_CreatedAt] = GETUTCDATE() WHERE [__mj_CreatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.ProductSuccessorOptionValue */
ALTER TABLE [${flyway:defaultSchema}].[ProductSuccessorOptionValue] ALTER COLUMN [__mj_CreatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.ProductSuccessorOptionValue */
ALTER TABLE [${flyway:defaultSchema}].[ProductSuccessorOptionValue] ADD CONSTRAINT [DF___mj_BizAppsOrders_ProductSuccessorOptionValue___mj_CreatedAt] DEFAULT GETUTCDATE() FOR [__mj_CreatedAt];
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.ProductSuccessorOptionValue */
ALTER TABLE [${flyway:defaultSchema}].[ProductSuccessorOptionValue] ADD [__mj_UpdatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.ProductSuccessorOptionValue */
UPDATE [${flyway:defaultSchema}].[ProductSuccessorOptionValue] SET [__mj_UpdatedAt] = GETUTCDATE() WHERE [__mj_UpdatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.ProductSuccessorOptionValue */
ALTER TABLE [${flyway:defaultSchema}].[ProductSuccessorOptionValue] ALTER COLUMN [__mj_UpdatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.ProductSuccessorOptionValue */
ALTER TABLE [${flyway:defaultSchema}].[ProductSuccessorOptionValue] ADD CONSTRAINT [DF___mj_BizAppsOrders_ProductSuccessorOptionValue___mj_UpdatedAt] DEFAULT GETUTCDATE() FOR [__mj_UpdatedAt];
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.ProductOption */
ALTER TABLE [${flyway:defaultSchema}].[ProductOption] ADD [__mj_CreatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.ProductOption */
UPDATE [${flyway:defaultSchema}].[ProductOption] SET [__mj_CreatedAt] = GETUTCDATE() WHERE [__mj_CreatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.ProductOption */
ALTER TABLE [${flyway:defaultSchema}].[ProductOption] ALTER COLUMN [__mj_CreatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.ProductOption */
ALTER TABLE [${flyway:defaultSchema}].[ProductOption] ADD CONSTRAINT [DF___mj_BizAppsOrders_ProductOption___mj_CreatedAt] DEFAULT GETUTCDATE() FOR [__mj_CreatedAt];
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.ProductOption */
ALTER TABLE [${flyway:defaultSchema}].[ProductOption] ADD [__mj_UpdatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.ProductOption */
UPDATE [${flyway:defaultSchema}].[ProductOption] SET [__mj_UpdatedAt] = GETUTCDATE() WHERE [__mj_UpdatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.ProductOption */
ALTER TABLE [${flyway:defaultSchema}].[ProductOption] ALTER COLUMN [__mj_UpdatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.ProductOption */
ALTER TABLE [${flyway:defaultSchema}].[ProductOption] ADD CONSTRAINT [DF___mj_BizAppsOrders_ProductOption___mj_UpdatedAt] DEFAULT GETUTCDATE() FOR [__mj_UpdatedAt];
GO

/* SQL text to insert 49 new entity field(s) */

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '5017a87d-86bb-4ab1-a4dc-6d781b718639' OR (EntityID = '28F5B3D1-D0E5-4C52-AAD0-0436287F32CE' AND Name = 'ID')) BEGIN
         INSERT INTO [${mjSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '5017a87d-86bb-4ab1-a4dc-6d781b718639',
            '28F5B3D1-D0E5-4C52-AAD0-0436287F32CE', -- Entity: MJ_BizApps_Orders: Product Option Values
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${mjSchema}].[EntityField] WHERE [EntityID] = '28F5B3D1-D0E5-4C52-AAD0-0436287F32CE'),
            'ID',
            'ID',
            NULL,
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            'newsequentialid()',
            0,
            0,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            1,
            1,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '7f72f84b-c590-418b-b3fa-15d302326113' OR (EntityID = '28F5B3D1-D0E5-4C52-AAD0-0436287F32CE' AND Name = 'ProductOptionID')) BEGIN
         INSERT INTO [${mjSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '7f72f84b-c590-418b-b3fa-15d302326113',
            '28F5B3D1-D0E5-4C52-AAD0-0436287F32CE', -- Entity: MJ_BizApps_Orders: Product Option Values
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${mjSchema}].[EntityField] WHERE [EntityID] = '28F5B3D1-D0E5-4C52-AAD0-0436287F32CE'),
            'ProductOptionID',
            'Product Option ID',
            NULL,
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            NULL,
            0,
            1,
            0,
            0,
            'F27481BD-A0DA-47F7-A985-FA3C24FCCCB7',
            'ID',
            0,
            0,
            1,
            0,
            0,
            1,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = 'ff2a97b3-ddba-4efd-bfc4-8809ca91fbd3' OR (EntityID = '28F5B3D1-D0E5-4C52-AAD0-0436287F32CE' AND Name = 'Code')) BEGIN
         INSERT INTO [${mjSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'ff2a97b3-ddba-4efd-bfc4-8809ca91fbd3',
            '28F5B3D1-D0E5-4C52-AAD0-0436287F32CE', -- Entity: MJ_BizApps_Orders: Product Option Values
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${mjSchema}].[EntityField] WHERE [EntityID] = '28F5B3D1-D0E5-4C52-AAD0-0436287F32CE'),
            'Code',
            'Code',
            'Stable code for the value, compared by price rules (Option.TIER eq PRO) and recorded as the OptionValue of a pick. Unique within its option.',
            'nvarchar',
            100,
            0,
            0,
            0,
            NULL,
            0,
            1,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            1,
            0,
            1,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = 'b6bd8bea-17ac-49e9-92dd-19f583234770' OR (EntityID = '28F5B3D1-D0E5-4C52-AAD0-0436287F32CE' AND Name = 'Label')) BEGIN
         INSERT INTO [${mjSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'b6bd8bea-17ac-49e9-92dd-19f583234770',
            '28F5B3D1-D0E5-4C52-AAD0-0436287F32CE', -- Entity: MJ_BizApps_Orders: Product Option Values
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${mjSchema}].[EntityField] WHERE [EntityID] = '28F5B3D1-D0E5-4C52-AAD0-0436287F32CE'),
            'Label',
            'Label',
            'Label shown to staff and buyers. Copied onto the pick when the line is recorded, so a later rename does not change past orders.',
            'nvarchar',
            400,
            0,
            0,
            0,
            NULL,
            0,
            1,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            1,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '5b29d810-41ee-41b5-98b3-567c659e8ef7' OR (EntityID = '28F5B3D1-D0E5-4C52-AAD0-0436287F32CE' AND Name = 'SortOrder')) BEGIN
         INSERT INTO [${mjSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '5b29d810-41ee-41b5-98b3-567c659e8ef7',
            '28F5B3D1-D0E5-4C52-AAD0-0436287F32CE', -- Entity: MJ_BizApps_Orders: Product Option Values
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${mjSchema}].[EntityField] WHERE [EntityID] = '28F5B3D1-D0E5-4C52-AAD0-0436287F32CE'),
            'SortOrder',
            'Sort Order',
            'Order in which values are shown.',
            'int',
            4,
            10,
            0,
            0,
            '(0)',
            0,
            1,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            1,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = 'ce2d686f-1be4-4a89-b480-783da02afc23' OR (EntityID = '28F5B3D1-D0E5-4C52-AAD0-0436287F32CE' AND Name = 'IsActive')) BEGIN
         INSERT INTO [${mjSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'ce2d686f-1be4-4a89-b480-783da02afc23',
            '28F5B3D1-D0E5-4C52-AAD0-0436287F32CE', -- Entity: MJ_BizApps_Orders: Product Option Values
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${mjSchema}].[EntityField] WHERE [EntityID] = '28F5B3D1-D0E5-4C52-AAD0-0436287F32CE'),
            'IsActive',
            'Is Active',
            'An inactive value can no longer be picked on a new line.',
            'bit',
            1,
            1,
            0,
            0,
            '(1)',
            0,
            1,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = 'd339655d-851f-4024-bcfd-f3ff100c095a' OR (EntityID = '28F5B3D1-D0E5-4C52-AAD0-0436287F32CE' AND Name = '__mj_CreatedAt')) BEGIN
         INSERT INTO [${mjSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'd339655d-851f-4024-bcfd-f3ff100c095a',
            '28F5B3D1-D0E5-4C52-AAD0-0436287F32CE', -- Entity: MJ_BizApps_Orders: Product Option Values
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${mjSchema}].[EntityField] WHERE [EntityID] = '28F5B3D1-D0E5-4C52-AAD0-0436287F32CE'),
            '__mj_CreatedAt',
            'Created At',
            NULL,
            'datetimeoffset',
            10,
            34,
            7,
            0,
            'getutcdate()',
            0,
            0,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '1483078e-b1f3-4162-9a60-73ff8bfa1326' OR (EntityID = '28F5B3D1-D0E5-4C52-AAD0-0436287F32CE' AND Name = '__mj_UpdatedAt')) BEGIN
         INSERT INTO [${mjSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '1483078e-b1f3-4162-9a60-73ff8bfa1326',
            '28F5B3D1-D0E5-4C52-AAD0-0436287F32CE', -- Entity: MJ_BizApps_Orders: Product Option Values
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${mjSchema}].[EntityField] WHERE [EntityID] = '28F5B3D1-D0E5-4C52-AAD0-0436287F32CE'),
            '__mj_UpdatedAt',
            'Updated At',
            NULL,
            'datetimeoffset',
            10,
            34,
            7,
            0,
            'getutcdate()',
            0,
            0,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '54c1a518-0e60-4efe-a3b8-ee6a3f2fa412' OR (EntityID = 'B35DD5C3-9A6B-42D1-9049-297EE45ED2D5' AND Name = 'ParentProductID')) BEGIN
         INSERT INTO [${mjSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '54c1a518-0e60-4efe-a3b8-ee6a3f2fa412',
            'B35DD5C3-9A6B-42D1-9049-297EE45ED2D5', -- Entity: MJ_BizApps_Orders: Products
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${mjSchema}].[EntityField] WHERE [EntityID] = 'B35DD5C3-9A6B-42D1-9049-297EE45ED2D5'),
            'ParentProductID',
            'Parent Product ID',
            'For a variant SKU, the product it is a variant of. One level only. Not supported yet: refused on save until the pricing, tax and entitlement walks use it.',
            'uniqueidentifier',
            16,
            0,
            0,
            1,
            NULL,
            0,
            1,
            0,
            0,
            'B35DD5C3-9A6B-42D1-9049-297EE45ED2D5',
            'ID',
            0,
            0,
            1,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '8457cc83-e75f-4e2f-a5a5-3098f7f6f5e0' OR (EntityID = '08CBD324-07B9-4B35-873B-368F90EBB601' AND Name = 'ID')) BEGIN
         INSERT INTO [${mjSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '8457cc83-e75f-4e2f-a5a5-3098f7f6f5e0',
            '08CBD324-07B9-4B35-873B-368F90EBB601', -- Entity: MJ_BizApps_Orders: Product Variant Values
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${mjSchema}].[EntityField] WHERE [EntityID] = '08CBD324-07B9-4B35-873B-368F90EBB601'),
            'ID',
            'ID',
            NULL,
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            'newsequentialid()',
            0,
            0,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            1,
            1,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '16dff0b4-712f-4ea4-9a89-bcdb68b1419c' OR (EntityID = '08CBD324-07B9-4B35-873B-368F90EBB601' AND Name = 'ProductID')) BEGIN
         INSERT INTO [${mjSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '16dff0b4-712f-4ea4-9a89-bcdb68b1419c',
            '08CBD324-07B9-4B35-873B-368F90EBB601', -- Entity: MJ_BizApps_Orders: Product Variant Values
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${mjSchema}].[EntityField] WHERE [EntityID] = '08CBD324-07B9-4B35-873B-368F90EBB601'),
            'ProductID',
            'Product ID',
            NULL,
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            NULL,
            0,
            1,
            0,
            0,
            'B35DD5C3-9A6B-42D1-9049-297EE45ED2D5',
            'ID',
            0,
            0,
            1,
            0,
            0,
            1,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '1943a145-98ff-4476-9a6b-4837f1523731' OR (EntityID = '08CBD324-07B9-4B35-873B-368F90EBB601' AND Name = 'ProductOptionID')) BEGIN
         INSERT INTO [${mjSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '1943a145-98ff-4476-9a6b-4837f1523731',
            '08CBD324-07B9-4B35-873B-368F90EBB601', -- Entity: MJ_BizApps_Orders: Product Variant Values
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${mjSchema}].[EntityField] WHERE [EntityID] = '08CBD324-07B9-4B35-873B-368F90EBB601'),
            'ProductOptionID',
            'Product Option ID',
            NULL,
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            NULL,
            0,
            1,
            0,
            0,
            'F27481BD-A0DA-47F7-A985-FA3C24FCCCB7',
            'ID',
            0,
            0,
            1,
            0,
            0,
            1,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = 'abf7be59-f5e1-4a87-af31-1513414ccb8d' OR (EntityID = '08CBD324-07B9-4B35-873B-368F90EBB601' AND Name = 'ProductOptionValueID')) BEGIN
         INSERT INTO [${mjSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'abf7be59-f5e1-4a87-af31-1513414ccb8d',
            '08CBD324-07B9-4B35-873B-368F90EBB601', -- Entity: MJ_BizApps_Orders: Product Variant Values
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${mjSchema}].[EntityField] WHERE [EntityID] = '08CBD324-07B9-4B35-873B-368F90EBB601'),
            'ProductOptionValueID',
            'Product Option Value ID',
            NULL,
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            NULL,
            0,
            1,
            0,
            0,
            '28F5B3D1-D0E5-4C52-AAD0-0436287F32CE',
            'ID',
            0,
            0,
            1,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '161331e4-76d9-47ff-85db-66979f31297b' OR (EntityID = '08CBD324-07B9-4B35-873B-368F90EBB601' AND Name = '__mj_CreatedAt')) BEGIN
         INSERT INTO [${mjSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '161331e4-76d9-47ff-85db-66979f31297b',
            '08CBD324-07B9-4B35-873B-368F90EBB601', -- Entity: MJ_BizApps_Orders: Product Variant Values
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${mjSchema}].[EntityField] WHERE [EntityID] = '08CBD324-07B9-4B35-873B-368F90EBB601'),
            '__mj_CreatedAt',
            'Created At',
            NULL,
            'datetimeoffset',
            10,
            34,
            7,
            0,
            'getutcdate()',
            0,
            0,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            1,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = 'f54e9e67-ccce-4cb9-9255-29bb4a7385ff' OR (EntityID = '08CBD324-07B9-4B35-873B-368F90EBB601' AND Name = '__mj_UpdatedAt')) BEGIN
         INSERT INTO [${mjSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'f54e9e67-ccce-4cb9-9255-29bb4a7385ff',
            '08CBD324-07B9-4B35-873B-368F90EBB601', -- Entity: MJ_BizApps_Orders: Product Variant Values
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${mjSchema}].[EntityField] WHERE [EntityID] = '08CBD324-07B9-4B35-873B-368F90EBB601'),
            '__mj_UpdatedAt',
            'Updated At',
            NULL,
            'datetimeoffset',
            10,
            34,
            7,
            0,
            'getutcdate()',
            0,
            0,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = 'db835820-8705-4fd3-927d-0518b24329f3' OR (EntityID = '677FD08D-F1D8-46C3-84A7-3F16F6E51806' AND Name = 'ID')) BEGIN
         INSERT INTO [${mjSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'db835820-8705-4fd3-927d-0518b24329f3',
            '677FD08D-F1D8-46C3-84A7-3F16F6E51806', -- Entity: MJ_BizApps_Orders: Product Option Assignment Values
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${mjSchema}].[EntityField] WHERE [EntityID] = '677FD08D-F1D8-46C3-84A7-3F16F6E51806'),
            'ID',
            'ID',
            NULL,
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            'newsequentialid()',
            0,
            0,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            1,
            1,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = 'b51d7607-6a6b-40d9-9018-5bb325afa10d' OR (EntityID = '677FD08D-F1D8-46C3-84A7-3F16F6E51806' AND Name = 'ProductOptionAssignmentID')) BEGIN
         INSERT INTO [${mjSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'b51d7607-6a6b-40d9-9018-5bb325afa10d',
            '677FD08D-F1D8-46C3-84A7-3F16F6E51806', -- Entity: MJ_BizApps_Orders: Product Option Assignment Values
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${mjSchema}].[EntityField] WHERE [EntityID] = '677FD08D-F1D8-46C3-84A7-3F16F6E51806'),
            'ProductOptionAssignmentID',
            'Product Option Assignment ID',
            NULL,
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            NULL,
            0,
            1,
            0,
            0,
            '70E4B251-16EE-452B-B2E2-621C4E416609',
            'ID',
            0,
            0,
            1,
            0,
            0,
            1,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = 'ccdedff5-a213-4758-8ba4-f18463f5af02' OR (EntityID = '677FD08D-F1D8-46C3-84A7-3F16F6E51806' AND Name = 'ProductOptionValueID')) BEGIN
         INSERT INTO [${mjSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'ccdedff5-a213-4758-8ba4-f18463f5af02',
            '677FD08D-F1D8-46C3-84A7-3F16F6E51806', -- Entity: MJ_BizApps_Orders: Product Option Assignment Values
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${mjSchema}].[EntityField] WHERE [EntityID] = '677FD08D-F1D8-46C3-84A7-3F16F6E51806'),
            'ProductOptionValueID',
            'Product Option Value ID',
            NULL,
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            NULL,
            0,
            1,
            0,
            0,
            '28F5B3D1-D0E5-4C52-AAD0-0436287F32CE',
            'ID',
            0,
            0,
            1,
            0,
            0,
            1,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '1e008140-dd68-4b30-988f-ddd436bf8cea' OR (EntityID = '677FD08D-F1D8-46C3-84A7-3F16F6E51806' AND Name = '__mj_CreatedAt')) BEGIN
         INSERT INTO [${mjSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '1e008140-dd68-4b30-988f-ddd436bf8cea',
            '677FD08D-F1D8-46C3-84A7-3F16F6E51806', -- Entity: MJ_BizApps_Orders: Product Option Assignment Values
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${mjSchema}].[EntityField] WHERE [EntityID] = '677FD08D-F1D8-46C3-84A7-3F16F6E51806'),
            '__mj_CreatedAt',
            'Created At',
            NULL,
            'datetimeoffset',
            10,
            34,
            7,
            0,
            'getutcdate()',
            0,
            0,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            1,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = 'ba003e6e-7d05-4e57-b27a-14a6293815a1' OR (EntityID = '677FD08D-F1D8-46C3-84A7-3F16F6E51806' AND Name = '__mj_UpdatedAt')) BEGIN
         INSERT INTO [${mjSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'ba003e6e-7d05-4e57-b27a-14a6293815a1',
            '677FD08D-F1D8-46C3-84A7-3F16F6E51806', -- Entity: MJ_BizApps_Orders: Product Option Assignment Values
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${mjSchema}].[EntityField] WHERE [EntityID] = '677FD08D-F1D8-46C3-84A7-3F16F6E51806'),
            '__mj_UpdatedAt',
            'Updated At',
            NULL,
            'datetimeoffset',
            10,
            34,
            7,
            0,
            'getutcdate()',
            0,
            0,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            1,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = 'bd13faed-a9c3-4e14-9735-a9dc87aebd41' OR (EntityID = '70E4B251-16EE-452B-B2E2-621C4E416609' AND Name = 'ID')) BEGIN
         INSERT INTO [${mjSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'bd13faed-a9c3-4e14-9735-a9dc87aebd41',
            '70E4B251-16EE-452B-B2E2-621C4E416609', -- Entity: MJ_BizApps_Orders: Product Option Assignments
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${mjSchema}].[EntityField] WHERE [EntityID] = '70E4B251-16EE-452B-B2E2-621C4E416609'),
            'ID',
            'ID',
            NULL,
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            'newsequentialid()',
            0,
            0,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            1,
            1,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '9241a88b-f611-4c91-a08e-525e33222496' OR (EntityID = '70E4B251-16EE-452B-B2E2-621C4E416609' AND Name = 'ProductTypeID')) BEGIN
         INSERT INTO [${mjSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '9241a88b-f611-4c91-a08e-525e33222496',
            '70E4B251-16EE-452B-B2E2-621C4E416609', -- Entity: MJ_BizApps_Orders: Product Option Assignments
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${mjSchema}].[EntityField] WHERE [EntityID] = '70E4B251-16EE-452B-B2E2-621C4E416609'),
            'ProductTypeID',
            'Product Type ID',
            'Set for a type-level default. Only a shared option may be assigned here. Exactly one of ProductTypeID, ProductCategoryID and ProductID is set.',
            'uniqueidentifier',
            16,
            0,
            0,
            1,
            NULL,
            0,
            1,
            0,
            0,
            '9D578BD2-B7BB-40BD-88B7-6494C9B8DC00',
            'ID',
            0,
            0,
            1,
            0,
            0,
            1,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '7a7f2463-b170-4aad-8ebd-9916258a2d0a' OR (EntityID = '70E4B251-16EE-452B-B2E2-621C4E416609' AND Name = 'ProductCategoryID')) BEGIN
         INSERT INTO [${mjSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '7a7f2463-b170-4aad-8ebd-9916258a2d0a',
            '70E4B251-16EE-452B-B2E2-621C4E416609', -- Entity: MJ_BizApps_Orders: Product Option Assignments
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${mjSchema}].[EntityField] WHERE [EntityID] = '70E4B251-16EE-452B-B2E2-621C4E416609'),
            'ProductCategoryID',
            'Product Category ID',
            'Set for a category-level assignment, inherited by every subcategory and product below it.',
            'uniqueidentifier',
            16,
            0,
            0,
            1,
            NULL,
            0,
            1,
            0,
            0,
            'B0FA90A6-6975-4C5E-ABC7-3AEA97700CC3',
            'ID',
            0,
            0,
            1,
            0,
            0,
            1,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = 'd82f498b-429c-4256-a9e0-5856571e7346' OR (EntityID = '70E4B251-16EE-452B-B2E2-621C4E416609' AND Name = 'ProductID')) BEGIN
         INSERT INTO [${mjSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'd82f498b-429c-4256-a9e0-5856571e7346',
            '70E4B251-16EE-452B-B2E2-621C4E416609', -- Entity: MJ_BizApps_Orders: Product Option Assignments
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${mjSchema}].[EntityField] WHERE [EntityID] = '70E4B251-16EE-452B-B2E2-621C4E416609'),
            'ProductID',
            'Product ID',
            'Set for a product-level assignment, which has the final say.',
            'uniqueidentifier',
            16,
            0,
            0,
            1,
            NULL,
            0,
            1,
            0,
            0,
            'B35DD5C3-9A6B-42D1-9049-297EE45ED2D5',
            'ID',
            0,
            0,
            1,
            0,
            0,
            1,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '42423cd1-5c5d-4638-9c5e-abc0b3d1894e' OR (EntityID = '70E4B251-16EE-452B-B2E2-621C4E416609' AND Name = 'ProductOptionID')) BEGIN
         INSERT INTO [${mjSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '42423cd1-5c5d-4638-9c5e-abc0b3d1894e',
            '70E4B251-16EE-452B-B2E2-621C4E416609', -- Entity: MJ_BizApps_Orders: Product Option Assignments
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${mjSchema}].[EntityField] WHERE [EntityID] = '70E4B251-16EE-452B-B2E2-621C4E416609'),
            'ProductOptionID',
            'Product Option ID',
            NULL,
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            NULL,
            0,
            1,
            0,
            0,
            'F27481BD-A0DA-47F7-A985-FA3C24FCCCB7',
            'ID',
            0,
            0,
            1,
            0,
            0,
            1,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = 'a2601267-9fc5-4fab-9776-a0c57f02e1f5' OR (EntityID = '70E4B251-16EE-452B-B2E2-621C4E416609' AND Name = 'IsExcluded')) BEGIN
         INSERT INTO [${mjSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'a2601267-9fc5-4fab-9776-a0c57f02e1f5',
            '70E4B251-16EE-452B-B2E2-621C4E416609', -- Entity: MJ_BizApps_Orders: Product Option Assignments
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${mjSchema}].[EntityField] WHERE [EntityID] = '70E4B251-16EE-452B-B2E2-621C4E416609'),
            'IsExcluded',
            'Is Excluded',
            'Removes an inherited option at this level and below, until a more specific assignment offers it again.',
            'bit',
            1,
            1,
            0,
            0,
            '(0)',
            0,
            1,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = 'f59af3bf-0206-4527-bc26-526ec073d291' OR (EntityID = '70E4B251-16EE-452B-B2E2-621C4E416609' AND Name = 'IsRequired')) BEGIN
         INSERT INTO [${mjSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'f59af3bf-0206-4527-bc26-526ec073d291',
            '70E4B251-16EE-452B-B2E2-621C4E416609', -- Entity: MJ_BizApps_Orders: Product Option Assignments
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${mjSchema}].[EntityField] WHERE [EntityID] = '70E4B251-16EE-452B-B2E2-621C4E416609'),
            'IsRequired',
            'Is Required',
            'A line for the product cannot be saved or priced without a pick for this option.',
            'bit',
            1,
            1,
            0,
            0,
            '(0)',
            0,
            1,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = 'a869f995-9381-410e-afcc-e468508a40e9' OR (EntityID = '70E4B251-16EE-452B-B2E2-621C4E416609' AND Name = 'DefaultProductOptionValueID')) BEGIN
         INSERT INTO [${mjSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'a869f995-9381-410e-afcc-e468508a40e9',
            '70E4B251-16EE-452B-B2E2-621C4E416609', -- Entity: MJ_BizApps_Orders: Product Option Assignments
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${mjSchema}].[EntityField] WHERE [EntityID] = '70E4B251-16EE-452B-B2E2-621C4E416609'),
            'DefaultProductOptionValueID',
            'Default Product Option Value ID',
            'Value a new line starts with; staff or the buyer can change it. Must be one of the allowed values.',
            'uniqueidentifier',
            16,
            0,
            0,
            1,
            NULL,
            0,
            1,
            0,
            0,
            '28F5B3D1-D0E5-4C52-AAD0-0436287F32CE',
            'ID',
            0,
            0,
            1,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '81e6a490-cdb5-4147-a02c-40ef2155a102' OR (EntityID = '70E4B251-16EE-452B-B2E2-621C4E416609' AND Name = 'SortOrder')) BEGIN
         INSERT INTO [${mjSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '81e6a490-cdb5-4147-a02c-40ef2155a102',
            '70E4B251-16EE-452B-B2E2-621C4E416609', -- Entity: MJ_BizApps_Orders: Product Option Assignments
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${mjSchema}].[EntityField] WHERE [EntityID] = '70E4B251-16EE-452B-B2E2-621C4E416609'),
            'SortOrder',
            'Sort Order',
            'Order in which this option is shown on a line.',
            'int',
            4,
            10,
            0,
            0,
            '(0)',
            0,
            1,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = 'cca5aaef-037d-4c21-b758-c2c477d7b79b' OR (EntityID = '70E4B251-16EE-452B-B2E2-621C4E416609' AND Name = 'Role')) BEGIN
         INSERT INTO [${mjSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'cca5aaef-037d-4c21-b758-c2c477d7b79b',
            '70E4B251-16EE-452B-B2E2-621C4E416609', -- Entity: MJ_BizApps_Orders: Product Option Assignments
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${mjSchema}].[EntityField] WHERE [EntityID] = '70E4B251-16EE-452B-B2E2-621C4E416609'),
            'Role',
            'Role',
            'LineOption: picked on the order line. Variant: the option defines a separate SKU; not supported yet and refused on save.',
            'nvarchar',
            40,
            0,
            0,
            0,
            'LineOption',
            0,
            1,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = 'df2d263a-35a0-4d17-ad2a-d4a044651eff' OR (EntityID = '70E4B251-16EE-452B-B2E2-621C4E416609' AND Name = '__mj_CreatedAt')) BEGIN
         INSERT INTO [${mjSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'df2d263a-35a0-4d17-ad2a-d4a044651eff',
            '70E4B251-16EE-452B-B2E2-621C4E416609', -- Entity: MJ_BizApps_Orders: Product Option Assignments
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${mjSchema}].[EntityField] WHERE [EntityID] = '70E4B251-16EE-452B-B2E2-621C4E416609'),
            '__mj_CreatedAt',
            'Created At',
            NULL,
            'datetimeoffset',
            10,
            34,
            7,
            0,
            'getutcdate()',
            0,
            0,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '75d40c5f-fb7c-4781-8969-d7e9a86e3761' OR (EntityID = '70E4B251-16EE-452B-B2E2-621C4E416609' AND Name = '__mj_UpdatedAt')) BEGIN
         INSERT INTO [${mjSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '75d40c5f-fb7c-4781-8969-d7e9a86e3761',
            '70E4B251-16EE-452B-B2E2-621C4E416609', -- Entity: MJ_BizApps_Orders: Product Option Assignments
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${mjSchema}].[EntityField] WHERE [EntityID] = '70E4B251-16EE-452B-B2E2-621C4E416609'),
            '__mj_UpdatedAt',
            'Updated At',
            NULL,
            'datetimeoffset',
            10,
            34,
            7,
            0,
            'getutcdate()',
            0,
            0,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = 'e08c246b-695d-4b0a-b2a2-7fff84e4da46' OR (EntityID = '279CE520-5127-4FC5-BE4D-DDE4E415852F' AND Name = 'ID')) BEGIN
         INSERT INTO [${mjSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'e08c246b-695d-4b0a-b2a2-7fff84e4da46',
            '279CE520-5127-4FC5-BE4D-DDE4E415852F', -- Entity: MJ_BizApps_Orders: Product Successor Option Values
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${mjSchema}].[EntityField] WHERE [EntityID] = '279CE520-5127-4FC5-BE4D-DDE4E415852F'),
            'ID',
            'ID',
            NULL,
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            'newsequentialid()',
            0,
            0,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            1,
            1,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '985a9f04-c185-4b67-b082-51dc790cf729' OR (EntityID = '279CE520-5127-4FC5-BE4D-DDE4E415852F' AND Name = 'ProductID')) BEGIN
         INSERT INTO [${mjSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '985a9f04-c185-4b67-b082-51dc790cf729',
            '279CE520-5127-4FC5-BE4D-DDE4E415852F', -- Entity: MJ_BizApps_Orders: Product Successor Option Values
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${mjSchema}].[EntityField] WHERE [EntityID] = '279CE520-5127-4FC5-BE4D-DDE4E415852F'),
            'ProductID',
            'Product ID',
            'The product being moved away from, whose SuccessorProductID names the product the renewal books on.',
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            NULL,
            0,
            1,
            0,
            0,
            'B35DD5C3-9A6B-42D1-9049-297EE45ED2D5',
            'ID',
            0,
            0,
            1,
            0,
            0,
            1,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '58ce354d-b50a-4ea6-9eee-fb2dbb03e39a' OR (EntityID = '279CE520-5127-4FC5-BE4D-DDE4E415852F' AND Name = 'ProductOptionID')) BEGIN
         INSERT INTO [${mjSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '58ce354d-b50a-4ea6-9eee-fb2dbb03e39a',
            '279CE520-5127-4FC5-BE4D-DDE4E415852F', -- Entity: MJ_BizApps_Orders: Product Successor Option Values
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${mjSchema}].[EntityField] WHERE [EntityID] = '279CE520-5127-4FC5-BE4D-DDE4E415852F'),
            'ProductOptionID',
            'Product Option ID',
            NULL,
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            NULL,
            0,
            1,
            0,
            0,
            'F27481BD-A0DA-47F7-A985-FA3C24FCCCB7',
            'ID',
            0,
            0,
            1,
            0,
            0,
            1,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '89a15479-6681-4442-97e2-e0879c6c38db' OR (EntityID = '279CE520-5127-4FC5-BE4D-DDE4E415852F' AND Name = 'ProductOptionValueID')) BEGIN
         INSERT INTO [${mjSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '89a15479-6681-4442-97e2-e0879c6c38db',
            '279CE520-5127-4FC5-BE4D-DDE4E415852F', -- Entity: MJ_BizApps_Orders: Product Successor Option Values
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${mjSchema}].[EntityField] WHERE [EntityID] = '279CE520-5127-4FC5-BE4D-DDE4E415852F'),
            'ProductOptionValueID',
            'Product Option Value ID',
            NULL,
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            NULL,
            0,
            1,
            0,
            0,
            '28F5B3D1-D0E5-4C52-AAD0-0436287F32CE',
            'ID',
            0,
            0,
            1,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = 'c3f338a9-2f98-481c-b8ec-0c4237f3131b' OR (EntityID = '279CE520-5127-4FC5-BE4D-DDE4E415852F' AND Name = '__mj_CreatedAt')) BEGIN
         INSERT INTO [${mjSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'c3f338a9-2f98-481c-b8ec-0c4237f3131b',
            '279CE520-5127-4FC5-BE4D-DDE4E415852F', -- Entity: MJ_BizApps_Orders: Product Successor Option Values
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${mjSchema}].[EntityField] WHERE [EntityID] = '279CE520-5127-4FC5-BE4D-DDE4E415852F'),
            '__mj_CreatedAt',
            'Created At',
            NULL,
            'datetimeoffset',
            10,
            34,
            7,
            0,
            'getutcdate()',
            0,
            0,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            1,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '3e60ddce-52be-48d5-a282-881cf9cfb42c' OR (EntityID = '279CE520-5127-4FC5-BE4D-DDE4E415852F' AND Name = '__mj_UpdatedAt')) BEGIN
         INSERT INTO [${mjSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '3e60ddce-52be-48d5-a282-881cf9cfb42c',
            '279CE520-5127-4FC5-BE4D-DDE4E415852F', -- Entity: MJ_BizApps_Orders: Product Successor Option Values
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${mjSchema}].[EntityField] WHERE [EntityID] = '279CE520-5127-4FC5-BE4D-DDE4E415852F'),
            '__mj_UpdatedAt',
            'Updated At',
            NULL,
            'datetimeoffset',
            10,
            34,
            7,
            0,
            'getutcdate()',
            0,
            0,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '7a72b2df-9a38-468f-a135-4097c5a147bf' OR (EntityID = 'F27481BD-A0DA-47F7-A985-FA3C24FCCCB7' AND Name = 'ID')) BEGIN
         INSERT INTO [${mjSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '7a72b2df-9a38-468f-a135-4097c5a147bf',
            'F27481BD-A0DA-47F7-A985-FA3C24FCCCB7', -- Entity: MJ_BizApps_Orders: Product Options
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${mjSchema}].[EntityField] WHERE [EntityID] = 'F27481BD-A0DA-47F7-A985-FA3C24FCCCB7'),
            'ID',
            'ID',
            NULL,
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            'newsequentialid()',
            0,
            0,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            1,
            1,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = 'd9c5fa77-6b89-4874-af10-20725887e2f7' OR (EntityID = 'F27481BD-A0DA-47F7-A985-FA3C24FCCCB7' AND Name = 'CompanyID')) BEGIN
         INSERT INTO [${mjSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'd9c5fa77-6b89-4874-af10-20725887e2f7',
            'F27481BD-A0DA-47F7-A985-FA3C24FCCCB7', -- Entity: MJ_BizApps_Orders: Product Options
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${mjSchema}].[EntityField] WHERE [EntityID] = 'F27481BD-A0DA-47F7-A985-FA3C24FCCCB7'),
            'CompanyID',
            'Company ID',
            'The company that owns this option. Empty for a shared option, usable by every company and the only kind a product type may assign.',
            'uniqueidentifier',
            16,
            0,
            0,
            1,
            NULL,
            0,
            1,
            0,
            0,
            'D4238F34-2837-EF11-86D4-6045BDEE16E6',
            'ID',
            0,
            0,
            1,
            0,
            0,
            1,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = 'caabb8eb-fdb6-4661-927c-6de16b32435f' OR (EntityID = 'F27481BD-A0DA-47F7-A985-FA3C24FCCCB7' AND Name = 'Code')) BEGIN
         INSERT INTO [${mjSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'caabb8eb-fdb6-4661-927c-6de16b32435f',
            'F27481BD-A0DA-47F7-A985-FA3C24FCCCB7', -- Entity: MJ_BizApps_Orders: Product Options
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${mjSchema}].[EntityField] WHERE [EntityID] = 'F27481BD-A0DA-47F7-A985-FA3C24FCCCB7'),
            'Code',
            'Code',
            'Stable code for the option, used as the field name in price rules (Option.<Code>) and as the GroupKey of the picks recorded on a line. Unique among shared options, and within a company.',
            'nvarchar',
            100,
            0,
            0,
            0,
            NULL,
            0,
            1,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            1,
            0,
            1,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '8e745d8c-7eb9-4a51-8725-7c2ed7f6b9a2' OR (EntityID = 'F27481BD-A0DA-47F7-A985-FA3C24FCCCB7' AND Name = 'Name')) BEGIN
         INSERT INTO [${mjSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '8e745d8c-7eb9-4a51-8725-7c2ed7f6b9a2',
            'F27481BD-A0DA-47F7-A985-FA3C24FCCCB7', -- Entity: MJ_BizApps_Orders: Product Options
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${mjSchema}].[EntityField] WHERE [EntityID] = 'F27481BD-A0DA-47F7-A985-FA3C24FCCCB7'),
            'Name',
            'Name',
            'Name shown to staff and buyers.',
            'nvarchar',
            200,
            0,
            0,
            0,
            NULL,
            0,
            1,
            0,
            0,
            NULL,
            NULL,
            1,
            1,
            0,
            1,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '09d43f2e-fd6e-4528-bdaa-2f6e7a4dc1ca' OR (EntityID = 'F27481BD-A0DA-47F7-A985-FA3C24FCCCB7' AND Name = 'Description')) BEGIN
         INSERT INTO [${mjSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '09d43f2e-fd6e-4528-bdaa-2f6e7a4dc1ca',
            'F27481BD-A0DA-47F7-A985-FA3C24FCCCB7', -- Entity: MJ_BizApps_Orders: Product Options
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${mjSchema}].[EntityField] WHERE [EntityID] = 'F27481BD-A0DA-47F7-A985-FA3C24FCCCB7'),
            'Description',
            'Description',
            NULL,
            'nvarchar',
            -1,
            0,
            0,
            1,
            NULL,
            0,
            1,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            1,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = 'd3e98208-6c3f-4252-8561-f6f8c8a59145' OR (EntityID = 'F27481BD-A0DA-47F7-A985-FA3C24FCCCB7' AND Name = 'SortOrder')) BEGIN
         INSERT INTO [${mjSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'd3e98208-6c3f-4252-8561-f6f8c8a59145',
            'F27481BD-A0DA-47F7-A985-FA3C24FCCCB7', -- Entity: MJ_BizApps_Orders: Product Options
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${mjSchema}].[EntityField] WHERE [EntityID] = 'F27481BD-A0DA-47F7-A985-FA3C24FCCCB7'),
            'SortOrder',
            'Sort Order',
            'Order in which options are shown on a line.',
            'int',
            4,
            10,
            0,
            0,
            '(0)',
            0,
            1,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '5cd25870-da4d-4917-89fc-e24aff648955' OR (EntityID = 'F27481BD-A0DA-47F7-A985-FA3C24FCCCB7' AND Name = 'IsActive')) BEGIN
         INSERT INTO [${mjSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '5cd25870-da4d-4917-89fc-e24aff648955',
            'F27481BD-A0DA-47F7-A985-FA3C24FCCCB7', -- Entity: MJ_BizApps_Orders: Product Options
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${mjSchema}].[EntityField] WHERE [EntityID] = 'F27481BD-A0DA-47F7-A985-FA3C24FCCCB7'),
            'IsActive',
            'Is Active',
            'An inactive option is no longer offered on new lines. Lines that picked it keep their picks.',
            'bit',
            1,
            1,
            0,
            0,
            '(1)',
            0,
            1,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = 'd8bef0f8-e0cd-4d55-b21d-4d3c87788a52' OR (EntityID = 'F27481BD-A0DA-47F7-A985-FA3C24FCCCB7' AND Name = '__mj_CreatedAt')) BEGIN
         INSERT INTO [${mjSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'd8bef0f8-e0cd-4d55-b21d-4d3c87788a52',
            'F27481BD-A0DA-47F7-A985-FA3C24FCCCB7', -- Entity: MJ_BizApps_Orders: Product Options
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${mjSchema}].[EntityField] WHERE [EntityID] = 'F27481BD-A0DA-47F7-A985-FA3C24FCCCB7'),
            '__mj_CreatedAt',
            'Created At',
            NULL,
            'datetimeoffset',
            10,
            34,
            7,
            0,
            'getutcdate()',
            0,
            0,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = 'e9989f7c-2ce2-4f6d-9eff-78c73b96a26a' OR (EntityID = 'F27481BD-A0DA-47F7-A985-FA3C24FCCCB7' AND Name = '__mj_UpdatedAt')) BEGIN
         INSERT INTO [${mjSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'e9989f7c-2ce2-4f6d-9eff-78c73b96a26a',
            'F27481BD-A0DA-47F7-A985-FA3C24FCCCB7', -- Entity: MJ_BizApps_Orders: Product Options
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${mjSchema}].[EntityField] WHERE [EntityID] = 'F27481BD-A0DA-47F7-A985-FA3C24FCCCB7'),
            '__mj_UpdatedAt',
            'Updated At',
            NULL,
            'datetimeoffset',
            10,
            34,
            7,
            0,
            'getutcdate()',
            0,
            0,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '25ec4574-97eb-47ee-8eb5-133f79f130d3' OR (EntityID = 'E5FC8970-8D06-4D58-BE59-FF8715F84890' AND Name = 'ProductOptionID')) BEGIN
         INSERT INTO [${mjSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '25ec4574-97eb-47ee-8eb5-133f79f130d3',
            'E5FC8970-8D06-4D58-BE59-FF8715F84890', -- Entity: MJ_BizApps_Orders: Order Line Choices
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${mjSchema}].[EntityField] WHERE [EntityID] = 'E5FC8970-8D06-4D58-BE59-FF8715F84890'),
            'ProductOptionID',
            'Product Option ID',
            'For a product option pick, the option it answers; GroupKey is then the option code. Empty for a checkout-widget choice.',
            'uniqueidentifier',
            16,
            0,
            0,
            1,
            NULL,
            0,
            1,
            0,
            0,
            'F27481BD-A0DA-47F7-A985-FA3C24FCCCB7',
            'ID',
            0,
            0,
            1,
            0,
            0,
            1,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = 'fc9d5fda-020e-45b4-9f67-017e61a56179' OR (EntityID = 'E5FC8970-8D06-4D58-BE59-FF8715F84890' AND Name = 'ProductOptionValueID')) BEGIN
         INSERT INTO [${mjSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'fc9d5fda-020e-45b4-9f67-017e61a56179',
            'E5FC8970-8D06-4D58-BE59-FF8715F84890', -- Entity: MJ_BizApps_Orders: Order Line Choices
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${mjSchema}].[EntityField] WHERE [EntityID] = 'E5FC8970-8D06-4D58-BE59-FF8715F84890'),
            'ProductOptionValueID',
            'Product Option Value ID',
            'For a product option pick, the value picked; OptionValue is then the value code. Set together with ProductOptionID.',
            'uniqueidentifier',
            16,
            0,
            0,
            1,
            NULL,
            0,
            1,
            0,
            0,
            '28F5B3D1-D0E5-4C52-AAD0-0436287F32CE',
            'ID',
            0,
            0,
            1,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

/* Create IS-A parent field ParentProductID on MJ_BizApps_Orders: Event Products */
IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE [ID] = 'b9205687-8741-48b8-8170-2d19f1c05205' OR ([EntityID] = 'B090A662-A97A-4748-B109-2FA716C14651' AND [Name] = 'ParentProductID')) BEGIN
               INSERT INTO [${mjSchema}].[EntityField] (
                  [ID], [EntityID], [Name], [Type], [AllowsNull],
                  [Length], [Precision], [Scale],
                  [Sequence], [IsVirtual], [AllowUpdateAPI],
                  [IsPrimaryKey], [IsUnique],
                  [RelatedEntityID], [RelatedEntityFieldName], [RelatedEntityDisplayType],
                  [IncludeRelatedEntityNameFieldInBaseView],
                  [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES (
                  'b9205687-8741-48b8-8170-2d19f1c05205', 'B090A662-A97A-4748-B109-2FA716C14651', 'ParentProductID',
                  'uniqueidentifier', 1,
                  16, 0, 0,
                  (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${mjSchema}].[EntityField] WHERE [EntityID] = 'B090A662-A97A-4748-B109-2FA716C14651'), 1, 1, 0, 0,
                  'B35DD5C3-9A6B-42D1-9049-297EE45ED2D5', 'ID', 'Search',
                  0,
                  GETUTCDATE(), GETUTCDATE())
               END;

/* Update entity timestamp for MJ_BizApps_Orders: Event Products after IS-A field sync */
UPDATE [${mjSchema}].[Entity] SET [__mj_UpdatedAt]=GETUTCDATE() WHERE ID='B090A662-A97A-4748-B109-2FA716C14651';

/* SQL text to update display name for field ParentProductID */
UPDATE [${mjSchema}].[EntityField] SET [__mj_UpdatedAt]=GETUTCDATE(), DisplayName = 'Parent Product' WHERE ID = 'B9205687-8741-48B8-8170-2D19F1C05205';

/* SQL text to insert entity field value with ID a28fabf2-1dba-4b17-911c-e2ad1ba29f14 */
INSERT INTO [${mjSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('a28fabf2-1dba-4b17-911c-e2ad1ba29f14', 'CCA5AAEF-037D-4C21-B758-C2C477D7B79B', 1, 'LineOption', 'LineOption', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID a65c9d94-5df2-4ede-9aab-a2e3769b913c */
INSERT INTO [${mjSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('a65c9d94-5df2-4ede-9aab-a2e3769b913c', 'CCA5AAEF-037D-4C21-B758-C2C477D7B79B', 2, 'Variant', 'Variant', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID CCA5AAEF-037D-4C21-B758-C2C477D7B79B */
UPDATE [${mjSchema}].[EntityField] SET ValueListType='List' WHERE ID='CCA5AAEF-037D-4C21-B758-C2C477D7B79B';

/* Deterministic search-flag hygiene — seed name fields */

         UPDATE [${mjSchema}].[EntityField]
         SET [IncludeInUserSearchAPI] = 1,
             [UserSearchPredicateAPI] = 'BeginsWith'
         WHERE [ID] IN (
            SELECT ranked.[ID] FROM (
               SELECT f.[ID],
                      ROW_NUMBER() OVER (
                         PARTITION BY f.[EntityID]
                         ORDER BY f.[Sequence], f.[Name]
                      ) AS rn
               FROM [${mjSchema}].[EntityField] f
               INNER JOIN [${mjSchema}].[Entity] e ON e.[ID] = f.[EntityID]
               WHERE LOWER(f.[Name]) IN ('name','title','firstname','lastname','middlename','displayname','fullname','label')
                 AND f.[AutoUpdateIncludeInUserSearchAPI] = 1
                 AND f.[IncludeInUserSearchAPI] = 0
                 AND ISNULL(f.[IsPrimaryKey], 0) = 0
                 AND ISNULL(f.[IsVirtual], 0) = 0
                 AND LOWER(f.[Type]) IN ('nvarchar','varchar','char','nchar')
                 AND ISNULL(f.[Length], 0) <> -1
                 AND e.[VirtualEntity] = 0
                 AND e.[AllowUserSearchAPI] = 1
                 AND ISNULL(e.[FullTextSearchEnabled], 0) = 0
                 AND NOT ((e.[Name] = 'Logs' OR e.[Name] LIKE '% Logs') OR (e.[Name] = 'Log' OR e.[Name] LIKE '% Log') OR (e.[Name] = 'Runs' OR e.[Name] LIKE '% Runs') OR (e.[Name] = 'Run' OR e.[Name] LIKE '% Run') OR (e.[Name] = 'Run History' OR e.[Name] LIKE '% Run History') OR (e.[Name] = 'Run Steps' OR e.[Name] LIKE '% Run Steps') OR (e.[Name] = 'Run Messages' OR e.[Name] LIKE '% Run Messages') OR (e.[Name] = 'Execution Logs' OR e.[Name] LIKE '% Execution Logs') OR (e.[Name] = 'Details' OR e.[Name] LIKE '% Details') OR (e.[Name] = 'Detail' OR e.[Name] LIKE '% Detail') OR (e.[Name] = 'Lines' OR e.[Name] LIKE '% Lines') OR (e.[Name] = 'Line' OR e.[Name] LIKE '% Line') OR (e.[Name] = 'Items' OR e.[Name] LIKE '% Items') OR (e.[Name] = 'Item' OR e.[Name] LIKE '% Item') OR (e.[Name] = 'Steps' OR e.[Name] LIKE '% Steps') OR (e.[Name] = 'Step' OR e.[Name] LIKE '% Step') OR (e.[Name] = 'Params' OR e.[Name] LIKE '% Params') OR (e.[Name] = 'Param' OR e.[Name] LIKE '% Param') OR (e.[Name] = 'Mappings' OR e.[Name] LIKE '% Mappings') OR (e.[Name] = 'Mapping' OR e.[Name] LIKE '% Mapping') OR (e.[Name] = 'Audit' OR e.[Name] LIKE 'Audit %' OR e.[Name] LIKE '% Audit' OR e.[Name] LIKE '% Audit %') OR (e.[Name] = 'Record Change' OR e.[Name] LIKE 'Record Change %' OR e.[Name] LIKE '% Record Change' OR e.[Name] LIKE '% Record Change %'))
                 AND e.[SchemaName] NOT IN ('${mjSchema}','__mj_BizAppsAccounting','__mj_BizAppsCommon','__mj_BizAppsTasks','sys')
                 AND NOT EXISTS (
               SELECT 1 FROM [${mjSchema}].[EntityField] f2
               WHERE f2.[EntityID] = e.[ID]
                 AND f2.[IncludeInUserSearchAPI] = 1
            )
            ) ranked
            WHERE ranked.rn <= 3
         );

/* Deterministic search-flag hygiene — clear AllowUserSearchAPI */

         UPDATE [${mjSchema}].[Entity]
         SET [AllowUserSearchAPI] = 0
         WHERE [ID] IN (
            SELECT e.[ID]
            FROM [${mjSchema}].[Entity] e
            WHERE e.[AllowUserSearchAPI] = 1
              AND e.[AutoUpdateAllowUserSearchAPI] = 1
              AND e.[VirtualEntity] = 0
              AND ISNULL(e.[FullTextSearchEnabled], 0) = 0
              AND e.[SchemaName] NOT IN ('${mjSchema}','__mj_BizAppsAccounting','__mj_BizAppsCommon','__mj_BizAppsTasks','sys')
              AND NOT EXISTS (
               SELECT 1 FROM [${mjSchema}].[EntityField] f2
               WHERE f2.[EntityID] = e.[ID]
                 AND f2.[IncludeInUserSearchAPI] = 1
            )
         );


/* Create Entity Relationship: MJ_BizApps_Orders: Product Option Values -> MJ_BizApps_Orders: Product Variant Values (One To Many via ProductOptionValueID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${mjSchema}].[EntityRelationship] WHERE [ID] = 'cbbaf204-3264-4f51-ad7e-db0a249698cf' OR ([EntityID] = '28F5B3D1-D0E5-4C52-AAD0-0436287F32CE' AND [RelatedEntityID] = '08CBD324-07B9-4B35-873B-368F90EBB601' AND [RelatedEntityJoinField] = 'ProductOptionValueID')
   )
   BEGIN
      INSERT INTO [${mjSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('cbbaf204-3264-4f51-ad7e-db0a249698cf', '28F5B3D1-D0E5-4C52-AAD0-0436287F32CE', '08CBD324-07B9-4B35-873B-368F90EBB601', 'ProductOptionValueID', 'One To Many', 1, 1, 1, GETUTCDATE(), GETUTCDATE())
   END;
                    
/* Create Entity Relationship: MJ_BizApps_Orders: Product Option Values -> MJ_BizApps_Orders: Product Option Assignment Values (One To Many via ProductOptionValueID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${mjSchema}].[EntityRelationship] WHERE [ID] = '8229d399-48fb-4a65-bfca-69250d601c6b' OR ([EntityID] = '28F5B3D1-D0E5-4C52-AAD0-0436287F32CE' AND [RelatedEntityID] = '677FD08D-F1D8-46C3-84A7-3F16F6E51806' AND [RelatedEntityJoinField] = 'ProductOptionValueID')
   )
   BEGIN
      INSERT INTO [${mjSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('8229d399-48fb-4a65-bfca-69250d601c6b', '28F5B3D1-D0E5-4C52-AAD0-0436287F32CE', '677FD08D-F1D8-46C3-84A7-3F16F6E51806', 'ProductOptionValueID', 'One To Many', 1, 1, 2, GETUTCDATE(), GETUTCDATE())
   END;


/* Create Entity Relationship: MJ_BizApps_Orders: Product Option Values -> MJ_BizApps_Orders: Product Option Assignments (One To Many via DefaultProductOptionValueID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${mjSchema}].[EntityRelationship] WHERE [ID] = 'ad062991-c7f2-4baf-9599-24da38dc572c' OR ([EntityID] = '28F5B3D1-D0E5-4C52-AAD0-0436287F32CE' AND [RelatedEntityID] = '70E4B251-16EE-452B-B2E2-621C4E416609' AND [RelatedEntityJoinField] = 'DefaultProductOptionValueID')
   )
   BEGIN
      INSERT INTO [${mjSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('ad062991-c7f2-4baf-9599-24da38dc572c', '28F5B3D1-D0E5-4C52-AAD0-0436287F32CE', '70E4B251-16EE-452B-B2E2-621C4E416609', 'DefaultProductOptionValueID', 'One To Many', 1, 1, 3, GETUTCDATE(), GETUTCDATE())
   END;
                    
/* Create Entity Relationship: MJ_BizApps_Orders: Product Option Values -> MJ_BizApps_Orders: Product Successor Option Values (One To Many via ProductOptionValueID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${mjSchema}].[EntityRelationship] WHERE [ID] = 'a5281b5a-6fd7-411f-aa41-0ea388d9b987' OR ([EntityID] = '28F5B3D1-D0E5-4C52-AAD0-0436287F32CE' AND [RelatedEntityID] = '279CE520-5127-4FC5-BE4D-DDE4E415852F' AND [RelatedEntityJoinField] = 'ProductOptionValueID')
   )
   BEGIN
      INSERT INTO [${mjSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('a5281b5a-6fd7-411f-aa41-0ea388d9b987', '28F5B3D1-D0E5-4C52-AAD0-0436287F32CE', '279CE520-5127-4FC5-BE4D-DDE4E415852F', 'ProductOptionValueID', 'One To Many', 1, 1, 4, GETUTCDATE(), GETUTCDATE())
   END;
                    
/* Create Entity Relationship: MJ_BizApps_Orders: Product Option Values -> MJ_BizApps_Orders: Order Line Choices (One To Many via ProductOptionValueID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${mjSchema}].[EntityRelationship] WHERE [ID] = '8d91e729-9581-47aa-a7ec-5bb169086153' OR ([EntityID] = '28F5B3D1-D0E5-4C52-AAD0-0436287F32CE' AND [RelatedEntityID] = 'E5FC8970-8D06-4D58-BE59-FF8715F84890' AND [RelatedEntityJoinField] = 'ProductOptionValueID')
   )
   BEGIN
      INSERT INTO [${mjSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('8d91e729-9581-47aa-a7ec-5bb169086153', '28F5B3D1-D0E5-4C52-AAD0-0436287F32CE', 'E5FC8970-8D06-4D58-BE59-FF8715F84890', 'ProductOptionValueID', 'One To Many', 1, 1, 5, GETUTCDATE(), GETUTCDATE())
   END;


/* Create Entity Relationship: MJ_BizApps_Orders: Products -> MJ_BizApps_Orders: Products (One To Many via ParentProductID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${mjSchema}].[EntityRelationship] WHERE [ID] = '07cb0f1a-8217-4355-ba03-18a2c19e4119' OR ([EntityID] = 'B35DD5C3-9A6B-42D1-9049-297EE45ED2D5' AND [RelatedEntityID] = 'B35DD5C3-9A6B-42D1-9049-297EE45ED2D5' AND [RelatedEntityJoinField] = 'ParentProductID')
   )
   BEGIN
      INSERT INTO [${mjSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('07cb0f1a-8217-4355-ba03-18a2c19e4119', 'B35DD5C3-9A6B-42D1-9049-297EE45ED2D5', 'B35DD5C3-9A6B-42D1-9049-297EE45ED2D5', 'ParentProductID', 'One To Many', 1, 1, 12, GETUTCDATE(), GETUTCDATE())
   END;


/* Create Entity Relationship: MJ_BizApps_Orders: Products -> MJ_BizApps_Orders: Product Variant Values (One To Many via ProductID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${mjSchema}].[EntityRelationship] WHERE [ID] = 'ef278c6b-da8b-4ad3-9548-4116a0c4fb89' OR ([EntityID] = 'B35DD5C3-9A6B-42D1-9049-297EE45ED2D5' AND [RelatedEntityID] = '08CBD324-07B9-4B35-873B-368F90EBB601' AND [RelatedEntityJoinField] = 'ProductID')
   )
   BEGIN
      INSERT INTO [${mjSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('ef278c6b-da8b-4ad3-9548-4116a0c4fb89', 'B35DD5C3-9A6B-42D1-9049-297EE45ED2D5', '08CBD324-07B9-4B35-873B-368F90EBB601', 'ProductID', 'One To Many', 1, 1, 13, GETUTCDATE(), GETUTCDATE())
   END;
                    
/* Create Entity Relationship: MJ_BizApps_Orders: Products -> MJ_BizApps_Orders: Product Option Assignments (One To Many via ProductID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${mjSchema}].[EntityRelationship] WHERE [ID] = '4148a55b-0ccf-4269-bff8-6f527449145c' OR ([EntityID] = 'B35DD5C3-9A6B-42D1-9049-297EE45ED2D5' AND [RelatedEntityID] = '70E4B251-16EE-452B-B2E2-621C4E416609' AND [RelatedEntityJoinField] = 'ProductID')
   )
   BEGIN
      INSERT INTO [${mjSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('4148a55b-0ccf-4269-bff8-6f527449145c', 'B35DD5C3-9A6B-42D1-9049-297EE45ED2D5', '70E4B251-16EE-452B-B2E2-621C4E416609', 'ProductID', 'One To Many', 1, 1, 14, GETUTCDATE(), GETUTCDATE())
   END;


/* Create Entity Relationship: MJ_BizApps_Orders: Products -> MJ_BizApps_Orders: Product Successor Option Values (One To Many via ProductID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${mjSchema}].[EntityRelationship] WHERE [ID] = 'c39ffdc3-74a7-4681-ba8f-fc3a8fc1645a' OR ([EntityID] = 'B35DD5C3-9A6B-42D1-9049-297EE45ED2D5' AND [RelatedEntityID] = '279CE520-5127-4FC5-BE4D-DDE4E415852F' AND [RelatedEntityJoinField] = 'ProductID')
   )
   BEGIN
      INSERT INTO [${mjSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('c39ffdc3-74a7-4681-ba8f-fc3a8fc1645a', 'B35DD5C3-9A6B-42D1-9049-297EE45ED2D5', '279CE520-5127-4FC5-BE4D-DDE4E415852F', 'ProductID', 'One To Many', 1, 1, 15, GETUTCDATE(), GETUTCDATE())
   END;


/* Create Entity Relationship: MJ_BizApps_Orders: Product Categories -> MJ_BizApps_Orders: Product Option Assignments (One To Many via ProductCategoryID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${mjSchema}].[EntityRelationship] WHERE [ID] = '74bce0c0-fbec-4778-8972-8e21650f6313' OR ([EntityID] = 'B0FA90A6-6975-4C5E-ABC7-3AEA97700CC3' AND [RelatedEntityID] = '70E4B251-16EE-452B-B2E2-621C4E416609' AND [RelatedEntityJoinField] = 'ProductCategoryID')
   )
   BEGIN
      INSERT INTO [${mjSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('74bce0c0-fbec-4778-8972-8e21650f6313', 'B0FA90A6-6975-4C5E-ABC7-3AEA97700CC3', '70E4B251-16EE-452B-B2E2-621C4E416609', 'ProductCategoryID', 'One To Many', 1, 1, 5, GETUTCDATE(), GETUTCDATE())
   END;


/* Create Entity Relationship: MJ: Companies -> MJ_BizApps_Orders: Product Options (One To Many via CompanyID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${mjSchema}].[EntityRelationship] WHERE [ID] = '610988e6-f0e7-4d7e-a907-95409474c7f5' OR ([EntityID] = 'D4238F34-2837-EF11-86D4-6045BDEE16E6' AND [RelatedEntityID] = 'F27481BD-A0DA-47F7-A985-FA3C24FCCCB7' AND [RelatedEntityJoinField] = 'CompanyID')
   )
   BEGIN
      INSERT INTO [${mjSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('610988e6-f0e7-4d7e-a907-95409474c7f5', 'D4238F34-2837-EF11-86D4-6045BDEE16E6', 'F27481BD-A0DA-47F7-A985-FA3C24FCCCB7', 'CompanyID', 'One To Many', 1, 1, 39, GETUTCDATE(), GETUTCDATE())
   END;


/* Create Entity Relationship: MJ_BizApps_Orders: Product Option Assignments -> MJ_BizApps_Orders: Product Option Assignment Values (One To Many via ProductOptionAssignmentID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${mjSchema}].[EntityRelationship] WHERE [ID] = '6c190b5b-b313-4fb1-8d7f-4a01691fdcdb' OR ([EntityID] = '70E4B251-16EE-452B-B2E2-621C4E416609' AND [RelatedEntityID] = '677FD08D-F1D8-46C3-84A7-3F16F6E51806' AND [RelatedEntityJoinField] = 'ProductOptionAssignmentID')
   )
   BEGIN
      INSERT INTO [${mjSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('6c190b5b-b313-4fb1-8d7f-4a01691fdcdb', '70E4B251-16EE-452B-B2E2-621C4E416609', '677FD08D-F1D8-46C3-84A7-3F16F6E51806', 'ProductOptionAssignmentID', 'One To Many', 1, 1, 1, GETUTCDATE(), GETUTCDATE())
   END;
                    
/* Create Entity Relationship: MJ_BizApps_Orders: Product Types -> MJ_BizApps_Orders: Product Option Assignments (One To Many via ProductTypeID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${mjSchema}].[EntityRelationship] WHERE [ID] = 'f8cc62bc-0a23-469f-978a-12d32f6958be' OR ([EntityID] = '9D578BD2-B7BB-40BD-88B7-6494C9B8DC00' AND [RelatedEntityID] = '70E4B251-16EE-452B-B2E2-621C4E416609' AND [RelatedEntityJoinField] = 'ProductTypeID')
   )
   BEGIN
      INSERT INTO [${mjSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('f8cc62bc-0a23-469f-978a-12d32f6958be', '9D578BD2-B7BB-40BD-88B7-6494C9B8DC00', '70E4B251-16EE-452B-B2E2-621C4E416609', 'ProductTypeID', 'One To Many', 1, 1, 2, GETUTCDATE(), GETUTCDATE())
   END;


/* Create Entity Relationship: MJ_BizApps_Orders: Product Options -> MJ_BizApps_Orders: Product Option Values (One To Many via ProductOptionID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${mjSchema}].[EntityRelationship] WHERE [ID] = '784d6ca0-0da7-4f29-a158-bc4b670d8384' OR ([EntityID] = 'F27481BD-A0DA-47F7-A985-FA3C24FCCCB7' AND [RelatedEntityID] = '28F5B3D1-D0E5-4C52-AAD0-0436287F32CE' AND [RelatedEntityJoinField] = 'ProductOptionID')
   )
   BEGIN
      INSERT INTO [${mjSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('784d6ca0-0da7-4f29-a158-bc4b670d8384', 'F27481BD-A0DA-47F7-A985-FA3C24FCCCB7', '28F5B3D1-D0E5-4C52-AAD0-0436287F32CE', 'ProductOptionID', 'One To Many', 1, 1, 1, GETUTCDATE(), GETUTCDATE())
   END;
                    
/* Create Entity Relationship: MJ_BizApps_Orders: Product Options -> MJ_BizApps_Orders: Product Variant Values (One To Many via ProductOptionID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${mjSchema}].[EntityRelationship] WHERE [ID] = '7310d066-d15b-49ce-a670-d10015432c9a' OR ([EntityID] = 'F27481BD-A0DA-47F7-A985-FA3C24FCCCB7' AND [RelatedEntityID] = '08CBD324-07B9-4B35-873B-368F90EBB601' AND [RelatedEntityJoinField] = 'ProductOptionID')
   )
   BEGIN
      INSERT INTO [${mjSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('7310d066-d15b-49ce-a670-d10015432c9a', 'F27481BD-A0DA-47F7-A985-FA3C24FCCCB7', '08CBD324-07B9-4B35-873B-368F90EBB601', 'ProductOptionID', 'One To Many', 1, 1, 2, GETUTCDATE(), GETUTCDATE())
   END;
                    
/* Create Entity Relationship: MJ_BizApps_Orders: Product Options -> MJ_BizApps_Orders: Product Option Assignments (One To Many via ProductOptionID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${mjSchema}].[EntityRelationship] WHERE [ID] = 'b721550d-02e1-4765-a07c-759cd2ef5bda' OR ([EntityID] = 'F27481BD-A0DA-47F7-A985-FA3C24FCCCB7' AND [RelatedEntityID] = '70E4B251-16EE-452B-B2E2-621C4E416609' AND [RelatedEntityJoinField] = 'ProductOptionID')
   )
   BEGIN
      INSERT INTO [${mjSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('b721550d-02e1-4765-a07c-759cd2ef5bda', 'F27481BD-A0DA-47F7-A985-FA3C24FCCCB7', '70E4B251-16EE-452B-B2E2-621C4E416609', 'ProductOptionID', 'One To Many', 1, 1, 3, GETUTCDATE(), GETUTCDATE())
   END;
                    
/* Create Entity Relationship: MJ_BizApps_Orders: Product Options -> MJ_BizApps_Orders: Product Successor Option Values (One To Many via ProductOptionID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${mjSchema}].[EntityRelationship] WHERE [ID] = 'f2977d74-7009-4cb6-9bd8-3fed4891d21a' OR ([EntityID] = 'F27481BD-A0DA-47F7-A985-FA3C24FCCCB7' AND [RelatedEntityID] = '279CE520-5127-4FC5-BE4D-DDE4E415852F' AND [RelatedEntityJoinField] = 'ProductOptionID')
   )
   BEGIN
      INSERT INTO [${mjSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('f2977d74-7009-4cb6-9bd8-3fed4891d21a', 'F27481BD-A0DA-47F7-A985-FA3C24FCCCB7', '279CE520-5127-4FC5-BE4D-DDE4E415852F', 'ProductOptionID', 'One To Many', 1, 1, 4, GETUTCDATE(), GETUTCDATE())
   END;


/* Create Entity Relationship: MJ_BizApps_Orders: Product Options -> MJ_BizApps_Orders: Order Line Choices (One To Many via ProductOptionID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${mjSchema}].[EntityRelationship] WHERE [ID] = '08866ebb-1b34-466d-b0b0-1d8dfd59bd57' OR ([EntityID] = 'F27481BD-A0DA-47F7-A985-FA3C24FCCCB7' AND [RelatedEntityID] = 'E5FC8970-8D06-4D58-BE59-FF8715F84890' AND [RelatedEntityJoinField] = 'ProductOptionID')
   )
   BEGIN
      INSERT INTO [${mjSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('08866ebb-1b34-466d-b0b0-1d8dfd59bd57', 'F27481BD-A0DA-47F7-A985-FA3C24FCCCB7', 'E5FC8970-8D06-4D58-BE59-FF8715F84890', 'ProductOptionID', 'One To Many', 1, 1, 5, GETUTCDATE(), GETUTCDATE())
   END;

/* Index for Foreign Keys for EventProduct */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Event Products
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key VenueAddressID in table EventProduct
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_EventProduct_VenueAddressID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[EventProduct]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_EventProduct_VenueAddressID ON [${flyway:defaultSchema}].[EventProduct] ([VenueAddressID]);

/* Base View SQL for MJ_BizApps_Orders: Event Products */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Event Products
-- Item: vwEventProducts
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ_BizApps_Orders: Event Products
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  EventProduct
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwEventProducts]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwEventProducts];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwEventProducts]
AS
SELECT
    e.*,
    __mj_isa_p1.[Name],
    __mj_isa_p1.[SKU],
    __mj_isa_p1.[ProductTypeID],
    __mj_isa_p1.[ProductCategoryID],
    __mj_isa_p1.[CompanyID],
    __mj_isa_p1.[Status],
    __mj_isa_p1.[SuccessorProductID],
    __mj_isa_p1.[AvailableFrom],
    __mj_isa_p1.[AvailableTo],
    __mj_isa_p1.[RevenueRecognitionTypeID],
    __mj_isa_p1.[StandaloneSellingPrice],
    __mj_isa_p1.[SubscriptionTypeID],
    __mj_isa_p1.[IsTaxable],
    __mj_isa_p1.[Description],
    __mj_isa_p1.[TaxCategory],
    __mj_isa_p1.[EntitlementGrantTiming],
    __mj_isa_p1.[EntitlementQuantityMode],
    __mj_isa_p1.[EntitlementValidityMode],
    __mj_isa_p1.[PricingDriverClass],
    __mj_isa_p1.[MaxQuantityPerLine],
    __mj_isa_p1.[SubscriptionFamilyID],
    __mj_isa_p1.[RenewalIncreasePercent],
    __mj_isa_p1.[RequiresSaleApproval],
    __mj_isa_p1.[IsSellableNew],
    __mj_isa_p1.[ParentProductID],
    mjBizAppsCommonAddress_VenueAddressID.[DisplayName] AS [VenueAddress]
FROM
    [${flyway:defaultSchema}].[EventProduct] AS e
INNER JOIN
    [${flyway:defaultSchema}].[Product] AS __mj_isa_p1
  ON
    [e].[ID] = __mj_isa_p1.[ID]
LEFT OUTER JOIN
    [__mj_BizAppsCommon].[Address] AS mjBizAppsCommonAddress_VenueAddressID
  ON
    [e].[VenueAddressID] = mjBizAppsCommonAddress_VenueAddressID.[ID]
GO
REVOKE SELECT ON [${flyway:defaultSchema}].[vwEventProducts] FROM [cdp_Developer]
REVOKE SELECT ON [${flyway:defaultSchema}].[vwEventProducts] FROM [cdp_Integration]
REVOKE SELECT ON [${flyway:defaultSchema}].[vwEventProducts] FROM [cdp_UI]
GRANT SELECT ON [${flyway:defaultSchema}].[vwEventProducts] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for MJ_BizApps_Orders: Event Products */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Event Products
-- Item: Permissions for vwEventProducts
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

REVOKE SELECT ON [${flyway:defaultSchema}].[vwEventProducts] FROM [cdp_Developer]
REVOKE SELECT ON [${flyway:defaultSchema}].[vwEventProducts] FROM [cdp_Integration]
REVOKE SELECT ON [${flyway:defaultSchema}].[vwEventProducts] FROM [cdp_UI]
GRANT SELECT ON [${flyway:defaultSchema}].[vwEventProducts] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for MJ_BizApps_Orders: Event Products */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Event Products
-- Item: spCreateEventProduct
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR EventProduct
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateEventProduct]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateEventProduct];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateEventProduct]
    @ID uniqueidentifier = NULL,
    @EventStartsAt datetimeoffset,
    @EventEndsAt_Clear bit = 0,
    @EventEndsAt datetimeoffset = NULL,
    @VenueName_Clear bit = 0,
    @VenueName nvarchar(300) = NULL,
    @VenueAddressID_Clear bit = 0,
    @VenueAddressID uniqueidentifier = NULL,
    @Capacity_Clear bit = 0,
    @Capacity int = NULL,
    @RequiresAttendeeInfo bit = NULL,
    @EventFormat nvarchar(20) = NULL,
    @VirtualMeetingUrl_Clear bit = 0,
    @VirtualMeetingUrl nvarchar(1000) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @ActualID UNIQUEIDENTIFIER = ISNULL(@ID, NEWID())
    INSERT INTO
    [${flyway:defaultSchema}].[EventProduct]
        (
            [EventStartsAt],
                [EventEndsAt],
                [VenueName],
                [VenueAddressID],
                [Capacity],
                [RequiresAttendeeInfo],
                [EventFormat],
                [VirtualMeetingUrl],
                [ID]
        )
    VALUES
        (
            @EventStartsAt,
                CASE WHEN @EventEndsAt_Clear = 1 THEN NULL ELSE ISNULL(@EventEndsAt, NULL) END,
                CASE WHEN @VenueName_Clear = 1 THEN NULL ELSE ISNULL(@VenueName, NULL) END,
                CASE WHEN @VenueAddressID_Clear = 1 THEN NULL ELSE ISNULL(@VenueAddressID, NULL) END,
                CASE WHEN @Capacity_Clear = 1 THEN NULL ELSE ISNULL(@Capacity, NULL) END,
                ISNULL(@RequiresAttendeeInfo, 1),
                ISNULL(@EventFormat, 'In-Person'),
                CASE WHEN @VirtualMeetingUrl_Clear = 1 THEN NULL ELSE ISNULL(@VirtualMeetingUrl, NULL) END,
                @ActualID
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwEventProducts] WHERE [ID] = @ActualID
END
GO
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreateEventProduct] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreateEventProduct] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateEventProduct] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ_BizApps_Orders: Event Products */

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreateEventProduct] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreateEventProduct] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateEventProduct] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for MJ_BizApps_Orders: Event Products */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Event Products
-- Item: spUpdateEventProduct
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR EventProduct
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateEventProduct]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateEventProduct];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateEventProduct]
    @ID uniqueidentifier,
    @EventStartsAt datetimeoffset = NULL,
    @EventEndsAt_Clear bit = 0,
    @EventEndsAt datetimeoffset = NULL,
    @VenueName_Clear bit = 0,
    @VenueName nvarchar(300) = NULL,
    @VenueAddressID_Clear bit = 0,
    @VenueAddressID uniqueidentifier = NULL,
    @Capacity_Clear bit = 0,
    @Capacity int = NULL,
    @RequiresAttendeeInfo bit = NULL,
    @EventFormat nvarchar(20) = NULL,
    @VirtualMeetingUrl_Clear bit = 0,
    @VirtualMeetingUrl nvarchar(1000) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[EventProduct]
    SET
        [EventStartsAt] = ISNULL(@EventStartsAt, [EventStartsAt]),
        [EventEndsAt] = CASE WHEN @EventEndsAt_Clear = 1 THEN NULL ELSE ISNULL(@EventEndsAt, [EventEndsAt]) END,
        [VenueName] = CASE WHEN @VenueName_Clear = 1 THEN NULL ELSE ISNULL(@VenueName, [VenueName]) END,
        [VenueAddressID] = CASE WHEN @VenueAddressID_Clear = 1 THEN NULL ELSE ISNULL(@VenueAddressID, [VenueAddressID]) END,
        [Capacity] = CASE WHEN @Capacity_Clear = 1 THEN NULL ELSE ISNULL(@Capacity, [Capacity]) END,
        [RequiresAttendeeInfo] = ISNULL(@RequiresAttendeeInfo, [RequiresAttendeeInfo]),
        [EventFormat] = ISNULL(@EventFormat, [EventFormat]),
        [VirtualMeetingUrl] = CASE WHEN @VirtualMeetingUrl_Clear = 1 THEN NULL ELSE ISNULL(@VirtualMeetingUrl, [VirtualMeetingUrl]) END
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwEventProducts] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwEventProducts]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spUpdateEventProduct] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spUpdateEventProduct] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateEventProduct] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the EventProduct table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateEventProduct]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateEventProduct];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateEventProduct
ON [${flyway:defaultSchema}].[EventProduct]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[EventProduct]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[EventProduct] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for MJ_BizApps_Orders: Event Products */

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spUpdateEventProduct] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spUpdateEventProduct] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateEventProduct] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for MJ_BizApps_Orders: Event Products */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Event Products
-- Item: spDeleteEventProduct
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR EventProduct
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteEventProduct]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteEventProduct];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteEventProduct]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[EventProduct]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteEventProduct] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteEventProduct] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteEventProduct] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for MJ_BizApps_Orders: Event Products */

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteEventProduct] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteEventProduct] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteEventProduct] TO [cdp_Developer], [cdp_Integration];

/* Index for Foreign Keys for OrderLineChoice */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Order Line Choices
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key OrderLineID in table OrderLineChoice
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_OrderLineChoice_OrderLineID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[OrderLineChoice]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_OrderLineChoice_OrderLineID ON [${flyway:defaultSchema}].[OrderLineChoice] ([OrderLineID]);

-- Index for foreign key ProductOptionID in table OrderLineChoice
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_OrderLineChoice_ProductOptionID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[OrderLineChoice]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_OrderLineChoice_ProductOptionID ON [${flyway:defaultSchema}].[OrderLineChoice] ([ProductOptionID]);

-- Index for foreign key ProductOptionValueID in table OrderLineChoice
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_OrderLineChoice_ProductOptionValueID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[OrderLineChoice]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_OrderLineChoice_ProductOptionValueID ON [${flyway:defaultSchema}].[OrderLineChoice] ([ProductOptionValueID]);

/* SQL text to update entity field related entity name field map for entity field ID 25EC4574-97EB-47EE-8EB5-133F79F130D3 */
EXEC [${mjSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='25EC4574-97EB-47EE-8EB5-133F79F130D3', @RelatedEntityNameFieldMap='ProductOption';

/* Base View SQL for MJ_BizApps_Orders: Order Line Choices */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Order Line Choices
-- Item: vwOrderLineChoices
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ_BizApps_Orders: Order Line Choices
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  OrderLineChoice
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwOrderLineChoices]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwOrderLineChoices];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwOrderLineChoices]
AS
SELECT
    o.*,
    mjBizAppsOrdersProductOption_ProductOptionID.[Name] AS [ProductOption]
FROM
    [${flyway:defaultSchema}].[OrderLineChoice] AS o
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[ProductOption] AS mjBizAppsOrdersProductOption_ProductOptionID
  ON
    [o].[ProductOptionID] = mjBizAppsOrdersProductOption_ProductOptionID.[ID]
GO
REVOKE SELECT ON [${flyway:defaultSchema}].[vwOrderLineChoices] FROM [cdp_Developer]
REVOKE SELECT ON [${flyway:defaultSchema}].[vwOrderLineChoices] FROM [cdp_Integration]
REVOKE SELECT ON [${flyway:defaultSchema}].[vwOrderLineChoices] FROM [cdp_UI]
GRANT SELECT ON [${flyway:defaultSchema}].[vwOrderLineChoices] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for MJ_BizApps_Orders: Order Line Choices */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Order Line Choices
-- Item: Permissions for vwOrderLineChoices
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

REVOKE SELECT ON [${flyway:defaultSchema}].[vwOrderLineChoices] FROM [cdp_Developer]
REVOKE SELECT ON [${flyway:defaultSchema}].[vwOrderLineChoices] FROM [cdp_Integration]
REVOKE SELECT ON [${flyway:defaultSchema}].[vwOrderLineChoices] FROM [cdp_UI]
GRANT SELECT ON [${flyway:defaultSchema}].[vwOrderLineChoices] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for MJ_BizApps_Orders: Order Line Choices */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Order Line Choices
-- Item: spCreateOrderLineChoice
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR OrderLineChoice
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateOrderLineChoice]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateOrderLineChoice];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateOrderLineChoice]
    @ID uniqueidentifier = NULL,
    @OrderLineID uniqueidentifier,
    @GroupKey nvarchar(100),
    @GroupLabel nvarchar(500),
    @OptionValue nvarchar(100),
    @OptionLabel nvarchar(500),
    @ProductOptionID_Clear bit = 0,
    @ProductOptionID uniqueidentifier = NULL,
    @ProductOptionValueID_Clear bit = 0,
    @ProductOptionValueID uniqueidentifier = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)

    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[OrderLineChoice]
            (
                [ID],
                [OrderLineID],
                [GroupKey],
                [GroupLabel],
                [OptionValue],
                [OptionLabel],
                [ProductOptionID],
                [ProductOptionValueID]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @OrderLineID,
                @GroupKey,
                @GroupLabel,
                @OptionValue,
                @OptionLabel,
                CASE WHEN @ProductOptionID_Clear = 1 THEN NULL ELSE ISNULL(@ProductOptionID, NULL) END,
                CASE WHEN @ProductOptionValueID_Clear = 1 THEN NULL ELSE ISNULL(@ProductOptionValueID, NULL) END
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[OrderLineChoice]
            (
                [OrderLineID],
                [GroupKey],
                [GroupLabel],
                [OptionValue],
                [OptionLabel],
                [ProductOptionID],
                [ProductOptionValueID]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @OrderLineID,
                @GroupKey,
                @GroupLabel,
                @OptionValue,
                @OptionLabel,
                CASE WHEN @ProductOptionID_Clear = 1 THEN NULL ELSE ISNULL(@ProductOptionID, NULL) END,
                CASE WHEN @ProductOptionValueID_Clear = 1 THEN NULL ELSE ISNULL(@ProductOptionValueID, NULL) END
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwOrderLineChoices] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreateOrderLineChoice] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreateOrderLineChoice] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateOrderLineChoice] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ_BizApps_Orders: Order Line Choices */

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreateOrderLineChoice] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreateOrderLineChoice] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateOrderLineChoice] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for MJ_BizApps_Orders: Order Line Choices */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Order Line Choices
-- Item: spUpdateOrderLineChoice
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR OrderLineChoice
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateOrderLineChoice]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateOrderLineChoice];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateOrderLineChoice]
    @ID uniqueidentifier,
    @OrderLineID uniqueidentifier = NULL,
    @GroupKey nvarchar(100) = NULL,
    @GroupLabel nvarchar(500) = NULL,
    @OptionValue nvarchar(100) = NULL,
    @OptionLabel nvarchar(500) = NULL,
    @ProductOptionID_Clear bit = 0,
    @ProductOptionID uniqueidentifier = NULL,
    @ProductOptionValueID_Clear bit = 0,
    @ProductOptionValueID uniqueidentifier = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[OrderLineChoice]
    SET
        [OrderLineID] = ISNULL(@OrderLineID, [OrderLineID]),
        [GroupKey] = ISNULL(@GroupKey, [GroupKey]),
        [GroupLabel] = ISNULL(@GroupLabel, [GroupLabel]),
        [OptionValue] = ISNULL(@OptionValue, [OptionValue]),
        [OptionLabel] = ISNULL(@OptionLabel, [OptionLabel]),
        [ProductOptionID] = CASE WHEN @ProductOptionID_Clear = 1 THEN NULL ELSE ISNULL(@ProductOptionID, [ProductOptionID]) END,
        [ProductOptionValueID] = CASE WHEN @ProductOptionValueID_Clear = 1 THEN NULL ELSE ISNULL(@ProductOptionValueID, [ProductOptionValueID]) END
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwOrderLineChoices] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwOrderLineChoices]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spUpdateOrderLineChoice] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spUpdateOrderLineChoice] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateOrderLineChoice] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the OrderLineChoice table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateOrderLineChoice]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateOrderLineChoice];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateOrderLineChoice
ON [${flyway:defaultSchema}].[OrderLineChoice]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[OrderLineChoice]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[OrderLineChoice] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for MJ_BizApps_Orders: Order Line Choices */

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spUpdateOrderLineChoice] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spUpdateOrderLineChoice] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateOrderLineChoice] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for MJ_BizApps_Orders: Order Line Choices */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Order Line Choices
-- Item: spDeleteOrderLineChoice
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR OrderLineChoice
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteOrderLineChoice]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteOrderLineChoice];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteOrderLineChoice]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[OrderLineChoice]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteOrderLineChoice] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteOrderLineChoice] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteOrderLineChoice] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for MJ_BizApps_Orders: Order Line Choices */

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteOrderLineChoice] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteOrderLineChoice] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteOrderLineChoice] TO [cdp_Developer], [cdp_Integration];

/* Index for Foreign Keys for ProductOptionAssignmentValue */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Product Option Assignment Values
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key ProductOptionAssignmentID in table ProductOptionAssignmentValue
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_ProductOptionAssignmentValue_ProductOptionAssignmentID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[ProductOptionAssignmentValue]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_ProductOptionAssignmentValue_ProductOptionAssignmentID ON [${flyway:defaultSchema}].[ProductOptionAssignmentValue] ([ProductOptionAssignmentID]);

-- Index for foreign key ProductOptionValueID in table ProductOptionAssignmentValue
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_ProductOptionAssignmentValue_ProductOptionValueID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[ProductOptionAssignmentValue]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_ProductOptionAssignmentValue_ProductOptionValueID ON [${flyway:defaultSchema}].[ProductOptionAssignmentValue] ([ProductOptionValueID]);

/* Index for Foreign Keys for ProductOptionAssignment */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Product Option Assignments
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key ProductTypeID in table ProductOptionAssignment
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_ProductOptionAssignment_ProductTypeID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[ProductOptionAssignment]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_ProductOptionAssignment_ProductTypeID ON [${flyway:defaultSchema}].[ProductOptionAssignment] ([ProductTypeID]);

-- Index for foreign key ProductCategoryID in table ProductOptionAssignment
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_ProductOptionAssignment_ProductCategoryID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[ProductOptionAssignment]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_ProductOptionAssignment_ProductCategoryID ON [${flyway:defaultSchema}].[ProductOptionAssignment] ([ProductCategoryID]);

-- Index for foreign key ProductID in table ProductOptionAssignment
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_ProductOptionAssignment_ProductID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[ProductOptionAssignment]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_ProductOptionAssignment_ProductID ON [${flyway:defaultSchema}].[ProductOptionAssignment] ([ProductID]);

-- Index for foreign key ProductOptionID in table ProductOptionAssignment
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_ProductOptionAssignment_ProductOptionID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[ProductOptionAssignment]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_ProductOptionAssignment_ProductOptionID ON [${flyway:defaultSchema}].[ProductOptionAssignment] ([ProductOptionID]);

-- Index for foreign key DefaultProductOptionValueID in table ProductOptionAssignment
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_ProductOptionAssignment_DefaultProductOptionValueID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[ProductOptionAssignment]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_ProductOptionAssignment_DefaultProductOptionValueID ON [${flyway:defaultSchema}].[ProductOptionAssignment] ([DefaultProductOptionValueID]);

/* SQL text to update entity field related entity name field map for entity field ID 9241A88B-F611-4C91-A08E-525E33222496 */
EXEC [${mjSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='9241A88B-F611-4C91-A08E-525E33222496', @RelatedEntityNameFieldMap='ProductType';

/* Index for Foreign Keys for ProductOptionValue */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Product Option Values
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key ProductOptionID in table ProductOptionValue
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_ProductOptionValue_ProductOptionID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[ProductOptionValue]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_ProductOptionValue_ProductOptionID ON [${flyway:defaultSchema}].[ProductOptionValue] ([ProductOptionID]);

/* SQL text to update entity field related entity name field map for entity field ID 7F72F84B-C590-418B-B3FA-15D302326113 */
EXEC [${mjSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='7F72F84B-C590-418B-B3FA-15D302326113', @RelatedEntityNameFieldMap='ProductOption';

/* Index for Foreign Keys for ProductOption */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Product Options
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key CompanyID in table ProductOption
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_ProductOption_CompanyID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[ProductOption]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_ProductOption_CompanyID ON [${flyway:defaultSchema}].[ProductOption] ([CompanyID]);

/* SQL text to update entity field related entity name field map for entity field ID D9C5FA77-6B89-4874-AF10-20725887E2F7 */
EXEC [${mjSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='D9C5FA77-6B89-4874-AF10-20725887E2F7', @RelatedEntityNameFieldMap='Company';

/* Base View SQL for MJ_BizApps_Orders: Product Option Assignment Values */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Product Option Assignment Values
-- Item: vwProductOptionAssignmentValues
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ_BizApps_Orders: Product Option Assignment Values
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  ProductOptionAssignmentValue
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwProductOptionAssignmentValues]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwProductOptionAssignmentValues];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwProductOptionAssignmentValues]
AS
SELECT
    p.*
FROM
    [${flyway:defaultSchema}].[ProductOptionAssignmentValue] AS p
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwProductOptionAssignmentValues] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for MJ_BizApps_Orders: Product Option Assignment Values */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Product Option Assignment Values
-- Item: Permissions for vwProductOptionAssignmentValues
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwProductOptionAssignmentValues] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for MJ_BizApps_Orders: Product Option Assignment Values */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Product Option Assignment Values
-- Item: spCreateProductOptionAssignmentValue
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR ProductOptionAssignmentValue
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateProductOptionAssignmentValue]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateProductOptionAssignmentValue];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateProductOptionAssignmentValue]
    @ID uniqueidentifier = NULL,
    @ProductOptionAssignmentID uniqueidentifier,
    @ProductOptionValueID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)

    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[ProductOptionAssignmentValue]
            (
                [ID],
                [ProductOptionAssignmentID],
                [ProductOptionValueID]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @ProductOptionAssignmentID,
                @ProductOptionValueID
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[ProductOptionAssignmentValue]
            (
                [ProductOptionAssignmentID],
                [ProductOptionValueID]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ProductOptionAssignmentID,
                @ProductOptionValueID
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwProductOptionAssignmentValues] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateProductOptionAssignmentValue] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ_BizApps_Orders: Product Option Assignment Values */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateProductOptionAssignmentValue] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for MJ_BizApps_Orders: Product Option Assignment Values */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Product Option Assignment Values
-- Item: spUpdateProductOptionAssignmentValue
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR ProductOptionAssignmentValue
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateProductOptionAssignmentValue]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateProductOptionAssignmentValue];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateProductOptionAssignmentValue]
    @ID uniqueidentifier,
    @ProductOptionAssignmentID uniqueidentifier = NULL,
    @ProductOptionValueID uniqueidentifier = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[ProductOptionAssignmentValue]
    SET
        [ProductOptionAssignmentID] = ISNULL(@ProductOptionAssignmentID, [ProductOptionAssignmentID]),
        [ProductOptionValueID] = ISNULL(@ProductOptionValueID, [ProductOptionValueID])
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwProductOptionAssignmentValues] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwProductOptionAssignmentValues]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateProductOptionAssignmentValue] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the ProductOptionAssignmentValue table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateProductOptionAssignmentValue]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateProductOptionAssignmentValue];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateProductOptionAssignmentValue
ON [${flyway:defaultSchema}].[ProductOptionAssignmentValue]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[ProductOptionAssignmentValue]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[ProductOptionAssignmentValue] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for MJ_BizApps_Orders: Product Option Assignment Values */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateProductOptionAssignmentValue] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for MJ_BizApps_Orders: Product Option Assignment Values */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Product Option Assignment Values
-- Item: spDeleteProductOptionAssignmentValue
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR ProductOptionAssignmentValue
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteProductOptionAssignmentValue]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteProductOptionAssignmentValue];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteProductOptionAssignmentValue]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[ProductOptionAssignmentValue]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteProductOptionAssignmentValue] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for MJ_BizApps_Orders: Product Option Assignment Values */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteProductOptionAssignmentValue] TO [cdp_Developer], [cdp_Integration];

/* Base View SQL for MJ_BizApps_Orders: Product Option Values */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Product Option Values
-- Item: vwProductOptionValues
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ_BizApps_Orders: Product Option Values
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  ProductOptionValue
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwProductOptionValues]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwProductOptionValues];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwProductOptionValues]
AS
SELECT
    p.*,
    mjBizAppsOrdersProductOption_ProductOptionID.[Name] AS [ProductOption]
FROM
    [${flyway:defaultSchema}].[ProductOptionValue] AS p
INNER JOIN
    [${flyway:defaultSchema}].[ProductOption] AS mjBizAppsOrdersProductOption_ProductOptionID
  ON
    [p].[ProductOptionID] = mjBizAppsOrdersProductOption_ProductOptionID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwProductOptionValues] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for MJ_BizApps_Orders: Product Option Values */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Product Option Values
-- Item: Permissions for vwProductOptionValues
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwProductOptionValues] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for MJ_BizApps_Orders: Product Option Values */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Product Option Values
-- Item: spCreateProductOptionValue
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR ProductOptionValue
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateProductOptionValue]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateProductOptionValue];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateProductOptionValue]
    @ID uniqueidentifier = NULL,
    @ProductOptionID uniqueidentifier,
    @Code nvarchar(50),
    @Label nvarchar(200),
    @SortOrder int = NULL,
    @IsActive bit = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)

    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[ProductOptionValue]
            (
                [ID],
                [ProductOptionID],
                [Code],
                [Label],
                [SortOrder],
                [IsActive]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @ProductOptionID,
                @Code,
                @Label,
                ISNULL(@SortOrder, 0),
                ISNULL(@IsActive, 1)
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[ProductOptionValue]
            (
                [ProductOptionID],
                [Code],
                [Label],
                [SortOrder],
                [IsActive]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ProductOptionID,
                @Code,
                @Label,
                ISNULL(@SortOrder, 0),
                ISNULL(@IsActive, 1)
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwProductOptionValues] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateProductOptionValue] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ_BizApps_Orders: Product Option Values */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateProductOptionValue] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for MJ_BizApps_Orders: Product Option Values */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Product Option Values
-- Item: spUpdateProductOptionValue
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR ProductOptionValue
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateProductOptionValue]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateProductOptionValue];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateProductOptionValue]
    @ID uniqueidentifier,
    @ProductOptionID uniqueidentifier = NULL,
    @Code nvarchar(50) = NULL,
    @Label nvarchar(200) = NULL,
    @SortOrder int = NULL,
    @IsActive bit = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[ProductOptionValue]
    SET
        [ProductOptionID] = ISNULL(@ProductOptionID, [ProductOptionID]),
        [Code] = ISNULL(@Code, [Code]),
        [Label] = ISNULL(@Label, [Label]),
        [SortOrder] = ISNULL(@SortOrder, [SortOrder]),
        [IsActive] = ISNULL(@IsActive, [IsActive])
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwProductOptionValues] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwProductOptionValues]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateProductOptionValue] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the ProductOptionValue table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateProductOptionValue]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateProductOptionValue];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateProductOptionValue
ON [${flyway:defaultSchema}].[ProductOptionValue]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[ProductOptionValue]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[ProductOptionValue] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for MJ_BizApps_Orders: Product Option Values */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateProductOptionValue] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for MJ_BizApps_Orders: Product Option Values */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Product Option Values
-- Item: spDeleteProductOptionValue
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR ProductOptionValue
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteProductOptionValue]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteProductOptionValue];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteProductOptionValue]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[ProductOptionValue]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteProductOptionValue] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for MJ_BizApps_Orders: Product Option Values */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteProductOptionValue] TO [cdp_Developer], [cdp_Integration];

/* Base View SQL for MJ_BizApps_Orders: Product Options */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Product Options
-- Item: vwProductOptions
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ_BizApps_Orders: Product Options
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  ProductOption
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwProductOptions]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwProductOptions];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwProductOptions]
AS
SELECT
    p.*,
    MJCompany_CompanyID.[Name] AS [Company]
FROM
    [${flyway:defaultSchema}].[ProductOption] AS p
LEFT OUTER JOIN
    [${mjSchema}].[Company] AS MJCompany_CompanyID
  ON
    [p].[CompanyID] = MJCompany_CompanyID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwProductOptions] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for MJ_BizApps_Orders: Product Options */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Product Options
-- Item: Permissions for vwProductOptions
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwProductOptions] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for MJ_BizApps_Orders: Product Options */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Product Options
-- Item: spCreateProductOption
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR ProductOption
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateProductOption]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateProductOption];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateProductOption]
    @ID uniqueidentifier = NULL,
    @CompanyID_Clear bit = 0,
    @CompanyID uniqueidentifier = NULL,
    @Code nvarchar(50),
    @Name nvarchar(100),
    @Description_Clear bit = 0,
    @Description nvarchar(MAX) = NULL,
    @SortOrder int = NULL,
    @IsActive bit = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)

    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[ProductOption]
            (
                [ID],
                [CompanyID],
                [Code],
                [Name],
                [Description],
                [SortOrder],
                [IsActive]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                CASE WHEN @CompanyID_Clear = 1 THEN NULL ELSE ISNULL(@CompanyID, NULL) END,
                @Code,
                @Name,
                CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, NULL) END,
                ISNULL(@SortOrder, 0),
                ISNULL(@IsActive, 1)
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[ProductOption]
            (
                [CompanyID],
                [Code],
                [Name],
                [Description],
                [SortOrder],
                [IsActive]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                CASE WHEN @CompanyID_Clear = 1 THEN NULL ELSE ISNULL(@CompanyID, NULL) END,
                @Code,
                @Name,
                CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, NULL) END,
                ISNULL(@SortOrder, 0),
                ISNULL(@IsActive, 1)
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwProductOptions] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateProductOption] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ_BizApps_Orders: Product Options */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateProductOption] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for MJ_BizApps_Orders: Product Options */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Product Options
-- Item: spUpdateProductOption
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR ProductOption
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateProductOption]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateProductOption];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateProductOption]
    @ID uniqueidentifier,
    @CompanyID_Clear bit = 0,
    @CompanyID uniqueidentifier = NULL,
    @Code nvarchar(50) = NULL,
    @Name nvarchar(100) = NULL,
    @Description_Clear bit = 0,
    @Description nvarchar(MAX) = NULL,
    @SortOrder int = NULL,
    @IsActive bit = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[ProductOption]
    SET
        [CompanyID] = CASE WHEN @CompanyID_Clear = 1 THEN NULL ELSE ISNULL(@CompanyID, [CompanyID]) END,
        [Code] = ISNULL(@Code, [Code]),
        [Name] = ISNULL(@Name, [Name]),
        [Description] = CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, [Description]) END,
        [SortOrder] = ISNULL(@SortOrder, [SortOrder]),
        [IsActive] = ISNULL(@IsActive, [IsActive])
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwProductOptions] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwProductOptions]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateProductOption] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the ProductOption table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateProductOption]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateProductOption];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateProductOption
ON [${flyway:defaultSchema}].[ProductOption]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[ProductOption]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[ProductOption] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for MJ_BizApps_Orders: Product Options */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateProductOption] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for MJ_BizApps_Orders: Product Options */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Product Options
-- Item: spDeleteProductOption
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR ProductOption
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteProductOption]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteProductOption];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteProductOption]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[ProductOption]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteProductOption] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for MJ_BizApps_Orders: Product Options */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteProductOption] TO [cdp_Developer], [cdp_Integration];

/* SQL text to update entity field related entity name field map for entity field ID 7A7F2463-B170-4AAD-8EBD-9916258A2D0A */
EXEC [${mjSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='7A7F2463-B170-4AAD-8EBD-9916258A2D0A', @RelatedEntityNameFieldMap='ProductCategory';

/* SQL text to update entity field related entity name field map for entity field ID D82F498B-429C-4256-A9E0-5856571E7346 */
EXEC [${mjSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='D82F498B-429C-4256-A9E0-5856571E7346', @RelatedEntityNameFieldMap='Product';

/* SQL text to update entity field related entity name field map for entity field ID 42423CD1-5C5D-4638-9C5E-ABC0B3D1894E */
EXEC [${mjSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='42423CD1-5C5D-4638-9C5E-ABC0B3D1894E', @RelatedEntityNameFieldMap='ProductOption';

/* Base View SQL for MJ_BizApps_Orders: Product Option Assignments */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Product Option Assignments
-- Item: vwProductOptionAssignments
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ_BizApps_Orders: Product Option Assignments
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  ProductOptionAssignment
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwProductOptionAssignments]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwProductOptionAssignments];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwProductOptionAssignments]
AS
SELECT
    p.*,
    mjBizAppsOrdersProductType_ProductTypeID.[Name] AS [ProductType],
    mjBizAppsOrdersProductCategory_ProductCategoryID.[Name] AS [ProductCategory],
    mjBizAppsOrdersProduct_ProductID.[Name] AS [Product],
    mjBizAppsOrdersProductOption_ProductOptionID.[Name] AS [ProductOption]
FROM
    [${flyway:defaultSchema}].[ProductOptionAssignment] AS p
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[ProductType] AS mjBizAppsOrdersProductType_ProductTypeID
  ON
    [p].[ProductTypeID] = mjBizAppsOrdersProductType_ProductTypeID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[ProductCategory] AS mjBizAppsOrdersProductCategory_ProductCategoryID
  ON
    [p].[ProductCategoryID] = mjBizAppsOrdersProductCategory_ProductCategoryID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[Product] AS mjBizAppsOrdersProduct_ProductID
  ON
    [p].[ProductID] = mjBizAppsOrdersProduct_ProductID.[ID]
INNER JOIN
    [${flyway:defaultSchema}].[ProductOption] AS mjBizAppsOrdersProductOption_ProductOptionID
  ON
    [p].[ProductOptionID] = mjBizAppsOrdersProductOption_ProductOptionID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwProductOptionAssignments] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for MJ_BizApps_Orders: Product Option Assignments */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Product Option Assignments
-- Item: Permissions for vwProductOptionAssignments
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwProductOptionAssignments] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for MJ_BizApps_Orders: Product Option Assignments */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Product Option Assignments
-- Item: spCreateProductOptionAssignment
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR ProductOptionAssignment
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateProductOptionAssignment]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateProductOptionAssignment];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateProductOptionAssignment]
    @ID uniqueidentifier = NULL,
    @ProductTypeID_Clear bit = 0,
    @ProductTypeID uniqueidentifier = NULL,
    @ProductCategoryID_Clear bit = 0,
    @ProductCategoryID uniqueidentifier = NULL,
    @ProductID_Clear bit = 0,
    @ProductID uniqueidentifier = NULL,
    @ProductOptionID uniqueidentifier,
    @IsExcluded bit = NULL,
    @IsRequired bit = NULL,
    @DefaultProductOptionValueID_Clear bit = 0,
    @DefaultProductOptionValueID uniqueidentifier = NULL,
    @SortOrder int = NULL,
    @Role nvarchar(20) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)

    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[ProductOptionAssignment]
            (
                [ID],
                [ProductTypeID],
                [ProductCategoryID],
                [ProductID],
                [ProductOptionID],
                [IsExcluded],
                [IsRequired],
                [DefaultProductOptionValueID],
                [SortOrder],
                [Role]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                CASE WHEN @ProductTypeID_Clear = 1 THEN NULL ELSE ISNULL(@ProductTypeID, NULL) END,
                CASE WHEN @ProductCategoryID_Clear = 1 THEN NULL ELSE ISNULL(@ProductCategoryID, NULL) END,
                CASE WHEN @ProductID_Clear = 1 THEN NULL ELSE ISNULL(@ProductID, NULL) END,
                @ProductOptionID,
                ISNULL(@IsExcluded, 0),
                ISNULL(@IsRequired, 0),
                CASE WHEN @DefaultProductOptionValueID_Clear = 1 THEN NULL ELSE ISNULL(@DefaultProductOptionValueID, NULL) END,
                ISNULL(@SortOrder, 0),
                ISNULL(@Role, 'LineOption')
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[ProductOptionAssignment]
            (
                [ProductTypeID],
                [ProductCategoryID],
                [ProductID],
                [ProductOptionID],
                [IsExcluded],
                [IsRequired],
                [DefaultProductOptionValueID],
                [SortOrder],
                [Role]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                CASE WHEN @ProductTypeID_Clear = 1 THEN NULL ELSE ISNULL(@ProductTypeID, NULL) END,
                CASE WHEN @ProductCategoryID_Clear = 1 THEN NULL ELSE ISNULL(@ProductCategoryID, NULL) END,
                CASE WHEN @ProductID_Clear = 1 THEN NULL ELSE ISNULL(@ProductID, NULL) END,
                @ProductOptionID,
                ISNULL(@IsExcluded, 0),
                ISNULL(@IsRequired, 0),
                CASE WHEN @DefaultProductOptionValueID_Clear = 1 THEN NULL ELSE ISNULL(@DefaultProductOptionValueID, NULL) END,
                ISNULL(@SortOrder, 0),
                ISNULL(@Role, 'LineOption')
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwProductOptionAssignments] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateProductOptionAssignment] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ_BizApps_Orders: Product Option Assignments */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateProductOptionAssignment] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for MJ_BizApps_Orders: Product Option Assignments */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Product Option Assignments
-- Item: spUpdateProductOptionAssignment
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR ProductOptionAssignment
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateProductOptionAssignment]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateProductOptionAssignment];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateProductOptionAssignment]
    @ID uniqueidentifier,
    @ProductTypeID_Clear bit = 0,
    @ProductTypeID uniqueidentifier = NULL,
    @ProductCategoryID_Clear bit = 0,
    @ProductCategoryID uniqueidentifier = NULL,
    @ProductID_Clear bit = 0,
    @ProductID uniqueidentifier = NULL,
    @ProductOptionID uniqueidentifier = NULL,
    @IsExcluded bit = NULL,
    @IsRequired bit = NULL,
    @DefaultProductOptionValueID_Clear bit = 0,
    @DefaultProductOptionValueID uniqueidentifier = NULL,
    @SortOrder int = NULL,
    @Role nvarchar(20) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[ProductOptionAssignment]
    SET
        [ProductTypeID] = CASE WHEN @ProductTypeID_Clear = 1 THEN NULL ELSE ISNULL(@ProductTypeID, [ProductTypeID]) END,
        [ProductCategoryID] = CASE WHEN @ProductCategoryID_Clear = 1 THEN NULL ELSE ISNULL(@ProductCategoryID, [ProductCategoryID]) END,
        [ProductID] = CASE WHEN @ProductID_Clear = 1 THEN NULL ELSE ISNULL(@ProductID, [ProductID]) END,
        [ProductOptionID] = ISNULL(@ProductOptionID, [ProductOptionID]),
        [IsExcluded] = ISNULL(@IsExcluded, [IsExcluded]),
        [IsRequired] = ISNULL(@IsRequired, [IsRequired]),
        [DefaultProductOptionValueID] = CASE WHEN @DefaultProductOptionValueID_Clear = 1 THEN NULL ELSE ISNULL(@DefaultProductOptionValueID, [DefaultProductOptionValueID]) END,
        [SortOrder] = ISNULL(@SortOrder, [SortOrder]),
        [Role] = ISNULL(@Role, [Role])
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwProductOptionAssignments] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwProductOptionAssignments]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateProductOptionAssignment] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the ProductOptionAssignment table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateProductOptionAssignment]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateProductOptionAssignment];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateProductOptionAssignment
ON [${flyway:defaultSchema}].[ProductOptionAssignment]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[ProductOptionAssignment]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[ProductOptionAssignment] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for MJ_BizApps_Orders: Product Option Assignments */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateProductOptionAssignment] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for MJ_BizApps_Orders: Product Option Assignments */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Product Option Assignments
-- Item: spDeleteProductOptionAssignment
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR ProductOptionAssignment
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteProductOptionAssignment]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteProductOptionAssignment];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteProductOptionAssignment]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[ProductOptionAssignment]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteProductOptionAssignment] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for MJ_BizApps_Orders: Product Option Assignments */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteProductOptionAssignment] TO [cdp_Developer], [cdp_Integration];

/* Index for Foreign Keys for ProductSuccessorOptionValue */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Product Successor Option Values
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key ProductID in table ProductSuccessorOptionValue
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_ProductSuccessorOptionValue_ProductID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[ProductSuccessorOptionValue]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_ProductSuccessorOptionValue_ProductID ON [${flyway:defaultSchema}].[ProductSuccessorOptionValue] ([ProductID]);

-- Index for foreign key ProductOptionID in table ProductSuccessorOptionValue
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_ProductSuccessorOptionValue_ProductOptionID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[ProductSuccessorOptionValue]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_ProductSuccessorOptionValue_ProductOptionID ON [${flyway:defaultSchema}].[ProductSuccessorOptionValue] ([ProductOptionID]);

-- Index for foreign key ProductOptionValueID in table ProductSuccessorOptionValue
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_ProductSuccessorOptionValue_ProductOptionValueID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[ProductSuccessorOptionValue]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_ProductSuccessorOptionValue_ProductOptionValueID ON [${flyway:defaultSchema}].[ProductSuccessorOptionValue] ([ProductOptionValueID]);

/* SQL text to update entity field related entity name field map for entity field ID 985A9F04-C185-4B67-B082-51DC790CF729 */
EXEC [${mjSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='985A9F04-C185-4B67-B082-51DC790CF729', @RelatedEntityNameFieldMap='Product';

/* Index for Foreign Keys for ProductVariantValue */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Product Variant Values
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key ProductID in table ProductVariantValue
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_ProductVariantValue_ProductID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[ProductVariantValue]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_ProductVariantValue_ProductID ON [${flyway:defaultSchema}].[ProductVariantValue] ([ProductID]);

-- Index for foreign key ProductOptionID in table ProductVariantValue
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_ProductVariantValue_ProductOptionID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[ProductVariantValue]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_ProductVariantValue_ProductOptionID ON [${flyway:defaultSchema}].[ProductVariantValue] ([ProductOptionID]);

-- Index for foreign key ProductOptionValueID in table ProductVariantValue
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_ProductVariantValue_ProductOptionValueID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[ProductVariantValue]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_ProductVariantValue_ProductOptionValueID ON [${flyway:defaultSchema}].[ProductVariantValue] ([ProductOptionValueID]);

/* SQL text to update entity field related entity name field map for entity field ID 16DFF0B4-712F-4EA4-9A89-BCDB68B1419C */
EXEC [${mjSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='16DFF0B4-712F-4EA4-9A89-BCDB68B1419C', @RelatedEntityNameFieldMap='Product';

/* Index for Foreign Keys for Product */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Products
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key ProductTypeID in table Product
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_Product_ProductTypeID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[Product]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_Product_ProductTypeID ON [${flyway:defaultSchema}].[Product] ([ProductTypeID]);

-- Index for foreign key ProductCategoryID in table Product
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_Product_ProductCategoryID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[Product]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_Product_ProductCategoryID ON [${flyway:defaultSchema}].[Product] ([ProductCategoryID]);

-- Index for foreign key CompanyID in table Product
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_Product_CompanyID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[Product]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_Product_CompanyID ON [${flyway:defaultSchema}].[Product] ([CompanyID]);

-- Index for foreign key SuccessorProductID in table Product
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_Product_SuccessorProductID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[Product]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_Product_SuccessorProductID ON [${flyway:defaultSchema}].[Product] ([SuccessorProductID]);

-- Index for foreign key RevenueRecognitionTypeID in table Product
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_Product_RevenueRecognitionTypeID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[Product]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_Product_RevenueRecognitionTypeID ON [${flyway:defaultSchema}].[Product] ([RevenueRecognitionTypeID]);

-- Index for foreign key SubscriptionTypeID in table Product
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_Product_SubscriptionTypeID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[Product]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_Product_SubscriptionTypeID ON [${flyway:defaultSchema}].[Product] ([SubscriptionTypeID]);

-- Index for foreign key SubscriptionFamilyID in table Product
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_Product_SubscriptionFamilyID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[Product]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_Product_SubscriptionFamilyID ON [${flyway:defaultSchema}].[Product] ([SubscriptionFamilyID]);

-- Index for foreign key ParentProductID in table Product
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_Product_ParentProductID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[Product]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_Product_ParentProductID ON [${flyway:defaultSchema}].[Product] ([ParentProductID]);

/* SQL text to update entity field related entity name field map for entity field ID 54C1A518-0E60-4EFE-A3B8-EE6A3F2FA412 */
EXEC [${mjSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='54C1A518-0E60-4EFE-A3B8-EE6A3F2FA412', @RelatedEntityNameFieldMap='ParentProduct';

/* SQL text to update entity field related entity name field map for entity field ID 1943A145-98FF-4476-9A6B-4837F1523731 */
EXEC [${mjSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='1943A145-98FF-4476-9A6B-4837F1523731', @RelatedEntityNameFieldMap='ProductOption';

/* Descendants Traversal Function SQL for MJ_BizApps_Orders: Products.SuccessorProductID */
/* Ancestors Traversal Function SQL for MJ_BizApps_Orders: Products.SuccessorProductID */
/* Root ID Function SQL for MJ_BizApps_Orders: Products.SuccessorProductID */
/* Base View SQL for MJ_BizApps_Orders: Products */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Products
-- Item: vwProducts
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ_BizApps_Orders: Products
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  Product
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwProducts]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwProducts];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwProducts]
AS
SELECT
    p.*,
    mjBizAppsOrdersProductType_ProductTypeID.[Name] AS [ProductType],
    mjBizAppsOrdersProductCategory_ProductCategoryID.[Name] AS [ProductCategory],
    MJCompany_CompanyID.[Name] AS [Company],
    mjBizAppsOrdersProduct_SuccessorProductID.[Name] AS [SuccessorProduct],
    mjBizAppsOrdersRevenueRecognitionType_RevenueRecognitionTypeID.[Name] AS [RevenueRecognitionType],
    mjBizAppsOrdersSubscriptionType_SubscriptionTypeID.[Name] AS [SubscriptionType],
    mjBizAppsOrdersSubscriptionFamily_SubscriptionFamilyID.[Name] AS [SubscriptionFamily],
    mjBizAppsOrdersProduct_ParentProductID.[Name] AS [ParentProduct]
FROM
    [${flyway:defaultSchema}].[Product] AS p
INNER JOIN
    [${flyway:defaultSchema}].[ProductType] AS mjBizAppsOrdersProductType_ProductTypeID
  ON
    [p].[ProductTypeID] = mjBizAppsOrdersProductType_ProductTypeID.[ID]
INNER JOIN
    [${flyway:defaultSchema}].[ProductCategory] AS mjBizAppsOrdersProductCategory_ProductCategoryID
  ON
    [p].[ProductCategoryID] = mjBizAppsOrdersProductCategory_ProductCategoryID.[ID]
INNER JOIN
    [${mjSchema}].[Company] AS MJCompany_CompanyID
  ON
    [p].[CompanyID] = MJCompany_CompanyID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[Product] AS mjBizAppsOrdersProduct_SuccessorProductID
  ON
    [p].[SuccessorProductID] = mjBizAppsOrdersProduct_SuccessorProductID.[ID]
INNER JOIN
    [${flyway:defaultSchema}].[RevenueRecognitionType] AS mjBizAppsOrdersRevenueRecognitionType_RevenueRecognitionTypeID
  ON
    [p].[RevenueRecognitionTypeID] = mjBizAppsOrdersRevenueRecognitionType_RevenueRecognitionTypeID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[SubscriptionType] AS mjBizAppsOrdersSubscriptionType_SubscriptionTypeID
  ON
    [p].[SubscriptionTypeID] = mjBizAppsOrdersSubscriptionType_SubscriptionTypeID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[SubscriptionFamily] AS mjBizAppsOrdersSubscriptionFamily_SubscriptionFamilyID
  ON
    [p].[SubscriptionFamilyID] = mjBizAppsOrdersSubscriptionFamily_SubscriptionFamilyID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[Product] AS mjBizAppsOrdersProduct_ParentProductID
  ON
    [p].[ParentProductID] = mjBizAppsOrdersProduct_ParentProductID.[ID]
GO
REVOKE SELECT ON [${flyway:defaultSchema}].[vwProducts] FROM [cdp_Developer]
REVOKE SELECT ON [${flyway:defaultSchema}].[vwProducts] FROM [cdp_Integration]
REVOKE SELECT ON [${flyway:defaultSchema}].[vwProducts] FROM [cdp_UI]
GRANT SELECT ON [${flyway:defaultSchema}].[vwProducts] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for MJ_BizApps_Orders: Products */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Products
-- Item: Permissions for vwProducts
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

REVOKE SELECT ON [${flyway:defaultSchema}].[vwProducts] FROM [cdp_Developer]
REVOKE SELECT ON [${flyway:defaultSchema}].[vwProducts] FROM [cdp_Integration]
REVOKE SELECT ON [${flyway:defaultSchema}].[vwProducts] FROM [cdp_UI]
GRANT SELECT ON [${flyway:defaultSchema}].[vwProducts] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for MJ_BizApps_Orders: Products */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Products
-- Item: spCreateProduct
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR Product
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateProduct]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateProduct];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateProduct]
    @ID uniqueidentifier = NULL,
    @Name nvarchar(200),
    @SKU_Clear bit = 0,
    @SKU nvarchar(80) = NULL,
    @ProductTypeID uniqueidentifier,
    @ProductCategoryID uniqueidentifier,
    @CompanyID uniqueidentifier,
    @Status nvarchar(20) = NULL,
    @SuccessorProductID_Clear bit = 0,
    @SuccessorProductID uniqueidentifier = NULL,
    @AvailableFrom_Clear bit = 0,
    @AvailableFrom date = NULL,
    @AvailableTo_Clear bit = 0,
    @AvailableTo date = NULL,
    @RevenueRecognitionTypeID uniqueidentifier,
    @StandaloneSellingPrice_Clear bit = 0,
    @StandaloneSellingPrice decimal(19, 4) = NULL,
    @SubscriptionTypeID_Clear bit = 0,
    @SubscriptionTypeID uniqueidentifier = NULL,
    @IsTaxable_Clear bit = 0,
    @IsTaxable bit = NULL,
    @Description_Clear bit = 0,
    @Description nvarchar(MAX) = NULL,
    @TaxCategory_Clear bit = 0,
    @TaxCategory nvarchar(50) = NULL,
    @EntitlementGrantTiming_Clear bit = 0,
    @EntitlementGrantTiming nvarchar(20) = NULL,
    @EntitlementQuantityMode_Clear bit = 0,
    @EntitlementQuantityMode nvarchar(20) = NULL,
    @EntitlementValidityMode_Clear bit = 0,
    @EntitlementValidityMode nvarchar(20) = NULL,
    @PricingDriverClass_Clear bit = 0,
    @PricingDriverClass nvarchar(255) = NULL,
    @MaxQuantityPerLine_Clear bit = 0,
    @MaxQuantityPerLine decimal(18, 4) = NULL,
    @SubscriptionFamilyID_Clear bit = 0,
    @SubscriptionFamilyID uniqueidentifier = NULL,
    @RenewalIncreasePercent_Clear bit = 0,
    @RenewalIncreasePercent decimal(7, 4) = NULL,
    @RequiresSaleApproval_Clear bit = 0,
    @RequiresSaleApproval bit = NULL,
    @IsSellableNew bit = NULL,
    @ParentProductID_Clear bit = 0,
    @ParentProductID uniqueidentifier = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)

    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[Product]
            (
                [ID],
                [Name],
                [SKU],
                [ProductTypeID],
                [ProductCategoryID],
                [CompanyID],
                [Status],
                [SuccessorProductID],
                [AvailableFrom],
                [AvailableTo],
                [RevenueRecognitionTypeID],
                [StandaloneSellingPrice],
                [SubscriptionTypeID],
                [IsTaxable],
                [Description],
                [TaxCategory],
                [EntitlementGrantTiming],
                [EntitlementQuantityMode],
                [EntitlementValidityMode],
                [PricingDriverClass],
                [MaxQuantityPerLine],
                [SubscriptionFamilyID],
                [RenewalIncreasePercent],
                [RequiresSaleApproval],
                [IsSellableNew],
                [ParentProductID]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @Name,
                CASE WHEN @SKU_Clear = 1 THEN NULL ELSE ISNULL(@SKU, NULL) END,
                @ProductTypeID,
                @ProductCategoryID,
                @CompanyID,
                ISNULL(@Status, 'Draft'),
                CASE WHEN @SuccessorProductID_Clear = 1 THEN NULL ELSE ISNULL(@SuccessorProductID, NULL) END,
                CASE WHEN @AvailableFrom_Clear = 1 THEN NULL ELSE ISNULL(@AvailableFrom, NULL) END,
                CASE WHEN @AvailableTo_Clear = 1 THEN NULL ELSE ISNULL(@AvailableTo, NULL) END,
                @RevenueRecognitionTypeID,
                CASE WHEN @StandaloneSellingPrice_Clear = 1 THEN NULL ELSE ISNULL(@StandaloneSellingPrice, NULL) END,
                CASE WHEN @SubscriptionTypeID_Clear = 1 THEN NULL ELSE ISNULL(@SubscriptionTypeID, NULL) END,
                CASE WHEN @IsTaxable_Clear = 1 THEN NULL ELSE ISNULL(@IsTaxable, NULL) END,
                CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, NULL) END,
                CASE WHEN @TaxCategory_Clear = 1 THEN NULL ELSE ISNULL(@TaxCategory, NULL) END,
                CASE WHEN @EntitlementGrantTiming_Clear = 1 THEN NULL ELSE ISNULL(@EntitlementGrantTiming, NULL) END,
                CASE WHEN @EntitlementQuantityMode_Clear = 1 THEN NULL ELSE ISNULL(@EntitlementQuantityMode, NULL) END,
                CASE WHEN @EntitlementValidityMode_Clear = 1 THEN NULL ELSE ISNULL(@EntitlementValidityMode, NULL) END,
                CASE WHEN @PricingDriverClass_Clear = 1 THEN NULL ELSE ISNULL(@PricingDriverClass, NULL) END,
                CASE WHEN @MaxQuantityPerLine_Clear = 1 THEN NULL ELSE ISNULL(@MaxQuantityPerLine, NULL) END,
                CASE WHEN @SubscriptionFamilyID_Clear = 1 THEN NULL ELSE ISNULL(@SubscriptionFamilyID, NULL) END,
                CASE WHEN @RenewalIncreasePercent_Clear = 1 THEN NULL ELSE ISNULL(@RenewalIncreasePercent, NULL) END,
                CASE WHEN @RequiresSaleApproval_Clear = 1 THEN NULL ELSE ISNULL(@RequiresSaleApproval, NULL) END,
                ISNULL(@IsSellableNew, 1),
                CASE WHEN @ParentProductID_Clear = 1 THEN NULL ELSE ISNULL(@ParentProductID, NULL) END
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[Product]
            (
                [Name],
                [SKU],
                [ProductTypeID],
                [ProductCategoryID],
                [CompanyID],
                [Status],
                [SuccessorProductID],
                [AvailableFrom],
                [AvailableTo],
                [RevenueRecognitionTypeID],
                [StandaloneSellingPrice],
                [SubscriptionTypeID],
                [IsTaxable],
                [Description],
                [TaxCategory],
                [EntitlementGrantTiming],
                [EntitlementQuantityMode],
                [EntitlementValidityMode],
                [PricingDriverClass],
                [MaxQuantityPerLine],
                [SubscriptionFamilyID],
                [RenewalIncreasePercent],
                [RequiresSaleApproval],
                [IsSellableNew],
                [ParentProductID]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @Name,
                CASE WHEN @SKU_Clear = 1 THEN NULL ELSE ISNULL(@SKU, NULL) END,
                @ProductTypeID,
                @ProductCategoryID,
                @CompanyID,
                ISNULL(@Status, 'Draft'),
                CASE WHEN @SuccessorProductID_Clear = 1 THEN NULL ELSE ISNULL(@SuccessorProductID, NULL) END,
                CASE WHEN @AvailableFrom_Clear = 1 THEN NULL ELSE ISNULL(@AvailableFrom, NULL) END,
                CASE WHEN @AvailableTo_Clear = 1 THEN NULL ELSE ISNULL(@AvailableTo, NULL) END,
                @RevenueRecognitionTypeID,
                CASE WHEN @StandaloneSellingPrice_Clear = 1 THEN NULL ELSE ISNULL(@StandaloneSellingPrice, NULL) END,
                CASE WHEN @SubscriptionTypeID_Clear = 1 THEN NULL ELSE ISNULL(@SubscriptionTypeID, NULL) END,
                CASE WHEN @IsTaxable_Clear = 1 THEN NULL ELSE ISNULL(@IsTaxable, NULL) END,
                CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, NULL) END,
                CASE WHEN @TaxCategory_Clear = 1 THEN NULL ELSE ISNULL(@TaxCategory, NULL) END,
                CASE WHEN @EntitlementGrantTiming_Clear = 1 THEN NULL ELSE ISNULL(@EntitlementGrantTiming, NULL) END,
                CASE WHEN @EntitlementQuantityMode_Clear = 1 THEN NULL ELSE ISNULL(@EntitlementQuantityMode, NULL) END,
                CASE WHEN @EntitlementValidityMode_Clear = 1 THEN NULL ELSE ISNULL(@EntitlementValidityMode, NULL) END,
                CASE WHEN @PricingDriverClass_Clear = 1 THEN NULL ELSE ISNULL(@PricingDriverClass, NULL) END,
                CASE WHEN @MaxQuantityPerLine_Clear = 1 THEN NULL ELSE ISNULL(@MaxQuantityPerLine, NULL) END,
                CASE WHEN @SubscriptionFamilyID_Clear = 1 THEN NULL ELSE ISNULL(@SubscriptionFamilyID, NULL) END,
                CASE WHEN @RenewalIncreasePercent_Clear = 1 THEN NULL ELSE ISNULL(@RenewalIncreasePercent, NULL) END,
                CASE WHEN @RequiresSaleApproval_Clear = 1 THEN NULL ELSE ISNULL(@RequiresSaleApproval, NULL) END,
                ISNULL(@IsSellableNew, 1),
                CASE WHEN @ParentProductID_Clear = 1 THEN NULL ELSE ISNULL(@ParentProductID, NULL) END
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwProducts] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreateProduct] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreateProduct] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateProduct] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ_BizApps_Orders: Products */

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreateProduct] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreateProduct] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateProduct] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for MJ_BizApps_Orders: Products */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Products
-- Item: spUpdateProduct
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR Product
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateProduct]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateProduct];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateProduct]
    @ID uniqueidentifier,
    @Name nvarchar(200) = NULL,
    @SKU_Clear bit = 0,
    @SKU nvarchar(80) = NULL,
    @ProductTypeID uniqueidentifier = NULL,
    @ProductCategoryID uniqueidentifier = NULL,
    @CompanyID uniqueidentifier = NULL,
    @Status nvarchar(20) = NULL,
    @SuccessorProductID_Clear bit = 0,
    @SuccessorProductID uniqueidentifier = NULL,
    @AvailableFrom_Clear bit = 0,
    @AvailableFrom date = NULL,
    @AvailableTo_Clear bit = 0,
    @AvailableTo date = NULL,
    @RevenueRecognitionTypeID uniqueidentifier = NULL,
    @StandaloneSellingPrice_Clear bit = 0,
    @StandaloneSellingPrice decimal(19, 4) = NULL,
    @SubscriptionTypeID_Clear bit = 0,
    @SubscriptionTypeID uniqueidentifier = NULL,
    @IsTaxable_Clear bit = 0,
    @IsTaxable bit = NULL,
    @Description_Clear bit = 0,
    @Description nvarchar(MAX) = NULL,
    @TaxCategory_Clear bit = 0,
    @TaxCategory nvarchar(50) = NULL,
    @EntitlementGrantTiming_Clear bit = 0,
    @EntitlementGrantTiming nvarchar(20) = NULL,
    @EntitlementQuantityMode_Clear bit = 0,
    @EntitlementQuantityMode nvarchar(20) = NULL,
    @EntitlementValidityMode_Clear bit = 0,
    @EntitlementValidityMode nvarchar(20) = NULL,
    @PricingDriverClass_Clear bit = 0,
    @PricingDriverClass nvarchar(255) = NULL,
    @MaxQuantityPerLine_Clear bit = 0,
    @MaxQuantityPerLine decimal(18, 4) = NULL,
    @SubscriptionFamilyID_Clear bit = 0,
    @SubscriptionFamilyID uniqueidentifier = NULL,
    @RenewalIncreasePercent_Clear bit = 0,
    @RenewalIncreasePercent decimal(7, 4) = NULL,
    @RequiresSaleApproval_Clear bit = 0,
    @RequiresSaleApproval bit = NULL,
    @IsSellableNew bit = NULL,
    @ParentProductID_Clear bit = 0,
    @ParentProductID uniqueidentifier = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[Product]
    SET
        [Name] = ISNULL(@Name, [Name]),
        [SKU] = CASE WHEN @SKU_Clear = 1 THEN NULL ELSE ISNULL(@SKU, [SKU]) END,
        [ProductTypeID] = ISNULL(@ProductTypeID, [ProductTypeID]),
        [ProductCategoryID] = ISNULL(@ProductCategoryID, [ProductCategoryID]),
        [CompanyID] = ISNULL(@CompanyID, [CompanyID]),
        [Status] = ISNULL(@Status, [Status]),
        [SuccessorProductID] = CASE WHEN @SuccessorProductID_Clear = 1 THEN NULL ELSE ISNULL(@SuccessorProductID, [SuccessorProductID]) END,
        [AvailableFrom] = CASE WHEN @AvailableFrom_Clear = 1 THEN NULL ELSE ISNULL(@AvailableFrom, [AvailableFrom]) END,
        [AvailableTo] = CASE WHEN @AvailableTo_Clear = 1 THEN NULL ELSE ISNULL(@AvailableTo, [AvailableTo]) END,
        [RevenueRecognitionTypeID] = ISNULL(@RevenueRecognitionTypeID, [RevenueRecognitionTypeID]),
        [StandaloneSellingPrice] = CASE WHEN @StandaloneSellingPrice_Clear = 1 THEN NULL ELSE ISNULL(@StandaloneSellingPrice, [StandaloneSellingPrice]) END,
        [SubscriptionTypeID] = CASE WHEN @SubscriptionTypeID_Clear = 1 THEN NULL ELSE ISNULL(@SubscriptionTypeID, [SubscriptionTypeID]) END,
        [IsTaxable] = CASE WHEN @IsTaxable_Clear = 1 THEN NULL ELSE ISNULL(@IsTaxable, [IsTaxable]) END,
        [Description] = CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, [Description]) END,
        [TaxCategory] = CASE WHEN @TaxCategory_Clear = 1 THEN NULL ELSE ISNULL(@TaxCategory, [TaxCategory]) END,
        [EntitlementGrantTiming] = CASE WHEN @EntitlementGrantTiming_Clear = 1 THEN NULL ELSE ISNULL(@EntitlementGrantTiming, [EntitlementGrantTiming]) END,
        [EntitlementQuantityMode] = CASE WHEN @EntitlementQuantityMode_Clear = 1 THEN NULL ELSE ISNULL(@EntitlementQuantityMode, [EntitlementQuantityMode]) END,
        [EntitlementValidityMode] = CASE WHEN @EntitlementValidityMode_Clear = 1 THEN NULL ELSE ISNULL(@EntitlementValidityMode, [EntitlementValidityMode]) END,
        [PricingDriverClass] = CASE WHEN @PricingDriverClass_Clear = 1 THEN NULL ELSE ISNULL(@PricingDriverClass, [PricingDriverClass]) END,
        [MaxQuantityPerLine] = CASE WHEN @MaxQuantityPerLine_Clear = 1 THEN NULL ELSE ISNULL(@MaxQuantityPerLine, [MaxQuantityPerLine]) END,
        [SubscriptionFamilyID] = CASE WHEN @SubscriptionFamilyID_Clear = 1 THEN NULL ELSE ISNULL(@SubscriptionFamilyID, [SubscriptionFamilyID]) END,
        [RenewalIncreasePercent] = CASE WHEN @RenewalIncreasePercent_Clear = 1 THEN NULL ELSE ISNULL(@RenewalIncreasePercent, [RenewalIncreasePercent]) END,
        [RequiresSaleApproval] = CASE WHEN @RequiresSaleApproval_Clear = 1 THEN NULL ELSE ISNULL(@RequiresSaleApproval, [RequiresSaleApproval]) END,
        [IsSellableNew] = ISNULL(@IsSellableNew, [IsSellableNew]),
        [ParentProductID] = CASE WHEN @ParentProductID_Clear = 1 THEN NULL ELSE ISNULL(@ParentProductID, [ParentProductID]) END
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwProducts] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwProducts]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spUpdateProduct] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spUpdateProduct] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateProduct] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the Product table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateProduct]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateProduct];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateProduct
ON [${flyway:defaultSchema}].[Product]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[Product]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[Product] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for MJ_BizApps_Orders: Products */

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spUpdateProduct] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spUpdateProduct] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateProduct] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for MJ_BizApps_Orders: Products */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Products
-- Item: spDeleteProduct
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR Product
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteProduct]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteProduct];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteProduct]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[Product]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteProduct] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteProduct] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteProduct] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for MJ_BizApps_Orders: Products */

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteProduct] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteProduct] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteProduct] TO [cdp_Developer], [cdp_Integration];

/* SQL text to update entity field related entity name field map for entity field ID 58CE354D-B50A-4EA6-9EEE-FB2DBB03E39A */
EXEC [${mjSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='58CE354D-B50A-4EA6-9EEE-FB2DBB03E39A', @RelatedEntityNameFieldMap='ProductOption';

/* Base View SQL for MJ_BizApps_Orders: Product Variant Values */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Product Variant Values
-- Item: vwProductVariantValues
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ_BizApps_Orders: Product Variant Values
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  ProductVariantValue
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwProductVariantValues]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwProductVariantValues];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwProductVariantValues]
AS
SELECT
    p.*,
    mjBizAppsOrdersProduct_ProductID.[Name] AS [Product],
    mjBizAppsOrdersProductOption_ProductOptionID.[Name] AS [ProductOption]
FROM
    [${flyway:defaultSchema}].[ProductVariantValue] AS p
INNER JOIN
    [${flyway:defaultSchema}].[Product] AS mjBizAppsOrdersProduct_ProductID
  ON
    [p].[ProductID] = mjBizAppsOrdersProduct_ProductID.[ID]
INNER JOIN
    [${flyway:defaultSchema}].[ProductOption] AS mjBizAppsOrdersProductOption_ProductOptionID
  ON
    [p].[ProductOptionID] = mjBizAppsOrdersProductOption_ProductOptionID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwProductVariantValues] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for MJ_BizApps_Orders: Product Variant Values */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Product Variant Values
-- Item: Permissions for vwProductVariantValues
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwProductVariantValues] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for MJ_BizApps_Orders: Product Variant Values */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Product Variant Values
-- Item: spCreateProductVariantValue
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR ProductVariantValue
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateProductVariantValue]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateProductVariantValue];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateProductVariantValue]
    @ID uniqueidentifier = NULL,
    @ProductID uniqueidentifier,
    @ProductOptionID uniqueidentifier,
    @ProductOptionValueID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)

    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[ProductVariantValue]
            (
                [ID],
                [ProductID],
                [ProductOptionID],
                [ProductOptionValueID]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @ProductID,
                @ProductOptionID,
                @ProductOptionValueID
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[ProductVariantValue]
            (
                [ProductID],
                [ProductOptionID],
                [ProductOptionValueID]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ProductID,
                @ProductOptionID,
                @ProductOptionValueID
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwProductVariantValues] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateProductVariantValue] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ_BizApps_Orders: Product Variant Values */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateProductVariantValue] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for MJ_BizApps_Orders: Product Variant Values */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Product Variant Values
-- Item: spUpdateProductVariantValue
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR ProductVariantValue
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateProductVariantValue]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateProductVariantValue];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateProductVariantValue]
    @ID uniqueidentifier,
    @ProductID uniqueidentifier = NULL,
    @ProductOptionID uniqueidentifier = NULL,
    @ProductOptionValueID uniqueidentifier = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[ProductVariantValue]
    SET
        [ProductID] = ISNULL(@ProductID, [ProductID]),
        [ProductOptionID] = ISNULL(@ProductOptionID, [ProductOptionID]),
        [ProductOptionValueID] = ISNULL(@ProductOptionValueID, [ProductOptionValueID])
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwProductVariantValues] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwProductVariantValues]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateProductVariantValue] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the ProductVariantValue table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateProductVariantValue]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateProductVariantValue];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateProductVariantValue
ON [${flyway:defaultSchema}].[ProductVariantValue]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[ProductVariantValue]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[ProductVariantValue] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for MJ_BizApps_Orders: Product Variant Values */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateProductVariantValue] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for MJ_BizApps_Orders: Product Variant Values */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Product Variant Values
-- Item: spDeleteProductVariantValue
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR ProductVariantValue
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteProductVariantValue]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteProductVariantValue];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteProductVariantValue]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[ProductVariantValue]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteProductVariantValue] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for MJ_BizApps_Orders: Product Variant Values */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteProductVariantValue] TO [cdp_Developer], [cdp_Integration];

/* Base View SQL for MJ_BizApps_Orders: Product Successor Option Values */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Product Successor Option Values
-- Item: vwProductSuccessorOptionValues
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ_BizApps_Orders: Product Successor Option Values
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  ProductSuccessorOptionValue
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwProductSuccessorOptionValues]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwProductSuccessorOptionValues];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwProductSuccessorOptionValues]
AS
SELECT
    p.*,
    mjBizAppsOrdersProduct_ProductID.[Name] AS [Product],
    mjBizAppsOrdersProductOption_ProductOptionID.[Name] AS [ProductOption]
FROM
    [${flyway:defaultSchema}].[ProductSuccessorOptionValue] AS p
INNER JOIN
    [${flyway:defaultSchema}].[Product] AS mjBizAppsOrdersProduct_ProductID
  ON
    [p].[ProductID] = mjBizAppsOrdersProduct_ProductID.[ID]
INNER JOIN
    [${flyway:defaultSchema}].[ProductOption] AS mjBizAppsOrdersProductOption_ProductOptionID
  ON
    [p].[ProductOptionID] = mjBizAppsOrdersProductOption_ProductOptionID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwProductSuccessorOptionValues] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for MJ_BizApps_Orders: Product Successor Option Values */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Product Successor Option Values
-- Item: Permissions for vwProductSuccessorOptionValues
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwProductSuccessorOptionValues] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for MJ_BizApps_Orders: Product Successor Option Values */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Product Successor Option Values
-- Item: spCreateProductSuccessorOptionValue
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR ProductSuccessorOptionValue
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateProductSuccessorOptionValue]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateProductSuccessorOptionValue];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateProductSuccessorOptionValue]
    @ID uniqueidentifier = NULL,
    @ProductID uniqueidentifier,
    @ProductOptionID uniqueidentifier,
    @ProductOptionValueID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)

    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[ProductSuccessorOptionValue]
            (
                [ID],
                [ProductID],
                [ProductOptionID],
                [ProductOptionValueID]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @ProductID,
                @ProductOptionID,
                @ProductOptionValueID
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[ProductSuccessorOptionValue]
            (
                [ProductID],
                [ProductOptionID],
                [ProductOptionValueID]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ProductID,
                @ProductOptionID,
                @ProductOptionValueID
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwProductSuccessorOptionValues] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateProductSuccessorOptionValue] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ_BizApps_Orders: Product Successor Option Values */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateProductSuccessorOptionValue] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for MJ_BizApps_Orders: Product Successor Option Values */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Product Successor Option Values
-- Item: spUpdateProductSuccessorOptionValue
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR ProductSuccessorOptionValue
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateProductSuccessorOptionValue]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateProductSuccessorOptionValue];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateProductSuccessorOptionValue]
    @ID uniqueidentifier,
    @ProductID uniqueidentifier = NULL,
    @ProductOptionID uniqueidentifier = NULL,
    @ProductOptionValueID uniqueidentifier = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[ProductSuccessorOptionValue]
    SET
        [ProductID] = ISNULL(@ProductID, [ProductID]),
        [ProductOptionID] = ISNULL(@ProductOptionID, [ProductOptionID]),
        [ProductOptionValueID] = ISNULL(@ProductOptionValueID, [ProductOptionValueID])
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwProductSuccessorOptionValues] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwProductSuccessorOptionValues]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateProductSuccessorOptionValue] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the ProductSuccessorOptionValue table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateProductSuccessorOptionValue]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateProductSuccessorOptionValue];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateProductSuccessorOptionValue
ON [${flyway:defaultSchema}].[ProductSuccessorOptionValue]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[ProductSuccessorOptionValue]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[ProductSuccessorOptionValue] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for MJ_BizApps_Orders: Product Successor Option Values */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateProductSuccessorOptionValue] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for MJ_BizApps_Orders: Product Successor Option Values */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Product Successor Option Values
-- Item: spDeleteProductSuccessorOptionValue
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR ProductSuccessorOptionValue
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteProductSuccessorOptionValue]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteProductSuccessorOptionValue];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteProductSuccessorOptionValue]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[ProductSuccessorOptionValue]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteProductSuccessorOptionValue] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for MJ_BizApps_Orders: Product Successor Option Values */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteProductSuccessorOptionValue] TO [cdp_Developer], [cdp_Integration];

/* SQL text to insert 12 new entity field(s) */

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = 'bd0ab503-33e0-4f44-b88f-d15454616144' OR (EntityID = '28F5B3D1-D0E5-4C52-AAD0-0436287F32CE' AND Name = 'ProductOption')) BEGIN
         INSERT INTO [${mjSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'bd0ab503-33e0-4f44-b88f-d15454616144',
            '28F5B3D1-D0E5-4C52-AAD0-0436287F32CE', -- Entity: MJ_BizApps_Orders: Product Option Values
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${mjSchema}].[EntityField] WHERE [EntityID] = '28F5B3D1-D0E5-4C52-AAD0-0436287F32CE'),
            'ProductOption',
            'Product Option',
            NULL,
            'nvarchar',
            200,
            0,
            0,
            0,
            NULL,
            0,
            0,
            1,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = 'ef214a9e-9e5b-47ab-b3ba-a603bd06c916' OR (EntityID = 'B35DD5C3-9A6B-42D1-9049-297EE45ED2D5' AND Name = 'ParentProduct')) BEGIN
         INSERT INTO [${mjSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'ef214a9e-9e5b-47ab-b3ba-a603bd06c916',
            'B35DD5C3-9A6B-42D1-9049-297EE45ED2D5', -- Entity: MJ_BizApps_Orders: Products
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${mjSchema}].[EntityField] WHERE [EntityID] = 'B35DD5C3-9A6B-42D1-9049-297EE45ED2D5'),
            'ParentProduct',
            'Parent Product',
            NULL,
            'nvarchar',
            400,
            0,
            0,
            1,
            NULL,
            0,
            0,
            1,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '88f1f855-11b0-4090-b1ed-4e1ab81b2471' OR (EntityID = '08CBD324-07B9-4B35-873B-368F90EBB601' AND Name = 'Product')) BEGIN
         INSERT INTO [${mjSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '88f1f855-11b0-4090-b1ed-4e1ab81b2471',
            '08CBD324-07B9-4B35-873B-368F90EBB601', -- Entity: MJ_BizApps_Orders: Product Variant Values
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${mjSchema}].[EntityField] WHERE [EntityID] = '08CBD324-07B9-4B35-873B-368F90EBB601'),
            'Product',
            'Product',
            NULL,
            'nvarchar',
            400,
            0,
            0,
            0,
            NULL,
            0,
            0,
            1,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '9f1b9687-a18e-4496-b02d-be1f56f2eeb5' OR (EntityID = '08CBD324-07B9-4B35-873B-368F90EBB601' AND Name = 'ProductOption')) BEGIN
         INSERT INTO [${mjSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '9f1b9687-a18e-4496-b02d-be1f56f2eeb5',
            '08CBD324-07B9-4B35-873B-368F90EBB601', -- Entity: MJ_BizApps_Orders: Product Variant Values
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${mjSchema}].[EntityField] WHERE [EntityID] = '08CBD324-07B9-4B35-873B-368F90EBB601'),
            'ProductOption',
            'Product Option',
            NULL,
            'nvarchar',
            200,
            0,
            0,
            0,
            NULL,
            0,
            0,
            1,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '01f11b85-0c40-4dda-89a9-cc88904af0cd' OR (EntityID = '70E4B251-16EE-452B-B2E2-621C4E416609' AND Name = 'ProductType')) BEGIN
         INSERT INTO [${mjSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '01f11b85-0c40-4dda-89a9-cc88904af0cd',
            '70E4B251-16EE-452B-B2E2-621C4E416609', -- Entity: MJ_BizApps_Orders: Product Option Assignments
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${mjSchema}].[EntityField] WHERE [EntityID] = '70E4B251-16EE-452B-B2E2-621C4E416609'),
            'ProductType',
            'Product Type',
            NULL,
            'nvarchar',
            200,
            0,
            0,
            1,
            NULL,
            0,
            0,
            1,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '6d3af368-a460-4972-bdb6-b3be95fa6cda' OR (EntityID = '70E4B251-16EE-452B-B2E2-621C4E416609' AND Name = 'ProductCategory')) BEGIN
         INSERT INTO [${mjSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '6d3af368-a460-4972-bdb6-b3be95fa6cda',
            '70E4B251-16EE-452B-B2E2-621C4E416609', -- Entity: MJ_BizApps_Orders: Product Option Assignments
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${mjSchema}].[EntityField] WHERE [EntityID] = '70E4B251-16EE-452B-B2E2-621C4E416609'),
            'ProductCategory',
            'Product Category',
            NULL,
            'nvarchar',
            400,
            0,
            0,
            1,
            NULL,
            0,
            0,
            1,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '70cc6da9-654f-4567-9b6b-5d96093a0655' OR (EntityID = '70E4B251-16EE-452B-B2E2-621C4E416609' AND Name = 'Product')) BEGIN
         INSERT INTO [${mjSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '70cc6da9-654f-4567-9b6b-5d96093a0655',
            '70E4B251-16EE-452B-B2E2-621C4E416609', -- Entity: MJ_BizApps_Orders: Product Option Assignments
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${mjSchema}].[EntityField] WHERE [EntityID] = '70E4B251-16EE-452B-B2E2-621C4E416609'),
            'Product',
            'Product',
            NULL,
            'nvarchar',
            400,
            0,
            0,
            1,
            NULL,
            0,
            0,
            1,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = 'adff7754-d276-4913-9884-b5231d36728b' OR (EntityID = '70E4B251-16EE-452B-B2E2-621C4E416609' AND Name = 'ProductOption')) BEGIN
         INSERT INTO [${mjSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'adff7754-d276-4913-9884-b5231d36728b',
            '70E4B251-16EE-452B-B2E2-621C4E416609', -- Entity: MJ_BizApps_Orders: Product Option Assignments
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${mjSchema}].[EntityField] WHERE [EntityID] = '70E4B251-16EE-452B-B2E2-621C4E416609'),
            'ProductOption',
            'Product Option',
            NULL,
            'nvarchar',
            200,
            0,
            0,
            0,
            NULL,
            0,
            0,
            1,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '5d982588-05c9-4130-bed9-a421fe7a5945' OR (EntityID = '279CE520-5127-4FC5-BE4D-DDE4E415852F' AND Name = 'Product')) BEGIN
         INSERT INTO [${mjSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '5d982588-05c9-4130-bed9-a421fe7a5945',
            '279CE520-5127-4FC5-BE4D-DDE4E415852F', -- Entity: MJ_BizApps_Orders: Product Successor Option Values
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${mjSchema}].[EntityField] WHERE [EntityID] = '279CE520-5127-4FC5-BE4D-DDE4E415852F'),
            'Product',
            'Product',
            NULL,
            'nvarchar',
            400,
            0,
            0,
            0,
            NULL,
            0,
            0,
            1,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '954e452d-4949-4aa4-8b91-397b7ada8da7' OR (EntityID = '279CE520-5127-4FC5-BE4D-DDE4E415852F' AND Name = 'ProductOption')) BEGIN
         INSERT INTO [${mjSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '954e452d-4949-4aa4-8b91-397b7ada8da7',
            '279CE520-5127-4FC5-BE4D-DDE4E415852F', -- Entity: MJ_BizApps_Orders: Product Successor Option Values
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${mjSchema}].[EntityField] WHERE [EntityID] = '279CE520-5127-4FC5-BE4D-DDE4E415852F'),
            'ProductOption',
            'Product Option',
            NULL,
            'nvarchar',
            200,
            0,
            0,
            0,
            NULL,
            0,
            0,
            1,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = 'a23ba9cf-16b0-4389-9274-6019651017d5' OR (EntityID = 'F27481BD-A0DA-47F7-A985-FA3C24FCCCB7' AND Name = 'Company')) BEGIN
         INSERT INTO [${mjSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'a23ba9cf-16b0-4389-9274-6019651017d5',
            'F27481BD-A0DA-47F7-A985-FA3C24FCCCB7', -- Entity: MJ_BizApps_Orders: Product Options
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${mjSchema}].[EntityField] WHERE [EntityID] = 'F27481BD-A0DA-47F7-A985-FA3C24FCCCB7'),
            'Company',
            'Company',
            NULL,
            'nvarchar',
            100,
            0,
            0,
            1,
            NULL,
            0,
            0,
            1,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '439f7527-d1eb-46a9-92d8-793d41c86cd4' OR (EntityID = 'E5FC8970-8D06-4D58-BE59-FF8715F84890' AND Name = 'ProductOption')) BEGIN
         INSERT INTO [${mjSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '439f7527-d1eb-46a9-92d8-793d41c86cd4',
            'E5FC8970-8D06-4D58-BE59-FF8715F84890', -- Entity: MJ_BizApps_Orders: Order Line Choices
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${mjSchema}].[EntityField] WHERE [EntityID] = 'E5FC8970-8D06-4D58-BE59-FF8715F84890'),
            'ProductOption',
            'Product Option',
            NULL,
            'nvarchar',
            200,
            0,
            0,
            1,
            NULL,
            0,
            0,
            1,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

/* Set field properties for entity */

               UPDATE [${mjSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'F59AF3BF-0206-4527-BC26-526EC073D291'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${mjSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '81E6A490-CDB5-4147-A02C-40EF2155A102'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${mjSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'CCA5AAEF-037D-4C21-B758-C2C477D7B79B'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${mjSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '01F11B85-0C40-4DDA-89A9-CC88904AF0CD'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${mjSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '6D3AF368-A460-4972-BDB6-B3BE95FA6CDA'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${mjSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '70CC6DA9-654F-4567-9B6B-5D96093A0655'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${mjSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'ADFF7754-D276-4913-9884-B5231D36728B'
               AND AutoUpdateDefaultInView = 1;

/* Set field properties for entity */

               UPDATE [${mjSchema}].[EntityField]
               SET IsNameField = 1
               WHERE ID = '29C30557-45F7-4215-AAD5-457ABED6D6C3'
               AND AutoUpdateIsNameField = 1;

/* Set field properties for entity */

               UPDATE [${mjSchema}].[EntityField]
               SET IsNameField = 1
               WHERE ID = 'B6BD8BEA-17AC-49E9-92DD-19F583234770'
               AND AutoUpdateIsNameField = 1;

               UPDATE [${mjSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'CE2D686F-1BE4-4A89-B480-783DA02AFC23'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${mjSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'BD0AB503-33E0-4F44-B88F-D15454616144'
               AND AutoUpdateDefaultInView = 1;

            UPDATE [${mjSchema}].[Entity]
            SET AllowUserSearchAPI = 0
            WHERE ID = '28F5B3D1-D0E5-4C52-AAD0-0436287F32CE'
            AND AutoUpdateAllowUserSearchAPI = 1;

/* Set categories for 4 fields */

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Order Line Choices.ID 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'Line Choice',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '1CC35D14-9925-4EAD-915E-529847A9E957';

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Order Line Choices.ProductOptionID 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'Line Choice',
   GeneratedFormSection = 'Category',
   DisplayName = 'Product Option'
WHERE 
   ID = '25EC4574-97EB-47EE-8EB5-133F79F130D3';

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Order Line Choices.ProductOptionValueID 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'Line Choice',
   GeneratedFormSection = 'Category',
   DisplayName = 'Product Option Value'
WHERE 
   ID = 'FC9D5FDA-020E-45B4-9F67-017E61A56179';

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Order Line Choices.ProductOption 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'Line Choice',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '439F7527-D1EB-46A9-92D8-793D41C86CD4';

/* Set entity icon to fa fa-list-ul */

               UPDATE [${mjSchema}].[Entity]
               SET [Icon] = 'fa fa-list-ul', [__mj_UpdatedAt] = GETUTCDATE()
               WHERE [ID] = 'E5FC8970-8D06-4D58-BE59-FF8715F84890';

/* Set categories for 9 fields */

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Product Option Values.ID 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '5017A87D-86BB-4AB1-A4DC-6D781B718639';

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Product Option Values.ProductOptionID 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'Option Value Details',
   GeneratedFormSection = 'Category',
   DisplayName = 'Product Option'
WHERE 
   ID = '7F72F84B-C590-418B-B3FA-15D302326113';

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Product Option Values.Code 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'Option Value Details',
   GeneratedFormSection = 'Category',
   ExtendedType = 'Code',
   CodeType = 'Other'
WHERE 
   ID = 'FF2A97B3-DDBA-4EFD-BFC4-8809CA91FBD3';

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Product Option Values.Label 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'Option Value Details',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'B6BD8BEA-17AC-49E9-92DD-19F583234770';

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Product Option Values.SortOrder 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'Option Value Details',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '5B29D810-41EE-41B5-98B3-567C659E8EF7';

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Product Option Values.IsActive 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'Option Value Details',
   GeneratedFormSection = 'Category',
   DisplayName = 'Active'
WHERE 
   ID = 'CE2D686F-1BE4-4A89-B480-783DA02AFC23';

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Product Option Values.ProductOption 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'Option Value Details',
   GeneratedFormSection = 'Category',
   DisplayName = 'Product Option Name'
WHERE 
   ID = 'BD0AB503-33E0-4F44-B88F-D15454616144';

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Product Option Values.__mj_CreatedAt 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'D339655D-851F-4024-BCFD-F3FF100C095A';

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Product Option Values.__mj_UpdatedAt 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '1483078E-B1F3-4162-9A60-73FF8BFA1326';

/* Set entity icon to fa fa-list-ul */

               UPDATE [${mjSchema}].[Entity]
               SET [Icon] = 'fa fa-list-ul', [__mj_UpdatedAt] = GETUTCDATE()
               WHERE [ID] = '28F5B3D1-D0E5-4C52-AAD0-0436287F32CE';

/* Insert FieldCategoryInfo setting for entity */
IF NOT EXISTS (
      SELECT 1 FROM [${mjSchema}].[EntitySetting] WHERE [EntityID] = '28F5B3D1-D0E5-4C52-AAD0-0436287F32CE' AND [Name] = 'FieldCategoryInfo'
   )
   BEGIN
      INSERT INTO [${mjSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('adb0be0f-34f4-56f3-a7e4-11d126cd8555', '28F5B3D1-D0E5-4C52-AAD0-0436287F32CE', 'FieldCategoryInfo', '{
  "Option Value Details": {
    "description": "Core attributes defining the product option value configuration and display properties",
    "icon": "fa fa-list-ul"
  },
  "System Metadata": {
    "description": "System-managed audit and tracking fields",
    "icon": "fa fa-cog"
  }
}', GETUTCDATE(), GETUTCDATE())
   END;

/* Insert FieldCategoryIcons setting (legacy) */
IF NOT EXISTS (
      SELECT 1 FROM [${mjSchema}].[EntitySetting] WHERE [EntityID] = '28F5B3D1-D0E5-4C52-AAD0-0436287F32CE' AND [Name] = 'FieldCategoryIcons'
   )
   BEGIN
      INSERT INTO [${mjSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('efb12c1d-739a-5930-8b69-831bf083ca90', '28F5B3D1-D0E5-4C52-AAD0-0436287F32CE', 'FieldCategoryIcons', '{
  "Option Value Details": "fa fa-list-ul",
  "System Metadata": "fa fa-cog"
}', GETUTCDATE(), GETUTCDATE())
   END;

/* Set DefaultForNewUser=false for NEW entity (category: reference, confidence: high) */

         UPDATE [${mjSchema}].[ApplicationEntity]
         SET [DefaultForNewUser] = 0, [__mj_UpdatedAt] = GETUTCDATE()
         WHERE [EntityID] = '28F5B3D1-D0E5-4C52-AAD0-0436287F32CE';

/* Set field properties for entity */

               UPDATE [${mjSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'B51D7607-6A6B-40D9-9018-5BB325AFA10D'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${mjSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'CCDEDFF5-A213-4758-8BA4-F18463F5AF02'
               AND AutoUpdateDefaultInView = 1;

/* Set field properties for entity */

               UPDATE [${mjSchema}].[EntityField]
               SET IsNameField = 1
               WHERE ID = 'FDD786DB-4B3F-40E0-9D1E-6408F030A5A9'
               AND AutoUpdateIsNameField = 1;

/* Set categories for 1 fields */

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Event Products.ParentProductID 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'Product Details',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'B9205687-8741-48B8-8170-2D19F1C05205';

/* Set categories for 5 fields */

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Product Option Assignment Values.ID 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'DB835820-8705-4FD3-927D-0518B24329F3';

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Product Option Assignment Values.ProductOptionAssignmentID 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'Option Assignment',
   GeneratedFormSection = 'Category',
   DisplayName = 'Product Option Assignment'
WHERE 
   ID = 'B51D7607-6A6B-40D9-9018-5BB325AFA10D';

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Product Option Assignment Values.ProductOptionValueID 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'Option Assignment',
   GeneratedFormSection = 'Category',
   DisplayName = 'Product Option Value'
WHERE 
   ID = 'CCDEDFF5-A213-4758-8BA4-F18463F5AF02';

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Product Option Assignment Values.__mj_CreatedAt 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '1E008140-DD68-4B30-988F-DDD436BF8CEA';

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Product Option Assignment Values.__mj_UpdatedAt 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'BA003E6E-7D05-4E57-B27A-14A6293815A1';

/* Set entity icon to fa fa-tasks */

               UPDATE [${mjSchema}].[Entity]
               SET [Icon] = 'fa fa-tasks', [__mj_UpdatedAt] = GETUTCDATE()
               WHERE [ID] = '677FD08D-F1D8-46C3-84A7-3F16F6E51806';

/* Insert FieldCategoryInfo setting for entity */
IF NOT EXISTS (
      SELECT 1 FROM [${mjSchema}].[EntitySetting] WHERE [EntityID] = '677FD08D-F1D8-46C3-84A7-3F16F6E51806' AND [Name] = 'FieldCategoryInfo'
   )
   BEGIN
      INSERT INTO [${mjSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('801b59bc-f6f0-504e-b715-160d0c9b140e', '677FD08D-F1D8-46C3-84A7-3F16F6E51806', 'FieldCategoryInfo', '{
  "Option Assignment": {
    "description": "Foreign key relationships defining permitted product option values for assignments",
    "icon": "fa fa-link"
  },
  "System Metadata": {
    "description": "System-managed audit and tracking fields",
    "icon": "fa fa-cog"
  }
}', GETUTCDATE(), GETUTCDATE())
   END;

/* Insert FieldCategoryIcons setting (legacy) */
IF NOT EXISTS (
      SELECT 1 FROM [${mjSchema}].[EntitySetting] WHERE [EntityID] = '677FD08D-F1D8-46C3-84A7-3F16F6E51806' AND [Name] = 'FieldCategoryIcons'
   )
   BEGIN
      INSERT INTO [${mjSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('ac86ff36-e863-54a6-aff8-e6cfaa1be0b3', '677FD08D-F1D8-46C3-84A7-3F16F6E51806', 'FieldCategoryIcons', '{
  "Option Assignment": "fa fa-link",
  "System Metadata": "fa fa-cog"
}', GETUTCDATE(), GETUTCDATE())
   END;

/* Set DefaultForNewUser=false for NEW entity (category: junction, confidence: high) */

         UPDATE [${mjSchema}].[ApplicationEntity]
         SET [DefaultForNewUser] = 0, [__mj_UpdatedAt] = GETUTCDATE()
         WHERE [EntityID] = '677FD08D-F1D8-46C3-84A7-3F16F6E51806';

/* Set categories for 16 fields */

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Product Option Assignments.ID 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'BD13FAED-A9C3-4E14-9735-A9DC87AEBD41';

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Product Option Assignments.ProductTypeID 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'Assignment Scope',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '9241A88B-F611-4C91-A08E-525E33222496';

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Product Option Assignments.ProductCategoryID 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'Assignment Scope',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '7A7F2463-B170-4AAD-8EBD-9916258A2D0A';

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Product Option Assignments.ProductID 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'Assignment Scope',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'D82F498B-429C-4256-A9E0-5856571E7346';

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Product Option Assignments.ProductOptionID 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'Option Configuration',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '42423CD1-5C5D-4638-9C5E-ABC0B3D1894E';

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Product Option Assignments.IsExcluded 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'Option Configuration',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'A2601267-9FC5-4FAB-9776-A0C57F02E1F5';

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Product Option Assignments.IsRequired 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'Option Configuration',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'F59AF3BF-0206-4527-BC26-526EC073D291';

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Product Option Assignments.DefaultProductOptionValueID 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'Option Configuration',
   GeneratedFormSection = 'Category',
   DisplayName = 'Default Option Value'
WHERE 
   ID = 'A869F995-9381-410E-AFCC-E468508A40E9';

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Product Option Assignments.SortOrder 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'Option Configuration',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '81E6A490-CDB5-4147-A02C-40EF2155A102';

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Product Option Assignments.Role 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'Option Configuration',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'CCA5AAEF-037D-4C21-B758-C2C477D7B79B';

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Product Option Assignments.__mj_CreatedAt 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'DF2D263A-35A0-4D17-AD2A-D4A044651EFF';

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Product Option Assignments.__mj_UpdatedAt 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '75D40C5F-FB7C-4781-8969-D7E9A86E3761';

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Product Option Assignments.ProductType 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'Assignment Scope',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '01F11B85-0C40-4DDA-89A9-CC88904AF0CD';

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Product Option Assignments.ProductCategory 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'Assignment Scope',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '6D3AF368-A460-4972-BDB6-B3BE95FA6CDA';

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Product Option Assignments.Product 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'Assignment Scope',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '70CC6DA9-654F-4567-9B6B-5D96093A0655';

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Product Option Assignments.ProductOption 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'Option Configuration',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'ADFF7754-D276-4913-9884-B5231D36728B';

/* Set entity icon to fa fa-tasks */

               UPDATE [${mjSchema}].[Entity]
               SET [Icon] = 'fa fa-tasks', [__mj_UpdatedAt] = GETUTCDATE()
               WHERE [ID] = '70E4B251-16EE-452B-B2E2-621C4E416609';

/* Insert FieldCategoryInfo setting for entity */
IF NOT EXISTS (
      SELECT 1 FROM [${mjSchema}].[EntitySetting] WHERE [EntityID] = '70E4B251-16EE-452B-B2E2-621C4E416609' AND [Name] = 'FieldCategoryInfo'
   )
   BEGIN
      INSERT INTO [${mjSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('0b2d86d0-0944-5bc3-9758-42e758d202d5', '70E4B251-16EE-452B-B2E2-621C4E416609', 'FieldCategoryInfo', '{
  "Assignment Scope": {
    "description": "Defines whether the assignment applies at the product type, category, or specific product level",
    "icon": "fa fa-sitemap"
  },
  "Option Configuration": {
    "description": "Configuration rules, defaults, and behaviors for the assigned product option",
    "icon": "fa fa-sliders-h"
  },
  "System Metadata": {
    "description": "System-managed audit and tracking fields",
    "icon": "fa fa-cog"
  }
}', GETUTCDATE(), GETUTCDATE())
   END;

/* Insert FieldCategoryIcons setting (legacy) */
IF NOT EXISTS (
      SELECT 1 FROM [${mjSchema}].[EntitySetting] WHERE [EntityID] = '70E4B251-16EE-452B-B2E2-621C4E416609' AND [Name] = 'FieldCategoryIcons'
   )
   BEGIN
      INSERT INTO [${mjSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('5b29d01c-3364-5673-98de-207531f654a8', '70E4B251-16EE-452B-B2E2-621C4E416609', 'FieldCategoryIcons', '{
  "Assignment Scope": "fa fa-sitemap",
  "Option Configuration": "fa fa-sliders-h",
  "System Metadata": "fa fa-cog"
}', GETUTCDATE(), GETUTCDATE())
   END;

/* Set DefaultForNewUser=false for NEW entity (category: supporting, confidence: high) */

         UPDATE [${mjSchema}].[ApplicationEntity]
         SET [DefaultForNewUser] = 0, [__mj_UpdatedAt] = GETUTCDATE()
         WHERE [EntityID] = '70E4B251-16EE-452B-B2E2-621C4E416609';

/* Set categories for 2 fields */

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Products.ParentProductID 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'Catalog Lifecycle',
   GeneratedFormSection = 'Category',
   DisplayName = 'Parent Product'
WHERE 
   ID = '54C1A518-0E60-4EFE-A3B8-EE6A3F2FA412';

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Products.ParentProduct 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'Catalog Lifecycle',
   GeneratedFormSection = 'Category',
   DisplayName = 'Parent Product Name'
WHERE 
   ID = 'EF214A9E-9E5B-47AB-B3BA-A603BD06C916';

/* Set field properties for entity */

               UPDATE [${mjSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '88F1F855-11B0-4090-B1ED-4E1AB81B2471'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${mjSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '9F1B9687-A18E-4496-B02D-BE1F56F2EEB5'
               AND AutoUpdateDefaultInView = 1;

/* Set field properties for entity */

               UPDATE [${mjSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '5D982588-05C9-4130-BED9-A421FE7A5945'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${mjSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '954E452D-4949-4AA4-8B91-397B7ADA8DA7'
               AND AutoUpdateDefaultInView = 1;

/* Set field properties for entity */

               UPDATE [${mjSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'D3E98208-6C3F-4252-8561-F6F8C8A59145'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${mjSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '5CD25870-DA4D-4917-89FC-E24AFF648955'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${mjSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'A23BA9CF-16B0-4389-9274-6019651017D5'
               AND AutoUpdateDefaultInView = 1;

            UPDATE [${mjSchema}].[Entity]
            SET AllowUserSearchAPI = 0
            WHERE ID = 'F27481BD-A0DA-47F7-A985-FA3C24FCCCB7'
            AND AutoUpdateAllowUserSearchAPI = 1;

/* Set categories for 8 fields */

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Product Successor Option Values.ID 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'E08C246B-695D-4B0A-B2A2-7FFF84E4DA46';

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Product Successor Option Values.ProductID 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'Product Successor Configuration',
   GeneratedFormSection = 'Category',
   DisplayName = 'Product'
WHERE 
   ID = '985A9F04-C185-4B67-B082-51DC790CF729';

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Product Successor Option Values.ProductOptionID 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'Product Successor Configuration',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '58CE354D-B50A-4EA6-9EEE-FB2DBB03E39A';

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Product Successor Option Values.ProductOptionValueID 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'Product Successor Configuration',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '89A15479-6681-4442-97E2-E0879C6C38DB';

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Product Successor Option Values.Product 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'Product Successor Configuration',
   GeneratedFormSection = 'Category',
   DisplayName = 'Product Name'
WHERE 
   ID = '5D982588-05C9-4130-BED9-A421FE7A5945';

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Product Successor Option Values.ProductOption 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'Product Successor Configuration',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '954E452D-4949-4AA4-8B91-397B7ADA8DA7';

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Product Successor Option Values.__mj_CreatedAt 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'C3F338A9-2F98-481C-B8EC-0C4237F3131B';

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Product Successor Option Values.__mj_UpdatedAt 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '3E60DDCE-52BE-48D5-A282-881CF9CFB42C';

/* Set entity icon to fa fa-boxes */

               UPDATE [${mjSchema}].[Entity]
               SET [Icon] = 'fa fa-boxes', [__mj_UpdatedAt] = GETUTCDATE()
               WHERE [ID] = '279CE520-5127-4FC5-BE4D-DDE4E415852F';

/* Insert FieldCategoryInfo setting for entity */
IF NOT EXISTS (
      SELECT 1 FROM [${mjSchema}].[EntitySetting] WHERE [EntityID] = '279CE520-5127-4FC5-BE4D-DDE4E415852F' AND [Name] = 'FieldCategoryInfo'
   )
   BEGIN
      INSERT INTO [${mjSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('b66e4e38-68a3-59d1-a987-0ef088d3a327', '279CE520-5127-4FC5-BE4D-DDE4E415852F', 'FieldCategoryInfo', '{
  "Product Successor Configuration": {
    "description": "Configuration mapping products, successor options, and tier/size values for renewals",
    "icon": "fa fa-box"
  },
  "System Metadata": {
    "description": "System-managed audit and tracking fields",
    "icon": "fa fa-cog"
  }
}', GETUTCDATE(), GETUTCDATE())
   END;

/* Insert FieldCategoryIcons setting (legacy) */
IF NOT EXISTS (
      SELECT 1 FROM [${mjSchema}].[EntitySetting] WHERE [EntityID] = '279CE520-5127-4FC5-BE4D-DDE4E415852F' AND [Name] = 'FieldCategoryIcons'
   )
   BEGIN
      INSERT INTO [${mjSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('d787902d-c0e8-5079-ba3d-8ff0f6856f0a', '279CE520-5127-4FC5-BE4D-DDE4E415852F', 'FieldCategoryIcons', '{
  "Product Successor Configuration": "fa fa-box",
  "System Metadata": "fa fa-cog"
}', GETUTCDATE(), GETUTCDATE())
   END;

/* Set DefaultForNewUser=false for NEW entity (category: reference, confidence: high) */

         UPDATE [${mjSchema}].[ApplicationEntity]
         SET [DefaultForNewUser] = 0, [__mj_UpdatedAt] = GETUTCDATE()
         WHERE [EntityID] = '279CE520-5127-4FC5-BE4D-DDE4E415852F';

/* Set categories for 10 fields */

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Product Options.ID 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '7A72B2DF-9A38-468F-A135-4097C5A147BF';

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Product Options.CompanyID 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'Option Configuration',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'D9C5FA77-6B89-4874-AF10-20725887E2F7';

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Product Options.Code 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'Option Configuration',
   GeneratedFormSection = 'Category',
   ExtendedType = 'Code',
   CodeType = 'Other'
WHERE 
   ID = 'CAABB8EB-FDB6-4661-927C-6DE16B32435F';

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Product Options.Name 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'Option Configuration',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '8E745D8C-7EB9-4A51-8725-7C2ED7F6B9A2';

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Product Options.Description 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'Option Configuration',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '09D43F2E-FD6E-4528-BDAA-2F6E7A4DC1CA';

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Product Options.SortOrder 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'Option Configuration',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'D3E98208-6C3F-4252-8561-F6F8C8A59145';

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Product Options.IsActive 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'Option Configuration',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '5CD25870-DA4D-4917-89FC-E24AFF648955';

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Product Options.Company 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'Option Configuration',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'A23BA9CF-16B0-4389-9274-6019651017D5';

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Product Options.__mj_CreatedAt 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'D8BEF0F8-E0CD-4D55-B21D-4D3C87788A52';

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Product Options.__mj_UpdatedAt 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'E9989F7C-2CE2-4F6D-9EFF-78C73B96A26A';

/* Set entity icon to fa fa-boxes */

               UPDATE [${mjSchema}].[Entity]
               SET [Icon] = 'fa fa-boxes', [__mj_UpdatedAt] = GETUTCDATE()
               WHERE [ID] = 'F27481BD-A0DA-47F7-A985-FA3C24FCCCB7';

/* Insert FieldCategoryInfo setting for entity */
IF NOT EXISTS (
      SELECT 1 FROM [${mjSchema}].[EntitySetting] WHERE [EntityID] = 'F27481BD-A0DA-47F7-A985-FA3C24FCCCB7' AND [Name] = 'FieldCategoryInfo'
   )
   BEGIN
      INSERT INTO [${mjSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('c7f66939-4ea1-50cf-91e0-bd600e5d21b9', 'F27481BD-A0DA-47F7-A985-FA3C24FCCCB7', 'FieldCategoryInfo', '{
  "Option Configuration": {
    "description": "Configuration settings, naming, and details for the product option",
    "icon": "fa fa-sliders-h"
  },
  "System Metadata": {
    "description": "System-managed audit and tracking fields",
    "icon": "fa fa-cog"
  }
}', GETUTCDATE(), GETUTCDATE())
   END;

/* Insert FieldCategoryIcons setting (legacy) */
IF NOT EXISTS (
      SELECT 1 FROM [${mjSchema}].[EntitySetting] WHERE [EntityID] = 'F27481BD-A0DA-47F7-A985-FA3C24FCCCB7' AND [Name] = 'FieldCategoryIcons'
   )
   BEGIN
      INSERT INTO [${mjSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('4fc3a450-ccd0-5530-b3c5-f98aba0a4cfb', 'F27481BD-A0DA-47F7-A985-FA3C24FCCCB7', 'FieldCategoryIcons', '{
  "Option Configuration": "fa fa-sliders-h",
  "System Metadata": "fa fa-cog"
}', GETUTCDATE(), GETUTCDATE())
   END;

/* Set DefaultForNewUser=false for NEW entity (category: reference, confidence: high) */

         UPDATE [${mjSchema}].[ApplicationEntity]
         SET [DefaultForNewUser] = 0, [__mj_UpdatedAt] = GETUTCDATE()
         WHERE [EntityID] = 'F27481BD-A0DA-47F7-A985-FA3C24FCCCB7';

/* Set categories for 8 fields */

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Product Variant Values.ID 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '8457CC83-E75F-4E2F-A5A5-3098F7F6F5E0';

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Product Variant Values.ProductID 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'Variant Information',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '16DFF0B4-712F-4EA4-9A89-BCDB68B1419C';

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Product Variant Values.ProductOptionID 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'Variant Information',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '1943A145-98FF-4476-9A6B-4837F1523731';

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Product Variant Values.ProductOptionValueID 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'Variant Information',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'ABF7BE59-F5E1-4A87-AF31-1513414CCB8D';

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Product Variant Values.__mj_CreatedAt 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '161331E4-76D9-47FF-85DB-66979F31297B';

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Product Variant Values.__mj_UpdatedAt 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'F54E9E67-CCCE-4CB9-9255-29BB4A7385FF';

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Product Variant Values.Product 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'Variant Information',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '88F1F855-11B0-4090-B1ED-4E1AB81B2471';

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Product Variant Values.ProductOption 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'Variant Information',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '9F1B9687-A18E-4496-B02D-BE1F56F2EEB5';

/* Set entity icon to fa fa-tags */

               UPDATE [${mjSchema}].[Entity]
               SET [Icon] = 'fa fa-tags', [__mj_UpdatedAt] = GETUTCDATE()
               WHERE [ID] = '08CBD324-07B9-4B35-873B-368F90EBB601';

/* Insert FieldCategoryInfo setting for entity */
IF NOT EXISTS (
      SELECT 1 FROM [${mjSchema}].[EntitySetting] WHERE [EntityID] = '08CBD324-07B9-4B35-873B-368F90EBB601' AND [Name] = 'FieldCategoryInfo'
   )
   BEGIN
      INSERT INTO [${mjSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('44f9e9c0-98be-5bae-a930-02295e7b9bd0', '08CBD324-07B9-4B35-873B-368F90EBB601', 'FieldCategoryInfo', '{
  "System Metadata": {
    "description": "System-managed audit and tracking fields",
    "icon": "fa fa-cog"
  },
  "Variant Information": {
    "description": "Product variant option and value identifiers and descriptive names",
    "icon": "fa fa-tags"
  }
}', GETUTCDATE(), GETUTCDATE())
   END;

/* Insert FieldCategoryIcons setting (legacy) */
IF NOT EXISTS (
      SELECT 1 FROM [${mjSchema}].[EntitySetting] WHERE [EntityID] = '08CBD324-07B9-4B35-873B-368F90EBB601' AND [Name] = 'FieldCategoryIcons'
   )
   BEGIN
      INSERT INTO [${mjSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('5c0f1a52-4ddf-5d55-b170-0cc7c9e293d9', '08CBD324-07B9-4B35-873B-368F90EBB601', 'FieldCategoryIcons', '{
  "System Metadata": "fa fa-cog",
  "Variant Information": "fa fa-tags"
}', GETUTCDATE(), GETUTCDATE())
   END;

/* Set DefaultForNewUser=false for NEW entity (category: supporting, confidence: high) */

         UPDATE [${mjSchema}].[ApplicationEntity]
         SET [DefaultForNewUser] = 0, [__mj_UpdatedAt] = GETUTCDATE()
         WHERE [EntityID] = '08CBD324-07B9-4B35-873B-368F90EBB601';

/* Generated Validation Functions for MJ_BizApps_Orders: Order Line Choices */
-- CHECK constraint for MJ_BizApps_Orders: Order Line Choices @ Table Level was newly set or modified since the last generation of the validation function, the code was regenerated and updating the GeneratedCode table with the new generated validation function
IF NOT EXISTS (
      SELECT 1 FROM [${mjSchema}].[GeneratedCode] WHERE [CategoryID] = (SELECT [ID] FROM [${mjSchema}].[vwGeneratedCodeCategories] WHERE [Name]='CodeGen: Validators') AND [LinkedEntityID] = 'E0238F34-2837-EF11-86D4-6045BDEE16E6' AND [LinkedRecordPrimaryKey] = 'E5FC8970-8D06-4D58-BE59-FF8715F84890' AND [Name] = 'ValidateProductOptionAndValueCoexistence'
   )
   BEGIN
      INSERT INTO [${mjSchema}].[GeneratedCode] ([ID], [CategoryID], [GeneratedByModelID], [GeneratedAt], [Language], [Status], [Source], [Code], [Description], [Name], [LinkedEntityID], [LinkedRecordPrimaryKey])
VALUES ('dea72b43-1022-4321-aed9-f5e88624930e', (SELECT [ID] FROM [${mjSchema}].[vwGeneratedCodeCategories] WHERE [Name]='CodeGen: Validators'), '4B500A24-0259-4EFF-9E34-24E9F5EC9DAB', GETUTCDATE(), 'TypeScript', 'Approved', '([ProductOptionID] IS NULL AND [ProductOptionValueID] IS NULL OR [ProductOptionID] IS NOT NULL AND [ProductOptionValueID] IS NOT NULL)', 'public ValidateProductOptionAndValueCoexistence(result: ValidationResult) {
	const hasOption = this.ProductOptionID != null;
	const hasOptionValue = this.ProductOptionValueID != null;

	if ((hasOption && !hasOptionValue) || (!hasOption && hasOptionValue)) {
		result.Errors.push(new ValidationErrorInfo(
			"ProductOptionID",
			"Product Option and Product Option Value must either both be specified or both be left blank.",
			this.ProductOptionID,
			ValidationErrorType.Failure
		));
	}
}', 'Product Option and Product Option Value must either both be provided or both be left empty.', 'ValidateProductOptionAndValueCoexistence', 'E0238F34-2837-EF11-86D4-6045BDEE16E6', 'E5FC8970-8D06-4D58-BE59-FF8715F84890')
   END;

/* Generated Validation Functions for MJ_BizApps_Orders: Product Option Assignments */
-- CHECK constraint for MJ_BizApps_Orders: Product Option Assignments @ Table Level was newly set or modified since the last generation of the validation function, the code was regenerated and updating the GeneratedCode table with the new generated validation function
IF NOT EXISTS (
      SELECT 1 FROM [${mjSchema}].[GeneratedCode] WHERE [CategoryID] = (SELECT [ID] FROM [${mjSchema}].[vwGeneratedCodeCategories] WHERE [Name]='CodeGen: Validators') AND [LinkedEntityID] = 'E0238F34-2837-EF11-86D4-6045BDEE16E6' AND [LinkedRecordPrimaryKey] = '70E4B251-16EE-452B-B2E2-621C4E416609' AND [Name] = 'ValidateProductTargetSpecification'
   )
   BEGIN
      INSERT INTO [${mjSchema}].[GeneratedCode] ([ID], [CategoryID], [GeneratedByModelID], [GeneratedAt], [Language], [Status], [Source], [Code], [Description], [Name], [LinkedEntityID], [LinkedRecordPrimaryKey])
VALUES ('23c9c20b-f659-4977-b588-8e92e21a2402', (SELECT [ID] FROM [${mjSchema}].[vwGeneratedCodeCategories] WHERE [Name]='CodeGen: Validators'), '4B500A24-0259-4EFF-9E34-24E9F5EC9DAB', GETUTCDATE(), 'TypeScript', 'Approved', '(((case when [ProductTypeID] IS NULL then (0) else (1) end+case when [ProductCategoryID] IS NULL then (0) else (1) end)+case when [ProductID] IS NULL then (0) else (1) end)=(1))', 'public ValidateProductTargetSpecification(result: ValidationResult): void {
	let count = 0;
	if (this.ProductTypeID != null) {
		count++;
	}
	if (this.ProductCategoryID != null) {
		count++;
	}
	if (this.ProductID != null) {
		count++;
	}

	if (count !== 1) {
		result.Errors.push(new ValidationErrorInfo(
			"ProductID",
			"Exactly one of Product Type, Product Category, or Product must be specified.",
			this.ProductID,
			ValidationErrorType.Failure
		));
	}
}', 'Exactly one target entity (Product Type, Product Category, or Product) must be specified.', 'ValidateProductTargetSpecification', 'E0238F34-2837-EF11-86D4-6045BDEE16E6', '70E4B251-16EE-452B-B2E2-621C4E416609')
   END;

/* Generated Validation Functions for MJ_BizApps_Orders: Product Option Values */
-- CHECK constraint for MJ_BizApps_Orders: Product Option Values: Field: Code was newly set or modified since the last generation of the validation function, the code was regenerated and updating the GeneratedCode table with the new generated validation function
IF NOT EXISTS (
      SELECT 1 FROM [${mjSchema}].[GeneratedCode] WHERE [CategoryID] = (SELECT [ID] FROM [${mjSchema}].[vwGeneratedCodeCategories] WHERE [Name]='CodeGen: Validators') AND [LinkedEntityID] = 'DF238F34-2837-EF11-86D4-6045BDEE16E6' AND [LinkedRecordPrimaryKey] = 'FF2A97B3-DDBA-4EFD-BFC4-8809CA91FBD3'
   )
   BEGIN
      INSERT INTO [${mjSchema}].[GeneratedCode] ([ID], [CategoryID], [GeneratedByModelID], [GeneratedAt], [Language], [Status], [Source], [Code], [Description], [Name], [LinkedEntityID], [LinkedRecordPrimaryKey])
VALUES ('dc5f31e9-54db-4d1c-a06e-894d4eebdc84', (SELECT [ID] FROM [${mjSchema}].[vwGeneratedCodeCategories] WHERE [Name]='CodeGen: Validators'), '4B500A24-0259-4EFF-9E34-24E9F5EC9DAB', GETUTCDATE(), 'TypeScript', 'Approved', '(len([Code])>(0))', 'public ValidateCodeNotEmpty(result: ValidationResult) {
	if (this.Code != null && this.Code.trim().length === 0) {
		result.Errors.push(new ValidationErrorInfo(
			"Code",
			"Code cannot be empty.",
			this.Code,
			ValidationErrorType.Failure
		));
	}
}', 'Code cannot be empty.', 'ValidateCodeNotEmpty', 'DF238F34-2837-EF11-86D4-6045BDEE16E6', 'FF2A97B3-DDBA-4EFD-BFC4-8809CA91FBD3')
   END;

/* Generated Validation Functions for MJ_BizApps_Orders: Product Options */
-- CHECK constraint for MJ_BizApps_Orders: Product Options: Field: Code was newly set or modified since the last generation of the validation function, the code was regenerated and updating the GeneratedCode table with the new generated validation function
IF NOT EXISTS (
      SELECT 1 FROM [${mjSchema}].[GeneratedCode] WHERE [CategoryID] = (SELECT [ID] FROM [${mjSchema}].[vwGeneratedCodeCategories] WHERE [Name]='CodeGen: Validators') AND [LinkedEntityID] = 'DF238F34-2837-EF11-86D4-6045BDEE16E6' AND [LinkedRecordPrimaryKey] = 'CAABB8EB-FDB6-4661-927C-6DE16B32435F'
   )
   BEGIN
      INSERT INTO [${mjSchema}].[GeneratedCode] ([ID], [CategoryID], [GeneratedByModelID], [GeneratedAt], [Language], [Status], [Source], [Code], [Description], [Name], [LinkedEntityID], [LinkedRecordPrimaryKey])
VALUES ('ff2fb67a-281b-49f7-882e-43e28707a04c', (SELECT [ID] FROM [${mjSchema}].[vwGeneratedCodeCategories] WHERE [Name]='CodeGen: Validators'), '4B500A24-0259-4EFF-9E34-24E9F5EC9DAB', GETUTCDATE(), 'TypeScript', 'Approved', '(len([Code])>(0))', 'public ValidateCodeNotEmpty(result: ValidationResult) {
	if (this.Code != null && this.Code.trim().length === 0) {
		result.Errors.push(new ValidationErrorInfo(
			"Code",
			"Code cannot be blank.",
			this.Code,
			ValidationErrorType.Failure
		));
	}
}', 'Code cannot be empty and must contain at least one character.', 'ValidateCodeNotEmpty', 'DF238F34-2837-EF11-86D4-6045BDEE16E6', 'CAABB8EB-FDB6-4661-927C-6DE16B32435F')
   END;

/* Generated Validation Functions for MJ_BizApps_Orders: Products */
-- CHECK constraint for MJ_BizApps_Orders: Products @ Table Level was newly set or modified since the last generation of the validation function, the code was regenerated and updating the GeneratedCode table with the new generated validation function
IF NOT EXISTS (
      SELECT 1 FROM [${mjSchema}].[GeneratedCode] WHERE [CategoryID] = (SELECT [ID] FROM [${mjSchema}].[vwGeneratedCodeCategories] WHERE [Name]='CodeGen: Validators') AND [LinkedEntityID] = 'E0238F34-2837-EF11-86D4-6045BDEE16E6' AND [LinkedRecordPrimaryKey] = 'B35DD5C3-9A6B-42D1-9049-297EE45ED2D5' AND [Name] = 'ValidateParentProductIDNotSelf'
   )
   BEGIN
      INSERT INTO [${mjSchema}].[GeneratedCode] ([ID], [CategoryID], [GeneratedByModelID], [GeneratedAt], [Language], [Status], [Source], [Code], [Description], [Name], [LinkedEntityID], [LinkedRecordPrimaryKey])
VALUES ('c30a9cbe-a773-4c32-b707-2165cf0a8fa4', (SELECT [ID] FROM [${mjSchema}].[vwGeneratedCodeCategories] WHERE [Name]='CodeGen: Validators'), '4B500A24-0259-4EFF-9E34-24E9F5EC9DAB', GETUTCDATE(), 'TypeScript', 'Approved', '([ParentProductID] IS NULL OR [ParentProductID]<>[ID])', 'public ValidateParentProductIDNotSelf(result: ValidationResult) {
	if (this.ParentProductID != null && this.ID != null && UUIDsEqual(this.ParentProductID, this.ID)) {
		result.Errors.push(new ValidationErrorInfo(
			"ParentProductID",
			"A product cannot be set as its own parent product.",
			this.ParentProductID,
			ValidationErrorType.Failure
		));
	}
}', 'A product cannot be its own parent product.', 'ValidateParentProductIDNotSelf', 'E0238F34-2837-EF11-86D4-6045BDEE16E6', 'B35DD5C3-9A6B-42D1-9049-297EE45ED2D5')
   END;


