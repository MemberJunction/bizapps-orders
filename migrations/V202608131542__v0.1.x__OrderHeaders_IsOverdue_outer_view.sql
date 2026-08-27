-- =============================================================================
-- V202608131542 — the application-owned OUTER base view: vwOrderHeaders wraps the
--                 generated inner view and adds IsOverdue.
-- =============================================================================
-- The second half of Order Headers' layered base view (see the PREVIOUS migration
-- for the flags + the generated inner view, and docs/overdue-and-layered-base-views.md
-- for the design). This file is deliberately SEPARATE and later-timestamped: it
-- selects from vwOrderHeadersGenerated, which the previous migration creates, and it
-- is hand-written — codegen-captured SQL is replaced wholesale on regeneration, so
-- hand-authored DDL never shares a file section with it (same split as MJ core's
-- layered-base-views pilot, MJ#3419).
--
-- THE PREDICATE IS GENERATED FROM packages/Entities/src/overdue.ts — OverdueSQL('g')
-- — never retyped. That module is the single statement of the overdue rule (code,
-- SQL, and RunView filters all render from it, and overdue.test.ts asserts every
-- clause survives in each rendering). The Status clause is the one every hand-rolled
-- copy of this rule forgot: without it a voided order with a stale balance reads as
-- overdue and a customer lands on a collections list for money they do not owe.
-- =============================================================================

CREATE OR ALTER VIEW [${flyway:defaultSchema}].[vwOrderHeaders]
AS
SELECT
    g.*,
    CASE WHEN g.Balance > 0 AND g.DueDate IS NOT NULL AND g.DueDate < CAST(GETUTCDATE() AS date) AND g.Status NOT IN ('Draft','Quoted','Voided')
         THEN 1 ELSE 0 END AS IsOverdue
FROM
    [${flyway:defaultSchema}].[vwOrderHeadersGenerated] g;
GO

GRANT SELECT ON [${flyway:defaultSchema}].[vwOrderHeaders] TO [cdp_UI], [cdp_Developer], [cdp_Integration];
GO


















































-- =============================================================================
-- CODEGEN OUTPUT — GENERATED CODE BELOW THIS LINE. DO NOT EDIT BY HAND.
-- Captured from the post-wrapper CodeGen convergence pass (IsOverdue EntityField
-- discovery + full Order Headers regeneration). This capture MUST live behind the
-- wrapper in the migration train: it was generated against a database where the
-- wrapper existed, and it includes a delete-unneeded-entity-fields sweep that
-- would remove the just-inserted IsOverdue row if replayed before the wrapper
-- exists (proven by stage-test, 2026-08-13).
-- =============================================================================


/* SQL text to update existing entities from schema */
EXEC [${mjSchema}].[spUpdateExistingEntitiesFromSchema] @ExcludedSchemaNames='sys,staging,dbo,${mjSchema},${mjSchema}_BizAppsCommon,${mjSchema}_BizAppsAccounting,${mjSchema}_BizAppsTasks,${mjSchema}_BizAppsCommon,${mjSchema}_BizAppsTasks,${mjSchema}_BizAppsAccounting,${mjSchema}';

/* SQL text to insert 1 new entity field(s) */

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '6652803c-6884-407d-9581-e04047eb978a' OR (EntityID = 'FC529BC8-FF09-44A9-B454-26EAFDAC791B' AND Name = 'IsOverdue')) BEGIN
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
            '6652803c-6884-407d-9581-e04047eb978a',
            'FC529BC8-FF09-44A9-B454-26EAFDAC791B', -- Entity: MJ_BizApps_Orders: Order Headers
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${mjSchema}].[EntityField] WHERE [EntityID] = 'FC529BC8-FF09-44A9-B454-26EAFDAC791B') + 51,
            'IsOverdue',
            'Is Overdue',
            NULL,
            'int',
            4,
            10,
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

/* SQL text to update existing entity fields from schema */
EXEC [${mjSchema}].[spUpdateExistingEntityFieldsFromSchema] @ExcludedSchemaNames='sys,staging,dbo,${mjSchema},${mjSchema}_BizAppsCommon,${mjSchema}_BizAppsAccounting,${mjSchema}_BizAppsTasks,${mjSchema}_BizAppsCommon,${mjSchema}_BizAppsTasks,${mjSchema}_BizAppsAccounting,${mjSchema}';

/* SQL text to set default column width where needed */
EXEC [${mjSchema}].[spSetDefaultColumnWidthWhereNeeded] @ExcludedSchemaNames='sys,staging,dbo,${mjSchema},${mjSchema}_BizAppsCommon,${mjSchema}_BizAppsAccounting,${mjSchema}_BizAppsTasks,${mjSchema}_BizAppsCommon,${mjSchema}_BizAppsTasks,${mjSchema}_BizAppsAccounting,${mjSchema}';

/* SQL text to sync schema info from database schemas */
EXEC [${mjSchema}].[spUpdateSchemaInfoFromDatabase] @ExcludedSchemaNames='sys,staging,dbo,${mjSchema},${mjSchema}_BizAppsCommon,${mjSchema}_BizAppsAccounting,${mjSchema}_BizAppsTasks,${mjSchema}_BizAppsCommon,${mjSchema}_BizAppsTasks,${mjSchema}_BizAppsAccounting,${mjSchema}';

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

/* Root ID Function SQL for MJ_BizApps_Orders: Order Headers.ReversesOrderHeaderID */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Order Headers
-- Item: fnOrderHeaderReversesOrderHeaderID_GetRootID
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
------------------------------------------------------------
----- ROOT ID FUNCTION FOR: [OrderHeader].[ReversesOrderHeaderID]
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[fnOrderHeaderReversesOrderHeaderID_GetRootID]', 'IF') IS NOT NULL
    DROP FUNCTION [${flyway:defaultSchema}].[fnOrderHeaderReversesOrderHeaderID_GetRootID];
GO

CREATE FUNCTION [${flyway:defaultSchema}].[fnOrderHeaderReversesOrderHeaderID_GetRootID]
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
            [ReversesOrderHeaderID],
            [ID] AS [RootParentID],
            0 AS [Depth]
        FROM
            [${flyway:defaultSchema}].[OrderHeader]
        WHERE
            [ID] = COALESCE(@ParentID, @RecordID)

        UNION ALL

        SELECT
            c.[ID],
            c.[ReversesOrderHeaderID],
            c.[ID] AS [RootParentID],
            p.[Depth] + 1 AS [Depth]
        FROM
            [${flyway:defaultSchema}].[OrderHeader] c
        INNER JOIN
            CTE_RootParent p ON c.[ID] = p.[ReversesOrderHeaderID]
        WHERE
            p.[Depth] < 100
    )
    SELECT TOP 1
        [RootParentID] AS RootID
    FROM
        CTE_RootParent
    WHERE
        [ReversesOrderHeaderID] IS NULL
    ORDER BY
        [RootParentID]
);
GO

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
    ${mjSchema}_rgc.[Latitude] AS [${mjSchema}_Latitude],
    ${mjSchema}_rgc.[Longitude] AS [${mjSchema}_Longitude],
    root_ReversesOrderHeaderID.RootID AS [RootReversesOrderHeaderID]
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
    [${mjSchema}].[vwRecordGeoCodes] AS ${mjSchema}_rgc
  ON
    ${mjSchema}_rgc.[EntityID] = 'FC529BC8-FF09-44A9-B454-26EAFDAC791B'
    AND ${mjSchema}_rgc.[RecordID] = CAST([o].[ID] AS NVARCHAR(450))
    AND ${mjSchema}_rgc.[LocationType] = 'Primary'
OUTER APPLY
    [${flyway:defaultSchema}].[fnOrderHeaderReversesOrderHeaderID_GetRootID]([o].[ID], [o].[ReversesOrderHeaderID]) AS root_ReversesOrderHeaderID
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
    @PaymentStatus nvarchar(20) = NULL,
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
    @ConfirmedAt datetimeoffset = NULL
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
                [PaymentStatus],
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
                [ConfirmedAt]
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
                ISNULL(@PaymentStatus, 'Unpaid'),
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
                CASE WHEN @ConfirmedAt_Clear = 1 THEN NULL ELSE ISNULL(@ConfirmedAt, NULL) END
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
                [PaymentStatus],
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
                [ConfirmedAt]
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
                ISNULL(@PaymentStatus, 'Unpaid'),
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
                CASE WHEN @ConfirmedAt_Clear = 1 THEN NULL ELSE ISNULL(@ConfirmedAt, NULL) END
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
    @PaymentStatus nvarchar(20) = NULL,
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
    @ConfirmedAt datetimeoffset = NULL
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
        [PaymentStatus] = ISNULL(@PaymentStatus, [PaymentStatus]),
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
        [ConfirmedAt] = CASE WHEN @ConfirmedAt_Clear = 1 THEN NULL ELSE ISNULL(@ConfirmedAt, [ConfirmedAt]) END
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

/* SQL text to delete unneeded entity fields */
EXEC [${mjSchema}].[spDeleteUnneededEntityFields] @ExcludedSchemaNames='sys,staging,dbo,${mjSchema},${mjSchema}_BizAppsCommon,${mjSchema}_BizAppsAccounting,${mjSchema}_BizAppsTasks,${mjSchema}_BizAppsCommon,${mjSchema}_BizAppsTasks,${mjSchema}_BizAppsAccounting,${mjSchema}';

/* SQL text to update existing entity fields from schema */
EXEC [${mjSchema}].[spUpdateExistingEntityFieldsFromSchema] @ExcludedSchemaNames='sys,staging,dbo,${mjSchema},${mjSchema}_BizAppsCommon,${mjSchema}_BizAppsAccounting,${mjSchema}_BizAppsTasks,${mjSchema}_BizAppsCommon,${mjSchema}_BizAppsTasks,${mjSchema}_BizAppsAccounting,${mjSchema}';

/* SQL text to set default column width where needed */
EXEC [${mjSchema}].[spSetDefaultColumnWidthWhereNeeded] @ExcludedSchemaNames='sys,staging,dbo,${mjSchema},${mjSchema}_BizAppsCommon,${mjSchema}_BizAppsAccounting,${mjSchema}_BizAppsTasks,${mjSchema}_BizAppsCommon,${mjSchema}_BizAppsTasks,${mjSchema}_BizAppsAccounting,${mjSchema}';

/* Set categories for 51 fields */

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

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Order Headers.${mjSchema}_Latitude 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = 'GeoLatitude',
   CodeType = NULL
WHERE 
   ID = '538B312C-A6AD-48C6-A14C-80F7E7F50083' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Order Headers.${mjSchema}_Longitude 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = 'GeoLongitude',
   CodeType = NULL
WHERE 
   ID = '6608ACE8-21F5-4DCF-A2FB-0D8B315FBE9B' AND AutoUpdateCategory = 1;

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
   DisplayName = 'Company ID',
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
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'D0DA714F-FFE7-423E-ABB1-7CE8C45E0678' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Order Headers.Company 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Company',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '54079149-DE80-4CEE-B857-AE5ADFFD41A6' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Order Headers.BillToPersonID 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Bill To Person ID',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '4D0979EC-2802-4928-BD90-44FB6D6600D1' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Order Headers.BillToOrganizationID 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Bill To Organization ID',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'BEF24C48-4C7A-452B-BC9A-3BBCD887FC3E' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Order Headers.SalesRepUserID 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Sales Rep User ID',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '74C76DB8-0C37-4595-A951-6CD5935AAE2A' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Order Headers.BillToPerson 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Bill To Person',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '1ACD14D9-6F12-4283-BBC3-B766EA19648B' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Order Headers.BillToOrganization 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Bill To Organization',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '08B057B1-867E-4C67-B315-16949250187E' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Order Headers.SalesRepUser 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Sales Rep User',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'B0F46D44-A139-4CBB-8737-8265D5052238' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Order Headers.BillToAddressID 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Bill To Address ID',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '4BA3B34B-6F09-44B9-A7E8-B6F56623A616' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Order Headers.ShipToAddressID 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Ship To Address ID',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '7861C923-978D-4255-A7CB-FC5512BEFB32' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Order Headers.ShipToOrganizationID 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Ship To Organization ID',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '756D6DD7-DE28-4ED6-87E9-368F97EAABA0' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Order Headers.ShipToPersonID 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Ship To Person ID',
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
   DisplayName = 'Bill To Address',
   ExtendedType = 'GeoAddress',
   CodeType = NULL
WHERE 
   ID = 'A5A7DFCD-E18F-4D44-800D-52CE4339331E' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Order Headers.ShipToAddress 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Ship To Address',
   ExtendedType = 'GeoAddress',
   CodeType = NULL
WHERE 
   ID = 'A60F3EE4-CDFB-411D-84AA-821FDFC51138' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Order Headers.ShipToOrganization 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Ship To Organization',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '1A791B97-599C-437C-9921-4029F59A4B0D' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Order Headers.ShipToPerson 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Ship To Person',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'E69B1F32-0F13-49AF-B708-7BE54EBFEAB8' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Order Headers.PaymentTermsTypeID 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Payment Terms Type ID',
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

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Order Headers.PaymentStatus 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'B3B0238E-9B79-4AA6-98E1-B1EBD5E697ED' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Order Headers.InitialPaymentTypeID 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Initial Payment Type ID',
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
   DisplayName = 'Initial Payment Detail ID',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'CC65F413-7292-4064-A090-AF80299179DB' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Order Headers.PaymentTermsType 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Payment Terms Type',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '295A4FC0-4CA3-4FB2-A5C5-2F07F6DB58AC' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Order Headers.InitialPaymentType 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Initial Payment Type',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'ADA5CE2D-FA56-41C5-B840-A42F65D55A5D' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Order Headers.InitialPaymentDetail 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Initial Payment Detail',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'CF4CE14A-2F21-40A1-9C1D-47E967102C15' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Order Headers.IsOverdue 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'Financial Summary',
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
   DisplayName = 'Posted By User ID',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'DEE309B1-B116-4BB3-8F07-48F29E6E0C19' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Order Headers.ReversesOrderHeaderID 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Reverses Order Header ID',
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
   DisplayName = 'Approval Task ID',
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
   DisplayName = 'Posted By User',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '7DBBF93F-3FF6-40BD-8729-2B0C5B69CB43' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Order Headers.ReversesOrderHeader 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Reverses Order Header',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'C516B593-8828-431D-B100-C39F840D0C15' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Order Headers.RootReversesOrderHeaderID 
UPDATE [${mjSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Root Reverses Order Header ID',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '240C21A2-69FB-4656-B8AD-7770D67B07C2' AND AutoUpdateCategory = 1;

/* Refresh custom base views for modified entities so schema changes are picked up */
EXEC sp_refreshview '${flyway:defaultSchema}.vwOrderHeadersGenerated';
IF OBJECT_ID('[${flyway:defaultSchema}].[vwOrderHeaders]', 'V') IS NOT NULL
BEGIN
    EXEC sp_executesql N'EXEC sp_refreshview ''${flyway:defaultSchema}.vwOrderHeaders'';';
END;

/* Generated Validation Functions for MJ_BizApps_Orders: Customer Tax Exemptions */
-- CHECK constraint for MJ_BizApps_Orders: Customer Tax Exemptions @ Table Level was newly set or modified since the last generation of the validation function, the code was regenerated and updating the GeneratedCode table with the new generated validation function
INSERT INTO [${mjSchema}].[GeneratedCode] ([CategoryID], [GeneratedByModelID], [GeneratedAt], [Language], [Status], [Source], [Code], [Description], [Name], [LinkedEntityID], [LinkedRecordPrimaryKey])
                      VALUES ((SELECT [ID] FROM [${mjSchema}].[vwGeneratedCodeCategories] WHERE [Name]='CodeGen: Validators'), 'C43229F6-4CC8-4838-9D04-03419A2DA191', GETUTCDATE(), 'TypeScript', 'Approved', '([StartedAt] IS NULL OR [EndedAt] IS NULL OR [EndedAt]>[StartedAt])', 'public ValidateEndedAtAfterStartedAt(result: ValidationResult) {
	if (this.StartedAt != null && this.EndedAt != null) {
		if (this.EndedAt.getTime() <= this.StartedAt.getTime()) {
			result.Errors.push(new ValidationErrorInfo(
				"EndedAt",
				"The end date must be after the start date.",
				this.EndedAt,
				ValidationErrorType.Failure
			));
		}
	}
}', 'If both a start date and an end date are specified, the end date must be after the start date to ensure logical chronological order.', 'ValidateEndedAtAfterStartedAt', 'E0238F34-2837-EF11-86D4-6045BDEE16E6', 'DB79D055-C4E1-4966-90D0-8948CF2EA103');

/* Generated Validation Functions for MJ_BizApps_Orders: Order Lines */
-- CHECK constraint for MJ_BizApps_Orders: Order Lines @ Table Level was newly set or modified since the last generation of the validation function, the code was regenerated and updating the GeneratedCode table with the new generated validation function
INSERT INTO [${mjSchema}].[GeneratedCode] ([CategoryID], [GeneratedByModelID], [GeneratedAt], [Language], [Status], [Source], [Code], [Description], [Name], [LinkedEntityID], [LinkedRecordPrimaryKey])
                      VALUES ((SELECT [ID] FROM [${mjSchema}].[vwGeneratedCodeCategories] WHERE [Name]='CodeGen: Validators'), 'C43229F6-4CC8-4838-9D04-03419A2DA191', GETUTCDATE(), 'TypeScript', 'Approved', '([IsQuantityOverridden]=(0) OR [ParentOrderLineID] IS NOT NULL)', 'public ValidateParentOrderLineRequiredWhenQuantityOverridden(result: ValidationResult) {
	if (this.IsQuantityOverridden && this.ParentOrderLineID == null) {
		result.Errors.push(new ValidationErrorInfo(
			"ParentOrderLineID",
			"A Parent Order Line must be specified when the quantity is overridden.",
			this.ParentOrderLineID,
			ValidationErrorType.Failure
		));
	}
}', 'If an order line''s quantity is marked as overridden, it must be associated with a parent order line.', 'ValidateParentOrderLineRequiredWhenQuantityOverridden', 'E0238F34-2837-EF11-86D4-6045BDEE16E6', '66D82C24-9C9F-4CD6-B019-53C20274AB00');

/* Generated Validation Functions for MJ_BizApps_Orders: Order Sequences */
-- CHECK constraint for MJ_BizApps_Orders: Order Sequences: Field: ID was newly set or modified since the last generation of the validation function, the code was regenerated and updating the GeneratedCode table with the new generated validation function
INSERT INTO [${mjSchema}].[GeneratedCode] ([CategoryID], [GeneratedByModelID], [GeneratedAt], [Language], [Status], [Source], [Code], [Description], [Name], [LinkedEntityID], [LinkedRecordPrimaryKey])
                      VALUES ((SELECT [ID] FROM [${mjSchema}].[vwGeneratedCodeCategories] WHERE [Name]='CodeGen: Validators'), 'C43229F6-4CC8-4838-9D04-03419A2DA191', GETUTCDATE(), 'TypeScript', 'Approved', '([ID]=(1))', '	public ValidateIdEqualsOne(result: ValidationResult) {
		if (this.ID !== 1) {
			result.Errors.push(new ValidationErrorInfo(
				"ID",
				"The ID for this record must be exactly 1.",
				this.ID,
				ValidationErrorType.Failure
			));
		}
	}', 'The ID of the record must be exactly 1, ensuring that only a single system configuration record exists in this table.', 'ValidateIdEqualsOne', 'DF238F34-2837-EF11-86D4-6045BDEE16E6', '5AB86BDE-84BE-44A6-A7F8-9B557AB73E47');

/* Generated Validation Functions for MJ_BizApps_Orders: Payment Sequences */
-- CHECK constraint for MJ_BizApps_Orders: Payment Sequences: Field: NextSequenceNumber was newly set or modified since the last generation of the validation function, the code was regenerated and updating the GeneratedCode table with the new generated validation function
INSERT INTO [${mjSchema}].[GeneratedCode] ([CategoryID], [GeneratedByModelID], [GeneratedAt], [Language], [Status], [Source], [Code], [Description], [Name], [LinkedEntityID], [LinkedRecordPrimaryKey])
                      VALUES ((SELECT [ID] FROM [${mjSchema}].[vwGeneratedCodeCategories] WHERE [Name]='CodeGen: Validators'), 'C43229F6-4CC8-4838-9D04-03419A2DA191', GETUTCDATE(), 'TypeScript', 'Approved', '([NextSequenceNumber]>(0))', 'public ValidateNextSequenceNumberGreaterThanZero(result: ValidationResult) {
	if (this.NextSequenceNumber != null && this.NextSequenceNumber <= 0) {
		result.Errors.push(new ValidationErrorInfo(
			"NextSequenceNumber",
			"The next sequence number must be greater than zero.",
			this.NextSequenceNumber,
			ValidationErrorType.Failure
		));
	}
}', 'The next sequence number must be a positive integer greater than zero to ensure valid sequencing.', 'ValidateNextSequenceNumberGreaterThanZero', 'DF238F34-2837-EF11-86D4-6045BDEE16E6', 'D52D2276-3BEB-4E12-8571-F03C3702125D');

/* Generated Validation Functions for MJ_BizApps_Orders: Subscriptions */
-- CHECK constraint for MJ_BizApps_Orders: Subscriptions: Field: RenewalLeadDays was newly set or modified since the last generation of the validation function, the code was regenerated and updating the GeneratedCode table with the new generated validation function
INSERT INTO [${mjSchema}].[GeneratedCode] ([CategoryID], [GeneratedByModelID], [GeneratedAt], [Language], [Status], [Source], [Code], [Description], [Name], [LinkedEntityID], [LinkedRecordPrimaryKey])
                      VALUES ((SELECT [ID] FROM [${mjSchema}].[vwGeneratedCodeCategories] WHERE [Name]='CodeGen: Validators'), 'C43229F6-4CC8-4838-9D04-03419A2DA191', GETUTCDATE(), 'TypeScript', 'Approved', '([RenewalLeadDays] IS NULL OR [RenewalLeadDays]>=(0))', 'public ValidateRenewalLeadDaysGreaterThanOrEqualToZero(result: ValidationResult) {
	if (this.RenewalLeadDays != null && this.RenewalLeadDays < 0) {
		result.Errors.push(new ValidationErrorInfo(
			"RenewalLeadDays",
			"Renewal lead days must be 0 or greater.",
			this.RenewalLeadDays,
			ValidationErrorType.Failure
		));
	}
}', 'Renewal lead days must be a non-negative number (0 or greater) if specified.', 'ValidateRenewalLeadDaysGreaterThanOrEqualToZero', 'DF238F34-2837-EF11-86D4-6045BDEE16E6', '11A0FCE1-DDF0-4EA2-BB0B-4C1E4DEECF60');


