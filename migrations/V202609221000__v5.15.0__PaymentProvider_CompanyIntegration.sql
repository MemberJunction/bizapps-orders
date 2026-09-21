-- =============================================================================
-- PaymentProvider.CompanyIntegrationID — which MJ Company Integration a provider row uses.
--
-- Added for the Bill.com rail (golive #146/#147/#148, design D-B4). The published connector
-- (@memberjunction/connector-bill-com) resolves its own credentials from the MJ: Company Integrations
-- row and the MJ: Credentials row behind it, so Orders stores a POINTER to that row and never a
-- secret. Existing Stripe/Manual/StoredValue rows keep resolving through CredentialsRef and are
-- untouched; the column is nullable.
--
-- Plain DDL (the #219/#220 shape): migrations run once, in order.
-- =============================================================================
ALTER TABLE [${flyway:defaultSchema}].[PaymentProvider]
    ADD [CompanyIntegrationID] UNIQUEIDENTIFIER NULL
        CONSTRAINT [FK_PaymentProvider_CompanyIntegration]
        REFERENCES [__mj].[CompanyIntegration]([ID]);
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The MJ Company Integration whose connector and credential this provider uses (Bill.com). NULL for providers that resolve credentials through CredentialsRef. A pointer, never a secret.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'PaymentProvider',
    @level2type = N'COLUMN', @level2name = N'CompanyIntegrationID';
GO

-- =============================================================================
-- CODEGEN OUTPUT — GENERATED CODE BELOW THIS LINE. DO NOT EDIT BY HAND.
-- This app's own CodeGen SQL for the CompanyIntegrationID field on Payment Providers, its relationship to MJ: Company Integrations,
-- and the regenerated vwPaymentProviders view and CRUD procedures. Produced by MJ CodeGen 6.1 against
-- MJ_BizAppsSales_QA on 2026-09-21 and carved to this migration's objects (the same run also
-- regenerated Event Products / Order Lines objects from unrelated drift; those are not here).
-- =============================================================================

/* SQL text to insert entity field(s) */
      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '0f572323-59b1-49dc-af03-c4bea5e5bfd7' OR (EntityID = 'FDC49E63-B229-40BB-9ABC-F384D7750123' AND Name = 'CompanyIntegrationID')) BEGIN
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
            '0f572323-59b1-49dc-af03-c4bea5e5bfd7',
            'FDC49E63-B229-40BB-9ABC-F384D7750123', -- Entity: MJ_BizApps_Orders: Payment Providers
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${mjSchema}].[EntityField] WHERE [EntityID] = 'FDC49E63-B229-40BB-9ABC-F384D7750123') + 1,
            'CompanyIntegrationID',
            'Company Integration ID',
            'The MJ Company Integration whose connector and credential this provider uses (Bill.com). NULL for providers that resolve credentials through CredentialsRef. A pointer, never a secret.',
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
            'DE238F34-2837-EF11-86D4-6045BDEE16E6',
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

/* Create Entity Relationship: MJ: Company Integrations -> MJ_BizApps_Orders: Payment Providers (One To Many via CompanyIntegrationID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${mjSchema}].[EntityRelationship] WHERE [ID] = '949caee2-928f-4e0a-8dc7-464f1c8b6cd8'
   )
   BEGIN
      INSERT INTO [${mjSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('949caee2-928f-4e0a-8dc7-464f1c8b6cd8', 'DE238F34-2837-EF11-86D4-6045BDEE16E6', 'FDC49E63-B229-40BB-9ABC-F384D7750123', 'CompanyIntegrationID', 'One To Many', 1, 1, 7, GETUTCDATE(), GETUTCDATE())
   END;

/* Index for Foreign Keys for PaymentProvider */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Payment Providers
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key PaymentProviderTypeID in table PaymentProvider
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_PaymentProvider_PaymentProviderTypeID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[PaymentProvider]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_PaymentProvider_PaymentProviderTypeID ON [${flyway:defaultSchema}].[PaymentProvider] ([PaymentProviderTypeID]);

-- Index for foreign key CompanyID in table PaymentProvider
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_PaymentProvider_CompanyID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[PaymentProvider]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_PaymentProvider_CompanyID ON [${flyway:defaultSchema}].[PaymentProvider] ([CompanyID]);

-- Index for foreign key CompanyIntegrationID in table PaymentProvider
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_PaymentProvider_CompanyIntegrationID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[PaymentProvider]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_PaymentProvider_CompanyIntegrationID ON [${flyway:defaultSchema}].[PaymentProvider] ([CompanyIntegrationID]);

/* SQL text to update entity field related entity name field map for entity field ID 0F572323-59B1-49DC-AF03-C4BEA5E5BFD7 */
EXEC [${mjSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='0F572323-59B1-49DC-AF03-C4BEA5E5BFD7', @RelatedEntityNameFieldMap='CompanyIntegration';

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
    @CompanyIntegrationID uniqueidentifier = NULL
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
                [CompanyIntegrationID]
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
                CASE WHEN @CompanyIntegrationID_Clear = 1 THEN NULL ELSE ISNULL(@CompanyIntegrationID, NULL) END
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
                [CompanyIntegrationID]
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
                CASE WHEN @CompanyIntegrationID_Clear = 1 THEN NULL ELSE ISNULL(@CompanyIntegrationID, NULL) END
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwPaymentProviders] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreatePaymentProvider] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ_BizApps_Orders: Payment Providers */

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
    @CompanyIntegrationID uniqueidentifier = NULL
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
        [CompanyIntegrationID] = CASE WHEN @CompanyIntegrationID_Clear = 1 THEN NULL ELSE ISNULL(@CompanyIntegrationID, [CompanyIntegrationID]) END
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

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdatePaymentProvider] TO [cdp_Developer], [cdp_Integration];

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
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeletePaymentProvider] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for MJ_BizApps_Orders: Payment Providers */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeletePaymentProvider] TO [cdp_Developer], [cdp_Integration];

/* SQL text to insert entity field(s) */
      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = 'acd8da26-2200-49c6-81eb-4138c34fc6b8' OR (EntityID = 'FDC49E63-B229-40BB-9ABC-F384D7750123' AND Name = 'CompanyIntegration')) BEGIN
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
            'acd8da26-2200-49c6-81eb-4138c34fc6b8',
            'FDC49E63-B229-40BB-9ABC-F384D7750123', -- Entity: MJ_BizApps_Orders: Payment Providers
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${mjSchema}].[EntityField] WHERE [EntityID] = 'FDC49E63-B229-40BB-9ABC-F384D7750123') + 1,
            'CompanyIntegration',
            'Company Integration',
            NULL,
            'nvarchar',
            510,
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
