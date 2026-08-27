-- =====================================================================================
-- OrderHeader Status & Fulfillment Architecture Refactor
-- =====================================================================================
-- 1. Updates CK_OrderHeader_Status to ('Draft', 'Quoted', 'Confirmed', 'Voided').
--    Eliminates 'Posted' (redundant with Confirmed booking gate) and decouples fulfillment.
-- 2. Adds FulfillmentStatus NVARCHAR(20) NOT NULL DEFAULT 'Pending' to OrderHeader with
--    CK_OrderHeader_FulfillmentStatus ('Pending', 'PartiallyFulfilled', 'Fulfilled', 'NotApplicable', 'Returned').
-- 3. Drops redundant PaymentStatus stored column — payment progress is derived directly
--    from real-time trigger-maintained TotalGross, AmountPaid, Balance, and IsOverdue.
-- 4. Updates spRecalcOrderHeaderTotals and trg_OrderLine_ImmutableAfterConfirm to align
--    with the clean 3-way orthogonal lifecycle model.
-- =====================================================================================

-- -------------------------------------------------------------------------------------
-- 1. Drop PaymentStatus check constraint, default constraint, and column from OrderHeader
-- -------------------------------------------------------------------------------------
IF EXISTS (
    SELECT 1 FROM sys.check_constraints
    WHERE object_id = OBJECT_ID(N'[__mj_BizAppsOrders].[CK_OrderHeader_PaymentStatus]')
)
BEGIN
    ALTER TABLE [__mj_BizAppsOrders].[OrderHeader]
    DROP CONSTRAINT [CK_OrderHeader_PaymentStatus];
END;
GO

DECLARE @dfPaymentStatus NVARCHAR(128);
SELECT @dfPaymentStatus = d.name
FROM sys.default_constraints d
JOIN sys.columns c ON c.default_object_id = d.object_id
WHERE d.parent_object_id = OBJECT_ID(N'[__mj_BizAppsOrders].[OrderHeader]')
  AND c.name = N'PaymentStatus';

IF @dfPaymentStatus IS NOT NULL
BEGIN
    EXEC(N'ALTER TABLE [__mj_BizAppsOrders].[OrderHeader] DROP CONSTRAINT [' + @dfPaymentStatus + N']');
END;
GO

IF EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID(N'[__mj_BizAppsOrders].[OrderHeader]')
      AND name = N'PaymentStatus'
)
BEGIN
    ALTER TABLE [__mj_BizAppsOrders].[OrderHeader]
    DROP COLUMN [PaymentStatus];
END;
GO

-- -------------------------------------------------------------------------------------
-- 2. Update OrderHeader.Status CHECK constraint to ('Draft', 'Quoted', 'Confirmed', 'Voided')
-- -------------------------------------------------------------------------------------
-- Migrate any existing legacy 'Posted' or 'Fulfilled' rows to 'Confirmed'
UPDATE [__mj_BizAppsOrders].[OrderHeader]
SET [Status] = 'Confirmed'
WHERE [Status] IN ('Posted', 'Fulfilled');
GO

IF EXISTS (
    SELECT 1 FROM sys.check_constraints
    WHERE object_id = OBJECT_ID(N'[__mj_BizAppsOrders].[CK_OrderHeader_Status]')
)
BEGIN
    ALTER TABLE [__mj_BizAppsOrders].[OrderHeader]
    DROP CONSTRAINT [CK_OrderHeader_Status];
END;
GO

ALTER TABLE [__mj_BizAppsOrders].[OrderHeader]
ADD CONSTRAINT [CK_OrderHeader_Status]
CHECK ([Status] IN ('Draft', 'Quoted', 'Confirmed', 'Voided'));
GO

-- -------------------------------------------------------------------------------------
-- 3. Add FulfillmentStatus column and CHECK constraint to OrderHeader
-- -------------------------------------------------------------------------------------
IF NOT EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID(N'[__mj_BizAppsOrders].[OrderHeader]')
      AND name = N'FulfillmentStatus'
)
BEGIN
    ALTER TABLE [__mj_BizAppsOrders].[OrderHeader]
    ADD [FulfillmentStatus] NVARCHAR(20) NOT NULL
        CONSTRAINT [DF_OrderHeader_FulfillmentStatus] DEFAULT 'Pending';
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.check_constraints
    WHERE object_id = OBJECT_ID(N'[__mj_BizAppsOrders].[CK_OrderHeader_FulfillmentStatus]')
)
BEGIN
    ALTER TABLE [__mj_BizAppsOrders].[OrderHeader]
    ADD CONSTRAINT [CK_OrderHeader_FulfillmentStatus]
    CHECK ([FulfillmentStatus] IN ('Pending', 'PartiallyFulfilled', 'Fulfilled', 'NotApplicable', 'Returned'));
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM fn_listextendedproperty(N'MS_Description', N'SCHEMA', N'__mj_BizAppsOrders', N'TABLE', N'OrderHeader', N'COLUMN', N'FulfillmentStatus')
)
BEGIN
    EXEC sp_addextendedproperty
        @name=N'MS_Description',
        @value=N'Operational fulfillment progress rolled up across order lines: Pending, PartiallyFulfilled, Fulfilled, NotApplicable (no physical goods), or Returned.',
        @level0type=N'SCHEMA', @level0name=N'__mj_BizAppsOrders',
        @level1type=N'TABLE', @level1name=N'OrderHeader',
        @level2type=N'COLUMN', @level2name=N'FulfillmentStatus';
END;
GO

-- -------------------------------------------------------------------------------------
-- 4. Update spRecalcOrderHeaderTotals with Fulfillment rollup and no PaymentStatus
-- -------------------------------------------------------------------------------------
CREATE OR ALTER PROCEDURE __mj_BizAppsOrders.spRecalcOrderHeaderTotals
    @OrderHeaderIDs __mj_BizAppsOrders.OrderHeaderIDList READONLY
AS
BEGIN
    SET NOCOUNT ON;

    UPDATE o
    SET TotalGross = ISNULL(l.LineTotal, 0),
        AmountPaid = ISNULL(p.Paid, 0),
        Balance    = ISNULL(l.LineTotal, 0) - ISNULL(p.Paid, 0),
        FulfillmentStatus =
            CASE
                WHEN o.Status IN ('Draft', 'Quoted', 'Voided') THEN 'Pending'
                WHEN ISNULL(f.RequiresFulfillmentCount, 0) = 0 THEN 'NotApplicable'
                WHEN f.FulfilledCount = f.RequiresFulfillmentCount THEN 'Fulfilled'
                WHEN f.FulfilledCount > 0 THEN 'PartiallyFulfilled'
                ELSE 'Pending'
            END
    FROM __mj_BizAppsOrders.OrderHeader o
    JOIN @OrderHeaderIDs ids ON ids.ID = o.ID
    OUTER APPLY (
        SELECT SUM(ol.LineTotalGross) AS LineTotal
        FROM __mj_BizAppsOrders.OrderLine ol WHERE ol.OrderHeaderID = o.ID
    ) l
    OUTER APPLY (
        SELECT SUM(pl.Amount) AS Paid
        FROM __mj_BizAppsOrders.PaymentLine pl
        JOIN __mj_BizAppsOrders.PaymentHeader ph ON ph.ID = pl.PaymentHeaderID
        WHERE pl.OrderHeaderID = o.ID AND ph.Status IN ('Captured','Refunded','Disputed')
    ) p
    OUTER APPLY (
        SELECT
            COUNT(CASE WHEN pt.RequiresFulfillment = 1 AND ol.ReversesOrderLineID IS NULL THEN 1 END) AS RequiresFulfillmentCount,
            COUNT(CASE WHEN pt.RequiresFulfillment = 1 AND ol.ReversesOrderLineID IS NULL AND ol.FulfillmentStatus = 'Fulfilled' THEN 1 END) AS FulfilledCount
        FROM __mj_BizAppsOrders.OrderLine ol
        JOIN __mj_BizAppsOrders.Product pr ON pr.ID = ol.ProductID
        JOIN __mj_BizAppsOrders.ProductType pt ON pt.ID = pr.ProductTypeID
        WHERE ol.OrderHeaderID = o.ID
    ) f;
END;
GO

-- -------------------------------------------------------------------------------------
-- 5. Update trg_OrderLine_ImmutableAfterConfirm to reference Status = 'Confirmed'
-- -------------------------------------------------------------------------------------
CREATE OR ALTER TRIGGER __mj_BizAppsOrders.trg_OrderLine_ImmutableAfterConfirm
ON __mj_BizAppsOrders.OrderLine
AFTER UPDATE, DELETE
AS
BEGIN
    SET NOCOUNT ON;

    -- DELETE: block if any deleted line belongs to a Confirmed order
    IF NOT EXISTS (SELECT 1 FROM inserted)
       AND EXISTS (
           SELECT 1
           FROM deleted d
           JOIN __mj_BizAppsOrders.OrderHeader o ON o.ID = d.OrderHeaderID
           WHERE o.Status = 'Confirmed'
       )
    BEGIN
        ROLLBACK TRANSACTION;
        THROW 51002, 'OrderLine cannot be deleted once its order is Confirmed (the line is booked under a journal entry). Use a reversal order.', 1;
    END;

    -- UPDATE: block changes to the frozen financial columns on lines of Confirmed orders
    IF EXISTS (
        SELECT 1
        FROM deleted d
        JOIN inserted i ON i.ID = d.ID
        JOIN __mj_BizAppsOrders.OrderHeader o ON o.ID = d.OrderHeaderID
        WHERE o.Status = 'Confirmed'
          AND (
            i.ProductID      <> d.ProductID      OR
            i.Quantity       <> d.Quantity       OR
            i.UnitPrice      <> d.UnitPrice      OR
            i.DiscountPct    <> d.DiscountPct    OR
            i.LineTax        <> d.LineTax        OR
            ISNULL(i.LineTotalNet,   0) <> ISNULL(d.LineTotalNet,   0) OR
            ISNULL(i.LineTotalGross, 0) <> ISNULL(d.LineTotalGross, 0)
          )
    )
    BEGIN
        ROLLBACK TRANSACTION;
        THROW 51003, 'OrderLine financial columns cannot be changed once its order is Confirmed (the line is booked under a journal entry). Use a reversal order.', 1;
    END;
END;
GO


















































-- =============================================================================
-- GENERATED BY MemberJunction CodeGen — DO NOT EDIT BY HAND
-- =============================================================================
/* SQL text to update existing entities from schema */
EXEC [${mjSchema}].[spUpdateExistingEntitiesFromSchema] @ExcludedSchemaNames='sys,staging,dbo,${mjSchema},${mjSchema}_BizAppsCommon,${mjSchema}_BizAppsAccounting,${mjSchema}_BizAppsTasks,${mjSchema}_BizAppsIssues,${mjSchema}_BizAppsCommittees,${mjSchema}_BizAppsSecureMessaging';

/* SQL text to insert 1 new entity field(s) */

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '3e312e9c-4295-461c-ab9f-ae50ed6879d3' OR (EntityID = 'FC529BC8-FF09-44A9-B454-26EAFDAC791B' AND Name = 'FulfillmentStatus')) BEGIN
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
            '3e312e9c-4295-461c-ab9f-ae50ed6879d3',
            'FC529BC8-FF09-44A9-B454-26EAFDAC791B', -- Entity: MJ_BizApps_Orders: Order Headers
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${mjSchema}].[EntityField] WHERE [EntityID] = 'FC529BC8-FF09-44A9-B454-26EAFDAC791B') + 1,
            'FulfillmentStatus',
            'Fulfillment Status',
            'Operational fulfillment progress rolled up across order lines: Pending, PartiallyFulfilled, Fulfilled, NotApplicable (no physical goods), or Returned.',
            'nvarchar',
            40,
            0,
            0,
            0,
            'Pending',
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

/* SQL text to update existing entity fields from schema */
EXEC [${mjSchema}].[spUpdateExistingEntityFieldsFromSchema] @ExcludedSchemaNames='sys,staging,dbo,${mjSchema},${mjSchema}_BizAppsCommon,${mjSchema}_BizAppsAccounting,${mjSchema}_BizAppsTasks,${mjSchema}_BizAppsIssues,${mjSchema}_BizAppsCommittees,${mjSchema}_BizAppsSecureMessaging';

/* SQL text to set default column width where needed */
EXEC [${mjSchema}].[spSetDefaultColumnWidthWhereNeeded] @ExcludedSchemaNames='sys,staging,dbo,${mjSchema},${mjSchema}_BizAppsCommon,${mjSchema}_BizAppsAccounting,${mjSchema}_BizAppsTasks,${mjSchema}_BizAppsIssues,${mjSchema}_BizAppsCommittees,${mjSchema}_BizAppsSecureMessaging';

/* SQL text to insert entity field value with ID 3e057148-1f01-4724-8c10-54f8f1f453b4 */
IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityFieldValue] WHERE ID='3e057148-1f01-4724-8c10-54f8f1f453b4')
INSERT INTO [${mjSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('3e057148-1f01-4724-8c10-54f8f1f453b4', '3E312E9C-4295-461C-AB9F-AE50ED6879D3', 1, 'Fulfilled', 'Fulfilled', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 69093397-2da2-4cd0-9364-7f169258cbfe */
IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityFieldValue] WHERE ID='69093397-2da2-4cd0-9364-7f169258cbfe')
INSERT INTO [${mjSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('69093397-2da2-4cd0-9364-7f169258cbfe', '3E312E9C-4295-461C-AB9F-AE50ED6879D3', 2, 'NotApplicable', 'NotApplicable', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 366d2d1b-68d6-4b67-a37c-a40aa06c06e5 */
IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityFieldValue] WHERE ID='366d2d1b-68d6-4b67-a37c-a40aa06c06e5')
INSERT INTO [${mjSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('366d2d1b-68d6-4b67-a37c-a40aa06c06e5', '3E312E9C-4295-461C-AB9F-AE50ED6879D3', 3, 'PartiallyFulfilled', 'PartiallyFulfilled', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID d19fea28-e17f-4cb7-8f34-f6c44cb3a55b */
IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityFieldValue] WHERE ID='d19fea28-e17f-4cb7-8f34-f6c44cb3a55b')
INSERT INTO [${mjSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('d19fea28-e17f-4cb7-8f34-f6c44cb3a55b', '3E312E9C-4295-461C-AB9F-AE50ED6879D3', 4, 'Pending', 'Pending', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID c0ea4f3d-8542-469f-a70a-53c2dd87afa0 */
IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityFieldValue] WHERE ID='c0ea4f3d-8542-469f-a70a-53c2dd87afa0')
INSERT INTO [${mjSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('c0ea4f3d-8542-469f-a70a-53c2dd87afa0', '3E312E9C-4295-461C-AB9F-AE50ED6879D3', 5, 'Returned', 'Returned', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID 3E312E9C-4295-461C-AB9F-AE50ED6879D3 */
UPDATE [${mjSchema}].[EntityField] SET ValueListType='List' WHERE ID='3E312E9C-4295-461C-AB9F-AE50ED6879D3';

/* SQL text to sync schema info from database schemas */
EXEC [${mjSchema}].[spUpdateSchemaInfoFromDatabase] @ExcludedSchemaNames='sys,staging,dbo,${mjSchema},${mjSchema}_BizAppsCommon,${mjSchema}_BizAppsAccounting,${mjSchema}_BizAppsTasks,${mjSchema}_BizAppsIssues,${mjSchema}_BizAppsCommittees,${mjSchema}_BizAppsSecureMessaging';

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
-----               SCHEMA:      __mj_BizAppsOrders
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
    __mj_rgc.[Latitude] AS [__mj_Latitude],
    __mj_rgc.[Longitude] AS [__mj_Longitude]
FROM
    [${flyway:defaultSchema}].[OrderHeader] AS o
INNER JOIN
    [${mjSchema}].[Company] AS MJCompany_CompanyID
  ON
    [o].[CompanyID] = MJCompany_CompanyID.[ID]
LEFT OUTER JOIN
    [__mj_BizAppsCommon].[Person] AS mjBizAppsCommonPerson_BillToPersonID
  ON
    [o].[BillToPersonID] = mjBizAppsCommonPerson_BillToPersonID.[ID]
LEFT OUTER JOIN
    [__mj_BizAppsCommon].[Organization] AS mjBizAppsCommonOrganization_BillToOrganizationID
  ON
    [o].[BillToOrganizationID] = mjBizAppsCommonOrganization_BillToOrganizationID.[ID]
LEFT OUTER JOIN
    [${mjSchema}].[User] AS MJUser_SalesRepUserID
  ON
    [o].[SalesRepUserID] = MJUser_SalesRepUserID.[ID]
LEFT OUTER JOIN
    [__mj_BizAppsCommon].[Address] AS mjBizAppsCommonAddress_BillToAddressID
  ON
    [o].[BillToAddressID] = mjBizAppsCommonAddress_BillToAddressID.[ID]
LEFT OUTER JOIN
    [__mj_BizAppsCommon].[Address] AS mjBizAppsCommonAddress_ShipToAddressID
  ON
    [o].[ShipToAddressID] = mjBizAppsCommonAddress_ShipToAddressID.[ID]
LEFT OUTER JOIN
    [__mj_BizAppsCommon].[Organization] AS mjBizAppsCommonOrganization_ShipToOrganizationID
  ON
    [o].[ShipToOrganizationID] = mjBizAppsCommonOrganization_ShipToOrganizationID.[ID]
LEFT OUTER JOIN
    [__mj_BizAppsCommon].[Person] AS mjBizAppsCommonPerson_ShipToPersonID
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
    [${mjSchema}].[vwRecordGeoCodes] AS __mj_rgc
  ON
    __mj_rgc.[EntityID] = 'FC529BC8-FF09-44A9-B454-26EAFDAC791B'
    AND __mj_rgc.[RecordID] = CAST([o].[ID] AS NVARCHAR(450))
    AND __mj_rgc.[LocationType] = 'Primary'
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
