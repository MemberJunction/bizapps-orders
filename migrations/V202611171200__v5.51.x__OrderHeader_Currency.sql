-- =============================================================================
-- V202611171200 — An order records the currency it is contracted in (golive #492)
-- =============================================================================
-- Every order amount used to be read as the selling company's functional currency, so a
-- customer contracted in a foreign currency could only be billed a functional-currency
-- equivalent. An order now names its currency, and the order's amounts are in it.
--
-- What this file does:
--   1. OrderHeader gains CurrencyCode, the order's contract currency. NULL means the
--      selling company's functional currency, which is what every existing order is, so
--      no existing order changes.
--   2. OrderHeader gains BookingExchangeRate and BookingRateDate: the spot rate (units of
--      functional currency per one unit of the order's currency) read when the order is
--      first confirmed, and the date of that rate. Both are set together or not at all;
--      an order in its company's functional currency carries neither.
--
-- CurrencyCode references accounting's Currency table by code, the same way accounting's
-- own AccountingCompanyProfile.FunctionalCurrencyCode does. Orders already keeps foreign
-- keys into __mj_BizAppsAccounting (DimensionDefault), and accounting is a required app.
-- =============================================================================

ALTER TABLE [${flyway:defaultSchema}].[OrderHeader] ADD
    [CurrencyCode] CHAR(3) NULL
        CONSTRAINT [FK_OrderHeader_Currency] FOREIGN KEY
        REFERENCES [__mj_BizAppsAccounting].[Currency]([Code]),
    [BookingExchangeRate] DECIMAL(18,8) NULL,
    [BookingRateDate] DATE NULL,
    CONSTRAINT [CK_OrderHeader_BookingExchangeRate_Positive] CHECK ([BookingExchangeRate] IS NULL OR [BookingExchangeRate] > 0),
    CONSTRAINT [CK_OrderHeader_BookingRate_Together] CHECK (
        ([BookingExchangeRate] IS NULL AND [BookingRateDate] IS NULL)
        OR ([BookingExchangeRate] IS NOT NULL AND [BookingRateDate] IS NOT NULL)
    );
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'ISO 4217 code of the currency the order is contracted and billed in; its amounts are in this currency. NULL means the selling company''s functional currency. Can change only while the order is Draft or Quoted.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'OrderHeader',
    @level2type = N'COLUMN', @level2name = N'CurrencyCode';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Units of the selling company''s functional currency per one unit of CurrencyCode, read from accounting''s spot rates when the order is first confirmed (the most recent rate on or before the confirm date). NULL when the order is in the functional currency or not yet confirmed. Set by the server, never by hand.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'OrderHeader',
    @level2type = N'COLUMN', @level2name = N'BookingExchangeRate';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The date of the spot rate stored in BookingExchangeRate. Set together with it.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'OrderHeader',
    @level2type = N'COLUMN', @level2name = N'BookingRateDate';
GO


















































-- =============================================================================
-- CODEGEN OUTPUT — GENERATED CODE BELOW THIS LINE. DO NOT EDIT BY HAND.
-- This app's own CodeGen SQL for the change above, generated against a database
-- built from this repo's migrations: the three new Order Headers fields, the
-- relationship to accounting's Currencies, vwOrderHeaders and the CRUD procs.
-- =============================================================================


/* SQL text to insert 3 new entity field(s) */

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '8c8169a7-f755-4b30-9444-514825dab6f2' OR (EntityID = 'FC529BC8-FF09-44A9-B454-26EAFDAC791B' AND Name = 'CurrencyCode')) BEGIN
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
            '8c8169a7-f755-4b30-9444-514825dab6f2',
            'FC529BC8-FF09-44A9-B454-26EAFDAC791B', -- Entity: MJ_BizApps_Orders: Order Headers
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${mjSchema}].[EntityField] WHERE [EntityID] = 'FC529BC8-FF09-44A9-B454-26EAFDAC791B'),
            'CurrencyCode',
            'Currency Code',
            'ISO 4217 code of the currency the order is contracted and billed in; its amounts are in this currency. NULL means the selling company''s functional currency. Can change only while the order is Draft or Quoted.',
            'char',
            3,
            0,
            0,
            1,
            NULL,
            0,
            1,
            0,
            0,
            'D3329BE1-541B-4918-B1CB-3D7A0454EBA7',
            'Code',
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '5e7a09b3-b1ce-4506-8185-259968513229' OR (EntityID = 'FC529BC8-FF09-44A9-B454-26EAFDAC791B' AND Name = 'BookingExchangeRate')) BEGIN
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
            '5e7a09b3-b1ce-4506-8185-259968513229',
            'FC529BC8-FF09-44A9-B454-26EAFDAC791B', -- Entity: MJ_BizApps_Orders: Order Headers
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${mjSchema}].[EntityField] WHERE [EntityID] = 'FC529BC8-FF09-44A9-B454-26EAFDAC791B'),
            'BookingExchangeRate',
            'Booking Exchange Rate',
            'Units of the selling company''s functional currency per one unit of CurrencyCode, read from accounting''s spot rates when the order is first confirmed (the most recent rate on or before the confirm date). NULL when the order is in the functional currency or not yet confirmed. Set by the server, never by hand.',
            'decimal',
            9,
            18,
            8,
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = 'b4f83eb1-7aff-4d0f-98d8-5ae050965aee' OR (EntityID = 'FC529BC8-FF09-44A9-B454-26EAFDAC791B' AND Name = 'BookingRateDate')) BEGIN
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
            'b4f83eb1-7aff-4d0f-98d8-5ae050965aee',
            'FC529BC8-FF09-44A9-B454-26EAFDAC791B', -- Entity: MJ_BizApps_Orders: Order Headers
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${mjSchema}].[EntityField] WHERE [EntityID] = 'FC529BC8-FF09-44A9-B454-26EAFDAC791B'),
            'BookingRateDate',
            'Booking Rate Date',
            'The date of the spot rate stored in BookingExchangeRate. Set together with it.',
            'date',
            3,
            10,
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


/* SQL text to insert 1 new entity field(s) */

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = 'cef2212d-567a-4876-9731-7531a0424938' OR (EntityID = 'FC529BC8-FF09-44A9-B454-26EAFDAC791B' AND Name = 'CurrencyCode_Virtual')) BEGIN
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
            'cef2212d-567a-4876-9731-7531a0424938',
            'FC529BC8-FF09-44A9-B454-26EAFDAC791B', -- Entity: MJ_BizApps_Orders: Order Headers
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${mjSchema}].[EntityField] WHERE [EntityID] = 'FC529BC8-FF09-44A9-B454-26EAFDAC791B'),
            'CurrencyCode_Virtual',
            'Currency Code Virtual',
            NULL,
            'nvarchar',
            160,
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

/* Create Entity Relationship: MJ_BizApps_Accounting: Currencies -> MJ_BizApps_Orders: Order Headers (One To Many via CurrencyCode) */
   IF NOT EXISTS (
      SELECT 1 FROM [${mjSchema}].[EntityRelationship] WHERE [ID] = 'f82f1b19-95e5-497b-bc15-ad72d93c7bda' OR ([EntityID] = 'D3329BE1-541B-4918-B1CB-3D7A0454EBA7' AND [RelatedEntityID] = 'FC529BC8-FF09-44A9-B454-26EAFDAC791B' AND [RelatedEntityJoinField] = 'CurrencyCode')
   )
   BEGIN
      INSERT INTO [${mjSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [EntityKeyField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('f82f1b19-95e5-497b-bc15-ad72d93c7bda', 'D3329BE1-541B-4918-B1CB-3D7A0454EBA7', 'FC529BC8-FF09-44A9-B454-26EAFDAC791B', 'CurrencyCode', 'Code', 'One To Many', 1, 1, 7, GETUTCDATE(), GETUTCDATE())
   END;

/* Index for Foreign Keys for OrderHeader */

-- Index for foreign key CurrencyCode in table OrderHeader
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_OrderHeader_CurrencyCode' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[OrderHeader]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_OrderHeader_CurrencyCode ON [${flyway:defaultSchema}].[OrderHeader] ([CurrencyCode]);

/* SQL text to update entity field related entity name field map for entity field ID 8C8169A7-F755-4B30-9444-514825DAB6F2 */
EXEC [${mjSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='8C8169A7-F755-4B30-9444-514825DAB6F2', @RelatedEntityNameFieldMap='CurrencyCode_Virtual';


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
    mjBizAppsCommonAddress_BillToAddressID.[DisplayName] AS [BillToAddress],
    mjBizAppsCommonAddress_ShipToAddressID.[DisplayName] AS [ShipToAddress],
    mjBizAppsCommonOrganization_ShipToOrganizationID.[Name] AS [ShipToOrganization],
    mjBizAppsCommonPerson_ShipToPersonID.[DisplayName] AS [ShipToPerson],
    mjBizAppsOrdersPaymentTermsType_PaymentTermsTypeID.[Name] AS [PaymentTermsType],
    mjBizAppsOrdersPaymentType_InitialPaymentTypeID.[Name] AS [InitialPaymentType],
    mjBizAppsOrdersPaymentDetail_InitialPaymentDetailID.[Last4] AS [InitialPaymentDetail],
    MJUser_PostedByUserID.[Name] AS [PostedByUser],
    mjBizAppsOrdersOrderHeader_ReversesOrderHeaderID.[OrderNumber] AS [ReversesOrderHeader],
    mjBizAppsOrdersCheckoutWidget_SourceCheckoutWidgetID.[Name] AS [SourceCheckoutWidget],
    MJUser_ConfirmedByUserID.[Name] AS [ConfirmedByUser],
    mjBizAppsAccountingCurrency_CurrencyCode.[Name] AS [CurrencyCode_Virtual],
    __mj_emb_BillToAddressID.[Latitude] AS [__mj_Latitude_BillToAddressID],
    __mj_emb_BillToAddressID.[Longitude] AS [__mj_Longitude_BillToAddressID],
    __mj_emb_ShipToAddressID.[Latitude] AS [__mj_Latitude_ShipToAddressID],
    __mj_emb_ShipToAddressID.[Longitude] AS [__mj_Longitude_ShipToAddressID]
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
    [${mjSchema}].[User] AS MJUser_ConfirmedByUserID
  ON
    [o].[ConfirmedByUserID] = MJUser_ConfirmedByUserID.[ID]
LEFT OUTER JOIN
    [__mj_BizAppsAccounting].[Currency] AS mjBizAppsAccountingCurrency_CurrencyCode
  ON
    [o].[CurrencyCode] = mjBizAppsAccountingCurrency_CurrencyCode.[Code]
LEFT OUTER JOIN
    [__mj_BizAppsCommon].[Address] AS __mj_emb_BillToAddressID
  ON
    [o].[BillToAddressID] = __mj_emb_BillToAddressID.[ID]
LEFT OUTER JOIN
    [__mj_BizAppsCommon].[Address] AS __mj_emb_ShipToAddressID
  ON
    [o].[ShipToAddressID] = __mj_emb_ShipToAddressID.[ID]
GO
IF OBJECT_ID('[${flyway:defaultSchema}].[vwOrderHeaders]', 'V') IS NOT NULL
BEGIN
    EXEC sp_executesql N'REVOKE SELECT ON [${flyway:defaultSchema}].[vwOrderHeaders] FROM [cdp_Developer]
REVOKE SELECT ON [${flyway:defaultSchema}].[vwOrderHeaders] FROM [cdp_Integration]
REVOKE SELECT ON [${flyway:defaultSchema}].[vwOrderHeaders] FROM [cdp_UI]
GRANT SELECT ON [${flyway:defaultSchema}].[vwOrderHeaders] TO [cdp_UI], [cdp_Developer], [cdp_Integration]';
END;

/* Refresh layered base view for MJ_BizApps_Orders: Order Headers after its inner view changed */
EXEC sp_refreshview '${flyway:defaultSchema}.vwOrderHeadersGenerated';
IF OBJECT_ID('[${flyway:defaultSchema}].[vwOrderHeaders]', 'V') IS NOT NULL
BEGIN
    EXEC sp_executesql N'EXEC sp_refreshview ''${flyway:defaultSchema}.vwOrderHeaders'';';
END

GO

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
    EXEC sp_executesql N'REVOKE SELECT ON [${flyway:defaultSchema}].[vwOrderHeaders] FROM [cdp_Developer]
REVOKE SELECT ON [${flyway:defaultSchema}].[vwOrderHeaders] FROM [cdp_Integration]
REVOKE SELECT ON [${flyway:defaultSchema}].[vwOrderHeaders] FROM [cdp_UI]
GRANT SELECT ON [${flyway:defaultSchema}].[vwOrderHeaders] TO [cdp_UI], [cdp_Developer], [cdp_Integration]';
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
    @FulfillmentStatus nvarchar(20) = NULL,
    @BillToAddressSnapshot_Clear bit = 0,
    @BillToAddressSnapshot nvarchar(MAX) = NULL,
    @ShipToAddressSnapshot_Clear bit = 0,
    @ShipToAddressSnapshot nvarchar(MAX) = NULL,
    @ConfirmedByUserID_Clear bit = 0,
    @ConfirmedByUserID uniqueidentifier = NULL,
    @IPCountry_Clear bit = 0,
    @IPCountry char(2) = NULL,
    @CardIssuingCountry_Clear bit = 0,
    @CardIssuingCountry char(2) = NULL,
    @InitialPaymentReceivedDate_Clear bit = 0,
    @InitialPaymentReceivedDate date = NULL,
    @CurrencyCode_Clear bit = 0,
    @CurrencyCode char(3) = NULL,
    @BookingExchangeRate_Clear bit = 0,
    @BookingExchangeRate decimal(18, 8) = NULL,
    @BookingRateDate_Clear bit = 0,
    @BookingRateDate date = NULL
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
                [ConfirmedByUserID],
                [IPCountry],
                [CardIssuingCountry],
                [InitialPaymentReceivedDate],
                [CurrencyCode],
                [BookingExchangeRate],
                [BookingRateDate]
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
                CASE WHEN @ConfirmedByUserID_Clear = 1 THEN NULL ELSE ISNULL(@ConfirmedByUserID, NULL) END,
                CASE WHEN @IPCountry_Clear = 1 THEN NULL ELSE ISNULL(@IPCountry, NULL) END,
                CASE WHEN @CardIssuingCountry_Clear = 1 THEN NULL ELSE ISNULL(@CardIssuingCountry, NULL) END,
                CASE WHEN @InitialPaymentReceivedDate_Clear = 1 THEN NULL ELSE ISNULL(@InitialPaymentReceivedDate, NULL) END,
                CASE WHEN @CurrencyCode_Clear = 1 THEN NULL ELSE ISNULL(@CurrencyCode, NULL) END,
                CASE WHEN @BookingExchangeRate_Clear = 1 THEN NULL ELSE ISNULL(@BookingExchangeRate, NULL) END,
                CASE WHEN @BookingRateDate_Clear = 1 THEN NULL ELSE ISNULL(@BookingRateDate, NULL) END
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
                [ConfirmedByUserID],
                [IPCountry],
                [CardIssuingCountry],
                [InitialPaymentReceivedDate],
                [CurrencyCode],
                [BookingExchangeRate],
                [BookingRateDate]
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
                CASE WHEN @ConfirmedByUserID_Clear = 1 THEN NULL ELSE ISNULL(@ConfirmedByUserID, NULL) END,
                CASE WHEN @IPCountry_Clear = 1 THEN NULL ELSE ISNULL(@IPCountry, NULL) END,
                CASE WHEN @CardIssuingCountry_Clear = 1 THEN NULL ELSE ISNULL(@CardIssuingCountry, NULL) END,
                CASE WHEN @InitialPaymentReceivedDate_Clear = 1 THEN NULL ELSE ISNULL(@InitialPaymentReceivedDate, NULL) END,
                CASE WHEN @CurrencyCode_Clear = 1 THEN NULL ELSE ISNULL(@CurrencyCode, NULL) END,
                CASE WHEN @BookingExchangeRate_Clear = 1 THEN NULL ELSE ISNULL(@BookingExchangeRate, NULL) END,
                CASE WHEN @BookingRateDate_Clear = 1 THEN NULL ELSE ISNULL(@BookingRateDate, NULL) END
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwOrderHeaders] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreateOrderHeader] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreateOrderHeader] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateOrderHeader] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ_BizApps_Orders: Order Headers */

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreateOrderHeader] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreateOrderHeader] FROM [cdp_Integration]
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
    @ConfirmedByUserID uniqueidentifier = NULL,
    @IPCountry_Clear bit = 0,
    @IPCountry char(2) = NULL,
    @CardIssuingCountry_Clear bit = 0,
    @CardIssuingCountry char(2) = NULL,
    @InitialPaymentReceivedDate_Clear bit = 0,
    @InitialPaymentReceivedDate date = NULL,
    @CurrencyCode_Clear bit = 0,
    @CurrencyCode char(3) = NULL,
    @BookingExchangeRate_Clear bit = 0,
    @BookingExchangeRate decimal(18, 8) = NULL,
    @BookingRateDate_Clear bit = 0,
    @BookingRateDate date = NULL
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
        [ConfirmedByUserID] = CASE WHEN @ConfirmedByUserID_Clear = 1 THEN NULL ELSE ISNULL(@ConfirmedByUserID, [ConfirmedByUserID]) END,
        [IPCountry] = CASE WHEN @IPCountry_Clear = 1 THEN NULL ELSE ISNULL(@IPCountry, [IPCountry]) END,
        [CardIssuingCountry] = CASE WHEN @CardIssuingCountry_Clear = 1 THEN NULL ELSE ISNULL(@CardIssuingCountry, [CardIssuingCountry]) END,
        [InitialPaymentReceivedDate] = CASE WHEN @InitialPaymentReceivedDate_Clear = 1 THEN NULL ELSE ISNULL(@InitialPaymentReceivedDate, [InitialPaymentReceivedDate]) END,
        [CurrencyCode] = CASE WHEN @CurrencyCode_Clear = 1 THEN NULL ELSE ISNULL(@CurrencyCode, [CurrencyCode]) END,
        [BookingExchangeRate] = CASE WHEN @BookingExchangeRate_Clear = 1 THEN NULL ELSE ISNULL(@BookingExchangeRate, [BookingExchangeRate]) END,
        [BookingRateDate] = CASE WHEN @BookingRateDate_Clear = 1 THEN NULL ELSE ISNULL(@BookingRateDate, [BookingRateDate]) END
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

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spUpdateOrderHeader] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spUpdateOrderHeader] FROM [cdp_Integration]
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

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spUpdateOrderHeader] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spUpdateOrderHeader] FROM [cdp_Integration]
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
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteOrderHeader] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteOrderHeader] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteOrderHeader] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for MJ_BizApps_Orders: Order Headers */

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteOrderHeader] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteOrderHeader] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteOrderHeader] TO [cdp_Developer], [cdp_Integration];

/* Refresh custom base views for modified entities so schema changes are picked up */
EXEC sp_refreshview '${flyway:defaultSchema}.vwOrderHeadersGenerated';
IF OBJECT_ID('[${flyway:defaultSchema}].[vwOrderHeaders]', 'V') IS NOT NULL
BEGIN
    EXEC sp_executesql N'EXEC sp_refreshview ''${flyway:defaultSchema}.vwOrderHeaders'';';
END;


