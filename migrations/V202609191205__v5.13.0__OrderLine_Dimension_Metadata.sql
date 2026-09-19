-- =============================================================================
-- CodeGen output for the OrderLine dimension columns added by V202609191200.
--
-- WHY THIS IS A MIGRATION AND NOT LEFT TO `mj codegen` ON THE HOST. A host's mj.config.cjs carries
-- this app's schema in `excludeSchemas` — written back on every `mj app install` / `upgrade` —
-- because the BizApps apps own their views and procedures through migrations. CodeGen on a host
-- reconciles METADATA and will register the two fields, but it will not rebuild the base view or
-- the CRUD procedures. Without this file the entity declares two fields its base view cannot
-- produce: every read fails with "column does not exist", which a grid renders as "no data" rather
-- than an error, and spCreateOrderLine / spUpdateOrderLine have no parameters for the columns, so
-- a tag set in the UI is silently dropped.
--
-- This is the same treatment V202609041600 gave PriceOverridden / PriceOverrideReason.
--
-- The EntityField inserts carry CodeGen's own `IF NOT EXISTS` guard on both the row id and the
-- (EntityID, Name) pair, so a host that has already had CodeGen run against it skips them rather
-- than colliding. Sequence is whatever CodeGen computed against the live schema for the same
-- reason V202609041600 spells out: a literal collides with UQ_EntityField_EntityID_Sequence on a
-- host whose hierarchy virtuals already hold that number.
--
-- Event Order Lines IS-A Order Lines, so it inherits both fields and its base view lists every
-- inherited column explicitly — hence the fields are registered against both entities and both
-- views are rebuilt here.
--
-- GENERATED CODE. Produced by `mj codegen` and lifted verbatim, with only the section headers
-- below added. Do not hand-edit; regenerate.
-- =============================================================================


-- ---------------------------------------------------------------------------
-- EntityField registrations — OrderLine and its IS-A child, Event Order Lines
-- ---------------------------------------------------------------------------
/* SQL text to insert 4 new entity field(s) */

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = 'be9d2ce5-65f5-4ad4-906e-d57a1e947fe6' OR (EntityID = '66D82C24-9C9F-4CD6-B019-53C20274AB00' AND Name = 'DimensionID')) BEGIN
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
            'be9d2ce5-65f5-4ad4-906e-d57a1e947fe6',
            '66D82C24-9C9F-4CD6-B019-53C20274AB00', -- Entity: MJ_BizApps_Orders: Order Lines
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${mjSchema}].[EntityField] WHERE [EntityID] = '66D82C24-9C9F-4CD6-B019-53C20274AB00'),
            'DimensionID',
            'Dimension ID',
            'The GL dimension this line is tagged on — the analysis axis, from ${mjSchema}_BizAppsAccounting.Dimension. NULL leaves the line untagged, which books a valid entry that simply cannot be reported on by dimension. Set together with DimensionValueID (CK_OrderLine_DimensionPair).',
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
            'F15DE0FC-C7FC-4080-8F33-9308DECB0E46',
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '413bbc64-7c20-40d7-9d71-644bd8bd7f36' OR (EntityID = '66D82C24-9C9F-4CD6-B019-53C20274AB00' AND Name = 'DimensionValueID')) BEGIN
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
            '413bbc64-7c20-40d7-9d71-644bd8bd7f36',
            '66D82C24-9C9F-4CD6-B019-53C20274AB00', -- Entity: MJ_BizApps_Orders: Order Lines
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${mjSchema}].[EntityField] WHERE [EntityID] = '66D82C24-9C9F-4CD6-B019-53C20274AB00'),
            'DimensionValueID',
            'Dimension Value ID',
            'The value of DimensionID this line is tagged with, from ${mjSchema}_BizAppsAccounting.DimensionValue. Carried with DimensionID onto every journal entry line the order line produces. Set together with DimensionID (CK_OrderLine_DimensionPair).',
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
            'E382FFAB-748C-4EB6-BEA9-1E8DCB7DBC3F',
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '7ffbdb65-9a8e-4ba6-89a0-2829d242bc54' OR (EntityID = '90A1060F-35D6-44A7-9076-A9053BBF60E6' AND Name = 'DimensionID')) BEGIN
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
            '7ffbdb65-9a8e-4ba6-89a0-2829d242bc54',
            '90A1060F-35D6-44A7-9076-A9053BBF60E6', -- Entity: MJ_BizApps_Orders: Event Order Lines
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${mjSchema}].[EntityField] WHERE [EntityID] = '90A1060F-35D6-44A7-9076-A9053BBF60E6'),
            'DimensionID',
            'Dimension ID',
            NULL,
            'uniqueidentifier',
            16,
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '1c59bab9-81ba-4699-a895-9ec6728a5461' OR (EntityID = '90A1060F-35D6-44A7-9076-A9053BBF60E6' AND Name = 'DimensionValueID')) BEGIN
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
            '1c59bab9-81ba-4699-a895-9ec6728a5461',
            '90A1060F-35D6-44A7-9076-A9053BBF60E6', -- Entity: MJ_BizApps_Orders: Event Order Lines
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${mjSchema}].[EntityField] WHERE [EntityID] = '90A1060F-35D6-44A7-9076-A9053BBF60E6'),
            'DimensionValueID',
            'Dimension Value ID',
            NULL,
            'uniqueidentifier',
            16,
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

/* Update IS-A parent field DimensionID on MJ_BizApps_Orders: Event Order Lines */
UPDATE [${mjSchema}].[EntityField]
                  SET [IsVirtual]=1,
                      [Type]='uniqueidentifier',
                      [Length]=16,
                      [Precision]=0,
                      [Scale]=0,
                      [AllowsNull]=1,
                      [AllowUpdateAPI]=1
                  WHERE [ID]='7FFBDB65-9A8E-4BA6-89A0-2829D242BC54';

/* Update IS-A parent field DimensionValueID on MJ_BizApps_Orders: Event Order Lines */
UPDATE [${mjSchema}].[EntityField]
                  SET [IsVirtual]=1,
                      [Type]='uniqueidentifier',
                      [Length]=16,
                      [Precision]=0,
                      [Scale]=0,
                      [AllowsNull]=1,
                      [AllowUpdateAPI]=1
                  WHERE [ID]='1C59BAB9-81BA-4699-A895-9EC6728A5461';

/* Update entity timestamp for MJ_BizApps_Orders: Event Order Lines after IS-A field sync */
UPDATE [${mjSchema}].[Entity] SET [__mj_UpdatedAt]=GETUTCDATE() WHERE ID='90A1060F-35D6-44A7-9076-A9053BBF60E6';

-- ---------------------------------------------------------------------------
-- Base view — Order Lines
-- ---------------------------------------------------------------------------
------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ_BizApps_Orders: Order Lines
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  OrderLine
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwOrderLines]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwOrderLines];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwOrderLines]
AS
SELECT
    o.*,
    mjBizAppsOrdersOrderHeader_OrderHeaderID.[OrderNumber] AS [OrderHeader],
    mjBizAppsOrdersProduct_ProductID.[Name] AS [Product],
    MJCompany_CompanyID.[Name] AS [Company],
    mjBizAppsOrdersProductPrice_ProductPriceID.[Name] AS [ProductPrice],
    mjBizAppsCommonOrganization_ShipToOrganizationID.[Name] AS [ShipToOrganization],
    mjBizAppsCommonPerson_ShipToPersonID.[DisplayName] AS [ShipToPerson],
    mjBizAppsOrdersProduct_SourceBundleProductID.[Name] AS [SourceBundleProduct],
    mjBizAppsOrdersSubscription_SubscriptionID.[SubscriptionNumber] AS [Subscription],
    mjBizAppsAccountingJournalEntry_JournalEntryID.[EntryNumber] AS [JournalEntry],
    mjBizAppsAccountingDimension_DimensionID.[Name] AS [Dimension],
    mjBizAppsAccountingDimensionValue_DimensionValueID.[Name] AS [DimensionValue],
    hier_ParentOrderLineID.RootID AS [RootParentOrderLineID],
    hier_ParentOrderLineID.Depth AS [ParentOrderLineIDDepth],
    hier_ParentOrderLineID.Path AS [ParentOrderLineIDPath],
    hier_ParentOrderLineID.IsLeaf AS [ParentOrderLineIDIsLeaf],
    hier_ParentOrderLineID.ChildCount AS [ParentOrderLineIDChildCount]
FROM
    [${flyway:defaultSchema}].[OrderLine] AS o
INNER JOIN
    [${flyway:defaultSchema}].[OrderHeader] AS mjBizAppsOrdersOrderHeader_OrderHeaderID
  ON
    [o].[OrderHeaderID] = mjBizAppsOrdersOrderHeader_OrderHeaderID.[ID]
INNER JOIN
    [${flyway:defaultSchema}].[Product] AS mjBizAppsOrdersProduct_ProductID
  ON
    [o].[ProductID] = mjBizAppsOrdersProduct_ProductID.[ID]
INNER JOIN
    [${mjSchema}].[Company] AS MJCompany_CompanyID
  ON
    [o].[CompanyID] = MJCompany_CompanyID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[ProductPrice] AS mjBizAppsOrdersProductPrice_ProductPriceID
  ON
    [o].[ProductPriceID] = mjBizAppsOrdersProductPrice_ProductPriceID.[ID]
LEFT OUTER JOIN
    [${mjSchema}_BizAppsCommon].[Organization] AS mjBizAppsCommonOrganization_ShipToOrganizationID
  ON
    [o].[ShipToOrganizationID] = mjBizAppsCommonOrganization_ShipToOrganizationID.[ID]
LEFT OUTER JOIN
    [${mjSchema}_BizAppsCommon].[Person] AS mjBizAppsCommonPerson_ShipToPersonID
  ON
    [o].[ShipToPersonID] = mjBizAppsCommonPerson_ShipToPersonID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[Product] AS mjBizAppsOrdersProduct_SourceBundleProductID
  ON
    [o].[SourceBundleProductID] = mjBizAppsOrdersProduct_SourceBundleProductID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[Subscription] AS mjBizAppsOrdersSubscription_SubscriptionID
  ON
    [o].[SubscriptionID] = mjBizAppsOrdersSubscription_SubscriptionID.[ID]
LEFT OUTER JOIN
    [${mjSchema}_BizAppsAccounting].[JournalEntry] AS mjBizAppsAccountingJournalEntry_JournalEntryID
  ON
    [o].[JournalEntryID] = mjBizAppsAccountingJournalEntry_JournalEntryID.[ID]
LEFT OUTER JOIN
    [${mjSchema}_BizAppsAccounting].[Dimension] AS mjBizAppsAccountingDimension_DimensionID
  ON
    [o].[DimensionID] = mjBizAppsAccountingDimension_DimensionID.[ID]
LEFT OUTER JOIN
    [${mjSchema}_BizAppsAccounting].[DimensionValue] AS mjBizAppsAccountingDimensionValue_DimensionValueID
  ON
    [o].[DimensionValueID] = mjBizAppsAccountingDimensionValue_DimensionValueID.[ID]
OUTER APPLY
    [${flyway:defaultSchema}].[fnOrderLineParentOrderLineID_GetHierarchyMeta]([o].[ID], [o].[ParentOrderLineID]) AS hier_ParentOrderLineID
GO
REVOKE SELECT ON [${flyway:defaultSchema}].[vwOrderLines] FROM [cdp_Developer]
REVOKE SELECT ON [${flyway:defaultSchema}].[vwOrderLines] FROM [cdp_Integration]
REVOKE SELECT ON [${flyway:defaultSchema}].[vwOrderLines] FROM [cdp_UI]
GRANT SELECT ON [${flyway:defaultSchema}].[vwOrderLines] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for MJ_BizApps_Orders: Order Lines */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Order Lines
-- Item: Permissions for vwOrderLines
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

REVOKE SELECT ON [${flyway:defaultSchema}].[vwOrderLines] FROM [cdp_Developer]
REVOKE SELECT ON [${flyway:defaultSchema}].[vwOrderLines] FROM [cdp_Integration]
REVOKE SELECT ON [${flyway:defaultSchema}].[vwOrderLines] FROM [cdp_UI]
GRANT SELECT ON [${flyway:defaultSchema}].[vwOrderLines] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for MJ_BizApps_Orders: Order Lines */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Order Lines
-- Item: spCreateOrderLine
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- Create procedure — OrderLine
-- ---------------------------------------------------------------------------
------------------------------------------------------------
----- CREATE PROCEDURE FOR OrderLine
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateOrderLine]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateOrderLine];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateOrderLine]
    @ID uniqueidentifier = NULL,
    @OrderHeaderID uniqueidentifier,
    @ProductID uniqueidentifier,
    @CompanyID uniqueidentifier,
    @LineNumber int,
    @Quantity decimal(18, 4),
    @UnitPrice decimal(19, 4),
    @ProductPriceID_Clear bit = 0,
    @ProductPriceID uniqueidentifier = NULL,
    @DiscountPct decimal(7, 4) = NULL,
    @DiscountAmount decimal(19, 4) = NULL,
    @LineTotalNet_Clear bit = 0,
    @LineTotalNet decimal(18, 2) = NULL,
    @ChargeAmount decimal(18, 2) = NULL,
    @LineTax decimal(18, 2) = NULL,
    @LineTotalGross_Clear bit = 0,
    @LineTotalGross decimal(18, 2) = NULL,
    @ShipToAddressID_Clear bit = 0,
    @ShipToAddressID uniqueidentifier = NULL,
    @ShipToOrganizationID_Clear bit = 0,
    @ShipToOrganizationID uniqueidentifier = NULL,
    @ShipToPersonID_Clear bit = 0,
    @ShipToPersonID uniqueidentifier = NULL,
    @RenewsSubscriptionID_Clear bit = 0,
    @RenewsSubscriptionID uniqueidentifier = NULL,
    @ServicePeriodStart_Clear bit = 0,
    @ServicePeriodStart date = NULL,
    @ServicePeriodEnd_Clear bit = 0,
    @ServicePeriodEnd date = NULL,
    @FulfillmentStatus_Clear bit = 0,
    @FulfillmentStatus nvarchar(20) = NULL,
    @ReversesOrderLineID_Clear bit = 0,
    @ReversesOrderLineID uniqueidentifier = NULL,
    @SourceBundleProductID_Clear bit = 0,
    @SourceBundleProductID uniqueidentifier = NULL,
    @ParentOrderLineID_Clear bit = 0,
    @ParentOrderLineID uniqueidentifier = NULL,
    @IsRollupParent bit = NULL,
    @IsQuantityOverridden bit = NULL,
    @SubscriptionID_Clear bit = 0,
    @SubscriptionID uniqueidentifier = NULL,
    @Description_Clear bit = 0,
    @Description nvarchar(500) = NULL,
    @JournalEntryID_Clear bit = 0,
    @JournalEntryID uniqueidentifier = NULL,
    @PriceOverridden bit = NULL,
    @PriceOverrideReason_Clear bit = 0,
    @PriceOverrideReason nvarchar(MAX) = NULL,
    @DimensionID_Clear bit = 0,
    @DimensionID uniqueidentifier = NULL,
    @DimensionValueID_Clear bit = 0,
    @DimensionValueID uniqueidentifier = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)

    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[OrderLine]
            (
                [ID],
                [OrderHeaderID],
                [ProductID],
                [CompanyID],
                [LineNumber],
                [Quantity],
                [UnitPrice],
                [ProductPriceID],
                [DiscountPct],
                [DiscountAmount],
                [LineTotalNet],
                [ChargeAmount],
                [LineTax],
                [LineTotalGross],
                [ShipToAddressID],
                [ShipToOrganizationID],
                [ShipToPersonID],
                [RenewsSubscriptionID],
                [ServicePeriodStart],
                [ServicePeriodEnd],
                [FulfillmentStatus],
                [ReversesOrderLineID],
                [SourceBundleProductID],
                [ParentOrderLineID],
                [IsRollupParent],
                [IsQuantityOverridden],
                [SubscriptionID],
                [Description],
                [JournalEntryID],
                [PriceOverridden],
                [PriceOverrideReason],
                [DimensionID],
                [DimensionValueID]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @OrderHeaderID,
                @ProductID,
                @CompanyID,
                @LineNumber,
                @Quantity,
                @UnitPrice,
                CASE WHEN @ProductPriceID_Clear = 1 THEN NULL ELSE ISNULL(@ProductPriceID, NULL) END,
                ISNULL(@DiscountPct, 0),
                ISNULL(@DiscountAmount, 0),
                CASE WHEN @LineTotalNet_Clear = 1 THEN NULL ELSE ISNULL(@LineTotalNet, NULL) END,
                ISNULL(@ChargeAmount, 0),
                ISNULL(@LineTax, 0),
                CASE WHEN @LineTotalGross_Clear = 1 THEN NULL ELSE ISNULL(@LineTotalGross, NULL) END,
                CASE WHEN @ShipToAddressID_Clear = 1 THEN NULL ELSE ISNULL(@ShipToAddressID, NULL) END,
                CASE WHEN @ShipToOrganizationID_Clear = 1 THEN NULL ELSE ISNULL(@ShipToOrganizationID, NULL) END,
                CASE WHEN @ShipToPersonID_Clear = 1 THEN NULL ELSE ISNULL(@ShipToPersonID, NULL) END,
                CASE WHEN @RenewsSubscriptionID_Clear = 1 THEN NULL ELSE ISNULL(@RenewsSubscriptionID, NULL) END,
                CASE WHEN @ServicePeriodStart_Clear = 1 THEN NULL ELSE ISNULL(@ServicePeriodStart, NULL) END,
                CASE WHEN @ServicePeriodEnd_Clear = 1 THEN NULL ELSE ISNULL(@ServicePeriodEnd, NULL) END,
                CASE WHEN @FulfillmentStatus_Clear = 1 THEN NULL ELSE ISNULL(@FulfillmentStatus, NULL) END,
                CASE WHEN @ReversesOrderLineID_Clear = 1 THEN NULL ELSE ISNULL(@ReversesOrderLineID, NULL) END,
                CASE WHEN @SourceBundleProductID_Clear = 1 THEN NULL ELSE ISNULL(@SourceBundleProductID, NULL) END,
                CASE WHEN @ParentOrderLineID_Clear = 1 THEN NULL ELSE ISNULL(@ParentOrderLineID, NULL) END,
                ISNULL(@IsRollupParent, 0),
                ISNULL(@IsQuantityOverridden, 0),
                CASE WHEN @SubscriptionID_Clear = 1 THEN NULL ELSE ISNULL(@SubscriptionID, NULL) END,
                CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, NULL) END,
                CASE WHEN @JournalEntryID_Clear = 1 THEN NULL ELSE ISNULL(@JournalEntryID, NULL) END,
                ISNULL(@PriceOverridden, 0),
                CASE WHEN @PriceOverrideReason_Clear = 1 THEN NULL ELSE ISNULL(@PriceOverrideReason, NULL) END,
                CASE WHEN @DimensionID_Clear = 1 THEN NULL ELSE ISNULL(@DimensionID, NULL) END,
                CASE WHEN @DimensionValueID_Clear = 1 THEN NULL ELSE ISNULL(@DimensionValueID, NULL) END
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[OrderLine]
            (
                [OrderHeaderID],
                [ProductID],
                [CompanyID],
                [LineNumber],
                [Quantity],
                [UnitPrice],
                [ProductPriceID],
                [DiscountPct],
                [DiscountAmount],
                [LineTotalNet],
                [ChargeAmount],
                [LineTax],
                [LineTotalGross],
                [ShipToAddressID],
                [ShipToOrganizationID],
                [ShipToPersonID],
                [RenewsSubscriptionID],
                [ServicePeriodStart],
                [ServicePeriodEnd],
                [FulfillmentStatus],
                [ReversesOrderLineID],
                [SourceBundleProductID],
                [ParentOrderLineID],
                [IsRollupParent],
                [IsQuantityOverridden],
                [SubscriptionID],
                [Description],
                [JournalEntryID],
                [PriceOverridden],
                [PriceOverrideReason],
                [DimensionID],
                [DimensionValueID]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @OrderHeaderID,
                @ProductID,
                @CompanyID,
                @LineNumber,
                @Quantity,
                @UnitPrice,
                CASE WHEN @ProductPriceID_Clear = 1 THEN NULL ELSE ISNULL(@ProductPriceID, NULL) END,
                ISNULL(@DiscountPct, 0),
                ISNULL(@DiscountAmount, 0),
                CASE WHEN @LineTotalNet_Clear = 1 THEN NULL ELSE ISNULL(@LineTotalNet, NULL) END,
                ISNULL(@ChargeAmount, 0),
                ISNULL(@LineTax, 0),
                CASE WHEN @LineTotalGross_Clear = 1 THEN NULL ELSE ISNULL(@LineTotalGross, NULL) END,
                CASE WHEN @ShipToAddressID_Clear = 1 THEN NULL ELSE ISNULL(@ShipToAddressID, NULL) END,
                CASE WHEN @ShipToOrganizationID_Clear = 1 THEN NULL ELSE ISNULL(@ShipToOrganizationID, NULL) END,
                CASE WHEN @ShipToPersonID_Clear = 1 THEN NULL ELSE ISNULL(@ShipToPersonID, NULL) END,
                CASE WHEN @RenewsSubscriptionID_Clear = 1 THEN NULL ELSE ISNULL(@RenewsSubscriptionID, NULL) END,
                CASE WHEN @ServicePeriodStart_Clear = 1 THEN NULL ELSE ISNULL(@ServicePeriodStart, NULL) END,
                CASE WHEN @ServicePeriodEnd_Clear = 1 THEN NULL ELSE ISNULL(@ServicePeriodEnd, NULL) END,
                CASE WHEN @FulfillmentStatus_Clear = 1 THEN NULL ELSE ISNULL(@FulfillmentStatus, NULL) END,
                CASE WHEN @ReversesOrderLineID_Clear = 1 THEN NULL ELSE ISNULL(@ReversesOrderLineID, NULL) END,
                CASE WHEN @SourceBundleProductID_Clear = 1 THEN NULL ELSE ISNULL(@SourceBundleProductID, NULL) END,
                CASE WHEN @ParentOrderLineID_Clear = 1 THEN NULL ELSE ISNULL(@ParentOrderLineID, NULL) END,
                ISNULL(@IsRollupParent, 0),
                ISNULL(@IsQuantityOverridden, 0),
                CASE WHEN @SubscriptionID_Clear = 1 THEN NULL ELSE ISNULL(@SubscriptionID, NULL) END,
                CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, NULL) END,
                CASE WHEN @JournalEntryID_Clear = 1 THEN NULL ELSE ISNULL(@JournalEntryID, NULL) END,
                ISNULL(@PriceOverridden, 0),
                CASE WHEN @PriceOverrideReason_Clear = 1 THEN NULL ELSE ISNULL(@PriceOverrideReason, NULL) END,
                CASE WHEN @DimensionID_Clear = 1 THEN NULL ELSE ISNULL(@DimensionID, NULL) END,
                CASE WHEN @DimensionValueID_Clear = 1 THEN NULL ELSE ISNULL(@DimensionValueID, NULL) END
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwOrderLines] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreateOrderLine] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreateOrderLine] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateOrderLine] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ_BizApps_Orders: Order Lines */

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreateOrderLine] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreateOrderLine] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateOrderLine] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for MJ_BizApps_Orders: Order Lines */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Order Lines
-- Item: spUpdateOrderLine
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- Update procedure — OrderLine
-- ---------------------------------------------------------------------------
------------------------------------------------------------
----- UPDATE PROCEDURE FOR OrderLine
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateOrderLine]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateOrderLine];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateOrderLine]
    @ID uniqueidentifier,
    @OrderHeaderID uniqueidentifier = NULL,
    @ProductID uniqueidentifier = NULL,
    @CompanyID uniqueidentifier = NULL,
    @LineNumber int = NULL,
    @Quantity decimal(18, 4) = NULL,
    @UnitPrice decimal(19, 4) = NULL,
    @ProductPriceID_Clear bit = 0,
    @ProductPriceID uniqueidentifier = NULL,
    @DiscountPct decimal(7, 4) = NULL,
    @DiscountAmount decimal(19, 4) = NULL,
    @LineTotalNet_Clear bit = 0,
    @LineTotalNet decimal(18, 2) = NULL,
    @ChargeAmount decimal(18, 2) = NULL,
    @LineTax decimal(18, 2) = NULL,
    @LineTotalGross_Clear bit = 0,
    @LineTotalGross decimal(18, 2) = NULL,
    @ShipToAddressID_Clear bit = 0,
    @ShipToAddressID uniqueidentifier = NULL,
    @ShipToOrganizationID_Clear bit = 0,
    @ShipToOrganizationID uniqueidentifier = NULL,
    @ShipToPersonID_Clear bit = 0,
    @ShipToPersonID uniqueidentifier = NULL,
    @RenewsSubscriptionID_Clear bit = 0,
    @RenewsSubscriptionID uniqueidentifier = NULL,
    @ServicePeriodStart_Clear bit = 0,
    @ServicePeriodStart date = NULL,
    @ServicePeriodEnd_Clear bit = 0,
    @ServicePeriodEnd date = NULL,
    @FulfillmentStatus_Clear bit = 0,
    @FulfillmentStatus nvarchar(20) = NULL,
    @ReversesOrderLineID_Clear bit = 0,
    @ReversesOrderLineID uniqueidentifier = NULL,
    @SourceBundleProductID_Clear bit = 0,
    @SourceBundleProductID uniqueidentifier = NULL,
    @ParentOrderLineID_Clear bit = 0,
    @ParentOrderLineID uniqueidentifier = NULL,
    @IsRollupParent bit = NULL,
    @IsQuantityOverridden bit = NULL,
    @SubscriptionID_Clear bit = 0,
    @SubscriptionID uniqueidentifier = NULL,
    @Description_Clear bit = 0,
    @Description nvarchar(500) = NULL,
    @JournalEntryID_Clear bit = 0,
    @JournalEntryID uniqueidentifier = NULL,
    @PriceOverridden bit = NULL,
    @PriceOverrideReason_Clear bit = 0,
    @PriceOverrideReason nvarchar(MAX) = NULL,
    @DimensionID_Clear bit = 0,
    @DimensionID uniqueidentifier = NULL,
    @DimensionValueID_Clear bit = 0,
    @DimensionValueID uniqueidentifier = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[OrderLine]
    SET
        [OrderHeaderID] = ISNULL(@OrderHeaderID, [OrderHeaderID]),
        [ProductID] = ISNULL(@ProductID, [ProductID]),
        [CompanyID] = ISNULL(@CompanyID, [CompanyID]),
        [LineNumber] = ISNULL(@LineNumber, [LineNumber]),
        [Quantity] = ISNULL(@Quantity, [Quantity]),
        [UnitPrice] = ISNULL(@UnitPrice, [UnitPrice]),
        [ProductPriceID] = CASE WHEN @ProductPriceID_Clear = 1 THEN NULL ELSE ISNULL(@ProductPriceID, [ProductPriceID]) END,
        [DiscountPct] = ISNULL(@DiscountPct, [DiscountPct]),
        [DiscountAmount] = ISNULL(@DiscountAmount, [DiscountAmount]),
        [LineTotalNet] = CASE WHEN @LineTotalNet_Clear = 1 THEN NULL ELSE ISNULL(@LineTotalNet, [LineTotalNet]) END,
        [ChargeAmount] = ISNULL(@ChargeAmount, [ChargeAmount]),
        [LineTax] = ISNULL(@LineTax, [LineTax]),
        [LineTotalGross] = CASE WHEN @LineTotalGross_Clear = 1 THEN NULL ELSE ISNULL(@LineTotalGross, [LineTotalGross]) END,
        [ShipToAddressID] = CASE WHEN @ShipToAddressID_Clear = 1 THEN NULL ELSE ISNULL(@ShipToAddressID, [ShipToAddressID]) END,
        [ShipToOrganizationID] = CASE WHEN @ShipToOrganizationID_Clear = 1 THEN NULL ELSE ISNULL(@ShipToOrganizationID, [ShipToOrganizationID]) END,
        [ShipToPersonID] = CASE WHEN @ShipToPersonID_Clear = 1 THEN NULL ELSE ISNULL(@ShipToPersonID, [ShipToPersonID]) END,
        [RenewsSubscriptionID] = CASE WHEN @RenewsSubscriptionID_Clear = 1 THEN NULL ELSE ISNULL(@RenewsSubscriptionID, [RenewsSubscriptionID]) END,
        [ServicePeriodStart] = CASE WHEN @ServicePeriodStart_Clear = 1 THEN NULL ELSE ISNULL(@ServicePeriodStart, [ServicePeriodStart]) END,
        [ServicePeriodEnd] = CASE WHEN @ServicePeriodEnd_Clear = 1 THEN NULL ELSE ISNULL(@ServicePeriodEnd, [ServicePeriodEnd]) END,
        [FulfillmentStatus] = CASE WHEN @FulfillmentStatus_Clear = 1 THEN NULL ELSE ISNULL(@FulfillmentStatus, [FulfillmentStatus]) END,
        [ReversesOrderLineID] = CASE WHEN @ReversesOrderLineID_Clear = 1 THEN NULL ELSE ISNULL(@ReversesOrderLineID, [ReversesOrderLineID]) END,
        [SourceBundleProductID] = CASE WHEN @SourceBundleProductID_Clear = 1 THEN NULL ELSE ISNULL(@SourceBundleProductID, [SourceBundleProductID]) END,
        [ParentOrderLineID] = CASE WHEN @ParentOrderLineID_Clear = 1 THEN NULL ELSE ISNULL(@ParentOrderLineID, [ParentOrderLineID]) END,
        [IsRollupParent] = ISNULL(@IsRollupParent, [IsRollupParent]),
        [IsQuantityOverridden] = ISNULL(@IsQuantityOverridden, [IsQuantityOverridden]),
        [SubscriptionID] = CASE WHEN @SubscriptionID_Clear = 1 THEN NULL ELSE ISNULL(@SubscriptionID, [SubscriptionID]) END,
        [Description] = CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, [Description]) END,
        [JournalEntryID] = CASE WHEN @JournalEntryID_Clear = 1 THEN NULL ELSE ISNULL(@JournalEntryID, [JournalEntryID]) END,
        [PriceOverridden] = ISNULL(@PriceOverridden, [PriceOverridden]),
        [PriceOverrideReason] = CASE WHEN @PriceOverrideReason_Clear = 1 THEN NULL ELSE ISNULL(@PriceOverrideReason, [PriceOverrideReason]) END,
        [DimensionID] = CASE WHEN @DimensionID_Clear = 1 THEN NULL ELSE ISNULL(@DimensionID, [DimensionID]) END,
        [DimensionValueID] = CASE WHEN @DimensionValueID_Clear = 1 THEN NULL ELSE ISNULL(@DimensionValueID, [DimensionValueID]) END
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwOrderLines] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwOrderLines]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spUpdateOrderLine] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spUpdateOrderLine] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateOrderLine] TO [cdp_Developer], [cdp_Integration]
GO

-- ---------------------------------------------------------------------------
-- Base view — Event Order Lines (IS-A child; inherits the parent's columns explicitly)
-- ---------------------------------------------------------------------------
------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ_BizApps_Orders: Event Order Lines
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  EventOrderLine
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwEventOrderLines]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwEventOrderLines];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwEventOrderLines]
AS
SELECT
    e.*,
    ${mjSchema}_isa_p1.[OrderHeaderID],
    ${mjSchema}_isa_p1.[ProductID],
    ${mjSchema}_isa_p1.[CompanyID],
    ${mjSchema}_isa_p1.[LineNumber],
    ${mjSchema}_isa_p1.[Quantity],
    ${mjSchema}_isa_p1.[UnitPrice],
    ${mjSchema}_isa_p1.[ProductPriceID],
    ${mjSchema}_isa_p1.[DiscountPct],
    ${mjSchema}_isa_p1.[DiscountAmount],
    ${mjSchema}_isa_p1.[LineTotalNet],
    ${mjSchema}_isa_p1.[ChargeAmount],
    ${mjSchema}_isa_p1.[LineTax],
    ${mjSchema}_isa_p1.[LineTotalGross],
    ${mjSchema}_isa_p1.[ShipToAddressID],
    ${mjSchema}_isa_p1.[ShipToOrganizationID],
    ${mjSchema}_isa_p1.[ShipToPersonID],
    ${mjSchema}_isa_p1.[RenewsSubscriptionID],
    ${mjSchema}_isa_p1.[ServicePeriodStart],
    ${mjSchema}_isa_p1.[ServicePeriodEnd],
    ${mjSchema}_isa_p1.[FulfillmentStatus],
    ${mjSchema}_isa_p1.[ReversesOrderLineID],
    ${mjSchema}_isa_p1.[SourceBundleProductID],
    ${mjSchema}_isa_p1.[ParentOrderLineID],
    ${mjSchema}_isa_p1.[IsRollupParent],
    ${mjSchema}_isa_p1.[IsQuantityOverridden],
    ${mjSchema}_isa_p1.[SubscriptionID],
    ${mjSchema}_isa_p1.[Description],
    ${mjSchema}_isa_p1.[JournalEntryID],
    ${mjSchema}_isa_p1.[PriceOverridden],
    ${mjSchema}_isa_p1.[PriceOverrideReason],
    ${mjSchema}_isa_p1.[DimensionID],
    ${mjSchema}_isa_p1.[DimensionValueID],
    mjBizAppsCommonPerson_PersonID.[DisplayName] AS [Person]
FROM
    [${flyway:defaultSchema}].[EventOrderLine] AS e
INNER JOIN
    [${flyway:defaultSchema}].[OrderLine] AS ${mjSchema}_isa_p1
  ON
    [e].[ID] = ${mjSchema}_isa_p1.[ID]
INNER JOIN
    [${mjSchema}_BizAppsCommon].[Person] AS mjBizAppsCommonPerson_PersonID
  ON
    [e].[PersonID] = mjBizAppsCommonPerson_PersonID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwEventOrderLines] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for MJ_BizApps_Orders: Event Order Lines */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Event Order Lines
-- Item: Permissions for vwEventOrderLines
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwEventOrderLines] TO [cdp_UI], [cdp_Developer], [cdp_Integration];
GO
