-- =============================================================================
-- V202611091700 — OrderHeader.EngagementLeadUserID and post-go-live metadata cleanup
-- =============================================================================
-- What this file does, in order:
--   1. OrderHeader gains EngagementLeadUserID (nullable FK to User): the delivery
--      owner for attested-progress lines, distinct from SalesRepUserID (#807).
--   2. OutboundEvent drops duplicate index IX_OutboundEvent_OrderHeaderID (#849).
--   3. Column MS_Description extended properties are aligned with actual trigger
--      names and behavior on OrderHeader, OrderLine, OutboundEvent, SalesAuthority,
--      and Subscription (#848, #850, #854, #870).
--   4. JournalEntryType 'InstalmentInvoice' description is aligned with D92 (#800).
--   5. CodeGen output below the 50-blank-line banner registers the new EntityField
--      rows and relationship for EngagementLeadUserID, links OrderLine.ShipToAddressID
--      to Address and adds its virtual ShipToAddress field (#851), switches
--      OrderHeader's BillToAddress and ShipToAddress virtual fields from Line1 to
--      DisplayName (#979), sets Product.SubscriptionFamily's form category (#979),
--      normalizes EntityField.Sequence on External Invoices, External Customers,
--      and Outbound Events (#686), and rebuilds vwOrderHeadersGenerated,
--      vwOrderLines, spCreateOrderHeader, and spUpdateOrderHeader.
--
-- Hand-written DDL here is PLAIN: no existence guards. Migrations run once, in order.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. OrderHeader.EngagementLeadUserID (#807)
-- -----------------------------------------------------------------------------
ALTER TABLE [${flyway:defaultSchema}].[OrderHeader]
    ADD [EngagementLeadUserID] UNIQUEIDENTIFIER NULL
    CONSTRAINT [FK_OrderHeader_EngagementLead] FOREIGN KEY REFERENCES [${mjSchema}].[User]([ID]);
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The user responsible for delivering the order''s work (the engagement lead), distinct from SalesRepUserID (who sold it). Optional. Pre-fills AttestedByUserID when progress is recorded and lets the progress worklist filter by delivery owner.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'OrderHeader',
    @level2type = N'COLUMN', @level2name = N'EngagementLeadUserID';
GO

-- -----------------------------------------------------------------------------
-- 2. Drop duplicate index IX_OutboundEvent_OrderHeaderID (#849)
-- -----------------------------------------------------------------------------
DROP INDEX [IX_OutboundEvent_OrderHeaderID] ON [${flyway:defaultSchema}].[OutboundEvent];
GO

-- -----------------------------------------------------------------------------
-- 3. Align column MS_Description extended properties (#848, #850, #854, #870)
-- -----------------------------------------------------------------------------
EXEC sp_updateextendedproperty
    @name = N'MS_Description',
    @value = N'The bill-to address as it was when the order was first confirmed: JSON with AddressID, Line1, Line2, Line3, City, StateProvince, PostalCode and Country. NULL until the order is confirmed. Written once and never changed (trg_OrderHeader_ImmutableAfterConfirm, 51015). Reporting and invoicing read this on a confirmed order instead of the live Address row.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'OrderHeader',
    @level2type = N'COLUMN', @level2name = N'BillToAddressSnapshot';
GO

EXEC sp_updateextendedproperty
    @name = N'MS_Description',
    @value = N'The ship-to address as it was when the order was first confirmed: JSON with AddressID, Line1, Line2, Line3, City, StateProvince, PostalCode and Country. NULL until the order is confirmed. Written once and never changed (trg_OrderHeader_ImmutableAfterConfirm, 51015). Reporting and invoicing read this on a confirmed order instead of the live Address row.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'OrderHeader',
    @level2type = N'COLUMN', @level2name = N'ShipToAddressSnapshot';
GO

EXEC sp_updateextendedproperty
    @name = N'MS_Description',
    @value = N'The user whose save first confirmed (booked) this order, stamped from that save''s context user in the same write as ConfirmedAt. A booking made by an unattended process, such as a renewal job, records the user that process runs as. NULL until the order is confirmed, and NULL on orders confirmed before this column existed, whose confirmer is not known. Never changes once ConfirmedAt is set (trg_OrderHeader_ImmutableAfterConfirm, 51017).',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'OrderHeader',
    @level2type = N'COLUMN', @level2name = N'ConfirmedByUserID';
GO

EXEC sp_updateextendedproperty
    @name = N'MS_Description',
    @value = N'The line''s own ship-to address as it was when the order was first confirmed, in the same JSON shape as OrderHeader.ShipToAddressSnapshot. NULL when the line has no ShipToAddressID of its own, or until the order is confirmed. Written once and never changed (trg_OrderLine_ImmutableAfterConfirm, 51016).',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'OrderLine',
    @level2type = N'COLUMN', @level2name = N'ShipToAddressSnapshot';
GO

EXEC sp_updateextendedproperty
    @name = N'MS_Description',
    @value = N'The order the event is about. Set on every OrderConfirmed event, and on a GrantStatusChanged event when the grant has an order line, so deliveries can be read by order.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'OutboundEvent',
    @level2type = N'COLUMN', @level2name = N'OrderHeaderID';
GO

EXEC sp_updateextendedproperty
    @name = N'MS_Description',
    @value = N'Days a term''s start or end may move (extension, shortening or shift) before a concession needs approval; smaller moves this rep may grant unaided. NULL means no authority to move term dates, so every term-date concession goes to approval.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'SalesAuthority',
    @level2type = N'COLUMN', @level2name = N'MaxTermExtensionDays';
GO

EXEC sp_updateextendedproperty
    @name = N'MS_Description',
    @value = N'Whether the discount on the term being renewed carries into the renewal. Off by default: a first-term discount lapses and the renewal starts from the undiscounted price. Set it for a discount agreed to continue, such as a multi-year concession. When the renewal moves to a successor product, the carried discount applies to the successor''s list price.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'Subscription',
    @level2type = N'COLUMN', @level2name = N'CarryDiscountOnRenewal';
GO

-- -----------------------------------------------------------------------------
-- 4. JournalEntryType 'InstalmentInvoice' description (#800)
-- -----------------------------------------------------------------------------
UPDATE [${mjSchema}_BizAppsAccounting].[JournalEntryType]
SET [Description] = N'Written when one instalment of an order''s payment schedule is invoiced (orders D92): the value entry the order would have booked at confirm, raised instead for that instalment''s share - debiting the receivable and crediting deferred revenue (or the contract asset where revenue was recognised first), with tax, charges and any discount in proportion. Distinct from Order Booking so a report can tell a booking from a bill, which matters once confirmation stops booking the whole contract. Seeded by bizapps-orders because the EVENT is an orders concept - accounting seeds only the ledger-mechanics types it originates itself.',
    [__mj_UpdatedAt] = GETUTCDATE()
WHERE [ID] = 'B2791781-FBBE-419F-9329-933E2223135B';
GO


















































-- =============================================================================
-- CODEGEN OUTPUT — GENERATED CODE BELOW THIS LINE. DO NOT EDIT BY HAND.
-- =============================================================================

/* SQL text to insert new entity field(s) */

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '32f0e917-9c14-4d4a-9d63-7410f302c941' OR (EntityID = 'FC529BC8-FF09-44A9-B454-26EAFDAC791B' AND Name = 'EngagementLeadUserID')) BEGIN
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
            '32f0e917-9c14-4d4a-9d63-7410f302c941',
            'FC529BC8-FF09-44A9-B454-26EAFDAC791B', -- Entity: MJ_BizApps_Orders: Order Headers
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${mjSchema}].[EntityField] WHERE [EntityID] = 'FC529BC8-FF09-44A9-B454-26EAFDAC791B'),
            'EngagementLeadUserID',
            'Engagement Lead',
            'The user responsible for delivering the order''s work (the engagement lead), distinct from SalesRepUserID (who sold it). Optional. Pre-fills AttestedByUserID when progress is recorded and lets the progress worklist filter by delivery owner.',
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '82c81b92-450b-4489-9311-623930a54f12' OR (EntityID = 'FC529BC8-FF09-44A9-B454-26EAFDAC791B' AND Name = 'EngagementLeadUser')) BEGIN
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
            '82c81b92-450b-4489-9311-623930a54f12',
            'FC529BC8-FF09-44A9-B454-26EAFDAC791B', -- Entity: MJ_BizApps_Orders: Order Headers
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${mjSchema}].[EntityField] WHERE [EntityID] = 'FC529BC8-FF09-44A9-B454-26EAFDAC791B'),
            'EngagementLeadUser',
            'Engagement Lead Name',
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = 'd92a4c71-8812-437e-9b55-642718c34011' OR (EntityID = '66D82C24-9C9F-4CD6-B019-53C20274AB00' AND Name = 'ShipToAddress')) BEGIN
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
            'd92a4c71-8812-437e-9b55-642718c34011',
            '66D82C24-9C9F-4CD6-B019-53C20274AB00', -- Entity: MJ_BizApps_Orders: Order Lines
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${mjSchema}].[EntityField] WHERE [EntityID] = '66D82C24-9C9F-4CD6-B019-53C20274AB00'),
            'ShipToAddress',
            'Ship To Address Name',
            NULL,
            'nvarchar',
            800,
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

/* Create Entity Relationship: MJ: Users -> MJ_BizApps_Orders: Order Headers (One To Many via EngagementLeadUserID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${mjSchema}].[EntityRelationship] WHERE [ID] = '61f9a24c-779d-4c88-9015-994b5d1249a3'
   )
   BEGIN
      INSERT INTO [${mjSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('61f9a24c-779d-4c88-9015-994b5d1249a3', 'E1238F34-2837-EF11-86D4-6045BDEE16E6', 'FC529BC8-FF09-44A9-B454-26EAFDAC791B', 'EngagementLeadUserID', 'One To Many', 1, 1, 122, GETUTCDATE(), GETUTCDATE())
   END;

/* Index for the EngagementLeadUserID foreign key */
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_OrderHeader_EngagementLeadUserID'
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[OrderHeader]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_OrderHeader_EngagementLeadUserID ON [${flyway:defaultSchema}].[OrderHeader] ([EngagementLeadUserID]);

/* Update EntityField RelatedEntityNameFieldMap */
EXEC [${mjSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='32F0E917-9C14-4D4A-9D63-7410F302C941', @RelatedEntityNameFieldMap='EngagementLeadUser';

/* Link OrderLine.ShipToAddressID to MJ_BizApps_Common: Addresses (#851) */
UPDATE [${mjSchema}].[EntityField]
SET [RelatedEntityID] = '61B5C6FB-7317-46D1-8E05-F669B7BC6F3E',
    [RelatedEntityFieldName] = 'ID',
    [IncludeRelatedEntityNameFieldInBaseView] = 1,
    [RelatedEntityNameFieldMap] = 'ShipToAddress',
    [__mj_UpdatedAt] = GETUTCDATE()
WHERE [ID] = 'B81F4205-3E9D-49C5-B76D-6EB25B0EFA26';

/* Update OrderHeader BillToAddress and ShipToAddress virtual field length to match Address.DisplayName (#979) */
UPDATE [${mjSchema}].[EntityField]
SET [Length] = 800,
    [__mj_UpdatedAt] = GETUTCDATE()
WHERE [ID] IN ('A5A7DFCD-E18F-4D44-800D-52CE4339331E', 'A60F3EE4-CDFB-411D-84AA-821FDFC51138');

/* Sync EntityField descriptions with column MS_Description updates (#848, #850, #854, #870) */
UPDATE [${mjSchema}].[EntityField]
SET [Description] = N'The bill-to address as it was when the order was first confirmed: JSON with AddressID, Line1, Line2, Line3, City, StateProvince, PostalCode and Country. NULL until the order is confirmed. Written once and never changed (trg_OrderHeader_ImmutableAfterConfirm, 51015). Reporting and invoicing read this on a confirmed order instead of the live Address row.',
    [__mj_UpdatedAt] = GETUTCDATE()
WHERE [ID] = '4BEC4999-721D-423A-B88B-2076F475BB39';

UPDATE [${mjSchema}].[EntityField]
SET [Description] = N'The ship-to address as it was when the order was first confirmed: JSON with AddressID, Line1, Line2, Line3, City, StateProvince, PostalCode and Country. NULL until the order is confirmed. Written once and never changed (trg_OrderHeader_ImmutableAfterConfirm, 51015). Reporting and invoicing read this on a confirmed order instead of the live Address row.',
    [__mj_UpdatedAt] = GETUTCDATE()
WHERE [ID] = 'F9F37487-78B3-4E0C-8F74-046EFBA959A8';

UPDATE [${mjSchema}].[EntityField]
SET [Description] = N'The user whose save first confirmed (booked) this order, stamped from that save''s context user in the same write as ConfirmedAt. A booking made by an unattended process, such as a renewal job, records the user that process runs as. NULL until the order is confirmed, and NULL on orders confirmed before this column existed, whose confirmer is not known. Never changes once ConfirmedAt is set (trg_OrderHeader_ImmutableAfterConfirm, 51017).',
    [__mj_UpdatedAt] = GETUTCDATE()
WHERE [ID] = '75B6D86F-A9E6-4802-95E1-713CFB4951D2';

UPDATE [${mjSchema}].[EntityField]
SET [Description] = N'The line''s own ship-to address as it was when the order was first confirmed, in the same JSON shape as OrderHeader.ShipToAddressSnapshot. NULL when the line has no ShipToAddressID of its own, or until the order is confirmed. Written once and never changed (trg_OrderLine_ImmutableAfterConfirm, 51016).',
    [__mj_UpdatedAt] = GETUTCDATE()
WHERE [ID] = '0A8DE5AA-338D-4963-A8E5-B50D814364F8';

UPDATE [${mjSchema}].[EntityField]
SET [Description] = N'The order the event is about. Set on every OrderConfirmed event, and on a GrantStatusChanged event when the grant has an order line, so deliveries can be read by order.',
    [__mj_UpdatedAt] = GETUTCDATE()
WHERE [EntityID] = '154DCE03-C019-43B0-B293-1E6D93E303A2' AND [Name] = 'OrderHeaderID';

UPDATE [${mjSchema}].[EntityField]
SET [Description] = N'Days a term''s start or end may move (extension, shortening or shift) before a concession needs approval; smaller moves this rep may grant unaided. NULL means no authority to move term dates, so every term-date concession goes to approval.',
    [__mj_UpdatedAt] = GETUTCDATE()
WHERE [ID] = 'B7B46B1E-48DD-409E-8C4B-2549C02DB7EB';

UPDATE [${mjSchema}].[EntityField]
SET [Description] = N'Whether the discount on the term being renewed carries into the renewal. Off by default: a first-term discount lapses and the renewal starts from the undiscounted price. Set it for a discount agreed to continue, such as a multi-year concession. When the renewal moves to a successor product, the carried discount applies to the successor''s list price.',
    [__mj_UpdatedAt] = GETUTCDATE()
WHERE [ID] = 'F2D0FF66-5730-4F55-987A-254FC1FC70FC';

/* Set categories for new and uncategorized fields (#807, #851, #979) */
UPDATE [${mjSchema}].[EntityField]
SET [Category] = 'Customer Information',
    [GeneratedFormSection] = 'Category',
    [__mj_UpdatedAt] = GETUTCDATE()
WHERE [ID] IN ('32F0E917-9C14-4D4A-9D63-7410F302C941', '82C81B92-450B-4489-9311-623930A54F12');

UPDATE [${mjSchema}].[EntityField]
SET [Category] = 'Shipping Details',
    [GeneratedFormSection] = 'Category',
    [__mj_UpdatedAt] = GETUTCDATE()
WHERE [ID] = 'D92A4C71-8812-437E-9B55-642718C34011';

UPDATE [${mjSchema}].[EntityField]
SET [Category] = 'Subscription and Entitlements',
    [GeneratedFormSection] = 'Category',
    [__mj_UpdatedAt] = GETUTCDATE()
WHERE [ID] = '19744BA4-2E43-4DA1-B2CB-5C40DD122969';

/* Normalize EntityField.Sequence (1..N, non-virtual before virtual) (#686) */
UPDATE [${mjSchema}].[EntityField]
SET [Sequence] = [Sequence] + 200000
WHERE [EntityID] IN (
    '9915A9E7-6BC6-4518-BAEA-206B18C86622', -- External Invoices
    '6F739DCD-46E0-44A1-9A94-51E4E6E849FF', -- External Customers
    '154DCE03-C019-43B0-B293-1E6D93E303A2', -- Outbound Events
    'FC529BC8-FF09-44A9-B454-26EAFDAC791B', -- Order Headers
    '66D82C24-9C9F-4CD6-B019-53C20274AB00'  -- Order Lines
);

WITH RankedFields AS (
    SELECT [ID],
           ROW_NUMBER() OVER (
               PARTITION BY [EntityID]
               ORDER BY [IsVirtual] ASC, [Sequence] ASC, [ID] ASC
           ) AS [NewSeq]
    FROM [${mjSchema}].[EntityField]
    WHERE [EntityID] IN (
        '9915A9E7-6BC6-4518-BAEA-206B18C86622',
        '6F739DCD-46E0-44A1-9A94-51E4E6E849FF',
        '154DCE03-C019-43B0-B293-1E6D93E303A2',
        'FC529BC8-FF09-44A9-B454-26EAFDAC791B',
        '66D82C24-9C9F-4CD6-B019-53C20274AB00'
    )
)
UPDATE ef
SET ef.[Sequence] = rf.[NewSeq]
FROM [${mjSchema}].[EntityField] ef
INNER JOIN RankedFields rf ON rf.[ID] = ef.[ID];
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
    ${mjSchema}_emb_BillToAddressID.[Latitude] AS [${mjSchema}_Latitude_BillToAddressID],
    ${mjSchema}_emb_BillToAddressID.[Longitude] AS [${mjSchema}_Longitude_BillToAddressID],
    ${mjSchema}_emb_ShipToAddressID.[Latitude] AS [${mjSchema}_Latitude_ShipToAddressID],
    ${mjSchema}_emb_ShipToAddressID.[Longitude] AS [${mjSchema}_Longitude_ShipToAddressID],
    MJUser_EngagementLeadUserID.[Name] AS [EngagementLeadUser]
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
LEFT OUTER JOIN
    [${mjSchema}_BizAppsCommon].[Address] AS ${mjSchema}_emb_BillToAddressID
  ON
    [o].[BillToAddressID] = ${mjSchema}_emb_BillToAddressID.[ID]
LEFT OUTER JOIN
    [${mjSchema}_BizAppsCommon].[Address] AS ${mjSchema}_emb_ShipToAddressID
  ON
    [o].[ShipToAddressID] = ${mjSchema}_emb_ShipToAddressID.[ID]
LEFT OUTER JOIN
    [${mjSchema}].[User] AS MJUser_EngagementLeadUserID
  ON
    [o].[EngagementLeadUserID] = MJUser_EngagementLeadUserID.[ID]
GO

IF OBJECT_ID('[${flyway:defaultSchema}].[vwOrderHeaders]', 'V') IS NOT NULL
BEGIN
    EXEC sp_executesql N'REVOKE SELECT ON [${flyway:defaultSchema}].[vwOrderHeaders] FROM [cdp_Developer]
REVOKE SELECT ON [${flyway:defaultSchema}].[vwOrderHeaders] FROM [cdp_Integration]
REVOKE SELECT ON [${flyway:defaultSchema}].[vwOrderHeaders] FROM [cdp_UI]
GRANT SELECT ON [${flyway:defaultSchema}].[vwOrderHeaders] TO [cdp_UI], [cdp_Developer], [cdp_Integration]';
END;

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
    @ConfirmedByUserID uniqueidentifier = NULL,
    @IPCountry_Clear bit = 0,
    @IPCountry char(2) = NULL,
    @CardIssuingCountry_Clear bit = 0,
    @CardIssuingCountry char(2) = NULL,
    @InitialPaymentReceivedDate_Clear bit = 0,
    @InitialPaymentReceivedDate date = NULL,
    @EngagementLeadUserID_Clear bit = 0,
    @EngagementLeadUserID uniqueidentifier = NULL
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
                [EngagementLeadUserID]
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
                CASE WHEN @EngagementLeadUserID_Clear = 1 THEN NULL ELSE ISNULL(@EngagementLeadUserID, NULL) END
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
                [EngagementLeadUserID]
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
                CASE WHEN @EngagementLeadUserID_Clear = 1 THEN NULL ELSE ISNULL(@EngagementLeadUserID, NULL) END
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwOrderHeaders] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
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
    @EngagementLeadUserID_Clear bit = 0,
    @EngagementLeadUserID uniqueidentifier = NULL
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
        [EngagementLeadUserID] = CASE WHEN @EngagementLeadUserID_Clear = 1 THEN NULL ELSE ISNULL(@EngagementLeadUserID, [EngagementLeadUserID]) END
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
    mjBizAppsOrdersProductPrice_ProductPriceID.[Name] AS [ProductPrice],
    mjBizAppsCommonOrganization_ShipToOrganizationID.[Name] AS [ShipToOrganization],
    mjBizAppsCommonPerson_ShipToPersonID.[DisplayName] AS [ShipToPerson],
    mjBizAppsOrdersProduct_SourceBundleProductID.[Name] AS [SourceBundleProduct],
    mjBizAppsOrdersSubscription_SubscriptionID.[SubscriptionNumber] AS [Subscription],
    mjBizAppsAccountingJournalEntry_JournalEntryID.[EntryNumber] AS [JournalEntry],
    mjBizAppsAccountingDimension_DimensionID.[Name] AS [Dimension],
    mjBizAppsAccountingDimensionValue_DimensionValueID.[Name] AS [DimensionValue],
    hier_ParentOrderLineID.RootID AS [RootParentOrderLineID],
    hier_ParentOrderLineID.Depth AS [ParentOrderLineIDDepth],
    hier_ParentOrderLineID.Path AS [ParentOrderLineIDPath],
    hier_ParentOrderLineID.IsLeaf AS [ParentOrderLineIDIsLeaf],
    hier_ParentOrderLineID.ChildCount AS [ParentOrderLineIDChildCount],
    mjBizAppsCommonAddress_ShipToAddressID.[DisplayName] AS [ShipToAddress]
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
    [${flyway:defaultSchema}].[ProductPrice] AS mjBizAppsOrdersProductPrice_ProductPriceID
  ON
    [o].[ProductPriceID] = mjBizAppsOrdersProductPrice_ProductPriceID.[ID]
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
LEFT OUTER JOIN
    [${mjSchema}_BizAppsAccounting].[Dimension] AS mjBizAppsAccountingDimension_DimensionID
  ON
    [o].[DimensionID] = mjBizAppsAccountingDimension_DimensionID.[ID]
LEFT OUTER JOIN
    [${mjSchema}_BizAppsAccounting].[DimensionValue] AS mjBizAppsAccountingDimensionValue_DimensionValueID
  ON
    [o].[DimensionValueID] = mjBizAppsAccountingDimensionValue_DimensionValueID.[ID]
OUTER APPLY
    [${flyway:defaultSchema}].[fnOrderLineParentOrderLineID_GetHierarchyMeta]([o].[ID], [o].[ParentOrderLineID]) AS hier_ParentOrderLineID
LEFT OUTER JOIN
    [${mjSchema}_BizAppsCommon].[Address] AS mjBizAppsCommonAddress_ShipToAddressID
  ON
    [o].[ShipToAddressID] = mjBizAppsCommonAddress_ShipToAddressID.[ID]
GO
REVOKE SELECT ON [${flyway:defaultSchema}].[vwOrderLines] FROM [cdp_Developer]
REVOKE SELECT ON [${flyway:defaultSchema}].[vwOrderLines] FROM [cdp_Integration]
REVOKE SELECT ON [${flyway:defaultSchema}].[vwOrderLines] FROM [cdp_UI]
GRANT SELECT ON [${flyway:defaultSchema}].[vwOrderLines] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

EXEC sp_refreshview '${flyway:defaultSchema}.vwOrderLines';
GO
