-- =============================================================================
-- BizAppsOrders: EventOrderLine and EventProduct Operational Attributes
-- Expands EventProduct with EventFormat and VirtualMeetingUrl.
-- Expands EventOrderLine with AttendanceStatus, Badge tracking/overrides,
-- TicketTier, TableAssignment, SpecialRequests, and CheckInNotes.
-- =============================================================================

---------------------------------------------------------------------------
-- 1. Hand DDL: EventProduct Extensions
-- -------------------------------------------------------------------------
ALTER TABLE [${flyway:defaultSchema}].[EventProduct]
    ADD [EventFormat] NVARCHAR(20) NOT NULL CONSTRAINT [DF_EventProduct_EventFormat] DEFAULT 'In-Person',
        [VirtualMeetingUrl] NVARCHAR(1000) NULL;
GO

ALTER TABLE [${flyway:defaultSchema}].[EventProduct]
    ADD CONSTRAINT [CK_EventProduct_EventFormat]
        CHECK ([EventFormat] IN ('In-Person', 'Virtual', 'Hybrid'));
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Event delivery format: In-Person, Virtual, or Hybrid.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'EventProduct',
    @level2type = N'COLUMN', @level2name = N'EventFormat';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Meeting/broadcast URL for virtual or hybrid event sessions (Zoom, Teams, etc.).',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'EventProduct',
    @level2type = N'COLUMN', @level2name = N'VirtualMeetingUrl';
GO

---------------------------------------------------------------------------
-- 2. Hand DDL: EventOrderLine Extensions
-- -------------------------------------------------------------------------
ALTER TABLE [${flyway:defaultSchema}].[EventOrderLine]
    ADD [AttendanceStatus] NVARCHAR(20) NOT NULL CONSTRAINT [DF_EventOrderLine_AttendanceStatus] DEFAULT 'Registered',
        [BadgePrintedAt] DATETIMEOFFSET NULL,
        [BadgeName] NVARCHAR(200) NULL,
        [BadgeCompany] NVARCHAR(200) NULL,
        [BadgeTitle] NVARCHAR(200) NULL,
        [TicketTier] NVARCHAR(50) NULL,
        [TableAssignment] NVARCHAR(100) NULL,
        [SpecialRequests] NVARCHAR(2000) NULL,
        [CheckInNotes] NVARCHAR(2000) NULL;
GO

ALTER TABLE [${flyway:defaultSchema}].[EventOrderLine]
    ADD CONSTRAINT [CK_EventOrderLine_AttendanceStatus]
        CHECK ([AttendanceStatus] IN ('Registered', 'Attended', 'No Show', 'Cancelled'));
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Attendee operational lifecycle status: Registered, Attended, No Show, or Cancelled.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'EventOrderLine',
    @level2type = N'COLUMN', @level2name = N'AttendanceStatus';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Timestamp when the attendee credential badge was printed at registration desk or kiosk.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'EventOrderLine',
    @level2type = N'COLUMN', @level2name = N'BadgePrintedAt';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Preferred attendee name override for badge printing (e.g. nickname or chosen name).',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'EventOrderLine',
    @level2type = N'COLUMN', @level2name = N'BadgeName';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Organization or company name to display on the badge if different from primary organization.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'EventOrderLine',
    @level2type = N'COLUMN', @level2name = N'BadgeCompany';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Job title to display on attendee credential badge.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'EventOrderLine',
    @level2type = N'COLUMN', @level2name = N'BadgeTitle';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Ticket or registration tier: General, VIP, Speaker, Sponsor, Exhibitor, Staff, Student.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'EventOrderLine',
    @level2type = N'COLUMN', @level2name = N'TicketTier';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Table or seating assignment for seated meals, banquets, or breakout tracks.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'EventOrderLine',
    @level2type = N'COLUMN', @level2name = N'TableAssignment';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Accessibility and accommodation requests (wheelchair seating, ASL interpretation, etc.).',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'EventOrderLine',
    @level2type = N'COLUMN', @level2name = N'SpecialRequests';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Staff notes taken during check-in or on-site event operations.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'EventOrderLine',
    @level2type = N'COLUMN', @level2name = N'CheckInNotes';
GO




















































-- =============================================================================
-- GENERATED BY MemberJunction CodeGen — DO NOT EDIT BY HAND
-- =============================================================================

---------------------------------------------------------------------------
-- 3. Base Views Rebuild
-- -------------------------------------------------------------------------
CREATE OR ALTER VIEW [${flyway:defaultSchema}].[vwEventProducts]
AS
SELECT
    e.*,
    __mj_isa_p1.[Name],
    __mj_isa_p1.[SKU],
    __mj_isa_p1.[ProductTypeID],
    __mj_isa_p1.[ProductCategoryID],
    __mj_isa_p1.[CompanyID],
    __mj_isa_p1.[Status],
    __mj_isa_p1.[SuccessorProductID],
    __mj_isa_p1.[AvailableFrom],
    __mj_isa_p1.[AvailableTo],
    __mj_isa_p1.[RevenueRecognitionTypeID],
    __mj_isa_p1.[StandaloneSellingPrice],
    __mj_isa_p1.[SubscriptionTypeID],
    __mj_isa_p1.[IsTaxable],
    __mj_isa_p1.[Description],
    __mj_isa_p1.[TaxCategory],
    __mj_isa_p1.[EntitlementGrantTiming],
    __mj_isa_p1.[EntitlementQuantityMode],
    __mj_isa_p1.[EntitlementValidityMode],
    __mj_isa_p1.[PricingDriverClass],
    __mj_isa_p1.[MaxQuantityPerLine],
    mjBizAppsCommonAddress_VenueAddressID.[Line1] AS [VenueAddress]
FROM
    [${flyway:defaultSchema}].[EventProduct] AS e
INNER JOIN
    [${flyway:defaultSchema}].[Product] AS __mj_isa_p1
  ON
    [e].[ID] = __mj_isa_p1.[ID]
LEFT OUTER JOIN
    [${mjSchema}_BizAppsCommon].[Address] AS mjBizAppsCommonAddress_VenueAddressID
  ON
    [e].[VenueAddressID] = mjBizAppsCommonAddress_VenueAddressID.[ID];
GO

CREATE OR ALTER VIEW [${flyway:defaultSchema}].[vwEventOrderLines]
AS
SELECT
    e.*,
    __mj_isa_p1.[OrderHeaderID],
    __mj_isa_p1.[ProductID],
    __mj_isa_p1.[CompanyID],
    __mj_isa_p1.[LineNumber],
    __mj_isa_p1.[Quantity],
    __mj_isa_p1.[UnitPrice],
    __mj_isa_p1.[ProductPriceID],
    __mj_isa_p1.[DiscountPct],
    __mj_isa_p1.[DiscountAmount],
    __mj_isa_p1.[LineTotalNet],
    __mj_isa_p1.[ChargeAmount],
    __mj_isa_p1.[LineTax],
    __mj_isa_p1.[LineTotalGross],
    __mj_isa_p1.[ShipToAddressID],
    __mj_isa_p1.[ShipToOrganizationID],
    __mj_isa_p1.[ShipToPersonID],
    __mj_isa_p1.[RenewsSubscriptionID],
    __mj_isa_p1.[ServicePeriodStart],
    __mj_isa_p1.[ServicePeriodEnd],
    __mj_isa_p1.[FulfillmentStatus],
    __mj_isa_p1.[ReversesOrderLineID],
    __mj_isa_p1.[SourceBundleProductID],
    __mj_isa_p1.[ParentOrderLineID],
    __mj_isa_p1.[IsRollupParent],
    __mj_isa_p1.[IsQuantityOverridden],
    __mj_isa_p1.[SubscriptionID],
    __mj_isa_p1.[Description],
    __mj_isa_p1.[JournalEntryID],
    __mj_isa_p1.[PriceOverridden],
    __mj_isa_p1.[PriceOverrideReason],
    __mj_isa_p1.[DimensionID],
    __mj_isa_p1.[DimensionValueID],
    mjBizAppsCommonPerson_PersonID.[DisplayName] AS [Person]
FROM
    [${flyway:defaultSchema}].[EventOrderLine] AS e
INNER JOIN
    [${flyway:defaultSchema}].[OrderLine] AS __mj_isa_p1
  ON
    [e].[ID] = __mj_isa_p1.[ID]
INNER JOIN
    [${mjSchema}_BizAppsCommon].[Person] AS mjBizAppsCommonPerson_PersonID
  ON
    [e].[PersonID] = mjBizAppsCommonPerson_PersonID.[ID];
GO

---------------------------------------------------------------------------
-- 4. Stored Procedures: EventProduct
-- -------------------------------------------------------------------------
CREATE OR ALTER PROCEDURE [${flyway:defaultSchema}].[spCreateEventProduct]
    @ID uniqueidentifier = NULL,
    @EventStartsAt datetimeoffset,
    @EventEndsAt_Clear bit = 0,
    @EventEndsAt datetimeoffset = NULL,
    @VenueName_Clear bit = 0,
    @VenueName nvarchar(300) = NULL,
    @VenueAddressID_Clear bit = 0,
    @VenueAddressID uniqueidentifier = NULL,
    @Capacity_Clear bit = 0,
    @Capacity int = NULL,
    @RequiresAttendeeInfo bit = NULL,
    @EventFormat nvarchar(20) = 'In-Person',
    @VirtualMeetingUrl_Clear bit = 0,
    @VirtualMeetingUrl nvarchar(1000) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @ActualID UNIQUEIDENTIFIER = ISNULL(@ID, NEWID());
    INSERT INTO [${flyway:defaultSchema}].[EventProduct]
        (
            [EventStartsAt],
            [EventEndsAt],
            [VenueName],
            [VenueAddressID],
            [Capacity],
            [RequiresAttendeeInfo],
            [EventFormat],
            [VirtualMeetingUrl],
            [ID]
        )
    VALUES
        (
            @EventStartsAt,
            CASE WHEN @EventEndsAt_Clear = 1 THEN NULL ELSE ISNULL(@EventEndsAt, NULL) END,
            CASE WHEN @VenueName_Clear = 1 THEN NULL ELSE ISNULL(@VenueName, NULL) END,
            CASE WHEN @VenueAddressID_Clear = 1 THEN NULL ELSE ISNULL(@VenueAddressID, NULL) END,
            CASE WHEN @Capacity_Clear = 1 THEN NULL ELSE ISNULL(@Capacity, NULL) END,
            ISNULL(@RequiresAttendeeInfo, 1),
            ISNULL(@EventFormat, 'In-Person'),
            CASE WHEN @VirtualMeetingUrl_Clear = 1 THEN NULL ELSE ISNULL(@VirtualMeetingUrl, NULL) END,
            @ActualID
        );
    SELECT * FROM [${flyway:defaultSchema}].[vwEventProducts] WHERE [ID] = @ActualID;
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateEventProduct] TO [cdp_Developer], [cdp_Integration];
GO

CREATE OR ALTER PROCEDURE [${flyway:defaultSchema}].[spUpdateEventProduct]
    @ID uniqueidentifier,
    @EventStartsAt datetimeoffset = NULL,
    @EventEndsAt_Clear bit = 0,
    @EventEndsAt datetimeoffset = NULL,
    @VenueName_Clear bit = 0,
    @VenueName nvarchar(300) = NULL,
    @VenueAddressID_Clear bit = 0,
    @VenueAddressID uniqueidentifier = NULL,
    @Capacity_Clear bit = 0,
    @Capacity int = NULL,
    @RequiresAttendeeInfo bit = NULL,
    @EventFormat nvarchar(20) = NULL,
    @VirtualMeetingUrl_Clear bit = 0,
    @VirtualMeetingUrl nvarchar(1000) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE [${flyway:defaultSchema}].[EventProduct]
    SET
        [EventStartsAt] = ISNULL(@EventStartsAt, [EventStartsAt]),
        [EventEndsAt] = CASE WHEN @EventEndsAt_Clear = 1 THEN NULL ELSE ISNULL(@EventEndsAt, [EventEndsAt]) END,
        [VenueName] = CASE WHEN @VenueName_Clear = 1 THEN NULL ELSE ISNULL(@VenueName, [VenueName]) END,
        [VenueAddressID] = CASE WHEN @VenueAddressID_Clear = 1 THEN NULL ELSE ISNULL(@VenueAddressID, [VenueAddressID]) END,
        [Capacity] = CASE WHEN @Capacity_Clear = 1 THEN NULL ELSE ISNULL(@Capacity, [Capacity]) END,
        [RequiresAttendeeInfo] = ISNULL(@RequiresAttendeeInfo, [RequiresAttendeeInfo]),
        [EventFormat] = ISNULL(@EventFormat, [EventFormat]),
        [VirtualMeetingUrl] = CASE WHEN @VirtualMeetingUrl_Clear = 1 THEN NULL ELSE ISNULL(@VirtualMeetingUrl, [VirtualMeetingUrl]) END
    WHERE [ID] = @ID;

    IF @@ROWCOUNT = 0
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwEventProducts] WHERE 1=0;
    ELSE
        SELECT * FROM [${flyway:defaultSchema}].[vwEventProducts] WHERE [ID] = @ID;
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateEventProduct] TO [cdp_Developer], [cdp_Integration];
GO

---------------------------------------------------------------------------
-- 5. Stored Procedures: EventOrderLine
-- -------------------------------------------------------------------------
CREATE OR ALTER PROCEDURE [${flyway:defaultSchema}].[spCreateEventOrderLine]
    @ID uniqueidentifier = NULL,
    @CheckInAt_Clear bit = 0,
    @CheckInAt datetimeoffset = NULL,
    @PersonID uniqueidentifier,
    @DietaryPreferences_Clear bit = 0,
    @DietaryPreferences nvarchar(1000) = NULL,
    @Allergies_Clear bit = 0,
    @Allergies nvarchar(1000) = NULL,
    @Comments_Clear bit = 0,
    @Comments nvarchar(4000) = NULL,
    @AttendanceStatus nvarchar(20) = 'Registered',
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
    DECLARE @ActualID UNIQUEIDENTIFIER = ISNULL(@ID, NEWID());
    INSERT INTO [${flyway:defaultSchema}].[EventOrderLine]
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
        );
    SELECT * FROM [${flyway:defaultSchema}].[vwEventOrderLines] WHERE [ID] = @ActualID;
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateEventOrderLine] TO [cdp_Developer], [cdp_Integration];
GO

CREATE OR ALTER PROCEDURE [${flyway:defaultSchema}].[spUpdateEventOrderLine]
    @ID uniqueidentifier,
    @CheckInAt_Clear bit = 0,
    @CheckInAt datetimeoffset = NULL,
    @PersonID uniqueidentifier = NULL,
    @DietaryPreferences_Clear bit = 0,
    @DietaryPreferences nvarchar(1000) = NULL,
    @Allergies_Clear bit = 0,
    @Allergies nvarchar(1000) = NULL,
    @Comments_Clear bit = 0,
    @Comments nvarchar(4000) = NULL,
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
    UPDATE [${flyway:defaultSchema}].[EventOrderLine]
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
    WHERE [ID] = @ID;

    IF @@ROWCOUNT = 0
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwEventOrderLines] WHERE 1=0;
    ELSE
        SELECT * FROM [${flyway:defaultSchema}].[vwEventOrderLines] WHERE [ID] = @ID;
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateEventOrderLine] TO [cdp_Developer], [cdp_Integration];
GO

---------------------------------------------------------------------------
-- 6. EntityField Metadata Inserts
-- -------------------------------------------------------------------------
-- EventProduct: EventFormat
IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE EntityID = 'B090A662-A97A-4748-B109-2FA716C14651' AND Name = 'EventFormat')
BEGIN
    INSERT INTO [${mjSchema}].[EntityField]
        ([ID], [EntityID], [Sequence], [Name], [DisplayName], [Description], [Type], [Length], [Precision], [Scale], [AllowsNull], [DefaultValue], [AutoIncrement], [IsPrimaryKey], [IsUnique], [IncludeInGeneratedForm], [ValueListType])
    VALUES
        ('7CE7EF27-614C-49E0-A853-B4D809DA8DA8', 'B090A662-A97A-4748-B109-2FA716C14651', (SELECT COALESCE(MAX([Sequence]), 0) FROM [${mjSchema}].[EntityField] WHERE [EntityID] = 'B090A662-A97A-4748-B109-2FA716C14651') + 1,
         'EventFormat', 'Event Format', 'Event delivery format: In-Person, Virtual, or Hybrid.', 'nvarchar', 20, 0, 0, 0, 'In-Person', 0, 0, 0, 1, 'List');
END
GO

-- EventProduct: VirtualMeetingUrl
IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE EntityID = 'B090A662-A97A-4748-B109-2FA716C14651' AND Name = 'VirtualMeetingUrl')
BEGIN
    INSERT INTO [${mjSchema}].[EntityField]
        ([ID], [EntityID], [Sequence], [Name], [DisplayName], [Description], [Type], [Length], [Precision], [Scale], [AllowsNull], [DefaultValue], [AutoIncrement], [IsPrimaryKey], [IsUnique], [IncludeInGeneratedForm], [ValueListType])
    VALUES
        ('ADCB7B7A-EE6B-46ED-B1A8-251DD1B75C9F', 'B090A662-A97A-4748-B109-2FA716C14651', (SELECT COALESCE(MAX([Sequence]), 0) FROM [${mjSchema}].[EntityField] WHERE [EntityID] = 'B090A662-A97A-4748-B109-2FA716C14651') + 1,
         'VirtualMeetingUrl', 'Virtual Meeting URL', 'Meeting/broadcast URL for virtual or hybrid event sessions.', 'nvarchar', 1000, 0, 0, 1, NULL, 0, 0, 0, 1, 'None');
END
GO

-- EventOrderLine: AttendanceStatus
IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE EntityID = '90A1060F-35D6-44A7-9076-A9053BBF60E6' AND Name = 'AttendanceStatus')
BEGIN
    INSERT INTO [${mjSchema}].[EntityField]
        ([ID], [EntityID], [Sequence], [Name], [DisplayName], [Description], [Type], [Length], [Precision], [Scale], [AllowsNull], [DefaultValue], [AutoIncrement], [IsPrimaryKey], [IsUnique], [IncludeInGeneratedForm], [ValueListType])
    VALUES
        ('5214C1CF-7583-469C-AA86-D1699063A784', '90A1060F-35D6-44A7-9076-A9053BBF60E6', (SELECT COALESCE(MAX([Sequence]), 0) FROM [${mjSchema}].[EntityField] WHERE [EntityID] = '90A1060F-35D6-44A7-9076-A9053BBF60E6') + 1,
         'AttendanceStatus', 'Attendance Status', 'Attendee operational lifecycle status: Registered, Attended, No Show, or Cancelled.', 'nvarchar', 20, 0, 0, 0, 'Registered', 0, 0, 0, 1, 'List');
END
GO

-- EventOrderLine: BadgePrintedAt
IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE EntityID = '90A1060F-35D6-44A7-9076-A9053BBF60E6' AND Name = 'BadgePrintedAt')
BEGIN
    INSERT INTO [${mjSchema}].[EntityField]
        ([ID], [EntityID], [Sequence], [Name], [DisplayName], [Description], [Type], [Length], [Precision], [Scale], [AllowsNull], [DefaultValue], [AutoIncrement], [IsPrimaryKey], [IsUnique], [IncludeInGeneratedForm], [ValueListType])
    VALUES
        ('C9D3AE18-4B44-4922-B9FE-FC0AE1CAD64F', '90A1060F-35D6-44A7-9076-A9053BBF60E6', (SELECT COALESCE(MAX([Sequence]), 0) FROM [${mjSchema}].[EntityField] WHERE [EntityID] = '90A1060F-35D6-44A7-9076-A9053BBF60E6') + 1,
         'BadgePrintedAt', 'Badge Printed At', 'Timestamp when attendee credential badge was printed.', 'datetimeoffset', 10, 0, 0, 1, NULL, 0, 0, 0, 1, 'None');
END
GO

-- EventOrderLine: BadgeName
IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE EntityID = '90A1060F-35D6-44A7-9076-A9053BBF60E6' AND Name = 'BadgeName')
BEGIN
    INSERT INTO [${mjSchema}].[EntityField]
        ([ID], [EntityID], [Sequence], [Name], [DisplayName], [Description], [Type], [Length], [Precision], [Scale], [AllowsNull], [DefaultValue], [AutoIncrement], [IsPrimaryKey], [IsUnique], [IncludeInGeneratedForm], [ValueListType])
    VALUES
        ('5FB43DE9-CF79-4EE7-B748-F6E9B4C955D6', '90A1060F-35D6-44A7-9076-A9053BBF60E6', (SELECT COALESCE(MAX([Sequence]), 0) FROM [${mjSchema}].[EntityField] WHERE [EntityID] = '90A1060F-35D6-44A7-9076-A9053BBF60E6') + 1,
         'BadgeName', 'Badge Name', 'Preferred attendee name override for badge printing.', 'nvarchar', 200, 0, 0, 1, NULL, 0, 0, 0, 1, 'None');
END
GO

-- EventOrderLine: BadgeCompany
IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE EntityID = '90A1060F-35D6-44A7-9076-A9053BBF60E6' AND Name = 'BadgeCompany')
BEGIN
    INSERT INTO [${mjSchema}].[EntityField]
        ([ID], [EntityID], [Sequence], [Name], [DisplayName], [Description], [Type], [Length], [Precision], [Scale], [AllowsNull], [DefaultValue], [AutoIncrement], [IsPrimaryKey], [IsUnique], [IncludeInGeneratedForm], [ValueListType])
    VALUES
        ('CF34C03B-6BA3-4E4B-BD78-3F543D61A1BD', '90A1060F-35D6-44A7-9076-A9053BBF60E6', (SELECT COALESCE(MAX([Sequence]), 0) FROM [${mjSchema}].[EntityField] WHERE [EntityID] = '90A1060F-35D6-44A7-9076-A9053BBF60E6') + 1,
         'BadgeCompany', 'Badge Company', 'Organization or company name to display on the badge.', 'nvarchar', 200, 0, 0, 1, NULL, 0, 0, 0, 1, 'None');
END
GO

-- EventOrderLine: BadgeTitle
IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE EntityID = '90A1060F-35D6-44A7-9076-A9053BBF60E6' AND Name = 'BadgeTitle')
BEGIN
    INSERT INTO [${mjSchema}].[EntityField]
        ([ID], [EntityID], [Sequence], [Name], [DisplayName], [Description], [Type], [Length], [Precision], [Scale], [AllowsNull], [DefaultValue], [AutoIncrement], [IsPrimaryKey], [IsUnique], [IncludeInGeneratedForm], [ValueListType])
    VALUES
        ('4CC43868-1C9C-4FB0-88FC-6D86EDF9F757', '90A1060F-35D6-44A7-9076-A9053BBF60E6', (SELECT COALESCE(MAX([Sequence]), 0) FROM [${mjSchema}].[EntityField] WHERE [EntityID] = '90A1060F-35D6-44A7-9076-A9053BBF60E6') + 1,
         'BadgeTitle', 'Badge Title', 'Job title to display on attendee credential badge.', 'nvarchar', 200, 0, 0, 1, NULL, 0, 0, 0, 1, 'None');
END
GO

-- EventOrderLine: TicketTier
IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE EntityID = '90A1060F-35D6-44A7-9076-A9053BBF60E6' AND Name = 'TicketTier')
BEGIN
    INSERT INTO [${mjSchema}].[EntityField]
        ([ID], [EntityID], [Sequence], [Name], [DisplayName], [Description], [Type], [Length], [Precision], [Scale], [AllowsNull], [DefaultValue], [AutoIncrement], [IsPrimaryKey], [IsUnique], [IncludeInGeneratedForm], [ValueListType])
    VALUES
        ('07C0E921-33B3-4E09-BA90-024EDBD735E9', '90A1060F-35D6-44A7-9076-A9053BBF60E6', (SELECT COALESCE(MAX([Sequence]), 0) FROM [${mjSchema}].[EntityField] WHERE [EntityID] = '90A1060F-35D6-44A7-9076-A9053BBF60E6') + 1,
         'TicketTier', 'Ticket Tier', 'Ticket or registration tier: General, VIP, Speaker, Sponsor, Exhibitor, Staff, Student.', 'nvarchar', 50, 0, 0, 1, NULL, 0, 0, 0, 1, 'None');
END
GO

-- EventOrderLine: TableAssignment
IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE EntityID = '90A1060F-35D6-44A7-9076-A9053BBF60E6' AND Name = 'TableAssignment')
BEGIN
    INSERT INTO [${mjSchema}].[EntityField]
        ([ID], [EntityID], [Sequence], [Name], [DisplayName], [Description], [Type], [Length], [Precision], [Scale], [AllowsNull], [DefaultValue], [AutoIncrement], [IsPrimaryKey], [IsUnique], [IncludeInGeneratedForm], [ValueListType])
    VALUES
        ('6BA040BB-AF6A-44D0-9E02-67F4EEE08C8B', '90A1060F-35D6-44A7-9076-A9053BBF60E6', (SELECT COALESCE(MAX([Sequence]), 0) FROM [${mjSchema}].[EntityField] WHERE [EntityID] = '90A1060F-35D6-44A7-9076-A9053BBF60E6') + 1,
         'TableAssignment', 'Table Assignment', 'Table or seating assignment for seated meals, banquets, or breakout tracks.', 'nvarchar', 100, 0, 0, 1, NULL, 0, 0, 0, 1, 'None');
END
GO

-- EventOrderLine: SpecialRequests
IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE EntityID = '90A1060F-35D6-44A7-9076-A9053BBF60E6' AND Name = 'SpecialRequests')
BEGIN
    INSERT INTO [${mjSchema}].[EntityField]
        ([ID], [EntityID], [Sequence], [Name], [DisplayName], [Description], [Type], [Length], [Precision], [Scale], [AllowsNull], [DefaultValue], [AutoIncrement], [IsPrimaryKey], [IsUnique], [IncludeInGeneratedForm], [ValueListType])
    VALUES
        ('41857F61-7B32-4818-A8BC-15550ED6175A', '90A1060F-35D6-44A7-9076-A9053BBF60E6', (SELECT COALESCE(MAX([Sequence]), 0) FROM [${mjSchema}].[EntityField] WHERE [EntityID] = '90A1060F-35D6-44A7-9076-A9053BBF60E6') + 1,
         'SpecialRequests', 'Special Requests', 'Accessibility and accommodation requests (wheelchair seating, ASL interpretation, etc.).', 'nvarchar', 2000, 0, 0, 1, NULL, 0, 0, 0, 1, 'None');
END
GO

-- EventOrderLine: CheckInNotes
IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE EntityID = '90A1060F-35D6-44A7-9076-A9053BBF60E6' AND Name = 'CheckInNotes')
BEGIN
    INSERT INTO [${mjSchema}].[EntityField]
        ([ID], [EntityID], [Sequence], [Name], [DisplayName], [Description], [Type], [Length], [Precision], [Scale], [AllowsNull], [DefaultValue], [AutoIncrement], [IsPrimaryKey], [IsUnique], [IncludeInGeneratedForm], [ValueListType])
    VALUES
        ('2DBF3F35-FC36-4DDD-B39E-E560770EAAF7', '90A1060F-35D6-44A7-9076-A9053BBF60E6', (SELECT COALESCE(MAX([Sequence]), 0) FROM [${mjSchema}].[EntityField] WHERE [EntityID] = '90A1060F-35D6-44A7-9076-A9053BBF60E6') + 1,
         'CheckInNotes', 'Check-In Notes', 'Staff notes taken during check-in or on-site event operations.', 'nvarchar', 2000, 0, 0, 1, NULL, 0, 0, 0, 1, 'None');
END
GO

---------------------------------------------------------------------------
-- 7. EntityFieldValue Metadata Inserts (Value Lists)
-- -------------------------------------------------------------------------
-- EventProduct.EventFormat values
IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityFieldValue] WHERE EntityFieldID = '7CE7EF27-614C-49E0-A853-B4D809DA8DA8' AND Value = 'In-Person')
    INSERT INTO [${mjSchema}].[EntityFieldValue] ([ID], [EntityFieldID], [Sequence], [Value], [Code])
    VALUES ('89A2C186-2F24-49FB-9B44-B0D393FC8D02', '7CE7EF27-614C-49E0-A853-B4D809DA8DA8', 1, 'In-Person', 'In-Person');

IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityFieldValue] WHERE EntityFieldID = '7CE7EF27-614C-49E0-A853-B4D809DA8DA8' AND Value = 'Virtual')
    INSERT INTO [${mjSchema}].[EntityFieldValue] ([ID], [EntityFieldID], [Sequence], [Value], [Code])
    VALUES ('E0C691D7-876D-463C-89F5-460BC533911B', '7CE7EF27-614C-49E0-A853-B4D809DA8DA8', 2, 'Virtual', 'Virtual');

IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityFieldValue] WHERE EntityFieldID = '7CE7EF27-614C-49E0-A853-B4D809DA8DA8' AND Value = 'Hybrid')
    INSERT INTO [${mjSchema}].[EntityFieldValue] ([ID], [EntityFieldID], [Sequence], [Value], [Code])
    VALUES ('9F13F050-8186-4E3E-8FF5-137439A028B7', '7CE7EF27-614C-49E0-A853-B4D809DA8DA8', 3, 'Hybrid', 'Hybrid');
GO

-- EventOrderLine.AttendanceStatus values
IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityFieldValue] WHERE EntityFieldID = '5214C1CF-7583-469C-AA86-D1699063A784' AND Value = 'Registered')
    INSERT INTO [${mjSchema}].[EntityFieldValue] ([ID], [EntityFieldID], [Sequence], [Value], [Code])
    VALUES ('4552341E-F7AD-4C47-BE41-AD38A1EDAA6D', '5214C1CF-7583-469C-AA86-D1699063A784', 1, 'Registered', 'Registered');

IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityFieldValue] WHERE EntityFieldID = '5214C1CF-7583-469C-AA86-D1699063A784' AND Value = 'Attended')
    INSERT INTO [${mjSchema}].[EntityFieldValue] ([ID], [EntityFieldID], [Sequence], [Value], [Code])
    VALUES (NEWID(), '5214C1CF-7583-469C-AA86-D1699063A784', 2, 'Attended', 'Attended');

IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityFieldValue] WHERE EntityFieldID = '5214C1CF-7583-469C-AA86-D1699063A784' AND Value = 'No Show')
    INSERT INTO [${mjSchema}].[EntityFieldValue] ([ID], [EntityFieldID], [Sequence], [Value], [Code])
    VALUES (NEWID(), '5214C1CF-7583-469C-AA86-D1699063A784', 3, 'No Show', 'No Show');

IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityFieldValue] WHERE EntityFieldID = '5214C1CF-7583-469C-AA86-D1699063A784' AND Value = 'Cancelled')
    INSERT INTO [${mjSchema}].[EntityFieldValue] ([ID], [EntityFieldID], [Sequence], [Value], [Code])
    VALUES (NEWID(), '5214C1CF-7583-469C-AA86-D1699063A784', 4, 'Cancelled', 'Cancelled');
GO
