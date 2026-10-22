-- =============================================================================
-- V202609281000 — Record who confirmed each order (bc-aidp-next-golive#279)
-- =============================================================================
-- The finance exception review has to know who created a record before it can
-- let somebody else clear an exception raised against it. For an order that is
-- the person who confirmed it: confirming is the act that books it. The order
-- carried ConfirmedAt and no record of who, so nothing could tell a reviewer
-- apart from the person whose booking they were reviewing.
--
-- What this file does:
--   1. OrderHeader.ConfirmedByUserID, written by OrderEntityServer on the first
--      transition to Confirmed from the save's context user, in the same write
--      that stamps ConfirmedAt.
--   2. trg_OrderHeader_ConfirmedByFrozenAfterBooking (51017): once an order has
--      a ConfirmedAt, ConfirmedByUserID cannot change.
--
-- NO BACKFILL. Who confirmed an order booked before this migration is not
-- recorded anywhere, so those rows stay NULL, and the trigger keeps them NULL.
-- A reader treats NULL on a booked order as "confirmed before this was
-- recorded", not as "nobody".
--
-- THE FREEZE KEYS ON ConfirmedAt, NOT ON Status. Booking keys on ConfirmedAt
-- (OrderEntityServer): an order the data conversion created with Status
-- Confirmed and no ConfirmedAt is booked by its next save, and that save is the
-- one that has to be allowed to write ConfirmedByUserID. The booking UPDATE
-- writes both columns together, so the prior row has no ConfirmedAt and passes.
--
-- A separate trigger rather than another clause on
-- trg_OrderHeader_ImmutableAfterConfirm, so this file does not restate that
-- trigger's body and cannot undo a change another migration makes to it.
-- =============================================================================

ALTER TABLE [${flyway:defaultSchema}].[OrderHeader]
    ADD [ConfirmedByUserID] UNIQUEIDENTIFIER NULL
            CONSTRAINT FK_OrderHeader_ConfirmedByUser
            FOREIGN KEY REFERENCES [__mj].[User]([ID]);
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The user whose save first confirmed (booked) this order, stamped from that save''s context user in the same write as ConfirmedAt. A booking made by an unattended process, such as a renewal job, records the user that process runs as. NULL until the order is confirmed, and NULL on orders confirmed before this column existed, whose confirmer is not known. Never changes once ConfirmedAt is set (trg_OrderHeader_ConfirmedByFrozenAfterBooking, 51017).',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'OrderHeader',
    @level2type = N'COLUMN', @level2name = N'ConfirmedByUserID';
GO

-- -----------------------------------------------------------------------------
-- trg_OrderHeader_ConfirmedByFrozenAfterBooking
-- -----------------------------------------------------------------------------
-- Judged by the PRIOR row (deleted.ConfirmedAt), so the booking UPDATE, which
-- sets ConfirmedAt and ConfirmedByUserID together, passes, and every later write
-- is checked. EXISTS / EXCEPT treats two NULLs as equal and a NULL against a
-- value as a change, so an order booked before this column existed cannot have
-- a confirmer filled in afterwards either.
CREATE TRIGGER [${flyway:defaultSchema}].[trg_OrderHeader_ConfirmedByFrozenAfterBooking]
ON [${flyway:defaultSchema}].[OrderHeader]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;

    IF EXISTS (
        SELECT 1
        FROM deleted d
        JOIN inserted i ON i.ID = d.ID
        WHERE d.ConfirmedAt IS NOT NULL
          AND EXISTS (SELECT i.ConfirmedByUserID EXCEPT SELECT d.ConfirmedByUserID)
    )
    BEGIN
        ROLLBACK TRANSACTION;
        THROW 51017, 'OrderHeader.ConfirmedByUserID cannot be changed once the order is booked: it records who confirmed the order, and is written only by the booking save.', 1;
    END;
END;
GO



















































-- =============================================================================
--
--   CODEGEN OUTPUT — GENERATED CODE BELOW THIS LINE (do not hand-edit)
--
--   Produced by MJ CodeGen against the hand-authored DDL above, and lifted with the
--   ${flyway:defaultSchema} / ${mjSchema} placeholders it already substitutes.
--
--   Contains the EntityField registrations for ConfirmedByUserID and its
--   ConfirmedByUser name field on MJ_BizApps_Orders: Order Headers, the MJ: Users
--   relationship, the foreign-key index, the rebuilt vwOrderHeadersGenerated and a
--   refresh of vwOrderHeaders over it, spCreate/spUpdate for OrderHeader, and the
--   grants CodeGen emits.
--
--   Only the sections touching the new column are here. A CodeGen run against a
--   clean database re-emits other objects this change never touched. The
--   EntityField Sequence values are computed at apply time, as
--   .github/scripts/check-migration-entityfield-sequence.mjs requires.
--
-- =============================================================================

/* SQL text to insert 2 new entity field(s) */
      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '75b6d86f-a9e6-4802-95e1-713cfb4951d2' OR (EntityID = 'FC529BC8-FF09-44A9-B454-26EAFDAC791B' AND Name = 'ConfirmedByUserID')) BEGIN
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
            '75b6d86f-a9e6-4802-95e1-713cfb4951d2',
            'FC529BC8-FF09-44A9-B454-26EAFDAC791B', -- Entity: MJ_BizApps_Orders: Order Headers
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${mjSchema}].[EntityField] WHERE [EntityID] = 'FC529BC8-FF09-44A9-B454-26EAFDAC791B'),
            'ConfirmedByUserID',
            'Confirmed By User ID',
            'The user whose save first confirmed (booked) this order, stamped from that save''s context user in the same write as ConfirmedAt. A booking made by an unattended process, such as a renewal job, records the user that process runs as. NULL until the order is confirmed, and NULL on orders confirmed before this column existed, whose confirmer is not known. Never changes once ConfirmedAt is set (trg_OrderHeader_ConfirmedByFrozenAfterBooking, 51017).',
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
            'E1238F34-2837-EF11-86D4-6045BDEE16E6',
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = 'b1ee4505-c354-49f8-bda0-b0ce73f483e4' OR (EntityID = 'FC529BC8-FF09-44A9-B454-26EAFDAC791B' AND Name = 'ConfirmedByUser')) BEGIN
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
            'b1ee4505-c354-49f8-bda0-b0ce73f483e4',
            'FC529BC8-FF09-44A9-B454-26EAFDAC791B', -- Entity: MJ_BizApps_Orders: Order Headers
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${mjSchema}].[EntityField] WHERE [EntityID] = 'FC529BC8-FF09-44A9-B454-26EAFDAC791B'),
            'ConfirmedByUser',
            'Confirmed By User',
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

/* Create Entity Relationship: MJ: Users -> MJ_BizApps_Orders: Order Headers (One To Many via ConfirmedByUserID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${mjSchema}].[EntityRelationship] WHERE [ID] = '40c31de8-fc38-42f5-b631-639c12836516'
   )
   BEGIN
      INSERT INTO [${mjSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('40c31de8-fc38-42f5-b631-639c12836516', 'E1238F34-2837-EF11-86D4-6045BDEE16E6', 'FC529BC8-FF09-44A9-B454-26EAFDAC791B', 'ConfirmedByUserID', 'One To Many', 1, 1, 121, GETUTCDATE(), GETUTCDATE())
   END;

/* Index for the ConfirmedByUserID foreign key */
-- Index for foreign key ConfirmedByUserID in table OrderHeader
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_OrderHeader_ConfirmedByUserID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[OrderHeader]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_OrderHeader_ConfirmedByUserID ON [${flyway:defaultSchema}].[OrderHeader] ([ConfirmedByUserID]);

/* SQL text to update entity field related entity name field map for entity field ID 75B6D86F-A9E6-4802-95E1-713CFB4951D2 */
EXEC [${mjSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='75B6D86F-A9E6-4802-95E1-713CFB4951D2', @RelatedEntityNameFieldMap='ConfirmedByUser';

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
    MJUser_ConfirmedByUserID.[Name] AS [ConfirmedByUser]
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
    [${mjSchema}].[User] AS MJUser_ConfirmedByUserID
  ON
    [o].[ConfirmedByUserID] = MJUser_ConfirmedByUserID.[ID]
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

/* Refresh the view that selects vwOrderHeadersGenerated with *, BEFORE the procedures below:
   spCreateOrderHeader and spUpdateOrderHeader read vwOrderHeaders, which does not see the new
   columns until it is refreshed */
EXEC sp_refreshview '${flyway:defaultSchema}.vwOrderHeadersGenerated';
IF OBJECT_ID('[${flyway:defaultSchema}].[vwOrderHeaders]', 'V') IS NOT NULL
BEGIN
    EXEC sp_executesql N'EXEC sp_refreshview ''${flyway:defaultSchema}.vwOrderHeaders'';';
END;
GO

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
    @FulfillmentStatus nvarchar(20) = NULL,
    @BillToAddressSnapshot_Clear bit = 0,
    @BillToAddressSnapshot nvarchar(MAX) = NULL,
    @ShipToAddressSnapshot_Clear bit = 0,
    @ShipToAddressSnapshot nvarchar(MAX) = NULL,
    @ConfirmedByUserID_Clear bit = 0,
    @ConfirmedByUserID uniqueidentifier = NULL
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
                [FulfillmentStatus],
                [BillToAddressSnapshot],
                [ShipToAddressSnapshot],
                [ConfirmedByUserID]
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
                ISNULL(@FulfillmentStatus, 'Pending'),
                CASE WHEN @BillToAddressSnapshot_Clear = 1 THEN NULL ELSE ISNULL(@BillToAddressSnapshot, NULL) END,
                CASE WHEN @ShipToAddressSnapshot_Clear = 1 THEN NULL ELSE ISNULL(@ShipToAddressSnapshot, NULL) END,
                CASE WHEN @ConfirmedByUserID_Clear = 1 THEN NULL ELSE ISNULL(@ConfirmedByUserID, NULL) END
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
                [FulfillmentStatus],
                [BillToAddressSnapshot],
                [ShipToAddressSnapshot],
                [ConfirmedByUserID]
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
                ISNULL(@FulfillmentStatus, 'Pending'),
                CASE WHEN @BillToAddressSnapshot_Clear = 1 THEN NULL ELSE ISNULL(@BillToAddressSnapshot, NULL) END,
                CASE WHEN @ShipToAddressSnapshot_Clear = 1 THEN NULL ELSE ISNULL(@ShipToAddressSnapshot, NULL) END,
                CASE WHEN @ConfirmedByUserID_Clear = 1 THEN NULL ELSE ISNULL(@ConfirmedByUserID, NULL) END
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
    @FulfillmentStatus nvarchar(20) = NULL,
    @BillToAddressSnapshot_Clear bit = 0,
    @BillToAddressSnapshot nvarchar(MAX) = NULL,
    @ShipToAddressSnapshot_Clear bit = 0,
    @ShipToAddressSnapshot nvarchar(MAX) = NULL,
    @ConfirmedByUserID_Clear bit = 0,
    @ConfirmedByUserID uniqueidentifier = NULL
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
        [FulfillmentStatus] = ISNULL(@FulfillmentStatus, [FulfillmentStatus]),
        [BillToAddressSnapshot] = CASE WHEN @BillToAddressSnapshot_Clear = 1 THEN NULL ELSE ISNULL(@BillToAddressSnapshot, [BillToAddressSnapshot]) END,
        [ShipToAddressSnapshot] = CASE WHEN @ShipToAddressSnapshot_Clear = 1 THEN NULL ELSE ISNULL(@ShipToAddressSnapshot, [ShipToAddressSnapshot]) END,
        [ConfirmedByUserID] = CASE WHEN @ConfirmedByUserID_Clear = 1 THEN NULL ELSE ISNULL(@ConfirmedByUserID, [ConfirmedByUserID]) END
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
