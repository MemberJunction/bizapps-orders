-- =============================================================================
-- V202609230600 — Percentage-of-completion revenue recognition (W10)
-- (bc-aidp-next-golive#241 · orders PR #201 plan Part F · D90)
-- =============================================================================
-- The three shipped revenue-recognition types answer "given what we know at
-- booking, when is this earned?" and are evaluated once, inside the booking
-- transaction. Percentage-of-completion answers a different question — "given
-- what we now know about progress, how much should be earned TO DATE?" — and the
-- answer is not knowable at booking (plan §9.1). So it is not a fourth booking
-- driver. Instead:
--
--   1. RevenueRecognitionType.ScheduleBasis — 'AtBooking' (the three existing
--      types, by default, with no backfill) or 'OnMeasurement' (a POC type). A
--      POC line still books to Deferred Revenue, but stages NO forward-dated
--      release entries; the factory's release branch is gated on 'AtBooking'.
--   2. OrderLineProgressMeasurement — one row per attested observation: the
--      cumulative percent complete on a date, who signed it, and the recognition
--      entry the observation produced (plan §9.3). Orders.RecordProgress computes
--      the catch-up as target − recognised-to-date and posts the difference, so a
--      backward slide reverses through the same subtraction (§9.2).
--   3. A posted observation is immutable. Corrections happen forward: observe
--      again in the current period and let the catch-up absorb it.
--
-- Nothing here changes a non-POC line. ScheduleBasis defaults to 'AtBooking',
-- so every existing type takes exactly the path it took before.
--
-- The trigger early-returns on a zero-row statement — SQL Server fires AFTER
-- triggers for statements affecting no rows, CodeGen's __mj_UpdatedAt backfill
-- is one, and the guard keeps the migration's own transaction out of trouble
-- (copied from trg_OrderHeaderPaymentSchedule_RollupTotals).
--
-- Hand-written DDL here is PLAIN (orders PR #220 review): no existence guards,
-- no cursors, no table variables. Migrations run once, in order; the guards
-- buy nothing and the cursor shape breaks the PostgreSQL conversion.
--
-- CodeGen output for this app is folded below the banner at the end of this file.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. RevenueRecognitionType.ScheduleBasis
-- -----------------------------------------------------------------------------
ALTER TABLE [${flyway:defaultSchema}].[RevenueRecognitionType]
    ADD [ScheduleBasis] NVARCHAR(20) NOT NULL
        CONSTRAINT [DF_RevenueRecognitionType_ScheduleBasis] DEFAULT (N'AtBooking'),
    CONSTRAINT [CK_RevenueRecognitionType_ScheduleBasis]
        CHECK ([ScheduleBasis] IN (N'AtBooking', N'OnMeasurement'));
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'AtBooking: the driver computes the whole schedule at booking and every release entry is written forward-dated then. OnMeasurement: nothing is staged at booking; revenue is recognised by cumulative catch-up as progress observations are recorded (Orders.RecordProgress). A POC type is IsDeferred = 1 with OnMeasurement.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'RevenueRecognitionType',
    @level2type = N'COLUMN', @level2name = N'ScheduleBasis';
GO

-- -----------------------------------------------------------------------------
-- 2. OrderLineProgressMeasurement
-- -----------------------------------------------------------------------------
CREATE TABLE [${flyway:defaultSchema}].[OrderLineProgressMeasurement] (
    [ID]                     UNIQUEIDENTIFIER NOT NULL CONSTRAINT [DF_OrderLineProgressMeasurement_ID] DEFAULT (newsequentialid()),
    [OrderLineID]            UNIQUEIDENTIFIER NOT NULL,
    -- The period this observation governs. One observation per line per day.
    [MeasurementDate]        DATE             NOT NULL,
    -- CUMULATIVE, 0..1. The entry is the difference from what is already recognised.
    [PercentComplete]        DECIMAL(7,4)     NOT NULL,
    -- The ProgressRecognitionDriver key that produced the percent (ManualAttestation, ...).
    [MethodCode]             NVARCHAR(40)     NOT NULL,

    -- Quantitative inputs, kept for audit even though PercentComplete drives the entry.
    [MeasureNumerator]       DECIMAL(18,4)    NULL,
    [MeasureDenominator]     DECIMAL(18,4)    NULL,

    -- Provenance: who signed, and where a derived number came from.
    [AttestedByUserID]       UNIQUEIDENTIFIER NULL,
    [SourceEntityID]         UNIQUEIDENTIFIER NULL,
    [SourceRecordID]         NVARCHAR(400)    NULL,
    [Notes]                  NVARCHAR(MAX)    NULL,

    -- Result, stamped when the entry is written.
    [RecognizedToDateBefore] DECIMAL(18,2)    NULL,
    [RecognizedToDateAfter]  DECIMAL(18,2)    NULL,
    -- The delta. NEGATIVE on a backward slide; zero when the observation moved nothing.
    [RecognitionAmount]      DECIMAL(18,2)    NULL,
    -- Soft reference into accounting, like OrderLine.JournalEntryID. NULL when the delta was zero.
    [JournalEntryID]         UNIQUEIDENTIFIER NULL,
    [Status]                 NVARCHAR(20)     NOT NULL CONSTRAINT [DF_OrderLineProgressMeasurement_Status] DEFAULT (N'Draft'),

    CONSTRAINT [PK_OrderLineProgressMeasurement] PRIMARY KEY CLUSTERED ([ID]),
    CONSTRAINT [FK_OrderLineProgressMeasurement_OrderLine] FOREIGN KEY ([OrderLineID])
        REFERENCES [${flyway:defaultSchema}].[OrderLine]([ID]),
    CONSTRAINT [FK_OrderLineProgressMeasurement_AttestedByUser] FOREIGN KEY ([AttestedByUserID])
        REFERENCES [__mj].[User]([ID]),
    CONSTRAINT [FK_OrderLineProgressMeasurement_SourceEntity] FOREIGN KEY ([SourceEntityID])
        REFERENCES [__mj].[Entity]([ID]),
    CONSTRAINT [UQ_OLPM_Period] UNIQUE ([OrderLineID], [MeasurementDate]),
    CONSTRAINT [CK_OLPM_Percent] CHECK ([PercentComplete] >= 0 AND [PercentComplete] <= 1),
    CONSTRAINT [CK_OLPM_Status] CHECK ([Status] IN (N'Draft', N'Posted'))
);
GO

-- Descriptions: MS_Description is what CodeGen carries into EntityField.Description.
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'One attested progress observation on a percentage-of-completion order line (D90). PercentComplete is CUMULATIVE; Orders.RecordProgress posts the difference between the target it implies and what is already recognised, so a backward slide reverses through the same subtraction. A Posted row is immutable — corrections happen forward, in the next observation.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'OrderLineProgressMeasurement';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The percentage-of-completion order line this observation is about.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'OrderLineProgressMeasurement',
    @level2type = N'COLUMN', @level2name = N'OrderLineID';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The date this observation governs — the period it belongs to on the close calendar. One observation per line per date (UQ_OLPM_Period); it is also the recognition entry''s EffectiveDate.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'OrderLineProgressMeasurement',
    @level2type = N'COLUMN', @level2name = N'MeasurementDate';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'CUMULATIVE fraction earned to date, 0..1. Not the increment: the entry is target (LineTotalNet × PercentComplete) minus what is already recognised.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'OrderLineProgressMeasurement',
    @level2type = N'COLUMN', @level2name = N'PercentComplete';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The ProgressRecognitionDriver that produced the percent — ManualAttestation is the one that ships. Whatever the method, a named person signs the observation and the attestation is what posts.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'OrderLineProgressMeasurement',
    @level2type = N'COLUMN', @level2name = N'MethodCode';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Optional quantitative input behind the percent (cost incurred, units delivered), kept for audit. PercentComplete drives the entry regardless.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'OrderLineProgressMeasurement',
    @level2type = N'COLUMN', @level2name = N'MeasureNumerator';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Optional quantitative denominator behind the percent (estimated total cost, total units), kept for audit.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'OrderLineProgressMeasurement',
    @level2type = N'COLUMN', @level2name = N'MeasureDenominator';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Who signed this observation. Every recognition entry names the observation and the person who signed it.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'OrderLineProgressMeasurement',
    @level2type = N'COLUMN', @level2name = N'AttestedByUserID';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Where a derived number came from, when it was derived (entity). NULL for a plain attestation.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'OrderLineProgressMeasurement',
    @level2type = N'COLUMN', @level2name = N'SourceEntityID';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Where a derived number came from, when it was derived (record). NULL for a plain attestation.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'OrderLineProgressMeasurement',
    @level2type = N'COLUMN', @level2name = N'SourceRecordID';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Free text from the signer.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'OrderLineProgressMeasurement',
    @level2type = N'COLUMN', @level2name = N'Notes';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Revenue recognised on the line before this observation posted. Materialised for the audit chain; agrees with the sum of posted recognition entries for the line.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'OrderLineProgressMeasurement',
    @level2type = N'COLUMN', @level2name = N'RecognizedToDateBefore';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Revenue recognised on the line after this observation posted: LineTotalNet × PercentComplete, rounded to the cent. At 100% it is the line amount exactly.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'OrderLineProgressMeasurement',
    @level2type = N'COLUMN', @level2name = N'RecognizedToDateAfter';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The delta this observation posted: After − Before. NEGATIVE on a backward slide (the entry is mirrored, Dr Sales / Cr Deferred Revenue). Zero when the observation moved nothing, in which case no entry was written.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'OrderLineProgressMeasurement',
    @level2type = N'COLUMN', @level2name = N'RecognitionAmount';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The RevenueRecognition journal entry this observation produced. Soft reference into accounting. NULL when the delta was zero.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'OrderLineProgressMeasurement',
    @level2type = N'COLUMN', @level2name = N'JournalEntryID';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Draft | Posted. Orders.RecordProgress writes Posted rows; a Posted row is immutable (trigger). Draft is reserved for an observation saved before it is posted.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'OrderLineProgressMeasurement',
    @level2type = N'COLUMN', @level2name = N'Status';
GO

-- -----------------------------------------------------------------------------
-- 3. A posted observation is immutable (plan §9.3).
--
--    You do not restate a period that has been recognised and swept into a batch;
--    you observe again in the current period and let the catch-up absorb it. That
--    is the accounting-correct answer and the only one compatible with accounting
--    having no period-close machinery to reopen (D2).
-- -----------------------------------------------------------------------------
CREATE OR ALTER TRIGGER [${flyway:defaultSchema}].[trg_OrderLineProgressMeasurement_Immutable]
ON [${flyway:defaultSchema}].[OrderLineProgressMeasurement]
AFTER UPDATE, DELETE
AS
BEGIN
    SET NOCOUNT ON;
    -- Zero-row statements (CodeGen's __mj_UpdatedAt backfill) must not touch anything.
    IF NOT EXISTS (SELECT 1 FROM inserted) AND NOT EXISTS (SELECT 1 FROM deleted) RETURN;

    IF EXISTS (SELECT 1 FROM deleted WHERE Status = 'Posted')
    BEGIN
        ROLLBACK TRANSACTION;
        THROW 51030, 'A posted progress observation is immutable: it cannot be changed or deleted. Record a new observation for the current period instead — the catch-up absorbs the correction.', 1;
    END;
END;
GO


















































-- =============================================================================
-- CODEGEN OUTPUT — GENERATED CODE BELOW THIS LINE. DO NOT EDIT BY HAND.
-- This app's own CodeGen SQL (the OrderLineProgressMeasurement entity, its view,
-- CRUD procs and permissions, and the ScheduleBasis field on Revenue Recognition
-- Types) is folded here by scripts/append-codegen.sh.
-- =============================================================================


/* SQL generated to create new entity MJ_BizApps_Orders: Order Line Progress Measurements */

      INSERT INTO [${mjSchema}].[Entity] (
         [ID],
         [Name],
         [DisplayName],
         [Description],
         [NameSuffix],
         [BaseTable],
         [BaseView],
         [SchemaName],
         [IncludeInAPI],
         [AllowUserSearchAPI],
         [AllowCaching]
         , [TrackRecordChanges]
         , [AuditRecordAccess]
         , [AuditViewRuns]
         , [AllowAllRowsAPI]
         , [AllowCreateAPI]
         , [AllowUpdateAPI]
         , [AllowDeleteAPI]
         , [UserViewMaxRows]
         , [__mj_CreatedAt]
         , [__mj_UpdatedAt]
      )
      VALUES (
         '9f5508e8-9f4f-4f5d-b991-c98bf0043498',
         'MJ_BizApps_Orders: Order Line Progress Measurements',
         'Order Line Progress Measurements',
         'One attested progress observation on a percentage-of-completion order line (D90). PercentComplete is CUMULATIVE; Orders.RecordProgress posts the difference between the target it implies and what is already recognised, so a backward slide reverses through the same subtraction. A Posted row is immutable — corrections happen forward, in the next observation.',
         NULL,
         'OrderLineProgressMeasurement',
         'vwOrderLineProgressMeasurements',
         '${flyway:defaultSchema}',
         1,
         1,
         0
         , 1
         , 0
         , 0
         , 0
         , 1
         , 1
         , 1
         , 1000
         , GETUTCDATE()
         , GETUTCDATE()
      );

/* SQL generated to add new entity MJ_BizApps_Orders: Order Line Progress Measurements to application ID: 'FB80FEB4-5505-49D1-93CE-2E7BD030B478' */
INSERT INTO [${mjSchema}].[ApplicationEntity]
                                       ([ApplicationID], [EntityID], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                       ('FB80FEB4-5505-49D1-93CE-2E7BD030B478', '9f5508e8-9f4f-4f5d-b991-c98bf0043498', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [${mjSchema}].[ApplicationEntity] WHERE [ApplicationID] = 'FB80FEB4-5505-49D1-93CE-2E7BD030B478'), GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ_BizApps_Orders: Order Line Progress Measurements for role Developer */
INSERT INTO [${mjSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('9f5508e8-9f4f-4f5d-b991-c98bf0043498', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ_BizApps_Orders: Order Line Progress Measurements for role Integration */
INSERT INTO [${mjSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('9f5508e8-9f4f-4f5d-b991-c98bf0043498', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ_BizApps_Orders: Order Line Progress Measurements for role UI */
INSERT INTO [${mjSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('9f5508e8-9f4f-4f5d-b991-c98bf0043498', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE());

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.OrderLineProgressMeasurement */
ALTER TABLE [${flyway:defaultSchema}].[OrderLineProgressMeasurement] ADD [__mj_CreatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.OrderLineProgressMeasurement */
UPDATE [${flyway:defaultSchema}].[OrderLineProgressMeasurement] SET [__mj_CreatedAt] = GETUTCDATE() WHERE [__mj_CreatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.OrderLineProgressMeasurement */
ALTER TABLE [${flyway:defaultSchema}].[OrderLineProgressMeasurement] ALTER COLUMN [__mj_CreatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.OrderLineProgressMeasurement */
ALTER TABLE [${flyway:defaultSchema}].[OrderLineProgressMeasurement] ADD CONSTRAINT [DF___mj_BizAppsOrders_OrderLineProgressMeasurement___mj_CreatedAt] DEFAULT GETUTCDATE() FOR [__mj_CreatedAt];
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.OrderLineProgressMeasurement */
ALTER TABLE [${flyway:defaultSchema}].[OrderLineProgressMeasurement] ADD [__mj_UpdatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.OrderLineProgressMeasurement */
UPDATE [${flyway:defaultSchema}].[OrderLineProgressMeasurement] SET [__mj_UpdatedAt] = GETUTCDATE() WHERE [__mj_UpdatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.OrderLineProgressMeasurement */
ALTER TABLE [${flyway:defaultSchema}].[OrderLineProgressMeasurement] ALTER COLUMN [__mj_UpdatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.OrderLineProgressMeasurement */
ALTER TABLE [${flyway:defaultSchema}].[OrderLineProgressMeasurement] ADD CONSTRAINT [DF___mj_BizAppsOrders_OrderLineProgressMeasurement___mj_UpdatedAt] DEFAULT GETUTCDATE() FOR [__mj_UpdatedAt];
GO

/* SQL text to insert 21 new entity field(s) */
-- (Every Sequence is written as MAX + 1 rather than CodeGen's literal, so it cannot collide with UQ_EntityField_EntityID_Sequence on another database.)

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '73c34a99-16c9-4866-86bb-111759fcb1e2' OR (EntityID = '9F5508E8-9F4F-4F5D-B991-C98BF0043498' AND Name = 'ID')) BEGIN
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
            '73c34a99-16c9-4866-86bb-111759fcb1e2',
            '9F5508E8-9F4F-4F5D-B991-C98BF0043498', -- Entity: MJ_BizApps_Orders: Order Line Progress Measurements
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${mjSchema}].[EntityField] WHERE [EntityID] = '9F5508E8-9F4F-4F5D-B991-C98BF0043498') + 1,
            'ID',
            'ID',
            NULL,
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            '(newsequentialid())',
            0,
            0,
            0,
            0,
            NULL,
            NULL,
            0,
            1,
            0,
            0,
            1,
            1,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;


      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '8b17a626-f700-491a-bda3-bf48bb986e0f' OR (EntityID = '9F5508E8-9F4F-4F5D-B991-C98BF0043498' AND Name = 'OrderLineID')) BEGIN
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
            '8b17a626-f700-491a-bda3-bf48bb986e0f',
            '9F5508E8-9F4F-4F5D-B991-C98BF0043498', -- Entity: MJ_BizApps_Orders: Order Line Progress Measurements
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${mjSchema}].[EntityField] WHERE [EntityID] = '9F5508E8-9F4F-4F5D-B991-C98BF0043498') + 1,
            'OrderLineID',
            'Order Line ID',
            'The percentage-of-completion order line this observation is about.',
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            NULL,
            0,
            1,
            0,
            0,
            '66D82C24-9C9F-4CD6-B019-53C20274AB00',
            'ID',
            0,
            0,
            1,
            0,
            0,
            1,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;


      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '636d0721-7605-41cf-a2fc-65c4929bb26b' OR (EntityID = '9F5508E8-9F4F-4F5D-B991-C98BF0043498' AND Name = 'MeasurementDate')) BEGIN
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
            '636d0721-7605-41cf-a2fc-65c4929bb26b',
            '9F5508E8-9F4F-4F5D-B991-C98BF0043498', -- Entity: MJ_BizApps_Orders: Order Line Progress Measurements
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${mjSchema}].[EntityField] WHERE [EntityID] = '9F5508E8-9F4F-4F5D-B991-C98BF0043498') + 1,
            'MeasurementDate',
            'Measurement Date',
            'The date this observation governs — the period it belongs to on the close calendar. One observation per line per date (UQ_OLPM_Period); it is also the recognition entry''s EffectiveDate.',
            'date',
            3,
            10,
            0,
            0,
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
            1,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;


      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = 'f12a0445-d789-469a-9bb7-5570c5eb22fb' OR (EntityID = '9F5508E8-9F4F-4F5D-B991-C98BF0043498' AND Name = 'PercentComplete')) BEGIN
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
            'f12a0445-d789-469a-9bb7-5570c5eb22fb',
            '9F5508E8-9F4F-4F5D-B991-C98BF0043498', -- Entity: MJ_BizApps_Orders: Order Line Progress Measurements
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${mjSchema}].[EntityField] WHERE [EntityID] = '9F5508E8-9F4F-4F5D-B991-C98BF0043498') + 1,
            'PercentComplete',
            'Percent Complete',
            'CUMULATIVE fraction earned to date, 0..1. Not the increment: the entry is target (LineTotalNet × PercentComplete) minus what is already recognised.',
            'decimal',
            5,
            7,
            4,
            0,
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


      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = 'a025e927-ee2b-4af8-99b2-e22dfb9dfc35' OR (EntityID = '9F5508E8-9F4F-4F5D-B991-C98BF0043498' AND Name = 'MethodCode')) BEGIN
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
            'a025e927-ee2b-4af8-99b2-e22dfb9dfc35',
            '9F5508E8-9F4F-4F5D-B991-C98BF0043498', -- Entity: MJ_BizApps_Orders: Order Line Progress Measurements
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${mjSchema}].[EntityField] WHERE [EntityID] = '9F5508E8-9F4F-4F5D-B991-C98BF0043498') + 1,
            'MethodCode',
            'Method Code',
            'The ProgressRecognitionDriver that produced the percent — ManualAttestation is the one that ships. Whatever the method, a named person signs the observation and the attestation is what posts.',
            'nvarchar',
            80,
            0,
            0,
            0,
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


      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = 'b286df17-9cb2-4441-a369-fadadb90faec' OR (EntityID = '9F5508E8-9F4F-4F5D-B991-C98BF0043498' AND Name = 'MeasureNumerator')) BEGIN
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
            'b286df17-9cb2-4441-a369-fadadb90faec',
            '9F5508E8-9F4F-4F5D-B991-C98BF0043498', -- Entity: MJ_BizApps_Orders: Order Line Progress Measurements
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${mjSchema}].[EntityField] WHERE [EntityID] = '9F5508E8-9F4F-4F5D-B991-C98BF0043498') + 1,
            'MeasureNumerator',
            'Measure Numerator',
            'Optional quantitative input behind the percent (cost incurred, units delivered), kept for audit. PercentComplete drives the entry regardless.',
            'decimal',
            9,
            18,
            4,
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


      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '6ff4072f-078a-44ca-bb26-c60d8edc4be9' OR (EntityID = '9F5508E8-9F4F-4F5D-B991-C98BF0043498' AND Name = 'MeasureDenominator')) BEGIN
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
            '6ff4072f-078a-44ca-bb26-c60d8edc4be9',
            '9F5508E8-9F4F-4F5D-B991-C98BF0043498', -- Entity: MJ_BizApps_Orders: Order Line Progress Measurements
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${mjSchema}].[EntityField] WHERE [EntityID] = '9F5508E8-9F4F-4F5D-B991-C98BF0043498') + 1,
            'MeasureDenominator',
            'Measure Denominator',
            'Optional quantitative denominator behind the percent (estimated total cost, total units), kept for audit.',
            'decimal',
            9,
            18,
            4,
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


      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = 'a8ef2ca5-95f2-45a6-ad81-8006fd3e4ad2' OR (EntityID = '9F5508E8-9F4F-4F5D-B991-C98BF0043498' AND Name = 'AttestedByUserID')) BEGIN
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
            'a8ef2ca5-95f2-45a6-ad81-8006fd3e4ad2',
            '9F5508E8-9F4F-4F5D-B991-C98BF0043498', -- Entity: MJ_BizApps_Orders: Order Line Progress Measurements
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${mjSchema}].[EntityField] WHERE [EntityID] = '9F5508E8-9F4F-4F5D-B991-C98BF0043498') + 1,
            'AttestedByUserID',
            'Attested By User ID',
            'Who signed this observation. Every recognition entry names the observation and the person who signed it.',
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


      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '3d04846a-21f2-4604-a5ad-e0f7e01a6257' OR (EntityID = '9F5508E8-9F4F-4F5D-B991-C98BF0043498' AND Name = 'SourceEntityID')) BEGIN
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
            '3d04846a-21f2-4604-a5ad-e0f7e01a6257',
            '9F5508E8-9F4F-4F5D-B991-C98BF0043498', -- Entity: MJ_BizApps_Orders: Order Line Progress Measurements
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${mjSchema}].[EntityField] WHERE [EntityID] = '9F5508E8-9F4F-4F5D-B991-C98BF0043498') + 1,
            'SourceEntityID',
            'Source Entity ID',
            'Where a derived number came from, when it was derived (entity). NULL for a plain attestation.',
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
            'E0238F34-2837-EF11-86D4-6045BDEE16E6',
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


      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '618dc65b-8bd5-42cf-9410-4e5e6f4e5f92' OR (EntityID = '9F5508E8-9F4F-4F5D-B991-C98BF0043498' AND Name = 'SourceRecordID')) BEGIN
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
            '618dc65b-8bd5-42cf-9410-4e5e6f4e5f92',
            '9F5508E8-9F4F-4F5D-B991-C98BF0043498', -- Entity: MJ_BizApps_Orders: Order Line Progress Measurements
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${mjSchema}].[EntityField] WHERE [EntityID] = '9F5508E8-9F4F-4F5D-B991-C98BF0043498') + 1,
            'SourceRecordID',
            'Source Record ID',
            'Where a derived number came from, when it was derived (record). NULL for a plain attestation.',
            'nvarchar',
            800,
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


      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '8da617e3-ee8c-4561-930c-857032a1be6b' OR (EntityID = '9F5508E8-9F4F-4F5D-B991-C98BF0043498' AND Name = 'Notes')) BEGIN
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
            '8da617e3-ee8c-4561-930c-857032a1be6b',
            '9F5508E8-9F4F-4F5D-B991-C98BF0043498', -- Entity: MJ_BizApps_Orders: Order Line Progress Measurements
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${mjSchema}].[EntityField] WHERE [EntityID] = '9F5508E8-9F4F-4F5D-B991-C98BF0043498') + 1,
            'Notes',
            'Notes',
            'Free text from the signer.',
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


      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '2e4cca34-6e40-49c5-b0e0-76518d46c996' OR (EntityID = '9F5508E8-9F4F-4F5D-B991-C98BF0043498' AND Name = 'RecognizedToDateBefore')) BEGIN
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
            '2e4cca34-6e40-49c5-b0e0-76518d46c996',
            '9F5508E8-9F4F-4F5D-B991-C98BF0043498', -- Entity: MJ_BizApps_Orders: Order Line Progress Measurements
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${mjSchema}].[EntityField] WHERE [EntityID] = '9F5508E8-9F4F-4F5D-B991-C98BF0043498') + 1,
            'RecognizedToDateBefore',
            'Recognized To Date Before',
            'Revenue recognised on the line before this observation posted. Materialised for the audit chain; agrees with the sum of posted recognition entries for the line.',
            'decimal',
            9,
            18,
            2,
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


      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '7a282fa0-4d4b-4dce-8689-d579505e2886' OR (EntityID = '9F5508E8-9F4F-4F5D-B991-C98BF0043498' AND Name = 'RecognizedToDateAfter')) BEGIN
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
            '7a282fa0-4d4b-4dce-8689-d579505e2886',
            '9F5508E8-9F4F-4F5D-B991-C98BF0043498', -- Entity: MJ_BizApps_Orders: Order Line Progress Measurements
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${mjSchema}].[EntityField] WHERE [EntityID] = '9F5508E8-9F4F-4F5D-B991-C98BF0043498') + 1,
            'RecognizedToDateAfter',
            'Recognized To Date After',
            'Revenue recognised on the line after this observation posted: LineTotalNet × PercentComplete, rounded to the cent. At 100% it is the line amount exactly.',
            'decimal',
            9,
            18,
            2,
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


      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '9f902b65-2d21-4dcf-be61-dc0904dfefbc' OR (EntityID = '9F5508E8-9F4F-4F5D-B991-C98BF0043498' AND Name = 'RecognitionAmount')) BEGIN
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
            '9f902b65-2d21-4dcf-be61-dc0904dfefbc',
            '9F5508E8-9F4F-4F5D-B991-C98BF0043498', -- Entity: MJ_BizApps_Orders: Order Line Progress Measurements
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${mjSchema}].[EntityField] WHERE [EntityID] = '9F5508E8-9F4F-4F5D-B991-C98BF0043498') + 1,
            'RecognitionAmount',
            'Recognition Amount',
            'The delta this observation posted: After − Before. NEGATIVE on a backward slide (the entry is mirrored, Dr Sales / Cr Deferred Revenue). Zero when the observation moved nothing, in which case no entry was written.',
            'decimal',
            9,
            18,
            2,
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


      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = 'f61d5473-e8b1-4aa2-b6d0-06796732b34f' OR (EntityID = '9F5508E8-9F4F-4F5D-B991-C98BF0043498' AND Name = 'JournalEntryID')) BEGIN
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
            'f61d5473-e8b1-4aa2-b6d0-06796732b34f',
            '9F5508E8-9F4F-4F5D-B991-C98BF0043498', -- Entity: MJ_BizApps_Orders: Order Line Progress Measurements
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${mjSchema}].[EntityField] WHERE [EntityID] = '9F5508E8-9F4F-4F5D-B991-C98BF0043498') + 1,
            'JournalEntryID',
            'Journal Entry ID',
            'The RevenueRecognition journal entry this observation produced. Soft reference into accounting. NULL when the delta was zero.',
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


      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = 'b0cad038-aec6-4152-8120-e90c126217c0' OR (EntityID = '9F5508E8-9F4F-4F5D-B991-C98BF0043498' AND Name = 'Status')) BEGIN
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
            'b0cad038-aec6-4152-8120-e90c126217c0',
            '9F5508E8-9F4F-4F5D-B991-C98BF0043498', -- Entity: MJ_BizApps_Orders: Order Line Progress Measurements
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${mjSchema}].[EntityField] WHERE [EntityID] = '9F5508E8-9F4F-4F5D-B991-C98BF0043498') + 1,
            'Status',
            'Status',
            'Draft | Posted. Orders.RecordProgress writes Posted rows; a Posted row is immutable (trigger). Draft is reserved for an observation saved before it is posted.',
            'nvarchar',
            40,
            0,
            0,
            0,
            '(N''Draft'')',
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


      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '5fceabcf-b585-4b91-9777-3b7dc2840e15' OR (EntityID = '9F5508E8-9F4F-4F5D-B991-C98BF0043498' AND Name = '__mj_CreatedAt')) BEGIN
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
            '5fceabcf-b585-4b91-9777-3b7dc2840e15',
            '9F5508E8-9F4F-4F5D-B991-C98BF0043498', -- Entity: MJ_BizApps_Orders: Order Line Progress Measurements
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${mjSchema}].[EntityField] WHERE [EntityID] = '9F5508E8-9F4F-4F5D-B991-C98BF0043498') + 1,
            '__mj_CreatedAt',
            'Created At',
            NULL,
            'datetimeoffset',
            10,
            34,
            7,
            0,
            '(getutcdate())',
            0,
            0,
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


      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = 'f22d2436-fa43-4db0-b521-40fef5f15f5f' OR (EntityID = '9F5508E8-9F4F-4F5D-B991-C98BF0043498' AND Name = '__mj_UpdatedAt')) BEGIN
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
            'f22d2436-fa43-4db0-b521-40fef5f15f5f',
            '9F5508E8-9F4F-4F5D-B991-C98BF0043498', -- Entity: MJ_BizApps_Orders: Order Line Progress Measurements
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${mjSchema}].[EntityField] WHERE [EntityID] = '9F5508E8-9F4F-4F5D-B991-C98BF0043498') + 1,
            '__mj_UpdatedAt',
            'Updated At',
            NULL,
            'datetimeoffset',
            10,
            34,
            7,
            0,
            '(getutcdate())',
            0,
            0,
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


      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = 'cd612866-b396-40a8-a8ae-f687f8d06dba' OR (EntityID = '9F5508E8-9F4F-4F5D-B991-C98BF0043498' AND Name = 'AttestedByUser')) BEGIN
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
            'cd612866-b396-40a8-a8ae-f687f8d06dba',
            '9F5508E8-9F4F-4F5D-B991-C98BF0043498', -- Entity: MJ_BizApps_Orders: Order Line Progress Measurements
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${mjSchema}].[EntityField] WHERE [EntityID] = '9F5508E8-9F4F-4F5D-B991-C98BF0043498') + 1,
            'AttestedByUser',
            'Attested By User',
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


      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '6ddc4b4b-ec85-48f1-a0c3-7a07c6ae9ccb' OR (EntityID = '9F5508E8-9F4F-4F5D-B991-C98BF0043498' AND Name = 'SourceEntity')) BEGIN
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
            '6ddc4b4b-ec85-48f1-a0c3-7a07c6ae9ccb',
            '9F5508E8-9F4F-4F5D-B991-C98BF0043498', -- Entity: MJ_BizApps_Orders: Order Line Progress Measurements
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${mjSchema}].[EntityField] WHERE [EntityID] = '9F5508E8-9F4F-4F5D-B991-C98BF0043498') + 1,
            'SourceEntity',
            'Source Entity',
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


      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '694a13ef-b8ba-4133-a7de-c3c1fa7643e1' OR (EntityID = 'B611425A-630F-4CF7-A639-02E5C938923A' AND Name = 'ScheduleBasis')) BEGIN
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
            '694a13ef-b8ba-4133-a7de-c3c1fa7643e1',
            'B611425A-630F-4CF7-A639-02E5C938923A', -- Entity: MJ_BizApps_Orders: Revenue Recognition Types
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${mjSchema}].[EntityField] WHERE [EntityID] = 'B611425A-630F-4CF7-A639-02E5C938923A') + 1,
            'ScheduleBasis',
            'Schedule Basis',
            'AtBooking: the driver computes the whole schedule at booking and every release entry is written forward-dated then. OnMeasurement: nothing is staged at booking; revenue is recognised by cumulative catch-up as progress observations are recorded (Orders.RecordProgress). A POC type is IsDeferred = 1 with OnMeasurement.',
            'nvarchar',
            40,
            0,
            0,
            0,
            '(N''AtBooking'')',
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

/* SQL text to insert entity field value with ID 6a995705-31ee-41ca-a81e-23ae9fd53577 */
INSERT INTO [${mjSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('6a995705-31ee-41ca-a81e-23ae9fd53577', 'B0CAD038-AEC6-4152-8120-E90C126217C0', 1, 'Draft', 'Draft', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID ef96e133-ed60-43b9-9f04-e393d0311f8e */
INSERT INTO [${mjSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('ef96e133-ed60-43b9-9f04-e393d0311f8e', 'B0CAD038-AEC6-4152-8120-E90C126217C0', 2, 'Posted', 'Posted', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID B0CAD038-AEC6-4152-8120-E90C126217C0 */
UPDATE [${mjSchema}].[EntityField] SET ValueListType='List' WHERE ID='B0CAD038-AEC6-4152-8120-E90C126217C0';

/* SQL text to insert entity field value with ID 4194889a-9fe5-4947-bc74-4c43019c5bf9 */
INSERT INTO [${mjSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('4194889a-9fe5-4947-bc74-4c43019c5bf9', '694A13EF-B8BA-4133-A7DE-C3C1FA7643E1', 1, 'AtBooking', 'AtBooking', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID a575d0fd-04ed-4696-a227-b24c662e6776 */
INSERT INTO [${mjSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('a575d0fd-04ed-4696-a227-b24c662e6776', '694A13EF-B8BA-4133-A7DE-C3C1FA7643E1', 2, 'OnMeasurement', 'OnMeasurement', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID 694A13EF-B8BA-4133-A7DE-C3C1FA7643E1 */
UPDATE [${mjSchema}].[EntityField] SET ValueListType='List' WHERE ID='694A13EF-B8BA-4133-A7DE-C3C1FA7643E1';

/* Create Entity Relationship: MJ: Entities -> MJ_BizApps_Orders: Order Line Progress Measurements (One To Many via SourceEntityID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${mjSchema}].[EntityRelationship] WHERE [ID] = '0076c2a6-596d-4e9d-ad96-35070e77f25c'
   )
   BEGIN
      INSERT INTO [${mjSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('0076c2a6-596d-4e9d-ad96-35070e77f25c', 'E0238F34-2837-EF11-86D4-6045BDEE16E6', '9F5508E8-9F4F-4F5D-B991-C98BF0043498', 'SourceEntityID', 'One To Many', 1, 1, 87, GETUTCDATE(), GETUTCDATE())
   END;

/* Create Entity Relationship: MJ: Users -> MJ_BizApps_Orders: Order Line Progress Measurements (One To Many via AttestedByUserID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${mjSchema}].[EntityRelationship] WHERE [ID] = 'ace6f63f-e296-400d-bab8-01763c3ab9df'
   )
   BEGIN
      INSERT INTO [${mjSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('ace6f63f-e296-400d-bab8-01763c3ab9df', 'E1238F34-2837-EF11-86D4-6045BDEE16E6', '9F5508E8-9F4F-4F5D-B991-C98BF0043498', 'AttestedByUserID', 'One To Many', 1, 1, 119, GETUTCDATE(), GETUTCDATE())
   END;

/* Create Entity Relationship: MJ_BizApps_Orders: Order Lines -> MJ_BizApps_Orders: Order Line Progress Measurements (One To Many via OrderLineID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${mjSchema}].[EntityRelationship] WHERE [ID] = '71711d38-2b32-4545-a7ca-6837f9a072ab'
   )
   BEGIN
      INSERT INTO [${mjSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('71711d38-2b32-4545-a7ca-6837f9a072ab', '66D82C24-9C9F-4CD6-B019-53C20274AB00', '9F5508E8-9F4F-4F5D-B991-C98BF0043498', 'OrderLineID', 'One To Many', 1, 1, 14, GETUTCDATE(), GETUTCDATE())
   END;

/* SQL text to update entity field related entity name field map for entity field ID A8EF2CA5-95F2-45A6-AD81-8006FD3E4AD2 */
EXEC [${mjSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='A8EF2CA5-95F2-45A6-AD81-8006FD3E4AD2', @RelatedEntityNameFieldMap='AttestedByUser';

/* SQL text to update entity field related entity name field map for entity field ID 3D04846A-21F2-4604-A5AD-E0F7E01A6257 */
EXEC [${mjSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='3D04846A-21F2-4604-A5AD-E0F7E01A6257', @RelatedEntityNameFieldMap='SourceEntity';

-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Order Line Progress Measurements
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key OrderLineID in table OrderLineProgressMeasurement
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_OrderLineProgressMeasurement_OrderLineID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[OrderLineProgressMeasurement]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_OrderLineProgressMeasurement_OrderLineID ON [${flyway:defaultSchema}].[OrderLineProgressMeasurement] ([OrderLineID]);

-- Index for foreign key AttestedByUserID in table OrderLineProgressMeasurement
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_OrderLineProgressMeasurement_AttestedByUserID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[OrderLineProgressMeasurement]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_OrderLineProgressMeasurement_AttestedByUserID ON [${flyway:defaultSchema}].[OrderLineProgressMeasurement] ([AttestedByUserID]);

-- Index for foreign key SourceEntityID in table OrderLineProgressMeasurement
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_OrderLineProgressMeasurement_SourceEntityID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[OrderLineProgressMeasurement]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_OrderLineProgressMeasurement_SourceEntityID ON [${flyway:defaultSchema}].[OrderLineProgressMeasurement] ([SourceEntityID]);
GO

-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Order Line Progress Measurements
-- Item: vwOrderLineProgressMeasurements
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ_BizApps_Orders: Order Line Progress Measurements
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  OrderLineProgressMeasurement
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwOrderLineProgressMeasurements]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwOrderLineProgressMeasurements];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwOrderLineProgressMeasurements]
AS
SELECT
    o.*,
    MJUser_AttestedByUserID.[Name] AS [AttestedByUser],
    MJEntity_SourceEntityID.[Name] AS [SourceEntity]
FROM
    [${flyway:defaultSchema}].[OrderLineProgressMeasurement] AS o
LEFT OUTER JOIN
    [${mjSchema}].[User] AS MJUser_AttestedByUserID
  ON
    [o].[AttestedByUserID] = MJUser_AttestedByUserID.[ID]
LEFT OUTER JOIN
    [${mjSchema}].[Entity] AS MJEntity_SourceEntityID
  ON
    [o].[SourceEntityID] = MJEntity_SourceEntityID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwOrderLineProgressMeasurements] TO [cdp_UI], [cdp_Developer], [cdp_Integration]
GO

-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Order Line Progress Measurements
-- Item: Permissions for vwOrderLineProgressMeasurements
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwOrderLineProgressMeasurements] TO [cdp_UI], [cdp_Developer], [cdp_Integration]
GO

-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Order Line Progress Measurements
-- Item: spCreateOrderLineProgressMeasurement
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR OrderLineProgressMeasurement
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateOrderLineProgressMeasurement]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateOrderLineProgressMeasurement];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateOrderLineProgressMeasurement]
    @ID uniqueidentifier = NULL,
    @OrderLineID uniqueidentifier,
    @MeasurementDate date,
    @PercentComplete decimal(7, 4),
    @MethodCode nvarchar(40),
    @MeasureNumerator_Clear bit = 0,
    @MeasureNumerator decimal(18, 4) = NULL,
    @MeasureDenominator_Clear bit = 0,
    @MeasureDenominator decimal(18, 4) = NULL,
    @AttestedByUserID_Clear bit = 0,
    @AttestedByUserID uniqueidentifier = NULL,
    @SourceEntityID_Clear bit = 0,
    @SourceEntityID uniqueidentifier = NULL,
    @SourceRecordID_Clear bit = 0,
    @SourceRecordID nvarchar(400) = NULL,
    @Notes_Clear bit = 0,
    @Notes nvarchar(MAX) = NULL,
    @RecognizedToDateBefore_Clear bit = 0,
    @RecognizedToDateBefore decimal(18, 2) = NULL,
    @RecognizedToDateAfter_Clear bit = 0,
    @RecognizedToDateAfter decimal(18, 2) = NULL,
    @RecognitionAmount_Clear bit = 0,
    @RecognitionAmount decimal(18, 2) = NULL,
    @JournalEntryID_Clear bit = 0,
    @JournalEntryID uniqueidentifier = NULL,
    @Status nvarchar(20) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)

    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[OrderLineProgressMeasurement]
            (
                [ID],
                [OrderLineID],
                [MeasurementDate],
                [PercentComplete],
                [MethodCode],
                [MeasureNumerator],
                [MeasureDenominator],
                [AttestedByUserID],
                [SourceEntityID],
                [SourceRecordID],
                [Notes],
                [RecognizedToDateBefore],
                [RecognizedToDateAfter],
                [RecognitionAmount],
                [JournalEntryID],
                [Status]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @OrderLineID,
                @MeasurementDate,
                @PercentComplete,
                @MethodCode,
                CASE WHEN @MeasureNumerator_Clear = 1 THEN NULL ELSE ISNULL(@MeasureNumerator, NULL) END,
                CASE WHEN @MeasureDenominator_Clear = 1 THEN NULL ELSE ISNULL(@MeasureDenominator, NULL) END,
                CASE WHEN @AttestedByUserID_Clear = 1 THEN NULL ELSE ISNULL(@AttestedByUserID, NULL) END,
                CASE WHEN @SourceEntityID_Clear = 1 THEN NULL ELSE ISNULL(@SourceEntityID, NULL) END,
                CASE WHEN @SourceRecordID_Clear = 1 THEN NULL ELSE ISNULL(@SourceRecordID, NULL) END,
                CASE WHEN @Notes_Clear = 1 THEN NULL ELSE ISNULL(@Notes, NULL) END,
                CASE WHEN @RecognizedToDateBefore_Clear = 1 THEN NULL ELSE ISNULL(@RecognizedToDateBefore, NULL) END,
                CASE WHEN @RecognizedToDateAfter_Clear = 1 THEN NULL ELSE ISNULL(@RecognizedToDateAfter, NULL) END,
                CASE WHEN @RecognitionAmount_Clear = 1 THEN NULL ELSE ISNULL(@RecognitionAmount, NULL) END,
                CASE WHEN @JournalEntryID_Clear = 1 THEN NULL ELSE ISNULL(@JournalEntryID, NULL) END,
                ISNULL(@Status, 'Draft')
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[OrderLineProgressMeasurement]
            (
                [OrderLineID],
                [MeasurementDate],
                [PercentComplete],
                [MethodCode],
                [MeasureNumerator],
                [MeasureDenominator],
                [AttestedByUserID],
                [SourceEntityID],
                [SourceRecordID],
                [Notes],
                [RecognizedToDateBefore],
                [RecognizedToDateAfter],
                [RecognitionAmount],
                [JournalEntryID],
                [Status]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @OrderLineID,
                @MeasurementDate,
                @PercentComplete,
                @MethodCode,
                CASE WHEN @MeasureNumerator_Clear = 1 THEN NULL ELSE ISNULL(@MeasureNumerator, NULL) END,
                CASE WHEN @MeasureDenominator_Clear = 1 THEN NULL ELSE ISNULL(@MeasureDenominator, NULL) END,
                CASE WHEN @AttestedByUserID_Clear = 1 THEN NULL ELSE ISNULL(@AttestedByUserID, NULL) END,
                CASE WHEN @SourceEntityID_Clear = 1 THEN NULL ELSE ISNULL(@SourceEntityID, NULL) END,
                CASE WHEN @SourceRecordID_Clear = 1 THEN NULL ELSE ISNULL(@SourceRecordID, NULL) END,
                CASE WHEN @Notes_Clear = 1 THEN NULL ELSE ISNULL(@Notes, NULL) END,
                CASE WHEN @RecognizedToDateBefore_Clear = 1 THEN NULL ELSE ISNULL(@RecognizedToDateBefore, NULL) END,
                CASE WHEN @RecognizedToDateAfter_Clear = 1 THEN NULL ELSE ISNULL(@RecognizedToDateAfter, NULL) END,
                CASE WHEN @RecognitionAmount_Clear = 1 THEN NULL ELSE ISNULL(@RecognitionAmount, NULL) END,
                CASE WHEN @JournalEntryID_Clear = 1 THEN NULL ELSE ISNULL(@JournalEntryID, NULL) END,
                ISNULL(@Status, 'Draft')
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwOrderLineProgressMeasurements] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateOrderLineProgressMeasurement] TO [cdp_Developer], [cdp_Integration]
GO


GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateOrderLineProgressMeasurement] TO [cdp_Developer], [cdp_Integration]
GO

-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Order Line Progress Measurements
-- Item: spUpdateOrderLineProgressMeasurement
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR OrderLineProgressMeasurement
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateOrderLineProgressMeasurement]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateOrderLineProgressMeasurement];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateOrderLineProgressMeasurement]
    @ID uniqueidentifier,
    @OrderLineID uniqueidentifier = NULL,
    @MeasurementDate date = NULL,
    @PercentComplete decimal(7, 4) = NULL,
    @MethodCode nvarchar(40) = NULL,
    @MeasureNumerator_Clear bit = 0,
    @MeasureNumerator decimal(18, 4) = NULL,
    @MeasureDenominator_Clear bit = 0,
    @MeasureDenominator decimal(18, 4) = NULL,
    @AttestedByUserID_Clear bit = 0,
    @AttestedByUserID uniqueidentifier = NULL,
    @SourceEntityID_Clear bit = 0,
    @SourceEntityID uniqueidentifier = NULL,
    @SourceRecordID_Clear bit = 0,
    @SourceRecordID nvarchar(400) = NULL,
    @Notes_Clear bit = 0,
    @Notes nvarchar(MAX) = NULL,
    @RecognizedToDateBefore_Clear bit = 0,
    @RecognizedToDateBefore decimal(18, 2) = NULL,
    @RecognizedToDateAfter_Clear bit = 0,
    @RecognizedToDateAfter decimal(18, 2) = NULL,
    @RecognitionAmount_Clear bit = 0,
    @RecognitionAmount decimal(18, 2) = NULL,
    @JournalEntryID_Clear bit = 0,
    @JournalEntryID uniqueidentifier = NULL,
    @Status nvarchar(20) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[OrderLineProgressMeasurement]
    SET
        [OrderLineID] = ISNULL(@OrderLineID, [OrderLineID]),
        [MeasurementDate] = ISNULL(@MeasurementDate, [MeasurementDate]),
        [PercentComplete] = ISNULL(@PercentComplete, [PercentComplete]),
        [MethodCode] = ISNULL(@MethodCode, [MethodCode]),
        [MeasureNumerator] = CASE WHEN @MeasureNumerator_Clear = 1 THEN NULL ELSE ISNULL(@MeasureNumerator, [MeasureNumerator]) END,
        [MeasureDenominator] = CASE WHEN @MeasureDenominator_Clear = 1 THEN NULL ELSE ISNULL(@MeasureDenominator, [MeasureDenominator]) END,
        [AttestedByUserID] = CASE WHEN @AttestedByUserID_Clear = 1 THEN NULL ELSE ISNULL(@AttestedByUserID, [AttestedByUserID]) END,
        [SourceEntityID] = CASE WHEN @SourceEntityID_Clear = 1 THEN NULL ELSE ISNULL(@SourceEntityID, [SourceEntityID]) END,
        [SourceRecordID] = CASE WHEN @SourceRecordID_Clear = 1 THEN NULL ELSE ISNULL(@SourceRecordID, [SourceRecordID]) END,
        [Notes] = CASE WHEN @Notes_Clear = 1 THEN NULL ELSE ISNULL(@Notes, [Notes]) END,
        [RecognizedToDateBefore] = CASE WHEN @RecognizedToDateBefore_Clear = 1 THEN NULL ELSE ISNULL(@RecognizedToDateBefore, [RecognizedToDateBefore]) END,
        [RecognizedToDateAfter] = CASE WHEN @RecognizedToDateAfter_Clear = 1 THEN NULL ELSE ISNULL(@RecognizedToDateAfter, [RecognizedToDateAfter]) END,
        [RecognitionAmount] = CASE WHEN @RecognitionAmount_Clear = 1 THEN NULL ELSE ISNULL(@RecognitionAmount, [RecognitionAmount]) END,
        [JournalEntryID] = CASE WHEN @JournalEntryID_Clear = 1 THEN NULL ELSE ISNULL(@JournalEntryID, [JournalEntryID]) END,
        [Status] = ISNULL(@Status, [Status])
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwOrderLineProgressMeasurements] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwOrderLineProgressMeasurements]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateOrderLineProgressMeasurement] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the OrderLineProgressMeasurement table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateOrderLineProgressMeasurement]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateOrderLineProgressMeasurement];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateOrderLineProgressMeasurement
ON [${flyway:defaultSchema}].[OrderLineProgressMeasurement]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[OrderLineProgressMeasurement]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[OrderLineProgressMeasurement] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
GO


GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateOrderLineProgressMeasurement] TO [cdp_Developer], [cdp_Integration]
GO

-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Order Line Progress Measurements
-- Item: spDeleteOrderLineProgressMeasurement
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR OrderLineProgressMeasurement
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteOrderLineProgressMeasurement]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteOrderLineProgressMeasurement];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteOrderLineProgressMeasurement]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[OrderLineProgressMeasurement]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteOrderLineProgressMeasurement] TO [cdp_Developer], [cdp_Integration]
GO


GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteOrderLineProgressMeasurement] TO [cdp_Developer], [cdp_Integration]
GO

-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Revenue Recognition Types
-- Item: vwRevenueRecognitionTypes
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ_BizApps_Orders: Revenue Recognition Types
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  RevenueRecognitionType
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwRevenueRecognitionTypes]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwRevenueRecognitionTypes];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwRevenueRecognitionTypes]
AS
SELECT
    r.*
FROM
    [${flyway:defaultSchema}].[RevenueRecognitionType] AS r
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwRevenueRecognitionTypes] TO [cdp_UI], [cdp_Developer], [cdp_Integration]
GO

-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Revenue Recognition Types
-- Item: Permissions for vwRevenueRecognitionTypes
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwRevenueRecognitionTypes] TO [cdp_UI], [cdp_Developer], [cdp_Integration]
GO

-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Revenue Recognition Types
-- Item: spCreateRevenueRecognitionType
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR RevenueRecognitionType
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateRevenueRecognitionType]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateRevenueRecognitionType];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateRevenueRecognitionType]
    @ID uniqueidentifier = NULL,
    @Code nvarchar(40),
    @Name nvarchar(200),
    @Description_Clear bit = 0,
    @Description nvarchar(MAX) = NULL,
    @DriverClass nvarchar(200),
    @IsDeferred bit = NULL,
    @RequiresServicePeriod bit = NULL,
    @Sequence int = NULL,
    @IsActive bit = NULL,
    @ScheduleBasis nvarchar(20) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)

    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[RevenueRecognitionType]
            (
                [ID],
                [Code],
                [Name],
                [Description],
                [DriverClass],
                [IsDeferred],
                [RequiresServicePeriod],
                [Sequence],
                [IsActive],
                [ScheduleBasis]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @Code,
                @Name,
                CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, NULL) END,
                @DriverClass,
                ISNULL(@IsDeferred, 0),
                ISNULL(@RequiresServicePeriod, 0),
                ISNULL(@Sequence, 0),
                ISNULL(@IsActive, 1),
                ISNULL(@ScheduleBasis, 'AtBooking')
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[RevenueRecognitionType]
            (
                [Code],
                [Name],
                [Description],
                [DriverClass],
                [IsDeferred],
                [RequiresServicePeriod],
                [Sequence],
                [IsActive],
                [ScheduleBasis]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @Code,
                @Name,
                CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, NULL) END,
                @DriverClass,
                ISNULL(@IsDeferred, 0),
                ISNULL(@RequiresServicePeriod, 0),
                ISNULL(@Sequence, 0),
                ISNULL(@IsActive, 1),
                ISNULL(@ScheduleBasis, 'AtBooking')
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwRevenueRecognitionTypes] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateRevenueRecognitionType] TO [cdp_Developer], [cdp_Integration]
GO


GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateRevenueRecognitionType] TO [cdp_Developer], [cdp_Integration]
GO

-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Revenue Recognition Types
-- Item: spUpdateRevenueRecognitionType
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR RevenueRecognitionType
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateRevenueRecognitionType]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateRevenueRecognitionType];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateRevenueRecognitionType]
    @ID uniqueidentifier,
    @Code nvarchar(40) = NULL,
    @Name nvarchar(200) = NULL,
    @Description_Clear bit = 0,
    @Description nvarchar(MAX) = NULL,
    @DriverClass nvarchar(200) = NULL,
    @IsDeferred bit = NULL,
    @RequiresServicePeriod bit = NULL,
    @Sequence int = NULL,
    @IsActive bit = NULL,
    @ScheduleBasis nvarchar(20) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[RevenueRecognitionType]
    SET
        [Code] = ISNULL(@Code, [Code]),
        [Name] = ISNULL(@Name, [Name]),
        [Description] = CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, [Description]) END,
        [DriverClass] = ISNULL(@DriverClass, [DriverClass]),
        [IsDeferred] = ISNULL(@IsDeferred, [IsDeferred]),
        [RequiresServicePeriod] = ISNULL(@RequiresServicePeriod, [RequiresServicePeriod]),
        [Sequence] = ISNULL(@Sequence, [Sequence]),
        [IsActive] = ISNULL(@IsActive, [IsActive]),
        [ScheduleBasis] = ISNULL(@ScheduleBasis, [ScheduleBasis])
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwRevenueRecognitionTypes] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwRevenueRecognitionTypes]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateRevenueRecognitionType] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the RevenueRecognitionType table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateRevenueRecognitionType]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateRevenueRecognitionType];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateRevenueRecognitionType
ON [${flyway:defaultSchema}].[RevenueRecognitionType]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[RevenueRecognitionType]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[RevenueRecognitionType] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
GO


GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateRevenueRecognitionType] TO [cdp_Developer], [cdp_Integration]
GO

-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Revenue Recognition Types
-- Item: spDeleteRevenueRecognitionType
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR RevenueRecognitionType
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteRevenueRecognitionType]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteRevenueRecognitionType];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteRevenueRecognitionType]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[RevenueRecognitionType]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteRevenueRecognitionType] TO [cdp_Developer], [cdp_Integration]
GO


GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteRevenueRecognitionType] TO [cdp_Developer], [cdp_Integration]
GO


