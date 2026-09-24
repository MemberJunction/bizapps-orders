-- =============================================================================
-- V202609231200 — a posted progress observation can be SUPERSEDED (golive #260)
-- =============================================================================
-- Two rules on OrderLineProgressMeasurement combine into a trap. Orders.
-- RecordProgress refuses any observation dated on or before the last posted
-- one, and trigger 51030 makes a posted observation immutable. Each is right on
-- its own; together, one mistyped date freezes the line until the calendar
-- catches up with the typo, and the only remedy was SQL around the trigger.
--
-- The way out keeps immutability intact: nothing is edited. A supervisor
-- records a NEW observation that names the one it replaces. In the same
-- transaction the operation posts a reversal of the replaced row's recognition,
-- dated on the replaced row's own date, and then the new observation's ordinary
-- catch-up. A row is superseded when another row points at it; its Status stays
-- 'Posted' and trigger 51030 still refuses any change to it.
--
-- WHAT NETS TO ZERO ON THE REPLACED DATE IS THE REVENUE LEG. The reversal's
-- Deferred/Unbilled split is computed from the line's billing as it stands at
-- the supersede, not copied from the replaced entry, so an invoice posted in
-- between moves the contra legs to a different account than the original used.
-- The line's end balances are what they would have been without the mistake.
--
--   SupersedesMeasurementID — the observation this row replaces. At most one row
--   may supersede any given observation (filtered unique index), so a replaced
--   observation cannot be reversed twice.
--
--   ReversalJournalEntryID — the entry that reversed the replaced observation's
--   recognition. NULL when that observation moved nothing.
--
--   UQ_OLPM_Period becomes a FILTERED unique index over rows that replace
--   nothing, so a replacement may carry the date of the observation it replaces
--   (a wrong percent on 8/31 is corrected on 8/31). Ordinary observations still
--   collide with each other on (line, date), and two supersedes of the same row
--   collide on UQ_OLPM_Supersedes, so concurrent posts cannot double-recognise.
--
-- Hand-written DDL is plain: migrations run once, in order.
--
-- CodeGen output for this app is folded below the banner at the end of this file.
-- =============================================================================

ALTER TABLE [${flyway:defaultSchema}].[OrderLineProgressMeasurement]
    ADD [SupersedesMeasurementID] UNIQUEIDENTIFIER NULL
            CONSTRAINT [FK_OrderLineProgressMeasurement_SupersedesMeasurement]
            REFERENCES [${flyway:defaultSchema}].[OrderLineProgressMeasurement]([ID]),
        [ReversalJournalEntryID] UNIQUEIDENTIFIER NULL,
        CONSTRAINT [CK_OLPM_SupersedesNotSelf] CHECK ([SupersedesMeasurementID] <> [ID]);
GO

CREATE UNIQUE NONCLUSTERED INDEX [UQ_OLPM_Supersedes]
    ON [${flyway:defaultSchema}].[OrderLineProgressMeasurement]([SupersedesMeasurementID])
    WHERE [SupersedesMeasurementID] IS NOT NULL;
GO

ALTER TABLE [${flyway:defaultSchema}].[OrderLineProgressMeasurement]
    DROP CONSTRAINT [UQ_OLPM_Period];
GO

CREATE UNIQUE NONCLUSTERED INDEX [UQ_OLPM_Period]
    ON [${flyway:defaultSchema}].[OrderLineProgressMeasurement]([OrderLineID], [MeasurementDate])
    WHERE [SupersedesMeasurementID] IS NULL;
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The posted observation this row replaces. Set only by Orders.RecordProgress for a user holding MJ.BizApps.Orders.Progress.Supersede. The replaced row is not edited: its recognition is reversed by ReversalJournalEntryID and it stops counting as the line''s last observation. At most one row may supersede any observation.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'OrderLineProgressMeasurement',
    @level2type = N'COLUMN', @level2name = N'SupersedesMeasurementID';
GO
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Soft reference into accounting: the entry reversing the superseded observation''s recognition, dated on that observation''s MeasurementDate so the revenue it recognised nets to zero on that date; the Deferred/Unbilled split follows the line''s billing at the time of the supersede. NULL when this row supersedes nothing, or when the superseded observation posted no entry.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'OrderLineProgressMeasurement',
    @level2type = N'COLUMN', @level2name = N'ReversalJournalEntryID';
GO
EXEC sp_updateextendedproperty
    @name = N'MS_Description',
    @value = N'The date this observation governs — the period it belongs to on the close calendar. One observation per line per date among observations that replace nothing (UQ_OLPM_Period, filtered); a superseding observation may carry the date of the one it replaces. It is also the recognition entry''s EffectiveDate.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'OrderLineProgressMeasurement',
    @level2type = N'COLUMN', @level2name = N'MeasurementDate';
GO


















































-- =============================================================================
-- CODEGEN OUTPUT — GENERATED CODE BELOW THIS LINE. DO NOT EDIT BY HAND.
-- This app's own CodeGen SQL (the two new Order Line Progress Measurement
-- fields, the refreshed view and CRUD procs) is folded here by
-- scripts/append-codegen.sh.
-- =============================================================================


/* SQL text to insert 2 new entity field(s) */
UPDATE [${mjSchema}].[EntityField]
         SET [Sequence] = [Sequence] + 100000
       WHERE [EntityID] = '9F5508E8-9F4F-4F5D-B991-C98BF0043498'
         AND [Sequence] < 100000
         AND NOT EXISTS (
             SELECT 1 FROM [${mjSchema}].[EntityField]
              WHERE [EntityID] = '9F5508E8-9F4F-4F5D-B991-C98BF0043498'
                AND [Sequence] >= 100000
         );

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '6579af5a-9320-4a5d-b79e-560ede6e167c' OR (EntityID = '9F5508E8-9F4F-4F5D-B991-C98BF0043498' AND Name = 'SupersedesMeasurementID')) BEGIN
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
            '6579af5a-9320-4a5d-b79e-560ede6e167c',
            '9F5508E8-9F4F-4F5D-B991-C98BF0043498', -- Entity: MJ_BizApps_Orders: Order Line Progress Measurements
            19,
            'SupersedesMeasurementID',
            'Supersedes Measurement ID',
            'The posted observation this row replaces. Set only by Orders.RecordProgress for a user holding MJ.BizApps.Orders.Progress.Supersede. The replaced row is not edited: its recognition is reversed by ReversalJournalEntryID and it stops counting as the line''s last observation. At most one row may supersede any observation.',
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
            '9F5508E8-9F4F-4F5D-B991-C98BF0043498',
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '45716272-ad16-4ebe-8cf3-a71b3fec5f30' OR (EntityID = '9F5508E8-9F4F-4F5D-B991-C98BF0043498' AND Name = 'ReversalJournalEntryID')) BEGIN
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
            '45716272-ad16-4ebe-8cf3-a71b3fec5f30',
            '9F5508E8-9F4F-4F5D-B991-C98BF0043498', -- Entity: MJ_BizApps_Orders: Order Line Progress Measurements
            20,
            'ReversalJournalEntryID',
            'Reversal Journal Entry ID',
            'Soft reference into accounting: the entry reversing the superseded observation''s recognition, dated on that observation''s MeasurementDate so the revenue it recognised nets to zero on that date; the Deferred/Unbilled split follows the line''s billing at the time of the supersede. NULL when this row supersedes nothing, or when the superseded observation posted no entry.',
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


/* Create Entity Relationship: MJ_BizApps_Orders: Order Line Progress Measurements -> MJ_BizApps_Orders: Order Line Progress Measurements (One To Many via SupersedesMeasurementID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${mjSchema}].[EntityRelationship] WHERE [ID] = '668ba1b3-2f6d-41b4-8340-df437caa4b21'
   )
   BEGIN
      INSERT INTO [${mjSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('668ba1b3-2f6d-41b4-8340-df437caa4b21', '9F5508E8-9F4F-4F5D-B991-C98BF0043498', '9F5508E8-9F4F-4F5D-B991-C98BF0043498', 'SupersedesMeasurementID', 'One To Many', 1, 1, 1, GETUTCDATE(), GETUTCDATE())
   END;


/* Index for Foreign Keys for OrderLineProgressMeasurement */
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

-- Index for foreign key SupersedesMeasurementID in table OrderLineProgressMeasurement
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_OrderLineProgressMeasurement_SupersedesMeasurementID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[OrderLineProgressMeasurement]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_OrderLineProgressMeasurement_SupersedesMeasurementID ON [${flyway:defaultSchema}].[OrderLineProgressMeasurement] ([SupersedesMeasurementID]);

/* Base View SQL for MJ_BizApps_Orders: Order Line Progress Measurements */
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
GRANT SELECT ON [${flyway:defaultSchema}].[vwOrderLineProgressMeasurements] TO [cdp_Developer], [cdp_Integration], [cdp_UI];

/* Base View Permissions SQL for MJ_BizApps_Orders: Order Line Progress Measurements */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Order Line Progress Measurements
-- Item: Permissions for vwOrderLineProgressMeasurements
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwOrderLineProgressMeasurements] TO [cdp_Developer], [cdp_Integration], [cdp_UI];

/* spCreate SQL for MJ_BizApps_Orders: Order Line Progress Measurements */
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
    @Status nvarchar(20) = NULL,
    @SupersedesMeasurementID_Clear bit = 0,
    @SupersedesMeasurementID uniqueidentifier = NULL,
    @ReversalJournalEntryID_Clear bit = 0,
    @ReversalJournalEntryID uniqueidentifier = NULL
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
                [Status],
                [SupersedesMeasurementID],
                [ReversalJournalEntryID]
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
                ISNULL(@Status, 'Draft'),
                CASE WHEN @SupersedesMeasurementID_Clear = 1 THEN NULL ELSE ISNULL(@SupersedesMeasurementID, NULL) END,
                CASE WHEN @ReversalJournalEntryID_Clear = 1 THEN NULL ELSE ISNULL(@ReversalJournalEntryID, NULL) END
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
                [Status],
                [SupersedesMeasurementID],
                [ReversalJournalEntryID]
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
                ISNULL(@Status, 'Draft'),
                CASE WHEN @SupersedesMeasurementID_Clear = 1 THEN NULL ELSE ISNULL(@SupersedesMeasurementID, NULL) END,
                CASE WHEN @ReversalJournalEntryID_Clear = 1 THEN NULL ELSE ISNULL(@ReversalJournalEntryID, NULL) END
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwOrderLineProgressMeasurements] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateOrderLineProgressMeasurement] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ_BizApps_Orders: Order Line Progress Measurements */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateOrderLineProgressMeasurement] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for MJ_BizApps_Orders: Order Line Progress Measurements */
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
    @Status nvarchar(20) = NULL,
    @SupersedesMeasurementID_Clear bit = 0,
    @SupersedesMeasurementID uniqueidentifier = NULL,
    @ReversalJournalEntryID_Clear bit = 0,
    @ReversalJournalEntryID uniqueidentifier = NULL
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
        [Status] = ISNULL(@Status, [Status]),
        [SupersedesMeasurementID] = CASE WHEN @SupersedesMeasurementID_Clear = 1 THEN NULL ELSE ISNULL(@SupersedesMeasurementID, [SupersedesMeasurementID]) END,
        [ReversalJournalEntryID] = CASE WHEN @ReversalJournalEntryID_Clear = 1 THEN NULL ELSE ISNULL(@ReversalJournalEntryID, [ReversalJournalEntryID]) END
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

/* spUpdate Permissions for MJ_BizApps_Orders: Order Line Progress Measurements */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateOrderLineProgressMeasurement] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for MJ_BizApps_Orders: Order Line Progress Measurements */
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
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteOrderLineProgressMeasurement] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for MJ_BizApps_Orders: Order Line Progress Measurements */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteOrderLineProgressMeasurement] TO [cdp_Developer], [cdp_Integration];

