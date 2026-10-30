-- =============================================================================
-- V202610301630 — Product.IsSellableNew: products kept for history, not for a
--                 new sale
-- =============================================================================
-- Some Active products exist only so that past or recurring business has
-- somewhere to land: the per-company catch-all products a Business Central
-- import books invoice lines to, and the products converted subscriptions
-- renew on. Nobody should pick them for a new sale, but they must stay Active:
-- pricing refuses any line whose product is not Active, on every later save of
-- the order, so retiring them would stop existing orders, imports and renewals
-- from saving (bc-aidp-next-golive#360).
--
-- IsSellableNew = 0 takes a product out of the add-product pickers (orders'
-- catalog options, and sales' deal line editor) and nothing else. Pricing,
-- renewals and imports do not read it.
--
-- Existing rows: every product defaults to 1, so nothing leaves a picker until
-- a host sets the flag on its own products.
--
-- Hand-written DDL here is PLAIN: no existence guards. Migrations run once, in order.
--
-- CodeGen output for this app is folded below the banner at the end of this file.
-- =============================================================================

ALTER TABLE [${flyway:defaultSchema}].[Product]
    ADD [IsSellableNew] BIT NOT NULL CONSTRAINT [DF_Product_IsSellableNew] DEFAULT 1;
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'0 = kept for existing orders, imports and renewals, and not offered by the add-product pickers for a new sale. Pricing ignores it.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'Product',
    @level2type = N'COLUMN', @level2name = N'IsSellableNew';
GO

-- =============================================================================
--
--   CODEGEN OUTPUT — GENERATED CODE BELOW THIS LINE (do not hand-edit)
--
-- =============================================================================


/* SQL text to insert 1 new entity field(s) */

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '2e8f1b22-5d95-44d2-8ed6-4d579aed5d9d' OR (EntityID = 'B35DD5C3-9A6B-42D1-9049-297EE45ED2D5' AND Name = 'IsSellableNew')) BEGIN
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
            '2e8f1b22-5d95-44d2-8ed6-4d579aed5d9d',
            'B35DD5C3-9A6B-42D1-9049-297EE45ED2D5', -- Entity: MJ_BizApps_Orders: Products
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${mjSchema}].[EntityField] WHERE [EntityID] = 'B35DD5C3-9A6B-42D1-9049-297EE45ED2D5'),
            'IsSellableNew',
            'Is Sellable New',
            '0 = kept for existing orders, imports and renewals, and not offered by the add-product pickers for a new sale. Pricing ignores it.',
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

/* Create IS-A parent field IsSellableNew on MJ_BizApps_Orders: Event Products */
INSERT INTO [${mjSchema}].[EntityField] (
                  [ID], [EntityID], [Name], [Type], [AllowsNull],
                  [Length], [Precision], [Scale],
                  [Sequence], [IsVirtual], [AllowUpdateAPI],
                  [IsPrimaryKey], [IsUnique],
                  [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES (
                  '1abf1396-a79f-4d48-b605-2b42224f1cc2', 'B090A662-A97A-4748-B109-2FA716C14651', 'IsSellableNew',
                  'bit', 0,
                  1, 1, 0,
                  (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${mjSchema}].[EntityField] WHERE [EntityID] = 'B090A662-A97A-4748-B109-2FA716C14651'), 1, 1, 0, 0,
                  GETUTCDATE(), GETUTCDATE());

/* Update entity timestamp for MJ_BizApps_Orders: Event Products after IS-A field sync */
UPDATE [${mjSchema}].[Entity] SET [__mj_UpdatedAt]=GETUTCDATE() WHERE ID='B090A662-A97A-4748-B109-2FA716C14651';

/* SQL text to update display name for field IsSellableNew */
UPDATE [${mjSchema}].[EntityField] SET [__mj_UpdatedAt]=GETUTCDATE(), DisplayName = 'Is Sellable New' WHERE ID = '1ABF1396-A79F-4D48-B605-2B42224F1CC2';

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
    ${mjSchema}_isa_p1.[IsSellableNew],
    mjBizAppsCommonAddress_VenueAddressID.[DisplayName] AS [VenueAddress]
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

/* Base View SQL for MJ_BizApps_Orders: Order Headers */
-----------------------------------------------------------------
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
    @RequiresSaleApproval bit = NULL,
    @IsSellableNew bit = NULL
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
                [IsSellableNew]
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
                ISNULL(@IsSellableNew, 1)
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
                [IsSellableNew]
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
                ISNULL(@IsSellableNew, 1)
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
    @IsSellableNew bit = NULL
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
        [IsSellableNew] = ISNULL(@IsSellableNew, [IsSellableNew])
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

/* Set categories for 2 fields */

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Products.IsSellableNew 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'Catalog Lifecycle',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '2E8F1B22-5D95-44D2-8ED6-4D579AED5D9D';

