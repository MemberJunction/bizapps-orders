-- =============================================================================
-- V202610221105 — Provider-billed subscriptions: a gateway that bills a
--                 subscription itself, and Orders' renewal jobs leaving it alone
-- =============================================================================
-- Orders renews a subscription itself: Spawn Renewals places the renewal order
-- and Charge Renewals charges the renewal card. A gateway such as Stripe can
-- instead bill the subscription on its own schedule and send its own receipts.
-- When it does, Orders must not also renew it, or the customer pays twice.
--
-- Three facts, each kept in one place:
--
--   PaymentProviderType.SupportsSubscriptionBilling  the gateway CAN bill a
--       subscription itself. A property of the gateway, beside the other
--       Supports* capabilities. Set for Stripe below.
--   PaymentProvider.BillsSubscriptions               this account DOES bill the
--       auto-renewing subscriptions sold through it. Off for every existing
--       account; a host turns it on per account. It governs creating new
--       gateway subscriptions only.
--   Subscription.ProviderSubscriptionID IS NOT NULL  the gateway named by
--       Subscription.PaymentProviderID bills this subscription (the column's
--       documented meaning). The renewal jobs skip on this alone, never on the
--       switch: turning an account's switch off later must not make Orders
--       charge subscriptions the gateway still bills.
--
-- The index makes a gateway subscription belong to at most one Orders
-- subscription per provider account, and gives the webhook and import lookups
-- by (provider, id) an index; the CHECK makes an id always name its provider.
--
-- PaymentProviderPrice.UseForNewSubscriptions marks the one price a new gateway
-- subscription to a product is created on. A product may keep several active
-- prices (a legacy one beside the current one) so unmatched charges at either
-- still map to it; only one active row per provider and product may be flagged.
--
-- Existing rows: every new column defaults to 0, no subscription carries a
-- provider id before this ships, and the flag starts unset, so the CHECK and
-- both indexes hold on existing data.
--
-- Hand-written DDL here is PLAIN: no existence guards. Migrations run once, in order.
--
-- CodeGen output for this app is folded below the banner at the end of this file.
-- =============================================================================

ALTER TABLE [${flyway:defaultSchema}].[PaymentProviderType]
    ADD [SupportsSubscriptionBilling] BIT NOT NULL CONSTRAINT [DF_PaymentProviderType_SupportsSubscriptionBilling] DEFAULT 0;
GO

-- Stripe Billing bills subscriptions. Every host already has the Stripe type row from an earlier
-- Metadata_Sync (which creates seed rows and never updates them), so only a migration can set it.
UPDATE [${flyway:defaultSchema}].[PaymentProviderType]
SET [SupportsSubscriptionBilling] = 1
WHERE [Code] = N'Stripe';
GO

ALTER TABLE [${flyway:defaultSchema}].[PaymentProvider]
    ADD [BillsSubscriptions] BIT NOT NULL CONSTRAINT [DF_PaymentProvider_BillsSubscriptions] DEFAULT 0;
GO

ALTER TABLE [${flyway:defaultSchema}].[Subscription]
    ADD CONSTRAINT [CK_Subscription_ProviderSubscriptionHasProvider]
        CHECK ([ProviderSubscriptionID] IS NULL OR [PaymentProviderID] IS NOT NULL);
GO

CREATE UNIQUE NONCLUSTERED INDEX [UQ_Subscription_ProviderSubscriptionID]
    ON [${flyway:defaultSchema}].[Subscription] ([PaymentProviderID], [ProviderSubscriptionID])
    WHERE [ProviderSubscriptionID] IS NOT NULL;
GO

ALTER TABLE [${flyway:defaultSchema}].[PaymentProviderPrice]
    ADD [UseForNewSubscriptions] BIT NOT NULL CONSTRAINT [DF_PaymentProviderPrice_UseForNewSubscriptions] DEFAULT 0;
GO

CREATE UNIQUE NONCLUSTERED INDEX [UQ_PaymentProviderPrice_NewSubscriptionProduct]
    ON [${flyway:defaultSchema}].[PaymentProviderPrice] ([PaymentProviderID], [ProductID])
    WHERE [UseForNewSubscriptions] = 1 AND [IsActive] = 1;
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Whether the gateway can bill a subscription itself: charge the card each period and send its own receipts. Orders creates a gateway subscription only for a provider whose type supports it and whose account has BillsSubscriptions set.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'PaymentProviderType',
    @level2type = N'COLUMN', @level2name = N'SupportsSubscriptionBilling';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Whether this account bills the auto-renewing subscriptions sold through it. When set and the type supports it, Orders creates a gateway subscription after the first payment, and the gateway charges each renewal. Turning it off stops new ones only: a subscription already billed by the gateway keeps being skipped by Orders'' renewal jobs.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'PaymentProvider',
    @level2type = N'COLUMN', @level2name = N'BillsSubscriptions';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The price a new gateway-billed subscription to this product is created on. At most one active row per provider and product. Other active rows still map charges to the product (unmatched charges) but are never used for new subscriptions.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'PaymentProviderPrice',
    @level2type = N'COLUMN', @level2name = N'UseForNewSubscriptions';
GO

EXEC sp_updateextendedproperty
    @name = N'MS_Description',
    @value = N'The gateway''s id for a subscription it bills (for Stripe, sub_...). When set, the gateway named by PaymentProviderID charges every renewal and Orders'' renewal jobs skip the subscription; NULL means Orders renews it.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'Subscription',
    @level2type = N'COLUMN', @level2name = N'ProviderSubscriptionID';
GO

-- PaymentProviderID had no description, so it is added rather than updated.
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The payment provider that bills this subscription. Set only with ProviderSubscriptionID; NULL when Orders bills it.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'Subscription',
    @level2type = N'COLUMN', @level2name = N'PaymentProviderID';
GO

-- =============================================================================
--
--   CODEGEN OUTPUT — GENERATED CODE BELOW THIS LINE (do not hand-edit)
--
-- =============================================================================


/* SQL text to insert 3 new entity field(s) */

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '5a40a693-94ed-4b4d-bc89-dec6daa81237' OR (EntityID = 'C2778F51-CA0A-45CD-AD39-202307D83D9A' AND Name = 'SupportsSubscriptionBilling')) BEGIN
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
            '5a40a693-94ed-4b4d-bc89-dec6daa81237',
            'C2778F51-CA0A-45CD-AD39-202307D83D9A', -- Entity: MJ_BizApps_Orders: Payment Provider Types
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${mjSchema}].[EntityField] WHERE [EntityID] = 'C2778F51-CA0A-45CD-AD39-202307D83D9A'),
            'SupportsSubscriptionBilling',
            'Supports Subscription Billing',
            'Whether the gateway can bill a subscription itself: charge the card each period and send its own receipts. Orders creates a gateway subscription only for a provider whose type supports it and whose account has BillsSubscriptions set.',
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = 'e909e2d2-28d6-4fee-a57d-5936abd4aead' OR (EntityID = 'AF2EAF51-4097-425F-BAAE-DB3773F5EF03' AND Name = 'UseForNewSubscriptions')) BEGIN
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
            'e909e2d2-28d6-4fee-a57d-5936abd4aead',
            'AF2EAF51-4097-425F-BAAE-DB3773F5EF03', -- Entity: MJ_BizApps_Orders: Payment Provider Prices
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${mjSchema}].[EntityField] WHERE [EntityID] = 'AF2EAF51-4097-425F-BAAE-DB3773F5EF03'),
            'UseForNewSubscriptions',
            'Use For New Subscriptions',
            'The price a new gateway-billed subscription to this product is created on. At most one active row per provider and product. Other active rows still map charges to the product (unmatched charges) but are never used for new subscriptions.',
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = 'eaca66c1-67e6-41ef-8c8d-bf1372f50b5b' OR (EntityID = 'FDC49E63-B229-40BB-9ABC-F384D7750123' AND Name = 'BillsSubscriptions')) BEGIN
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
            'eaca66c1-67e6-41ef-8c8d-bf1372f50b5b',
            'FDC49E63-B229-40BB-9ABC-F384D7750123', -- Entity: MJ_BizApps_Orders: Payment Providers
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${mjSchema}].[EntityField] WHERE [EntityID] = 'FDC49E63-B229-40BB-9ABC-F384D7750123'),
            'BillsSubscriptions',
            'Bills Subscriptions',
            'Whether this account bills the auto-renewing subscriptions sold through it. When set and the type supports it, Orders creates a gateway subscription after the first payment, and the gateway charges each renewal. Turning it off stops new ones only: a subscription already billed by the gateway keeps being skipped by Orders'' renewal jobs.',
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

/* Base View SQL for MJ_BizApps_Orders: Payment Provider Prices */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Payment Provider Prices
-- Item: vwPaymentProviderPrices
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ_BizApps_Orders: Payment Provider Prices
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  PaymentProviderPrice
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwPaymentProviderPrices]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwPaymentProviderPrices];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwPaymentProviderPrices]
AS
SELECT
    p.*,
    mjBizAppsOrdersPaymentProvider_PaymentProviderID.[Name] AS [PaymentProvider],
    mjBizAppsOrdersProduct_ProductID.[Name] AS [Product]
FROM
    [${flyway:defaultSchema}].[PaymentProviderPrice] AS p
INNER JOIN
    [${flyway:defaultSchema}].[PaymentProvider] AS mjBizAppsOrdersPaymentProvider_PaymentProviderID
  ON
    [p].[PaymentProviderID] = mjBizAppsOrdersPaymentProvider_PaymentProviderID.[ID]
INNER JOIN
    [${flyway:defaultSchema}].[Product] AS mjBizAppsOrdersProduct_ProductID
  ON
    [p].[ProductID] = mjBizAppsOrdersProduct_ProductID.[ID]
GO
REVOKE SELECT ON [${flyway:defaultSchema}].[vwPaymentProviderPrices] FROM [cdp_Developer]
REVOKE SELECT ON [${flyway:defaultSchema}].[vwPaymentProviderPrices] FROM [cdp_Integration]
REVOKE SELECT ON [${flyway:defaultSchema}].[vwPaymentProviderPrices] FROM [cdp_UI]
GRANT SELECT ON [${flyway:defaultSchema}].[vwPaymentProviderPrices] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for MJ_BizApps_Orders: Payment Provider Prices */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Payment Provider Prices
-- Item: Permissions for vwPaymentProviderPrices
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

REVOKE SELECT ON [${flyway:defaultSchema}].[vwPaymentProviderPrices] FROM [cdp_Developer]
REVOKE SELECT ON [${flyway:defaultSchema}].[vwPaymentProviderPrices] FROM [cdp_Integration]
REVOKE SELECT ON [${flyway:defaultSchema}].[vwPaymentProviderPrices] FROM [cdp_UI]
GRANT SELECT ON [${flyway:defaultSchema}].[vwPaymentProviderPrices] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for MJ_BizApps_Orders: Payment Provider Prices */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Payment Provider Prices
-- Item: spCreatePaymentProviderPrice
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR PaymentProviderPrice
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreatePaymentProviderPrice]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreatePaymentProviderPrice];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreatePaymentProviderPrice]
    @ID uniqueidentifier = NULL,
    @PaymentProviderID uniqueidentifier,
    @ProviderPriceID nvarchar(255),
    @ProductID uniqueidentifier,
    @Description_Clear bit = 0,
    @Description nvarchar(255) = NULL,
    @IsActive bit = NULL,
    @UseForNewSubscriptions bit = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)

    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[PaymentProviderPrice]
            (
                [ID],
                [PaymentProviderID],
                [ProviderPriceID],
                [ProductID],
                [Description],
                [IsActive],
                [UseForNewSubscriptions]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @PaymentProviderID,
                @ProviderPriceID,
                @ProductID,
                CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, NULL) END,
                ISNULL(@IsActive, 1),
                ISNULL(@UseForNewSubscriptions, 0)
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[PaymentProviderPrice]
            (
                [PaymentProviderID],
                [ProviderPriceID],
                [ProductID],
                [Description],
                [IsActive],
                [UseForNewSubscriptions]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @PaymentProviderID,
                @ProviderPriceID,
                @ProductID,
                CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, NULL) END,
                ISNULL(@IsActive, 1),
                ISNULL(@UseForNewSubscriptions, 0)
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwPaymentProviderPrices] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreatePaymentProviderPrice] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreatePaymentProviderPrice] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreatePaymentProviderPrice] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ_BizApps_Orders: Payment Provider Prices */

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreatePaymentProviderPrice] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreatePaymentProviderPrice] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreatePaymentProviderPrice] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for MJ_BizApps_Orders: Payment Provider Prices */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Payment Provider Prices
-- Item: spUpdatePaymentProviderPrice
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR PaymentProviderPrice
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdatePaymentProviderPrice]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdatePaymentProviderPrice];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdatePaymentProviderPrice]
    @ID uniqueidentifier,
    @PaymentProviderID uniqueidentifier = NULL,
    @ProviderPriceID nvarchar(255) = NULL,
    @ProductID uniqueidentifier = NULL,
    @Description_Clear bit = 0,
    @Description nvarchar(255) = NULL,
    @IsActive bit = NULL,
    @UseForNewSubscriptions bit = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[PaymentProviderPrice]
    SET
        [PaymentProviderID] = ISNULL(@PaymentProviderID, [PaymentProviderID]),
        [ProviderPriceID] = ISNULL(@ProviderPriceID, [ProviderPriceID]),
        [ProductID] = ISNULL(@ProductID, [ProductID]),
        [Description] = CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, [Description]) END,
        [IsActive] = ISNULL(@IsActive, [IsActive]),
        [UseForNewSubscriptions] = ISNULL(@UseForNewSubscriptions, [UseForNewSubscriptions])
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwPaymentProviderPrices] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwPaymentProviderPrices]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spUpdatePaymentProviderPrice] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spUpdatePaymentProviderPrice] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdatePaymentProviderPrice] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the PaymentProviderPrice table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdatePaymentProviderPrice]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdatePaymentProviderPrice];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdatePaymentProviderPrice
ON [${flyway:defaultSchema}].[PaymentProviderPrice]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[PaymentProviderPrice]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[PaymentProviderPrice] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for MJ_BizApps_Orders: Payment Provider Prices */

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spUpdatePaymentProviderPrice] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spUpdatePaymentProviderPrice] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdatePaymentProviderPrice] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for MJ_BizApps_Orders: Payment Provider Prices */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Payment Provider Prices
-- Item: spDeletePaymentProviderPrice
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR PaymentProviderPrice
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeletePaymentProviderPrice]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeletePaymentProviderPrice];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeletePaymentProviderPrice]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[PaymentProviderPrice]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeletePaymentProviderPrice] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeletePaymentProviderPrice] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeletePaymentProviderPrice] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for MJ_BizApps_Orders: Payment Provider Prices */

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeletePaymentProviderPrice] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeletePaymentProviderPrice] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeletePaymentProviderPrice] TO [cdp_Developer], [cdp_Integration];

/* Base View SQL for MJ_BizApps_Orders: Payment Provider Types */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Payment Provider Types
-- Item: vwPaymentProviderTypes
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ_BizApps_Orders: Payment Provider Types
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  PaymentProviderType
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwPaymentProviderTypes]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwPaymentProviderTypes];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwPaymentProviderTypes]
AS
SELECT
    p.*
FROM
    [${flyway:defaultSchema}].[PaymentProviderType] AS p
GO
REVOKE SELECT ON [${flyway:defaultSchema}].[vwPaymentProviderTypes] FROM [cdp_Developer]
REVOKE SELECT ON [${flyway:defaultSchema}].[vwPaymentProviderTypes] FROM [cdp_Integration]
REVOKE SELECT ON [${flyway:defaultSchema}].[vwPaymentProviderTypes] FROM [cdp_UI]
GRANT SELECT ON [${flyway:defaultSchema}].[vwPaymentProviderTypes] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for MJ_BizApps_Orders: Payment Provider Types */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Payment Provider Types
-- Item: Permissions for vwPaymentProviderTypes
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

REVOKE SELECT ON [${flyway:defaultSchema}].[vwPaymentProviderTypes] FROM [cdp_Developer]
REVOKE SELECT ON [${flyway:defaultSchema}].[vwPaymentProviderTypes] FROM [cdp_Integration]
REVOKE SELECT ON [${flyway:defaultSchema}].[vwPaymentProviderTypes] FROM [cdp_UI]
GRANT SELECT ON [${flyway:defaultSchema}].[vwPaymentProviderTypes] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for MJ_BizApps_Orders: Payment Provider Types */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Payment Provider Types
-- Item: spCreatePaymentProviderType
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR PaymentProviderType
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreatePaymentProviderType]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreatePaymentProviderType];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreatePaymentProviderType]
    @ID uniqueidentifier = NULL,
    @Code nvarchar(40),
    @Name nvarchar(200),
    @Description_Clear bit = 0,
    @Description nvarchar(MAX) = NULL,
    @DriverClass_Clear bit = 0,
    @DriverClass nvarchar(200) = NULL,
    @SupportsTokenization bit = NULL,
    @SupportsRefund bit = NULL,
    @SupportsWebhooks bit = NULL,
    @Sequence int = NULL,
    @IsActive bit = NULL,
    @SupportsSubscriptionBilling bit = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)

    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[PaymentProviderType]
            (
                [ID],
                [Code],
                [Name],
                [Description],
                [DriverClass],
                [SupportsTokenization],
                [SupportsRefund],
                [SupportsWebhooks],
                [Sequence],
                [IsActive],
                [SupportsSubscriptionBilling]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @Code,
                @Name,
                CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, NULL) END,
                CASE WHEN @DriverClass_Clear = 1 THEN NULL ELSE ISNULL(@DriverClass, NULL) END,
                ISNULL(@SupportsTokenization, 0),
                ISNULL(@SupportsRefund, 0),
                ISNULL(@SupportsWebhooks, 0),
                ISNULL(@Sequence, 0),
                ISNULL(@IsActive, 1),
                ISNULL(@SupportsSubscriptionBilling, 0)
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[PaymentProviderType]
            (
                [Code],
                [Name],
                [Description],
                [DriverClass],
                [SupportsTokenization],
                [SupportsRefund],
                [SupportsWebhooks],
                [Sequence],
                [IsActive],
                [SupportsSubscriptionBilling]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @Code,
                @Name,
                CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, NULL) END,
                CASE WHEN @DriverClass_Clear = 1 THEN NULL ELSE ISNULL(@DriverClass, NULL) END,
                ISNULL(@SupportsTokenization, 0),
                ISNULL(@SupportsRefund, 0),
                ISNULL(@SupportsWebhooks, 0),
                ISNULL(@Sequence, 0),
                ISNULL(@IsActive, 1),
                ISNULL(@SupportsSubscriptionBilling, 0)
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwPaymentProviderTypes] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreatePaymentProviderType] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreatePaymentProviderType] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreatePaymentProviderType] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ_BizApps_Orders: Payment Provider Types */

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreatePaymentProviderType] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreatePaymentProviderType] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreatePaymentProviderType] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for MJ_BizApps_Orders: Payment Provider Types */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Payment Provider Types
-- Item: spUpdatePaymentProviderType
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR PaymentProviderType
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdatePaymentProviderType]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdatePaymentProviderType];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdatePaymentProviderType]
    @ID uniqueidentifier,
    @Code nvarchar(40) = NULL,
    @Name nvarchar(200) = NULL,
    @Description_Clear bit = 0,
    @Description nvarchar(MAX) = NULL,
    @DriverClass_Clear bit = 0,
    @DriverClass nvarchar(200) = NULL,
    @SupportsTokenization bit = NULL,
    @SupportsRefund bit = NULL,
    @SupportsWebhooks bit = NULL,
    @Sequence int = NULL,
    @IsActive bit = NULL,
    @SupportsSubscriptionBilling bit = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[PaymentProviderType]
    SET
        [Code] = ISNULL(@Code, [Code]),
        [Name] = ISNULL(@Name, [Name]),
        [Description] = CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, [Description]) END,
        [DriverClass] = CASE WHEN @DriverClass_Clear = 1 THEN NULL ELSE ISNULL(@DriverClass, [DriverClass]) END,
        [SupportsTokenization] = ISNULL(@SupportsTokenization, [SupportsTokenization]),
        [SupportsRefund] = ISNULL(@SupportsRefund, [SupportsRefund]),
        [SupportsWebhooks] = ISNULL(@SupportsWebhooks, [SupportsWebhooks]),
        [Sequence] = ISNULL(@Sequence, [Sequence]),
        [IsActive] = ISNULL(@IsActive, [IsActive]),
        [SupportsSubscriptionBilling] = ISNULL(@SupportsSubscriptionBilling, [SupportsSubscriptionBilling])
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwPaymentProviderTypes] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwPaymentProviderTypes]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spUpdatePaymentProviderType] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spUpdatePaymentProviderType] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdatePaymentProviderType] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the PaymentProviderType table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdatePaymentProviderType]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdatePaymentProviderType];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdatePaymentProviderType
ON [${flyway:defaultSchema}].[PaymentProviderType]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[PaymentProviderType]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[PaymentProviderType] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for MJ_BizApps_Orders: Payment Provider Types */

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spUpdatePaymentProviderType] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spUpdatePaymentProviderType] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdatePaymentProviderType] TO [cdp_Developer], [cdp_Integration];

/* Base View SQL for MJ_BizApps_Orders: Payment Providers */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Payment Providers
-- Item: vwPaymentProviders
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ_BizApps_Orders: Payment Providers
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  PaymentProvider
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwPaymentProviders]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwPaymentProviders];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwPaymentProviders]
AS
SELECT
    p.*,
    mjBizAppsOrdersPaymentProviderType_PaymentProviderTypeID.[Name] AS [PaymentProviderType],
    MJCompany_CompanyID.[Name] AS [Company],
    MJCompanyIntegration_CompanyIntegrationID.[Name] AS [CompanyIntegration]
FROM
    [${flyway:defaultSchema}].[PaymentProvider] AS p
INNER JOIN
    [${flyway:defaultSchema}].[PaymentProviderType] AS mjBizAppsOrdersPaymentProviderType_PaymentProviderTypeID
  ON
    [p].[PaymentProviderTypeID] = mjBizAppsOrdersPaymentProviderType_PaymentProviderTypeID.[ID]
INNER JOIN
    [${mjSchema}].[Company] AS MJCompany_CompanyID
  ON
    [p].[CompanyID] = MJCompany_CompanyID.[ID]
LEFT OUTER JOIN
    [${mjSchema}].[CompanyIntegration] AS MJCompanyIntegration_CompanyIntegrationID
  ON
    [p].[CompanyIntegrationID] = MJCompanyIntegration_CompanyIntegrationID.[ID]
GO
REVOKE SELECT ON [${flyway:defaultSchema}].[vwPaymentProviders] FROM [cdp_Developer]
REVOKE SELECT ON [${flyway:defaultSchema}].[vwPaymentProviders] FROM [cdp_Integration]
REVOKE SELECT ON [${flyway:defaultSchema}].[vwPaymentProviders] FROM [cdp_UI]
GRANT SELECT ON [${flyway:defaultSchema}].[vwPaymentProviders] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for MJ_BizApps_Orders: Payment Providers */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Payment Providers
-- Item: Permissions for vwPaymentProviders
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

REVOKE SELECT ON [${flyway:defaultSchema}].[vwPaymentProviders] FROM [cdp_Developer]
REVOKE SELECT ON [${flyway:defaultSchema}].[vwPaymentProviders] FROM [cdp_Integration]
REVOKE SELECT ON [${flyway:defaultSchema}].[vwPaymentProviders] FROM [cdp_UI]
GRANT SELECT ON [${flyway:defaultSchema}].[vwPaymentProviders] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for MJ_BizApps_Orders: Payment Providers */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Payment Providers
-- Item: spCreatePaymentProvider
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR PaymentProvider
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreatePaymentProvider]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreatePaymentProvider];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreatePaymentProvider]
    @ID uniqueidentifier = NULL,
    @PaymentProviderTypeID uniqueidentifier,
    @CompanyID uniqueidentifier,
    @Name nvarchar(200),
    @CredentialsRef_Clear bit = 0,
    @CredentialsRef nvarchar(200) = NULL,
    @IsLiveMode bit = NULL,
    @IsActive bit = NULL,
    @CompanyIntegrationID_Clear bit = 0,
    @CompanyIntegrationID uniqueidentifier = NULL,
    @BillsSubscriptions bit = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)

    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[PaymentProvider]
            (
                [ID],
                [PaymentProviderTypeID],
                [CompanyID],
                [Name],
                [CredentialsRef],
                [IsLiveMode],
                [IsActive],
                [CompanyIntegrationID],
                [BillsSubscriptions]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @PaymentProviderTypeID,
                @CompanyID,
                @Name,
                CASE WHEN @CredentialsRef_Clear = 1 THEN NULL ELSE ISNULL(@CredentialsRef, NULL) END,
                ISNULL(@IsLiveMode, 0),
                ISNULL(@IsActive, 1),
                CASE WHEN @CompanyIntegrationID_Clear = 1 THEN NULL ELSE ISNULL(@CompanyIntegrationID, NULL) END,
                ISNULL(@BillsSubscriptions, 0)
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[PaymentProvider]
            (
                [PaymentProviderTypeID],
                [CompanyID],
                [Name],
                [CredentialsRef],
                [IsLiveMode],
                [IsActive],
                [CompanyIntegrationID],
                [BillsSubscriptions]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @PaymentProviderTypeID,
                @CompanyID,
                @Name,
                CASE WHEN @CredentialsRef_Clear = 1 THEN NULL ELSE ISNULL(@CredentialsRef, NULL) END,
                ISNULL(@IsLiveMode, 0),
                ISNULL(@IsActive, 1),
                CASE WHEN @CompanyIntegrationID_Clear = 1 THEN NULL ELSE ISNULL(@CompanyIntegrationID, NULL) END,
                ISNULL(@BillsSubscriptions, 0)
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwPaymentProviders] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreatePaymentProvider] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreatePaymentProvider] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreatePaymentProvider] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ_BizApps_Orders: Payment Providers */

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreatePaymentProvider] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreatePaymentProvider] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreatePaymentProvider] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for MJ_BizApps_Orders: Payment Providers */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Payment Providers
-- Item: spUpdatePaymentProvider
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR PaymentProvider
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdatePaymentProvider]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdatePaymentProvider];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdatePaymentProvider]
    @ID uniqueidentifier,
    @PaymentProviderTypeID uniqueidentifier = NULL,
    @CompanyID uniqueidentifier = NULL,
    @Name nvarchar(200) = NULL,
    @CredentialsRef_Clear bit = 0,
    @CredentialsRef nvarchar(200) = NULL,
    @IsLiveMode bit = NULL,
    @IsActive bit = NULL,
    @CompanyIntegrationID_Clear bit = 0,
    @CompanyIntegrationID uniqueidentifier = NULL,
    @BillsSubscriptions bit = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[PaymentProvider]
    SET
        [PaymentProviderTypeID] = ISNULL(@PaymentProviderTypeID, [PaymentProviderTypeID]),
        [CompanyID] = ISNULL(@CompanyID, [CompanyID]),
        [Name] = ISNULL(@Name, [Name]),
        [CredentialsRef] = CASE WHEN @CredentialsRef_Clear = 1 THEN NULL ELSE ISNULL(@CredentialsRef, [CredentialsRef]) END,
        [IsLiveMode] = ISNULL(@IsLiveMode, [IsLiveMode]),
        [IsActive] = ISNULL(@IsActive, [IsActive]),
        [CompanyIntegrationID] = CASE WHEN @CompanyIntegrationID_Clear = 1 THEN NULL ELSE ISNULL(@CompanyIntegrationID, [CompanyIntegrationID]) END,
        [BillsSubscriptions] = ISNULL(@BillsSubscriptions, [BillsSubscriptions])
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwPaymentProviders] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwPaymentProviders]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spUpdatePaymentProvider] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spUpdatePaymentProvider] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdatePaymentProvider] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the PaymentProvider table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdatePaymentProvider]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdatePaymentProvider];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdatePaymentProvider
ON [${flyway:defaultSchema}].[PaymentProvider]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[PaymentProvider]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[PaymentProvider] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for MJ_BizApps_Orders: Payment Providers */

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spUpdatePaymentProvider] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spUpdatePaymentProvider] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdatePaymentProvider] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for MJ_BizApps_Orders: Payment Provider Types */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Payment Provider Types
-- Item: spDeletePaymentProviderType
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR PaymentProviderType
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeletePaymentProviderType]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeletePaymentProviderType];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeletePaymentProviderType]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[PaymentProviderType]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeletePaymentProviderType] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeletePaymentProviderType] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeletePaymentProviderType] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for MJ_BizApps_Orders: Payment Provider Types */

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeletePaymentProviderType] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeletePaymentProviderType] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeletePaymentProviderType] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for MJ_BizApps_Orders: Payment Providers */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Payment Providers
-- Item: spDeletePaymentProvider
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR PaymentProvider
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeletePaymentProvider]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeletePaymentProvider];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeletePaymentProvider]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[PaymentProvider]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeletePaymentProvider] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeletePaymentProvider] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeletePaymentProvider] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for MJ_BizApps_Orders: Payment Providers */

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeletePaymentProvider] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeletePaymentProvider] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeletePaymentProvider] TO [cdp_Developer], [cdp_Integration];

/* Set field properties for entity */

               UPDATE [${mjSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'E909E2D2-28D6-4FEE-A57D-5936ABD4AEAD'
               AND AutoUpdateDefaultInView = 1;

/* Set categories for 1 fields */

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Payment Provider Types.SupportsSubscriptionBilling 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'Capabilities',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '5A40A693-94ED-4B4D-BC89-DEC6DAA81237';

/* Set categories for 2 fields */

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Payment Providers.BillsSubscriptions 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'Provider Configuration',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'EACA66C1-67E6-41EF-8C8D-BF1372F50B5B';

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Payment Providers.CompanyIntegration 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'Security and Integration',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'ACD8DA26-2200-49C6-81EB-4138C34FC6B8';

/* Set categories for 2 fields */

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Payment Provider Prices.ID 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '836ECB5F-95C1-4260-91E8-46CCA6E08C8B';

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Payment Provider Prices.UseForNewSubscriptions 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'Mapping Details',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'E909E2D2-28D6-4FEE-A57D-5936ABD4AEAD';

/* Generated Validation Functions for MJ_BizApps_Orders: Subscriptions */

-- CHECK constraint for MJ_BizApps_Orders: Subscriptions @ Table Level was newly set or modified since the last generation of the validation function, the code was regenerated and updating the GeneratedCode table with the new generated validation function
IF NOT EXISTS (
      SELECT 1 FROM [${mjSchema}].[GeneratedCode] WHERE [CategoryID] = (SELECT [ID] FROM [${mjSchema}].[vwGeneratedCodeCategories] WHERE [Name]='CodeGen: Validators') AND [LinkedEntityID] = 'E0238F34-2837-EF11-86D4-6045BDEE16E6' AND [LinkedRecordPrimaryKey] = 'E9B55146-3351-440C-AD47-FD4DE05BDA05' AND [Name] = 'ValidatePaymentProviderRequiredForProviderSubscription'
   )
   BEGIN
      INSERT INTO [${mjSchema}].[GeneratedCode] ([ID], [CategoryID], [GeneratedByModelID], [GeneratedAt], [Language], [Status], [Source], [Code], [Description], [Name], [LinkedEntityID], [LinkedRecordPrimaryKey])
VALUES ('3a4be09f-8fd7-4f36-bbdc-32e3894619d5', (SELECT [ID] FROM [${mjSchema}].[vwGeneratedCodeCategories] WHERE [Name]='CodeGen: Validators'), 'C43229F6-4CC8-4838-9D04-03419A2DA191', GETUTCDATE(), 'TypeScript', 'Approved', '([ProviderSubscriptionID] IS NULL OR [PaymentProviderID] IS NOT NULL)', 'public ValidatePaymentProviderRequiredForProviderSubscription(result: ValidationResult) {
	if (this.ProviderSubscriptionID != null && this.PaymentProviderID == null) {
		result.Errors.push(new ValidationErrorInfo(
			"PaymentProviderID",
			"A payment provider must be specified when a provider subscription ID is provided.",
			this.PaymentProviderID,
			ValidationErrorType.Failure
		));
	}
}', 'Ensures that a payment provider is specified whenever a provider subscription ID is recorded.', 'ValidatePaymentProviderRequiredForProviderSubscription', 'E0238F34-2837-EF11-86D4-6045BDEE16E6', 'E9B55146-3351-440C-AD47-FD4DE05BDA05')
   END;



