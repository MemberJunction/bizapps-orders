-- =============================================================================
-- Scoped CodeGen emit for __mj_BizAppsOrders (mj codegen --skipfiles with
-- includeSchemas). Inspected: does NOT DROP the layered outer vwOrderHeaders;
-- regenerates inner vwOrderHeadersGenerated and CRUD procs; adds missing
-- EntityField rows so save-capture ResultTable matches view column count
-- (Payment Details 29/29, Order Headers 53/53).
-- Source: migrations/codegen/CodeGen_Run_2026-08-25_21-04-32.sql
-- =============================================================================

/* SQL text to update existing entities from schema */
EXEC [${mjSchema}].[spUpdateExistingEntitiesFromSchema] @ExcludedSchemaNames='${mjSchema}_BizAppsAccounting,${mjSchema}_BizAppsCommon,${mjSchema}_BizAppsIssues,${mjSchema}_BizAppsTasks,${mjSchema},sys';

/* SQL text to insert 5 new entity field(s) */

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '41bb0737-cd9e-4940-b11b-fd298cf7eaae' OR (EntityID = '8B748643-85FF-4B07-B3B6-B12EC7A399E6' AND Name = 'RootParentID')) BEGIN
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
            '41bb0737-cd9e-4940-b11b-fd298cf7eaae',
            '8B748643-85FF-4B07-B3B6-B12EC7A399E6', -- Entity: MJ_BizApps_Common: Activity Types
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${mjSchema}].[EntityField] WHERE [EntityID] = '8B748643-85FF-4B07-B3B6-B12EC7A399E6') + 14,
            'RootParentID',
            'Root Parent ID',
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = 'd46b9d6e-e723-4741-a738-bb86d47107c2' OR (EntityID = '8B748643-85FF-4B07-B3B6-B12EC7A399E6' AND Name = 'ParentIDDepth')) BEGIN
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
            'd46b9d6e-e723-4741-a738-bb86d47107c2',
            '8B748643-85FF-4B07-B3B6-B12EC7A399E6', -- Entity: MJ_BizApps_Common: Activity Types
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${mjSchema}].[EntityField] WHERE [EntityID] = '8B748643-85FF-4B07-B3B6-B12EC7A399E6') + 15,
            'ParentIDDepth',
            'Parent ID Depth',
            NULL,
            'int',
            4,
            10,
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '4e37bf81-3d28-4ced-a7ca-a38876a4808b' OR (EntityID = '8B748643-85FF-4B07-B3B6-B12EC7A399E6' AND Name = 'ParentIDPath')) BEGIN
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
            '4e37bf81-3d28-4ced-a7ca-a38876a4808b',
            '8B748643-85FF-4B07-B3B6-B12EC7A399E6', -- Entity: MJ_BizApps_Common: Activity Types
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${mjSchema}].[EntityField] WHERE [EntityID] = '8B748643-85FF-4B07-B3B6-B12EC7A399E6') + 16,
            'ParentIDPath',
            'Parent ID Path',
            NULL,
            'nvarchar',
            -1,
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = 'f897cd8f-80f1-4f53-8be7-11a1d508a8ec' OR (EntityID = '8B748643-85FF-4B07-B3B6-B12EC7A399E6' AND Name = 'ParentIDIsLeaf')) BEGIN
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
            'f897cd8f-80f1-4f53-8be7-11a1d508a8ec',
            '8B748643-85FF-4B07-B3B6-B12EC7A399E6', -- Entity: MJ_BizApps_Common: Activity Types
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${mjSchema}].[EntityField] WHERE [EntityID] = '8B748643-85FF-4B07-B3B6-B12EC7A399E6') + 17,
            'ParentIDIsLeaf',
            'Parent ID Is Leaf',
            NULL,
            'bit',
            1,
            1,
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = 'fad7998a-e1cd-4344-9616-dca3641ca12c' OR (EntityID = '8B748643-85FF-4B07-B3B6-B12EC7A399E6' AND Name = 'ParentIDChildCount')) BEGIN
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
            'fad7998a-e1cd-4344-9616-dca3641ca12c',
            '8B748643-85FF-4B07-B3B6-B12EC7A399E6', -- Entity: MJ_BizApps_Common: Activity Types
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${mjSchema}].[EntityField] WHERE [EntityID] = '8B748643-85FF-4B07-B3B6-B12EC7A399E6') + 18,
            'ParentIDChildCount',
            'Parent ID Child Count',
            NULL,
            'int',
            4,
            10,
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

/* SQL text to update existing entity fields from schema */
EXEC [${mjSchema}].[spUpdateExistingEntityFieldsFromSchema] @ExcludedSchemaNames='${mjSchema}_BizAppsAccounting,${mjSchema}_BizAppsCommon,${mjSchema}_BizAppsIssues,${mjSchema}_BizAppsTasks,${mjSchema},sys';

/* SQL text to set default column width where needed */
EXEC [${mjSchema}].[spSetDefaultColumnWidthWhereNeeded] @ExcludedSchemaNames='${mjSchema}_BizAppsAccounting,${mjSchema}_BizAppsCommon,${mjSchema}_BizAppsIssues,${mjSchema}_BizAppsTasks,${mjSchema},sys';

/* SQL text to sync schema info from database schemas */
EXEC [${mjSchema}].[spUpdateSchemaInfoFromDatabase] @ExcludedSchemaNames='${mjSchema}_BizAppsAccounting,${mjSchema}_BizAppsCommon,${mjSchema}_BizAppsIssues,${mjSchema}_BizAppsTasks,${mjSchema},sys';

/* Index for Foreign Keys for CheckoutSession */
-----------------------------------------------------------------
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

/* Index for Foreign Keys for CustomerPaymentMethod */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Customer Payment Methods
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key OwnerPersonID in table CustomerPaymentMethod
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_CustomerPaymentMethod_OwnerPersonID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[CustomerPaymentMethod]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_CustomerPaymentMethod_OwnerPersonID ON [${flyway:defaultSchema}].[CustomerPaymentMethod] ([OwnerPersonID]);

-- Index for foreign key OwnerOrganizationID in table CustomerPaymentMethod
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_CustomerPaymentMethod_OwnerOrganizationID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[CustomerPaymentMethod]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_CustomerPaymentMethod_OwnerOrganizationID ON [${flyway:defaultSchema}].[CustomerPaymentMethod] ([OwnerOrganizationID]);

-- Index for foreign key PaymentDetailID in table CustomerPaymentMethod
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_CustomerPaymentMethod_PaymentDetailID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[CustomerPaymentMethod]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_CustomerPaymentMethod_PaymentDetailID ON [${flyway:defaultSchema}].[CustomerPaymentMethod] ([PaymentDetailID]);

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
    @MetadataJSON nvarchar(MAX) = NULL
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
                [MetadataJSON]
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
                CASE WHEN @MetadataJSON_Clear = 1 THEN NULL ELSE ISNULL(@MetadataJSON, NULL) END
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
                [MetadataJSON]
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
                CASE WHEN @MetadataJSON_Clear = 1 THEN NULL ELSE ISNULL(@MetadataJSON, NULL) END
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
    @MetadataJSON nvarchar(MAX) = NULL
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
        [MetadataJSON] = CASE WHEN @MetadataJSON_Clear = 1 THEN NULL ELSE ISNULL(@MetadataJSON, [MetadataJSON]) END
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

/* Base View SQL for MJ_BizApps_Orders: Customer Payment Methods */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Customer Payment Methods
-- Item: vwCustomerPaymentMethods
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ_BizApps_Orders: Customer Payment Methods
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  CustomerPaymentMethod
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwCustomerPaymentMethods]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwCustomerPaymentMethods];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwCustomerPaymentMethods]
AS
SELECT
    c.*,
    mjBizAppsCommonPerson_OwnerPersonID.[DisplayName] AS [OwnerPerson],
    mjBizAppsCommonOrganization_OwnerOrganizationID.[Name] AS [OwnerOrganization],
    mjBizAppsOrdersPaymentDetail_PaymentDetailID.[Last4] AS [PaymentDetail]
FROM
    [${flyway:defaultSchema}].[CustomerPaymentMethod] AS c
LEFT OUTER JOIN
    [${mjSchema}_BizAppsCommon].[Person] AS mjBizAppsCommonPerson_OwnerPersonID
  ON
    [c].[OwnerPersonID] = mjBizAppsCommonPerson_OwnerPersonID.[ID]
LEFT OUTER JOIN
    [${mjSchema}_BizAppsCommon].[Organization] AS mjBizAppsCommonOrganization_OwnerOrganizationID
  ON
    [c].[OwnerOrganizationID] = mjBizAppsCommonOrganization_OwnerOrganizationID.[ID]
INNER JOIN
    [${flyway:defaultSchema}].[PaymentDetail] AS mjBizAppsOrdersPaymentDetail_PaymentDetailID
  ON
    [c].[PaymentDetailID] = mjBizAppsOrdersPaymentDetail_PaymentDetailID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwCustomerPaymentMethods] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for MJ_BizApps_Orders: Customer Payment Methods */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Customer Payment Methods
-- Item: Permissions for vwCustomerPaymentMethods
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwCustomerPaymentMethods] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for MJ_BizApps_Orders: Customer Payment Methods */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Customer Payment Methods
-- Item: spCreateCustomerPaymentMethod
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR CustomerPaymentMethod
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateCustomerPaymentMethod]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateCustomerPaymentMethod];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateCustomerPaymentMethod]
    @ID uniqueidentifier = NULL,
    @OwnerPersonID_Clear bit = 0,
    @OwnerPersonID uniqueidentifier = NULL,
    @OwnerOrganizationID_Clear bit = 0,
    @OwnerOrganizationID uniqueidentifier = NULL,
    @PaymentDetailID uniqueidentifier,
    @Nickname_Clear bit = 0,
    @Nickname nvarchar(100) = NULL,
    @IsDefault bit = NULL,
    @IsActive bit = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)

    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[CustomerPaymentMethod]
            (
                [ID],
                [OwnerPersonID],
                [OwnerOrganizationID],
                [PaymentDetailID],
                [Nickname],
                [IsDefault],
                [IsActive]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                CASE WHEN @OwnerPersonID_Clear = 1 THEN NULL ELSE ISNULL(@OwnerPersonID, NULL) END,
                CASE WHEN @OwnerOrganizationID_Clear = 1 THEN NULL ELSE ISNULL(@OwnerOrganizationID, NULL) END,
                @PaymentDetailID,
                CASE WHEN @Nickname_Clear = 1 THEN NULL ELSE ISNULL(@Nickname, NULL) END,
                ISNULL(@IsDefault, 0),
                ISNULL(@IsActive, 1)
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[CustomerPaymentMethod]
            (
                [OwnerPersonID],
                [OwnerOrganizationID],
                [PaymentDetailID],
                [Nickname],
                [IsDefault],
                [IsActive]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                CASE WHEN @OwnerPersonID_Clear = 1 THEN NULL ELSE ISNULL(@OwnerPersonID, NULL) END,
                CASE WHEN @OwnerOrganizationID_Clear = 1 THEN NULL ELSE ISNULL(@OwnerOrganizationID, NULL) END,
                @PaymentDetailID,
                CASE WHEN @Nickname_Clear = 1 THEN NULL ELSE ISNULL(@Nickname, NULL) END,
                ISNULL(@IsDefault, 0),
                ISNULL(@IsActive, 1)
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwCustomerPaymentMethods] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateCustomerPaymentMethod] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ_BizApps_Orders: Customer Payment Methods */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateCustomerPaymentMethod] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for MJ_BizApps_Orders: Customer Payment Methods */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Customer Payment Methods
-- Item: spUpdateCustomerPaymentMethod
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR CustomerPaymentMethod
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateCustomerPaymentMethod]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateCustomerPaymentMethod];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateCustomerPaymentMethod]
    @ID uniqueidentifier,
    @OwnerPersonID_Clear bit = 0,
    @OwnerPersonID uniqueidentifier = NULL,
    @OwnerOrganizationID_Clear bit = 0,
    @OwnerOrganizationID uniqueidentifier = NULL,
    @PaymentDetailID uniqueidentifier = NULL,
    @Nickname_Clear bit = 0,
    @Nickname nvarchar(100) = NULL,
    @IsDefault bit = NULL,
    @IsActive bit = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[CustomerPaymentMethod]
    SET
        [OwnerPersonID] = CASE WHEN @OwnerPersonID_Clear = 1 THEN NULL ELSE ISNULL(@OwnerPersonID, [OwnerPersonID]) END,
        [OwnerOrganizationID] = CASE WHEN @OwnerOrganizationID_Clear = 1 THEN NULL ELSE ISNULL(@OwnerOrganizationID, [OwnerOrganizationID]) END,
        [PaymentDetailID] = ISNULL(@PaymentDetailID, [PaymentDetailID]),
        [Nickname] = CASE WHEN @Nickname_Clear = 1 THEN NULL ELSE ISNULL(@Nickname, [Nickname]) END,
        [IsDefault] = ISNULL(@IsDefault, [IsDefault]),
        [IsActive] = ISNULL(@IsActive, [IsActive])
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwCustomerPaymentMethods] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwCustomerPaymentMethods]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateCustomerPaymentMethod] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the CustomerPaymentMethod table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateCustomerPaymentMethod]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateCustomerPaymentMethod];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateCustomerPaymentMethod
ON [${flyway:defaultSchema}].[CustomerPaymentMethod]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[CustomerPaymentMethod]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[CustomerPaymentMethod] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for MJ_BizApps_Orders: Customer Payment Methods */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateCustomerPaymentMethod] TO [cdp_Developer], [cdp_Integration];

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

/* spDelete SQL for MJ_BizApps_Orders: Customer Payment Methods */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Customer Payment Methods
-- Item: spDeleteCustomerPaymentMethod
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR CustomerPaymentMethod
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteCustomerPaymentMethod]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteCustomerPaymentMethod];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteCustomerPaymentMethod]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[CustomerPaymentMethod]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteCustomerPaymentMethod] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for MJ_BizApps_Orders: Customer Payment Methods */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteCustomerPaymentMethod] TO [cdp_Developer], [cdp_Integration];

/* Index for Foreign Keys for EntitlementGrant */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Entitlement Grants
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key ProductEntitlementID in table EntitlementGrant
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_EntitlementGrant_ProductEntitlementID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[EntitlementGrant]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_EntitlementGrant_ProductEntitlementID ON [${flyway:defaultSchema}].[EntitlementGrant] ([ProductEntitlementID]);

-- Index for foreign key OrderLineID in table EntitlementGrant
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_EntitlementGrant_OrderLineID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[EntitlementGrant]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_EntitlementGrant_OrderLineID ON [${flyway:defaultSchema}].[EntitlementGrant] ([OrderLineID]);

-- Index for foreign key SubscriptionID in table EntitlementGrant
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_EntitlementGrant_SubscriptionID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[EntitlementGrant]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_EntitlementGrant_SubscriptionID ON [${flyway:defaultSchema}].[EntitlementGrant] ([SubscriptionID]);

-- Index for foreign key BeneficiaryPersonID in table EntitlementGrant
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_EntitlementGrant_BeneficiaryPersonID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[EntitlementGrant]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_EntitlementGrant_BeneficiaryPersonID ON [${flyway:defaultSchema}].[EntitlementGrant] ([BeneficiaryPersonID]);

-- Index for foreign key BeneficiaryOrganizationID in table EntitlementGrant
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_EntitlementGrant_BeneficiaryOrganizationID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[EntitlementGrant]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_EntitlementGrant_BeneficiaryOrganizationID ON [${flyway:defaultSchema}].[EntitlementGrant] ([BeneficiaryOrganizationID]);

-- Index for foreign key SubscriptionTermID in table EntitlementGrant
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_EntitlementGrant_SubscriptionTermID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[EntitlementGrant]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_EntitlementGrant_SubscriptionTermID ON [${flyway:defaultSchema}].[EntitlementGrant] ([SubscriptionTermID]);

/* Base View SQL for MJ_BizApps_Orders: Entitlement Grants */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Entitlement Grants
-- Item: vwEntitlementGrants
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ_BizApps_Orders: Entitlement Grants
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  EntitlementGrant
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwEntitlementGrants]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwEntitlementGrants];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwEntitlementGrants]
AS
SELECT
    e.*,
    mjBizAppsOrdersProductEntitlement_ProductEntitlementID.[Name] AS [ProductEntitlement],
    mjBizAppsOrdersSubscription_SubscriptionID.[SubscriptionNumber] AS [Subscription],
    mjBizAppsCommonPerson_BeneficiaryPersonID.[DisplayName] AS [BeneficiaryPerson],
    mjBizAppsCommonOrganization_BeneficiaryOrganizationID.[Name] AS [BeneficiaryOrganization]
FROM
    [${flyway:defaultSchema}].[EntitlementGrant] AS e
INNER JOIN
    [${flyway:defaultSchema}].[ProductEntitlement] AS mjBizAppsOrdersProductEntitlement_ProductEntitlementID
  ON
    [e].[ProductEntitlementID] = mjBizAppsOrdersProductEntitlement_ProductEntitlementID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[Subscription] AS mjBizAppsOrdersSubscription_SubscriptionID
  ON
    [e].[SubscriptionID] = mjBizAppsOrdersSubscription_SubscriptionID.[ID]
LEFT OUTER JOIN
    [${mjSchema}_BizAppsCommon].[Person] AS mjBizAppsCommonPerson_BeneficiaryPersonID
  ON
    [e].[BeneficiaryPersonID] = mjBizAppsCommonPerson_BeneficiaryPersonID.[ID]
LEFT OUTER JOIN
    [${mjSchema}_BizAppsCommon].[Organization] AS mjBizAppsCommonOrganization_BeneficiaryOrganizationID
  ON
    [e].[BeneficiaryOrganizationID] = mjBizAppsCommonOrganization_BeneficiaryOrganizationID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwEntitlementGrants] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for MJ_BizApps_Orders: Entitlement Grants */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Entitlement Grants
-- Item: Permissions for vwEntitlementGrants
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwEntitlementGrants] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for MJ_BizApps_Orders: Entitlement Grants */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Entitlement Grants
-- Item: spCreateEntitlementGrant
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR EntitlementGrant
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateEntitlementGrant]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateEntitlementGrant];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateEntitlementGrant]
    @ID uniqueidentifier = NULL,
    @ProductEntitlementID uniqueidentifier,
    @OrderLineID_Clear bit = 0,
    @OrderLineID uniqueidentifier = NULL,
    @SubscriptionID_Clear bit = 0,
    @SubscriptionID uniqueidentifier = NULL,
    @BeneficiaryPersonID_Clear bit = 0,
    @BeneficiaryPersonID uniqueidentifier = NULL,
    @BeneficiaryOrganizationID_Clear bit = 0,
    @BeneficiaryOrganizationID uniqueidentifier = NULL,
    @Quantity_Clear bit = 0,
    @Quantity decimal(18, 4) = NULL,
    @ValidFrom_Clear bit = 0,
    @ValidFrom datetimeoffset = NULL,
    @ValidTo_Clear bit = 0,
    @ValidTo datetimeoffset = NULL,
    @Status nvarchar(20) = NULL,
    @ProvisionedAt_Clear bit = 0,
    @ProvisionedAt datetimeoffset = NULL,
    @ValidityModeApplied_Clear bit = 0,
    @ValidityModeApplied nvarchar(20) = NULL,
    @SubscriptionTermID_Clear bit = 0,
    @SubscriptionTermID uniqueidentifier = NULL,
    @RevokedAt_Clear bit = 0,
    @RevokedAt datetimeoffset = NULL,
    @RevocationReason_Clear bit = 0,
    @RevocationReason nvarchar(300) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)

    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[EntitlementGrant]
            (
                [ID],
                [ProductEntitlementID],
                [OrderLineID],
                [SubscriptionID],
                [BeneficiaryPersonID],
                [BeneficiaryOrganizationID],
                [Quantity],
                [ValidFrom],
                [ValidTo],
                [Status],
                [ProvisionedAt],
                [ValidityModeApplied],
                [SubscriptionTermID],
                [RevokedAt],
                [RevocationReason]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @ProductEntitlementID,
                CASE WHEN @OrderLineID_Clear = 1 THEN NULL ELSE ISNULL(@OrderLineID, NULL) END,
                CASE WHEN @SubscriptionID_Clear = 1 THEN NULL ELSE ISNULL(@SubscriptionID, NULL) END,
                CASE WHEN @BeneficiaryPersonID_Clear = 1 THEN NULL ELSE ISNULL(@BeneficiaryPersonID, NULL) END,
                CASE WHEN @BeneficiaryOrganizationID_Clear = 1 THEN NULL ELSE ISNULL(@BeneficiaryOrganizationID, NULL) END,
                CASE WHEN @Quantity_Clear = 1 THEN NULL ELSE ISNULL(@Quantity, NULL) END,
                CASE WHEN @ValidFrom_Clear = 1 THEN NULL ELSE ISNULL(@ValidFrom, NULL) END,
                CASE WHEN @ValidTo_Clear = 1 THEN NULL ELSE ISNULL(@ValidTo, NULL) END,
                ISNULL(@Status, 'Active'),
                CASE WHEN @ProvisionedAt_Clear = 1 THEN NULL ELSE ISNULL(@ProvisionedAt, NULL) END,
                CASE WHEN @ValidityModeApplied_Clear = 1 THEN NULL ELSE ISNULL(@ValidityModeApplied, NULL) END,
                CASE WHEN @SubscriptionTermID_Clear = 1 THEN NULL ELSE ISNULL(@SubscriptionTermID, NULL) END,
                CASE WHEN @RevokedAt_Clear = 1 THEN NULL ELSE ISNULL(@RevokedAt, NULL) END,
                CASE WHEN @RevocationReason_Clear = 1 THEN NULL ELSE ISNULL(@RevocationReason, NULL) END
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[EntitlementGrant]
            (
                [ProductEntitlementID],
                [OrderLineID],
                [SubscriptionID],
                [BeneficiaryPersonID],
                [BeneficiaryOrganizationID],
                [Quantity],
                [ValidFrom],
                [ValidTo],
                [Status],
                [ProvisionedAt],
                [ValidityModeApplied],
                [SubscriptionTermID],
                [RevokedAt],
                [RevocationReason]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ProductEntitlementID,
                CASE WHEN @OrderLineID_Clear = 1 THEN NULL ELSE ISNULL(@OrderLineID, NULL) END,
                CASE WHEN @SubscriptionID_Clear = 1 THEN NULL ELSE ISNULL(@SubscriptionID, NULL) END,
                CASE WHEN @BeneficiaryPersonID_Clear = 1 THEN NULL ELSE ISNULL(@BeneficiaryPersonID, NULL) END,
                CASE WHEN @BeneficiaryOrganizationID_Clear = 1 THEN NULL ELSE ISNULL(@BeneficiaryOrganizationID, NULL) END,
                CASE WHEN @Quantity_Clear = 1 THEN NULL ELSE ISNULL(@Quantity, NULL) END,
                CASE WHEN @ValidFrom_Clear = 1 THEN NULL ELSE ISNULL(@ValidFrom, NULL) END,
                CASE WHEN @ValidTo_Clear = 1 THEN NULL ELSE ISNULL(@ValidTo, NULL) END,
                ISNULL(@Status, 'Active'),
                CASE WHEN @ProvisionedAt_Clear = 1 THEN NULL ELSE ISNULL(@ProvisionedAt, NULL) END,
                CASE WHEN @ValidityModeApplied_Clear = 1 THEN NULL ELSE ISNULL(@ValidityModeApplied, NULL) END,
                CASE WHEN @SubscriptionTermID_Clear = 1 THEN NULL ELSE ISNULL(@SubscriptionTermID, NULL) END,
                CASE WHEN @RevokedAt_Clear = 1 THEN NULL ELSE ISNULL(@RevokedAt, NULL) END,
                CASE WHEN @RevocationReason_Clear = 1 THEN NULL ELSE ISNULL(@RevocationReason, NULL) END
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwEntitlementGrants] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateEntitlementGrant] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ_BizApps_Orders: Entitlement Grants */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateEntitlementGrant] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for MJ_BizApps_Orders: Entitlement Grants */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Entitlement Grants
-- Item: spUpdateEntitlementGrant
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR EntitlementGrant
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateEntitlementGrant]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateEntitlementGrant];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateEntitlementGrant]
    @ID uniqueidentifier,
    @ProductEntitlementID uniqueidentifier = NULL,
    @OrderLineID_Clear bit = 0,
    @OrderLineID uniqueidentifier = NULL,
    @SubscriptionID_Clear bit = 0,
    @SubscriptionID uniqueidentifier = NULL,
    @BeneficiaryPersonID_Clear bit = 0,
    @BeneficiaryPersonID uniqueidentifier = NULL,
    @BeneficiaryOrganizationID_Clear bit = 0,
    @BeneficiaryOrganizationID uniqueidentifier = NULL,
    @Quantity_Clear bit = 0,
    @Quantity decimal(18, 4) = NULL,
    @ValidFrom_Clear bit = 0,
    @ValidFrom datetimeoffset = NULL,
    @ValidTo_Clear bit = 0,
    @ValidTo datetimeoffset = NULL,
    @Status nvarchar(20) = NULL,
    @ProvisionedAt_Clear bit = 0,
    @ProvisionedAt datetimeoffset = NULL,
    @ValidityModeApplied_Clear bit = 0,
    @ValidityModeApplied nvarchar(20) = NULL,
    @SubscriptionTermID_Clear bit = 0,
    @SubscriptionTermID uniqueidentifier = NULL,
    @RevokedAt_Clear bit = 0,
    @RevokedAt datetimeoffset = NULL,
    @RevocationReason_Clear bit = 0,
    @RevocationReason nvarchar(300) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[EntitlementGrant]
    SET
        [ProductEntitlementID] = ISNULL(@ProductEntitlementID, [ProductEntitlementID]),
        [OrderLineID] = CASE WHEN @OrderLineID_Clear = 1 THEN NULL ELSE ISNULL(@OrderLineID, [OrderLineID]) END,
        [SubscriptionID] = CASE WHEN @SubscriptionID_Clear = 1 THEN NULL ELSE ISNULL(@SubscriptionID, [SubscriptionID]) END,
        [BeneficiaryPersonID] = CASE WHEN @BeneficiaryPersonID_Clear = 1 THEN NULL ELSE ISNULL(@BeneficiaryPersonID, [BeneficiaryPersonID]) END,
        [BeneficiaryOrganizationID] = CASE WHEN @BeneficiaryOrganizationID_Clear = 1 THEN NULL ELSE ISNULL(@BeneficiaryOrganizationID, [BeneficiaryOrganizationID]) END,
        [Quantity] = CASE WHEN @Quantity_Clear = 1 THEN NULL ELSE ISNULL(@Quantity, [Quantity]) END,
        [ValidFrom] = CASE WHEN @ValidFrom_Clear = 1 THEN NULL ELSE ISNULL(@ValidFrom, [ValidFrom]) END,
        [ValidTo] = CASE WHEN @ValidTo_Clear = 1 THEN NULL ELSE ISNULL(@ValidTo, [ValidTo]) END,
        [Status] = ISNULL(@Status, [Status]),
        [ProvisionedAt] = CASE WHEN @ProvisionedAt_Clear = 1 THEN NULL ELSE ISNULL(@ProvisionedAt, [ProvisionedAt]) END,
        [ValidityModeApplied] = CASE WHEN @ValidityModeApplied_Clear = 1 THEN NULL ELSE ISNULL(@ValidityModeApplied, [ValidityModeApplied]) END,
        [SubscriptionTermID] = CASE WHEN @SubscriptionTermID_Clear = 1 THEN NULL ELSE ISNULL(@SubscriptionTermID, [SubscriptionTermID]) END,
        [RevokedAt] = CASE WHEN @RevokedAt_Clear = 1 THEN NULL ELSE ISNULL(@RevokedAt, [RevokedAt]) END,
        [RevocationReason] = CASE WHEN @RevocationReason_Clear = 1 THEN NULL ELSE ISNULL(@RevocationReason, [RevocationReason]) END
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwEntitlementGrants] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwEntitlementGrants]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateEntitlementGrant] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the EntitlementGrant table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateEntitlementGrant]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateEntitlementGrant];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateEntitlementGrant
ON [${flyway:defaultSchema}].[EntitlementGrant]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[EntitlementGrant]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[EntitlementGrant] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for MJ_BizApps_Orders: Entitlement Grants */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateEntitlementGrant] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for MJ_BizApps_Orders: Entitlement Grants */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Entitlement Grants
-- Item: spDeleteEntitlementGrant
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR EntitlementGrant
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteEntitlementGrant]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteEntitlementGrant];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteEntitlementGrant]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[EntitlementGrant]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteEntitlementGrant] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for MJ_BizApps_Orders: Entitlement Grants */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteEntitlementGrant] TO [cdp_Developer], [cdp_Integration];

/* Index for Foreign Keys for OrderAdjustment */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Order Adjustments
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key OrderHeaderID in table OrderAdjustment
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_OrderAdjustment_OrderHeaderID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[OrderAdjustment]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_OrderAdjustment_OrderHeaderID ON [${flyway:defaultSchema}].[OrderAdjustment] ([OrderHeaderID]);

-- Index for foreign key OrderLineID in table OrderAdjustment
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_OrderAdjustment_OrderLineID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[OrderAdjustment]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_OrderAdjustment_OrderLineID ON [${flyway:defaultSchema}].[OrderAdjustment] ([OrderLineID]);

-- Index for foreign key PromotionID in table OrderAdjustment
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_OrderAdjustment_PromotionID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[OrderAdjustment]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_OrderAdjustment_PromotionID ON [${flyway:defaultSchema}].[OrderAdjustment] ([PromotionID]);

-- Index for foreign key PromotionCodeID in table OrderAdjustment
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_OrderAdjustment_PromotionCodeID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[OrderAdjustment]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_OrderAdjustment_PromotionCodeID ON [${flyway:defaultSchema}].[OrderAdjustment] ([PromotionCodeID]);

-- Index for foreign key AuthorizedBySalesAuthorityID in table OrderAdjustment
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_OrderAdjustment_AuthorizedBySalesAuthorityID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[OrderAdjustment]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_OrderAdjustment_AuthorizedBySalesAuthorityID ON [${flyway:defaultSchema}].[OrderAdjustment] ([AuthorizedBySalesAuthorityID]);

/* Index for Foreign Keys for OrderCharge */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Order Charges
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key OrderHeaderID in table OrderCharge
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_OrderCharge_OrderHeaderID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[OrderCharge]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_OrderCharge_OrderHeaderID ON [${flyway:defaultSchema}].[OrderCharge] ([OrderHeaderID]);

-- Index for foreign key ChargeTypeID in table OrderCharge
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_OrderCharge_ChargeTypeID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[OrderCharge]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_OrderCharge_ChargeTypeID ON [${flyway:defaultSchema}].[OrderCharge] ([ChargeTypeID]);

/* Base View SQL for MJ_BizApps_Orders: Order Adjustments */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Order Adjustments
-- Item: vwOrderAdjustments
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ_BizApps_Orders: Order Adjustments
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  OrderAdjustment
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwOrderAdjustments]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwOrderAdjustments];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwOrderAdjustments]
AS
SELECT
    o.*,
    mjBizAppsOrdersOrderHeader_OrderHeaderID.[OrderNumber] AS [OrderHeader],
    mjBizAppsOrdersPromotion_PromotionID.[Name] AS [Promotion],
    mjBizAppsOrdersPromotionCode_PromotionCodeID.[Code] AS [PromotionCode]
FROM
    [${flyway:defaultSchema}].[OrderAdjustment] AS o
INNER JOIN
    [${flyway:defaultSchema}].[OrderHeader] AS mjBizAppsOrdersOrderHeader_OrderHeaderID
  ON
    [o].[OrderHeaderID] = mjBizAppsOrdersOrderHeader_OrderHeaderID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[Promotion] AS mjBizAppsOrdersPromotion_PromotionID
  ON
    [o].[PromotionID] = mjBizAppsOrdersPromotion_PromotionID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[PromotionCode] AS mjBizAppsOrdersPromotionCode_PromotionCodeID
  ON
    [o].[PromotionCodeID] = mjBizAppsOrdersPromotionCode_PromotionCodeID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwOrderAdjustments] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for MJ_BizApps_Orders: Order Adjustments */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Order Adjustments
-- Item: Permissions for vwOrderAdjustments
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwOrderAdjustments] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for MJ_BizApps_Orders: Order Adjustments */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Order Adjustments
-- Item: spCreateOrderAdjustment
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR OrderAdjustment
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateOrderAdjustment]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateOrderAdjustment];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateOrderAdjustment]
    @ID uniqueidentifier = NULL,
    @OrderHeaderID uniqueidentifier,
    @OrderLineID_Clear bit = 0,
    @OrderLineID uniqueidentifier = NULL,
    @PromotionID_Clear bit = 0,
    @PromotionID uniqueidentifier = NULL,
    @PromotionCodeID_Clear bit = 0,
    @PromotionCodeID uniqueidentifier = NULL,
    @Amount decimal(19, 4),
    @Sequence int = NULL,
    @Reason_Clear bit = 0,
    @Reason nvarchar(MAX) = NULL,
    @AppliedByUserID_Clear bit = 0,
    @AppliedByUserID uniqueidentifier = NULL,
    @AppliedAt datetimeoffset = NULL,
    @AuthorizedBySalesAuthorityID_Clear bit = 0,
    @AuthorizedBySalesAuthorityID uniqueidentifier = NULL,
    @ApprovedByUserID_Clear bit = 0,
    @ApprovedByUserID uniqueidentifier = NULL,
    @ApprovedAt_Clear bit = 0,
    @ApprovedAt datetimeoffset = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)

    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[OrderAdjustment]
            (
                [ID],
                [OrderHeaderID],
                [OrderLineID],
                [PromotionID],
                [PromotionCodeID],
                [Amount],
                [Sequence],
                [Reason],
                [AppliedByUserID],
                [AppliedAt],
                [AuthorizedBySalesAuthorityID],
                [ApprovedByUserID],
                [ApprovedAt]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @OrderHeaderID,
                CASE WHEN @OrderLineID_Clear = 1 THEN NULL ELSE ISNULL(@OrderLineID, NULL) END,
                CASE WHEN @PromotionID_Clear = 1 THEN NULL ELSE ISNULL(@PromotionID, NULL) END,
                CASE WHEN @PromotionCodeID_Clear = 1 THEN NULL ELSE ISNULL(@PromotionCodeID, NULL) END,
                @Amount,
                ISNULL(@Sequence, 0),
                CASE WHEN @Reason_Clear = 1 THEN NULL ELSE ISNULL(@Reason, NULL) END,
                CASE WHEN @AppliedByUserID_Clear = 1 THEN NULL ELSE ISNULL(@AppliedByUserID, NULL) END,
                ISNULL(@AppliedAt, sysdatetimeoffset()),
                CASE WHEN @AuthorizedBySalesAuthorityID_Clear = 1 THEN NULL ELSE ISNULL(@AuthorizedBySalesAuthorityID, NULL) END,
                CASE WHEN @ApprovedByUserID_Clear = 1 THEN NULL ELSE ISNULL(@ApprovedByUserID, NULL) END,
                CASE WHEN @ApprovedAt_Clear = 1 THEN NULL ELSE ISNULL(@ApprovedAt, NULL) END
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[OrderAdjustment]
            (
                [OrderHeaderID],
                [OrderLineID],
                [PromotionID],
                [PromotionCodeID],
                [Amount],
                [Sequence],
                [Reason],
                [AppliedByUserID],
                [AppliedAt],
                [AuthorizedBySalesAuthorityID],
                [ApprovedByUserID],
                [ApprovedAt]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @OrderHeaderID,
                CASE WHEN @OrderLineID_Clear = 1 THEN NULL ELSE ISNULL(@OrderLineID, NULL) END,
                CASE WHEN @PromotionID_Clear = 1 THEN NULL ELSE ISNULL(@PromotionID, NULL) END,
                CASE WHEN @PromotionCodeID_Clear = 1 THEN NULL ELSE ISNULL(@PromotionCodeID, NULL) END,
                @Amount,
                ISNULL(@Sequence, 0),
                CASE WHEN @Reason_Clear = 1 THEN NULL ELSE ISNULL(@Reason, NULL) END,
                CASE WHEN @AppliedByUserID_Clear = 1 THEN NULL ELSE ISNULL(@AppliedByUserID, NULL) END,
                ISNULL(@AppliedAt, sysdatetimeoffset()),
                CASE WHEN @AuthorizedBySalesAuthorityID_Clear = 1 THEN NULL ELSE ISNULL(@AuthorizedBySalesAuthorityID, NULL) END,
                CASE WHEN @ApprovedByUserID_Clear = 1 THEN NULL ELSE ISNULL(@ApprovedByUserID, NULL) END,
                CASE WHEN @ApprovedAt_Clear = 1 THEN NULL ELSE ISNULL(@ApprovedAt, NULL) END
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwOrderAdjustments] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateOrderAdjustment] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ_BizApps_Orders: Order Adjustments */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateOrderAdjustment] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for MJ_BizApps_Orders: Order Adjustments */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Order Adjustments
-- Item: spUpdateOrderAdjustment
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR OrderAdjustment
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateOrderAdjustment]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateOrderAdjustment];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateOrderAdjustment]
    @ID uniqueidentifier,
    @OrderHeaderID uniqueidentifier = NULL,
    @OrderLineID_Clear bit = 0,
    @OrderLineID uniqueidentifier = NULL,
    @PromotionID_Clear bit = 0,
    @PromotionID uniqueidentifier = NULL,
    @PromotionCodeID_Clear bit = 0,
    @PromotionCodeID uniqueidentifier = NULL,
    @Amount decimal(19, 4) = NULL,
    @Sequence int = NULL,
    @Reason_Clear bit = 0,
    @Reason nvarchar(MAX) = NULL,
    @AppliedByUserID_Clear bit = 0,
    @AppliedByUserID uniqueidentifier = NULL,
    @AppliedAt datetimeoffset = NULL,
    @AuthorizedBySalesAuthorityID_Clear bit = 0,
    @AuthorizedBySalesAuthorityID uniqueidentifier = NULL,
    @ApprovedByUserID_Clear bit = 0,
    @ApprovedByUserID uniqueidentifier = NULL,
    @ApprovedAt_Clear bit = 0,
    @ApprovedAt datetimeoffset = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[OrderAdjustment]
    SET
        [OrderHeaderID] = ISNULL(@OrderHeaderID, [OrderHeaderID]),
        [OrderLineID] = CASE WHEN @OrderLineID_Clear = 1 THEN NULL ELSE ISNULL(@OrderLineID, [OrderLineID]) END,
        [PromotionID] = CASE WHEN @PromotionID_Clear = 1 THEN NULL ELSE ISNULL(@PromotionID, [PromotionID]) END,
        [PromotionCodeID] = CASE WHEN @PromotionCodeID_Clear = 1 THEN NULL ELSE ISNULL(@PromotionCodeID, [PromotionCodeID]) END,
        [Amount] = ISNULL(@Amount, [Amount]),
        [Sequence] = ISNULL(@Sequence, [Sequence]),
        [Reason] = CASE WHEN @Reason_Clear = 1 THEN NULL ELSE ISNULL(@Reason, [Reason]) END,
        [AppliedByUserID] = CASE WHEN @AppliedByUserID_Clear = 1 THEN NULL ELSE ISNULL(@AppliedByUserID, [AppliedByUserID]) END,
        [AppliedAt] = ISNULL(@AppliedAt, [AppliedAt]),
        [AuthorizedBySalesAuthorityID] = CASE WHEN @AuthorizedBySalesAuthorityID_Clear = 1 THEN NULL ELSE ISNULL(@AuthorizedBySalesAuthorityID, [AuthorizedBySalesAuthorityID]) END,
        [ApprovedByUserID] = CASE WHEN @ApprovedByUserID_Clear = 1 THEN NULL ELSE ISNULL(@ApprovedByUserID, [ApprovedByUserID]) END,
        [ApprovedAt] = CASE WHEN @ApprovedAt_Clear = 1 THEN NULL ELSE ISNULL(@ApprovedAt, [ApprovedAt]) END
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwOrderAdjustments] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwOrderAdjustments]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateOrderAdjustment] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the OrderAdjustment table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateOrderAdjustment]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateOrderAdjustment];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateOrderAdjustment
ON [${flyway:defaultSchema}].[OrderAdjustment]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[OrderAdjustment]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[OrderAdjustment] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for MJ_BizApps_Orders: Order Adjustments */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateOrderAdjustment] TO [cdp_Developer], [cdp_Integration];

/* Base View SQL for MJ_BizApps_Orders: Order Charges */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Order Charges
-- Item: vwOrderCharges
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ_BizApps_Orders: Order Charges
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  OrderCharge
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwOrderCharges]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwOrderCharges];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwOrderCharges]
AS
SELECT
    o.*,
    mjBizAppsOrdersOrderHeader_OrderHeaderID.[OrderNumber] AS [OrderHeader],
    mjBizAppsOrdersChargeType_ChargeTypeID.[Name] AS [ChargeType]
FROM
    [${flyway:defaultSchema}].[OrderCharge] AS o
INNER JOIN
    [${flyway:defaultSchema}].[OrderHeader] AS mjBizAppsOrdersOrderHeader_OrderHeaderID
  ON
    [o].[OrderHeaderID] = mjBizAppsOrdersOrderHeader_OrderHeaderID.[ID]
INNER JOIN
    [${flyway:defaultSchema}].[ChargeType] AS mjBizAppsOrdersChargeType_ChargeTypeID
  ON
    [o].[ChargeTypeID] = mjBizAppsOrdersChargeType_ChargeTypeID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwOrderCharges] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for MJ_BizApps_Orders: Order Charges */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Order Charges
-- Item: Permissions for vwOrderCharges
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwOrderCharges] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for MJ_BizApps_Orders: Order Charges */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Order Charges
-- Item: spCreateOrderCharge
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR OrderCharge
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateOrderCharge]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateOrderCharge];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateOrderCharge]
    @ID uniqueidentifier = NULL,
    @OrderHeaderID uniqueidentifier,
    @ChargeTypeID uniqueidentifier,
    @Amount decimal(19, 4),
    @BasisAmount_Clear bit = 0,
    @BasisAmount decimal(19, 4) = NULL,
    @Rate_Clear bit = 0,
    @Rate decimal(9, 6) = NULL,
    @Sequence int = NULL,
    @TaxJurisdictionID_Clear bit = 0,
    @TaxJurisdictionID uniqueidentifier = NULL,
    @TaxRateID_Clear bit = 0,
    @TaxRateID uniqueidentifier = NULL,
    @CalculationSource nvarchar(50) = NULL,
    @IsOverridden bit = NULL,
    @ComputedAmount_Clear bit = 0,
    @ComputedAmount decimal(19, 4) = NULL,
    @OverrideReason_Clear bit = 0,
    @OverrideReason nvarchar(MAX) = NULL,
    @OverriddenByUserID_Clear bit = 0,
    @OverriddenByUserID uniqueidentifier = NULL,
    @OverriddenAt_Clear bit = 0,
    @OverriddenAt datetimeoffset = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)

    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[OrderCharge]
            (
                [ID],
                [OrderHeaderID],
                [ChargeTypeID],
                [Amount],
                [BasisAmount],
                [Rate],
                [Sequence],
                [TaxJurisdictionID],
                [TaxRateID],
                [CalculationSource],
                [IsOverridden],
                [ComputedAmount],
                [OverrideReason],
                [OverriddenByUserID],
                [OverriddenAt]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @OrderHeaderID,
                @ChargeTypeID,
                @Amount,
                CASE WHEN @BasisAmount_Clear = 1 THEN NULL ELSE ISNULL(@BasisAmount, NULL) END,
                CASE WHEN @Rate_Clear = 1 THEN NULL ELSE ISNULL(@Rate, NULL) END,
                ISNULL(@Sequence, 0),
                CASE WHEN @TaxJurisdictionID_Clear = 1 THEN NULL ELSE ISNULL(@TaxJurisdictionID, NULL) END,
                CASE WHEN @TaxRateID_Clear = 1 THEN NULL ELSE ISNULL(@TaxRateID, NULL) END,
                ISNULL(@CalculationSource, 'Internal'),
                ISNULL(@IsOverridden, 0),
                CASE WHEN @ComputedAmount_Clear = 1 THEN NULL ELSE ISNULL(@ComputedAmount, NULL) END,
                CASE WHEN @OverrideReason_Clear = 1 THEN NULL ELSE ISNULL(@OverrideReason, NULL) END,
                CASE WHEN @OverriddenByUserID_Clear = 1 THEN NULL ELSE ISNULL(@OverriddenByUserID, NULL) END,
                CASE WHEN @OverriddenAt_Clear = 1 THEN NULL ELSE ISNULL(@OverriddenAt, NULL) END
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[OrderCharge]
            (
                [OrderHeaderID],
                [ChargeTypeID],
                [Amount],
                [BasisAmount],
                [Rate],
                [Sequence],
                [TaxJurisdictionID],
                [TaxRateID],
                [CalculationSource],
                [IsOverridden],
                [ComputedAmount],
                [OverrideReason],
                [OverriddenByUserID],
                [OverriddenAt]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @OrderHeaderID,
                @ChargeTypeID,
                @Amount,
                CASE WHEN @BasisAmount_Clear = 1 THEN NULL ELSE ISNULL(@BasisAmount, NULL) END,
                CASE WHEN @Rate_Clear = 1 THEN NULL ELSE ISNULL(@Rate, NULL) END,
                ISNULL(@Sequence, 0),
                CASE WHEN @TaxJurisdictionID_Clear = 1 THEN NULL ELSE ISNULL(@TaxJurisdictionID, NULL) END,
                CASE WHEN @TaxRateID_Clear = 1 THEN NULL ELSE ISNULL(@TaxRateID, NULL) END,
                ISNULL(@CalculationSource, 'Internal'),
                ISNULL(@IsOverridden, 0),
                CASE WHEN @ComputedAmount_Clear = 1 THEN NULL ELSE ISNULL(@ComputedAmount, NULL) END,
                CASE WHEN @OverrideReason_Clear = 1 THEN NULL ELSE ISNULL(@OverrideReason, NULL) END,
                CASE WHEN @OverriddenByUserID_Clear = 1 THEN NULL ELSE ISNULL(@OverriddenByUserID, NULL) END,
                CASE WHEN @OverriddenAt_Clear = 1 THEN NULL ELSE ISNULL(@OverriddenAt, NULL) END
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwOrderCharges] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateOrderCharge] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ_BizApps_Orders: Order Charges */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateOrderCharge] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for MJ_BizApps_Orders: Order Charges */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Order Charges
-- Item: spUpdateOrderCharge
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR OrderCharge
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateOrderCharge]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateOrderCharge];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateOrderCharge]
    @ID uniqueidentifier,
    @OrderHeaderID uniqueidentifier = NULL,
    @ChargeTypeID uniqueidentifier = NULL,
    @Amount decimal(19, 4) = NULL,
    @BasisAmount_Clear bit = 0,
    @BasisAmount decimal(19, 4) = NULL,
    @Rate_Clear bit = 0,
    @Rate decimal(9, 6) = NULL,
    @Sequence int = NULL,
    @TaxJurisdictionID_Clear bit = 0,
    @TaxJurisdictionID uniqueidentifier = NULL,
    @TaxRateID_Clear bit = 0,
    @TaxRateID uniqueidentifier = NULL,
    @CalculationSource nvarchar(50) = NULL,
    @IsOverridden bit = NULL,
    @ComputedAmount_Clear bit = 0,
    @ComputedAmount decimal(19, 4) = NULL,
    @OverrideReason_Clear bit = 0,
    @OverrideReason nvarchar(MAX) = NULL,
    @OverriddenByUserID_Clear bit = 0,
    @OverriddenByUserID uniqueidentifier = NULL,
    @OverriddenAt_Clear bit = 0,
    @OverriddenAt datetimeoffset = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[OrderCharge]
    SET
        [OrderHeaderID] = ISNULL(@OrderHeaderID, [OrderHeaderID]),
        [ChargeTypeID] = ISNULL(@ChargeTypeID, [ChargeTypeID]),
        [Amount] = ISNULL(@Amount, [Amount]),
        [BasisAmount] = CASE WHEN @BasisAmount_Clear = 1 THEN NULL ELSE ISNULL(@BasisAmount, [BasisAmount]) END,
        [Rate] = CASE WHEN @Rate_Clear = 1 THEN NULL ELSE ISNULL(@Rate, [Rate]) END,
        [Sequence] = ISNULL(@Sequence, [Sequence]),
        [TaxJurisdictionID] = CASE WHEN @TaxJurisdictionID_Clear = 1 THEN NULL ELSE ISNULL(@TaxJurisdictionID, [TaxJurisdictionID]) END,
        [TaxRateID] = CASE WHEN @TaxRateID_Clear = 1 THEN NULL ELSE ISNULL(@TaxRateID, [TaxRateID]) END,
        [CalculationSource] = ISNULL(@CalculationSource, [CalculationSource]),
        [IsOverridden] = ISNULL(@IsOverridden, [IsOverridden]),
        [ComputedAmount] = CASE WHEN @ComputedAmount_Clear = 1 THEN NULL ELSE ISNULL(@ComputedAmount, [ComputedAmount]) END,
        [OverrideReason] = CASE WHEN @OverrideReason_Clear = 1 THEN NULL ELSE ISNULL(@OverrideReason, [OverrideReason]) END,
        [OverriddenByUserID] = CASE WHEN @OverriddenByUserID_Clear = 1 THEN NULL ELSE ISNULL(@OverriddenByUserID, [OverriddenByUserID]) END,
        [OverriddenAt] = CASE WHEN @OverriddenAt_Clear = 1 THEN NULL ELSE ISNULL(@OverriddenAt, [OverriddenAt]) END
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwOrderCharges] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwOrderCharges]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateOrderCharge] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the OrderCharge table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateOrderCharge]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateOrderCharge];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateOrderCharge
ON [${flyway:defaultSchema}].[OrderCharge]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[OrderCharge]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[OrderCharge] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for MJ_BizApps_Orders: Order Charges */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateOrderCharge] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for MJ_BizApps_Orders: Order Adjustments */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Order Adjustments
-- Item: spDeleteOrderAdjustment
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR OrderAdjustment
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteOrderAdjustment]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteOrderAdjustment];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteOrderAdjustment]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[OrderAdjustment]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteOrderAdjustment] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for MJ_BizApps_Orders: Order Adjustments */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteOrderAdjustment] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for MJ_BizApps_Orders: Order Charges */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Order Charges
-- Item: spDeleteOrderCharge
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR OrderCharge
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteOrderCharge]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteOrderCharge];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteOrderCharge]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[OrderCharge]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteOrderCharge] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for MJ_BizApps_Orders: Order Charges */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteOrderCharge] TO [cdp_Developer], [cdp_Integration];

/* Index for Foreign Keys for OrderHeader */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Order Headers
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key CompanyID in table OrderHeader
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_OrderHeader_CompanyID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[OrderHeader]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_OrderHeader_CompanyID ON [${flyway:defaultSchema}].[OrderHeader] ([CompanyID]);

-- Index for foreign key BillToPersonID in table OrderHeader
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_OrderHeader_BillToPersonID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[OrderHeader]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_OrderHeader_BillToPersonID ON [${flyway:defaultSchema}].[OrderHeader] ([BillToPersonID]);

-- Index for foreign key BillToOrganizationID in table OrderHeader
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_OrderHeader_BillToOrganizationID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[OrderHeader]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_OrderHeader_BillToOrganizationID ON [${flyway:defaultSchema}].[OrderHeader] ([BillToOrganizationID]);

-- Index for foreign key SalesRepUserID in table OrderHeader
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_OrderHeader_SalesRepUserID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[OrderHeader]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_OrderHeader_SalesRepUserID ON [${flyway:defaultSchema}].[OrderHeader] ([SalesRepUserID]);

-- Index for foreign key BillToAddressID in table OrderHeader
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_OrderHeader_BillToAddressID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[OrderHeader]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_OrderHeader_BillToAddressID ON [${flyway:defaultSchema}].[OrderHeader] ([BillToAddressID]);

-- Index for foreign key ShipToAddressID in table OrderHeader
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_OrderHeader_ShipToAddressID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[OrderHeader]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_OrderHeader_ShipToAddressID ON [${flyway:defaultSchema}].[OrderHeader] ([ShipToAddressID]);

-- Index for foreign key ShipToOrganizationID in table OrderHeader
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_OrderHeader_ShipToOrganizationID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[OrderHeader]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_OrderHeader_ShipToOrganizationID ON [${flyway:defaultSchema}].[OrderHeader] ([ShipToOrganizationID]);

-- Index for foreign key ShipToPersonID in table OrderHeader
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_OrderHeader_ShipToPersonID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[OrderHeader]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_OrderHeader_ShipToPersonID ON [${flyway:defaultSchema}].[OrderHeader] ([ShipToPersonID]);

-- Index for foreign key PaymentTermsTypeID in table OrderHeader
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_OrderHeader_PaymentTermsTypeID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[OrderHeader]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_OrderHeader_PaymentTermsTypeID ON [${flyway:defaultSchema}].[OrderHeader] ([PaymentTermsTypeID]);

-- Index for foreign key InitialPaymentTypeID in table OrderHeader
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_OrderHeader_InitialPaymentTypeID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[OrderHeader]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_OrderHeader_InitialPaymentTypeID ON [${flyway:defaultSchema}].[OrderHeader] ([InitialPaymentTypeID]);

-- Index for foreign key InitialPaymentDetailID in table OrderHeader
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_OrderHeader_InitialPaymentDetailID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[OrderHeader]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_OrderHeader_InitialPaymentDetailID ON [${flyway:defaultSchema}].[OrderHeader] ([InitialPaymentDetailID]);

-- Index for foreign key PostedByUserID in table OrderHeader
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_OrderHeader_PostedByUserID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[OrderHeader]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_OrderHeader_PostedByUserID ON [${flyway:defaultSchema}].[OrderHeader] ([PostedByUserID]);

-- Index for foreign key ReversesOrderHeaderID in table OrderHeader
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_OrderHeader_ReversesOrderHeaderID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[OrderHeader]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_OrderHeader_ReversesOrderHeaderID ON [${flyway:defaultSchema}].[OrderHeader] ([ReversesOrderHeaderID]);

-- Index for foreign key SourceCheckoutWidgetID in table OrderHeader
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_OrderHeader_SourceCheckoutWidgetID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[OrderHeader]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_OrderHeader_SourceCheckoutWidgetID ON [${flyway:defaultSchema}].[OrderHeader] ([SourceCheckoutWidgetID]);

/* SQL text to update entity field related entity name field map for entity field ID 76089782-646E-4B9F-BAEF-2369386BEAAB */
EXEC [${mjSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='76089782-646E-4B9F-BAEF-2369386BEAAB', @RelatedEntityNameFieldMap='SourceCheckoutWidget';

/* Index for Foreign Keys for OrderLine */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Order Lines
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key OrderHeaderID in table OrderLine
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_OrderLine_OrderHeaderID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[OrderLine]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_OrderLine_OrderHeaderID ON [${flyway:defaultSchema}].[OrderLine] ([OrderHeaderID]);

-- Index for foreign key ProductID in table OrderLine
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_OrderLine_ProductID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[OrderLine]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_OrderLine_ProductID ON [${flyway:defaultSchema}].[OrderLine] ([ProductID]);

-- Index for foreign key CompanyID in table OrderLine
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_OrderLine_CompanyID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[OrderLine]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_OrderLine_CompanyID ON [${flyway:defaultSchema}].[OrderLine] ([CompanyID]);

-- Index for foreign key ProductPriceID in table OrderLine
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_OrderLine_ProductPriceID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[OrderLine]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_OrderLine_ProductPriceID ON [${flyway:defaultSchema}].[OrderLine] ([ProductPriceID]);

-- Index for foreign key ShipToOrganizationID in table OrderLine
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_OrderLine_ShipToOrganizationID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[OrderLine]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_OrderLine_ShipToOrganizationID ON [${flyway:defaultSchema}].[OrderLine] ([ShipToOrganizationID]);

-- Index for foreign key ShipToPersonID in table OrderLine
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_OrderLine_ShipToPersonID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[OrderLine]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_OrderLine_ShipToPersonID ON [${flyway:defaultSchema}].[OrderLine] ([ShipToPersonID]);

-- Index for foreign key ReversesOrderLineID in table OrderLine
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_OrderLine_ReversesOrderLineID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[OrderLine]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_OrderLine_ReversesOrderLineID ON [${flyway:defaultSchema}].[OrderLine] ([ReversesOrderLineID]);

-- Index for foreign key SourceBundleProductID in table OrderLine
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_OrderLine_SourceBundleProductID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[OrderLine]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_OrderLine_SourceBundleProductID ON [${flyway:defaultSchema}].[OrderLine] ([SourceBundleProductID]);

-- Index for foreign key ParentOrderLineID in table OrderLine
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_OrderLine_ParentOrderLineID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[OrderLine]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_OrderLine_ParentOrderLineID ON [${flyway:defaultSchema}].[OrderLine] ([ParentOrderLineID]);

-- Index for foreign key SubscriptionID in table OrderLine
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_OrderLine_SubscriptionID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[OrderLine]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_OrderLine_SubscriptionID ON [${flyway:defaultSchema}].[OrderLine] ([SubscriptionID]);

-- Index for foreign key JournalEntryID in table OrderLine
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_OrderLine_JournalEntryID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[OrderLine]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_OrderLine_JournalEntryID ON [${flyway:defaultSchema}].[OrderLine] ([JournalEntryID]);

/* Hierarchy Metadata Function SQL for MJ_BizApps_Orders: Order Lines.ParentOrderLineID */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Order Lines
-- Item: fnOrderLineParentOrderLineID_GetHierarchyMeta
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
------------------------------------------------------------
----- HIERARCHY METADATA FUNCTION FOR: [OrderLine].[ParentOrderLineID]
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[fnOrderLineParentOrderLineID_GetHierarchyMeta]', 'IF') IS NOT NULL
    DROP FUNCTION [${flyway:defaultSchema}].[fnOrderLineParentOrderLineID_GetHierarchyMeta];
GO

CREATE FUNCTION [${flyway:defaultSchema}].[fnOrderLineParentOrderLineID_GetHierarchyMeta]
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
            [ParentOrderLineID],
            0 AS [Depth],
            CAST('/' + CAST([ID] AS NVARCHAR(36)) + '/' AS NVARCHAR(MAX)) AS [Path]
        FROM
            [${flyway:defaultSchema}].[OrderLine]
        WHERE
            [ID] = @RecordID

        UNION ALL

        SELECT
            p.[ID],
            p.[ParentOrderLineID],
            c.[Depth] + 1 AS [Depth],
            CAST('/' + CAST(p.[ID] AS NVARCHAR(36)) + c.[Path] AS NVARCHAR(MAX)) AS [Path]
        FROM
            [${flyway:defaultSchema}].[OrderLine] p
        INNER JOIN
            CTE_Ancestors c ON p.[ID] = c.[ParentOrderLineID]
        WHERE
            c.[Depth] < 100
    )
    SELECT TOP 1
        a.[ID] AS [RootID],
        (SELECT MAX([Depth]) FROM CTE_Ancestors) AS [Depth],
        (SELECT TOP 1 [Path] FROM CTE_Ancestors ORDER BY [Depth] DESC) AS [Path],
        CAST(CASE WHEN EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[OrderLine] WHERE [ParentOrderLineID] = @RecordID) THEN 0 ELSE 1 END AS BIT) AS [IsLeaf],
        (SELECT COUNT(1) FROM [${flyway:defaultSchema}].[OrderLine] WHERE [ParentOrderLineID] = @RecordID) AS [ChildCount]
    FROM
        CTE_Ancestors a
    WHERE
        a.[ParentOrderLineID] IS NULL OR @ParentID IS NULL
    ORDER BY
        a.[Depth] DESC
);
GO

/* Descendants Traversal Function SQL for MJ_BizApps_Orders: Order Lines.ParentOrderLineID */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Order Lines
-- Item: fnOrderLineParentOrderLineID_GetDescendants
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
------------------------------------------------------------
----- DESCENDANTS FUNCTION FOR: [OrderLine].[ParentOrderLineID]
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[fnOrderLineParentOrderLineID_GetDescendants]', 'IF') IS NOT NULL
    DROP FUNCTION [${flyway:defaultSchema}].[fnOrderLineParentOrderLineID_GetDescendants];
GO

CREATE FUNCTION [${flyway:defaultSchema}].[fnOrderLineParentOrderLineID_GetDescendants]
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
            [ParentOrderLineID],
            0 AS [RelativeDepth],
            CAST('/' + CAST([ID] AS NVARCHAR(36)) + '/' AS NVARCHAR(MAX)) AS [Path]
        FROM
            [${flyway:defaultSchema}].[OrderLine]
        WHERE
            [ID] = @RootID

        UNION ALL

        SELECT
            c.[ID],
            c.[ParentOrderLineID],
            p.[RelativeDepth] + 1 AS [RelativeDepth],
            CAST(p.[Path] + CAST(c.[ID] AS NVARCHAR(36)) + '/' AS NVARCHAR(MAX)) AS [Path]
        FROM
            [${flyway:defaultSchema}].[OrderLine] c
        INNER JOIN
            CTE_Descendants p ON c.[ParentOrderLineID] = p.[ID]
        WHERE
            (@MaxDepth IS NULL OR p.[RelativeDepth] < @MaxDepth)
            AND p.[RelativeDepth] < 100
    )
    SELECT
        d.[ID] AS [ID],
        d.[RelativeDepth] AS [Depth],
        d.[Path],
        CAST(CASE WHEN EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[OrderLine] WHERE [ParentOrderLineID] = d.[ID]) THEN 0 ELSE 1 END AS BIT) AS [IsLeaf],
        (SELECT COUNT(1) FROM [${flyway:defaultSchema}].[OrderLine] WHERE [ParentOrderLineID] = d.[ID]) AS [ChildCount]
    FROM
        CTE_Descendants d
);
GO

/* Ancestors Traversal Function SQL for MJ_BizApps_Orders: Order Lines.ParentOrderLineID */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Order Lines
-- Item: fnOrderLineParentOrderLineID_GetAncestors
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
------------------------------------------------------------
----- ANCESTORS FUNCTION FOR: [OrderLine].[ParentOrderLineID]
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[fnOrderLineParentOrderLineID_GetAncestors]', 'IF') IS NOT NULL
    DROP FUNCTION [${flyway:defaultSchema}].[fnOrderLineParentOrderLineID_GetAncestors];
GO

CREATE FUNCTION [${flyway:defaultSchema}].[fnOrderLineParentOrderLineID_GetAncestors]
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
            [ParentOrderLineID],
            0 AS [LevelUp],
            CAST('/' + CAST([ID] AS NVARCHAR(36)) + '/' AS NVARCHAR(MAX)) AS [Path]
        FROM
            [${flyway:defaultSchema}].[OrderLine]
        WHERE
            [ID] = @RecordID

        UNION ALL

        SELECT
            p.[ID],
            p.[ParentOrderLineID],
            c.[LevelUp] + 1 AS [LevelUp],
            CAST('/' + CAST(p.[ID] AS NVARCHAR(36)) + c.[Path] AS NVARCHAR(MAX)) AS [Path]
        FROM
            [${flyway:defaultSchema}].[OrderLine] p
        INNER JOIN
            CTE_Ancestors c ON p.[ID] = c.[ParentOrderLineID]
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

/* Root ID Function SQL for MJ_BizApps_Orders: Order Lines.ParentOrderLineID */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Order Lines
-- Item: fnOrderLineParentOrderLineID_GetRootID
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
------------------------------------------------------------
----- ROOT ID FUNCTION FOR: [OrderLine].[ParentOrderLineID]
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[fnOrderLineParentOrderLineID_GetRootID]', 'IF') IS NOT NULL
    DROP FUNCTION [${flyway:defaultSchema}].[fnOrderLineParentOrderLineID_GetRootID];
GO

CREATE FUNCTION [${flyway:defaultSchema}].[fnOrderLineParentOrderLineID_GetRootID]
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
            [ParentOrderLineID],
            [ID] AS [RootParentID],
            0 AS [Depth]
        FROM
            [${flyway:defaultSchema}].[OrderLine]
        WHERE
            [ID] = COALESCE(@ParentID, @RecordID)

        UNION ALL

        SELECT
            c.[ID],
            c.[ParentOrderLineID],
            c.[ID] AS [RootParentID],
            p.[Depth] + 1 AS [Depth]
        FROM
            [${flyway:defaultSchema}].[OrderLine] c
        INNER JOIN
            CTE_RootParent p ON c.[ID] = p.[ParentOrderLineID]
        WHERE
            p.[Depth] < 100
    )
    SELECT TOP 1
        [RootParentID] AS RootID
    FROM
        CTE_RootParent
    WHERE
        [ParentOrderLineID] IS NULL
    ORDER BY
        [RootParentID]
);
GO

/* Base View SQL for MJ_BizApps_Orders: Order Lines */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Order Lines
-- Item: vwOrderLines
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

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
    mjBizAppsCommonOrganization_ShipToOrganizationID.[Name] AS [ShipToOrganization],
    mjBizAppsCommonPerson_ShipToPersonID.[DisplayName] AS [ShipToPerson],
    mjBizAppsOrdersProduct_SourceBundleProductID.[Name] AS [SourceBundleProduct],
    mjBizAppsOrdersSubscription_SubscriptionID.[SubscriptionNumber] AS [Subscription],
    mjBizAppsAccountingJournalEntry_JournalEntryID.[EntryNumber] AS [JournalEntry],
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
OUTER APPLY
    [${flyway:defaultSchema}].[fnOrderLineParentOrderLineID_GetHierarchyMeta]([o].[ID], [o].[ParentOrderLineID]) AS hier_ParentOrderLineID
GO
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
    @JournalEntryID uniqueidentifier = NULL
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
                [JournalEntryID]
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
                CASE WHEN @JournalEntryID_Clear = 1 THEN NULL ELSE ISNULL(@JournalEntryID, NULL) END
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
                [JournalEntryID]
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
                CASE WHEN @JournalEntryID_Clear = 1 THEN NULL ELSE ISNULL(@JournalEntryID, NULL) END
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwOrderLines] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateOrderLine] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ_BizApps_Orders: Order Lines */

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
    @JournalEntryID uniqueidentifier = NULL
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
        [JournalEntryID] = CASE WHEN @JournalEntryID_Clear = 1 THEN NULL ELSE ISNULL(@JournalEntryID, [JournalEntryID]) END
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

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateOrderLine] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the OrderLine table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateOrderLine]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateOrderLine];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateOrderLine
ON [${flyway:defaultSchema}].[OrderLine]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[OrderLine]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[OrderLine] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for MJ_BizApps_Orders: Order Lines */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateOrderLine] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for MJ_BizApps_Orders: Order Lines */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Order Lines
-- Item: spDeleteOrderLine
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR OrderLine
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteOrderLine]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteOrderLine];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteOrderLine]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[OrderLine]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteOrderLine] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for MJ_BizApps_Orders: Order Lines */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteOrderLine] TO [cdp_Developer], [cdp_Integration];

/* Base View SQL for MJ_BizApps_Orders: Order Headers */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Order Headers
-- Item: vwOrderHeadersGenerated
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ_BizApps_Orders: Order Headers
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  OrderHeader
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwOrderHeadersGenerated]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwOrderHeadersGenerated];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwOrderHeadersGenerated]
AS
SELECT
    o.*,
    MJCompany_CompanyID.[Name] AS [Company],
    mjBizAppsCommonPerson_BillToPersonID.[DisplayName] AS [BillToPerson],
    mjBizAppsCommonOrganization_BillToOrganizationID.[Name] AS [BillToOrganization],
    MJUser_SalesRepUserID.[Name] AS [SalesRepUser],
    mjBizAppsCommonAddress_BillToAddressID.[Line1] AS [BillToAddress],
    mjBizAppsCommonAddress_ShipToAddressID.[Line1] AS [ShipToAddress],
    mjBizAppsCommonOrganization_ShipToOrganizationID.[Name] AS [ShipToOrganization],
    mjBizAppsCommonPerson_ShipToPersonID.[DisplayName] AS [ShipToPerson],
    mjBizAppsOrdersPaymentTermsType_PaymentTermsTypeID.[Name] AS [PaymentTermsType],
    mjBizAppsOrdersPaymentType_InitialPaymentTypeID.[Name] AS [InitialPaymentType],
    mjBizAppsOrdersPaymentDetail_InitialPaymentDetailID.[Last4] AS [InitialPaymentDetail],
    MJUser_PostedByUserID.[Name] AS [PostedByUser],
    mjBizAppsOrdersOrderHeader_ReversesOrderHeaderID.[OrderNumber] AS [ReversesOrderHeader],
    mjBizAppsOrdersCheckoutWidget_SourceCheckoutWidgetID.[Name] AS [SourceCheckoutWidget],
    ${mjSchema}_rgc.[Latitude] AS [${mjSchema}_Latitude],
    ${mjSchema}_rgc.[Longitude] AS [${mjSchema}_Longitude]
FROM
    [${flyway:defaultSchema}].[OrderHeader] AS o
INNER JOIN
    [${mjSchema}].[Company] AS MJCompany_CompanyID
  ON
    [o].[CompanyID] = MJCompany_CompanyID.[ID]
LEFT OUTER JOIN
    [${mjSchema}_BizAppsCommon].[Person] AS mjBizAppsCommonPerson_BillToPersonID
  ON
    [o].[BillToPersonID] = mjBizAppsCommonPerson_BillToPersonID.[ID]
LEFT OUTER JOIN
    [${mjSchema}_BizAppsCommon].[Organization] AS mjBizAppsCommonOrganization_BillToOrganizationID
  ON
    [o].[BillToOrganizationID] = mjBizAppsCommonOrganization_BillToOrganizationID.[ID]
LEFT OUTER JOIN
    [${mjSchema}].[User] AS MJUser_SalesRepUserID
  ON
    [o].[SalesRepUserID] = MJUser_SalesRepUserID.[ID]
LEFT OUTER JOIN
    [${mjSchema}_BizAppsCommon].[Address] AS mjBizAppsCommonAddress_BillToAddressID
  ON
    [o].[BillToAddressID] = mjBizAppsCommonAddress_BillToAddressID.[ID]
LEFT OUTER JOIN
    [${mjSchema}_BizAppsCommon].[Address] AS mjBizAppsCommonAddress_ShipToAddressID
  ON
    [o].[ShipToAddressID] = mjBizAppsCommonAddress_ShipToAddressID.[ID]
LEFT OUTER JOIN
    [${mjSchema}_BizAppsCommon].[Organization] AS mjBizAppsCommonOrganization_ShipToOrganizationID
  ON
    [o].[ShipToOrganizationID] = mjBizAppsCommonOrganization_ShipToOrganizationID.[ID]
LEFT OUTER JOIN
    [${mjSchema}_BizAppsCommon].[Person] AS mjBizAppsCommonPerson_ShipToPersonID
  ON
    [o].[ShipToPersonID] = mjBizAppsCommonPerson_ShipToPersonID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[PaymentTermsType] AS mjBizAppsOrdersPaymentTermsType_PaymentTermsTypeID
  ON
    [o].[PaymentTermsTypeID] = mjBizAppsOrdersPaymentTermsType_PaymentTermsTypeID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[PaymentType] AS mjBizAppsOrdersPaymentType_InitialPaymentTypeID
  ON
    [o].[InitialPaymentTypeID] = mjBizAppsOrdersPaymentType_InitialPaymentTypeID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[PaymentDetail] AS mjBizAppsOrdersPaymentDetail_InitialPaymentDetailID
  ON
    [o].[InitialPaymentDetailID] = mjBizAppsOrdersPaymentDetail_InitialPaymentDetailID.[ID]
LEFT OUTER JOIN
    [${mjSchema}].[User] AS MJUser_PostedByUserID
  ON
    [o].[PostedByUserID] = MJUser_PostedByUserID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[OrderHeader] AS mjBizAppsOrdersOrderHeader_ReversesOrderHeaderID
  ON
    [o].[ReversesOrderHeaderID] = mjBizAppsOrdersOrderHeader_ReversesOrderHeaderID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[CheckoutWidget] AS mjBizAppsOrdersCheckoutWidget_SourceCheckoutWidgetID
  ON
    [o].[SourceCheckoutWidgetID] = mjBizAppsOrdersCheckoutWidget_SourceCheckoutWidgetID.[ID]
LEFT OUTER JOIN
    [${mjSchema}].[vwRecordGeoCodes] AS ${mjSchema}_rgc
  ON
    ${mjSchema}_rgc.[EntityID] = 'FC529BC8-FF09-44A9-B454-26EAFDAC791B'
    AND ${mjSchema}_rgc.[RecordID] = CAST([o].[ID] AS NVARCHAR(450))
    AND ${mjSchema}_rgc.[LocationType] = 'Primary'
GO
IF OBJECT_ID('[${flyway:defaultSchema}].[vwOrderHeaders]', 'V') IS NOT NULL
BEGIN
    EXEC sp_executesql N'GRANT SELECT ON [${flyway:defaultSchema}].[vwOrderHeaders] TO [cdp_UI], [cdp_Developer], [cdp_Integration]';
END;

/* Base View Permissions SQL for MJ_BizApps_Orders: Order Headers */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Order Headers
-- Item: Permissions for vwOrderHeaders
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

IF OBJECT_ID('[${flyway:defaultSchema}].[vwOrderHeaders]', 'V') IS NOT NULL
BEGIN
    EXEC sp_executesql N'GRANT SELECT ON [${flyway:defaultSchema}].[vwOrderHeaders] TO [cdp_UI], [cdp_Developer], [cdp_Integration]';
END;

/* spCreate SQL for MJ_BizApps_Orders: Order Headers */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Order Headers
-- Item: spCreateOrderHeader
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR OrderHeader
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateOrderHeader]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateOrderHeader];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateOrderHeader]
    @ID uniqueidentifier = NULL,
    @OrderNumber nvarchar(40),
    @OrderType nvarchar(20) = NULL,
    @OrderDate date,
    @Status nvarchar(20) = NULL,
    @CompanyID uniqueidentifier,
    @BillToPersonID_Clear bit = 0,
    @BillToPersonID uniqueidentifier = NULL,
    @BillToOrganizationID_Clear bit = 0,
    @BillToOrganizationID uniqueidentifier = NULL,
    @SalesRepUserID_Clear bit = 0,
    @SalesRepUserID uniqueidentifier = NULL,
    @BillToAddressID_Clear bit = 0,
    @BillToAddressID uniqueidentifier = NULL,
    @ShipToAddressID_Clear bit = 0,
    @ShipToAddressID uniqueidentifier = NULL,
    @ShipToOrganizationID_Clear bit = 0,
    @ShipToOrganizationID uniqueidentifier = NULL,
    @ShipToPersonID_Clear bit = 0,
    @ShipToPersonID uniqueidentifier = NULL,
    @PaymentTermsTypeID_Clear bit = 0,
    @PaymentTermsTypeID uniqueidentifier = NULL,
    @TotalGross_Clear bit = 0,
    @TotalGross decimal(18, 2) = NULL,
    @AmountPaid decimal(18, 2) = NULL,
    @Balance_Clear bit = 0,
    @Balance decimal(18, 2) = NULL,
    @DueDate_Clear bit = 0,
    @DueDate date = NULL,
    @ExternalDocumentNumber_Clear bit = 0,
    @ExternalDocumentNumber nvarchar(80) = NULL,
    @InitialPaymentTypeID_Clear bit = 0,
    @InitialPaymentTypeID uniqueidentifier = NULL,
    @InitialPaymentAmount decimal(18, 2) = NULL,
    @InitialPaymentDetailID_Clear bit = 0,
    @InitialPaymentDetailID uniqueidentifier = NULL,
    @PostedAt_Clear bit = 0,
    @PostedAt datetimeoffset = NULL,
    @PostedByUserID_Clear bit = 0,
    @PostedByUserID uniqueidentifier = NULL,
    @ReversesOrderHeaderID_Clear bit = 0,
    @ReversesOrderHeaderID uniqueidentifier = NULL,
    @ReversalReason_Clear bit = 0,
    @ReversalReason nvarchar(MAX) = NULL,
    @RequestedDeliveryDate_Clear bit = 0,
    @RequestedDeliveryDate date = NULL,
    @ApprovalTaskID_Clear bit = 0,
    @ApprovalTaskID uniqueidentifier = NULL,
    @Description_Clear bit = 0,
    @Description nvarchar(MAX) = NULL,
    @Notes_Clear bit = 0,
    @Notes nvarchar(MAX) = NULL,
    @ConfirmedAt_Clear bit = 0,
    @ConfirmedAt datetimeoffset = NULL,
    @Origin nvarchar(50) = NULL,
    @SourceCheckoutWidgetID_Clear bit = 0,
    @SourceCheckoutWidgetID uniqueidentifier = NULL,
    @FulfillmentStatus nvarchar(20) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)

    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[OrderHeader]
            (
                [ID],
                [OrderNumber],
                [OrderType],
                [OrderDate],
                [Status],
                [CompanyID],
                [BillToPersonID],
                [BillToOrganizationID],
                [SalesRepUserID],
                [BillToAddressID],
                [ShipToAddressID],
                [ShipToOrganizationID],
                [ShipToPersonID],
                [PaymentTermsTypeID],
                [TotalGross],
                [AmountPaid],
                [Balance],
                [DueDate],
                [ExternalDocumentNumber],
                [InitialPaymentTypeID],
                [InitialPaymentAmount],
                [InitialPaymentDetailID],
                [PostedAt],
                [PostedByUserID],
                [ReversesOrderHeaderID],
                [ReversalReason],
                [RequestedDeliveryDate],
                [ApprovalTaskID],
                [Description],
                [Notes],
                [ConfirmedAt],
                [Origin],
                [SourceCheckoutWidgetID],
                [FulfillmentStatus]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @OrderNumber,
                ISNULL(@OrderType, 'Sale'),
                @OrderDate,
                ISNULL(@Status, 'Draft'),
                @CompanyID,
                CASE WHEN @BillToPersonID_Clear = 1 THEN NULL ELSE ISNULL(@BillToPersonID, NULL) END,
                CASE WHEN @BillToOrganizationID_Clear = 1 THEN NULL ELSE ISNULL(@BillToOrganizationID, NULL) END,
                CASE WHEN @SalesRepUserID_Clear = 1 THEN NULL ELSE ISNULL(@SalesRepUserID, NULL) END,
                CASE WHEN @BillToAddressID_Clear = 1 THEN NULL ELSE ISNULL(@BillToAddressID, NULL) END,
                CASE WHEN @ShipToAddressID_Clear = 1 THEN NULL ELSE ISNULL(@ShipToAddressID, NULL) END,
                CASE WHEN @ShipToOrganizationID_Clear = 1 THEN NULL ELSE ISNULL(@ShipToOrganizationID, NULL) END,
                CASE WHEN @ShipToPersonID_Clear = 1 THEN NULL ELSE ISNULL(@ShipToPersonID, NULL) END,
                CASE WHEN @PaymentTermsTypeID_Clear = 1 THEN NULL ELSE ISNULL(@PaymentTermsTypeID, NULL) END,
                CASE WHEN @TotalGross_Clear = 1 THEN NULL ELSE ISNULL(@TotalGross, NULL) END,
                ISNULL(@AmountPaid, 0),
                CASE WHEN @Balance_Clear = 1 THEN NULL ELSE ISNULL(@Balance, NULL) END,
                CASE WHEN @DueDate_Clear = 1 THEN NULL ELSE ISNULL(@DueDate, NULL) END,
                CASE WHEN @ExternalDocumentNumber_Clear = 1 THEN NULL ELSE ISNULL(@ExternalDocumentNumber, NULL) END,
                CASE WHEN @InitialPaymentTypeID_Clear = 1 THEN NULL ELSE ISNULL(@InitialPaymentTypeID, NULL) END,
                ISNULL(@InitialPaymentAmount, 0),
                CASE WHEN @InitialPaymentDetailID_Clear = 1 THEN NULL ELSE ISNULL(@InitialPaymentDetailID, NULL) END,
                CASE WHEN @PostedAt_Clear = 1 THEN NULL ELSE ISNULL(@PostedAt, NULL) END,
                CASE WHEN @PostedByUserID_Clear = 1 THEN NULL ELSE ISNULL(@PostedByUserID, NULL) END,
                CASE WHEN @ReversesOrderHeaderID_Clear = 1 THEN NULL ELSE ISNULL(@ReversesOrderHeaderID, NULL) END,
                CASE WHEN @ReversalReason_Clear = 1 THEN NULL ELSE ISNULL(@ReversalReason, NULL) END,
                CASE WHEN @RequestedDeliveryDate_Clear = 1 THEN NULL ELSE ISNULL(@RequestedDeliveryDate, NULL) END,
                CASE WHEN @ApprovalTaskID_Clear = 1 THEN NULL ELSE ISNULL(@ApprovalTaskID, NULL) END,
                CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, NULL) END,
                CASE WHEN @Notes_Clear = 1 THEN NULL ELSE ISNULL(@Notes, NULL) END,
                CASE WHEN @ConfirmedAt_Clear = 1 THEN NULL ELSE ISNULL(@ConfirmedAt, NULL) END,
                ISNULL(@Origin, 'Direct'),
                CASE WHEN @SourceCheckoutWidgetID_Clear = 1 THEN NULL ELSE ISNULL(@SourceCheckoutWidgetID, NULL) END,
                ISNULL(@FulfillmentStatus, 'Pending')
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[OrderHeader]
            (
                [OrderNumber],
                [OrderType],
                [OrderDate],
                [Status],
                [CompanyID],
                [BillToPersonID],
                [BillToOrganizationID],
                [SalesRepUserID],
                [BillToAddressID],
                [ShipToAddressID],
                [ShipToOrganizationID],
                [ShipToPersonID],
                [PaymentTermsTypeID],
                [TotalGross],
                [AmountPaid],
                [Balance],
                [DueDate],
                [ExternalDocumentNumber],
                [InitialPaymentTypeID],
                [InitialPaymentAmount],
                [InitialPaymentDetailID],
                [PostedAt],
                [PostedByUserID],
                [ReversesOrderHeaderID],
                [ReversalReason],
                [RequestedDeliveryDate],
                [ApprovalTaskID],
                [Description],
                [Notes],
                [ConfirmedAt],
                [Origin],
                [SourceCheckoutWidgetID],
                [FulfillmentStatus]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @OrderNumber,
                ISNULL(@OrderType, 'Sale'),
                @OrderDate,
                ISNULL(@Status, 'Draft'),
                @CompanyID,
                CASE WHEN @BillToPersonID_Clear = 1 THEN NULL ELSE ISNULL(@BillToPersonID, NULL) END,
                CASE WHEN @BillToOrganizationID_Clear = 1 THEN NULL ELSE ISNULL(@BillToOrganizationID, NULL) END,
                CASE WHEN @SalesRepUserID_Clear = 1 THEN NULL ELSE ISNULL(@SalesRepUserID, NULL) END,
                CASE WHEN @BillToAddressID_Clear = 1 THEN NULL ELSE ISNULL(@BillToAddressID, NULL) END,
                CASE WHEN @ShipToAddressID_Clear = 1 THEN NULL ELSE ISNULL(@ShipToAddressID, NULL) END,
                CASE WHEN @ShipToOrganizationID_Clear = 1 THEN NULL ELSE ISNULL(@ShipToOrganizationID, NULL) END,
                CASE WHEN @ShipToPersonID_Clear = 1 THEN NULL ELSE ISNULL(@ShipToPersonID, NULL) END,
                CASE WHEN @PaymentTermsTypeID_Clear = 1 THEN NULL ELSE ISNULL(@PaymentTermsTypeID, NULL) END,
                CASE WHEN @TotalGross_Clear = 1 THEN NULL ELSE ISNULL(@TotalGross, NULL) END,
                ISNULL(@AmountPaid, 0),
                CASE WHEN @Balance_Clear = 1 THEN NULL ELSE ISNULL(@Balance, NULL) END,
                CASE WHEN @DueDate_Clear = 1 THEN NULL ELSE ISNULL(@DueDate, NULL) END,
                CASE WHEN @ExternalDocumentNumber_Clear = 1 THEN NULL ELSE ISNULL(@ExternalDocumentNumber, NULL) END,
                CASE WHEN @InitialPaymentTypeID_Clear = 1 THEN NULL ELSE ISNULL(@InitialPaymentTypeID, NULL) END,
                ISNULL(@InitialPaymentAmount, 0),
                CASE WHEN @InitialPaymentDetailID_Clear = 1 THEN NULL ELSE ISNULL(@InitialPaymentDetailID, NULL) END,
                CASE WHEN @PostedAt_Clear = 1 THEN NULL ELSE ISNULL(@PostedAt, NULL) END,
                CASE WHEN @PostedByUserID_Clear = 1 THEN NULL ELSE ISNULL(@PostedByUserID, NULL) END,
                CASE WHEN @ReversesOrderHeaderID_Clear = 1 THEN NULL ELSE ISNULL(@ReversesOrderHeaderID, NULL) END,
                CASE WHEN @ReversalReason_Clear = 1 THEN NULL ELSE ISNULL(@ReversalReason, NULL) END,
                CASE WHEN @RequestedDeliveryDate_Clear = 1 THEN NULL ELSE ISNULL(@RequestedDeliveryDate, NULL) END,
                CASE WHEN @ApprovalTaskID_Clear = 1 THEN NULL ELSE ISNULL(@ApprovalTaskID, NULL) END,
                CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, NULL) END,
                CASE WHEN @Notes_Clear = 1 THEN NULL ELSE ISNULL(@Notes, NULL) END,
                CASE WHEN @ConfirmedAt_Clear = 1 THEN NULL ELSE ISNULL(@ConfirmedAt, NULL) END,
                ISNULL(@Origin, 'Direct'),
                CASE WHEN @SourceCheckoutWidgetID_Clear = 1 THEN NULL ELSE ISNULL(@SourceCheckoutWidgetID, NULL) END,
                ISNULL(@FulfillmentStatus, 'Pending')
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwOrderHeaders] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateOrderHeader] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ_BizApps_Orders: Order Headers */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateOrderHeader] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for MJ_BizApps_Orders: Order Headers */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Order Headers
-- Item: spUpdateOrderHeader
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR OrderHeader
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateOrderHeader]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateOrderHeader];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateOrderHeader]
    @ID uniqueidentifier,
    @OrderNumber nvarchar(40) = NULL,
    @OrderType nvarchar(20) = NULL,
    @OrderDate date = NULL,
    @Status nvarchar(20) = NULL,
    @CompanyID uniqueidentifier = NULL,
    @BillToPersonID_Clear bit = 0,
    @BillToPersonID uniqueidentifier = NULL,
    @BillToOrganizationID_Clear bit = 0,
    @BillToOrganizationID uniqueidentifier = NULL,
    @SalesRepUserID_Clear bit = 0,
    @SalesRepUserID uniqueidentifier = NULL,
    @BillToAddressID_Clear bit = 0,
    @BillToAddressID uniqueidentifier = NULL,
    @ShipToAddressID_Clear bit = 0,
    @ShipToAddressID uniqueidentifier = NULL,
    @ShipToOrganizationID_Clear bit = 0,
    @ShipToOrganizationID uniqueidentifier = NULL,
    @ShipToPersonID_Clear bit = 0,
    @ShipToPersonID uniqueidentifier = NULL,
    @PaymentTermsTypeID_Clear bit = 0,
    @PaymentTermsTypeID uniqueidentifier = NULL,
    @TotalGross_Clear bit = 0,
    @TotalGross decimal(18, 2) = NULL,
    @AmountPaid decimal(18, 2) = NULL,
    @Balance_Clear bit = 0,
    @Balance decimal(18, 2) = NULL,
    @DueDate_Clear bit = 0,
    @DueDate date = NULL,
    @ExternalDocumentNumber_Clear bit = 0,
    @ExternalDocumentNumber nvarchar(80) = NULL,
    @InitialPaymentTypeID_Clear bit = 0,
    @InitialPaymentTypeID uniqueidentifier = NULL,
    @InitialPaymentAmount decimal(18, 2) = NULL,
    @InitialPaymentDetailID_Clear bit = 0,
    @InitialPaymentDetailID uniqueidentifier = NULL,
    @PostedAt_Clear bit = 0,
    @PostedAt datetimeoffset = NULL,
    @PostedByUserID_Clear bit = 0,
    @PostedByUserID uniqueidentifier = NULL,
    @ReversesOrderHeaderID_Clear bit = 0,
    @ReversesOrderHeaderID uniqueidentifier = NULL,
    @ReversalReason_Clear bit = 0,
    @ReversalReason nvarchar(MAX) = NULL,
    @RequestedDeliveryDate_Clear bit = 0,
    @RequestedDeliveryDate date = NULL,
    @ApprovalTaskID_Clear bit = 0,
    @ApprovalTaskID uniqueidentifier = NULL,
    @Description_Clear bit = 0,
    @Description nvarchar(MAX) = NULL,
    @Notes_Clear bit = 0,
    @Notes nvarchar(MAX) = NULL,
    @ConfirmedAt_Clear bit = 0,
    @ConfirmedAt datetimeoffset = NULL,
    @Origin nvarchar(50) = NULL,
    @SourceCheckoutWidgetID_Clear bit = 0,
    @SourceCheckoutWidgetID uniqueidentifier = NULL,
    @FulfillmentStatus nvarchar(20) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[OrderHeader]
    SET
        [OrderNumber] = ISNULL(@OrderNumber, [OrderNumber]),
        [OrderType] = ISNULL(@OrderType, [OrderType]),
        [OrderDate] = ISNULL(@OrderDate, [OrderDate]),
        [Status] = ISNULL(@Status, [Status]),
        [CompanyID] = ISNULL(@CompanyID, [CompanyID]),
        [BillToPersonID] = CASE WHEN @BillToPersonID_Clear = 1 THEN NULL ELSE ISNULL(@BillToPersonID, [BillToPersonID]) END,
        [BillToOrganizationID] = CASE WHEN @BillToOrganizationID_Clear = 1 THEN NULL ELSE ISNULL(@BillToOrganizationID, [BillToOrganizationID]) END,
        [SalesRepUserID] = CASE WHEN @SalesRepUserID_Clear = 1 THEN NULL ELSE ISNULL(@SalesRepUserID, [SalesRepUserID]) END,
        [BillToAddressID] = CASE WHEN @BillToAddressID_Clear = 1 THEN NULL ELSE ISNULL(@BillToAddressID, [BillToAddressID]) END,
        [ShipToAddressID] = CASE WHEN @ShipToAddressID_Clear = 1 THEN NULL ELSE ISNULL(@ShipToAddressID, [ShipToAddressID]) END,
        [ShipToOrganizationID] = CASE WHEN @ShipToOrganizationID_Clear = 1 THEN NULL ELSE ISNULL(@ShipToOrganizationID, [ShipToOrganizationID]) END,
        [ShipToPersonID] = CASE WHEN @ShipToPersonID_Clear = 1 THEN NULL ELSE ISNULL(@ShipToPersonID, [ShipToPersonID]) END,
        [PaymentTermsTypeID] = CASE WHEN @PaymentTermsTypeID_Clear = 1 THEN NULL ELSE ISNULL(@PaymentTermsTypeID, [PaymentTermsTypeID]) END,
        [TotalGross] = CASE WHEN @TotalGross_Clear = 1 THEN NULL ELSE ISNULL(@TotalGross, [TotalGross]) END,
        [AmountPaid] = ISNULL(@AmountPaid, [AmountPaid]),
        [Balance] = CASE WHEN @Balance_Clear = 1 THEN NULL ELSE ISNULL(@Balance, [Balance]) END,
        [DueDate] = CASE WHEN @DueDate_Clear = 1 THEN NULL ELSE ISNULL(@DueDate, [DueDate]) END,
        [ExternalDocumentNumber] = CASE WHEN @ExternalDocumentNumber_Clear = 1 THEN NULL ELSE ISNULL(@ExternalDocumentNumber, [ExternalDocumentNumber]) END,
        [InitialPaymentTypeID] = CASE WHEN @InitialPaymentTypeID_Clear = 1 THEN NULL ELSE ISNULL(@InitialPaymentTypeID, [InitialPaymentTypeID]) END,
        [InitialPaymentAmount] = ISNULL(@InitialPaymentAmount, [InitialPaymentAmount]),
        [InitialPaymentDetailID] = CASE WHEN @InitialPaymentDetailID_Clear = 1 THEN NULL ELSE ISNULL(@InitialPaymentDetailID, [InitialPaymentDetailID]) END,
        [PostedAt] = CASE WHEN @PostedAt_Clear = 1 THEN NULL ELSE ISNULL(@PostedAt, [PostedAt]) END,
        [PostedByUserID] = CASE WHEN @PostedByUserID_Clear = 1 THEN NULL ELSE ISNULL(@PostedByUserID, [PostedByUserID]) END,
        [ReversesOrderHeaderID] = CASE WHEN @ReversesOrderHeaderID_Clear = 1 THEN NULL ELSE ISNULL(@ReversesOrderHeaderID, [ReversesOrderHeaderID]) END,
        [ReversalReason] = CASE WHEN @ReversalReason_Clear = 1 THEN NULL ELSE ISNULL(@ReversalReason, [ReversalReason]) END,
        [RequestedDeliveryDate] = CASE WHEN @RequestedDeliveryDate_Clear = 1 THEN NULL ELSE ISNULL(@RequestedDeliveryDate, [RequestedDeliveryDate]) END,
        [ApprovalTaskID] = CASE WHEN @ApprovalTaskID_Clear = 1 THEN NULL ELSE ISNULL(@ApprovalTaskID, [ApprovalTaskID]) END,
        [Description] = CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, [Description]) END,
        [Notes] = CASE WHEN @Notes_Clear = 1 THEN NULL ELSE ISNULL(@Notes, [Notes]) END,
        [ConfirmedAt] = CASE WHEN @ConfirmedAt_Clear = 1 THEN NULL ELSE ISNULL(@ConfirmedAt, [ConfirmedAt]) END,
        [Origin] = ISNULL(@Origin, [Origin]),
        [SourceCheckoutWidgetID] = CASE WHEN @SourceCheckoutWidgetID_Clear = 1 THEN NULL ELSE ISNULL(@SourceCheckoutWidgetID, [SourceCheckoutWidgetID]) END,
        [FulfillmentStatus] = ISNULL(@FulfillmentStatus, [FulfillmentStatus])
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwOrderHeaders] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwOrderHeaders]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateOrderHeader] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the OrderHeader table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateOrderHeader]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateOrderHeader];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateOrderHeader
ON [${flyway:defaultSchema}].[OrderHeader]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[OrderHeader]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[OrderHeader] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for MJ_BizApps_Orders: Order Headers */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateOrderHeader] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for MJ_BizApps_Orders: Order Headers */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Order Headers
-- Item: spDeleteOrderHeader
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR OrderHeader
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteOrderHeader]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteOrderHeader];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteOrderHeader]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[OrderHeader]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteOrderHeader] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for MJ_BizApps_Orders: Order Headers */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteOrderHeader] TO [cdp_Developer], [cdp_Integration];

/* Index for Foreign Keys for PaymentDetail */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Payment Details
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key CompanyID in table PaymentDetail
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_PaymentDetail_CompanyID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[PaymentDetail]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_PaymentDetail_CompanyID ON [${flyway:defaultSchema}].[PaymentDetail] ([CompanyID]);

-- Index for foreign key PaymentTypeID in table PaymentDetail
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_PaymentDetail_PaymentTypeID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[PaymentDetail]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_PaymentDetail_PaymentTypeID ON [${flyway:defaultSchema}].[PaymentDetail] ([PaymentTypeID]);

-- Index for foreign key PaymentProviderID in table PaymentDetail
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_PaymentDetail_PaymentProviderID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[PaymentDetail]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_PaymentDetail_PaymentProviderID ON [${flyway:defaultSchema}].[PaymentDetail] ([PaymentProviderID]);

-- Index for foreign key SourceCustomerPaymentMethodID in table PaymentDetail
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_PaymentDetail_SourceCustomerPaymentMethodID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[PaymentDetail]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_PaymentDetail_SourceCustomerPaymentMethodID ON [${flyway:defaultSchema}].[PaymentDetail] ([SourceCustomerPaymentMethodID]);

-- Index for foreign key StoredValueAccountID in table PaymentDetail
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_PaymentDetail_StoredValueAccountID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[PaymentDetail]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_PaymentDetail_StoredValueAccountID ON [${flyway:defaultSchema}].[PaymentDetail] ([StoredValueAccountID]);

-- Index for foreign key SourceOrderHeaderID in table PaymentDetail
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_PaymentDetail_SourceOrderHeaderID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[PaymentDetail]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_PaymentDetail_SourceOrderHeaderID ON [${flyway:defaultSchema}].[PaymentDetail] ([SourceOrderHeaderID]);

/* Index for Foreign Keys for PaymentHeader */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Payment Headers
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key ReceivingCompanyID in table PaymentHeader
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_PaymentHeader_ReceivingCompanyID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[PaymentHeader]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_PaymentHeader_ReceivingCompanyID ON [${flyway:defaultSchema}].[PaymentHeader] ([ReceivingCompanyID]);

-- Index for foreign key BillToPersonID in table PaymentHeader
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_PaymentHeader_BillToPersonID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[PaymentHeader]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_PaymentHeader_BillToPersonID ON [${flyway:defaultSchema}].[PaymentHeader] ([BillToPersonID]);

-- Index for foreign key BillToOrganizationID in table PaymentHeader
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_PaymentHeader_BillToOrganizationID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[PaymentHeader]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_PaymentHeader_BillToOrganizationID ON [${flyway:defaultSchema}].[PaymentHeader] ([BillToOrganizationID]);

-- Index for foreign key PaymentTypeID in table PaymentHeader
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_PaymentHeader_PaymentTypeID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[PaymentHeader]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_PaymentHeader_PaymentTypeID ON [${flyway:defaultSchema}].[PaymentHeader] ([PaymentTypeID]);

-- Index for foreign key PaymentProviderID in table PaymentHeader
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_PaymentHeader_PaymentProviderID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[PaymentHeader]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_PaymentHeader_PaymentProviderID ON [${flyway:defaultSchema}].[PaymentHeader] ([PaymentProviderID]);

-- Index for foreign key PaymentIntentID in table PaymentHeader
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_PaymentHeader_PaymentIntentID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[PaymentHeader]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_PaymentHeader_PaymentIntentID ON [${flyway:defaultSchema}].[PaymentHeader] ([PaymentIntentID]);

-- Index for foreign key PaymentDetailID in table PaymentHeader
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_PaymentHeader_PaymentDetailID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[PaymentHeader]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_PaymentHeader_PaymentDetailID ON [${flyway:defaultSchema}].[PaymentHeader] ([PaymentDetailID]);

-- Index for foreign key ReversesPaymentHeaderID in table PaymentHeader
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_PaymentHeader_ReversesPaymentHeaderID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[PaymentHeader]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_PaymentHeader_ReversesPaymentHeaderID ON [${flyway:defaultSchema}].[PaymentHeader] ([ReversesPaymentHeaderID]);

-- Index for foreign key JournalEntryID in table PaymentHeader
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_PaymentHeader_JournalEntryID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[PaymentHeader]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_PaymentHeader_JournalEntryID ON [${flyway:defaultSchema}].[PaymentHeader] ([JournalEntryID]);

/* Index for Foreign Keys for PaymentIntent */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Payment Intents
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key PaymentProviderID in table PaymentIntent
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_PaymentIntent_PaymentProviderID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[PaymentIntent]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_PaymentIntent_PaymentProviderID ON [${flyway:defaultSchema}].[PaymentIntent] ([PaymentProviderID]);

-- Index for foreign key OrderHeaderID in table PaymentIntent
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_PaymentIntent_OrderHeaderID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[PaymentIntent]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_PaymentIntent_OrderHeaderID ON [${flyway:defaultSchema}].[PaymentIntent] ([OrderHeaderID]);

-- Index for foreign key BillToPersonID in table PaymentIntent
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_PaymentIntent_BillToPersonID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[PaymentIntent]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_PaymentIntent_BillToPersonID ON [${flyway:defaultSchema}].[PaymentIntent] ([BillToPersonID]);

-- Index for foreign key BillToOrganizationID in table PaymentIntent
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_PaymentIntent_BillToOrganizationID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[PaymentIntent]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_PaymentIntent_BillToOrganizationID ON [${flyway:defaultSchema}].[PaymentIntent] ([BillToOrganizationID]);

/* Index for Foreign Keys for PaymentLine */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Payment Lines
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key PaymentHeaderID in table PaymentLine
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_PaymentLine_PaymentHeaderID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[PaymentLine]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_PaymentLine_PaymentHeaderID ON [${flyway:defaultSchema}].[PaymentLine] ([PaymentHeaderID]);

-- Index for foreign key OrderHeaderID in table PaymentLine
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_PaymentLine_OrderHeaderID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[PaymentLine]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_PaymentLine_OrderHeaderID ON [${flyway:defaultSchema}].[PaymentLine] ([OrderHeaderID]);

-- Index for foreign key OrderLineID in table PaymentLine
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_PaymentLine_OrderLineID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[PaymentLine]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_PaymentLine_OrderLineID ON [${flyway:defaultSchema}].[PaymentLine] ([OrderLineID]);

-- Index for foreign key AllocatedByUserID in table PaymentLine
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_PaymentLine_AllocatedByUserID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[PaymentLine]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_PaymentLine_AllocatedByUserID ON [${flyway:defaultSchema}].[PaymentLine] ([AllocatedByUserID]);

/* Base View SQL for MJ_BizApps_Orders: Payment Details */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Payment Details
-- Item: vwPaymentDetails
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ_BizApps_Orders: Payment Details
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  PaymentDetail
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwPaymentDetails]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwPaymentDetails];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwPaymentDetails]
AS
SELECT
    p.*,
    MJCompany_CompanyID.[Name] AS [Company],
    mjBizAppsOrdersPaymentType_PaymentTypeID.[Name] AS [PaymentType],
    mjBizAppsOrdersPaymentProvider_PaymentProviderID.[Name] AS [PaymentProvider],
    mjBizAppsOrdersCustomerPaymentMethod_SourceCustomerPaymentMethodID.[Nickname] AS [SourceCustomerPaymentMethod],
    mjBizAppsOrdersStoredValueAccount_StoredValueAccountID.[Code] AS [StoredValueAccount],
    mjBizAppsOrdersOrderHeader_SourceOrderHeaderID.[OrderNumber] AS [SourceOrderHeader]
FROM
    [${flyway:defaultSchema}].[PaymentDetail] AS p
INNER JOIN
    [${mjSchema}].[Company] AS MJCompany_CompanyID
  ON
    [p].[CompanyID] = MJCompany_CompanyID.[ID]
INNER JOIN
    [${flyway:defaultSchema}].[PaymentType] AS mjBizAppsOrdersPaymentType_PaymentTypeID
  ON
    [p].[PaymentTypeID] = mjBizAppsOrdersPaymentType_PaymentTypeID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[PaymentProvider] AS mjBizAppsOrdersPaymentProvider_PaymentProviderID
  ON
    [p].[PaymentProviderID] = mjBizAppsOrdersPaymentProvider_PaymentProviderID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[CustomerPaymentMethod] AS mjBizAppsOrdersCustomerPaymentMethod_SourceCustomerPaymentMethodID
  ON
    [p].[SourceCustomerPaymentMethodID] = mjBizAppsOrdersCustomerPaymentMethod_SourceCustomerPaymentMethodID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[StoredValueAccount] AS mjBizAppsOrdersStoredValueAccount_StoredValueAccountID
  ON
    [p].[StoredValueAccountID] = mjBizAppsOrdersStoredValueAccount_StoredValueAccountID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[OrderHeader] AS mjBizAppsOrdersOrderHeader_SourceOrderHeaderID
  ON
    [p].[SourceOrderHeaderID] = mjBizAppsOrdersOrderHeader_SourceOrderHeaderID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwPaymentDetails] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for MJ_BizApps_Orders: Payment Details */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Payment Details
-- Item: Permissions for vwPaymentDetails
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwPaymentDetails] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for MJ_BizApps_Orders: Payment Details */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Payment Details
-- Item: spCreatePaymentDetail
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR PaymentDetail
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreatePaymentDetail]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreatePaymentDetail];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreatePaymentDetail]
    @ID uniqueidentifier = NULL,
    @CompanyID uniqueidentifier,
    @PaymentTypeID uniqueidentifier,
    @PaymentProviderID_Clear bit = 0,
    @PaymentProviderID uniqueidentifier = NULL,
    @SourceCustomerPaymentMethodID_Clear bit = 0,
    @SourceCustomerPaymentMethodID uniqueidentifier = NULL,
    @ProviderCustomerRef_Clear bit = 0,
    @ProviderCustomerRef nvarchar(100) = NULL,
    @ProviderInstrumentRef_Clear bit = 0,
    @ProviderInstrumentRef nvarchar(100) = NULL,
    @Brand_Clear bit = 0,
    @Brand nvarchar(40) = NULL,
    @Last4_Clear bit = 0,
    @Last4 char(4) = NULL,
    @ExpiryMonth_Clear bit = 0,
    @ExpiryMonth int = NULL,
    @ExpiryYear_Clear bit = 0,
    @ExpiryYear int = NULL,
    @HolderName_Clear bit = 0,
    @HolderName nvarchar(200) = NULL,
    @BankName_Clear bit = 0,
    @BankName nvarchar(200) = NULL,
    @RoutingLast4_Clear bit = 0,
    @RoutingLast4 char(4) = NULL,
    @AccountLast4_Clear bit = 0,
    @AccountLast4 char(4) = NULL,
    @BankAccountType_Clear bit = 0,
    @BankAccountType nvarchar(20) = NULL,
    @ReferenceNumber_Clear bit = 0,
    @ReferenceNumber nvarchar(100) = NULL,
    @InstrumentDate_Clear bit = 0,
    @InstrumentDate date = NULL,
    @StoredValueAccountID_Clear bit = 0,
    @StoredValueAccountID uniqueidentifier = NULL,
    @SourceOrderHeaderID_Clear bit = 0,
    @SourceOrderHeaderID uniqueidentifier = NULL,
    @Notes_Clear bit = 0,
    @Notes nvarchar(MAX) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)

    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[PaymentDetail]
            (
                [ID],
                [CompanyID],
                [PaymentTypeID],
                [PaymentProviderID],
                [SourceCustomerPaymentMethodID],
                [ProviderCustomerRef],
                [ProviderInstrumentRef],
                [Brand],
                [Last4],
                [ExpiryMonth],
                [ExpiryYear],
                [HolderName],
                [BankName],
                [RoutingLast4],
                [AccountLast4],
                [BankAccountType],
                [ReferenceNumber],
                [InstrumentDate],
                [StoredValueAccountID],
                [SourceOrderHeaderID],
                [Notes]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @CompanyID,
                @PaymentTypeID,
                CASE WHEN @PaymentProviderID_Clear = 1 THEN NULL ELSE ISNULL(@PaymentProviderID, NULL) END,
                CASE WHEN @SourceCustomerPaymentMethodID_Clear = 1 THEN NULL ELSE ISNULL(@SourceCustomerPaymentMethodID, NULL) END,
                CASE WHEN @ProviderCustomerRef_Clear = 1 THEN NULL ELSE ISNULL(@ProviderCustomerRef, NULL) END,
                CASE WHEN @ProviderInstrumentRef_Clear = 1 THEN NULL ELSE ISNULL(@ProviderInstrumentRef, NULL) END,
                CASE WHEN @Brand_Clear = 1 THEN NULL ELSE ISNULL(@Brand, NULL) END,
                CASE WHEN @Last4_Clear = 1 THEN NULL ELSE ISNULL(@Last4, NULL) END,
                CASE WHEN @ExpiryMonth_Clear = 1 THEN NULL ELSE ISNULL(@ExpiryMonth, NULL) END,
                CASE WHEN @ExpiryYear_Clear = 1 THEN NULL ELSE ISNULL(@ExpiryYear, NULL) END,
                CASE WHEN @HolderName_Clear = 1 THEN NULL ELSE ISNULL(@HolderName, NULL) END,
                CASE WHEN @BankName_Clear = 1 THEN NULL ELSE ISNULL(@BankName, NULL) END,
                CASE WHEN @RoutingLast4_Clear = 1 THEN NULL ELSE ISNULL(@RoutingLast4, NULL) END,
                CASE WHEN @AccountLast4_Clear = 1 THEN NULL ELSE ISNULL(@AccountLast4, NULL) END,
                CASE WHEN @BankAccountType_Clear = 1 THEN NULL ELSE ISNULL(@BankAccountType, NULL) END,
                CASE WHEN @ReferenceNumber_Clear = 1 THEN NULL ELSE ISNULL(@ReferenceNumber, NULL) END,
                CASE WHEN @InstrumentDate_Clear = 1 THEN NULL ELSE ISNULL(@InstrumentDate, NULL) END,
                CASE WHEN @StoredValueAccountID_Clear = 1 THEN NULL ELSE ISNULL(@StoredValueAccountID, NULL) END,
                CASE WHEN @SourceOrderHeaderID_Clear = 1 THEN NULL ELSE ISNULL(@SourceOrderHeaderID, NULL) END,
                CASE WHEN @Notes_Clear = 1 THEN NULL ELSE ISNULL(@Notes, NULL) END
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[PaymentDetail]
            (
                [CompanyID],
                [PaymentTypeID],
                [PaymentProviderID],
                [SourceCustomerPaymentMethodID],
                [ProviderCustomerRef],
                [ProviderInstrumentRef],
                [Brand],
                [Last4],
                [ExpiryMonth],
                [ExpiryYear],
                [HolderName],
                [BankName],
                [RoutingLast4],
                [AccountLast4],
                [BankAccountType],
                [ReferenceNumber],
                [InstrumentDate],
                [StoredValueAccountID],
                [SourceOrderHeaderID],
                [Notes]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @CompanyID,
                @PaymentTypeID,
                CASE WHEN @PaymentProviderID_Clear = 1 THEN NULL ELSE ISNULL(@PaymentProviderID, NULL) END,
                CASE WHEN @SourceCustomerPaymentMethodID_Clear = 1 THEN NULL ELSE ISNULL(@SourceCustomerPaymentMethodID, NULL) END,
                CASE WHEN @ProviderCustomerRef_Clear = 1 THEN NULL ELSE ISNULL(@ProviderCustomerRef, NULL) END,
                CASE WHEN @ProviderInstrumentRef_Clear = 1 THEN NULL ELSE ISNULL(@ProviderInstrumentRef, NULL) END,
                CASE WHEN @Brand_Clear = 1 THEN NULL ELSE ISNULL(@Brand, NULL) END,
                CASE WHEN @Last4_Clear = 1 THEN NULL ELSE ISNULL(@Last4, NULL) END,
                CASE WHEN @ExpiryMonth_Clear = 1 THEN NULL ELSE ISNULL(@ExpiryMonth, NULL) END,
                CASE WHEN @ExpiryYear_Clear = 1 THEN NULL ELSE ISNULL(@ExpiryYear, NULL) END,
                CASE WHEN @HolderName_Clear = 1 THEN NULL ELSE ISNULL(@HolderName, NULL) END,
                CASE WHEN @BankName_Clear = 1 THEN NULL ELSE ISNULL(@BankName, NULL) END,
                CASE WHEN @RoutingLast4_Clear = 1 THEN NULL ELSE ISNULL(@RoutingLast4, NULL) END,
                CASE WHEN @AccountLast4_Clear = 1 THEN NULL ELSE ISNULL(@AccountLast4, NULL) END,
                CASE WHEN @BankAccountType_Clear = 1 THEN NULL ELSE ISNULL(@BankAccountType, NULL) END,
                CASE WHEN @ReferenceNumber_Clear = 1 THEN NULL ELSE ISNULL(@ReferenceNumber, NULL) END,
                CASE WHEN @InstrumentDate_Clear = 1 THEN NULL ELSE ISNULL(@InstrumentDate, NULL) END,
                CASE WHEN @StoredValueAccountID_Clear = 1 THEN NULL ELSE ISNULL(@StoredValueAccountID, NULL) END,
                CASE WHEN @SourceOrderHeaderID_Clear = 1 THEN NULL ELSE ISNULL(@SourceOrderHeaderID, NULL) END,
                CASE WHEN @Notes_Clear = 1 THEN NULL ELSE ISNULL(@Notes, NULL) END
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwPaymentDetails] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreatePaymentDetail] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ_BizApps_Orders: Payment Details */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreatePaymentDetail] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for MJ_BizApps_Orders: Payment Details */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Payment Details
-- Item: spUpdatePaymentDetail
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR PaymentDetail
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdatePaymentDetail]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdatePaymentDetail];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdatePaymentDetail]
    @ID uniqueidentifier,
    @CompanyID uniqueidentifier = NULL,
    @PaymentTypeID uniqueidentifier = NULL,
    @PaymentProviderID_Clear bit = 0,
    @PaymentProviderID uniqueidentifier = NULL,
    @SourceCustomerPaymentMethodID_Clear bit = 0,
    @SourceCustomerPaymentMethodID uniqueidentifier = NULL,
    @ProviderCustomerRef_Clear bit = 0,
    @ProviderCustomerRef nvarchar(100) = NULL,
    @ProviderInstrumentRef_Clear bit = 0,
    @ProviderInstrumentRef nvarchar(100) = NULL,
    @Brand_Clear bit = 0,
    @Brand nvarchar(40) = NULL,
    @Last4_Clear bit = 0,
    @Last4 char(4) = NULL,
    @ExpiryMonth_Clear bit = 0,
    @ExpiryMonth int = NULL,
    @ExpiryYear_Clear bit = 0,
    @ExpiryYear int = NULL,
    @HolderName_Clear bit = 0,
    @HolderName nvarchar(200) = NULL,
    @BankName_Clear bit = 0,
    @BankName nvarchar(200) = NULL,
    @RoutingLast4_Clear bit = 0,
    @RoutingLast4 char(4) = NULL,
    @AccountLast4_Clear bit = 0,
    @AccountLast4 char(4) = NULL,
    @BankAccountType_Clear bit = 0,
    @BankAccountType nvarchar(20) = NULL,
    @ReferenceNumber_Clear bit = 0,
    @ReferenceNumber nvarchar(100) = NULL,
    @InstrumentDate_Clear bit = 0,
    @InstrumentDate date = NULL,
    @StoredValueAccountID_Clear bit = 0,
    @StoredValueAccountID uniqueidentifier = NULL,
    @SourceOrderHeaderID_Clear bit = 0,
    @SourceOrderHeaderID uniqueidentifier = NULL,
    @Notes_Clear bit = 0,
    @Notes nvarchar(MAX) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[PaymentDetail]
    SET
        [CompanyID] = ISNULL(@CompanyID, [CompanyID]),
        [PaymentTypeID] = ISNULL(@PaymentTypeID, [PaymentTypeID]),
        [PaymentProviderID] = CASE WHEN @PaymentProviderID_Clear = 1 THEN NULL ELSE ISNULL(@PaymentProviderID, [PaymentProviderID]) END,
        [SourceCustomerPaymentMethodID] = CASE WHEN @SourceCustomerPaymentMethodID_Clear = 1 THEN NULL ELSE ISNULL(@SourceCustomerPaymentMethodID, [SourceCustomerPaymentMethodID]) END,
        [ProviderCustomerRef] = CASE WHEN @ProviderCustomerRef_Clear = 1 THEN NULL ELSE ISNULL(@ProviderCustomerRef, [ProviderCustomerRef]) END,
        [ProviderInstrumentRef] = CASE WHEN @ProviderInstrumentRef_Clear = 1 THEN NULL ELSE ISNULL(@ProviderInstrumentRef, [ProviderInstrumentRef]) END,
        [Brand] = CASE WHEN @Brand_Clear = 1 THEN NULL ELSE ISNULL(@Brand, [Brand]) END,
        [Last4] = CASE WHEN @Last4_Clear = 1 THEN NULL ELSE ISNULL(@Last4, [Last4]) END,
        [ExpiryMonth] = CASE WHEN @ExpiryMonth_Clear = 1 THEN NULL ELSE ISNULL(@ExpiryMonth, [ExpiryMonth]) END,
        [ExpiryYear] = CASE WHEN @ExpiryYear_Clear = 1 THEN NULL ELSE ISNULL(@ExpiryYear, [ExpiryYear]) END,
        [HolderName] = CASE WHEN @HolderName_Clear = 1 THEN NULL ELSE ISNULL(@HolderName, [HolderName]) END,
        [BankName] = CASE WHEN @BankName_Clear = 1 THEN NULL ELSE ISNULL(@BankName, [BankName]) END,
        [RoutingLast4] = CASE WHEN @RoutingLast4_Clear = 1 THEN NULL ELSE ISNULL(@RoutingLast4, [RoutingLast4]) END,
        [AccountLast4] = CASE WHEN @AccountLast4_Clear = 1 THEN NULL ELSE ISNULL(@AccountLast4, [AccountLast4]) END,
        [BankAccountType] = CASE WHEN @BankAccountType_Clear = 1 THEN NULL ELSE ISNULL(@BankAccountType, [BankAccountType]) END,
        [ReferenceNumber] = CASE WHEN @ReferenceNumber_Clear = 1 THEN NULL ELSE ISNULL(@ReferenceNumber, [ReferenceNumber]) END,
        [InstrumentDate] = CASE WHEN @InstrumentDate_Clear = 1 THEN NULL ELSE ISNULL(@InstrumentDate, [InstrumentDate]) END,
        [StoredValueAccountID] = CASE WHEN @StoredValueAccountID_Clear = 1 THEN NULL ELSE ISNULL(@StoredValueAccountID, [StoredValueAccountID]) END,
        [SourceOrderHeaderID] = CASE WHEN @SourceOrderHeaderID_Clear = 1 THEN NULL ELSE ISNULL(@SourceOrderHeaderID, [SourceOrderHeaderID]) END,
        [Notes] = CASE WHEN @Notes_Clear = 1 THEN NULL ELSE ISNULL(@Notes, [Notes]) END
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwPaymentDetails] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwPaymentDetails]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdatePaymentDetail] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the PaymentDetail table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdatePaymentDetail]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdatePaymentDetail];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdatePaymentDetail
ON [${flyway:defaultSchema}].[PaymentDetail]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[PaymentDetail]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[PaymentDetail] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for MJ_BizApps_Orders: Payment Details */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdatePaymentDetail] TO [cdp_Developer], [cdp_Integration];

/* Base View SQL for MJ_BizApps_Orders: Payment Headers */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Payment Headers
-- Item: vwPaymentHeaders
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ_BizApps_Orders: Payment Headers
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  PaymentHeader
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwPaymentHeaders]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwPaymentHeaders];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwPaymentHeaders]
AS
SELECT
    p.*,
    MJCompany_ReceivingCompanyID.[Name] AS [ReceivingCompany],
    mjBizAppsCommonPerson_BillToPersonID.[DisplayName] AS [BillToPerson],
    mjBizAppsCommonOrganization_BillToOrganizationID.[Name] AS [BillToOrganization],
    mjBizAppsOrdersPaymentType_PaymentTypeID.[Name] AS [PaymentType],
    mjBizAppsOrdersPaymentProvider_PaymentProviderID.[Name] AS [PaymentProvider],
    mjBizAppsOrdersPaymentIntent_PaymentIntentID.[ProviderIntentID] AS [PaymentIntent],
    mjBizAppsOrdersPaymentDetail_PaymentDetailID.[Last4] AS [PaymentDetail],
    mjBizAppsOrdersPaymentHeader_ReversesPaymentHeaderID.[PaymentNumber] AS [ReversesPaymentHeader],
    mjBizAppsAccountingJournalEntry_JournalEntryID.[EntryNumber] AS [JournalEntry]
FROM
    [${flyway:defaultSchema}].[PaymentHeader] AS p
INNER JOIN
    [${mjSchema}].[Company] AS MJCompany_ReceivingCompanyID
  ON
    [p].[ReceivingCompanyID] = MJCompany_ReceivingCompanyID.[ID]
LEFT OUTER JOIN
    [${mjSchema}_BizAppsCommon].[Person] AS mjBizAppsCommonPerson_BillToPersonID
  ON
    [p].[BillToPersonID] = mjBizAppsCommonPerson_BillToPersonID.[ID]
LEFT OUTER JOIN
    [${mjSchema}_BizAppsCommon].[Organization] AS mjBizAppsCommonOrganization_BillToOrganizationID
  ON
    [p].[BillToOrganizationID] = mjBizAppsCommonOrganization_BillToOrganizationID.[ID]
INNER JOIN
    [${flyway:defaultSchema}].[PaymentType] AS mjBizAppsOrdersPaymentType_PaymentTypeID
  ON
    [p].[PaymentTypeID] = mjBizAppsOrdersPaymentType_PaymentTypeID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[PaymentProvider] AS mjBizAppsOrdersPaymentProvider_PaymentProviderID
  ON
    [p].[PaymentProviderID] = mjBizAppsOrdersPaymentProvider_PaymentProviderID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[PaymentIntent] AS mjBizAppsOrdersPaymentIntent_PaymentIntentID
  ON
    [p].[PaymentIntentID] = mjBizAppsOrdersPaymentIntent_PaymentIntentID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[PaymentDetail] AS mjBizAppsOrdersPaymentDetail_PaymentDetailID
  ON
    [p].[PaymentDetailID] = mjBizAppsOrdersPaymentDetail_PaymentDetailID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[PaymentHeader] AS mjBizAppsOrdersPaymentHeader_ReversesPaymentHeaderID
  ON
    [p].[ReversesPaymentHeaderID] = mjBizAppsOrdersPaymentHeader_ReversesPaymentHeaderID.[ID]
LEFT OUTER JOIN
    [${mjSchema}_BizAppsAccounting].[JournalEntry] AS mjBizAppsAccountingJournalEntry_JournalEntryID
  ON
    [p].[JournalEntryID] = mjBizAppsAccountingJournalEntry_JournalEntryID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwPaymentHeaders] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for MJ_BizApps_Orders: Payment Headers */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Payment Headers
-- Item: Permissions for vwPaymentHeaders
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwPaymentHeaders] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for MJ_BizApps_Orders: Payment Headers */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Payment Headers
-- Item: spCreatePaymentHeader
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR PaymentHeader
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreatePaymentHeader]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreatePaymentHeader];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreatePaymentHeader]
    @ID uniqueidentifier = NULL,
    @PaymentNumber nvarchar(40),
    @ReceivingCompanyID uniqueidentifier,
    @BillToPersonID_Clear bit = 0,
    @BillToPersonID uniqueidentifier = NULL,
    @BillToOrganizationID_Clear bit = 0,
    @BillToOrganizationID uniqueidentifier = NULL,
    @PaymentDate date,
    @PaymentTypeID uniqueidentifier,
    @Amount decimal(18, 2),
    @ProcessingFeeAmount decimal(18, 2) = NULL,
    @NetAmount_Clear bit = 0,
    @NetAmount decimal(18, 2) = NULL,
    @PaymentProviderID_Clear bit = 0,
    @PaymentProviderID uniqueidentifier = NULL,
    @PaymentIntentID_Clear bit = 0,
    @PaymentIntentID uniqueidentifier = NULL,
    @PaymentDetailID_Clear bit = 0,
    @PaymentDetailID uniqueidentifier = NULL,
    @ProviderChargeID_Clear bit = 0,
    @ProviderChargeID nvarchar(100) = NULL,
    @ProviderRefundID_Clear bit = 0,
    @ProviderRefundID nvarchar(100) = NULL,
    @ReversesPaymentHeaderID_Clear bit = 0,
    @ReversesPaymentHeaderID uniqueidentifier = NULL,
    @ReversalReason_Clear bit = 0,
    @ReversalReason nvarchar(MAX) = NULL,
    @Status nvarchar(20) = NULL,
    @JournalEntryID_Clear bit = 0,
    @JournalEntryID uniqueidentifier = NULL,
    @Description_Clear bit = 0,
    @Description nvarchar(MAX) = NULL,
    @Notes_Clear bit = 0,
    @Notes nvarchar(MAX) = NULL,
    @IdempotencyKey_Clear bit = 0,
    @IdempotencyKey nvarchar(200) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)

    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[PaymentHeader]
            (
                [ID],
                [PaymentNumber],
                [ReceivingCompanyID],
                [BillToPersonID],
                [BillToOrganizationID],
                [PaymentDate],
                [PaymentTypeID],
                [Amount],
                [ProcessingFeeAmount],
                [NetAmount],
                [PaymentProviderID],
                [PaymentIntentID],
                [PaymentDetailID],
                [ProviderChargeID],
                [ProviderRefundID],
                [ReversesPaymentHeaderID],
                [ReversalReason],
                [Status],
                [JournalEntryID],
                [Description],
                [Notes],
                [IdempotencyKey]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @PaymentNumber,
                @ReceivingCompanyID,
                CASE WHEN @BillToPersonID_Clear = 1 THEN NULL ELSE ISNULL(@BillToPersonID, NULL) END,
                CASE WHEN @BillToOrganizationID_Clear = 1 THEN NULL ELSE ISNULL(@BillToOrganizationID, NULL) END,
                @PaymentDate,
                @PaymentTypeID,
                @Amount,
                ISNULL(@ProcessingFeeAmount, 0),
                CASE WHEN @NetAmount_Clear = 1 THEN NULL ELSE ISNULL(@NetAmount, NULL) END,
                CASE WHEN @PaymentProviderID_Clear = 1 THEN NULL ELSE ISNULL(@PaymentProviderID, NULL) END,
                CASE WHEN @PaymentIntentID_Clear = 1 THEN NULL ELSE ISNULL(@PaymentIntentID, NULL) END,
                CASE WHEN @PaymentDetailID_Clear = 1 THEN NULL ELSE ISNULL(@PaymentDetailID, NULL) END,
                CASE WHEN @ProviderChargeID_Clear = 1 THEN NULL ELSE ISNULL(@ProviderChargeID, NULL) END,
                CASE WHEN @ProviderRefundID_Clear = 1 THEN NULL ELSE ISNULL(@ProviderRefundID, NULL) END,
                CASE WHEN @ReversesPaymentHeaderID_Clear = 1 THEN NULL ELSE ISNULL(@ReversesPaymentHeaderID, NULL) END,
                CASE WHEN @ReversalReason_Clear = 1 THEN NULL ELSE ISNULL(@ReversalReason, NULL) END,
                ISNULL(@Status, 'Pending'),
                CASE WHEN @JournalEntryID_Clear = 1 THEN NULL ELSE ISNULL(@JournalEntryID, NULL) END,
                CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, NULL) END,
                CASE WHEN @Notes_Clear = 1 THEN NULL ELSE ISNULL(@Notes, NULL) END,
                CASE WHEN @IdempotencyKey_Clear = 1 THEN NULL ELSE ISNULL(@IdempotencyKey, NULL) END
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[PaymentHeader]
            (
                [PaymentNumber],
                [ReceivingCompanyID],
                [BillToPersonID],
                [BillToOrganizationID],
                [PaymentDate],
                [PaymentTypeID],
                [Amount],
                [ProcessingFeeAmount],
                [NetAmount],
                [PaymentProviderID],
                [PaymentIntentID],
                [PaymentDetailID],
                [ProviderChargeID],
                [ProviderRefundID],
                [ReversesPaymentHeaderID],
                [ReversalReason],
                [Status],
                [JournalEntryID],
                [Description],
                [Notes],
                [IdempotencyKey]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @PaymentNumber,
                @ReceivingCompanyID,
                CASE WHEN @BillToPersonID_Clear = 1 THEN NULL ELSE ISNULL(@BillToPersonID, NULL) END,
                CASE WHEN @BillToOrganizationID_Clear = 1 THEN NULL ELSE ISNULL(@BillToOrganizationID, NULL) END,
                @PaymentDate,
                @PaymentTypeID,
                @Amount,
                ISNULL(@ProcessingFeeAmount, 0),
                CASE WHEN @NetAmount_Clear = 1 THEN NULL ELSE ISNULL(@NetAmount, NULL) END,
                CASE WHEN @PaymentProviderID_Clear = 1 THEN NULL ELSE ISNULL(@PaymentProviderID, NULL) END,
                CASE WHEN @PaymentIntentID_Clear = 1 THEN NULL ELSE ISNULL(@PaymentIntentID, NULL) END,
                CASE WHEN @PaymentDetailID_Clear = 1 THEN NULL ELSE ISNULL(@PaymentDetailID, NULL) END,
                CASE WHEN @ProviderChargeID_Clear = 1 THEN NULL ELSE ISNULL(@ProviderChargeID, NULL) END,
                CASE WHEN @ProviderRefundID_Clear = 1 THEN NULL ELSE ISNULL(@ProviderRefundID, NULL) END,
                CASE WHEN @ReversesPaymentHeaderID_Clear = 1 THEN NULL ELSE ISNULL(@ReversesPaymentHeaderID, NULL) END,
                CASE WHEN @ReversalReason_Clear = 1 THEN NULL ELSE ISNULL(@ReversalReason, NULL) END,
                ISNULL(@Status, 'Pending'),
                CASE WHEN @JournalEntryID_Clear = 1 THEN NULL ELSE ISNULL(@JournalEntryID, NULL) END,
                CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, NULL) END,
                CASE WHEN @Notes_Clear = 1 THEN NULL ELSE ISNULL(@Notes, NULL) END,
                CASE WHEN @IdempotencyKey_Clear = 1 THEN NULL ELSE ISNULL(@IdempotencyKey, NULL) END
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwPaymentHeaders] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreatePaymentHeader] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ_BizApps_Orders: Payment Headers */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreatePaymentHeader] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for MJ_BizApps_Orders: Payment Headers */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Payment Headers
-- Item: spUpdatePaymentHeader
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR PaymentHeader
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdatePaymentHeader]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdatePaymentHeader];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdatePaymentHeader]
    @ID uniqueidentifier,
    @PaymentNumber nvarchar(40) = NULL,
    @ReceivingCompanyID uniqueidentifier = NULL,
    @BillToPersonID_Clear bit = 0,
    @BillToPersonID uniqueidentifier = NULL,
    @BillToOrganizationID_Clear bit = 0,
    @BillToOrganizationID uniqueidentifier = NULL,
    @PaymentDate date = NULL,
    @PaymentTypeID uniqueidentifier = NULL,
    @Amount decimal(18, 2) = NULL,
    @ProcessingFeeAmount decimal(18, 2) = NULL,
    @NetAmount_Clear bit = 0,
    @NetAmount decimal(18, 2) = NULL,
    @PaymentProviderID_Clear bit = 0,
    @PaymentProviderID uniqueidentifier = NULL,
    @PaymentIntentID_Clear bit = 0,
    @PaymentIntentID uniqueidentifier = NULL,
    @PaymentDetailID_Clear bit = 0,
    @PaymentDetailID uniqueidentifier = NULL,
    @ProviderChargeID_Clear bit = 0,
    @ProviderChargeID nvarchar(100) = NULL,
    @ProviderRefundID_Clear bit = 0,
    @ProviderRefundID nvarchar(100) = NULL,
    @ReversesPaymentHeaderID_Clear bit = 0,
    @ReversesPaymentHeaderID uniqueidentifier = NULL,
    @ReversalReason_Clear bit = 0,
    @ReversalReason nvarchar(MAX) = NULL,
    @Status nvarchar(20) = NULL,
    @JournalEntryID_Clear bit = 0,
    @JournalEntryID uniqueidentifier = NULL,
    @Description_Clear bit = 0,
    @Description nvarchar(MAX) = NULL,
    @Notes_Clear bit = 0,
    @Notes nvarchar(MAX) = NULL,
    @IdempotencyKey_Clear bit = 0,
    @IdempotencyKey nvarchar(200) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[PaymentHeader]
    SET
        [PaymentNumber] = ISNULL(@PaymentNumber, [PaymentNumber]),
        [ReceivingCompanyID] = ISNULL(@ReceivingCompanyID, [ReceivingCompanyID]),
        [BillToPersonID] = CASE WHEN @BillToPersonID_Clear = 1 THEN NULL ELSE ISNULL(@BillToPersonID, [BillToPersonID]) END,
        [BillToOrganizationID] = CASE WHEN @BillToOrganizationID_Clear = 1 THEN NULL ELSE ISNULL(@BillToOrganizationID, [BillToOrganizationID]) END,
        [PaymentDate] = ISNULL(@PaymentDate, [PaymentDate]),
        [PaymentTypeID] = ISNULL(@PaymentTypeID, [PaymentTypeID]),
        [Amount] = ISNULL(@Amount, [Amount]),
        [ProcessingFeeAmount] = ISNULL(@ProcessingFeeAmount, [ProcessingFeeAmount]),
        [NetAmount] = CASE WHEN @NetAmount_Clear = 1 THEN NULL ELSE ISNULL(@NetAmount, [NetAmount]) END,
        [PaymentProviderID] = CASE WHEN @PaymentProviderID_Clear = 1 THEN NULL ELSE ISNULL(@PaymentProviderID, [PaymentProviderID]) END,
        [PaymentIntentID] = CASE WHEN @PaymentIntentID_Clear = 1 THEN NULL ELSE ISNULL(@PaymentIntentID, [PaymentIntentID]) END,
        [PaymentDetailID] = CASE WHEN @PaymentDetailID_Clear = 1 THEN NULL ELSE ISNULL(@PaymentDetailID, [PaymentDetailID]) END,
        [ProviderChargeID] = CASE WHEN @ProviderChargeID_Clear = 1 THEN NULL ELSE ISNULL(@ProviderChargeID, [ProviderChargeID]) END,
        [ProviderRefundID] = CASE WHEN @ProviderRefundID_Clear = 1 THEN NULL ELSE ISNULL(@ProviderRefundID, [ProviderRefundID]) END,
        [ReversesPaymentHeaderID] = CASE WHEN @ReversesPaymentHeaderID_Clear = 1 THEN NULL ELSE ISNULL(@ReversesPaymentHeaderID, [ReversesPaymentHeaderID]) END,
        [ReversalReason] = CASE WHEN @ReversalReason_Clear = 1 THEN NULL ELSE ISNULL(@ReversalReason, [ReversalReason]) END,
        [Status] = ISNULL(@Status, [Status]),
        [JournalEntryID] = CASE WHEN @JournalEntryID_Clear = 1 THEN NULL ELSE ISNULL(@JournalEntryID, [JournalEntryID]) END,
        [Description] = CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, [Description]) END,
        [Notes] = CASE WHEN @Notes_Clear = 1 THEN NULL ELSE ISNULL(@Notes, [Notes]) END,
        [IdempotencyKey] = CASE WHEN @IdempotencyKey_Clear = 1 THEN NULL ELSE ISNULL(@IdempotencyKey, [IdempotencyKey]) END
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwPaymentHeaders] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwPaymentHeaders]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdatePaymentHeader] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the PaymentHeader table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdatePaymentHeader]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdatePaymentHeader];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdatePaymentHeader
ON [${flyway:defaultSchema}].[PaymentHeader]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[PaymentHeader]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[PaymentHeader] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for MJ_BizApps_Orders: Payment Headers */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdatePaymentHeader] TO [cdp_Developer], [cdp_Integration];

/* Base View SQL for MJ_BizApps_Orders: Payment Intents */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Payment Intents
-- Item: vwPaymentIntents
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ_BizApps_Orders: Payment Intents
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  PaymentIntent
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwPaymentIntents]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwPaymentIntents];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwPaymentIntents]
AS
SELECT
    p.*,
    mjBizAppsOrdersPaymentProvider_PaymentProviderID.[Name] AS [PaymentProvider],
    mjBizAppsOrdersOrderHeader_OrderHeaderID.[OrderNumber] AS [OrderHeader],
    mjBizAppsCommonPerson_BillToPersonID.[DisplayName] AS [BillToPerson],
    mjBizAppsCommonOrganization_BillToOrganizationID.[Name] AS [BillToOrganization]
FROM
    [${flyway:defaultSchema}].[PaymentIntent] AS p
INNER JOIN
    [${flyway:defaultSchema}].[PaymentProvider] AS mjBizAppsOrdersPaymentProvider_PaymentProviderID
  ON
    [p].[PaymentProviderID] = mjBizAppsOrdersPaymentProvider_PaymentProviderID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[OrderHeader] AS mjBizAppsOrdersOrderHeader_OrderHeaderID
  ON
    [p].[OrderHeaderID] = mjBizAppsOrdersOrderHeader_OrderHeaderID.[ID]
LEFT OUTER JOIN
    [${mjSchema}_BizAppsCommon].[Person] AS mjBizAppsCommonPerson_BillToPersonID
  ON
    [p].[BillToPersonID] = mjBizAppsCommonPerson_BillToPersonID.[ID]
LEFT OUTER JOIN
    [${mjSchema}_BizAppsCommon].[Organization] AS mjBizAppsCommonOrganization_BillToOrganizationID
  ON
    [p].[BillToOrganizationID] = mjBizAppsCommonOrganization_BillToOrganizationID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwPaymentIntents] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for MJ_BizApps_Orders: Payment Intents */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Payment Intents
-- Item: Permissions for vwPaymentIntents
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwPaymentIntents] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for MJ_BizApps_Orders: Payment Intents */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Payment Intents
-- Item: spCreatePaymentIntent
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR PaymentIntent
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreatePaymentIntent]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreatePaymentIntent];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreatePaymentIntent]
    @ID uniqueidentifier = NULL,
    @PaymentProviderID uniqueidentifier,
    @ProviderIntentID nvarchar(100),
    @Status nvarchar(30),
    @Amount decimal(18, 2),
    @OrderHeaderID_Clear bit = 0,
    @OrderHeaderID uniqueidentifier = NULL,
    @BillToPersonID_Clear bit = 0,
    @BillToPersonID uniqueidentifier = NULL,
    @BillToOrganizationID_Clear bit = 0,
    @BillToOrganizationID uniqueidentifier = NULL,
    @ProviderEventID_Clear bit = 0,
    @ProviderEventID nvarchar(100) = NULL,
    @LastEventAt_Clear bit = 0,
    @LastEventAt datetimeoffset = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)

    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[PaymentIntent]
            (
                [ID],
                [PaymentProviderID],
                [ProviderIntentID],
                [Status],
                [Amount],
                [OrderHeaderID],
                [BillToPersonID],
                [BillToOrganizationID],
                [ProviderEventID],
                [LastEventAt]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @PaymentProviderID,
                @ProviderIntentID,
                @Status,
                @Amount,
                CASE WHEN @OrderHeaderID_Clear = 1 THEN NULL ELSE ISNULL(@OrderHeaderID, NULL) END,
                CASE WHEN @BillToPersonID_Clear = 1 THEN NULL ELSE ISNULL(@BillToPersonID, NULL) END,
                CASE WHEN @BillToOrganizationID_Clear = 1 THEN NULL ELSE ISNULL(@BillToOrganizationID, NULL) END,
                CASE WHEN @ProviderEventID_Clear = 1 THEN NULL ELSE ISNULL(@ProviderEventID, NULL) END,
                CASE WHEN @LastEventAt_Clear = 1 THEN NULL ELSE ISNULL(@LastEventAt, NULL) END
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[PaymentIntent]
            (
                [PaymentProviderID],
                [ProviderIntentID],
                [Status],
                [Amount],
                [OrderHeaderID],
                [BillToPersonID],
                [BillToOrganizationID],
                [ProviderEventID],
                [LastEventAt]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @PaymentProviderID,
                @ProviderIntentID,
                @Status,
                @Amount,
                CASE WHEN @OrderHeaderID_Clear = 1 THEN NULL ELSE ISNULL(@OrderHeaderID, NULL) END,
                CASE WHEN @BillToPersonID_Clear = 1 THEN NULL ELSE ISNULL(@BillToPersonID, NULL) END,
                CASE WHEN @BillToOrganizationID_Clear = 1 THEN NULL ELSE ISNULL(@BillToOrganizationID, NULL) END,
                CASE WHEN @ProviderEventID_Clear = 1 THEN NULL ELSE ISNULL(@ProviderEventID, NULL) END,
                CASE WHEN @LastEventAt_Clear = 1 THEN NULL ELSE ISNULL(@LastEventAt, NULL) END
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwPaymentIntents] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreatePaymentIntent] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ_BizApps_Orders: Payment Intents */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreatePaymentIntent] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for MJ_BizApps_Orders: Payment Intents */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Payment Intents
-- Item: spUpdatePaymentIntent
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR PaymentIntent
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdatePaymentIntent]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdatePaymentIntent];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdatePaymentIntent]
    @ID uniqueidentifier,
    @PaymentProviderID uniqueidentifier = NULL,
    @ProviderIntentID nvarchar(100) = NULL,
    @Status nvarchar(30) = NULL,
    @Amount decimal(18, 2) = NULL,
    @OrderHeaderID_Clear bit = 0,
    @OrderHeaderID uniqueidentifier = NULL,
    @BillToPersonID_Clear bit = 0,
    @BillToPersonID uniqueidentifier = NULL,
    @BillToOrganizationID_Clear bit = 0,
    @BillToOrganizationID uniqueidentifier = NULL,
    @ProviderEventID_Clear bit = 0,
    @ProviderEventID nvarchar(100) = NULL,
    @LastEventAt_Clear bit = 0,
    @LastEventAt datetimeoffset = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[PaymentIntent]
    SET
        [PaymentProviderID] = ISNULL(@PaymentProviderID, [PaymentProviderID]),
        [ProviderIntentID] = ISNULL(@ProviderIntentID, [ProviderIntentID]),
        [Status] = ISNULL(@Status, [Status]),
        [Amount] = ISNULL(@Amount, [Amount]),
        [OrderHeaderID] = CASE WHEN @OrderHeaderID_Clear = 1 THEN NULL ELSE ISNULL(@OrderHeaderID, [OrderHeaderID]) END,
        [BillToPersonID] = CASE WHEN @BillToPersonID_Clear = 1 THEN NULL ELSE ISNULL(@BillToPersonID, [BillToPersonID]) END,
        [BillToOrganizationID] = CASE WHEN @BillToOrganizationID_Clear = 1 THEN NULL ELSE ISNULL(@BillToOrganizationID, [BillToOrganizationID]) END,
        [ProviderEventID] = CASE WHEN @ProviderEventID_Clear = 1 THEN NULL ELSE ISNULL(@ProviderEventID, [ProviderEventID]) END,
        [LastEventAt] = CASE WHEN @LastEventAt_Clear = 1 THEN NULL ELSE ISNULL(@LastEventAt, [LastEventAt]) END
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwPaymentIntents] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwPaymentIntents]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdatePaymentIntent] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the PaymentIntent table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdatePaymentIntent]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdatePaymentIntent];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdatePaymentIntent
ON [${flyway:defaultSchema}].[PaymentIntent]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[PaymentIntent]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[PaymentIntent] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for MJ_BizApps_Orders: Payment Intents */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdatePaymentIntent] TO [cdp_Developer], [cdp_Integration];

/* Base View SQL for MJ_BizApps_Orders: Payment Lines */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Payment Lines
-- Item: vwPaymentLines
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ_BizApps_Orders: Payment Lines
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  PaymentLine
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwPaymentLines]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwPaymentLines];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwPaymentLines]
AS
SELECT
    p.*,
    mjBizAppsOrdersPaymentHeader_PaymentHeaderID.[PaymentNumber] AS [PaymentHeader],
    mjBizAppsOrdersOrderHeader_OrderHeaderID.[OrderNumber] AS [OrderHeader],
    MJUser_AllocatedByUserID.[Name] AS [AllocatedByUser]
FROM
    [${flyway:defaultSchema}].[PaymentLine] AS p
INNER JOIN
    [${flyway:defaultSchema}].[PaymentHeader] AS mjBizAppsOrdersPaymentHeader_PaymentHeaderID
  ON
    [p].[PaymentHeaderID] = mjBizAppsOrdersPaymentHeader_PaymentHeaderID.[ID]
INNER JOIN
    [${flyway:defaultSchema}].[OrderHeader] AS mjBizAppsOrdersOrderHeader_OrderHeaderID
  ON
    [p].[OrderHeaderID] = mjBizAppsOrdersOrderHeader_OrderHeaderID.[ID]
LEFT OUTER JOIN
    [${mjSchema}].[User] AS MJUser_AllocatedByUserID
  ON
    [p].[AllocatedByUserID] = MJUser_AllocatedByUserID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwPaymentLines] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for MJ_BizApps_Orders: Payment Lines */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Payment Lines
-- Item: Permissions for vwPaymentLines
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwPaymentLines] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for MJ_BizApps_Orders: Payment Lines */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Payment Lines
-- Item: spCreatePaymentLine
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR PaymentLine
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreatePaymentLine]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreatePaymentLine];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreatePaymentLine]
    @ID uniqueidentifier = NULL,
    @PaymentHeaderID uniqueidentifier,
    @OrderHeaderID uniqueidentifier,
    @OrderLineID_Clear bit = 0,
    @OrderLineID uniqueidentifier = NULL,
    @Amount decimal(18, 2),
    @AllocatedAt datetimeoffset,
    @AllocatedByUserID_Clear bit = 0,
    @AllocatedByUserID uniqueidentifier = NULL,
    @BookedAt_Clear bit = 0,
    @BookedAt datetimeoffset = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)

    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[PaymentLine]
            (
                [ID],
                [PaymentHeaderID],
                [OrderHeaderID],
                [OrderLineID],
                [Amount],
                [AllocatedAt],
                [AllocatedByUserID],
                [BookedAt]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @PaymentHeaderID,
                @OrderHeaderID,
                CASE WHEN @OrderLineID_Clear = 1 THEN NULL ELSE ISNULL(@OrderLineID, NULL) END,
                @Amount,
                @AllocatedAt,
                CASE WHEN @AllocatedByUserID_Clear = 1 THEN NULL ELSE ISNULL(@AllocatedByUserID, NULL) END,
                CASE WHEN @BookedAt_Clear = 1 THEN NULL ELSE ISNULL(@BookedAt, NULL) END
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[PaymentLine]
            (
                [PaymentHeaderID],
                [OrderHeaderID],
                [OrderLineID],
                [Amount],
                [AllocatedAt],
                [AllocatedByUserID],
                [BookedAt]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @PaymentHeaderID,
                @OrderHeaderID,
                CASE WHEN @OrderLineID_Clear = 1 THEN NULL ELSE ISNULL(@OrderLineID, NULL) END,
                @Amount,
                @AllocatedAt,
                CASE WHEN @AllocatedByUserID_Clear = 1 THEN NULL ELSE ISNULL(@AllocatedByUserID, NULL) END,
                CASE WHEN @BookedAt_Clear = 1 THEN NULL ELSE ISNULL(@BookedAt, NULL) END
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwPaymentLines] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreatePaymentLine] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ_BizApps_Orders: Payment Lines */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreatePaymentLine] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for MJ_BizApps_Orders: Payment Lines */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Payment Lines
-- Item: spUpdatePaymentLine
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR PaymentLine
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdatePaymentLine]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdatePaymentLine];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdatePaymentLine]
    @ID uniqueidentifier,
    @PaymentHeaderID uniqueidentifier = NULL,
    @OrderHeaderID uniqueidentifier = NULL,
    @OrderLineID_Clear bit = 0,
    @OrderLineID uniqueidentifier = NULL,
    @Amount decimal(18, 2) = NULL,
    @AllocatedAt datetimeoffset = NULL,
    @AllocatedByUserID_Clear bit = 0,
    @AllocatedByUserID uniqueidentifier = NULL,
    @BookedAt_Clear bit = 0,
    @BookedAt datetimeoffset = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[PaymentLine]
    SET
        [PaymentHeaderID] = ISNULL(@PaymentHeaderID, [PaymentHeaderID]),
        [OrderHeaderID] = ISNULL(@OrderHeaderID, [OrderHeaderID]),
        [OrderLineID] = CASE WHEN @OrderLineID_Clear = 1 THEN NULL ELSE ISNULL(@OrderLineID, [OrderLineID]) END,
        [Amount] = ISNULL(@Amount, [Amount]),
        [AllocatedAt] = ISNULL(@AllocatedAt, [AllocatedAt]),
        [AllocatedByUserID] = CASE WHEN @AllocatedByUserID_Clear = 1 THEN NULL ELSE ISNULL(@AllocatedByUserID, [AllocatedByUserID]) END,
        [BookedAt] = CASE WHEN @BookedAt_Clear = 1 THEN NULL ELSE ISNULL(@BookedAt, [BookedAt]) END
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwPaymentLines] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwPaymentLines]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdatePaymentLine] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the PaymentLine table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdatePaymentLine]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdatePaymentLine];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdatePaymentLine
ON [${flyway:defaultSchema}].[PaymentLine]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[PaymentLine]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[PaymentLine] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for MJ_BizApps_Orders: Payment Lines */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdatePaymentLine] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for MJ_BizApps_Orders: Payment Details */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Payment Details
-- Item: spDeletePaymentDetail
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR PaymentDetail
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeletePaymentDetail]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeletePaymentDetail];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeletePaymentDetail]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[PaymentDetail]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeletePaymentDetail] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for MJ_BizApps_Orders: Payment Details */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeletePaymentDetail] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for MJ_BizApps_Orders: Payment Headers */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Payment Headers
-- Item: spDeletePaymentHeader
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR PaymentHeader
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeletePaymentHeader]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeletePaymentHeader];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeletePaymentHeader]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[PaymentHeader]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeletePaymentHeader] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for MJ_BizApps_Orders: Payment Headers */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeletePaymentHeader] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for MJ_BizApps_Orders: Payment Intents */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Payment Intents
-- Item: spDeletePaymentIntent
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR PaymentIntent
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeletePaymentIntent]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeletePaymentIntent];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeletePaymentIntent]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[PaymentIntent]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeletePaymentIntent] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for MJ_BizApps_Orders: Payment Intents */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeletePaymentIntent] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for MJ_BizApps_Orders: Payment Lines */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Payment Lines
-- Item: spDeletePaymentLine
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR PaymentLine
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeletePaymentLine]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeletePaymentLine];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeletePaymentLine]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[PaymentLine]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeletePaymentLine] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for MJ_BizApps_Orders: Payment Lines */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeletePaymentLine] TO [cdp_Developer], [cdp_Integration];

/* Index for Foreign Keys for StoredValueTransaction */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Stored Value Transactions
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key StoredValueAccountID in table StoredValueTransaction
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_StoredValueTransaction_StoredValueAccountID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[StoredValueTransaction]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_StoredValueTransaction_StoredValueAccountID ON [${flyway:defaultSchema}].[StoredValueTransaction] ([StoredValueAccountID]);

-- Index for foreign key RelatedPaymentID in table StoredValueTransaction
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_StoredValueTransaction_RelatedPaymentID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[StoredValueTransaction]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_StoredValueTransaction_RelatedPaymentID ON [${flyway:defaultSchema}].[StoredValueTransaction] ([RelatedPaymentID]);

-- Index for foreign key RelatedOrderHeaderID in table StoredValueTransaction
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_StoredValueTransaction_RelatedOrderHeaderID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[StoredValueTransaction]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_StoredValueTransaction_RelatedOrderHeaderID ON [${flyway:defaultSchema}].[StoredValueTransaction] ([RelatedOrderHeaderID]);

/* Index for Foreign Keys for SubscriptionEvent */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Subscription Events
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key SubscriptionID in table SubscriptionEvent
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_SubscriptionEvent_SubscriptionID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[SubscriptionEvent]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_SubscriptionEvent_SubscriptionID ON [${flyway:defaultSchema}].[SubscriptionEvent] ([SubscriptionID]);

-- Index for foreign key RelatedPaymentID in table SubscriptionEvent
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_SubscriptionEvent_RelatedPaymentID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[SubscriptionEvent]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_SubscriptionEvent_RelatedPaymentID ON [${flyway:defaultSchema}].[SubscriptionEvent] ([RelatedPaymentID]);

-- Index for foreign key RelatedOrderHeaderID in table SubscriptionEvent
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_SubscriptionEvent_RelatedOrderHeaderID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[SubscriptionEvent]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_SubscriptionEvent_RelatedOrderHeaderID ON [${flyway:defaultSchema}].[SubscriptionEvent] ([RelatedOrderHeaderID]);

/* Index for Foreign Keys for SubscriptionTerm */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Subscription Terms
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key SubscriptionID in table SubscriptionTerm
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_SubscriptionTerm_SubscriptionID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[SubscriptionTerm]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_SubscriptionTerm_SubscriptionID ON [${flyway:defaultSchema}].[SubscriptionTerm] ([SubscriptionID]);

-- Index for foreign key OrderLineID in table SubscriptionTerm
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_SubscriptionTerm_OrderLineID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[SubscriptionTerm]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_SubscriptionTerm_OrderLineID ON [${flyway:defaultSchema}].[SubscriptionTerm] ([OrderLineID]);

-- Index for foreign key RevenueRecognitionTypeID in table SubscriptionTerm
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_SubscriptionTerm_RevenueRecognitionTypeID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[SubscriptionTerm]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_SubscriptionTerm_RevenueRecognitionTypeID ON [${flyway:defaultSchema}].[SubscriptionTerm] ([RevenueRecognitionTypeID]);

/* Base View SQL for MJ_BizApps_Orders: Stored Value Transactions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Stored Value Transactions
-- Item: vwStoredValueTransactions
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ_BizApps_Orders: Stored Value Transactions
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  StoredValueTransaction
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwStoredValueTransactions]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwStoredValueTransactions];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwStoredValueTransactions]
AS
SELECT
    s.*,
    mjBizAppsOrdersStoredValueAccount_StoredValueAccountID.[Code] AS [StoredValueAccount],
    mjBizAppsOrdersPaymentHeader_RelatedPaymentID.[PaymentNumber] AS [RelatedPayment],
    mjBizAppsOrdersOrderHeader_RelatedOrderHeaderID.[OrderNumber] AS [RelatedOrderHeader]
FROM
    [${flyway:defaultSchema}].[StoredValueTransaction] AS s
INNER JOIN
    [${flyway:defaultSchema}].[StoredValueAccount] AS mjBizAppsOrdersStoredValueAccount_StoredValueAccountID
  ON
    [s].[StoredValueAccountID] = mjBizAppsOrdersStoredValueAccount_StoredValueAccountID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[PaymentHeader] AS mjBizAppsOrdersPaymentHeader_RelatedPaymentID
  ON
    [s].[RelatedPaymentID] = mjBizAppsOrdersPaymentHeader_RelatedPaymentID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[OrderHeader] AS mjBizAppsOrdersOrderHeader_RelatedOrderHeaderID
  ON
    [s].[RelatedOrderHeaderID] = mjBizAppsOrdersOrderHeader_RelatedOrderHeaderID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwStoredValueTransactions] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for MJ_BizApps_Orders: Stored Value Transactions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Stored Value Transactions
-- Item: Permissions for vwStoredValueTransactions
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwStoredValueTransactions] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for MJ_BizApps_Orders: Stored Value Transactions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Stored Value Transactions
-- Item: spCreateStoredValueTransaction
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR StoredValueTransaction
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateStoredValueTransaction]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateStoredValueTransaction];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateStoredValueTransaction]
    @ID uniqueidentifier = NULL,
    @StoredValueAccountID uniqueidentifier,
    @TransactionType nvarchar(20),
    @Amount decimal(18, 2),
    @BalanceAfter decimal(18, 2),
    @RelatedPaymentID_Clear bit = 0,
    @RelatedPaymentID uniqueidentifier = NULL,
    @RelatedOrderHeaderID_Clear bit = 0,
    @RelatedOrderHeaderID uniqueidentifier = NULL,
    @OccurredAt datetimeoffset
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)

    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[StoredValueTransaction]
            (
                [ID],
                [StoredValueAccountID],
                [TransactionType],
                [Amount],
                [BalanceAfter],
                [RelatedPaymentID],
                [RelatedOrderHeaderID],
                [OccurredAt]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @StoredValueAccountID,
                @TransactionType,
                @Amount,
                @BalanceAfter,
                CASE WHEN @RelatedPaymentID_Clear = 1 THEN NULL ELSE ISNULL(@RelatedPaymentID, NULL) END,
                CASE WHEN @RelatedOrderHeaderID_Clear = 1 THEN NULL ELSE ISNULL(@RelatedOrderHeaderID, NULL) END,
                @OccurredAt
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[StoredValueTransaction]
            (
                [StoredValueAccountID],
                [TransactionType],
                [Amount],
                [BalanceAfter],
                [RelatedPaymentID],
                [RelatedOrderHeaderID],
                [OccurredAt]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @StoredValueAccountID,
                @TransactionType,
                @Amount,
                @BalanceAfter,
                CASE WHEN @RelatedPaymentID_Clear = 1 THEN NULL ELSE ISNULL(@RelatedPaymentID, NULL) END,
                CASE WHEN @RelatedOrderHeaderID_Clear = 1 THEN NULL ELSE ISNULL(@RelatedOrderHeaderID, NULL) END,
                @OccurredAt
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwStoredValueTransactions] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateStoredValueTransaction] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ_BizApps_Orders: Stored Value Transactions */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateStoredValueTransaction] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for MJ_BizApps_Orders: Stored Value Transactions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Stored Value Transactions
-- Item: spUpdateStoredValueTransaction
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR StoredValueTransaction
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateStoredValueTransaction]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateStoredValueTransaction];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateStoredValueTransaction]
    @ID uniqueidentifier,
    @StoredValueAccountID uniqueidentifier = NULL,
    @TransactionType nvarchar(20) = NULL,
    @Amount decimal(18, 2) = NULL,
    @BalanceAfter decimal(18, 2) = NULL,
    @RelatedPaymentID_Clear bit = 0,
    @RelatedPaymentID uniqueidentifier = NULL,
    @RelatedOrderHeaderID_Clear bit = 0,
    @RelatedOrderHeaderID uniqueidentifier = NULL,
    @OccurredAt datetimeoffset = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[StoredValueTransaction]
    SET
        [StoredValueAccountID] = ISNULL(@StoredValueAccountID, [StoredValueAccountID]),
        [TransactionType] = ISNULL(@TransactionType, [TransactionType]),
        [Amount] = ISNULL(@Amount, [Amount]),
        [BalanceAfter] = ISNULL(@BalanceAfter, [BalanceAfter]),
        [RelatedPaymentID] = CASE WHEN @RelatedPaymentID_Clear = 1 THEN NULL ELSE ISNULL(@RelatedPaymentID, [RelatedPaymentID]) END,
        [RelatedOrderHeaderID] = CASE WHEN @RelatedOrderHeaderID_Clear = 1 THEN NULL ELSE ISNULL(@RelatedOrderHeaderID, [RelatedOrderHeaderID]) END,
        [OccurredAt] = ISNULL(@OccurredAt, [OccurredAt])
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwStoredValueTransactions] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwStoredValueTransactions]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateStoredValueTransaction] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the StoredValueTransaction table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateStoredValueTransaction]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateStoredValueTransaction];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateStoredValueTransaction
ON [${flyway:defaultSchema}].[StoredValueTransaction]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[StoredValueTransaction]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[StoredValueTransaction] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for MJ_BizApps_Orders: Stored Value Transactions */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateStoredValueTransaction] TO [cdp_Developer], [cdp_Integration];

/* Base View SQL for MJ_BizApps_Orders: Subscription Events */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Subscription Events
-- Item: vwSubscriptionEvents
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ_BizApps_Orders: Subscription Events
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  SubscriptionEvent
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwSubscriptionEvents]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwSubscriptionEvents];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwSubscriptionEvents]
AS
SELECT
    s.*,
    mjBizAppsOrdersSubscription_SubscriptionID.[SubscriptionNumber] AS [Subscription],
    mjBizAppsOrdersPaymentHeader_RelatedPaymentID.[PaymentNumber] AS [RelatedPayment],
    mjBizAppsOrdersOrderHeader_RelatedOrderHeaderID.[OrderNumber] AS [RelatedOrderHeader]
FROM
    [${flyway:defaultSchema}].[SubscriptionEvent] AS s
INNER JOIN
    [${flyway:defaultSchema}].[Subscription] AS mjBizAppsOrdersSubscription_SubscriptionID
  ON
    [s].[SubscriptionID] = mjBizAppsOrdersSubscription_SubscriptionID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[PaymentHeader] AS mjBizAppsOrdersPaymentHeader_RelatedPaymentID
  ON
    [s].[RelatedPaymentID] = mjBizAppsOrdersPaymentHeader_RelatedPaymentID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[OrderHeader] AS mjBizAppsOrdersOrderHeader_RelatedOrderHeaderID
  ON
    [s].[RelatedOrderHeaderID] = mjBizAppsOrdersOrderHeader_RelatedOrderHeaderID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwSubscriptionEvents] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for MJ_BizApps_Orders: Subscription Events */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Subscription Events
-- Item: Permissions for vwSubscriptionEvents
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwSubscriptionEvents] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for MJ_BizApps_Orders: Subscription Events */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Subscription Events
-- Item: spCreateSubscriptionEvent
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR SubscriptionEvent
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateSubscriptionEvent]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateSubscriptionEvent];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateSubscriptionEvent]
    @ID uniqueidentifier = NULL,
    @SubscriptionID uniqueidentifier,
    @EventType nvarchar(40),
    @OccurredAt datetimeoffset,
    @EventData_Clear bit = 0,
    @EventData nvarchar(MAX) = NULL,
    @ProviderEventID_Clear bit = 0,
    @ProviderEventID nvarchar(100) = NULL,
    @RelatedPaymentID_Clear bit = 0,
    @RelatedPaymentID uniqueidentifier = NULL,
    @RelatedOrderHeaderID_Clear bit = 0,
    @RelatedOrderHeaderID uniqueidentifier = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)

    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[SubscriptionEvent]
            (
                [ID],
                [SubscriptionID],
                [EventType],
                [OccurredAt],
                [EventData],
                [ProviderEventID],
                [RelatedPaymentID],
                [RelatedOrderHeaderID]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @SubscriptionID,
                @EventType,
                @OccurredAt,
                CASE WHEN @EventData_Clear = 1 THEN NULL ELSE ISNULL(@EventData, NULL) END,
                CASE WHEN @ProviderEventID_Clear = 1 THEN NULL ELSE ISNULL(@ProviderEventID, NULL) END,
                CASE WHEN @RelatedPaymentID_Clear = 1 THEN NULL ELSE ISNULL(@RelatedPaymentID, NULL) END,
                CASE WHEN @RelatedOrderHeaderID_Clear = 1 THEN NULL ELSE ISNULL(@RelatedOrderHeaderID, NULL) END
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[SubscriptionEvent]
            (
                [SubscriptionID],
                [EventType],
                [OccurredAt],
                [EventData],
                [ProviderEventID],
                [RelatedPaymentID],
                [RelatedOrderHeaderID]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @SubscriptionID,
                @EventType,
                @OccurredAt,
                CASE WHEN @EventData_Clear = 1 THEN NULL ELSE ISNULL(@EventData, NULL) END,
                CASE WHEN @ProviderEventID_Clear = 1 THEN NULL ELSE ISNULL(@ProviderEventID, NULL) END,
                CASE WHEN @RelatedPaymentID_Clear = 1 THEN NULL ELSE ISNULL(@RelatedPaymentID, NULL) END,
                CASE WHEN @RelatedOrderHeaderID_Clear = 1 THEN NULL ELSE ISNULL(@RelatedOrderHeaderID, NULL) END
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwSubscriptionEvents] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateSubscriptionEvent] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ_BizApps_Orders: Subscription Events */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateSubscriptionEvent] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for MJ_BizApps_Orders: Subscription Events */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Subscription Events
-- Item: spUpdateSubscriptionEvent
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR SubscriptionEvent
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateSubscriptionEvent]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateSubscriptionEvent];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateSubscriptionEvent]
    @ID uniqueidentifier,
    @SubscriptionID uniqueidentifier = NULL,
    @EventType nvarchar(40) = NULL,
    @OccurredAt datetimeoffset = NULL,
    @EventData_Clear bit = 0,
    @EventData nvarchar(MAX) = NULL,
    @ProviderEventID_Clear bit = 0,
    @ProviderEventID nvarchar(100) = NULL,
    @RelatedPaymentID_Clear bit = 0,
    @RelatedPaymentID uniqueidentifier = NULL,
    @RelatedOrderHeaderID_Clear bit = 0,
    @RelatedOrderHeaderID uniqueidentifier = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[SubscriptionEvent]
    SET
        [SubscriptionID] = ISNULL(@SubscriptionID, [SubscriptionID]),
        [EventType] = ISNULL(@EventType, [EventType]),
        [OccurredAt] = ISNULL(@OccurredAt, [OccurredAt]),
        [EventData] = CASE WHEN @EventData_Clear = 1 THEN NULL ELSE ISNULL(@EventData, [EventData]) END,
        [ProviderEventID] = CASE WHEN @ProviderEventID_Clear = 1 THEN NULL ELSE ISNULL(@ProviderEventID, [ProviderEventID]) END,
        [RelatedPaymentID] = CASE WHEN @RelatedPaymentID_Clear = 1 THEN NULL ELSE ISNULL(@RelatedPaymentID, [RelatedPaymentID]) END,
        [RelatedOrderHeaderID] = CASE WHEN @RelatedOrderHeaderID_Clear = 1 THEN NULL ELSE ISNULL(@RelatedOrderHeaderID, [RelatedOrderHeaderID]) END
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwSubscriptionEvents] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwSubscriptionEvents]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateSubscriptionEvent] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the SubscriptionEvent table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateSubscriptionEvent]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateSubscriptionEvent];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateSubscriptionEvent
ON [${flyway:defaultSchema}].[SubscriptionEvent]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[SubscriptionEvent]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[SubscriptionEvent] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for MJ_BizApps_Orders: Subscription Events */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateSubscriptionEvent] TO [cdp_Developer], [cdp_Integration];

/* Base View SQL for MJ_BizApps_Orders: Subscription Terms */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Subscription Terms
-- Item: vwSubscriptionTerms
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ_BizApps_Orders: Subscription Terms
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  SubscriptionTerm
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwSubscriptionTerms]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwSubscriptionTerms];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwSubscriptionTerms]
AS
SELECT
    s.*,
    mjBizAppsOrdersSubscription_SubscriptionID.[SubscriptionNumber] AS [Subscription],
    mjBizAppsOrdersRevenueRecognitionType_RevenueRecognitionTypeID.[Name] AS [RevenueRecognitionType]
FROM
    [${flyway:defaultSchema}].[SubscriptionTerm] AS s
INNER JOIN
    [${flyway:defaultSchema}].[Subscription] AS mjBizAppsOrdersSubscription_SubscriptionID
  ON
    [s].[SubscriptionID] = mjBizAppsOrdersSubscription_SubscriptionID.[ID]
INNER JOIN
    [${flyway:defaultSchema}].[RevenueRecognitionType] AS mjBizAppsOrdersRevenueRecognitionType_RevenueRecognitionTypeID
  ON
    [s].[RevenueRecognitionTypeID] = mjBizAppsOrdersRevenueRecognitionType_RevenueRecognitionTypeID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwSubscriptionTerms] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for MJ_BizApps_Orders: Subscription Terms */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Subscription Terms
-- Item: Permissions for vwSubscriptionTerms
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwSubscriptionTerms] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for MJ_BizApps_Orders: Subscription Terms */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Subscription Terms
-- Item: spCreateSubscriptionTerm
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR SubscriptionTerm
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateSubscriptionTerm]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateSubscriptionTerm];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateSubscriptionTerm]
    @ID uniqueidentifier = NULL,
    @SubscriptionID uniqueidentifier,
    @TermNumber int,
    @OrderLineID uniqueidentifier,
    @StartDate date,
    @EndDate date,
    @Amount decimal(18, 2),
    @IsProrated bit = NULL,
    @ProrationFactor_Clear bit = 0,
    @ProrationFactor decimal(9, 6) = NULL,
    @RevenueRecognitionTypeID uniqueidentifier,
    @Status nvarchar(20) = NULL,
    @CanceledAt_Clear bit = 0,
    @CanceledAt datetimeoffset = NULL,
    @CancellationEffectiveDate_Clear bit = 0,
    @CancellationEffectiveDate date = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)

    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[SubscriptionTerm]
            (
                [ID],
                [SubscriptionID],
                [TermNumber],
                [OrderLineID],
                [StartDate],
                [EndDate],
                [Amount],
                [IsProrated],
                [ProrationFactor],
                [RevenueRecognitionTypeID],
                [Status],
                [CanceledAt],
                [CancellationEffectiveDate]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @SubscriptionID,
                @TermNumber,
                @OrderLineID,
                @StartDate,
                @EndDate,
                @Amount,
                ISNULL(@IsProrated, 0),
                CASE WHEN @ProrationFactor_Clear = 1 THEN NULL ELSE ISNULL(@ProrationFactor, NULL) END,
                @RevenueRecognitionTypeID,
                ISNULL(@Status, 'Scheduled'),
                CASE WHEN @CanceledAt_Clear = 1 THEN NULL ELSE ISNULL(@CanceledAt, NULL) END,
                CASE WHEN @CancellationEffectiveDate_Clear = 1 THEN NULL ELSE ISNULL(@CancellationEffectiveDate, NULL) END
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[SubscriptionTerm]
            (
                [SubscriptionID],
                [TermNumber],
                [OrderLineID],
                [StartDate],
                [EndDate],
                [Amount],
                [IsProrated],
                [ProrationFactor],
                [RevenueRecognitionTypeID],
                [Status],
                [CanceledAt],
                [CancellationEffectiveDate]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @SubscriptionID,
                @TermNumber,
                @OrderLineID,
                @StartDate,
                @EndDate,
                @Amount,
                ISNULL(@IsProrated, 0),
                CASE WHEN @ProrationFactor_Clear = 1 THEN NULL ELSE ISNULL(@ProrationFactor, NULL) END,
                @RevenueRecognitionTypeID,
                ISNULL(@Status, 'Scheduled'),
                CASE WHEN @CanceledAt_Clear = 1 THEN NULL ELSE ISNULL(@CanceledAt, NULL) END,
                CASE WHEN @CancellationEffectiveDate_Clear = 1 THEN NULL ELSE ISNULL(@CancellationEffectiveDate, NULL) END
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwSubscriptionTerms] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateSubscriptionTerm] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ_BizApps_Orders: Subscription Terms */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateSubscriptionTerm] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for MJ_BizApps_Orders: Subscription Terms */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Subscription Terms
-- Item: spUpdateSubscriptionTerm
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR SubscriptionTerm
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateSubscriptionTerm]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateSubscriptionTerm];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateSubscriptionTerm]
    @ID uniqueidentifier,
    @SubscriptionID uniqueidentifier = NULL,
    @TermNumber int = NULL,
    @OrderLineID uniqueidentifier = NULL,
    @StartDate date = NULL,
    @EndDate date = NULL,
    @Amount decimal(18, 2) = NULL,
    @IsProrated bit = NULL,
    @ProrationFactor_Clear bit = 0,
    @ProrationFactor decimal(9, 6) = NULL,
    @RevenueRecognitionTypeID uniqueidentifier = NULL,
    @Status nvarchar(20) = NULL,
    @CanceledAt_Clear bit = 0,
    @CanceledAt datetimeoffset = NULL,
    @CancellationEffectiveDate_Clear bit = 0,
    @CancellationEffectiveDate date = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[SubscriptionTerm]
    SET
        [SubscriptionID] = ISNULL(@SubscriptionID, [SubscriptionID]),
        [TermNumber] = ISNULL(@TermNumber, [TermNumber]),
        [OrderLineID] = ISNULL(@OrderLineID, [OrderLineID]),
        [StartDate] = ISNULL(@StartDate, [StartDate]),
        [EndDate] = ISNULL(@EndDate, [EndDate]),
        [Amount] = ISNULL(@Amount, [Amount]),
        [IsProrated] = ISNULL(@IsProrated, [IsProrated]),
        [ProrationFactor] = CASE WHEN @ProrationFactor_Clear = 1 THEN NULL ELSE ISNULL(@ProrationFactor, [ProrationFactor]) END,
        [RevenueRecognitionTypeID] = ISNULL(@RevenueRecognitionTypeID, [RevenueRecognitionTypeID]),
        [Status] = ISNULL(@Status, [Status]),
        [CanceledAt] = CASE WHEN @CanceledAt_Clear = 1 THEN NULL ELSE ISNULL(@CanceledAt, [CanceledAt]) END,
        [CancellationEffectiveDate] = CASE WHEN @CancellationEffectiveDate_Clear = 1 THEN NULL ELSE ISNULL(@CancellationEffectiveDate, [CancellationEffectiveDate]) END
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwSubscriptionTerms] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwSubscriptionTerms]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateSubscriptionTerm] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the SubscriptionTerm table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateSubscriptionTerm]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateSubscriptionTerm];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateSubscriptionTerm
ON [${flyway:defaultSchema}].[SubscriptionTerm]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[SubscriptionTerm]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[SubscriptionTerm] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for MJ_BizApps_Orders: Subscription Terms */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateSubscriptionTerm] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for MJ_BizApps_Orders: Stored Value Transactions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Stored Value Transactions
-- Item: spDeleteStoredValueTransaction
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR StoredValueTransaction
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteStoredValueTransaction]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteStoredValueTransaction];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteStoredValueTransaction]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[StoredValueTransaction]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteStoredValueTransaction] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for MJ_BizApps_Orders: Stored Value Transactions */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteStoredValueTransaction] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for MJ_BizApps_Orders: Subscription Events */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Subscription Events
-- Item: spDeleteSubscriptionEvent
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR SubscriptionEvent
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteSubscriptionEvent]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteSubscriptionEvent];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteSubscriptionEvent]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[SubscriptionEvent]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteSubscriptionEvent] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for MJ_BizApps_Orders: Subscription Events */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteSubscriptionEvent] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for MJ_BizApps_Orders: Subscription Terms */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Subscription Terms
-- Item: spDeleteSubscriptionTerm
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR SubscriptionTerm
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteSubscriptionTerm]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteSubscriptionTerm];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteSubscriptionTerm]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[SubscriptionTerm]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteSubscriptionTerm] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for MJ_BizApps_Orders: Subscription Terms */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteSubscriptionTerm] TO [cdp_Developer], [cdp_Integration];

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
    mjBizAppsOrdersSubscription_MigratesToSubscriptionID.[SubscriptionNumber] AS [MigratesToSubscription]
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
    @MigratesToSubscriptionID uniqueidentifier = NULL
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
                [MigratesToSubscriptionID]
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
                CASE WHEN @MigratesToSubscriptionID_Clear = 1 THEN NULL ELSE ISNULL(@MigratesToSubscriptionID, NULL) END
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
                [MigratesToSubscriptionID]
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
                CASE WHEN @MigratesToSubscriptionID_Clear = 1 THEN NULL ELSE ISNULL(@MigratesToSubscriptionID, NULL) END
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
    @MigratesToSubscriptionID uniqueidentifier = NULL
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
        [MigratesToSubscriptionID] = CASE WHEN @MigratesToSubscriptionID_Clear = 1 THEN NULL ELSE ISNULL(@MigratesToSubscriptionID, [MigratesToSubscriptionID]) END
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

/* SQL text to delete unneeded entity fields (16 scoped entities) */
EXEC [${mjSchema}].[spDeleteUnneededEntityFields] @ExcludedSchemaNames='${mjSchema}_BizAppsAccounting,${mjSchema}_BizAppsCommon,${mjSchema}_BizAppsIssues,${mjSchema}_BizAppsTasks,${mjSchema},sys', @EntityIDs='8B748643-85FF-4B07-B3B6-B12EC7A399E6,C2F418C4-8239-4486-B036-0BC4EAE4D24E,83A06268-2C96-400F-9CC8-21EEEF6654D1,8936D4D1-EB07-4EE8-A7AC-24131A1C48A8,FC529BC8-FF09-44A9-B454-26EAFDAC791B,4B5B0D73-496E-4CFA-92B9-3299A1E29E17,C96F379A-3E15-4DE5-BA94-4ECC90960C6D,EC59C50D-92BD-4247-80B1-51139BE93D35,66D82C24-9C9F-4CD6-B019-53C20274AB00,EB009F74-F4C5-4596-86C3-5893B9453200,7D7C4D5F-E410-4803-9762-A060C536C098,572AC8CE-8446-418B-979A-A7EE4E1F5AFD,CE97BF15-F7C6-4C50-A744-A89C714A4DDD,9E638C8F-6447-45D9-9137-B24E1047BCE5,22E31028-E862-424B-8C10-C167B2C9E304,E9B55146-3351-440C-AD47-FD4DE05BDA05';

/* SQL text to update existing entity fields from schema (16 scoped entities) */
EXEC [${mjSchema}].[spUpdateExistingEntityFieldsFromSchema] @ExcludedSchemaNames='${mjSchema}_BizAppsAccounting,${mjSchema}_BizAppsCommon,${mjSchema}_BizAppsIssues,${mjSchema}_BizAppsTasks,${mjSchema},sys', @EntityIDs='8B748643-85FF-4B07-B3B6-B12EC7A399E6,C2F418C4-8239-4486-B036-0BC4EAE4D24E,83A06268-2C96-400F-9CC8-21EEEF6654D1,8936D4D1-EB07-4EE8-A7AC-24131A1C48A8,FC529BC8-FF09-44A9-B454-26EAFDAC791B,4B5B0D73-496E-4CFA-92B9-3299A1E29E17,C96F379A-3E15-4DE5-BA94-4ECC90960C6D,EC59C50D-92BD-4247-80B1-51139BE93D35,66D82C24-9C9F-4CD6-B019-53C20274AB00,EB009F74-F4C5-4596-86C3-5893B9453200,7D7C4D5F-E410-4803-9762-A060C536C098,572AC8CE-8446-418B-979A-A7EE4E1F5AFD,CE97BF15-F7C6-4C50-A744-A89C714A4DDD,9E638C8F-6447-45D9-9137-B24E1047BCE5,22E31028-E862-424B-8C10-C167B2C9E304,E9B55146-3351-440C-AD47-FD4DE05BDA05';

/* SQL text to set default column width where needed */
EXEC [${mjSchema}].[spSetDefaultColumnWidthWhereNeeded] @ExcludedSchemaNames='${mjSchema}_BizAppsAccounting,${mjSchema}_BizAppsCommon,${mjSchema}_BizAppsIssues,${mjSchema}_BizAppsTasks,${mjSchema},sys';

/* Set field properties for entity */

               UPDATE [${mjSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '4F0FBFD2-6B9B-4114-AF20-6090977CC4EB'
               AND AutoUpdateDefaultInView = 1;

/* Set field properties for entity */

               UPDATE [${mjSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'F11E7965-BAA1-4875-A84C-2175583891EA'
               AND AutoUpdateDefaultInView = 1;

/* Set field properties for entity */

               UPDATE [${mjSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'E54F728D-2271-4E6A-AFD8-79E3BD46803D'
               AND AutoUpdateDefaultInView = 1;

/* Set categories for 12 fields */

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Customer Payment Methods.ID 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'C19B59B7-8D64-4BEA-A77F-79ED9ED83097' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Customer Payment Methods.__mj_CreatedAt 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '2700CA08-FEBB-4665-BEF6-3D2DC70522AF' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Customer Payment Methods.__mj_UpdatedAt 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'C0410D54-BC06-4F0D-8A4A-E95ACF4131BC' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Customer Payment Methods.OwnerPersonID 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'B01C1B04-8D8B-4F0F-BA13-67B0ADAFF94B' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Customer Payment Methods.OwnerOrganizationID 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '30A4CDE6-D0D8-4DB6-90FE-44881C20B50D' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Customer Payment Methods.OwnerPerson 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '26723C83-6056-4FED-8850-36ABCCC8A8BF' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Customer Payment Methods.OwnerOrganization 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'E19B00D0-1F63-4B86-8CD7-04D41462FB0F' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Customer Payment Methods.PaymentDetailID 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Payment Detail ID',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '09060CA3-3A4A-468E-BC67-056983ADE0E0' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Customer Payment Methods.Nickname 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'ACA4DBD8-D075-430D-A29F-4ED6E40CCAA8' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Customer Payment Methods.IsDefault 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '032E9994-7A7D-40F6-A66F-D4BAC2D6283C' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Customer Payment Methods.IsActive 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '465573D1-6138-4461-9E5E-237810C71588' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Customer Payment Methods.PaymentDetail 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'Payment Details',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'E54F728D-2271-4E6A-AFD8-79E3BD46803D' AND AutoUpdateCategory = 1;

/* Set categories for 18 fields */

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Checkout Sessions.ID 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '93826808-278B-4B1C-8AED-4FB1AAD8CAD0' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Checkout Sessions.MetadataJSON 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Metadata',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '44532023-ECE5-43BF-B661-339759952587' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Checkout Sessions.__mj_CreatedAt 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'C0FDFD2C-F698-47B2-8542-778193AAE8BE' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Checkout Sessions.__mj_UpdatedAt 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '158BF59F-1AE9-4834-BE4E-D74CF625B86D' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Checkout Sessions.CheckoutWidgetID 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '1517CCB9-DF12-4CDE-97ED-CAFA81AE6740' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Checkout Sessions.DistributionID 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'AAFC239E-B376-4BDB-B986-1F03242F89B3' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Checkout Sessions.CheckoutWidget 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'AC58FBC0-C6E8-497C-9C8E-68DFD441A3A9' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Checkout Sessions.Distribution 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'Checkout Configuration',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'A9144F92-7003-4122-876B-315CEAD597BA' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Checkout Sessions.ClientSessionKey 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '3697E76F-D0E3-4C29-9B30-BC6B6A716415' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Checkout Sessions.Status 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '823EBB60-20F6-49ED-AFCE-805F0EA9E715' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Checkout Sessions.ExpiresAt 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '587061BD-2CEC-4632-A0F5-56EFE59C7E22' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Checkout Sessions.Email 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = 'Email',
   CodeType = NULL
WHERE 
   ID = 'AF065DA5-E102-47BC-AB9D-F385907162A3' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Checkout Sessions.PersonID 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '7356A873-5E65-4DFB-8C3F-7F33CEB09AD9' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Checkout Sessions.Person 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '3A4B8AE8-13F2-4179-AF2E-D71E76EBA7AC' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Checkout Sessions.DraftOrderID 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '71F2B4A3-DA78-416D-80DE-10CCE8AECC99' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Checkout Sessions.PaymentIntentID 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '288C4AE5-236B-4255-8F5A-6AC066BBAD86' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Checkout Sessions.DraftOrder 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '12C32E4F-4B50-41F1-9ECF-C2ADC89205A7' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Checkout Sessions.PaymentIntent 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'F501FCA4-EA01-4CC1-9A33-5AB33264A86C' AND AutoUpdateCategory = 1;

/* Set categories for 19 fields */

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Order Charges.ID 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '5F2579EF-8993-4D42-980F-BE7735DC792E' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Order Charges.__mj_CreatedAt 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'C653ECBB-8EA6-444F-876F-E8B7445159C3' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Order Charges.__mj_UpdatedAt 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '44718C6F-F0B1-4DA0-BFC3-4F3DD026D7FB' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Order Charges.OrderHeaderID 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '2B50C39F-4DDA-4DAB-8FB1-7AD8B7FC4793' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Order Charges.OrderHeader 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'Order Association',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '38E60B4A-345D-4989-8112-5266523EA7F1' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Order Charges.ChargeTypeID 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Charge Type',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '6C7B4F1B-5298-47B6-9E6D-19D3E68324DD' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Order Charges.ChargeType 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Charge Type Name',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'F4703314-EB19-4E36-BA60-3AA0972C2AFF' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Order Charges.Sequence 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '27DAAEA2-390E-4BFB-B900-BD1BBCD68E67' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Order Charges.Amount 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '5728BBAB-79F0-4ED8-B595-71BCFCD387FC' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Order Charges.BasisAmount 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'F9DAC248-0C2B-4622-84BF-B703786CFE15' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Order Charges.Rate 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '03604E2A-6578-4C5F-A8C2-E63416C53B4F' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Order Charges.CalculationSource 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '23946BDC-CCFB-449A-B610-A1B2D0B77150' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Order Charges.TaxJurisdictionID 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'B96894ED-BE1E-44C1-8E4F-BF92A2509F16' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Order Charges.TaxRateID 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'D5F2D439-1E9F-40F8-AAFD-25DB80614756' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Order Charges.IsOverridden 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '4F0FBFD2-6B9B-4114-AF20-6090977CC4EB' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Order Charges.ComputedAmount 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'B25FBE5E-52CB-4223-96E1-B1387B00A4F8' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Order Charges.OverrideReason 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '6B27B86A-53D3-4DEC-A10A-F9B59D2E0395' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Order Charges.OverriddenByUserID 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '1F559CF6-3E67-433D-B957-8108EE12F085' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Order Charges.OverriddenAt 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '404502A2-9C1F-4B6A-A139-E7A5B95F8F64' AND AutoUpdateCategory = 1;

/* Set categories for 21 fields */

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Entitlement Grants.ID 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '36872134-9759-4C40-B50D-230FA2E5F23D' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Entitlement Grants.__mj_CreatedAt 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'B21F9818-F22E-4349-9834-C75CF72496F6' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Entitlement Grants.__mj_UpdatedAt 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'E09AEB6A-95B5-430B-B79C-B3F57C32517A' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Entitlement Grants.ProductEntitlementID 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '3B28605C-C045-4E1B-B8F4-FE7527917361' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Entitlement Grants.OrderLineID 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'F36C5991-254E-4528-A246-76DD52D65D04' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Entitlement Grants.SubscriptionID 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '19B8DC10-7B32-4588-BA5D-B2C514C800D1' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Entitlement Grants.SubscriptionTermID 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '25E68FA5-5F8D-418B-BF9C-AC9A4A5ED1D5' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Entitlement Grants.ProductEntitlement 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '3F0D3E0B-EBA1-43DF-A955-00C15E65884F' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Entitlement Grants.Subscription 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'Entitlement Details',
   GeneratedFormSection = 'Category',
   DisplayName = 'Subscription Name',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '565688BA-6923-4A92-A48B-400D13323569' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Entitlement Grants.BeneficiaryPersonID 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '01746520-FB20-4D51-B8BF-69B042EA3B55' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Entitlement Grants.BeneficiaryOrganizationID 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '11ECEF1A-1C8C-4E33-9F03-147BF723D503' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Entitlement Grants.BeneficiaryPerson 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '8A2DFA18-43AA-4340-B66A-BE34F9CA87AA' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Entitlement Grants.BeneficiaryOrganization 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'D87DEE5B-1139-4F54-A744-D922F4CF79AC' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Entitlement Grants.Quantity 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '5DCED13A-248F-4425-A906-76732F6FB3ED' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Entitlement Grants.ValidFrom 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'A491B0CC-FF01-457B-940C-C454185622FC' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Entitlement Grants.ValidTo 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'A785C286-D757-45B6-8708-2EF0126A8FD1' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Entitlement Grants.ValidityModeApplied 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '1BAA4D04-4210-4698-B294-0DC36066068A' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Entitlement Grants.Status 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '4C59CC82-FA2A-4837-8E54-4D280B4B023F' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Entitlement Grants.ProvisionedAt 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '75B376CA-80B4-405B-9EAC-D6A0670A2984' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Entitlement Grants.RevokedAt 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'B1F140CE-FA0A-48EB-99CD-8B1C807E966A' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Entitlement Grants.RevocationReason 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'A583F634-F054-4407-ADAB-D1270F4C1D13' AND AutoUpdateCategory = 1;

/* Set categories for 18 fields */

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Order Adjustments.ID 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '0FC72C88-1DE9-4941-BC71-A41601ECC0BF' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Order Adjustments.__mj_CreatedAt 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '7CF20BB7-3BC2-4D1D-B6DA-90FB31743F89' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Order Adjustments.__mj_UpdatedAt 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '515B780F-1B7D-4C29-87BC-81A79C65B1AE' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Order Adjustments.OrderHeaderID 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Order Header',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '1C690B82-2FC8-4F5D-9B33-2B7A858E497C' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Order Adjustments.OrderLineID 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'C2FC682A-6C44-4C74-A9DE-F1482BBA84C1' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Order Adjustments.OrderHeader 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'Order Association',
   GeneratedFormSection = 'Category',
   DisplayName = 'Order Header Reference',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'F11E7965-BAA1-4875-A84C-2175583891EA' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Order Adjustments.PromotionID 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'B8380B81-5559-47E2-89FD-F8716593CE94' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Order Adjustments.PromotionCodeID 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '002708CD-C68A-4D72-BB46-910E11936996' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Order Adjustments.Promotion 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '463B0750-3CD2-42A2-81FA-663AD7AF318E' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Order Adjustments.PromotionCode 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'Promotion Details',
   GeneratedFormSection = 'Category',
   DisplayName = 'Promotion Code Reference',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'F7A332BA-BB14-4037-B207-B5C235C53C93' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Order Adjustments.Amount 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Adjustment Amount',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '62E09D9D-90E8-4F9C-8BC2-BDDC73B684C9' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Order Adjustments.Sequence 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '65ED5663-8966-4068-A0A9-0A19914BD5BE' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Order Adjustments.Reason 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '4F657602-4915-4A7F-8C8A-409A3576ABA6' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Order Adjustments.AppliedByUserID 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'EEDAC3E2-2630-4349-8D30-48EAFA56D87F' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Order Adjustments.AppliedAt 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '4087F2A7-13F3-4D96-BAAD-9399AE59408C' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Order Adjustments.AuthorizedBySalesAuthorityID 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Authorized By Sales Authority',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'ADABB7AA-33E6-448D-B4EC-28E819158C6F' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Order Adjustments.ApprovedByUserID 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '904B97F0-33CD-4EC0-928E-731178D7DFB0' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Order Adjustments.ApprovedAt 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '494CDD59-AC9C-4CBF-92B7-DFC9E26B3915' AND AutoUpdateCategory = 1;

/* Set field properties for entity */

               UPDATE [${mjSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '04C3EBD2-2822-4DEC-8915-6DBEBFE8CC52'
               AND AutoUpdateDefaultInView = 1;

/* Set categories for 16 fields */

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Payment Intents.ID 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '61515727-80C1-40D2-9417-C36EDC381CC5' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Payment Intents.__mj_CreatedAt 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'EEEF74B0-422F-4275-8DC6-0E3A1883554B' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Payment Intents.__mj_UpdatedAt 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '2B3CF517-779D-4DFA-BBFA-5D94067CE6EA' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Payment Intents.PaymentProviderID 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'FEC9DEDE-C551-46DE-A4A2-6730971F6FBA' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Payment Intents.ProviderIntentID 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'BEFE4A2A-7502-4A59-82A3-079AF9A235D9' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Payment Intents.ProviderEventID 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '9B57B48A-D11B-41D7-9B8A-5CF1F29F2320' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Payment Intents.PaymentProvider 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '0BD8412D-B992-4037-A3A4-B53AB5668411' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Payment Intents.Status 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'DDC44F43-A668-4AA8-B3C7-D55B4846AA03' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Payment Intents.Amount 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '079530C2-3F04-4445-904D-23E5B613FA00' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Payment Intents.LastEventAt 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'A4190184-F0E0-4270-93EF-DF8092B3E175' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Payment Intents.OrderHeaderID 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '5CBD6DE8-63E2-4209-AECF-7717A2BA9CC1' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Payment Intents.BillToPersonID 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '18117216-DE03-4E17-85F7-5822F7928381' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Payment Intents.BillToOrganizationID 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'B0C95012-D756-46EE-AC42-DD25B133C236' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Payment Intents.BillToPerson 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'DE2ACA8A-259E-4CB1-9420-9651D16FAC7B' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Payment Intents.BillToOrganization 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '1C26ABA7-BA86-466F-90DA-12227937049D' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Payment Intents.OrderHeader 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'Associated Entities',
   GeneratedFormSection = 'Category',
   DisplayName = 'Order Header Reference',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '46CCE3C8-3D8B-412A-AAFC-54172633F8B6' AND AutoUpdateCategory = 1;

/* Set categories for 29 fields */

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Payment Details.ID 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '54C9C33B-CFBA-4F43-BCAC-1569240DDD28' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Payment Details.__mj_CreatedAt 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '4B5A4D80-1EDD-4E54-A727-71B4669CDD59' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Payment Details.__mj_UpdatedAt 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '872F27DA-31AC-4165-BFD9-36F35C16B6A4' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Payment Details.CompanyID 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '4225F56F-5321-42BA-A036-B868D67B4751' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Payment Details.PaymentTypeID 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '13DECE65-877D-40B6-9E46-68E11EF6478B' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Payment Details.Company 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'A1F3FF34-709B-4918-9335-6C72326EB09D' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Payment Details.PaymentType 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '7DDD947F-FA9F-48E9-BE5F-36CCAA57B5D5' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Payment Details.PaymentProviderID 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '1A00F12E-B64B-46B1-BCF0-F0BF165D864B' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Payment Details.SourceCustomerPaymentMethodID 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'E23EC727-6BF8-43B4-A3A7-ED449EA3A0F5' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Payment Details.ProviderCustomerRef 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '1DEE829C-4815-4545-887B-5DD4B7CC6929' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Payment Details.ProviderInstrumentRef 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '16244C59-1DCD-4946-AF33-F25914CC802F' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Payment Details.PaymentProvider 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '340D29E9-1561-4D6A-968A-983FFC3397F2' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Payment Details.SourceCustomerPaymentMethod 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'Payment Provider Details',
   GeneratedFormSection = 'Category',
   DisplayName = 'Customer Payment Method Name',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'A74C7BD2-7007-4ED5-A22B-1F19ACC9ABEB' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Payment Details.Brand 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '22891456-E679-4AA1-BAF2-93B0EBAE0DB8' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Payment Details.Last4 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'C5A6F3B3-BCB4-4955-B15B-2CBD61E6BE90' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Payment Details.ExpiryMonth 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '7BF1E9A2-0623-43AD-B0F3-D8F2943A5DA2' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Payment Details.ExpiryYear 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'A598C70F-2454-4E53-80C1-A1C51A9788A7' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Payment Details.HolderName 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'AB393276-03B2-41AF-8686-72E3FB673CC7' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Payment Details.BankName 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '77729230-F287-4D29-B00F-77D8244716F8' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Payment Details.RoutingLast4 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '64948606-5D40-4A68-93C0-0C90FBD28D86' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Payment Details.AccountLast4 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'C60A81B1-9773-46C6-A61E-6FC0391C6B6C' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Payment Details.BankAccountType 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '1C0B326C-7EAC-40D2-BAB7-5BD2DD00418D' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Payment Details.ReferenceNumber 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '18643359-AD15-4CD5-A8C5-618354F59EF6' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Payment Details.InstrumentDate 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '150A4A75-2361-427A-8C27-A6DC4C56BCDA' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Payment Details.StoredValueAccountID 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'AA9205B5-6E95-4707-B57C-F460CFD00451' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Payment Details.SourceOrderHeaderID 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '9311A82E-9615-468A-89AE-A62200AB3FB8' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Payment Details.Notes 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '5971BE50-0A07-47EC-9D56-0F82F4E61AE9' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Payment Details.StoredValueAccount 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'Transaction Details',
   GeneratedFormSection = 'Category',
   DisplayName = 'Stored Value Account Name',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'B71C2699-C28C-4FDF-83A8-600ACA681051' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Payment Details.SourceOrderHeader 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'Transaction Details',
   GeneratedFormSection = 'Category',
   DisplayName = 'Source Order Name',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '2561C3AE-6D27-433D-AC13-4A7BBA53ED6E' AND AutoUpdateCategory = 1;

/* Set categories for 33 fields */

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Payment Headers.ID 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'DA1C0AE7-6CF2-4413-BE5C-E4ED31B336BD' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Payment Headers.PaymentNumber 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '63942E45-D526-41B9-A7D9-7A4686276E81' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Payment Headers.ReceivingCompanyID 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'F6417FF8-2CE4-40CE-A432-EFB2795DF5B4' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Payment Headers.BillToPersonID 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '5BEC7787-F7BD-4869-BB12-D147D915AB5B' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Payment Headers.BillToOrganizationID 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'BC108AB8-2D07-4D60-B1F4-01094FA4704B' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Payment Headers.PaymentDate 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '2C13A764-3F61-4CC5-817B-FC4C4D729A66' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Payment Headers.PaymentTypeID 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'CEB6EC73-0B12-4CE8-A373-1CEE74BA1082' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Payment Headers.Amount 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'A6F9FC3E-C58E-4DFA-926A-207D8D52695D' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Payment Headers.ProcessingFeeAmount 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'D0232B11-3A54-4252-BA6E-6996F91546FE' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Payment Headers.NetAmount 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '78D10536-97F2-4D92-A897-6293F08B84BF' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Payment Headers.PaymentProviderID 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '610EACE4-431E-4209-A823-56B4C5768850' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Payment Headers.PaymentIntentID 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'C470199C-0DFC-49F8-BFF0-B9632862B955' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Payment Headers.PaymentDetailID 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '9CA7B50A-52B5-4DA9-A75F-92A812A4A974' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Payment Headers.ProviderChargeID 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '0785D862-E13A-4315-9511-7261C61DCC35' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Payment Headers.ProviderRefundID 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '4F9D941E-6736-4853-8B52-1545F60323E9' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Payment Headers.ReversesPaymentHeaderID 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '6442AF78-5005-4ED5-AB52-9D0F8A2DC782' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Payment Headers.ReversalReason 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '9A858070-3424-43C5-9E08-2A00E0054D04' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Payment Headers.Status 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '67CD1EC4-60B7-446D-8745-6B26C64C1B46' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Payment Headers.JournalEntryID 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '3ECC3F19-47F0-4723-8B5B-E91FDE8902E7' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Payment Headers.Description 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '59DC67C1-4693-4D04-BB20-123351A88337' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Payment Headers.Notes 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '6BC1AFB5-BD87-4E8E-9787-D3BA0CFD7BF8' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Payment Headers.IdempotencyKey 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '64513FED-39D8-4A98-B040-F9C01D193DA8' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Payment Headers.__mj_CreatedAt 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'FC29DBC2-CAA6-4C38-8CBB-EA517131329A' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Payment Headers.__mj_UpdatedAt 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '504B4695-4898-4ACD-8311-9438F55637BA' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Payment Headers.ReceivingCompany 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'BB737174-40B3-4189-85D8-C1C59F5FF56A' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Payment Headers.BillToPerson 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'AFB26DCE-C0BD-4CC5-8165-7E913D68E762' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Payment Headers.BillToOrganization 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'EBD1F752-23C7-49FA-818E-F5D290836654' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Payment Headers.PaymentType 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '4245AC58-1710-4CB3-AFC3-20794B979D0F' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Payment Headers.PaymentProvider 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'E43FF5A5-7784-4FF8-9371-A5C3D12859AC' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Payment Headers.PaymentIntent 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'Processing Details',
   GeneratedFormSection = 'Category',
   DisplayName = 'Payment Intent Name',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '497E56A7-2847-4606-AB11-6B306FF5EFE2' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Payment Headers.PaymentDetail 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'Processing Details',
   GeneratedFormSection = 'Category',
   DisplayName = 'Payment Detail Name',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '33F0D3D2-6226-4A88-A8B4-04846A060DC5' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Payment Headers.ReversesPaymentHeader 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'Reversal Information',
   GeneratedFormSection = 'Category',
   DisplayName = 'Reverses Payment Header Name',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'DEA46F2F-6438-483C-9E06-61B7A8E0B3BD' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Payment Headers.JournalEntry 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '16AD3936-53C2-435D-ADFE-877E49460791' AND AutoUpdateCategory = 1;

/* Set categories for 44 fields */

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Order Lines.ID 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '0E4EF71F-D46F-4063-BD5C-2A5602175AA5' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Order Lines.__mj_CreatedAt 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '3A5E8BFD-AA7A-4BB1-A5B8-22D1D30F328D' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Order Lines.__mj_UpdatedAt 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '70E44516-6802-4043-9B62-B657B791073A' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Order Lines.OrderHeaderID 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'BADC192E-D729-42F3-B23B-8A96E449B7BE' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Order Lines.ProductID 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '80BE7A7C-DB2D-4D01-900C-A480245EBF86' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Order Lines.CompanyID 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'F0299634-C370-4FE4-97C5-A76C29060E1F' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Order Lines.ReversesOrderLineID 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'B0257954-BE16-442F-9B26-EA16F3748ABA' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Order Lines.SourceBundleProductID 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '6B9CE446-EC96-44CB-A020-47B350117C90' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Order Lines.ParentOrderLineID 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '92739616-633F-4C87-A75C-026F875B643D' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Order Lines.Product 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '8829808E-E81D-4412-A326-32C536595144' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Order Lines.Company 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '38CF7E0A-4FC7-4A89-8110-32D460D1F0F3' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Order Lines.SourceBundleProduct 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '1FA8A890-3B28-4289-8511-396FD555B664' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Order Lines.RootParentOrderLineID 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'A94A4116-577D-4238-91EF-06DF53EAC269' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Order Lines.LineNumber 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '36D301B3-F997-48BE-BDB4-D84B5D008BB6' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Order Lines.Quantity 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'CDEDBADA-7820-496A-8A54-3C02C04529FB' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Order Lines.FulfillmentStatus 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '6BFBDB3D-F153-40AA-8BAE-1D28E860FE77' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Order Lines.IsRollupParent 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '3A040BBE-D427-485B-A7CD-48273750F506' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Order Lines.IsQuantityOverridden 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '2FA8F11F-84F7-4621-A4BF-79FD4EA0BB95' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Order Lines.Description 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'CE3669E2-5D11-4EF7-9ABB-92E318081FFB' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Order Lines.ParentOrderLineIDDepth 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'Line Details',
   GeneratedFormSection = 'Category',
   DisplayName = 'Depth',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '0D5E5AF6-EAF5-4D7D-9A31-DB2DDD4CFE75' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Order Lines.ParentOrderLineIDPath 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'Line Details',
   GeneratedFormSection = 'Category',
   DisplayName = 'Path',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '7DBC1AEF-A41B-4D2C-A292-F54311BB17DD' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Order Lines.ParentOrderLineIDIsLeaf 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'Line Details',
   GeneratedFormSection = 'Category',
   DisplayName = 'Is Leaf',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '18435027-0EC5-4ADF-86E7-720B598933E7' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Order Lines.ParentOrderLineIDChildCount 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'Line Details',
   GeneratedFormSection = 'Category',
   DisplayName = 'Child Count',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '99AA9708-C5CD-43F3-8571-C7FC8C2CF2F0' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Order Lines.UnitPrice 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'AA67C87B-9813-4C6D-9ED4-95C07896A48C' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Order Lines.ProductPriceID 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'F4A049BE-99E2-4A21-82CE-F5807ECABEB6' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Order Lines.DiscountPct 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '800457F7-757E-471A-BD73-6F45BBFBFEAC' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Order Lines.DiscountAmount 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '3F5506C2-C477-4F74-A152-F581E0E5C89E' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Order Lines.LineTotalNet 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '00A59AF1-BE78-411B-8E9F-C537B6334B2C' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Order Lines.ChargeAmount 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '5A7B7F3B-FD64-4119-A099-D699D4703478' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Order Lines.LineTax 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'BE3185B0-7C19-41FF-A0F3-C95AE65B723B' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Order Lines.LineTotalGross 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '04C3EBD2-2822-4DEC-8915-6DBEBFE8CC52' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Order Lines.JournalEntryID 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '7AF43EA4-AE45-41F3-A5D5-23E166E72D4F' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Order Lines.JournalEntry 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Journal Entry Reference',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'DD660390-0217-45DF-80E3-5CF3D21A6ACB' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Order Lines.ShipToAddressID 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'B81F4205-3E9D-49C5-B76D-6EB25B0EFA26' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Order Lines.ShipToOrganizationID 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '45F22700-06CB-4A21-8283-FA7A384EE686' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Order Lines.ShipToPersonID 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '471F2EE9-FD82-4AF5-AB7C-E621D1D19393' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Order Lines.ShipToOrganization 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '2CC7E118-E356-4AE6-932E-E9F439835A2C' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Order Lines.ShipToPerson 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '6BA8FAF0-8DF0-4BC6-915D-611C50FEA3EC' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Order Lines.RenewsSubscriptionID 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '21EB56FF-B993-40E2-B595-F1B8EF5842E5' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Order Lines.ServicePeriodStart 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '8BF5F4CE-289D-45D7-898B-CF799F52D1E2' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Order Lines.ServicePeriodEnd 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '0F7810DB-7ECA-42EC-B9D6-FD913860539A' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Order Lines.SubscriptionID 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'A7FD45BF-B5C8-494B-80CD-78657451B1E3' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Order Lines.Subscription 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'Subscription Details',
   GeneratedFormSection = 'Category',
   DisplayName = 'Subscription Name',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'A158F0D3-5272-4CDB-B541-B35DF759A78F' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Order Lines.OrderHeader 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'Relationships',
   GeneratedFormSection = 'Category',
   DisplayName = 'Order Header Reference',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'BD3C2984-57B5-466D-9F8D-4C865364196A' AND AutoUpdateCategory = 1;

/* Set categories for 53 fields */

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Order Headers.ID 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '142D7CE2-5C12-4A68-B7CC-797CBDA164C1' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Order Headers.__mj_CreatedAt 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '84775F2D-188C-456A-BCA2-EEA35D5FA43A' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Order Headers.__mj_UpdatedAt 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '2B996B6F-9D47-4EC7-8052-83E346703058' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Order Headers.OrderNumber 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '37ED0567-5213-4E33-9123-C88CF3E9A851' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Order Headers.OrderType 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'C7C1BD22-6968-499B-9FFA-1931BEB97C0C' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Order Headers.OrderDate 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '41E3A5E2-F717-4220-AC33-8ABC132F8DD0' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Order Headers.Status 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'DFCEE14E-6200-4025-BF35-06E5A2FDDD8A' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Order Headers.CompanyID 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Company',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '197A4A78-E556-465F-9B0E-FE0F68653B48' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Order Headers.ExternalDocumentNumber 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '9BAFC41D-971D-471E-8613-51A4B801C7D5' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Order Headers.Description 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'C69830AE-9EA4-48B1-9945-A05330D2DA28' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Order Headers.Notes 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Notes',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'D0DA714F-FFE7-423E-ABB1-7CE8C45E0678' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Order Headers.Company 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Company Name',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '54079149-DE80-4CEE-B857-AE5ADFFD41A6' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Order Headers.Origin 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'Order Identification',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '54341A08-B0DA-43A0-A67C-959E9F84189E' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Order Headers.BillToPersonID 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Bill To Person',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '4D0979EC-2802-4928-BD90-44FB6D6600D1' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Order Headers.BillToOrganizationID 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Bill To Organization',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'BEF24C48-4C7A-452B-BC9A-3BBCD887FC3E' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Order Headers.SalesRepUserID 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Sales Rep',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '74C76DB8-0C37-4595-A951-6CD5935AAE2A' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Order Headers.BillToPerson 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Bill To Person Name',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '1ACD14D9-6F12-4283-BBC3-B766EA19648B' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Order Headers.BillToOrganization 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Bill To Organization Name',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '08B057B1-867E-4C67-B315-16949250187E' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Order Headers.SalesRepUser 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Sales Rep Name',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'B0F46D44-A139-4CBB-8737-8265D5052238' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Order Headers.BillToAddressID 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Billing Address',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '4BA3B34B-6F09-44B9-A7E8-B6F56623A616' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Order Headers.ShipToAddressID 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Shipping Address',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '7861C923-978D-4255-A7CB-FC5512BEFB32' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Order Headers.ShipToOrganizationID 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Ship To Organization',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '756D6DD7-DE28-4ED6-87E9-368F97EAABA0' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Order Headers.ShipToPersonID 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Ship To Person',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '7C38B1D8-4DBC-4AC8-81D8-28358F36CE69' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Order Headers.RequestedDeliveryDate 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '8712EDC9-85C4-44A4-952C-A1FCDEF9CA53' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Order Headers.BillToAddress 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Billing Address Details',
   ExtendedType = 'GeoAddress',
   CodeType = NULL
WHERE 
   ID = 'A5A7DFCD-E18F-4D44-800D-52CE4339331E' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Order Headers.ShipToAddress 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Shipping Address Details',
   ExtendedType = 'GeoAddress',
   CodeType = NULL
WHERE 
   ID = 'A60F3EE4-CDFB-411D-84AA-821FDFC51138' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Order Headers.ShipToOrganization 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Ship To Organization Name',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '1A791B97-599C-437C-9921-4029F59A4B0D' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Order Headers.ShipToPerson 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Ship To Person Name',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'E69B1F32-0F13-49AF-B708-7BE54EBFEAB8' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Order Headers.PaymentTermsTypeID 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Payment Terms',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'C161939B-87E8-4435-A0B0-E5E38CD87E2B' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Order Headers.TotalGross 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '7AEB02A2-1574-4FC4-ADF1-299328154295' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Order Headers.AmountPaid 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '72D27F1D-B828-435B-87D4-31068B3CF518' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Order Headers.Balance 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'B66538B2-A77C-4B69-9B58-30D0D2016CC4' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Order Headers.DueDate 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '91DC0304-93EE-48A0-B77C-9F3945F8B4F8' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Order Headers.InitialPaymentTypeID 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Initial Payment Type',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '65D58799-EB69-401E-8F7F-9C803CD620A2' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Order Headers.InitialPaymentAmount 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '8B137EE1-FA08-498E-A222-EAABBE9B79D0' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Order Headers.InitialPaymentDetailID 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Initial Payment Detail',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'CC65F413-7292-4064-A090-AF80299179DB' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Order Headers.PaymentTermsType 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '295A4FC0-4CA3-4FB2-A5C5-2F07F6DB58AC' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Order Headers.InitialPaymentType 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Initial Payment Type Name',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'ADA5CE2D-FA56-41C5-B840-A42F65D55A5D' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Order Headers.InitialPaymentDetail 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'Financial Summary',
   GeneratedFormSection = 'Category',
   DisplayName = 'Initial Payment Detail Info',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'CF4CE14A-2F21-40A1-9C1D-47E967102C15' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Order Headers.IsOverdue 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '6652803C-6884-407D-9581-E04047EB978A' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Order Headers.PostedAt 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'C8D32A33-B85D-4B11-BAE6-D4F0B1BAEC99' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Order Headers.PostedByUserID 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'DEE309B1-B116-4BB3-8F07-48F29E6E0C19' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Order Headers.ReversesOrderHeaderID 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Reverses Order',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'BD321C1F-E9B0-461B-B8FE-EBCABDFE2B8B' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Order Headers.ReversalReason 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '23D1E09A-DEF7-4BFF-B7F9-7C2CF9E1C9FE' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Order Headers.ApprovalTaskID 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Approval Task',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '74D1CA28-83A1-44C0-8E7E-CED44F0F60D0' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Order Headers.ConfirmedAt 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '565015DD-BE0A-4024-BF1F-6CB2A147A5C9' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Order Headers.PostedByUser 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '7DBBF93F-3FF6-40BD-8729-2B0C5B69CB43' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Order Headers.ReversesOrderHeader 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'Accounting and Audit',
   GeneratedFormSection = 'Category',
   DisplayName = 'Reverses Order Name',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'C516B593-8828-431D-B100-C39F840D0C15' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Order Headers.FulfillmentStatus 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'Fulfillment and Logistics',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '3E312E9C-4295-461C-AB9F-AE50ED6879D3' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Order Headers.SourceCheckoutWidgetID 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'Fulfillment and Logistics',
   GeneratedFormSection = 'Category',
   DisplayName = 'Checkout Widget',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '76089782-646E-4B9F-BAEF-2369386BEAAB' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Order Headers.SourceCheckoutWidget 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'Fulfillment and Logistics',
   GeneratedFormSection = 'Category',
   DisplayName = 'Checkout Widget Name',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '4282E910-5597-4262-A8DD-883F556DCB59' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Order Headers.${mjSchema}_Latitude 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   DisplayName = 'Latitude',
   ExtendedType = 'GeoLatitude',
   CodeType = NULL
WHERE 
   ID = '538B312C-A6AD-48C6-A14C-80F7E7F50083' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Order Headers.${mjSchema}_Longitude 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   DisplayName = 'Longitude',
   ExtendedType = 'GeoLongitude',
   CodeType = NULL
WHERE 
   ID = '6608ACE8-21F5-4DCF-A2FB-0D8B315FBE9B' AND AutoUpdateCategory = 1;

/* Update FieldCategoryInfo setting for entity */

               UPDATE [${mjSchema}].[EntitySetting]
               SET [Value] = '{"Fulfillment and Logistics":{"icon":"fa fa-truck","description":"Details regarding order fulfillment, delivery tracking, and checkout source"}}', [__mj_UpdatedAt] = GETUTCDATE()
               WHERE [EntityID] = 'FC529BC8-FF09-44A9-B454-26EAFDAC791B' AND [Name] = 'FieldCategoryInfo';

/* Update FieldCategoryIcons setting (legacy) */

               UPDATE [${mjSchema}].[EntitySetting]
               SET [Value] = '{"Fulfillment and Logistics":"fa fa-truck"}', [__mj_UpdatedAt] = GETUTCDATE()
               WHERE [EntityID] = 'FC529BC8-FF09-44A9-B454-26EAFDAC791B' AND [Name] = 'FieldCategoryIcons';

/* Set field properties for entity */

               UPDATE [${mjSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'B2E08111-A8CC-4FBE-ADC9-5F40592E6117'
               AND AutoUpdateDefaultInView = 1;

/* Set field properties for entity */

               UPDATE [${mjSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '342413D1-98E0-4DCA-964E-2EC68FE03E2D'
               AND AutoUpdateDefaultInView = 1;

/* Set field properties for entity */

               UPDATE [${mjSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'DCC3E621-1A9B-4F22-B07B-0349C9938E62'
               AND AutoUpdateDefaultInView = 1;

/* Set field properties for entity */

               UPDATE [${mjSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '264A0AA0-5F82-48C6-ADE5-06686B9CFC13'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${mjSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '4FF116E7-7351-4715-A2D5-A3BE0EE9CBF6'
               AND AutoUpdateDefaultInView = 1;

/* Set field properties for entity */

               UPDATE [${mjSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '3224D67D-7776-46AB-93AD-C6D97ACC0983'
               AND AutoUpdateDefaultInView = 1;

/* Set categories for 13 fields */

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Stored Value Transactions.ID 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '260D9658-BF66-4771-A2B9-623C5F450E45' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Stored Value Transactions.__mj_CreatedAt 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'B02146A4-B654-4990-B80A-AC97733F9A15' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Stored Value Transactions.__mj_UpdatedAt 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '5EE61B17-1E4D-4768-B4FA-AB4CE779F272' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Stored Value Transactions.StoredValueAccountID 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Stored Value Account ID',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'B432A379-5E11-4E60-B8C6-38752BA4C07F' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Stored Value Transactions.StoredValueAccount 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'Transaction Details',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '3224D67D-7776-46AB-93AD-C6D97ACC0983' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Stored Value Transactions.TransactionType 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '697D5408-25C7-49E9-8B61-08750F929541' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Stored Value Transactions.OccurredAt 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'F68E71F7-D1E2-4D07-ABD8-89EF8CC4C2DA' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Stored Value Transactions.Amount 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'D267EFA5-B6D5-4E29-B104-FB8CE0956253' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Stored Value Transactions.BalanceAfter 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '9DF9F705-5C1E-45FC-A1CB-10798DD9A740' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Stored Value Transactions.RelatedPaymentID 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Related Payment ID',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '390AE9FE-3816-4FB1-8822-DCAB4E935D41' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Stored Value Transactions.RelatedPayment 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'Related Entities',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '28AAC0BB-6C18-4082-A270-626A6279521E' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Stored Value Transactions.RelatedOrderHeaderID 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Related Order Header ID',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '6A01030C-ABFA-4150-B3ED-07CF77B65BE6' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Stored Value Transactions.RelatedOrderHeader 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'Related Entities',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'CBA27DEF-371E-45F6-A3EB-158D67D582E8' AND AutoUpdateCategory = 1;

/* Set categories for 13 fields */

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Subscription Events.ID 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '80A33DA3-390D-4ACF-AFDA-06675A0F57BC' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Subscription Events.__mj_CreatedAt 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '8D28A3DB-DCC5-412B-876B-D5E5314A8CEE' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Subscription Events.__mj_UpdatedAt 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '847797B0-C2F6-432C-AF7B-CF466A4AA498' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Subscription Events.SubscriptionID 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '2F975299-65B7-4741-9ACC-E7F543F50FB8' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Subscription Events.Subscription 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'Event Context',
   GeneratedFormSection = 'Category',
   DisplayName = 'Subscription Name',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'B2E08111-A8CC-4FBE-ADC9-5F40592E6117' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Subscription Events.ProviderEventID 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '4329172A-8FBB-42A7-864D-F2AC00FC8422' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Subscription Events.EventType 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'E2EDA043-B7D5-45C9-8606-AF585833EB10' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Subscription Events.OccurredAt 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'C678A84A-4614-41C9-933F-2FE418028E39' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Subscription Events.EventData 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = 'Code',
   CodeType = 'Other'
WHERE 
   ID = '22023231-D931-4AF8-84D9-BA4DA203F6F7' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Subscription Events.RelatedPaymentID 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'D12C5DBB-FF1B-401E-8935-E51338F017E8' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Subscription Events.RelatedPayment 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'Related Records',
   GeneratedFormSection = 'Category',
   DisplayName = 'Related Payment Name',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '3D2B12BB-6731-4E0D-94C0-C10396C3A04B' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Subscription Events.RelatedOrderHeaderID 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Related Order Header',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '03116744-82CC-4AE3-AAB8-506B1709C62D' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Subscription Events.RelatedOrderHeader 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'Related Records',
   GeneratedFormSection = 'Category',
   DisplayName = 'Related Order Header Name',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '2DC9C3C9-66BF-46AE-8FC3-8AE93FDDD145' AND AutoUpdateCategory = 1;

/* Set categories for 13 fields */

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Payment Lines.ID 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '3E65E5F2-E5FB-48D5-B5FD-577A2454E5BA' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Payment Lines.__mj_CreatedAt 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'E1DC08AD-750D-4B9C-995E-E2F8C1494BF1' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Payment Lines.__mj_UpdatedAt 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '91282573-1611-4E92-8666-D7B9CC645301' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Payment Lines.PaymentHeaderID 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '9F29384D-670E-4F7F-91F5-F2466C43E6A1' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Payment Lines.OrderHeaderID 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '136095A0-496B-46B2-95E3-2AC8CA29186E' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Payment Lines.OrderLineID 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '477AEBC7-8F4D-4723-B51D-AA482265EECB' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Payment Lines.PaymentHeader 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'Relationships',
   GeneratedFormSection = 'Category',
   DisplayName = 'Payment Header Name',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '264A0AA0-5F82-48C6-ADE5-06686B9CFC13' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Payment Lines.OrderHeader 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'Relationships',
   GeneratedFormSection = 'Category',
   DisplayName = 'Order Header Name',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '4FF116E7-7351-4715-A2D5-A3BE0EE9CBF6' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Payment Lines.Amount 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '553B51D0-4C5F-4B23-87FF-3EA92CDCE76D' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Payment Lines.AllocatedAt 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '5225D3A1-40DE-42ED-B941-24BF6B4945F6' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Payment Lines.AllocatedByUserID 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '29256C88-0700-4E75-8AAC-2B92C9830005' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Payment Lines.AllocatedByUser 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '047AC98A-3DA4-430D-8F3D-EC408CB09BF0' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Payment Lines.BookedAt 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '9D1F8D7B-7560-4A44-8F75-D51442BE0221' AND AutoUpdateCategory = 1;

/* Set categories for 17 fields */

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Subscription Terms.ID 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '181A833A-EE62-404D-BF8C-DD16C735FD56' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Subscription Terms.SubscriptionID 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '7382FFE7-0BBB-46C8-80AD-E835C992E6B3' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Subscription Terms.TermNumber 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'CADD3073-B726-4DAE-970F-F44CA09D70D4' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Subscription Terms.OrderLineID 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '3E9B4475-F909-4254-BA0D-40C1D2627846' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Subscription Terms.Subscription 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'Subscription Details',
   GeneratedFormSection = 'Category',
   DisplayName = 'Subscription Name',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '342413D1-98E0-4DCA-964E-2EC68FE03E2D' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Subscription Terms.StartDate 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '674F664C-63F7-4DEC-BE24-24683AA14944' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Subscription Terms.EndDate 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '952FC83A-42EB-48F1-9578-2B94997191E4' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Subscription Terms.Amount 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'ABE70A4D-D2C7-4E51-9976-ADD5758A90C9' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Subscription Terms.IsProrated 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'A60A390E-5025-4316-B65C-7BE559DD5346' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Subscription Terms.ProrationFactor 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'EEEB99AE-5515-4E59-9956-18379753FE3E' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Subscription Terms.RevenueRecognitionTypeID 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '12D0630E-C951-499D-AFCC-589BDBF4E1EC' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Subscription Terms.RevenueRecognitionType 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'C8553FE5-7B3C-47B7-98C4-02E466B12653' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Subscription Terms.Status 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '7B26BC95-AF8B-4043-87BE-B0FED0424B5D' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Subscription Terms.CanceledAt 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'CD576E0A-CD07-4F6C-921A-14D275FD7642' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Subscription Terms.CancellationEffectiveDate 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '48F51B77-39A7-4449-93BC-F642D9223486' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Subscription Terms.__mj_CreatedAt 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '2107988F-5DCA-47CB-9AB4-D4FC368114C9' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Subscription Terms.__mj_UpdatedAt 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '3717F7FB-B4E6-4872-AD7A-9D63FE3AC3DF' AND AutoUpdateCategory = 1;

/* Set categories for 29 fields */

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Subscriptions.ID 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '441FBB83-47BF-4E59-8114-BB7238A33C3C' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Subscriptions.__mj_CreatedAt 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '580EF9A9-2E6E-43E8-8A8C-E154919E76DB' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Subscriptions.__mj_UpdatedAt 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '10F6E87B-C158-48E5-A49A-EF4EF7C5F320' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Subscriptions.SubscriptionNumber 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '5CD4AEAB-5A3E-4D99-A377-FF1C8D0ED4E5' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Subscriptions.CompanyID 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '9DEA2186-6042-4981-8C2C-E3A774CEF53E' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Subscriptions.OrderLineID 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'BDAD6C2A-0AD0-4C46-90D7-E9175B08B152' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Subscriptions.SubscriptionTypeID 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '8D33AE79-FEB0-4FF5-A073-BBE439B69953' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Subscriptions.ProductID 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'A06BA2F3-4713-424B-9853-0BBBB5593C3E' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Subscriptions.Status 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '0719EF52-1AAF-43AD-8125-401BF64AEAC7' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Subscriptions.HolderOrganizationID 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'FB6C71D1-ABC4-415B-9720-7B174945F859' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Subscriptions.BeneficiaryPersonID 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '2FEB9369-968F-4E58-9226-7F7B7E712BC0' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Subscriptions.StartDate 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'E9714EEA-7654-43A3-9780-1501CCDE07DE' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Subscriptions.TrialEndDate 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '7C1FFF0A-E9A1-4404-95B4-B97021F1DD2E' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Subscriptions.CanceledAt 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '8A29C638-053B-4904-A174-92BD2F3A6295' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Subscriptions.EndDate 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'DCC3E621-1A9B-4F22-B07B-0349C9938E62' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Subscriptions.AutoRenew 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'F93D7930-8D23-467A-9FD8-38754A3BC1F2' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Subscriptions.RenewalLeadDays 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '11A0FCE1-DDF0-4EA2-BB0B-4C1E4DEECF60' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Subscriptions.PaymentProviderID 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '39502B26-83FA-48A3-B217-C58C45EAD788' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Subscriptions.ProviderSubscriptionID 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '0712060C-AB8C-49CC-BC76-C04788C0C582' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Subscriptions.MigratesFromSubscriptionID 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Migrates From Subscription',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '0AE56005-B58D-4814-9018-21CAD598FB6C' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Subscriptions.MigratesToSubscriptionID 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Migrates To Subscription',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '4CABB253-DA4B-4236-8F7E-A9B72F6230D9' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Subscriptions.Company 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'C4321A92-0112-4991-BF3A-BF9D8A04C8DD' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Subscriptions.SubscriptionType 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'F578AB86-31F5-4FDF-8A28-992B439A70E9' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Subscriptions.Product 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '00AD8AC7-3646-430F-8168-71C0A0809674' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Subscriptions.HolderOrganization 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '6AD210FF-6471-4A66-BE30-AAB7BD9EB650' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Subscriptions.BeneficiaryPerson 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '5EA68CB4-8784-4D60-985A-C9644F303E8E' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Subscriptions.PaymentProvider 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '4C4C3B5D-3E32-43D1-B8BA-997C5FAB4976' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Subscriptions.MigratesFromSubscription 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'Display Labels',
   GeneratedFormSection = 'Category',
   DisplayName = 'Migrates From Subscription Label',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'FB64D6D1-1BB5-421C-8D21-9E828C6B7A48' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Subscriptions.MigratesToSubscription 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'Display Labels',
   GeneratedFormSection = 'Category',
   DisplayName = 'Migrates To Subscription Label',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '483C26DC-F70B-41F2-82F1-C76466E0978D' AND AutoUpdateCategory = 1;

/* Refresh custom base views for modified entities so schema changes are picked up */
EXEC sp_refreshview '${flyway:defaultSchema}.vwOrderHeadersGenerated';
IF OBJECT_ID('[${flyway:defaultSchema}].[vwOrderHeaders]', 'V') IS NOT NULL
BEGIN
    EXEC sp_executesql N'EXEC sp_refreshview ''${flyway:defaultSchema}.vwOrderHeaders'';';
END;

