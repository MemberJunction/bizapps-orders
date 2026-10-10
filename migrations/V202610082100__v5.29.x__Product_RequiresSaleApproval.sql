-- =============================================================================
-- V202610082100 — RequiresSaleApproval on ProductType, ProductCategory and
--                 Product (golive #281)
-- =============================================================================
-- Some products are priced per engagement: professional services, custom scope,
-- anything sold without a list price. A line for one of them gives nothing away
-- against an engine price, so the concession gate had nothing to hold and the
-- line confirmed with no approval at all.
--
-- A product that requires sale approval holds its order at confirm until an
-- Approved Price or Scope concession, decided through the ConcessionLimit rule's
-- approving role, covers its line. The requester's own Sales Authority never
-- approves one.
--
-- NULL inherits, most specific first: the Product's own value, else its
-- category's, else the nearest ancestor category's, else its ProductType's,
-- else not required. A product or category can set 0 to opt out of a value it
-- would inherit.
--
-- RUN CODEGEN AFTER THIS so the three base views, their CRUD procs, the IS-A
-- child Event Products and the entity subclasses pick up the column.
-- =============================================================================

ALTER TABLE [${flyway:defaultSchema}].[ProductType] ADD [RequiresSaleApproval] BIT NULL;
GO

ALTER TABLE [${flyway:defaultSchema}].[ProductCategory] ADD [RequiresSaleApproval] BIT NULL;
GO

ALTER TABLE [${flyway:defaultSchema}].[Product] ADD [RequiresSaleApproval] BIT NULL;
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'When true, every line for a product of this type holds its order at confirm until an approved concession, decided by the ConcessionLimit rule''s approving role, covers it: the requester''s own Sales Authority never approves it. For products priced per engagement, such as professional services or custom scope. NULL means not required. A product category or the product itself overrides this.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'ProductType',
    @level2type = N'COLUMN', @level2name = N'RequiresSaleApproval';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'When true, every line for a product in this category holds its order at confirm until an approved concession, decided by the ConcessionLimit rule''s approving role, covers it. NULL means inherit from the next level: the parent category, then the product type. A product''s own value overrides this.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'ProductCategory',
    @level2type = N'COLUMN', @level2name = N'RequiresSaleApproval';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'When true, every line for this product holds its order at confirm until an approved concession, decided by the ConcessionLimit rule''s approving role, covers it: the requester''s own Sales Authority never approves it. Overrides the product''s category and type. NULL means inherit from the next level: the product category and its ancestors, then the product type.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'Product',
    @level2type = N'COLUMN', @level2name = N'RequiresSaleApproval';
GO


















































-- =============================================================================
--
--   CODEGEN OUTPUT — GENERATED CODE BELOW THIS LINE (do not hand-edit)
--
--   Produced by MJ CodeGen 6.1.5 against a database built from migrations alone,
--   with the hand-authored DDL above applied. Contains the RequiresSaleApproval
--   field registrations on Products, Product Categories and Product Types and
--   the IS-A child Event Products, and the rebuilt views, CRUD procs and grants
--   for those four.
--
--   Left out, because this change does not touch them: the run's rebuild of the
--   Order Headers view and procs, value-list rows for unrelated fields, and the
--   unchanged FK indexes and Product Categories hierarchy functions.
--
-- =============================================================================

/* SQL text to insert 3 new entity field(s) */

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = 'f3a965ca-55ec-4dc7-92dc-5e73da0f5c16' OR (EntityID = 'B35DD5C3-9A6B-42D1-9049-297EE45ED2D5' AND Name = 'RequiresSaleApproval')) BEGIN
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
            'f3a965ca-55ec-4dc7-92dc-5e73da0f5c16',
            'B35DD5C3-9A6B-42D1-9049-297EE45ED2D5', -- Entity: MJ_BizApps_Orders: Products
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${mjSchema}].[EntityField] WHERE [EntityID] = 'B35DD5C3-9A6B-42D1-9049-297EE45ED2D5'),
            'RequiresSaleApproval',
            'Requires Sale Approval',
            'When true, every line for this product holds its order at confirm until an approved concession, decided by the ConcessionLimit rule''s approving role, covers it: the requester''s own Sales Authority never approves it. Overrides the product''s category and type. NULL means inherit from the next level: the product category and its ancestors, then the product type.',
            'bit',
            1,
            1,
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = 'fbb44b84-ffa7-4188-b90b-28187472e614' OR (EntityID = 'B0FA90A6-6975-4C5E-ABC7-3AEA97700CC3' AND Name = 'RequiresSaleApproval')) BEGIN
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
            'fbb44b84-ffa7-4188-b90b-28187472e614',
            'B0FA90A6-6975-4C5E-ABC7-3AEA97700CC3', -- Entity: MJ_BizApps_Orders: Product Categories
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${mjSchema}].[EntityField] WHERE [EntityID] = 'B0FA90A6-6975-4C5E-ABC7-3AEA97700CC3'),
            'RequiresSaleApproval',
            'Requires Sale Approval',
            'When true, every line for a product in this category holds its order at confirm until an approved concession, decided by the ConcessionLimit rule''s approving role, covers it. NULL means inherit from the next level: the parent category, then the product type. A product''s own value overrides this.',
            'bit',
            1,
            1,
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = 'c7cdcfce-bde2-4668-a25f-d4a1149f91b4' OR (EntityID = '9D578BD2-B7BB-40BD-88B7-6494C9B8DC00' AND Name = 'RequiresSaleApproval')) BEGIN
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
            'c7cdcfce-bde2-4668-a25f-d4a1149f91b4',
            '9D578BD2-B7BB-40BD-88B7-6494C9B8DC00', -- Entity: MJ_BizApps_Orders: Product Types
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${mjSchema}].[EntityField] WHERE [EntityID] = '9D578BD2-B7BB-40BD-88B7-6494C9B8DC00'),
            'RequiresSaleApproval',
            'Requires Sale Approval',
            'When true, every line for a product of this type holds its order at confirm until an approved concession, decided by the ConcessionLimit rule''s approving role, covers it: the requester''s own Sales Authority never approves it. For products priced per engagement, such as professional services or custom scope. NULL means not required. A product category or the product itself overrides this.',
            'bit',
            1,
            1,
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

/* Create IS-A parent field RequiresSaleApproval on MJ_BizApps_Orders: Event Products */
INSERT INTO [${mjSchema}].[EntityField] (
                  [ID], [EntityID], [Name], [Type], [AllowsNull],
                  [Length], [Precision], [Scale],
                  [Sequence], [IsVirtual], [AllowUpdateAPI],
                  [IsPrimaryKey], [IsUnique],
                  [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES (
                  'd15a1170-8887-47b3-93f2-47c7f544bb84', 'B090A662-A97A-4748-B109-2FA716C14651', 'RequiresSaleApproval',
                  'bit', 1,
                  1, 1, 0,
                  (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${mjSchema}].[EntityField] WHERE [EntityID] = 'B090A662-A97A-4748-B109-2FA716C14651'), 1, 1, 0, 0,
                  GETUTCDATE(), GETUTCDATE());

/* Update entity timestamp for MJ_BizApps_Orders: Event Products after IS-A field sync */
UPDATE [${mjSchema}].[Entity] SET [__mj_UpdatedAt]=GETUTCDATE() WHERE ID='B090A662-A97A-4748-B109-2FA716C14651';

/* SQL text to update display name for field RequiresSaleApproval */
UPDATE [${mjSchema}].[EntityField] SET [__mj_UpdatedAt]=GETUTCDATE(), DisplayName = 'Requires Sale Approval' WHERE ID = 'D15A1170-8887-47B3-93F2-47C7F544BB84';

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
    ${mjSchema}_isa_p1.[Name],
    ${mjSchema}_isa_p1.[SKU],
    ${mjSchema}_isa_p1.[ProductTypeID],
    ${mjSchema}_isa_p1.[ProductCategoryID],
    ${mjSchema}_isa_p1.[CompanyID],
    ${mjSchema}_isa_p1.[Status],
    ${mjSchema}_isa_p1.[SuccessorProductID],
    ${mjSchema}_isa_p1.[AvailableFrom],
    ${mjSchema}_isa_p1.[AvailableTo],
    ${mjSchema}_isa_p1.[RevenueRecognitionTypeID],
    ${mjSchema}_isa_p1.[StandaloneSellingPrice],
    ${mjSchema}_isa_p1.[SubscriptionTypeID],
    ${mjSchema}_isa_p1.[IsTaxable],
    ${mjSchema}_isa_p1.[Description],
    ${mjSchema}_isa_p1.[TaxCategory],
    ${mjSchema}_isa_p1.[EntitlementGrantTiming],
    ${mjSchema}_isa_p1.[EntitlementQuantityMode],
    ${mjSchema}_isa_p1.[EntitlementValidityMode],
    ${mjSchema}_isa_p1.[PricingDriverClass],
    ${mjSchema}_isa_p1.[MaxQuantityPerLine],
    ${mjSchema}_isa_p1.[SubscriptionFamilyID],
    ${mjSchema}_isa_p1.[RenewalIncreasePercent],
    ${mjSchema}_isa_p1.[RequiresSaleApproval],
    mjBizAppsCommonAddress_VenueAddressID.[Line1] AS [VenueAddress]
FROM
    [${flyway:defaultSchema}].[EventProduct] AS e
INNER JOIN
    [${flyway:defaultSchema}].[Product] AS ${mjSchema}_isa_p1
  ON
    [e].[ID] = ${mjSchema}_isa_p1.[ID]
LEFT OUTER JOIN
    [${mjSchema}_BizAppsCommon].[Address] AS mjBizAppsCommonAddress_VenueAddressID
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
REVOKE SELECT ON [${flyway:defaultSchema}].[vwProductCategories] FROM [cdp_Developer]
REVOKE SELECT ON [${flyway:defaultSchema}].[vwProductCategories] FROM [cdp_Integration]
REVOKE SELECT ON [${flyway:defaultSchema}].[vwProductCategories] FROM [cdp_UI]
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

REVOKE SELECT ON [${flyway:defaultSchema}].[vwProductCategories] FROM [cdp_Developer]
REVOKE SELECT ON [${flyway:defaultSchema}].[vwProductCategories] FROM [cdp_Integration]
REVOKE SELECT ON [${flyway:defaultSchema}].[vwProductCategories] FROM [cdp_UI]
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
    @RenewalIncreasePercent_Clear bit = 0,
    @RenewalIncreasePercent decimal(7, 4) = NULL,
    @RequiresSaleApproval_Clear bit = 0,
    @RequiresSaleApproval bit = NULL
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
                [RenewalIncreasePercent],
                [RequiresSaleApproval]
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
                CASE WHEN @RenewalIncreasePercent_Clear = 1 THEN NULL ELSE ISNULL(@RenewalIncreasePercent, NULL) END,
                CASE WHEN @RequiresSaleApproval_Clear = 1 THEN NULL ELSE ISNULL(@RequiresSaleApproval, NULL) END
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
                [RenewalIncreasePercent],
                [RequiresSaleApproval]
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
                CASE WHEN @RenewalIncreasePercent_Clear = 1 THEN NULL ELSE ISNULL(@RenewalIncreasePercent, NULL) END,
                CASE WHEN @RequiresSaleApproval_Clear = 1 THEN NULL ELSE ISNULL(@RequiresSaleApproval, NULL) END
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwProductCategories] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreateProductCategory] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreateProductCategory] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateProductCategory] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ_BizApps_Orders: Product Categories */

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreateProductCategory] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreateProductCategory] FROM [cdp_Integration]
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
    @RenewalIncreasePercent_Clear bit = 0,
    @RenewalIncreasePercent decimal(7, 4) = NULL,
    @RequiresSaleApproval_Clear bit = 0,
    @RequiresSaleApproval bit = NULL
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
        [RenewalIncreasePercent] = CASE WHEN @RenewalIncreasePercent_Clear = 1 THEN NULL ELSE ISNULL(@RenewalIncreasePercent, [RenewalIncreasePercent]) END,
        [RequiresSaleApproval] = CASE WHEN @RequiresSaleApproval_Clear = 1 THEN NULL ELSE ISNULL(@RequiresSaleApproval, [RequiresSaleApproval]) END
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

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spUpdateProductCategory] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spUpdateProductCategory] FROM [cdp_Integration]
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

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spUpdateProductCategory] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spUpdateProductCategory] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateProductCategory] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for MJ_BizApps_Orders: Product Categories */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Product Categories
-- Item: spDeleteProductCategory
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR ProductCategory
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteProductCategory]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteProductCategory];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteProductCategory]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[ProductCategory]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteProductCategory] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteProductCategory] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteProductCategory] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for MJ_BizApps_Orders: Product Categories */

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteProductCategory] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteProductCategory] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteProductCategory] TO [cdp_Developer], [cdp_Integration];

/* Base View SQL for MJ_BizApps_Orders: Product Types */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Product Types
-- Item: vwProductTypes
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ_BizApps_Orders: Product Types
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  ProductType
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwProductTypes]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwProductTypes];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwProductTypes]
AS
SELECT
    p.*,
    mjBizAppsOrdersRevenueRecognitionType_DefaultRevenueRecognitionTypeID.[Name] AS [DefaultRevenueRecognitionType],
    mjBizAppsOrdersSubscriptionType_DefaultSubscriptionTypeID.[Name] AS [DefaultSubscriptionType]
FROM
    [${flyway:defaultSchema}].[ProductType] AS p
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[RevenueRecognitionType] AS mjBizAppsOrdersRevenueRecognitionType_DefaultRevenueRecognitionTypeID
  ON
    [p].[DefaultRevenueRecognitionTypeID] = mjBizAppsOrdersRevenueRecognitionType_DefaultRevenueRecognitionTypeID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[SubscriptionType] AS mjBizAppsOrdersSubscriptionType_DefaultSubscriptionTypeID
  ON
    [p].[DefaultSubscriptionTypeID] = mjBizAppsOrdersSubscriptionType_DefaultSubscriptionTypeID.[ID]
GO
REVOKE SELECT ON [${flyway:defaultSchema}].[vwProductTypes] FROM [cdp_Developer]
REVOKE SELECT ON [${flyway:defaultSchema}].[vwProductTypes] FROM [cdp_Integration]
REVOKE SELECT ON [${flyway:defaultSchema}].[vwProductTypes] FROM [cdp_UI]
GRANT SELECT ON [${flyway:defaultSchema}].[vwProductTypes] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for MJ_BizApps_Orders: Product Types */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Product Types
-- Item: Permissions for vwProductTypes
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

REVOKE SELECT ON [${flyway:defaultSchema}].[vwProductTypes] FROM [cdp_Developer]
REVOKE SELECT ON [${flyway:defaultSchema}].[vwProductTypes] FROM [cdp_Integration]
REVOKE SELECT ON [${flyway:defaultSchema}].[vwProductTypes] FROM [cdp_UI]
GRANT SELECT ON [${flyway:defaultSchema}].[vwProductTypes] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for MJ_BizApps_Orders: Product Types */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Product Types
-- Item: spCreateProductType
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR ProductType
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateProductType]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateProductType];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateProductType]
    @ID uniqueidentifier = NULL,
    @Code_Clear bit = 0,
    @Code nvarchar(40) = NULL,
    @Name nvarchar(100),
    @Description_Clear bit = 0,
    @Description nvarchar(MAX) = NULL,
    @RequiresFulfillment bit = NULL,
    @DefaultRevenueRecognitionTypeID_Clear bit = 0,
    @DefaultRevenueRecognitionTypeID uniqueidentifier = NULL,
    @DefaultIsTaxable bit = NULL,
    @DefaultTaxCategory_Clear bit = 0,
    @DefaultTaxCategory nvarchar(50) = NULL,
    @DefaultSubscriptionTypeID_Clear bit = 0,
    @DefaultSubscriptionTypeID uniqueidentifier = NULL,
    @ProductExtensionEntity_Clear bit = 0,
    @ProductExtensionEntity nvarchar(255) = NULL,
    @OrderLineExtensionEntity_Clear bit = 0,
    @OrderLineExtensionEntity nvarchar(255) = NULL,
    @IsActive bit = NULL,
    @DefaultEntitlementGrantTiming nvarchar(20) = NULL,
    @DefaultEntitlementQuantityMode nvarchar(20) = NULL,
    @DefaultEntitlementValidityMode nvarchar(20) = NULL,
    @PricingDriverClass_Clear bit = 0,
    @PricingDriverClass nvarchar(255) = NULL,
    @Configuration_Clear bit = 0,
    @Configuration nvarchar(MAX) = NULL,
    @RequiresSaleApproval_Clear bit = 0,
    @RequiresSaleApproval bit = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)

    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[ProductType]
            (
                [ID],
                [Code],
                [Name],
                [Description],
                [RequiresFulfillment],
                [DefaultRevenueRecognitionTypeID],
                [DefaultIsTaxable],
                [DefaultTaxCategory],
                [DefaultSubscriptionTypeID],
                [ProductExtensionEntity],
                [OrderLineExtensionEntity],
                [IsActive],
                [DefaultEntitlementGrantTiming],
                [DefaultEntitlementQuantityMode],
                [DefaultEntitlementValidityMode],
                [PricingDriverClass],
                [Configuration],
                [RequiresSaleApproval]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                CASE WHEN @Code_Clear = 1 THEN NULL ELSE ISNULL(@Code, NULL) END,
                @Name,
                CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, NULL) END,
                ISNULL(@RequiresFulfillment, 0),
                CASE WHEN @DefaultRevenueRecognitionTypeID_Clear = 1 THEN NULL ELSE ISNULL(@DefaultRevenueRecognitionTypeID, NULL) END,
                ISNULL(@DefaultIsTaxable, 1),
                CASE WHEN @DefaultTaxCategory_Clear = 1 THEN NULL ELSE ISNULL(@DefaultTaxCategory, NULL) END,
                CASE WHEN @DefaultSubscriptionTypeID_Clear = 1 THEN NULL ELSE ISNULL(@DefaultSubscriptionTypeID, NULL) END,
                CASE WHEN @ProductExtensionEntity_Clear = 1 THEN NULL ELSE ISNULL(@ProductExtensionEntity, NULL) END,
                CASE WHEN @OrderLineExtensionEntity_Clear = 1 THEN NULL ELSE ISNULL(@OrderLineExtensionEntity, NULL) END,
                ISNULL(@IsActive, 1),
                ISNULL(@DefaultEntitlementGrantTiming, 'OnConfirm'),
                ISNULL(@DefaultEntitlementQuantityMode, 'PerUnit'),
                ISNULL(@DefaultEntitlementValidityMode, 'Perpetual'),
                CASE WHEN @PricingDriverClass_Clear = 1 THEN NULL ELSE ISNULL(@PricingDriverClass, NULL) END,
                CASE WHEN @Configuration_Clear = 1 THEN NULL ELSE ISNULL(@Configuration, NULL) END,
                CASE WHEN @RequiresSaleApproval_Clear = 1 THEN NULL ELSE ISNULL(@RequiresSaleApproval, NULL) END
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[ProductType]
            (
                [Code],
                [Name],
                [Description],
                [RequiresFulfillment],
                [DefaultRevenueRecognitionTypeID],
                [DefaultIsTaxable],
                [DefaultTaxCategory],
                [DefaultSubscriptionTypeID],
                [ProductExtensionEntity],
                [OrderLineExtensionEntity],
                [IsActive],
                [DefaultEntitlementGrantTiming],
                [DefaultEntitlementQuantityMode],
                [DefaultEntitlementValidityMode],
                [PricingDriverClass],
                [Configuration],
                [RequiresSaleApproval]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                CASE WHEN @Code_Clear = 1 THEN NULL ELSE ISNULL(@Code, NULL) END,
                @Name,
                CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, NULL) END,
                ISNULL(@RequiresFulfillment, 0),
                CASE WHEN @DefaultRevenueRecognitionTypeID_Clear = 1 THEN NULL ELSE ISNULL(@DefaultRevenueRecognitionTypeID, NULL) END,
                ISNULL(@DefaultIsTaxable, 1),
                CASE WHEN @DefaultTaxCategory_Clear = 1 THEN NULL ELSE ISNULL(@DefaultTaxCategory, NULL) END,
                CASE WHEN @DefaultSubscriptionTypeID_Clear = 1 THEN NULL ELSE ISNULL(@DefaultSubscriptionTypeID, NULL) END,
                CASE WHEN @ProductExtensionEntity_Clear = 1 THEN NULL ELSE ISNULL(@ProductExtensionEntity, NULL) END,
                CASE WHEN @OrderLineExtensionEntity_Clear = 1 THEN NULL ELSE ISNULL(@OrderLineExtensionEntity, NULL) END,
                ISNULL(@IsActive, 1),
                ISNULL(@DefaultEntitlementGrantTiming, 'OnConfirm'),
                ISNULL(@DefaultEntitlementQuantityMode, 'PerUnit'),
                ISNULL(@DefaultEntitlementValidityMode, 'Perpetual'),
                CASE WHEN @PricingDriverClass_Clear = 1 THEN NULL ELSE ISNULL(@PricingDriverClass, NULL) END,
                CASE WHEN @Configuration_Clear = 1 THEN NULL ELSE ISNULL(@Configuration, NULL) END,
                CASE WHEN @RequiresSaleApproval_Clear = 1 THEN NULL ELSE ISNULL(@RequiresSaleApproval, NULL) END
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwProductTypes] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreateProductType] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreateProductType] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateProductType] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ_BizApps_Orders: Product Types */

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreateProductType] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreateProductType] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateProductType] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for MJ_BizApps_Orders: Product Types */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Product Types
-- Item: spUpdateProductType
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR ProductType
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateProductType]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateProductType];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateProductType]
    @ID uniqueidentifier,
    @Code_Clear bit = 0,
    @Code nvarchar(40) = NULL,
    @Name nvarchar(100) = NULL,
    @Description_Clear bit = 0,
    @Description nvarchar(MAX) = NULL,
    @RequiresFulfillment bit = NULL,
    @DefaultRevenueRecognitionTypeID_Clear bit = 0,
    @DefaultRevenueRecognitionTypeID uniqueidentifier = NULL,
    @DefaultIsTaxable bit = NULL,
    @DefaultTaxCategory_Clear bit = 0,
    @DefaultTaxCategory nvarchar(50) = NULL,
    @DefaultSubscriptionTypeID_Clear bit = 0,
    @DefaultSubscriptionTypeID uniqueidentifier = NULL,
    @ProductExtensionEntity_Clear bit = 0,
    @ProductExtensionEntity nvarchar(255) = NULL,
    @OrderLineExtensionEntity_Clear bit = 0,
    @OrderLineExtensionEntity nvarchar(255) = NULL,
    @IsActive bit = NULL,
    @DefaultEntitlementGrantTiming nvarchar(20) = NULL,
    @DefaultEntitlementQuantityMode nvarchar(20) = NULL,
    @DefaultEntitlementValidityMode nvarchar(20) = NULL,
    @PricingDriverClass_Clear bit = 0,
    @PricingDriverClass nvarchar(255) = NULL,
    @Configuration_Clear bit = 0,
    @Configuration nvarchar(MAX) = NULL,
    @RequiresSaleApproval_Clear bit = 0,
    @RequiresSaleApproval bit = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[ProductType]
    SET
        [Code] = CASE WHEN @Code_Clear = 1 THEN NULL ELSE ISNULL(@Code, [Code]) END,
        [Name] = ISNULL(@Name, [Name]),
        [Description] = CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, [Description]) END,
        [RequiresFulfillment] = ISNULL(@RequiresFulfillment, [RequiresFulfillment]),
        [DefaultRevenueRecognitionTypeID] = CASE WHEN @DefaultRevenueRecognitionTypeID_Clear = 1 THEN NULL ELSE ISNULL(@DefaultRevenueRecognitionTypeID, [DefaultRevenueRecognitionTypeID]) END,
        [DefaultIsTaxable] = ISNULL(@DefaultIsTaxable, [DefaultIsTaxable]),
        [DefaultTaxCategory] = CASE WHEN @DefaultTaxCategory_Clear = 1 THEN NULL ELSE ISNULL(@DefaultTaxCategory, [DefaultTaxCategory]) END,
        [DefaultSubscriptionTypeID] = CASE WHEN @DefaultSubscriptionTypeID_Clear = 1 THEN NULL ELSE ISNULL(@DefaultSubscriptionTypeID, [DefaultSubscriptionTypeID]) END,
        [ProductExtensionEntity] = CASE WHEN @ProductExtensionEntity_Clear = 1 THEN NULL ELSE ISNULL(@ProductExtensionEntity, [ProductExtensionEntity]) END,
        [OrderLineExtensionEntity] = CASE WHEN @OrderLineExtensionEntity_Clear = 1 THEN NULL ELSE ISNULL(@OrderLineExtensionEntity, [OrderLineExtensionEntity]) END,
        [IsActive] = ISNULL(@IsActive, [IsActive]),
        [DefaultEntitlementGrantTiming] = ISNULL(@DefaultEntitlementGrantTiming, [DefaultEntitlementGrantTiming]),
        [DefaultEntitlementQuantityMode] = ISNULL(@DefaultEntitlementQuantityMode, [DefaultEntitlementQuantityMode]),
        [DefaultEntitlementValidityMode] = ISNULL(@DefaultEntitlementValidityMode, [DefaultEntitlementValidityMode]),
        [PricingDriverClass] = CASE WHEN @PricingDriverClass_Clear = 1 THEN NULL ELSE ISNULL(@PricingDriverClass, [PricingDriverClass]) END,
        [Configuration] = CASE WHEN @Configuration_Clear = 1 THEN NULL ELSE ISNULL(@Configuration, [Configuration]) END,
        [RequiresSaleApproval] = CASE WHEN @RequiresSaleApproval_Clear = 1 THEN NULL ELSE ISNULL(@RequiresSaleApproval, [RequiresSaleApproval]) END
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwProductTypes] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwProductTypes]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spUpdateProductType] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spUpdateProductType] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateProductType] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the ProductType table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateProductType]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateProductType];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateProductType
ON [${flyway:defaultSchema}].[ProductType]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[ProductType]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[ProductType] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for MJ_BizApps_Orders: Product Types */

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spUpdateProductType] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spUpdateProductType] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateProductType] TO [cdp_Developer], [cdp_Integration];

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
    mjBizAppsOrdersSubscriptionFamily_SubscriptionFamilyID.[Name] AS [SubscriptionFamily]
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
    @RequiresSaleApproval bit = NULL
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
                [RequiresSaleApproval]
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
                CASE WHEN @RequiresSaleApproval_Clear = 1 THEN NULL ELSE ISNULL(@RequiresSaleApproval, NULL) END
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
                [RequiresSaleApproval]
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
                CASE WHEN @RequiresSaleApproval_Clear = 1 THEN NULL ELSE ISNULL(@RequiresSaleApproval, NULL) END
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
    @RequiresSaleApproval bit = NULL
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
        [RequiresSaleApproval] = CASE WHEN @RequiresSaleApproval_Clear = 1 THEN NULL ELSE ISNULL(@RequiresSaleApproval, [RequiresSaleApproval]) END
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

/* spDelete SQL for MJ_BizApps_Orders: Product Types */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Product Types
-- Item: spDeleteProductType
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR ProductType
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteProductType]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteProductType];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteProductType]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[ProductType]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteProductType] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteProductType] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteProductType] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for MJ_BizApps_Orders: Product Types */

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteProductType] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteProductType] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteProductType] TO [cdp_Developer], [cdp_Integration];

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
