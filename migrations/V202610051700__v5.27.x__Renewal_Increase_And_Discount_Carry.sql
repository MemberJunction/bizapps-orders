-- =============================================================================
-- V202610051700 — Renewal repricing inputs: RenewalIncreasePercent on
--                 OrderCompanyPolicy, ProductCategory, Product and Subscription,
--                 and Subscription.CarryDiscountOnRenewal
--                 (MemberJunction/bc-aidp-next-golive#304)
-- =============================================================================
-- The renewal pass priced a renewal at what the customer last paid, discount
-- included. The renewal price is now the prior term's undiscounted unit price
-- (or the successor product's list price), raised by an annual increase:
--
--   renewal price = base x (1 + RenewalIncreasePercent / 100), DiscountPct 0
--
-- RenewalIncreasePercent: NULL inherits, most specific first: the subscription's
-- own value, else its product's, else the product's category, else the nearest
-- ancestor category's, else the selling company's OrderCompanyPolicy. NULL at
-- every level means no increase. The subscription level is where a contract's
-- negotiated uplift is recorded.
--
-- CarryDiscountOnRenewal: a first-term discount lapses at renewal unless this is
-- set, for a discount that was agreed to continue (a multi-year concession).
-- Existing subscriptions get 0, the rule finance set for every renewal.
--
-- Hand-written DDL here is PLAIN: no existence guards. Migrations run once, in order.
--
-- CodeGen output for this app is folded below the banner at the end of this file.
-- =============================================================================

ALTER TABLE [${flyway:defaultSchema}].[OrderCompanyPolicy]
    ADD [RenewalIncreasePercent] DECIMAL(7, 4) NULL
        CONSTRAINT [CK_OrderCompanyPolicy_RenewalIncreasePercent]
        CHECK ([RenewalIncreasePercent] IS NULL OR ([RenewalIncreasePercent] >= 0 AND [RenewalIncreasePercent] <= 100));
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Percent added to a subscription''s price when it renews, for every product this company sells. The last step of the inheritance walk: a subscription, its product or its product category overrides it. NULL means no increase. The increase applies from the first day of the renewal term, so every invoice in that term carries the same price.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'OrderCompanyPolicy',
    @level2type = N'COLUMN', @level2name = N'RenewalIncreasePercent';
GO

ALTER TABLE [${flyway:defaultSchema}].[ProductCategory]
    ADD [RenewalIncreasePercent] DECIMAL(7, 4) NULL
        CONSTRAINT [CK_ProductCategory_RenewalIncreasePercent]
        CHECK ([RenewalIncreasePercent] IS NULL OR ([RenewalIncreasePercent] >= 0 AND [RenewalIncreasePercent] <= 100));
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Percent added to a subscription''s price when it renews, for every product in this category and its child categories. NULL means inherit from the parent category, then the company''s OrderCompanyPolicy. A subscription or product value overrides it.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'ProductCategory',
    @level2type = N'COLUMN', @level2name = N'RenewalIncreasePercent';
GO

ALTER TABLE [${flyway:defaultSchema}].[Product]
    ADD [RenewalIncreasePercent] DECIMAL(7, 4) NULL
        CONSTRAINT [CK_Product_RenewalIncreasePercent]
        CHECK ([RenewalIncreasePercent] IS NULL OR ([RenewalIncreasePercent] >= 0 AND [RenewalIncreasePercent] <= 100));
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Percent added to a subscription''s price when it renews onto this product. Overrides the product''s category and the company. NULL means inherit from the category and its ancestors, then the company''s OrderCompanyPolicy. A subscription''s own value overrides it.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'Product',
    @level2type = N'COLUMN', @level2name = N'RenewalIncreasePercent';
GO

ALTER TABLE [${flyway:defaultSchema}].[Subscription]
    ADD [RenewalIncreasePercent] DECIMAL(7, 4) NULL
            CONSTRAINT [CK_Subscription_RenewalIncreasePercent]
            CHECK ([RenewalIncreasePercent] IS NULL OR ([RenewalIncreasePercent] >= 0 AND [RenewalIncreasePercent] <= 100)),
        [CarryDiscountOnRenewal] BIT NOT NULL
            CONSTRAINT [DF_Subscription_CarryDiscountOnRenewal] DEFAULT (0);
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Percent added to this subscription''s price when it renews: the contract''s negotiated annual increase. Overrides the product, its category and the company. NULL means inherit from the product, then its category and ancestors, then the company''s OrderCompanyPolicy; NULL everywhere means no increase. Set 0 to renew with no increase where a default would apply.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'Subscription',
    @level2type = N'COLUMN', @level2name = N'RenewalIncreasePercent';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Whether the discount on the term being renewed carries into the renewal. Off by default: a first-term discount lapses and the renewal starts from the undiscounted price. Set it for a discount agreed to continue, such as a multi-year concession.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'Subscription',
    @level2type = N'COLUMN', @level2name = N'CarryDiscountOnRenewal';
GO


















































-- =============================================================================
-- CODEGEN OUTPUT — GENERATED CODE BELOW THIS LINE. DO NOT EDIT BY HAND.
-- This app's own CodeGen SQL (RenewalIncreasePercent on Order Company Policies,
-- Product Categories, Products, Event Products and Subscriptions, and
-- Subscription.CarryDiscountOnRenewal, with their views and CRUD procs) is
-- folded here by scripts/append-codegen.sh.
-- =============================================================================
/* SQL text to insert 5 new entity field(s) */

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '572e3f4c-854e-48bc-b67d-5612876f22d1' OR (EntityID = 'B35DD5C3-9A6B-42D1-9049-297EE45ED2D5' AND Name = 'RenewalIncreasePercent')) BEGIN
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
            '572e3f4c-854e-48bc-b67d-5612876f22d1',
            'B35DD5C3-9A6B-42D1-9049-297EE45ED2D5', -- Entity: MJ_BizApps_Orders: Products
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${mjSchema}].[EntityField] WHERE [EntityID] = 'B35DD5C3-9A6B-42D1-9049-297EE45ED2D5'),
            'RenewalIncreasePercent',
            'Renewal Increase Percent',
            'Percent added to a subscription''s price when it renews onto this product. Overrides the product''s category and the company. NULL means inherit from the category and its ancestors, then the company''s OrderCompanyPolicy. A subscription''s own value overrides it.',
            'decimal',
            5,
            7,
            4,
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '9467356c-a3e3-4aca-b611-348f801fa605' OR (EntityID = 'B0FA90A6-6975-4C5E-ABC7-3AEA97700CC3' AND Name = 'RenewalIncreasePercent')) BEGIN
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
            '9467356c-a3e3-4aca-b611-348f801fa605',
            'B0FA90A6-6975-4C5E-ABC7-3AEA97700CC3', -- Entity: MJ_BizApps_Orders: Product Categories
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${mjSchema}].[EntityField] WHERE [EntityID] = 'B0FA90A6-6975-4C5E-ABC7-3AEA97700CC3'),
            'RenewalIncreasePercent',
            'Renewal Increase Percent',
            'Percent added to a subscription''s price when it renews, for every product in this category and its child categories. NULL means inherit from the parent category, then the company''s OrderCompanyPolicy. A subscription or product value overrides it.',
            'decimal',
            5,
            7,
            4,
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '0c5914c4-3fde-497f-b0bc-8cbb2d8d55db' OR (EntityID = '646F03F8-C718-4DFF-B83D-F90A079C370D' AND Name = 'RenewalIncreasePercent')) BEGIN
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
            '0c5914c4-3fde-497f-b0bc-8cbb2d8d55db',
            '646F03F8-C718-4DFF-B83D-F90A079C370D', -- Entity: MJ_BizApps_Orders: Order Company Policies
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${mjSchema}].[EntityField] WHERE [EntityID] = '646F03F8-C718-4DFF-B83D-F90A079C370D'),
            'RenewalIncreasePercent',
            'Renewal Increase Percent',
            'Percent added to a subscription''s price when it renews, for every product this company sells. The last step of the inheritance walk: a subscription, its product or its product category overrides it. NULL means no increase. The increase applies from the first day of the renewal term, so every invoice in that term carries the same price.',
            'decimal',
            5,
            7,
            4,
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '4bcd5f45-b2bb-494e-9880-18fcb644c952' OR (EntityID = 'E9B55146-3351-440C-AD47-FD4DE05BDA05' AND Name = 'RenewalIncreasePercent')) BEGIN
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
            '4bcd5f45-b2bb-494e-9880-18fcb644c952',
            'E9B55146-3351-440C-AD47-FD4DE05BDA05', -- Entity: MJ_BizApps_Orders: Subscriptions
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${mjSchema}].[EntityField] WHERE [EntityID] = 'E9B55146-3351-440C-AD47-FD4DE05BDA05'),
            'RenewalIncreasePercent',
            'Renewal Increase Percent',
            'Percent added to this subscription''s price when it renews: the contract''s negotiated annual increase. Overrides the product, its category and the company. NULL means inherit from the product, then its category and ancestors, then the company''s OrderCompanyPolicy; NULL everywhere means no increase. Set 0 to renew with no increase where a default would apply.',
            'decimal',
            5,
            7,
            4,
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = 'f2d0ff66-5730-4f55-987a-254fc1fc70fc' OR (EntityID = 'E9B55146-3351-440C-AD47-FD4DE05BDA05' AND Name = 'CarryDiscountOnRenewal')) BEGIN
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
            'f2d0ff66-5730-4f55-987a-254fc1fc70fc',
            'E9B55146-3351-440C-AD47-FD4DE05BDA05', -- Entity: MJ_BizApps_Orders: Subscriptions
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${mjSchema}].[EntityField] WHERE [EntityID] = 'E9B55146-3351-440C-AD47-FD4DE05BDA05'),
            'CarryDiscountOnRenewal',
            'Carry Discount On Renewal',
            'Whether the discount on the term being renewed carries into the renewal. Off by default: a first-term discount lapses and the renewal starts from the undiscounted price. Set it for a discount agreed to continue, such as a multi-year concession.',
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

/* Create IS-A parent field RenewalIncreasePercent on MJ_BizApps_Orders: Event Products */
INSERT INTO [${mjSchema}].[EntityField] (
                  [ID], [EntityID], [Name], [Type], [AllowsNull],
                  [Length], [Precision], [Scale],
                  [Sequence], [IsVirtual], [AllowUpdateAPI],
                  [IsPrimaryKey], [IsUnique],
                  [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES (
                  '1b95ccc9-c160-496a-988d-9bb6b54eeec1', 'B090A662-A97A-4748-B109-2FA716C14651', 'RenewalIncreasePercent',
                  'decimal', 1,
                  5, 7, 4,
                  (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${mjSchema}].[EntityField] WHERE [EntityID] = 'B090A662-A97A-4748-B109-2FA716C14651'), 1, 1, 0, 0,
                  GETUTCDATE(), GETUTCDATE());

/* Update entity timestamp for MJ_BizApps_Orders: Event Products after IS-A field sync */
UPDATE [${mjSchema}].[Entity] SET [__mj_UpdatedAt]=GETUTCDATE() WHERE ID='B090A662-A97A-4748-B109-2FA716C14651';

/* SQL text to update display name for field RenewalIncreasePercent */
UPDATE [${mjSchema}].[EntityField] SET [__mj_UpdatedAt]=GETUTCDATE(), DisplayName = 'Renewal Increase Percent' WHERE ID = '1B95CCC9-C160-496A-988D-9BB6B54EEEC1';

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
    ${mjSchema}_isa_p1.[RenewalIncreasePercent],
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

/* Index for Foreign Keys for OrderCompanyPolicy */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Order Company Policies
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key DefaultPriceListID in table OrderCompanyPolicy
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_OrderCompanyPolicy_DefaultPriceListID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[OrderCompanyPolicy]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_OrderCompanyPolicy_DefaultPriceListID ON [${flyway:defaultSchema}].[OrderCompanyPolicy] ([DefaultPriceListID]);

/* Base View SQL for MJ_BizApps_Orders: Order Company Policies */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Order Company Policies
-- Item: vwOrderCompanyPolicies
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ_BizApps_Orders: Order Company Policies
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  OrderCompanyPolicy
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwOrderCompanyPolicies]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwOrderCompanyPolicies];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwOrderCompanyPolicies]
AS
SELECT
    o.*,
    mjBizAppsOrdersPriceList_DefaultPriceListID.[Name] AS [DefaultPriceList]
FROM
    [${flyway:defaultSchema}].[OrderCompanyPolicy] AS o
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[PriceList] AS mjBizAppsOrdersPriceList_DefaultPriceListID
  ON
    [o].[DefaultPriceListID] = mjBizAppsOrdersPriceList_DefaultPriceListID.[ID]
GO
REVOKE SELECT ON [${flyway:defaultSchema}].[vwOrderCompanyPolicies] FROM [cdp_Developer]
REVOKE SELECT ON [${flyway:defaultSchema}].[vwOrderCompanyPolicies] FROM [cdp_Integration]
REVOKE SELECT ON [${flyway:defaultSchema}].[vwOrderCompanyPolicies] FROM [cdp_UI]
GRANT SELECT ON [${flyway:defaultSchema}].[vwOrderCompanyPolicies] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for MJ_BizApps_Orders: Order Company Policies */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Order Company Policies
-- Item: Permissions for vwOrderCompanyPolicies
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

REVOKE SELECT ON [${flyway:defaultSchema}].[vwOrderCompanyPolicies] FROM [cdp_Developer]
REVOKE SELECT ON [${flyway:defaultSchema}].[vwOrderCompanyPolicies] FROM [cdp_Integration]
REVOKE SELECT ON [${flyway:defaultSchema}].[vwOrderCompanyPolicies] FROM [cdp_UI]
GRANT SELECT ON [${flyway:defaultSchema}].[vwOrderCompanyPolicies] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for MJ_BizApps_Orders: Order Company Policies */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Order Company Policies
-- Item: spCreateOrderCompanyPolicy
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR OrderCompanyPolicy
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateOrderCompanyPolicy]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateOrderCompanyPolicy];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateOrderCompanyPolicy]
    @ID uniqueidentifier = NULL,
    @AllowPromotionStacking bit = NULL,
    @StackingMode nvarchar(20) = NULL,
    @RefuseUnpricedLines bit = NULL,
    @DefaultPriceListID_Clear bit = 0,
    @DefaultPriceListID uniqueidentifier = NULL,
    @DefaultPaymentTermsTypeID_Clear bit = 0,
    @DefaultPaymentTermsTypeID uniqueidentifier = NULL,
    @PricingDriverClass_Clear bit = 0,
    @PricingDriverClass nvarchar(255) = NULL,
    @RenewalIncreasePercent_Clear bit = 0,
    @RenewalIncreasePercent decimal(7, 4) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @ActualID UNIQUEIDENTIFIER = ISNULL(@ID, NEWID())
    INSERT INTO
    [${flyway:defaultSchema}].[OrderCompanyPolicy]
        (
            [AllowPromotionStacking],
                [StackingMode],
                [RefuseUnpricedLines],
                [DefaultPriceListID],
                [DefaultPaymentTermsTypeID],
                [PricingDriverClass],
                [RenewalIncreasePercent],
                [ID]
        )
    VALUES
        (
            ISNULL(@AllowPromotionStacking, 0),
                ISNULL(@StackingMode, 'Sequential'),
                ISNULL(@RefuseUnpricedLines, 1),
                CASE WHEN @DefaultPriceListID_Clear = 1 THEN NULL ELSE ISNULL(@DefaultPriceListID, NULL) END,
                CASE WHEN @DefaultPaymentTermsTypeID_Clear = 1 THEN NULL ELSE ISNULL(@DefaultPaymentTermsTypeID, NULL) END,
                CASE WHEN @PricingDriverClass_Clear = 1 THEN NULL ELSE ISNULL(@PricingDriverClass, NULL) END,
                CASE WHEN @RenewalIncreasePercent_Clear = 1 THEN NULL ELSE ISNULL(@RenewalIncreasePercent, NULL) END,
                @ActualID
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwOrderCompanyPolicies] WHERE [ID] = @ActualID
END
GO
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreateOrderCompanyPolicy] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreateOrderCompanyPolicy] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateOrderCompanyPolicy] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ_BizApps_Orders: Order Company Policies */

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreateOrderCompanyPolicy] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreateOrderCompanyPolicy] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateOrderCompanyPolicy] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for MJ_BizApps_Orders: Order Company Policies */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Order Company Policies
-- Item: spUpdateOrderCompanyPolicy
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR OrderCompanyPolicy
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateOrderCompanyPolicy]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateOrderCompanyPolicy];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateOrderCompanyPolicy]
    @ID uniqueidentifier,
    @AllowPromotionStacking bit = NULL,
    @StackingMode nvarchar(20) = NULL,
    @RefuseUnpricedLines bit = NULL,
    @DefaultPriceListID_Clear bit = 0,
    @DefaultPriceListID uniqueidentifier = NULL,
    @DefaultPaymentTermsTypeID_Clear bit = 0,
    @DefaultPaymentTermsTypeID uniqueidentifier = NULL,
    @PricingDriverClass_Clear bit = 0,
    @PricingDriverClass nvarchar(255) = NULL,
    @RenewalIncreasePercent_Clear bit = 0,
    @RenewalIncreasePercent decimal(7, 4) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[OrderCompanyPolicy]
    SET
        [AllowPromotionStacking] = ISNULL(@AllowPromotionStacking, [AllowPromotionStacking]),
        [StackingMode] = ISNULL(@StackingMode, [StackingMode]),
        [RefuseUnpricedLines] = ISNULL(@RefuseUnpricedLines, [RefuseUnpricedLines]),
        [DefaultPriceListID] = CASE WHEN @DefaultPriceListID_Clear = 1 THEN NULL ELSE ISNULL(@DefaultPriceListID, [DefaultPriceListID]) END,
        [DefaultPaymentTermsTypeID] = CASE WHEN @DefaultPaymentTermsTypeID_Clear = 1 THEN NULL ELSE ISNULL(@DefaultPaymentTermsTypeID, [DefaultPaymentTermsTypeID]) END,
        [PricingDriverClass] = CASE WHEN @PricingDriverClass_Clear = 1 THEN NULL ELSE ISNULL(@PricingDriverClass, [PricingDriverClass]) END,
        [RenewalIncreasePercent] = CASE WHEN @RenewalIncreasePercent_Clear = 1 THEN NULL ELSE ISNULL(@RenewalIncreasePercent, [RenewalIncreasePercent]) END
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwOrderCompanyPolicies] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwOrderCompanyPolicies]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spUpdateOrderCompanyPolicy] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spUpdateOrderCompanyPolicy] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateOrderCompanyPolicy] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the OrderCompanyPolicy table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateOrderCompanyPolicy]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateOrderCompanyPolicy];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateOrderCompanyPolicy
ON [${flyway:defaultSchema}].[OrderCompanyPolicy]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[OrderCompanyPolicy]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[OrderCompanyPolicy] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for MJ_BizApps_Orders: Order Company Policies */

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spUpdateOrderCompanyPolicy] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spUpdateOrderCompanyPolicy] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateOrderCompanyPolicy] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for MJ_BizApps_Orders: Order Company Policies */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Order Company Policies
-- Item: spDeleteOrderCompanyPolicy
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR OrderCompanyPolicy
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteOrderCompanyPolicy]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteOrderCompanyPolicy];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteOrderCompanyPolicy]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[OrderCompanyPolicy]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteOrderCompanyPolicy] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteOrderCompanyPolicy] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteOrderCompanyPolicy] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for MJ_BizApps_Orders: Order Company Policies */

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteOrderCompanyPolicy] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteOrderCompanyPolicy] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteOrderCompanyPolicy] TO [cdp_Developer], [cdp_Integration];

/* Index for Foreign Keys for ProductCategory */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Product Categories
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key CompanyID in table ProductCategory
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_ProductCategory_CompanyID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[ProductCategory]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_ProductCategory_CompanyID ON [${flyway:defaultSchema}].[ProductCategory] ([CompanyID]);

-- Index for foreign key ParentProductCategoryID in table ProductCategory
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_ProductCategory_ParentProductCategoryID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[ProductCategory]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_ProductCategory_ParentProductCategoryID ON [${flyway:defaultSchema}].[ProductCategory] ([ParentProductCategoryID]);

/* Hierarchy Metadata Function SQL for MJ_BizApps_Orders: Product Categories.ParentProductCategoryID */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Product Categories
-- Item: fnProductCategoryParentProductCategoryID_GetHierarchyMeta
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
------------------------------------------------------------
----- HIERARCHY METADATA FUNCTION FOR: [ProductCategory].[ParentProductCategoryID]
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[fnProductCategoryParentProductCategoryID_GetHierarchyMeta]', 'IF') IS NOT NULL
    DROP FUNCTION [${flyway:defaultSchema}].[fnProductCategoryParentProductCategoryID_GetHierarchyMeta];
GO

CREATE FUNCTION [${flyway:defaultSchema}].[fnProductCategoryParentProductCategoryID_GetHierarchyMeta]
(
    @RecordID uniqueidentifier,
    @ParentID uniqueidentifier
)
RETURNS TABLE
AS
RETURN
(
    WITH CTE_Ancestors AS (
        SELECT
            [ID],
            [ParentProductCategoryID],
            0 AS [Depth],
            CAST('/' + CAST([ID] AS NVARCHAR(36)) + '/' AS NVARCHAR(MAX)) AS [Path]
        FROM
            [${flyway:defaultSchema}].[ProductCategory]
        WHERE
            [ID] = @RecordID

        UNION ALL

        SELECT
            p.[ID],
            p.[ParentProductCategoryID],
            c.[Depth] + 1 AS [Depth],
            CAST('/' + CAST(p.[ID] AS NVARCHAR(36)) + c.[Path] AS NVARCHAR(MAX)) AS [Path]
        FROM
            [${flyway:defaultSchema}].[ProductCategory] p
        INNER JOIN
            CTE_Ancestors c ON p.[ID] = c.[ParentProductCategoryID]
        WHERE
            c.[Depth] < 100
    )
    SELECT TOP 1
        a.[ID] AS [RootID],
        (SELECT MAX([Depth]) FROM CTE_Ancestors) AS [Depth],
        (SELECT TOP 1 [Path] FROM CTE_Ancestors ORDER BY [Depth] DESC) AS [Path],
        CAST(CASE WHEN EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[ProductCategory] WHERE [ParentProductCategoryID] = @RecordID) THEN 0 ELSE 1 END AS BIT) AS [IsLeaf],
        (SELECT COUNT(1) FROM [${flyway:defaultSchema}].[ProductCategory] WHERE [ParentProductCategoryID] = @RecordID) AS [ChildCount]
    FROM
        CTE_Ancestors a
    WHERE
        a.[ParentProductCategoryID] IS NULL OR @ParentID IS NULL
    ORDER BY
        a.[Depth] DESC
);
GO

/* Descendants Traversal Function SQL for MJ_BizApps_Orders: Product Categories.ParentProductCategoryID */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Product Categories
-- Item: fnProductCategoryParentProductCategoryID_GetDescendants
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
------------------------------------------------------------
----- DESCENDANTS FUNCTION FOR: [ProductCategory].[ParentProductCategoryID]
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[fnProductCategoryParentProductCategoryID_GetDescendants]', 'IF') IS NOT NULL
    DROP FUNCTION [${flyway:defaultSchema}].[fnProductCategoryParentProductCategoryID_GetDescendants];
GO

CREATE FUNCTION [${flyway:defaultSchema}].[fnProductCategoryParentProductCategoryID_GetDescendants]
(
    @RootID uniqueidentifier,
    @MaxDepth INT = NULL
)
RETURNS TABLE
AS
RETURN
(
    WITH CTE_Descendants AS (
        SELECT
            [ID],
            [ParentProductCategoryID],
            0 AS [RelativeDepth],
            CAST('/' + CAST([ID] AS NVARCHAR(36)) + '/' AS NVARCHAR(MAX)) AS [Path]
        FROM
            [${flyway:defaultSchema}].[ProductCategory]
        WHERE
            [ID] = @RootID

        UNION ALL

        SELECT
            c.[ID],
            c.[ParentProductCategoryID],
            p.[RelativeDepth] + 1 AS [RelativeDepth],
            CAST(p.[Path] + CAST(c.[ID] AS NVARCHAR(36)) + '/' AS NVARCHAR(MAX)) AS [Path]
        FROM
            [${flyway:defaultSchema}].[ProductCategory] c
        INNER JOIN
            CTE_Descendants p ON c.[ParentProductCategoryID] = p.[ID]
        WHERE
            (@MaxDepth IS NULL OR p.[RelativeDepth] < @MaxDepth)
            AND p.[RelativeDepth] < 100
    )
    SELECT
        d.[ID] AS [ID],
        d.[RelativeDepth] AS [Depth],
        d.[Path],
        CAST(CASE WHEN EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[ProductCategory] WHERE [ParentProductCategoryID] = d.[ID]) THEN 0 ELSE 1 END AS BIT) AS [IsLeaf],
        (SELECT COUNT(1) FROM [${flyway:defaultSchema}].[ProductCategory] WHERE [ParentProductCategoryID] = d.[ID]) AS [ChildCount]
    FROM
        CTE_Descendants d
);
GO

/* Ancestors Traversal Function SQL for MJ_BizApps_Orders: Product Categories.ParentProductCategoryID */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Product Categories
-- Item: fnProductCategoryParentProductCategoryID_GetAncestors
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
------------------------------------------------------------
----- ANCESTORS FUNCTION FOR: [ProductCategory].[ParentProductCategoryID]
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[fnProductCategoryParentProductCategoryID_GetAncestors]', 'IF') IS NOT NULL
    DROP FUNCTION [${flyway:defaultSchema}].[fnProductCategoryParentProductCategoryID_GetAncestors];
GO

CREATE FUNCTION [${flyway:defaultSchema}].[fnProductCategoryParentProductCategoryID_GetAncestors]
(
    @RecordID uniqueidentifier
)
RETURNS TABLE
AS
RETURN
(
    WITH CTE_Ancestors AS (
        SELECT
            [ID],
            [ParentProductCategoryID],
            0 AS [LevelUp],
            CAST('/' + CAST([ID] AS NVARCHAR(36)) + '/' AS NVARCHAR(MAX)) AS [Path]
        FROM
            [${flyway:defaultSchema}].[ProductCategory]
        WHERE
            [ID] = @RecordID

        UNION ALL

        SELECT
            p.[ID],
            p.[ParentProductCategoryID],
            c.[LevelUp] + 1 AS [LevelUp],
            CAST('/' + CAST(p.[ID] AS NVARCHAR(36)) + c.[Path] AS NVARCHAR(MAX)) AS [Path]
        FROM
            [${flyway:defaultSchema}].[ProductCategory] p
        INNER JOIN
            CTE_Ancestors c ON p.[ID] = c.[ParentProductCategoryID]
        WHERE
            c.[LevelUp] < 100
    )
    SELECT
        a.[ID] AS [ID],
        a.[LevelUp],
        a.[Path]
    FROM
        CTE_Ancestors a
);
GO

/* Root ID Function SQL for MJ_BizApps_Orders: Product Categories.ParentProductCategoryID */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Product Categories
-- Item: fnProductCategoryParentProductCategoryID_GetRootID
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
------------------------------------------------------------
----- ROOT ID FUNCTION FOR: [ProductCategory].[ParentProductCategoryID]
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[fnProductCategoryParentProductCategoryID_GetRootID]', 'IF') IS NOT NULL
    DROP FUNCTION [${flyway:defaultSchema}].[fnProductCategoryParentProductCategoryID_GetRootID];
GO

CREATE FUNCTION [${flyway:defaultSchema}].[fnProductCategoryParentProductCategoryID_GetRootID]
(
    @RecordID uniqueidentifier,
    @ParentID uniqueidentifier
)
RETURNS TABLE
AS
RETURN
(
    WITH CTE_RootParent AS (
        SELECT
            [ID],
            [ParentProductCategoryID],
            [ID] AS [RootParentID],
            0 AS [Depth]
        FROM
            [${flyway:defaultSchema}].[ProductCategory]
        WHERE
            [ID] = COALESCE(@ParentID, @RecordID)

        UNION ALL

        SELECT
            c.[ID],
            c.[ParentProductCategoryID],
            c.[ID] AS [RootParentID],
            p.[Depth] + 1 AS [Depth]
        FROM
            [${flyway:defaultSchema}].[ProductCategory] c
        INNER JOIN
            CTE_RootParent p ON c.[ID] = p.[ParentProductCategoryID]
        WHERE
            p.[Depth] < 100
    )
    SELECT TOP 1
        [RootParentID] AS RootID
    FROM
        CTE_RootParent
    WHERE
        [ParentProductCategoryID] IS NULL
    ORDER BY
        [RootParentID]
);
GO

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
    @RenewalIncreasePercent decimal(7, 4) = NULL
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
                [RenewalIncreasePercent]
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
                CASE WHEN @RenewalIncreasePercent_Clear = 1 THEN NULL ELSE ISNULL(@RenewalIncreasePercent, NULL) END
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
                [RenewalIncreasePercent]
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
                CASE WHEN @RenewalIncreasePercent_Clear = 1 THEN NULL ELSE ISNULL(@RenewalIncreasePercent, NULL) END
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
    @RenewalIncreasePercent decimal(7, 4) = NULL
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
        [RenewalIncreasePercent] = CASE WHEN @RenewalIncreasePercent_Clear = 1 THEN NULL ELSE ISNULL(@RenewalIncreasePercent, [RenewalIncreasePercent]) END
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
    mjBizAppsOrdersSubscriptionType_SubscriptionTypeID.[Name] AS [SubscriptionType]
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
    @RenewalIncreasePercent_Clear bit = 0,
    @RenewalIncreasePercent decimal(7, 4) = NULL
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
                [RenewalIncreasePercent]
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
                CASE WHEN @RenewalIncreasePercent_Clear = 1 THEN NULL ELSE ISNULL(@RenewalIncreasePercent, NULL) END
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
                [RenewalIncreasePercent]
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
                CASE WHEN @RenewalIncreasePercent_Clear = 1 THEN NULL ELSE ISNULL(@RenewalIncreasePercent, NULL) END
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
    @RenewalIncreasePercent_Clear bit = 0,
    @RenewalIncreasePercent decimal(7, 4) = NULL
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
        [RenewalIncreasePercent] = CASE WHEN @RenewalIncreasePercent_Clear = 1 THEN NULL ELSE ISNULL(@RenewalIncreasePercent, [RenewalIncreasePercent]) END
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

/* Index for Foreign Keys for Subscription */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Subscriptions
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key CompanyID in table Subscription
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_Subscription_CompanyID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[Subscription]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_Subscription_CompanyID ON [${flyway:defaultSchema}].[Subscription] ([CompanyID]);

-- Index for foreign key OrderLineID in table Subscription
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_Subscription_OrderLineID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[Subscription]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_Subscription_OrderLineID ON [${flyway:defaultSchema}].[Subscription] ([OrderLineID]);

-- Index for foreign key SubscriptionTypeID in table Subscription
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_Subscription_SubscriptionTypeID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[Subscription]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_Subscription_SubscriptionTypeID ON [${flyway:defaultSchema}].[Subscription] ([SubscriptionTypeID]);

-- Index for foreign key ProductID in table Subscription
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_Subscription_ProductID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[Subscription]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_Subscription_ProductID ON [${flyway:defaultSchema}].[Subscription] ([ProductID]);

-- Index for foreign key HolderOrganizationID in table Subscription
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_Subscription_HolderOrganizationID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[Subscription]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_Subscription_HolderOrganizationID ON [${flyway:defaultSchema}].[Subscription] ([HolderOrganizationID]);

-- Index for foreign key BeneficiaryPersonID in table Subscription
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_Subscription_BeneficiaryPersonID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[Subscription]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_Subscription_BeneficiaryPersonID ON [${flyway:defaultSchema}].[Subscription] ([BeneficiaryPersonID]);

-- Index for foreign key PaymentProviderID in table Subscription
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_Subscription_PaymentProviderID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[Subscription]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_Subscription_PaymentProviderID ON [${flyway:defaultSchema}].[Subscription] ([PaymentProviderID]);

-- Index for foreign key MigratesFromSubscriptionID in table Subscription
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_Subscription_MigratesFromSubscriptionID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[Subscription]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_Subscription_MigratesFromSubscriptionID ON [${flyway:defaultSchema}].[Subscription] ([MigratesFromSubscriptionID]);

-- Index for foreign key MigratesToSubscriptionID in table Subscription
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_Subscription_MigratesToSubscriptionID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[Subscription]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_Subscription_MigratesToSubscriptionID ON [${flyway:defaultSchema}].[Subscription] ([MigratesToSubscriptionID]);

-- Index for foreign key DefaultCustomerPaymentMethodID in table Subscription
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_Subscription_DefaultCustomerPaymentMethodID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[Subscription]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_Subscription_DefaultCustomerPaymentMethodID ON [${flyway:defaultSchema}].[Subscription] ([DefaultCustomerPaymentMethodID]);

/* Base View SQL for MJ_BizApps_Orders: Subscriptions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Subscriptions
-- Item: vwSubscriptions
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ_BizApps_Orders: Subscriptions
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  Subscription
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwSubscriptions]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwSubscriptions];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwSubscriptions]
AS
SELECT
    s.*,
    MJCompany_CompanyID.[Name] AS [Company],
    mjBizAppsOrdersSubscriptionType_SubscriptionTypeID.[Name] AS [SubscriptionType],
    mjBizAppsOrdersProduct_ProductID.[Name] AS [Product],
    mjBizAppsCommonOrganization_HolderOrganizationID.[Name] AS [HolderOrganization],
    mjBizAppsCommonPerson_BeneficiaryPersonID.[DisplayName] AS [BeneficiaryPerson],
    mjBizAppsOrdersPaymentProvider_PaymentProviderID.[Name] AS [PaymentProvider],
    mjBizAppsOrdersSubscription_MigratesFromSubscriptionID.[SubscriptionNumber] AS [MigratesFromSubscription],
    mjBizAppsOrdersSubscription_MigratesToSubscriptionID.[SubscriptionNumber] AS [MigratesToSubscription],
    mjBizAppsOrdersCustomerPaymentMethod_DefaultCustomerPaymentMethodID.[Nickname] AS [DefaultCustomerPaymentMethod]
FROM
    [${flyway:defaultSchema}].[Subscription] AS s
INNER JOIN
    [${mjSchema}].[Company] AS MJCompany_CompanyID
  ON
    [s].[CompanyID] = MJCompany_CompanyID.[ID]
INNER JOIN
    [${flyway:defaultSchema}].[SubscriptionType] AS mjBizAppsOrdersSubscriptionType_SubscriptionTypeID
  ON
    [s].[SubscriptionTypeID] = mjBizAppsOrdersSubscriptionType_SubscriptionTypeID.[ID]
INNER JOIN
    [${flyway:defaultSchema}].[Product] AS mjBizAppsOrdersProduct_ProductID
  ON
    [s].[ProductID] = mjBizAppsOrdersProduct_ProductID.[ID]
LEFT OUTER JOIN
    [${mjSchema}_BizAppsCommon].[Organization] AS mjBizAppsCommonOrganization_HolderOrganizationID
  ON
    [s].[HolderOrganizationID] = mjBizAppsCommonOrganization_HolderOrganizationID.[ID]
LEFT OUTER JOIN
    [${mjSchema}_BizAppsCommon].[Person] AS mjBizAppsCommonPerson_BeneficiaryPersonID
  ON
    [s].[BeneficiaryPersonID] = mjBizAppsCommonPerson_BeneficiaryPersonID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[PaymentProvider] AS mjBizAppsOrdersPaymentProvider_PaymentProviderID
  ON
    [s].[PaymentProviderID] = mjBizAppsOrdersPaymentProvider_PaymentProviderID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[Subscription] AS mjBizAppsOrdersSubscription_MigratesFromSubscriptionID
  ON
    [s].[MigratesFromSubscriptionID] = mjBizAppsOrdersSubscription_MigratesFromSubscriptionID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[Subscription] AS mjBizAppsOrdersSubscription_MigratesToSubscriptionID
  ON
    [s].[MigratesToSubscriptionID] = mjBizAppsOrdersSubscription_MigratesToSubscriptionID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[CustomerPaymentMethod] AS mjBizAppsOrdersCustomerPaymentMethod_DefaultCustomerPaymentMethodID
  ON
    [s].[DefaultCustomerPaymentMethodID] = mjBizAppsOrdersCustomerPaymentMethod_DefaultCustomerPaymentMethodID.[ID]
GO
REVOKE SELECT ON [${flyway:defaultSchema}].[vwSubscriptions] FROM [cdp_Developer]
REVOKE SELECT ON [${flyway:defaultSchema}].[vwSubscriptions] FROM [cdp_Integration]
REVOKE SELECT ON [${flyway:defaultSchema}].[vwSubscriptions] FROM [cdp_UI]
GRANT SELECT ON [${flyway:defaultSchema}].[vwSubscriptions] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for MJ_BizApps_Orders: Subscriptions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Subscriptions
-- Item: Permissions for vwSubscriptions
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

REVOKE SELECT ON [${flyway:defaultSchema}].[vwSubscriptions] FROM [cdp_Developer]
REVOKE SELECT ON [${flyway:defaultSchema}].[vwSubscriptions] FROM [cdp_Integration]
REVOKE SELECT ON [${flyway:defaultSchema}].[vwSubscriptions] FROM [cdp_UI]
GRANT SELECT ON [${flyway:defaultSchema}].[vwSubscriptions] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for MJ_BizApps_Orders: Subscriptions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Subscriptions
-- Item: spCreateSubscription
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR Subscription
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateSubscription]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateSubscription];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateSubscription]
    @ID uniqueidentifier = NULL,
    @SubscriptionNumber nvarchar(40),
    @CompanyID uniqueidentifier,
    @OrderLineID uniqueidentifier,
    @SubscriptionTypeID uniqueidentifier,
    @ProductID uniqueidentifier,
    @HolderOrganizationID_Clear bit = 0,
    @HolderOrganizationID uniqueidentifier = NULL,
    @BeneficiaryPersonID_Clear bit = 0,
    @BeneficiaryPersonID uniqueidentifier = NULL,
    @Status nvarchar(20),
    @StartDate date,
    @TrialEndDate_Clear bit = 0,
    @TrialEndDate date = NULL,
    @CanceledAt_Clear bit = 0,
    @CanceledAt datetimeoffset = NULL,
    @EndDate_Clear bit = 0,
    @EndDate date = NULL,
    @AutoRenew bit = NULL,
    @RenewalLeadDays_Clear bit = 0,
    @RenewalLeadDays int = NULL,
    @PaymentProviderID_Clear bit = 0,
    @PaymentProviderID uniqueidentifier = NULL,
    @ProviderSubscriptionID_Clear bit = 0,
    @ProviderSubscriptionID nvarchar(100) = NULL,
    @MigratesFromSubscriptionID_Clear bit = 0,
    @MigratesFromSubscriptionID uniqueidentifier = NULL,
    @MigratesToSubscriptionID_Clear bit = 0,
    @MigratesToSubscriptionID uniqueidentifier = NULL,
    @DefaultCustomerPaymentMethodID_Clear bit = 0,
    @DefaultCustomerPaymentMethodID uniqueidentifier = NULL,
    @RenewalIncreasePercent_Clear bit = 0,
    @RenewalIncreasePercent decimal(7, 4) = NULL,
    @CarryDiscountOnRenewal bit = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)

    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[Subscription]
            (
                [ID],
                [SubscriptionNumber],
                [CompanyID],
                [OrderLineID],
                [SubscriptionTypeID],
                [ProductID],
                [HolderOrganizationID],
                [BeneficiaryPersonID],
                [Status],
                [StartDate],
                [TrialEndDate],
                [CanceledAt],
                [EndDate],
                [AutoRenew],
                [RenewalLeadDays],
                [PaymentProviderID],
                [ProviderSubscriptionID],
                [MigratesFromSubscriptionID],
                [MigratesToSubscriptionID],
                [DefaultCustomerPaymentMethodID],
                [RenewalIncreasePercent],
                [CarryDiscountOnRenewal]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @SubscriptionNumber,
                @CompanyID,
                @OrderLineID,
                @SubscriptionTypeID,
                @ProductID,
                CASE WHEN @HolderOrganizationID_Clear = 1 THEN NULL ELSE ISNULL(@HolderOrganizationID, NULL) END,
                CASE WHEN @BeneficiaryPersonID_Clear = 1 THEN NULL ELSE ISNULL(@BeneficiaryPersonID, NULL) END,
                @Status,
                @StartDate,
                CASE WHEN @TrialEndDate_Clear = 1 THEN NULL ELSE ISNULL(@TrialEndDate, NULL) END,
                CASE WHEN @CanceledAt_Clear = 1 THEN NULL ELSE ISNULL(@CanceledAt, NULL) END,
                CASE WHEN @EndDate_Clear = 1 THEN NULL ELSE ISNULL(@EndDate, NULL) END,
                ISNULL(@AutoRenew, 1),
                CASE WHEN @RenewalLeadDays_Clear = 1 THEN NULL ELSE ISNULL(@RenewalLeadDays, NULL) END,
                CASE WHEN @PaymentProviderID_Clear = 1 THEN NULL ELSE ISNULL(@PaymentProviderID, NULL) END,
                CASE WHEN @ProviderSubscriptionID_Clear = 1 THEN NULL ELSE ISNULL(@ProviderSubscriptionID, NULL) END,
                CASE WHEN @MigratesFromSubscriptionID_Clear = 1 THEN NULL ELSE ISNULL(@MigratesFromSubscriptionID, NULL) END,
                CASE WHEN @MigratesToSubscriptionID_Clear = 1 THEN NULL ELSE ISNULL(@MigratesToSubscriptionID, NULL) END,
                CASE WHEN @DefaultCustomerPaymentMethodID_Clear = 1 THEN NULL ELSE ISNULL(@DefaultCustomerPaymentMethodID, NULL) END,
                CASE WHEN @RenewalIncreasePercent_Clear = 1 THEN NULL ELSE ISNULL(@RenewalIncreasePercent, NULL) END,
                ISNULL(@CarryDiscountOnRenewal, 0)
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[Subscription]
            (
                [SubscriptionNumber],
                [CompanyID],
                [OrderLineID],
                [SubscriptionTypeID],
                [ProductID],
                [HolderOrganizationID],
                [BeneficiaryPersonID],
                [Status],
                [StartDate],
                [TrialEndDate],
                [CanceledAt],
                [EndDate],
                [AutoRenew],
                [RenewalLeadDays],
                [PaymentProviderID],
                [ProviderSubscriptionID],
                [MigratesFromSubscriptionID],
                [MigratesToSubscriptionID],
                [DefaultCustomerPaymentMethodID],
                [RenewalIncreasePercent],
                [CarryDiscountOnRenewal]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @SubscriptionNumber,
                @CompanyID,
                @OrderLineID,
                @SubscriptionTypeID,
                @ProductID,
                CASE WHEN @HolderOrganizationID_Clear = 1 THEN NULL ELSE ISNULL(@HolderOrganizationID, NULL) END,
                CASE WHEN @BeneficiaryPersonID_Clear = 1 THEN NULL ELSE ISNULL(@BeneficiaryPersonID, NULL) END,
                @Status,
                @StartDate,
                CASE WHEN @TrialEndDate_Clear = 1 THEN NULL ELSE ISNULL(@TrialEndDate, NULL) END,
                CASE WHEN @CanceledAt_Clear = 1 THEN NULL ELSE ISNULL(@CanceledAt, NULL) END,
                CASE WHEN @EndDate_Clear = 1 THEN NULL ELSE ISNULL(@EndDate, NULL) END,
                ISNULL(@AutoRenew, 1),
                CASE WHEN @RenewalLeadDays_Clear = 1 THEN NULL ELSE ISNULL(@RenewalLeadDays, NULL) END,
                CASE WHEN @PaymentProviderID_Clear = 1 THEN NULL ELSE ISNULL(@PaymentProviderID, NULL) END,
                CASE WHEN @ProviderSubscriptionID_Clear = 1 THEN NULL ELSE ISNULL(@ProviderSubscriptionID, NULL) END,
                CASE WHEN @MigratesFromSubscriptionID_Clear = 1 THEN NULL ELSE ISNULL(@MigratesFromSubscriptionID, NULL) END,
                CASE WHEN @MigratesToSubscriptionID_Clear = 1 THEN NULL ELSE ISNULL(@MigratesToSubscriptionID, NULL) END,
                CASE WHEN @DefaultCustomerPaymentMethodID_Clear = 1 THEN NULL ELSE ISNULL(@DefaultCustomerPaymentMethodID, NULL) END,
                CASE WHEN @RenewalIncreasePercent_Clear = 1 THEN NULL ELSE ISNULL(@RenewalIncreasePercent, NULL) END,
                ISNULL(@CarryDiscountOnRenewal, 0)
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwSubscriptions] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreateSubscription] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreateSubscription] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateSubscription] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ_BizApps_Orders: Subscriptions */

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreateSubscription] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreateSubscription] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateSubscription] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for MJ_BizApps_Orders: Subscriptions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Subscriptions
-- Item: spUpdateSubscription
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR Subscription
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateSubscription]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateSubscription];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateSubscription]
    @ID uniqueidentifier,
    @SubscriptionNumber nvarchar(40) = NULL,
    @CompanyID uniqueidentifier = NULL,
    @OrderLineID uniqueidentifier = NULL,
    @SubscriptionTypeID uniqueidentifier = NULL,
    @ProductID uniqueidentifier = NULL,
    @HolderOrganizationID_Clear bit = 0,
    @HolderOrganizationID uniqueidentifier = NULL,
    @BeneficiaryPersonID_Clear bit = 0,
    @BeneficiaryPersonID uniqueidentifier = NULL,
    @Status nvarchar(20) = NULL,
    @StartDate date = NULL,
    @TrialEndDate_Clear bit = 0,
    @TrialEndDate date = NULL,
    @CanceledAt_Clear bit = 0,
    @CanceledAt datetimeoffset = NULL,
    @EndDate_Clear bit = 0,
    @EndDate date = NULL,
    @AutoRenew bit = NULL,
    @RenewalLeadDays_Clear bit = 0,
    @RenewalLeadDays int = NULL,
    @PaymentProviderID_Clear bit = 0,
    @PaymentProviderID uniqueidentifier = NULL,
    @ProviderSubscriptionID_Clear bit = 0,
    @ProviderSubscriptionID nvarchar(100) = NULL,
    @MigratesFromSubscriptionID_Clear bit = 0,
    @MigratesFromSubscriptionID uniqueidentifier = NULL,
    @MigratesToSubscriptionID_Clear bit = 0,
    @MigratesToSubscriptionID uniqueidentifier = NULL,
    @DefaultCustomerPaymentMethodID_Clear bit = 0,
    @DefaultCustomerPaymentMethodID uniqueidentifier = NULL,
    @RenewalIncreasePercent_Clear bit = 0,
    @RenewalIncreasePercent decimal(7, 4) = NULL,
    @CarryDiscountOnRenewal bit = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[Subscription]
    SET
        [SubscriptionNumber] = ISNULL(@SubscriptionNumber, [SubscriptionNumber]),
        [CompanyID] = ISNULL(@CompanyID, [CompanyID]),
        [OrderLineID] = ISNULL(@OrderLineID, [OrderLineID]),
        [SubscriptionTypeID] = ISNULL(@SubscriptionTypeID, [SubscriptionTypeID]),
        [ProductID] = ISNULL(@ProductID, [ProductID]),
        [HolderOrganizationID] = CASE WHEN @HolderOrganizationID_Clear = 1 THEN NULL ELSE ISNULL(@HolderOrganizationID, [HolderOrganizationID]) END,
        [BeneficiaryPersonID] = CASE WHEN @BeneficiaryPersonID_Clear = 1 THEN NULL ELSE ISNULL(@BeneficiaryPersonID, [BeneficiaryPersonID]) END,
        [Status] = ISNULL(@Status, [Status]),
        [StartDate] = ISNULL(@StartDate, [StartDate]),
        [TrialEndDate] = CASE WHEN @TrialEndDate_Clear = 1 THEN NULL ELSE ISNULL(@TrialEndDate, [TrialEndDate]) END,
        [CanceledAt] = CASE WHEN @CanceledAt_Clear = 1 THEN NULL ELSE ISNULL(@CanceledAt, [CanceledAt]) END,
        [EndDate] = CASE WHEN @EndDate_Clear = 1 THEN NULL ELSE ISNULL(@EndDate, [EndDate]) END,
        [AutoRenew] = ISNULL(@AutoRenew, [AutoRenew]),
        [RenewalLeadDays] = CASE WHEN @RenewalLeadDays_Clear = 1 THEN NULL ELSE ISNULL(@RenewalLeadDays, [RenewalLeadDays]) END,
        [PaymentProviderID] = CASE WHEN @PaymentProviderID_Clear = 1 THEN NULL ELSE ISNULL(@PaymentProviderID, [PaymentProviderID]) END,
        [ProviderSubscriptionID] = CASE WHEN @ProviderSubscriptionID_Clear = 1 THEN NULL ELSE ISNULL(@ProviderSubscriptionID, [ProviderSubscriptionID]) END,
        [MigratesFromSubscriptionID] = CASE WHEN @MigratesFromSubscriptionID_Clear = 1 THEN NULL ELSE ISNULL(@MigratesFromSubscriptionID, [MigratesFromSubscriptionID]) END,
        [MigratesToSubscriptionID] = CASE WHEN @MigratesToSubscriptionID_Clear = 1 THEN NULL ELSE ISNULL(@MigratesToSubscriptionID, [MigratesToSubscriptionID]) END,
        [DefaultCustomerPaymentMethodID] = CASE WHEN @DefaultCustomerPaymentMethodID_Clear = 1 THEN NULL ELSE ISNULL(@DefaultCustomerPaymentMethodID, [DefaultCustomerPaymentMethodID]) END,
        [RenewalIncreasePercent] = CASE WHEN @RenewalIncreasePercent_Clear = 1 THEN NULL ELSE ISNULL(@RenewalIncreasePercent, [RenewalIncreasePercent]) END,
        [CarryDiscountOnRenewal] = ISNULL(@CarryDiscountOnRenewal, [CarryDiscountOnRenewal])
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwSubscriptions] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwSubscriptions]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spUpdateSubscription] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spUpdateSubscription] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateSubscription] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the Subscription table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateSubscription]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateSubscription];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateSubscription
ON [${flyway:defaultSchema}].[Subscription]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[Subscription]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[Subscription] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for MJ_BizApps_Orders: Subscriptions */

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spUpdateSubscription] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spUpdateSubscription] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateSubscription] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for MJ_BizApps_Orders: Subscriptions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Subscriptions
-- Item: spDeleteSubscription
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR Subscription
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteSubscription]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteSubscription];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteSubscription]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[Subscription]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteSubscription] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteSubscription] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteSubscription] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for MJ_BizApps_Orders: Subscriptions */

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteSubscription] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteSubscription] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteSubscription] TO [cdp_Developer], [cdp_Integration];

