-- =============================================================================
-- V202610020700 — A subscription's renewal card, and the checkout's auto-renew agreement
-- (MemberJunction/bizapps-orders#289, first half: keep the card at purchase)
-- =============================================================================
-- An auto-renewing subscription can only be charged at renewal with a card the gateway kept at the
-- first payment. Two facts had nowhere to live:
--
--   1. Subscription.DefaultCustomerPaymentMethodID — which saved card this subscription renews on.
--      A wallet entry (CustomerPaymentMethod over its own PaymentDetail, D38/D39), set when the
--      checkout that created the subscription kept the buyer's card. NULL means the subscription has
--      no renewal card: it was sold without one, or keeping it failed after the sale went through.
--
--   2. CheckoutSession.AutoRenewConsentAt / AutoRenewConsentText — the buyer's agreement to be
--      charged automatically at renewal, recorded when the widget asks for it
--      (CheckoutWidgetConfiguration.autoRenewConsentText). The text is the widget's own server-side
--      wording at the moment of agreement, not a client input, so the record says what the buyer saw.
--
-- Both nullable with no backfill: existing subscriptions and sessions predate either fact.
--
-- Hand-written DDL here is PLAIN: no existence guards. Migrations run once, in order.
--
-- CodeGen output for this app is folded below the banner at the end of this file.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Subscription.DefaultCustomerPaymentMethodID
-- -----------------------------------------------------------------------------
ALTER TABLE [${flyway:defaultSchema}].[Subscription]
    ADD [DefaultCustomerPaymentMethodID] UNIQUEIDENTIFIER NULL
        CONSTRAINT [FK_Subscription_DefaultCustomerPaymentMethod]
        FOREIGN KEY REFERENCES [${flyway:defaultSchema}].[CustomerPaymentMethod]([ID]);
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The saved card (wallet entry) this subscription is charged with at renewal. Set when the checkout that created the subscription kept the buyer''s card. NULL means there is no renewal card and an automatic renewal cannot be charged.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'Subscription',
    @level2type = N'COLUMN', @level2name = N'DefaultCustomerPaymentMethodID';
GO

-- -----------------------------------------------------------------------------
-- 2. CheckoutSession.AutoRenewConsentAt / AutoRenewConsentText
-- -----------------------------------------------------------------------------
ALTER TABLE [${flyway:defaultSchema}].[CheckoutSession]
    ADD [AutoRenewConsentAt] DATETIMEOFFSET NULL,
        [AutoRenewConsentText] NVARCHAR(MAX) NULL;
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'When the buyer agreed to be charged automatically at renewal. NULL when the widget asked for no such agreement.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'CheckoutSession',
    @level2type = N'COLUMN', @level2name = N'AutoRenewConsentAt';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The automatic-renewal wording the buyer agreed to, copied from the widget''s server-side configuration (autoRenewConsentText) at the moment of agreement.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'CheckoutSession',
    @level2type = N'COLUMN', @level2name = N'AutoRenewConsentText';
GO


















































-- =============================================================================
-- CODEGEN OUTPUT — GENERATED CODE BELOW THIS LINE. DO NOT EDIT BY HAND.
-- This app's own CodeGen SQL (the new Subscription and Checkout Session fields,
-- their views and CRUD procs) is folded here by scripts/append-codegen.sh.
-- =============================================================================
/* SQL text to insert 5 new entity field(s) */
UPDATE [${mjSchema}].[EntityField]
         SET [Sequence] = [Sequence] + 100000
       WHERE [EntityID] = 'C2F418C4-8239-4486-B036-0BC4EAE4D24E'
         AND [Sequence] < 100000
         AND NOT EXISTS (
             SELECT 1 FROM [${mjSchema}].[EntityField]
              WHERE [EntityID] = 'C2F418C4-8239-4486-B036-0BC4EAE4D24E'
                AND [Sequence] >= 100000
         );

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = 'aec9a932-fc10-46d6-a6e1-ea0404293309' OR (EntityID = 'C2F418C4-8239-4486-B036-0BC4EAE4D24E' AND Name = 'AutoRenewConsentAt')) BEGIN
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
            'aec9a932-fc10-46d6-a6e1-ea0404293309',
            'C2F418C4-8239-4486-B036-0BC4EAE4D24E', -- Entity: MJ_BizApps_Orders: Checkout Sessions
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${mjSchema}].[EntityField] WHERE [EntityID] = 'C2F418C4-8239-4486-B036-0BC4EAE4D24E') + 1,
            'AutoRenewConsentAt',
            'Auto Renew Consent At',
            'When the buyer agreed to be charged automatically at renewal. NULL when the widget asked for no such agreement.',
            'datetimeoffset',
            10,
            34,
            7,
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = 'f609efb4-ad7a-43dd-ba4d-d54e8006f2bb' OR (EntityID = 'C2F418C4-8239-4486-B036-0BC4EAE4D24E' AND Name = 'AutoRenewConsentText')) BEGIN
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
            'f609efb4-ad7a-43dd-ba4d-d54e8006f2bb',
            'C2F418C4-8239-4486-B036-0BC4EAE4D24E', -- Entity: MJ_BizApps_Orders: Checkout Sessions
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${mjSchema}].[EntityField] WHERE [EntityID] = 'C2F418C4-8239-4486-B036-0BC4EAE4D24E') + 1,
            'AutoRenewConsentText',
            'Auto Renew Consent Text',
            'The automatic-renewal wording the buyer agreed to, copied from the widget''s server-side configuration (autoRenewConsentText) at the moment of agreement.',
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
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;
UPDATE [${mjSchema}].[EntityField]
         SET [Sequence] = [Sequence] + 100000
       WHERE [EntityID] = 'E9B55146-3351-440C-AD47-FD4DE05BDA05'
         AND [Sequence] < 100000
         AND NOT EXISTS (
             SELECT 1 FROM [${mjSchema}].[EntityField]
              WHERE [EntityID] = 'E9B55146-3351-440C-AD47-FD4DE05BDA05'
                AND [Sequence] >= 100000
         );

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = 'e0d67fc2-5d06-453a-baa9-8c58632a335a' OR (EntityID = 'E9B55146-3351-440C-AD47-FD4DE05BDA05' AND Name = 'DefaultCustomerPaymentMethodID')) BEGIN
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
            'e0d67fc2-5d06-453a-baa9-8c58632a335a',
            'E9B55146-3351-440C-AD47-FD4DE05BDA05', -- Entity: MJ_BizApps_Orders: Subscriptions
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${mjSchema}].[EntityField] WHERE [EntityID] = 'E9B55146-3351-440C-AD47-FD4DE05BDA05') + 1,
            'DefaultCustomerPaymentMethodID',
            'Default Customer Payment Method ID',
            'The saved card (wallet entry) this subscription is charged with at renewal. Set when the checkout that created the subscription kept the buyer''s card. NULL means there is no renewal card and an automatic renewal cannot be charged.',
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
            'C96F379A-3E15-4DE5-BA94-4ECC90960C6D',
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

/* Create Entity Relationship: MJ_BizApps_Orders: Customer Payment Methods -> MJ_BizApps_Orders: Subscriptions (One To Many via DefaultCustomerPaymentMethodID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${mjSchema}].[EntityRelationship] WHERE [ID] = '3a535322-ed5e-4d87-b300-8ab887a64220'
   )
   BEGIN
      INSERT INTO [${mjSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('3a535322-ed5e-4d87-b300-8ab887a64220', 'C96F379A-3E15-4DE5-BA94-4ECC90960C6D', 'E9B55146-3351-440C-AD47-FD4DE05BDA05', 'DefaultCustomerPaymentMethodID', 'One To Many', 1, 1, 2, GETUTCDATE(), GETUTCDATE())
   END;

-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Checkout Sessions
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key CheckoutWidgetID in table CheckoutSession
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_CheckoutSession_CheckoutWidgetID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[CheckoutSession]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_CheckoutSession_CheckoutWidgetID ON [${flyway:defaultSchema}].[CheckoutSession] ([CheckoutWidgetID]);

-- Index for foreign key DistributionID in table CheckoutSession
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_CheckoutSession_DistributionID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[CheckoutSession]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_CheckoutSession_DistributionID ON [${flyway:defaultSchema}].[CheckoutSession] ([DistributionID]);

-- Index for foreign key PersonID in table CheckoutSession
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_CheckoutSession_PersonID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[CheckoutSession]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_CheckoutSession_PersonID ON [${flyway:defaultSchema}].[CheckoutSession] ([PersonID]);

-- Index for foreign key DraftOrderID in table CheckoutSession
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_CheckoutSession_DraftOrderID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[CheckoutSession]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_CheckoutSession_DraftOrderID ON [${flyway:defaultSchema}].[CheckoutSession] ([DraftOrderID]);

-- Index for foreign key PaymentIntentID in table CheckoutSession
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_CheckoutSession_PaymentIntentID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[CheckoutSession]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_CheckoutSession_PaymentIntentID ON [${flyway:defaultSchema}].[CheckoutSession] ([PaymentIntentID]);

/* Base View SQL for MJ_BizApps_Orders: Checkout Sessions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Checkout Sessions
-- Item: vwCheckoutSessions
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ_BizApps_Orders: Checkout Sessions
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  CheckoutSession
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwCheckoutSessions]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwCheckoutSessions];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwCheckoutSessions]
AS
SELECT
    c.*,
    mjBizAppsOrdersCheckoutWidget_CheckoutWidgetID.[Name] AS [CheckoutWidget],
    mjBizAppsOrdersCheckoutWidgetDistribution_DistributionID.[Slug] AS [Distribution],
    mjBizAppsCommonPerson_PersonID.[DisplayName] AS [Person],
    mjBizAppsOrdersOrderHeader_DraftOrderID.[OrderNumber] AS [DraftOrder],
    mjBizAppsOrdersPaymentIntent_PaymentIntentID.[ProviderIntentID] AS [PaymentIntent]
FROM
    [${flyway:defaultSchema}].[CheckoutSession] AS c
INNER JOIN
    [${flyway:defaultSchema}].[CheckoutWidget] AS mjBizAppsOrdersCheckoutWidget_CheckoutWidgetID
  ON
    [c].[CheckoutWidgetID] = mjBizAppsOrdersCheckoutWidget_CheckoutWidgetID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[CheckoutWidgetDistribution] AS mjBizAppsOrdersCheckoutWidgetDistribution_DistributionID
  ON
    [c].[DistributionID] = mjBizAppsOrdersCheckoutWidgetDistribution_DistributionID.[ID]
LEFT OUTER JOIN
    [${mjSchema}_BizAppsCommon].[Person] AS mjBizAppsCommonPerson_PersonID
  ON
    [c].[PersonID] = mjBizAppsCommonPerson_PersonID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[OrderHeader] AS mjBizAppsOrdersOrderHeader_DraftOrderID
  ON
    [c].[DraftOrderID] = mjBizAppsOrdersOrderHeader_DraftOrderID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[PaymentIntent] AS mjBizAppsOrdersPaymentIntent_PaymentIntentID
  ON
    [c].[PaymentIntentID] = mjBizAppsOrdersPaymentIntent_PaymentIntentID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwCheckoutSessions] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for MJ_BizApps_Orders: Checkout Sessions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Checkout Sessions
-- Item: Permissions for vwCheckoutSessions
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwCheckoutSessions] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for MJ_BizApps_Orders: Checkout Sessions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Checkout Sessions
-- Item: spCreateCheckoutSession
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR CheckoutSession
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateCheckoutSession]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateCheckoutSession];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateCheckoutSession]
    @ID uniqueidentifier = NULL,
    @CheckoutWidgetID uniqueidentifier,
    @DistributionID_Clear bit = 0,
    @DistributionID uniqueidentifier = NULL,
    @ClientSessionKey nvarchar(100),
    @Email_Clear bit = 0,
    @Email nvarchar(255) = NULL,
    @PersonID_Clear bit = 0,
    @PersonID uniqueidentifier = NULL,
    @DraftOrderID_Clear bit = 0,
    @DraftOrderID uniqueidentifier = NULL,
    @PaymentIntentID_Clear bit = 0,
    @PaymentIntentID uniqueidentifier = NULL,
    @Status nvarchar(20) = NULL,
    @ExpiresAt datetimeoffset,
    @MetadataJSON_Clear bit = 0,
    @MetadataJSON nvarchar(MAX) = NULL,
    @AutoRenewConsentAt_Clear bit = 0,
    @AutoRenewConsentAt datetimeoffset = NULL,
    @AutoRenewConsentText_Clear bit = 0,
    @AutoRenewConsentText nvarchar(MAX) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)

    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[CheckoutSession]
            (
                [ID],
                [CheckoutWidgetID],
                [DistributionID],
                [ClientSessionKey],
                [Email],
                [PersonID],
                [DraftOrderID],
                [PaymentIntentID],
                [Status],
                [ExpiresAt],
                [MetadataJSON],
                [AutoRenewConsentAt],
                [AutoRenewConsentText]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @CheckoutWidgetID,
                CASE WHEN @DistributionID_Clear = 1 THEN NULL ELSE ISNULL(@DistributionID, NULL) END,
                @ClientSessionKey,
                CASE WHEN @Email_Clear = 1 THEN NULL ELSE ISNULL(@Email, NULL) END,
                CASE WHEN @PersonID_Clear = 1 THEN NULL ELSE ISNULL(@PersonID, NULL) END,
                CASE WHEN @DraftOrderID_Clear = 1 THEN NULL ELSE ISNULL(@DraftOrderID, NULL) END,
                CASE WHEN @PaymentIntentID_Clear = 1 THEN NULL ELSE ISNULL(@PaymentIntentID, NULL) END,
                ISNULL(@Status, 'Open'),
                @ExpiresAt,
                CASE WHEN @MetadataJSON_Clear = 1 THEN NULL ELSE ISNULL(@MetadataJSON, NULL) END,
                CASE WHEN @AutoRenewConsentAt_Clear = 1 THEN NULL ELSE ISNULL(@AutoRenewConsentAt, NULL) END,
                CASE WHEN @AutoRenewConsentText_Clear = 1 THEN NULL ELSE ISNULL(@AutoRenewConsentText, NULL) END
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[CheckoutSession]
            (
                [CheckoutWidgetID],
                [DistributionID],
                [ClientSessionKey],
                [Email],
                [PersonID],
                [DraftOrderID],
                [PaymentIntentID],
                [Status],
                [ExpiresAt],
                [MetadataJSON],
                [AutoRenewConsentAt],
                [AutoRenewConsentText]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @CheckoutWidgetID,
                CASE WHEN @DistributionID_Clear = 1 THEN NULL ELSE ISNULL(@DistributionID, NULL) END,
                @ClientSessionKey,
                CASE WHEN @Email_Clear = 1 THEN NULL ELSE ISNULL(@Email, NULL) END,
                CASE WHEN @PersonID_Clear = 1 THEN NULL ELSE ISNULL(@PersonID, NULL) END,
                CASE WHEN @DraftOrderID_Clear = 1 THEN NULL ELSE ISNULL(@DraftOrderID, NULL) END,
                CASE WHEN @PaymentIntentID_Clear = 1 THEN NULL ELSE ISNULL(@PaymentIntentID, NULL) END,
                ISNULL(@Status, 'Open'),
                @ExpiresAt,
                CASE WHEN @MetadataJSON_Clear = 1 THEN NULL ELSE ISNULL(@MetadataJSON, NULL) END,
                CASE WHEN @AutoRenewConsentAt_Clear = 1 THEN NULL ELSE ISNULL(@AutoRenewConsentAt, NULL) END,
                CASE WHEN @AutoRenewConsentText_Clear = 1 THEN NULL ELSE ISNULL(@AutoRenewConsentText, NULL) END
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwCheckoutSessions] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateCheckoutSession] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ_BizApps_Orders: Checkout Sessions */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateCheckoutSession] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for MJ_BizApps_Orders: Checkout Sessions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Checkout Sessions
-- Item: spUpdateCheckoutSession
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR CheckoutSession
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateCheckoutSession]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateCheckoutSession];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateCheckoutSession]
    @ID uniqueidentifier,
    @CheckoutWidgetID uniqueidentifier = NULL,
    @DistributionID_Clear bit = 0,
    @DistributionID uniqueidentifier = NULL,
    @ClientSessionKey nvarchar(100) = NULL,
    @Email_Clear bit = 0,
    @Email nvarchar(255) = NULL,
    @PersonID_Clear bit = 0,
    @PersonID uniqueidentifier = NULL,
    @DraftOrderID_Clear bit = 0,
    @DraftOrderID uniqueidentifier = NULL,
    @PaymentIntentID_Clear bit = 0,
    @PaymentIntentID uniqueidentifier = NULL,
    @Status nvarchar(20) = NULL,
    @ExpiresAt datetimeoffset = NULL,
    @MetadataJSON_Clear bit = 0,
    @MetadataJSON nvarchar(MAX) = NULL,
    @AutoRenewConsentAt_Clear bit = 0,
    @AutoRenewConsentAt datetimeoffset = NULL,
    @AutoRenewConsentText_Clear bit = 0,
    @AutoRenewConsentText nvarchar(MAX) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[CheckoutSession]
    SET
        [CheckoutWidgetID] = ISNULL(@CheckoutWidgetID, [CheckoutWidgetID]),
        [DistributionID] = CASE WHEN @DistributionID_Clear = 1 THEN NULL ELSE ISNULL(@DistributionID, [DistributionID]) END,
        [ClientSessionKey] = ISNULL(@ClientSessionKey, [ClientSessionKey]),
        [Email] = CASE WHEN @Email_Clear = 1 THEN NULL ELSE ISNULL(@Email, [Email]) END,
        [PersonID] = CASE WHEN @PersonID_Clear = 1 THEN NULL ELSE ISNULL(@PersonID, [PersonID]) END,
        [DraftOrderID] = CASE WHEN @DraftOrderID_Clear = 1 THEN NULL ELSE ISNULL(@DraftOrderID, [DraftOrderID]) END,
        [PaymentIntentID] = CASE WHEN @PaymentIntentID_Clear = 1 THEN NULL ELSE ISNULL(@PaymentIntentID, [PaymentIntentID]) END,
        [Status] = ISNULL(@Status, [Status]),
        [ExpiresAt] = ISNULL(@ExpiresAt, [ExpiresAt]),
        [MetadataJSON] = CASE WHEN @MetadataJSON_Clear = 1 THEN NULL ELSE ISNULL(@MetadataJSON, [MetadataJSON]) END,
        [AutoRenewConsentAt] = CASE WHEN @AutoRenewConsentAt_Clear = 1 THEN NULL ELSE ISNULL(@AutoRenewConsentAt, [AutoRenewConsentAt]) END,
        [AutoRenewConsentText] = CASE WHEN @AutoRenewConsentText_Clear = 1 THEN NULL ELSE ISNULL(@AutoRenewConsentText, [AutoRenewConsentText]) END
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwCheckoutSessions] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwCheckoutSessions]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateCheckoutSession] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the CheckoutSession table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateCheckoutSession]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateCheckoutSession];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateCheckoutSession
ON [${flyway:defaultSchema}].[CheckoutSession]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[CheckoutSession]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[CheckoutSession] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for MJ_BizApps_Orders: Checkout Sessions */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateCheckoutSession] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for MJ_BizApps_Orders: Checkout Sessions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Checkout Sessions
-- Item: spDeleteCheckoutSession
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR CheckoutSession
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteCheckoutSession]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteCheckoutSession];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteCheckoutSession]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[CheckoutSession]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteCheckoutSession] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for MJ_BizApps_Orders: Checkout Sessions */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteCheckoutSession] TO [cdp_Developer], [cdp_Integration];

/* Base View SQL for MJ_BizApps_Orders: Event Products */
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

/* SQL text to update entity field related entity name field map for entity field ID E0D67FC2-5D06-453A-BAA9-8C58632A335A */
EXEC [${mjSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='E0D67FC2-5D06-453A-BAA9-8C58632A335A', @RelatedEntityNameFieldMap='DefaultCustomerPaymentMethod';

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
    @DefaultCustomerPaymentMethodID uniqueidentifier = NULL
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
                [DefaultCustomerPaymentMethodID]
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
                CASE WHEN @DefaultCustomerPaymentMethodID_Clear = 1 THEN NULL ELSE ISNULL(@DefaultCustomerPaymentMethodID, NULL) END
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
                [DefaultCustomerPaymentMethodID]
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
                CASE WHEN @DefaultCustomerPaymentMethodID_Clear = 1 THEN NULL ELSE ISNULL(@DefaultCustomerPaymentMethodID, NULL) END
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwSubscriptions] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateSubscription] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ_BizApps_Orders: Subscriptions */

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
    @DefaultCustomerPaymentMethodID uniqueidentifier = NULL
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
        [DefaultCustomerPaymentMethodID] = CASE WHEN @DefaultCustomerPaymentMethodID_Clear = 1 THEN NULL ELSE ISNULL(@DefaultCustomerPaymentMethodID, [DefaultCustomerPaymentMethodID]) END
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
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteSubscription] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for MJ_BizApps_Orders: Subscriptions */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteSubscription] TO [cdp_Developer], [cdp_Integration];

/* SQL text to insert 2 new entity field(s) */
UPDATE [${mjSchema}].[EntityField]
         SET [Sequence] = [Sequence] + 100000
       WHERE [EntityID] = 'E9B55146-3351-440C-AD47-FD4DE05BDA05'
         AND [Sequence] < 100000
         AND NOT EXISTS (
             SELECT 1 FROM [${mjSchema}].[EntityField]
              WHERE [EntityID] = 'E9B55146-3351-440C-AD47-FD4DE05BDA05'
                AND [Sequence] >= 100000
         );

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '1140750a-1714-40da-8a95-a97df42c91f8' OR (EntityID = 'E9B55146-3351-440C-AD47-FD4DE05BDA05' AND Name = 'DefaultCustomerPaymentMethod')) BEGIN
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
            '1140750a-1714-40da-8a95-a97df42c91f8',
            'E9B55146-3351-440C-AD47-FD4DE05BDA05', -- Entity: MJ_BizApps_Orders: Subscriptions
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${mjSchema}].[EntityField] WHERE [EntityID] = 'E9B55146-3351-440C-AD47-FD4DE05BDA05') + 1,
            'DefaultCustomerPaymentMethod',
            'Default Customer Payment Method',
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

