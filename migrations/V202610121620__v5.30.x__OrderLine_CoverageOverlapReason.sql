-- =============================================================================
-- V202610121620 — OrderLine.CoverageOverlapReason: why a line runs alongside
-- existing coverage (bizapps-orders#511)
-- =============================================================================
-- A line that sets AcknowledgesCoverageOverlap books a second band of a
-- subscription family over coverage the holder already has, and both are
-- billed. The flag records that the rep was told, not why the overlap is
-- intended. This column holds that reason.
--
-- NULLABLE, NO CHECK CONSTRAINT. The reason is required only when the line
-- confirms with the acknowledgment set, and a draft line may be saved with the
-- box ticked before the reason is typed. Confirm refuses an acknowledged line
-- whose reason is blank; a constraint here would refuse those drafts and would
-- fail on lines acknowledged before this column existed.
-- =============================================================================

ALTER TABLE [${flyway:defaultSchema}].[OrderLine]
    ADD [CoverageOverlapReason] NVARCHAR(1000) NULL;
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Why this line is meant to run alongside coverage the holder already has for another band of the same subscription family. Confirm refuses a line with AcknowledgesCoverageOverlap set when this is blank, and the nightly overlap review shows it beside the acknowledged pair.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'OrderLine',
    @level2type = N'COLUMN', @level2name = N'CoverageOverlapReason';
GO


















































-- =============================================================================
--
--   CODEGEN OUTPUT — GENERATED CODE BELOW THIS LINE (do not hand-edit)
--
--   Produced by MJ CodeGen 6.1.5 for the combined PR (bizapps-orders#645) against a
--   database built from its migrations, with the hand-authored DDL above applied.
--   Contains the CoverageOverlapReason field registration on Order Lines and its
--   IS-A child Event Order Lines, the rebuilt views, CRUD procs and grants for those
--   two (they now carry ExtendedAmount, which V202610121300 added), their FK indexes
--   and hierarchy functions, and Order Lines' validators.
--
--   Left out: validators the run regenerated for other entities; they are not this
--   change's.
--
-- =============================================================================


/* SQL text to insert 1 new entity field(s) */

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = 'f5c3c890-e755-4f2b-9c0d-1364abba7b38' OR (EntityID = '66D82C24-9C9F-4CD6-B019-53C20274AB00' AND Name = 'CoverageOverlapReason')) BEGIN
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
            'f5c3c890-e755-4f2b-9c0d-1364abba7b38',
            '66D82C24-9C9F-4CD6-B019-53C20274AB00', -- Entity: MJ_BizApps_Orders: Order Lines
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${mjSchema}].[EntityField] WHERE [EntityID] = '66D82C24-9C9F-4CD6-B019-53C20274AB00'),
            'CoverageOverlapReason',
            'Coverage Overlap Reason',
            'Why this line is meant to run alongside coverage the holder already has for another band of the same subscription family. Confirm refuses a line with AcknowledgesCoverageOverlap set when this is blank, and the nightly overlap review shows it beside the acknowledged pair.',
            'nvarchar',
            2000,
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

/* Create IS-A parent field CoverageOverlapReason on MJ_BizApps_Orders: Event Order Lines */
INSERT INTO [${mjSchema}].[EntityField] (
                  [ID], [EntityID], [Name], [Type], [AllowsNull],
                  [Length], [Precision], [Scale],
                  [Sequence], [IsVirtual], [AllowUpdateAPI],
                  [IsPrimaryKey], [IsUnique],
                  [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES (
                  '5917f1c9-292e-4718-8e8f-ddbabd89bdb9', '90A1060F-35D6-44A7-9076-A9053BBF60E6', 'CoverageOverlapReason',
                  'nvarchar', 1,
                  2000, 0, 0,
                  (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${mjSchema}].[EntityField] WHERE [EntityID] = '90A1060F-35D6-44A7-9076-A9053BBF60E6'), 1, 1, 0, 0,
                  GETUTCDATE(), GETUTCDATE());

/* Update entity timestamp for MJ_BizApps_Orders: Event Order Lines after IS-A field sync */
UPDATE [${mjSchema}].[Entity] SET [__mj_UpdatedAt]=GETUTCDATE() WHERE ID='90A1060F-35D6-44A7-9076-A9053BBF60E6';

/* SQL text to update display name for field CoverageOverlapReason */
UPDATE [${mjSchema}].[EntityField] SET [__mj_UpdatedAt]=GETUTCDATE(), DisplayName = 'Coverage Overlap Reason' WHERE ID = '5917F1C9-292E-4718-8E8F-DDBABD89BDB9';

/* Base View SQL for MJ_BizApps_Orders: Event Order Lines */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Event Order Lines
-- Item: vwEventOrderLines
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ_BizApps_Orders: Event Order Lines
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  EventOrderLine
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwEventOrderLines]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwEventOrderLines];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwEventOrderLines]
AS
SELECT
    e.*,
    ${mjSchema}_isa_p1.[OrderHeaderID],
    ${mjSchema}_isa_p1.[ProductID],
    ${mjSchema}_isa_p1.[CompanyID],
    ${mjSchema}_isa_p1.[LineNumber],
    ${mjSchema}_isa_p1.[Quantity],
    ${mjSchema}_isa_p1.[UnitPrice],
    ${mjSchema}_isa_p1.[ProductPriceID],
    ${mjSchema}_isa_p1.[DiscountPct],
    ${mjSchema}_isa_p1.[DiscountAmount],
    ${mjSchema}_isa_p1.[LineTotalNet],
    ${mjSchema}_isa_p1.[ChargeAmount],
    ${mjSchema}_isa_p1.[LineTax],
    ${mjSchema}_isa_p1.[LineTotalGross],
    ${mjSchema}_isa_p1.[ShipToAddressID],
    ${mjSchema}_isa_p1.[ShipToOrganizationID],
    ${mjSchema}_isa_p1.[ShipToPersonID],
    ${mjSchema}_isa_p1.[RenewsSubscriptionID],
    ${mjSchema}_isa_p1.[ServicePeriodStart],
    ${mjSchema}_isa_p1.[ServicePeriodEnd],
    ${mjSchema}_isa_p1.[FulfillmentStatus],
    ${mjSchema}_isa_p1.[ReversesOrderLineID],
    ${mjSchema}_isa_p1.[SourceBundleProductID],
    ${mjSchema}_isa_p1.[ParentOrderLineID],
    ${mjSchema}_isa_p1.[IsRollupParent],
    ${mjSchema}_isa_p1.[IsQuantityOverridden],
    ${mjSchema}_isa_p1.[SubscriptionID],
    ${mjSchema}_isa_p1.[Description],
    ${mjSchema}_isa_p1.[JournalEntryID],
    ${mjSchema}_isa_p1.[PriceOverridden],
    ${mjSchema}_isa_p1.[PriceOverrideReason],
    ${mjSchema}_isa_p1.[DimensionID],
    ${mjSchema}_isa_p1.[DimensionValueID],
    ${mjSchema}_isa_p1.[BilledToDate],
    ${mjSchema}_isa_p1.[RecognizedToDate],
    ${mjSchema}_isa_p1.[ShipToAddressSnapshot],
    ${mjSchema}_isa_p1.[SubscriptionAction],
    ${mjSchema}_isa_p1.[AcknowledgesCoverageOverlap],
    ${mjSchema}_isa_p1.[ExtendedAmount],
    ${mjSchema}_isa_p1.[CoverageOverlapReason],
    mjBizAppsCommonPerson_PersonID.[DisplayName] AS [Person]
FROM
    [${flyway:defaultSchema}].[EventOrderLine] AS e
INNER JOIN
    [${flyway:defaultSchema}].[OrderLine] AS ${mjSchema}_isa_p1
  ON
    [e].[ID] = ${mjSchema}_isa_p1.[ID]
INNER JOIN
    [${mjSchema}_BizAppsCommon].[Person] AS mjBizAppsCommonPerson_PersonID
  ON
    [e].[PersonID] = mjBizAppsCommonPerson_PersonID.[ID]
GO
REVOKE SELECT ON [${flyway:defaultSchema}].[vwEventOrderLines] FROM [cdp_Developer]
REVOKE SELECT ON [${flyway:defaultSchema}].[vwEventOrderLines] FROM [cdp_Integration]
REVOKE SELECT ON [${flyway:defaultSchema}].[vwEventOrderLines] FROM [cdp_UI]
GRANT SELECT ON [${flyway:defaultSchema}].[vwEventOrderLines] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for MJ_BizApps_Orders: Event Order Lines */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Event Order Lines
-- Item: Permissions for vwEventOrderLines
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

REVOKE SELECT ON [${flyway:defaultSchema}].[vwEventOrderLines] FROM [cdp_Developer]
REVOKE SELECT ON [${flyway:defaultSchema}].[vwEventOrderLines] FROM [cdp_Integration]
REVOKE SELECT ON [${flyway:defaultSchema}].[vwEventOrderLines] FROM [cdp_UI]
GRANT SELECT ON [${flyway:defaultSchema}].[vwEventOrderLines] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for MJ_BizApps_Orders: Event Order Lines */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Event Order Lines
-- Item: spCreateEventOrderLine
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR EventOrderLine
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateEventOrderLine]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateEventOrderLine];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateEventOrderLine]
    @ID uniqueidentifier = NULL,
    @CheckInAt_Clear bit = 0,
    @CheckInAt datetimeoffset = NULL,
    @PersonID uniqueidentifier,
    @DietaryPreferences_Clear bit = 0,
    @DietaryPreferences nvarchar(500) = NULL,
    @Allergies_Clear bit = 0,
    @Allergies nvarchar(500) = NULL,
    @Comments_Clear bit = 0,
    @Comments nvarchar(2000) = NULL,
    @AttendanceStatus nvarchar(20) = NULL,
    @BadgePrintedAt_Clear bit = 0,
    @BadgePrintedAt datetimeoffset = NULL,
    @BadgeName_Clear bit = 0,
    @BadgeName nvarchar(200) = NULL,
    @BadgeCompany_Clear bit = 0,
    @BadgeCompany nvarchar(200) = NULL,
    @BadgeTitle_Clear bit = 0,
    @BadgeTitle nvarchar(200) = NULL,
    @TicketTier_Clear bit = 0,
    @TicketTier nvarchar(50) = NULL,
    @TableAssignment_Clear bit = 0,
    @TableAssignment nvarchar(100) = NULL,
    @SpecialRequests_Clear bit = 0,
    @SpecialRequests nvarchar(2000) = NULL,
    @CheckInNotes_Clear bit = 0,
    @CheckInNotes nvarchar(2000) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @ActualID UNIQUEIDENTIFIER = ISNULL(@ID, NEWID())
    INSERT INTO
    [${flyway:defaultSchema}].[EventOrderLine]
        (
            [CheckInAt],
                [PersonID],
                [DietaryPreferences],
                [Allergies],
                [Comments],
                [AttendanceStatus],
                [BadgePrintedAt],
                [BadgeName],
                [BadgeCompany],
                [BadgeTitle],
                [TicketTier],
                [TableAssignment],
                [SpecialRequests],
                [CheckInNotes],
                [ID]
        )
    VALUES
        (
            CASE WHEN @CheckInAt_Clear = 1 THEN NULL ELSE ISNULL(@CheckInAt, NULL) END,
                @PersonID,
                CASE WHEN @DietaryPreferences_Clear = 1 THEN NULL ELSE ISNULL(@DietaryPreferences, NULL) END,
                CASE WHEN @Allergies_Clear = 1 THEN NULL ELSE ISNULL(@Allergies, NULL) END,
                CASE WHEN @Comments_Clear = 1 THEN NULL ELSE ISNULL(@Comments, NULL) END,
                ISNULL(@AttendanceStatus, 'Registered'),
                CASE WHEN @BadgePrintedAt_Clear = 1 THEN NULL ELSE ISNULL(@BadgePrintedAt, NULL) END,
                CASE WHEN @BadgeName_Clear = 1 THEN NULL ELSE ISNULL(@BadgeName, NULL) END,
                CASE WHEN @BadgeCompany_Clear = 1 THEN NULL ELSE ISNULL(@BadgeCompany, NULL) END,
                CASE WHEN @BadgeTitle_Clear = 1 THEN NULL ELSE ISNULL(@BadgeTitle, NULL) END,
                CASE WHEN @TicketTier_Clear = 1 THEN NULL ELSE ISNULL(@TicketTier, NULL) END,
                CASE WHEN @TableAssignment_Clear = 1 THEN NULL ELSE ISNULL(@TableAssignment, NULL) END,
                CASE WHEN @SpecialRequests_Clear = 1 THEN NULL ELSE ISNULL(@SpecialRequests, NULL) END,
                CASE WHEN @CheckInNotes_Clear = 1 THEN NULL ELSE ISNULL(@CheckInNotes, NULL) END,
                @ActualID
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwEventOrderLines] WHERE [ID] = @ActualID
END
GO
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreateEventOrderLine] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreateEventOrderLine] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateEventOrderLine] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ_BizApps_Orders: Event Order Lines */

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreateEventOrderLine] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreateEventOrderLine] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateEventOrderLine] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for MJ_BizApps_Orders: Event Order Lines */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Event Order Lines
-- Item: spUpdateEventOrderLine
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR EventOrderLine
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateEventOrderLine]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateEventOrderLine];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateEventOrderLine]
    @ID uniqueidentifier,
    @CheckInAt_Clear bit = 0,
    @CheckInAt datetimeoffset = NULL,
    @PersonID uniqueidentifier = NULL,
    @DietaryPreferences_Clear bit = 0,
    @DietaryPreferences nvarchar(500) = NULL,
    @Allergies_Clear bit = 0,
    @Allergies nvarchar(500) = NULL,
    @Comments_Clear bit = 0,
    @Comments nvarchar(2000) = NULL,
    @AttendanceStatus nvarchar(20) = NULL,
    @BadgePrintedAt_Clear bit = 0,
    @BadgePrintedAt datetimeoffset = NULL,
    @BadgeName_Clear bit = 0,
    @BadgeName nvarchar(200) = NULL,
    @BadgeCompany_Clear bit = 0,
    @BadgeCompany nvarchar(200) = NULL,
    @BadgeTitle_Clear bit = 0,
    @BadgeTitle nvarchar(200) = NULL,
    @TicketTier_Clear bit = 0,
    @TicketTier nvarchar(50) = NULL,
    @TableAssignment_Clear bit = 0,
    @TableAssignment nvarchar(100) = NULL,
    @SpecialRequests_Clear bit = 0,
    @SpecialRequests nvarchar(2000) = NULL,
    @CheckInNotes_Clear bit = 0,
    @CheckInNotes nvarchar(2000) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[EventOrderLine]
    SET
        [CheckInAt] = CASE WHEN @CheckInAt_Clear = 1 THEN NULL ELSE ISNULL(@CheckInAt, [CheckInAt]) END,
        [PersonID] = ISNULL(@PersonID, [PersonID]),
        [DietaryPreferences] = CASE WHEN @DietaryPreferences_Clear = 1 THEN NULL ELSE ISNULL(@DietaryPreferences, [DietaryPreferences]) END,
        [Allergies] = CASE WHEN @Allergies_Clear = 1 THEN NULL ELSE ISNULL(@Allergies, [Allergies]) END,
        [Comments] = CASE WHEN @Comments_Clear = 1 THEN NULL ELSE ISNULL(@Comments, [Comments]) END,
        [AttendanceStatus] = ISNULL(@AttendanceStatus, [AttendanceStatus]),
        [BadgePrintedAt] = CASE WHEN @BadgePrintedAt_Clear = 1 THEN NULL ELSE ISNULL(@BadgePrintedAt, [BadgePrintedAt]) END,
        [BadgeName] = CASE WHEN @BadgeName_Clear = 1 THEN NULL ELSE ISNULL(@BadgeName, [BadgeName]) END,
        [BadgeCompany] = CASE WHEN @BadgeCompany_Clear = 1 THEN NULL ELSE ISNULL(@BadgeCompany, [BadgeCompany]) END,
        [BadgeTitle] = CASE WHEN @BadgeTitle_Clear = 1 THEN NULL ELSE ISNULL(@BadgeTitle, [BadgeTitle]) END,
        [TicketTier] = CASE WHEN @TicketTier_Clear = 1 THEN NULL ELSE ISNULL(@TicketTier, [TicketTier]) END,
        [TableAssignment] = CASE WHEN @TableAssignment_Clear = 1 THEN NULL ELSE ISNULL(@TableAssignment, [TableAssignment]) END,
        [SpecialRequests] = CASE WHEN @SpecialRequests_Clear = 1 THEN NULL ELSE ISNULL(@SpecialRequests, [SpecialRequests]) END,
        [CheckInNotes] = CASE WHEN @CheckInNotes_Clear = 1 THEN NULL ELSE ISNULL(@CheckInNotes, [CheckInNotes]) END
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwEventOrderLines] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwEventOrderLines]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spUpdateEventOrderLine] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spUpdateEventOrderLine] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateEventOrderLine] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the EventOrderLine table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateEventOrderLine]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateEventOrderLine];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateEventOrderLine
ON [${flyway:defaultSchema}].[EventOrderLine]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[EventOrderLine]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[EventOrderLine] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for MJ_BizApps_Orders: Event Order Lines */

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spUpdateEventOrderLine] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spUpdateEventOrderLine] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateEventOrderLine] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for MJ_BizApps_Orders: Event Order Lines */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Event Order Lines
-- Item: spDeleteEventOrderLine
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR EventOrderLine
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteEventOrderLine]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteEventOrderLine];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteEventOrderLine]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[EventOrderLine]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteEventOrderLine] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteEventOrderLine] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteEventOrderLine] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for MJ_BizApps_Orders: Event Order Lines */

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteEventOrderLine] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteEventOrderLine] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteEventOrderLine] TO [cdp_Developer], [cdp_Integration];

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

-- Index for foreign key ShipToAddressID in table OrderLine
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_OrderLine_ShipToAddressID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[OrderLine]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_OrderLine_ShipToAddressID ON [${flyway:defaultSchema}].[OrderLine] ([ShipToAddressID]);

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

-- Index for foreign key DimensionID in table OrderLine
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_OrderLine_DimensionID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[OrderLine]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_OrderLine_DimensionID ON [${flyway:defaultSchema}].[OrderLine] ([DimensionID]);

-- Index for foreign key DimensionValueID in table OrderLine
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_OrderLine_DimensionValueID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[OrderLine]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_OrderLine_DimensionValueID ON [${flyway:defaultSchema}].[OrderLine] ([DimensionValueID]);

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
GO
REVOKE SELECT ON [${flyway:defaultSchema}].[vwOrderLines] FROM [cdp_Developer]
REVOKE SELECT ON [${flyway:defaultSchema}].[vwOrderLines] FROM [cdp_Integration]
REVOKE SELECT ON [${flyway:defaultSchema}].[vwOrderLines] FROM [cdp_UI]
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

REVOKE SELECT ON [${flyway:defaultSchema}].[vwOrderLines] FROM [cdp_Developer]
REVOKE SELECT ON [${flyway:defaultSchema}].[vwOrderLines] FROM [cdp_Integration]
REVOKE SELECT ON [${flyway:defaultSchema}].[vwOrderLines] FROM [cdp_UI]
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
    @JournalEntryID uniqueidentifier = NULL,
    @PriceOverridden bit = NULL,
    @PriceOverrideReason_Clear bit = 0,
    @PriceOverrideReason nvarchar(MAX) = NULL,
    @DimensionID_Clear bit = 0,
    @DimensionID uniqueidentifier = NULL,
    @DimensionValueID_Clear bit = 0,
    @DimensionValueID uniqueidentifier = NULL,
    @BilledToDate decimal(18, 2) = NULL,
    @RecognizedToDate decimal(18, 2) = NULL,
    @ShipToAddressSnapshot_Clear bit = 0,
    @ShipToAddressSnapshot nvarchar(MAX) = NULL,
    @SubscriptionAction_Clear bit = 0,
    @SubscriptionAction nvarchar(20) = NULL,
    @AcknowledgesCoverageOverlap bit = NULL,
    @ExtendedAmount_Clear bit = 0,
    @ExtendedAmount decimal(18, 2) = NULL,
    @CoverageOverlapReason_Clear bit = 0,
    @CoverageOverlapReason nvarchar(1000) = NULL
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
                [JournalEntryID],
                [PriceOverridden],
                [PriceOverrideReason],
                [DimensionID],
                [DimensionValueID],
                [BilledToDate],
                [RecognizedToDate],
                [ShipToAddressSnapshot],
                [SubscriptionAction],
                [AcknowledgesCoverageOverlap],
                [ExtendedAmount],
                [CoverageOverlapReason]
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
                CASE WHEN @JournalEntryID_Clear = 1 THEN NULL ELSE ISNULL(@JournalEntryID, NULL) END,
                ISNULL(@PriceOverridden, 0),
                CASE WHEN @PriceOverrideReason_Clear = 1 THEN NULL ELSE ISNULL(@PriceOverrideReason, NULL) END,
                CASE WHEN @DimensionID_Clear = 1 THEN NULL ELSE ISNULL(@DimensionID, NULL) END,
                CASE WHEN @DimensionValueID_Clear = 1 THEN NULL ELSE ISNULL(@DimensionValueID, NULL) END,
                ISNULL(@BilledToDate, 0),
                ISNULL(@RecognizedToDate, 0),
                CASE WHEN @ShipToAddressSnapshot_Clear = 1 THEN NULL ELSE ISNULL(@ShipToAddressSnapshot, NULL) END,
                CASE WHEN @SubscriptionAction_Clear = 1 THEN NULL ELSE ISNULL(@SubscriptionAction, NULL) END,
                ISNULL(@AcknowledgesCoverageOverlap, 0),
                CASE WHEN @ExtendedAmount_Clear = 1 THEN NULL ELSE ISNULL(@ExtendedAmount, NULL) END,
                CASE WHEN @CoverageOverlapReason_Clear = 1 THEN NULL ELSE ISNULL(@CoverageOverlapReason, NULL) END
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
                [JournalEntryID],
                [PriceOverridden],
                [PriceOverrideReason],
                [DimensionID],
                [DimensionValueID],
                [BilledToDate],
                [RecognizedToDate],
                [ShipToAddressSnapshot],
                [SubscriptionAction],
                [AcknowledgesCoverageOverlap],
                [ExtendedAmount],
                [CoverageOverlapReason]
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
                CASE WHEN @JournalEntryID_Clear = 1 THEN NULL ELSE ISNULL(@JournalEntryID, NULL) END,
                ISNULL(@PriceOverridden, 0),
                CASE WHEN @PriceOverrideReason_Clear = 1 THEN NULL ELSE ISNULL(@PriceOverrideReason, NULL) END,
                CASE WHEN @DimensionID_Clear = 1 THEN NULL ELSE ISNULL(@DimensionID, NULL) END,
                CASE WHEN @DimensionValueID_Clear = 1 THEN NULL ELSE ISNULL(@DimensionValueID, NULL) END,
                ISNULL(@BilledToDate, 0),
                ISNULL(@RecognizedToDate, 0),
                CASE WHEN @ShipToAddressSnapshot_Clear = 1 THEN NULL ELSE ISNULL(@ShipToAddressSnapshot, NULL) END,
                CASE WHEN @SubscriptionAction_Clear = 1 THEN NULL ELSE ISNULL(@SubscriptionAction, NULL) END,
                ISNULL(@AcknowledgesCoverageOverlap, 0),
                CASE WHEN @ExtendedAmount_Clear = 1 THEN NULL ELSE ISNULL(@ExtendedAmount, NULL) END,
                CASE WHEN @CoverageOverlapReason_Clear = 1 THEN NULL ELSE ISNULL(@CoverageOverlapReason, NULL) END
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwOrderLines] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreateOrderLine] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreateOrderLine] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateOrderLine] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ_BizApps_Orders: Order Lines */

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreateOrderLine] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreateOrderLine] FROM [cdp_Integration]
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
    @JournalEntryID uniqueidentifier = NULL,
    @PriceOverridden bit = NULL,
    @PriceOverrideReason_Clear bit = 0,
    @PriceOverrideReason nvarchar(MAX) = NULL,
    @DimensionID_Clear bit = 0,
    @DimensionID uniqueidentifier = NULL,
    @DimensionValueID_Clear bit = 0,
    @DimensionValueID uniqueidentifier = NULL,
    @BilledToDate decimal(18, 2) = NULL,
    @RecognizedToDate decimal(18, 2) = NULL,
    @ShipToAddressSnapshot_Clear bit = 0,
    @ShipToAddressSnapshot nvarchar(MAX) = NULL,
    @SubscriptionAction_Clear bit = 0,
    @SubscriptionAction nvarchar(20) = NULL,
    @AcknowledgesCoverageOverlap bit = NULL,
    @ExtendedAmount_Clear bit = 0,
    @ExtendedAmount decimal(18, 2) = NULL,
    @CoverageOverlapReason_Clear bit = 0,
    @CoverageOverlapReason nvarchar(1000) = NULL
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
        [JournalEntryID] = CASE WHEN @JournalEntryID_Clear = 1 THEN NULL ELSE ISNULL(@JournalEntryID, [JournalEntryID]) END,
        [PriceOverridden] = ISNULL(@PriceOverridden, [PriceOverridden]),
        [PriceOverrideReason] = CASE WHEN @PriceOverrideReason_Clear = 1 THEN NULL ELSE ISNULL(@PriceOverrideReason, [PriceOverrideReason]) END,
        [DimensionID] = CASE WHEN @DimensionID_Clear = 1 THEN NULL ELSE ISNULL(@DimensionID, [DimensionID]) END,
        [DimensionValueID] = CASE WHEN @DimensionValueID_Clear = 1 THEN NULL ELSE ISNULL(@DimensionValueID, [DimensionValueID]) END,
        [BilledToDate] = ISNULL(@BilledToDate, [BilledToDate]),
        [RecognizedToDate] = ISNULL(@RecognizedToDate, [RecognizedToDate]),
        [ShipToAddressSnapshot] = CASE WHEN @ShipToAddressSnapshot_Clear = 1 THEN NULL ELSE ISNULL(@ShipToAddressSnapshot, [ShipToAddressSnapshot]) END,
        [SubscriptionAction] = CASE WHEN @SubscriptionAction_Clear = 1 THEN NULL ELSE ISNULL(@SubscriptionAction, [SubscriptionAction]) END,
        [AcknowledgesCoverageOverlap] = ISNULL(@AcknowledgesCoverageOverlap, [AcknowledgesCoverageOverlap]),
        [ExtendedAmount] = CASE WHEN @ExtendedAmount_Clear = 1 THEN NULL ELSE ISNULL(@ExtendedAmount, [ExtendedAmount]) END,
        [CoverageOverlapReason] = CASE WHEN @CoverageOverlapReason_Clear = 1 THEN NULL ELSE ISNULL(@CoverageOverlapReason, [CoverageOverlapReason]) END
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

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spUpdateOrderLine] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spUpdateOrderLine] FROM [cdp_Integration]
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

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spUpdateOrderLine] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spUpdateOrderLine] FROM [cdp_Integration]
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
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteOrderLine] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteOrderLine] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteOrderLine] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for MJ_BizApps_Orders: Order Lines */

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteOrderLine] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteOrderLine] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteOrderLine] TO [cdp_Developer], [cdp_Integration];

/* Set categories for 6 fields */

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Order Lines.CoverageOverlapReason 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'Subscription Details',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'F5C3C890-E755-4F2B-9C0D-1364ABBA7B38';

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Order Lines.OrderHeader 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'Relationships',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '33E591FD-218D-4356-AAEB-9341AD2DA754';

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Order Lines.ProductPrice 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'Pricing and Financials',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '38724E0E-AD43-4EC1-B5E2-D3DBC608FBAD';

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Order Lines.Subscription 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'Subscription Details',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '64E21D0A-F38F-4E0C-8DBD-95CD5777CED5';

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Order Lines.Dimension 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'Pricing and Financials',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '1F242BC2-C395-47AB-BCCD-38B75F1A2349';

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Order Lines.DimensionValue 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'Pricing and Financials',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '27527F8B-B3F5-4C31-806F-EBDE5BB4E871';

/* Generated Validation Functions for MJ_BizApps_Orders: Order Lines */
-- CHECK constraint for MJ_BizApps_Orders: Order Lines @ Table Level was newly set or modified since the last generation of the validation function, the code was regenerated and updating the GeneratedCode table with the new generated validation function
IF NOT EXISTS (
      SELECT 1 FROM [${mjSchema}].[GeneratedCode] WHERE [CategoryID] = (SELECT [ID] FROM [${mjSchema}].[vwGeneratedCodeCategories] WHERE [Name]='CodeGen: Validators') AND [LinkedEntityID] = 'E0238F34-2837-EF11-86D4-6045BDEE16E6' AND [LinkedRecordPrimaryKey] = '66D82C24-9C9F-4CD6-B019-53C20274AB00'
   )
   BEGIN
      INSERT INTO [${mjSchema}].[GeneratedCode] ([ID], [CategoryID], [GeneratedByModelID], [GeneratedAt], [Language], [Status], [Source], [Code], [Description], [Name], [LinkedEntityID], [LinkedRecordPrimaryKey])
VALUES ('0b036b15-c27d-4e9f-91bc-246f03d72b43', (SELECT [ID] FROM [${mjSchema}].[vwGeneratedCodeCategories] WHERE [Name]='CodeGen: Validators'), 'C43229F6-4CC8-4838-9D04-03419A2DA191', GETUTCDATE(), 'TypeScript', 'Approved', '([DimensionID] IS NULL AND [DimensionValueID] IS NULL OR [DimensionID] IS NOT NULL AND [DimensionValueID] IS NOT NULL)', 'public ValidateDimensionIDAndDimensionValueID(result: ValidationResult) {
	const hasDimension = this.DimensionID != null;
	const hasDimensionValue = this.DimensionValueID != null;

	if ((hasDimension && !hasDimensionValue) || (!hasDimension && hasDimensionValue)) {
		result.Errors.push(new ValidationErrorInfo(
			"DimensionID",
			"Both Dimension and Dimension Value must be specified together, or both must be left empty.",
			this.DimensionID,
			ValidationErrorType.Failure
		));
	}
}', 'Dimension and Dimension Value must either both be provided or both be left empty.', 'ValidateDimensionIDAndDimensionValueID', 'E0238F34-2837-EF11-86D4-6045BDEE16E6', '66D82C24-9C9F-4CD6-B019-53C20274AB00')
   END;

-- CHECK constraint for MJ_BizApps_Orders: Order Lines @ Table Level was newly set or modified since the last generation of the validation function, the code was regenerated and updating the GeneratedCode table with the new generated validation function
IF NOT EXISTS (
      SELECT 1 FROM [${mjSchema}].[GeneratedCode] WHERE [CategoryID] = (SELECT [ID] FROM [${mjSchema}].[vwGeneratedCodeCategories] WHERE [Name]='CodeGen: Validators') AND [LinkedEntityID] = 'E0238F34-2837-EF11-86D4-6045BDEE16E6' AND [LinkedRecordPrimaryKey] = '66D82C24-9C9F-4CD6-B019-53C20274AB00'
   )
   BEGIN
      INSERT INTO [${mjSchema}].[GeneratedCode] ([ID], [CategoryID], [GeneratedByModelID], [GeneratedAt], [Language], [Status], [Source], [Code], [Description], [Name], [LinkedEntityID], [LinkedRecordPrimaryKey])
VALUES ('4ca0a3e1-c9ad-4e41-b318-41418507e363', (SELECT [ID] FROM [${mjSchema}].[vwGeneratedCodeCategories] WHERE [Name]='CodeGen: Validators'), 'C43229F6-4CC8-4838-9D04-03419A2DA191', GETUTCDATE(), 'TypeScript', 'Approved', '([IsRollupParent]=(0) OR [DiscountAmount]=(0) AND [ChargeAmount]=(0) AND [LineTax]=(0))', '	public ValidateRollupParentFinancialAmounts(result: ValidationResult) {
		if (this.IsRollupParent && (this.DiscountAmount !== 0 || this.ChargeAmount !== 0 || this.LineTax !== 0)) {
			result.Errors.push(new ValidationErrorInfo(
				"IsRollupParent",
				"Rollup parent order lines cannot have a discount amount, charge amount, or line tax.",
				this.IsRollupParent,
				ValidationErrorType.Failure
			));
		}
	}', 'Rollup parent order lines cannot have discount amounts, charge amounts, or line tax applied directly to them.', 'ValidateRollupParentFinancialAmounts', 'E0238F34-2837-EF11-86D4-6045BDEE16E6', '66D82C24-9C9F-4CD6-B019-53C20274AB00')
   END;


