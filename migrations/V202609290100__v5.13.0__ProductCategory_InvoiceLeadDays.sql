-- =============================================================================
-- V202609281100 — ProductCategory.InvoiceLeadDays (orders #342)
-- =============================================================================
-- How many days before a line's service start its invoice goes out. An order
-- confirmed by hand with NO payment schedule, whose earliest service start per
-- company is further away than this lead, gets one Scheduled instalment per
-- company for that company's whole line gross, due on the start less the lead.
-- Under D92 that books no receivable at confirm; the instalment is billed from
-- the billing worklist when it falls due and AR is dated then.
--
-- NULL inherits: a category without a value takes its nearest ancestor's, and a
-- tree with none takes the Orders application setting DefaultInvoiceLeadDays
-- (30 unless configured). Orders that carry their own schedule are untouched.
--
-- RUN CODEGEN AFTER THIS so vwProductCategories, the CRUD procs and the entity
-- subclasses pick up the column; that output is folded below the banner.
-- =============================================================================

ALTER TABLE [${flyway:defaultSchema}].[ProductCategory] ADD [InvoiceLeadDays] INT NULL;
GO

EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Days before a line''s service start that its invoice falls due, for an order confirmed with no payment schedule: such an order gets one Scheduled instalment per company, due on the earliest service start less the lowest lead among its dated lines, when that day is after the order date. NULL inherits from the parent category, and a tree with none uses the Orders application setting DefaultInvoiceLeadDays.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'ProductCategory',
    @level2type = N'COLUMN', @level2name = N'InvoiceLeadDays';
GO












































































-- =============================================================================
--
--   CODEGEN OUTPUT — GENERATED CODE BELOW THIS LINE (do not hand-edit)
--
--   Produced by MJ CodeGen against the hand-authored DDL above, on a database
--   built from migrations alone, with the ${flyway:defaultSchema} / ${mjSchema}
--   placeholders it already substitutes.
--
--   Only the sections for this change: the new InvoiceLeadDays EntityField row,
--   the regenerated vwProductCategories (it selects p.*, so it is recreated to
--   bind the new column), its grant, and spCreate/spUpdateProductCategory with
--   their grants. The rest of that CodeGen run re-emitted objects this change
--   never touched (hierarchy functions, FK index, Event Products, Order Headers,
--   the Order Headers FulfillmentStatus value list); those are left out.
--
--   Each EntityField Sequence is an apply-time MAX(Sequence) + 1 rather than the
--   literal CodeGen emits, and CodeGen's +100000 renumbering block is removed with
--   it (MJ's migration rule; gate: check-migration-entityfield-sequence.mjs).
--
-- =============================================================================

/* SQL text to insert 1 new entity field */
      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = 'dfa3d9c7-3bec-4652-8e3a-69aeee8da750' OR (EntityID = 'B0FA90A6-6975-4C5E-ABC7-3AEA97700CC3' AND Name = 'InvoiceLeadDays')) BEGIN
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
            'dfa3d9c7-3bec-4652-8e3a-69aeee8da750',
            'B0FA90A6-6975-4C5E-ABC7-3AEA97700CC3', -- Entity: MJ_BizApps_Orders: Product Categories
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${mjSchema}].[EntityField] WHERE [EntityID] = 'B0FA90A6-6975-4C5E-ABC7-3AEA97700CC3') + 1,
            'InvoiceLeadDays',
            'Invoice Lead Days',
            'Days before a line''s service start that its invoice falls due, for an order confirmed with no payment schedule: such an order gets one Scheduled instalment per company, due on the earliest service start less the lowest lead among its dated lines, when that day is after the order date. NULL inherits from the parent category, and a tree with none uses the Orders application setting DefaultInvoiceLeadDays.',
            'int',
            4,
            10,
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
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

/* Base View SQL for MJ_BizApps_Orders: Product Categories */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Product Categories
-- Item: vwProductCategories
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ_BizApps_Orders: Product Categories
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  ProductCategory
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwProductCategories]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwProductCategories];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwProductCategories]
AS
SELECT
    p.*,
    MJCompany_CompanyID.[Name] AS [Company],
    mjBizAppsOrdersProductCategory_ParentProductCategoryID.[Name] AS [ParentProductCategory],
    hier_ParentProductCategoryID.RootID AS [RootParentProductCategoryID],
    hier_ParentProductCategoryID.Depth AS [ParentProductCategoryIDDepth],
    hier_ParentProductCategoryID.Path AS [ParentProductCategoryIDPath],
    hier_ParentProductCategoryID.IsLeaf AS [ParentProductCategoryIDIsLeaf],
    hier_ParentProductCategoryID.ChildCount AS [ParentProductCategoryIDChildCount]
FROM
    [${flyway:defaultSchema}].[ProductCategory] AS p
INNER JOIN
    [${mjSchema}].[Company] AS MJCompany_CompanyID
  ON
    [p].[CompanyID] = MJCompany_CompanyID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[ProductCategory] AS mjBizAppsOrdersProductCategory_ParentProductCategoryID
  ON
    [p].[ParentProductCategoryID] = mjBizAppsOrdersProductCategory_ParentProductCategoryID.[ID]
OUTER APPLY
    [${flyway:defaultSchema}].[fnProductCategoryParentProductCategoryID_GetHierarchyMeta]([p].[ID], [p].[ParentProductCategoryID]) AS hier_ParentProductCategoryID
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwProductCategories] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for MJ_BizApps_Orders: Product Categories */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Product Categories
-- Item: Permissions for vwProductCategories
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwProductCategories] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for MJ_BizApps_Orders: Product Categories */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Product Categories
-- Item: spCreateProductCategory
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR ProductCategory
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateProductCategory]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateProductCategory];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateProductCategory]
    @ID uniqueidentifier = NULL,
    @CompanyID uniqueidentifier,
    @Code_Clear bit = 0,
    @Code nvarchar(40) = NULL,
    @Name nvarchar(200),
    @ParentProductCategoryID_Clear bit = 0,
    @ParentProductCategoryID uniqueidentifier = NULL,
    @Description_Clear bit = 0,
    @Description nvarchar(MAX) = NULL,
    @IsActive bit = NULL,
    @DefaultIsTaxable_Clear bit = 0,
    @DefaultIsTaxable bit = NULL,
    @DefaultTaxCategory_Clear bit = 0,
    @DefaultTaxCategory nvarchar(50) = NULL,
    @DefaultEntitlementGrantTiming_Clear bit = 0,
    @DefaultEntitlementGrantTiming nvarchar(20) = NULL,
    @DefaultEntitlementQuantityMode_Clear bit = 0,
    @DefaultEntitlementQuantityMode nvarchar(20) = NULL,
    @DefaultEntitlementValidityMode_Clear bit = 0,
    @DefaultEntitlementValidityMode nvarchar(20) = NULL,
    @PricingDriverClass_Clear bit = 0,
    @PricingDriverClass nvarchar(255) = NULL,
    @InvoiceLeadDays_Clear bit = 0,
    @InvoiceLeadDays int = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)

    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[ProductCategory]
            (
                [ID],
                [CompanyID],
                [Code],
                [Name],
                [ParentProductCategoryID],
                [Description],
                [IsActive],
                [DefaultIsTaxable],
                [DefaultTaxCategory],
                [DefaultEntitlementGrantTiming],
                [DefaultEntitlementQuantityMode],
                [DefaultEntitlementValidityMode],
                [PricingDriverClass],
                [InvoiceLeadDays]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @CompanyID,
                CASE WHEN @Code_Clear = 1 THEN NULL ELSE ISNULL(@Code, NULL) END,
                @Name,
                CASE WHEN @ParentProductCategoryID_Clear = 1 THEN NULL ELSE ISNULL(@ParentProductCategoryID, NULL) END,
                CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, NULL) END,
                ISNULL(@IsActive, 1),
                CASE WHEN @DefaultIsTaxable_Clear = 1 THEN NULL ELSE ISNULL(@DefaultIsTaxable, NULL) END,
                CASE WHEN @DefaultTaxCategory_Clear = 1 THEN NULL ELSE ISNULL(@DefaultTaxCategory, NULL) END,
                CASE WHEN @DefaultEntitlementGrantTiming_Clear = 1 THEN NULL ELSE ISNULL(@DefaultEntitlementGrantTiming, NULL) END,
                CASE WHEN @DefaultEntitlementQuantityMode_Clear = 1 THEN NULL ELSE ISNULL(@DefaultEntitlementQuantityMode, NULL) END,
                CASE WHEN @DefaultEntitlementValidityMode_Clear = 1 THEN NULL ELSE ISNULL(@DefaultEntitlementValidityMode, NULL) END,
                CASE WHEN @PricingDriverClass_Clear = 1 THEN NULL ELSE ISNULL(@PricingDriverClass, NULL) END,
                CASE WHEN @InvoiceLeadDays_Clear = 1 THEN NULL ELSE ISNULL(@InvoiceLeadDays, NULL) END
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[ProductCategory]
            (
                [CompanyID],
                [Code],
                [Name],
                [ParentProductCategoryID],
                [Description],
                [IsActive],
                [DefaultIsTaxable],
                [DefaultTaxCategory],
                [DefaultEntitlementGrantTiming],
                [DefaultEntitlementQuantityMode],
                [DefaultEntitlementValidityMode],
                [PricingDriverClass],
                [InvoiceLeadDays]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @CompanyID,
                CASE WHEN @Code_Clear = 1 THEN NULL ELSE ISNULL(@Code, NULL) END,
                @Name,
                CASE WHEN @ParentProductCategoryID_Clear = 1 THEN NULL ELSE ISNULL(@ParentProductCategoryID, NULL) END,
                CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, NULL) END,
                ISNULL(@IsActive, 1),
                CASE WHEN @DefaultIsTaxable_Clear = 1 THEN NULL ELSE ISNULL(@DefaultIsTaxable, NULL) END,
                CASE WHEN @DefaultTaxCategory_Clear = 1 THEN NULL ELSE ISNULL(@DefaultTaxCategory, NULL) END,
                CASE WHEN @DefaultEntitlementGrantTiming_Clear = 1 THEN NULL ELSE ISNULL(@DefaultEntitlementGrantTiming, NULL) END,
                CASE WHEN @DefaultEntitlementQuantityMode_Clear = 1 THEN NULL ELSE ISNULL(@DefaultEntitlementQuantityMode, NULL) END,
                CASE WHEN @DefaultEntitlementValidityMode_Clear = 1 THEN NULL ELSE ISNULL(@DefaultEntitlementValidityMode, NULL) END,
                CASE WHEN @PricingDriverClass_Clear = 1 THEN NULL ELSE ISNULL(@PricingDriverClass, NULL) END,
                CASE WHEN @InvoiceLeadDays_Clear = 1 THEN NULL ELSE ISNULL(@InvoiceLeadDays, NULL) END
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwProductCategories] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateProductCategory] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ_BizApps_Orders: Product Categories */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateProductCategory] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for MJ_BizApps_Orders: Product Categories */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Product Categories
-- Item: spUpdateProductCategory
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR ProductCategory
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateProductCategory]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateProductCategory];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateProductCategory]
    @ID uniqueidentifier,
    @CompanyID uniqueidentifier = NULL,
    @Code_Clear bit = 0,
    @Code nvarchar(40) = NULL,
    @Name nvarchar(200) = NULL,
    @ParentProductCategoryID_Clear bit = 0,
    @ParentProductCategoryID uniqueidentifier = NULL,
    @Description_Clear bit = 0,
    @Description nvarchar(MAX) = NULL,
    @IsActive bit = NULL,
    @DefaultIsTaxable_Clear bit = 0,
    @DefaultIsTaxable bit = NULL,
    @DefaultTaxCategory_Clear bit = 0,
    @DefaultTaxCategory nvarchar(50) = NULL,
    @DefaultEntitlementGrantTiming_Clear bit = 0,
    @DefaultEntitlementGrantTiming nvarchar(20) = NULL,
    @DefaultEntitlementQuantityMode_Clear bit = 0,
    @DefaultEntitlementQuantityMode nvarchar(20) = NULL,
    @DefaultEntitlementValidityMode_Clear bit = 0,
    @DefaultEntitlementValidityMode nvarchar(20) = NULL,
    @PricingDriverClass_Clear bit = 0,
    @PricingDriverClass nvarchar(255) = NULL,
    @InvoiceLeadDays_Clear bit = 0,
    @InvoiceLeadDays int = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[ProductCategory]
    SET
        [CompanyID] = ISNULL(@CompanyID, [CompanyID]),
        [Code] = CASE WHEN @Code_Clear = 1 THEN NULL ELSE ISNULL(@Code, [Code]) END,
        [Name] = ISNULL(@Name, [Name]),
        [ParentProductCategoryID] = CASE WHEN @ParentProductCategoryID_Clear = 1 THEN NULL ELSE ISNULL(@ParentProductCategoryID, [ParentProductCategoryID]) END,
        [Description] = CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, [Description]) END,
        [IsActive] = ISNULL(@IsActive, [IsActive]),
        [DefaultIsTaxable] = CASE WHEN @DefaultIsTaxable_Clear = 1 THEN NULL ELSE ISNULL(@DefaultIsTaxable, [DefaultIsTaxable]) END,
        [DefaultTaxCategory] = CASE WHEN @DefaultTaxCategory_Clear = 1 THEN NULL ELSE ISNULL(@DefaultTaxCategory, [DefaultTaxCategory]) END,
        [DefaultEntitlementGrantTiming] = CASE WHEN @DefaultEntitlementGrantTiming_Clear = 1 THEN NULL ELSE ISNULL(@DefaultEntitlementGrantTiming, [DefaultEntitlementGrantTiming]) END,
        [DefaultEntitlementQuantityMode] = CASE WHEN @DefaultEntitlementQuantityMode_Clear = 1 THEN NULL ELSE ISNULL(@DefaultEntitlementQuantityMode, [DefaultEntitlementQuantityMode]) END,
        [DefaultEntitlementValidityMode] = CASE WHEN @DefaultEntitlementValidityMode_Clear = 1 THEN NULL ELSE ISNULL(@DefaultEntitlementValidityMode, [DefaultEntitlementValidityMode]) END,
        [PricingDriverClass] = CASE WHEN @PricingDriverClass_Clear = 1 THEN NULL ELSE ISNULL(@PricingDriverClass, [PricingDriverClass]) END,
        [InvoiceLeadDays] = CASE WHEN @InvoiceLeadDays_Clear = 1 THEN NULL ELSE ISNULL(@InvoiceLeadDays, [InvoiceLeadDays]) END
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwProductCategories] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwProductCategories]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateProductCategory] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the ProductCategory table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateProductCategory]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateProductCategory];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateProductCategory
ON [${flyway:defaultSchema}].[ProductCategory]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[ProductCategory]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[ProductCategory] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for MJ_BizApps_Orders: Product Categories */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateProductCategory] TO [cdp_Developer], [cdp_Integration];
