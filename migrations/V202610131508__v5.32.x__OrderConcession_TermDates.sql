-- =============================================================================
-- V202610131508 — Shifting or shortening a booked term (#507)
-- =============================================================================
-- An amendment could only move a booked term's end later (a Duration concession).
-- Moving its start and end together (a shift) or giving the customer less time (a
-- shortening) had no record to carry it, so both were corrected by hand.
--
-- What this file does, in order:
--   1. OrderConcession gains two delivery forms, Shift and Shorten, and the term's
--      dates before and after the change. A Shift moves start and end by the same
--      number of days. A Shorten starts no earlier and ends no later than before.
--      The dates are recorded only on those two forms.
--   2. SubscriptionEvent gains two event types, Rescheduled and Shortened, logged
--      when an approved Shift or Shorten is applied to its term.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. OrderConcession: the Shift and Shorten forms
-- -----------------------------------------------------------------------------
ALTER TABLE [${flyway:defaultSchema}].[OrderConcession] ADD
    [PriorStartDate] DATE NULL,
    [PriorEndDate] DATE NULL,
    [NewStartDate] DATE NULL,
    [NewEndDate] DATE NULL;
GO

ALTER TABLE [${flyway:defaultSchema}].[OrderConcession] DROP CONSTRAINT [CK_OrderConcession_DeliveryForm];
GO

ALTER TABLE [${flyway:defaultSchema}].[OrderConcession] ADD CONSTRAINT [CK_OrderConcession_DeliveryForm]
    CHECK ([DeliveryForm] IN ('Price','Duration','Scope','Seats','Terms','Shift','Shorten'));
GO

-- A Shift or Shorten names its term and both pairs of dates. A Shift moves start and end by the same
-- non-zero number of days. A Shorten keeps the term inside its old dates and changes at least one of them.
ALTER TABLE [${flyway:defaultSchema}].[OrderConcession] ADD CONSTRAINT [CK_OrderConcession_TermDates]
    CHECK (
        ([DeliveryForm] NOT IN ('Shift','Shorten')
            AND [PriorStartDate] IS NULL AND [PriorEndDate] IS NULL
            AND [NewStartDate] IS NULL AND [NewEndDate] IS NULL)
        OR ([DeliveryForm] IN ('Shift','Shorten')
            AND [SubscriptionTermID] IS NOT NULL
            AND [PriorStartDate] IS NOT NULL AND [PriorEndDate] IS NOT NULL
            AND [NewStartDate] IS NOT NULL AND [NewEndDate] IS NOT NULL
            AND [NewEndDate] >= [NewStartDate]
            AND [AddedQuantity] IS NULL
            AND [PriorPaymentTermsTypeID] IS NULL AND [NewPaymentTermsTypeID] IS NULL
            AND (
                ([DeliveryForm] = 'Shift'
                    AND DATEDIFF(day, [PriorStartDate], [NewStartDate]) = DATEDIFF(day, [PriorEndDate], [NewEndDate])
                    AND [NewStartDate] <> [PriorStartDate])
                OR ([DeliveryForm] = 'Shorten'
                    AND [NewStartDate] >= [PriorStartDate]
                    AND [NewEndDate] <= [PriorEndDate]
                    AND ([NewStartDate] <> [PriorStartDate] OR [NewEndDate] <> [PriorEndDate]))
            ))
    );
GO

EXEC sp_updateextendedproperty
    @name = N'MS_Description',
    @value = N'How the value was given: Price (a lower price than the price engine''s), Duration (a term extended at no charge), Scope (a product added at no charge), Seats (quantity added at no charge), Terms (a confirmed order''s payment terms changed), Shift (a booked term''s start and end moved by the same number of days), Shorten (a booked term started later or ended earlier).',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'OrderConcession',
    @level2type = N'COLUMN', @level2name = N'DeliveryForm';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'For a Shift or Shorten concession, the term''s start date before the change.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'OrderConcession',
    @level2type = N'COLUMN', @level2name = N'PriorStartDate';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'For a Shift or Shorten concession, the term''s end date before the change.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'OrderConcession',
    @level2type = N'COLUMN', @level2name = N'PriorEndDate';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'For a Shift or Shorten concession, the term''s start date once it is approved and applied.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'OrderConcession',
    @level2type = N'COLUMN', @level2name = N'NewStartDate';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'For a Shift or Shorten concession, the term''s end date once it is approved and applied.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'OrderConcession',
    @level2type = N'COLUMN', @level2name = N'NewEndDate';
GO


-- -----------------------------------------------------------------------------
-- 2. SubscriptionEvent: Rescheduled and Shortened
-- -----------------------------------------------------------------------------
ALTER TABLE [${flyway:defaultSchema}].[SubscriptionEvent] DROP CONSTRAINT [CK_SubscriptionEvent_EventType];
GO

ALTER TABLE [${flyway:defaultSchema}].[SubscriptionEvent] ADD CONSTRAINT [CK_SubscriptionEvent_EventType]
    CHECK ([EventType] IN ('Created','Activated','TrialStarted','TrialEnded','PaymentSucceeded','PaymentFailed','Paused','Resumed','CancellationRequested','Canceled','Migrated','Extended','RenewalOrderSpawned','Rescheduled','Shortened'));
GO


















































-- =============================================================================
-- CODEGEN OUTPUT — GENERATED CODE BELOW THIS LINE. DO NOT EDIT BY HAND.
-- This app's own CodeGen SQL for the change above, regenerated for the combined PR
-- (bizapps-orders#645) against a database built from its migrations: the four new
-- Order Concessions date fields and their categories, value-list values, FK indexes,
-- vwOrderConcessions, CRUD procs, permissions and Order Concessions' validators. The
-- run also emitted the Order Headers address geo fields (__mj_Latitude_/__mj_Longitude_
-- for BillToAddressID and ShipToAddressID), which no earlier migration creates, and the
-- Order Headers view and CRUD; they are kept here. Validators CodeGen regenerated for
-- other entities are in V202610131507__v5.32.x__CodeGen_Drift_Heal.sql.
-- =============================================================================


/* SQL text to insert 8 new entity field(s) */

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '09ebbe39-5e50-4390-9f85-d391a8180564' OR (EntityID = 'FC529BC8-FF09-44A9-B454-26EAFDAC791B' AND Name = '${mjSchema}_Latitude_BillToAddressID')) BEGIN
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
            '09ebbe39-5e50-4390-9f85-d391a8180564',
            'FC529BC8-FF09-44A9-B454-26EAFDAC791B', -- Entity: MJ_BizApps_Orders: Order Headers
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${mjSchema}].[EntityField] WHERE [EntityID] = 'FC529BC8-FF09-44A9-B454-26EAFDAC791B'),
            '${mjSchema}_Latitude_BillToAddressID',
            'Mj Latitude Bill To Address ID',
            NULL,
            'decimal',
            5,
            9,
            6,
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '93d40c53-aaba-4ad1-b4a3-d1fa4c5dba32' OR (EntityID = 'FC529BC8-FF09-44A9-B454-26EAFDAC791B' AND Name = '${mjSchema}_Longitude_BillToAddressID')) BEGIN
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
            '93d40c53-aaba-4ad1-b4a3-d1fa4c5dba32',
            'FC529BC8-FF09-44A9-B454-26EAFDAC791B', -- Entity: MJ_BizApps_Orders: Order Headers
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${mjSchema}].[EntityField] WHERE [EntityID] = 'FC529BC8-FF09-44A9-B454-26EAFDAC791B'),
            '${mjSchema}_Longitude_BillToAddressID',
            'Mj Longitude Bill To Address ID',
            NULL,
            'decimal',
            5,
            9,
            6,
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '1a494c12-70f6-4c02-b1fe-15461d79bac8' OR (EntityID = 'FC529BC8-FF09-44A9-B454-26EAFDAC791B' AND Name = '${mjSchema}_Latitude_ShipToAddressID')) BEGIN
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
            '1a494c12-70f6-4c02-b1fe-15461d79bac8',
            'FC529BC8-FF09-44A9-B454-26EAFDAC791B', -- Entity: MJ_BizApps_Orders: Order Headers
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${mjSchema}].[EntityField] WHERE [EntityID] = 'FC529BC8-FF09-44A9-B454-26EAFDAC791B'),
            '${mjSchema}_Latitude_ShipToAddressID',
            'Mj Latitude Ship To Address ID',
            NULL,
            'decimal',
            5,
            9,
            6,
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '27e4dafa-8e8d-420c-a298-7a4865061403' OR (EntityID = 'FC529BC8-FF09-44A9-B454-26EAFDAC791B' AND Name = '${mjSchema}_Longitude_ShipToAddressID')) BEGIN
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
            '27e4dafa-8e8d-420c-a298-7a4865061403',
            'FC529BC8-FF09-44A9-B454-26EAFDAC791B', -- Entity: MJ_BizApps_Orders: Order Headers
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${mjSchema}].[EntityField] WHERE [EntityID] = 'FC529BC8-FF09-44A9-B454-26EAFDAC791B'),
            '${mjSchema}_Longitude_ShipToAddressID',
            'Mj Longitude Ship To Address ID',
            NULL,
            'decimal',
            5,
            9,
            6,
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = 'd6c1c5ee-a0bb-4071-90cf-ae36c1a73ef7' OR (EntityID = '0E13E45B-0FF1-4B09-8919-CE576829E178' AND Name = 'PriorStartDate')) BEGIN
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
            'd6c1c5ee-a0bb-4071-90cf-ae36c1a73ef7',
            '0E13E45B-0FF1-4B09-8919-CE576829E178', -- Entity: MJ_BizApps_Orders: Order Concessions
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${mjSchema}].[EntityField] WHERE [EntityID] = '0E13E45B-0FF1-4B09-8919-CE576829E178'),
            'PriorStartDate',
            'Prior Start Date',
            'For a Shift or Shorten concession, the term''s start date before the change.',
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '701f65bb-05b0-405c-9606-43c860ca24c7' OR (EntityID = '0E13E45B-0FF1-4B09-8919-CE576829E178' AND Name = 'PriorEndDate')) BEGIN
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
            '701f65bb-05b0-405c-9606-43c860ca24c7',
            '0E13E45B-0FF1-4B09-8919-CE576829E178', -- Entity: MJ_BizApps_Orders: Order Concessions
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${mjSchema}].[EntityField] WHERE [EntityID] = '0E13E45B-0FF1-4B09-8919-CE576829E178'),
            'PriorEndDate',
            'Prior End Date',
            'For a Shift or Shorten concession, the term''s end date before the change.',
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '4d3b0414-af91-454f-a2e1-222c14448db8' OR (EntityID = '0E13E45B-0FF1-4B09-8919-CE576829E178' AND Name = 'NewStartDate')) BEGIN
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
            '4d3b0414-af91-454f-a2e1-222c14448db8',
            '0E13E45B-0FF1-4B09-8919-CE576829E178', -- Entity: MJ_BizApps_Orders: Order Concessions
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${mjSchema}].[EntityField] WHERE [EntityID] = '0E13E45B-0FF1-4B09-8919-CE576829E178'),
            'NewStartDate',
            'New Start Date',
            'For a Shift or Shorten concession, the term''s start date once it is approved and applied.',
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '964190f9-bdf5-43b6-85e3-7fc3a9179a75' OR (EntityID = '0E13E45B-0FF1-4B09-8919-CE576829E178' AND Name = 'NewEndDate')) BEGIN
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
            '964190f9-bdf5-43b6-85e3-7fc3a9179a75',
            '0E13E45B-0FF1-4B09-8919-CE576829E178', -- Entity: MJ_BizApps_Orders: Order Concessions
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${mjSchema}].[EntityField] WHERE [EntityID] = '0E13E45B-0FF1-4B09-8919-CE576829E178'),
            'NewEndDate',
            'New End Date',
            'For a Shift or Shorten concession, the term''s end date once it is approved and applied.',
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

/* SQL text to insert entity field value with ID 6d3ef1ab-b80b-4f7b-bef3-c955612e723d */
INSERT INTO [${mjSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('6d3ef1ab-b80b-4f7b-bef3-c955612e723d', '8662A268-9580-42FD-9D59-A91BE9237AE9', 5, 'Shift', 'Shift', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 1a0943a9-7cd5-453b-a039-e8b49f7e7e36 */
INSERT INTO [${mjSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('1a0943a9-7cd5-453b-a039-e8b49f7e7e36', '8662A268-9580-42FD-9D59-A91BE9237AE9', 6, 'Shorten', 'Shorten', GETUTCDATE(), GETUTCDATE());

/* SQL text to update entity field value sequence */
UPDATE [${mjSchema}].[EntityFieldValue] SET Sequence=7 WHERE ID='C892EB79-8175-40E7-AA5D-28AC06C13214';

/* SQL text to insert entity field value with ID 673968ea-dbe8-47d4-bfc1-92c3bf7f5238 */
INSERT INTO [${mjSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('673968ea-dbe8-47d4-bfc1-92c3bf7f5238', 'E2EDA043-B7D5-45C9-8606-AF585833EB10', 11, 'Rescheduled', 'Rescheduled', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 706bba1b-51e8-4664-a471-7a99e3fc9808 */
INSERT INTO [${mjSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('706bba1b-51e8-4664-a471-7a99e3fc9808', 'E2EDA043-B7D5-45C9-8606-AF585833EB10', 13, 'Shortened', 'Shortened', GETUTCDATE(), GETUTCDATE());

/* SQL text to update entity field value sequence */
UPDATE [${mjSchema}].[EntityFieldValue] SET Sequence=12 WHERE ID='F51C8686-A10E-4655-A06C-466B469B89E6';

/* SQL text to update entity field value sequence */
UPDATE [${mjSchema}].[EntityFieldValue] SET Sequence=14 WHERE ID='D9945CF3-A591-4C90-9384-287538F38E14';

/* SQL text to update entity field value sequence */
UPDATE [${mjSchema}].[EntityFieldValue] SET Sequence=15 WHERE ID='8079E095-2576-49E6-8718-49D0AEC04981';

/* Index for Foreign Keys for OrderConcession */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Order Concessions
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key OrderHeaderID in table OrderConcession
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_OrderConcession_OrderHeaderID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[OrderConcession]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_OrderConcession_OrderHeaderID ON [${flyway:defaultSchema}].[OrderConcession] ([OrderHeaderID]);

-- Index for foreign key OrderLineID in table OrderConcession
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_OrderConcession_OrderLineID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[OrderConcession]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_OrderConcession_OrderLineID ON [${flyway:defaultSchema}].[OrderConcession] ([OrderLineID]);

-- Index for foreign key SubscriptionTermID in table OrderConcession
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_OrderConcession_SubscriptionTermID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[OrderConcession]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_OrderConcession_SubscriptionTermID ON [${flyway:defaultSchema}].[OrderConcession] ([SubscriptionTermID]);

-- Index for foreign key RequestedByUserID in table OrderConcession
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_OrderConcession_RequestedByUserID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[OrderConcession]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_OrderConcession_RequestedByUserID ON [${flyway:defaultSchema}].[OrderConcession] ([RequestedByUserID]);

-- Index for foreign key AuthorizedBySalesAuthorityID in table OrderConcession
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_OrderConcession_AuthorizedBySalesAuthorityID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[OrderConcession]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_OrderConcession_AuthorizedBySalesAuthorityID ON [${flyway:defaultSchema}].[OrderConcession] ([AuthorizedBySalesAuthorityID]);

-- Index for foreign key SalesRuleID in table OrderConcession
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_OrderConcession_SalesRuleID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[OrderConcession]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_OrderConcession_SalesRuleID ON [${flyway:defaultSchema}].[OrderConcession] ([SalesRuleID]);

-- Index for foreign key DecidedByUserID in table OrderConcession
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_OrderConcession_DecidedByUserID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[OrderConcession]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_OrderConcession_DecidedByUserID ON [${flyway:defaultSchema}].[OrderConcession] ([DecidedByUserID]);

-- Index for foreign key PriorPaymentTermsTypeID in table OrderConcession
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_OrderConcession_PriorPaymentTermsTypeID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[OrderConcession]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_OrderConcession_PriorPaymentTermsTypeID ON [${flyway:defaultSchema}].[OrderConcession] ([PriorPaymentTermsTypeID]);

-- Index for foreign key NewPaymentTermsTypeID in table OrderConcession
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_OrderConcession_NewPaymentTermsTypeID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[OrderConcession]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_OrderConcession_NewPaymentTermsTypeID ON [${flyway:defaultSchema}].[OrderConcession] ([NewPaymentTermsTypeID]);

-- Index for foreign key ReferralProgramID in table OrderConcession
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_OrderConcession_ReferralProgramID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[OrderConcession]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_OrderConcession_ReferralProgramID ON [${flyway:defaultSchema}].[OrderConcession] ([ReferralProgramID]);

/* Base View SQL for MJ_BizApps_Orders: Order Concessions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Order Concessions
-- Item: vwOrderConcessions
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ_BizApps_Orders: Order Concessions
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  OrderConcession
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwOrderConcessions]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwOrderConcessions];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwOrderConcessions]
AS
SELECT
    o.*,
    mjBizAppsOrdersOrderHeader_OrderHeaderID.[OrderNumber] AS [OrderHeader],
    MJUser_RequestedByUserID.[Name] AS [RequestedByUser],
    mjBizAppsOrdersSalesRule_SalesRuleID.[Name] AS [SalesRule],
    MJUser_DecidedByUserID.[Name] AS [DecidedByUser],
    mjBizAppsOrdersPaymentTermsType_PriorPaymentTermsTypeID.[Name] AS [PriorPaymentTermsType],
    mjBizAppsOrdersPaymentTermsType_NewPaymentTermsTypeID.[Name] AS [NewPaymentTermsType],
    mjBizAppsOrdersReferralProgram_ReferralProgramID.[Name] AS [ReferralProgram]
FROM
    [${flyway:defaultSchema}].[OrderConcession] AS o
INNER JOIN
    [${flyway:defaultSchema}].[OrderHeader] AS mjBizAppsOrdersOrderHeader_OrderHeaderID
  ON
    [o].[OrderHeaderID] = mjBizAppsOrdersOrderHeader_OrderHeaderID.[ID]
INNER JOIN
    [${mjSchema}].[User] AS MJUser_RequestedByUserID
  ON
    [o].[RequestedByUserID] = MJUser_RequestedByUserID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[SalesRule] AS mjBizAppsOrdersSalesRule_SalesRuleID
  ON
    [o].[SalesRuleID] = mjBizAppsOrdersSalesRule_SalesRuleID.[ID]
LEFT OUTER JOIN
    [${mjSchema}].[User] AS MJUser_DecidedByUserID
  ON
    [o].[DecidedByUserID] = MJUser_DecidedByUserID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[PaymentTermsType] AS mjBizAppsOrdersPaymentTermsType_PriorPaymentTermsTypeID
  ON
    [o].[PriorPaymentTermsTypeID] = mjBizAppsOrdersPaymentTermsType_PriorPaymentTermsTypeID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[PaymentTermsType] AS mjBizAppsOrdersPaymentTermsType_NewPaymentTermsTypeID
  ON
    [o].[NewPaymentTermsTypeID] = mjBizAppsOrdersPaymentTermsType_NewPaymentTermsTypeID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[ReferralProgram] AS mjBizAppsOrdersReferralProgram_ReferralProgramID
  ON
    [o].[ReferralProgramID] = mjBizAppsOrdersReferralProgram_ReferralProgramID.[ID]
GO
REVOKE SELECT ON [${flyway:defaultSchema}].[vwOrderConcessions] FROM [cdp_Developer]
REVOKE SELECT ON [${flyway:defaultSchema}].[vwOrderConcessions] FROM [cdp_Integration]
REVOKE SELECT ON [${flyway:defaultSchema}].[vwOrderConcessions] FROM [cdp_UI]
GRANT SELECT ON [${flyway:defaultSchema}].[vwOrderConcessions] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for MJ_BizApps_Orders: Order Concessions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Order Concessions
-- Item: Permissions for vwOrderConcessions
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

REVOKE SELECT ON [${flyway:defaultSchema}].[vwOrderConcessions] FROM [cdp_Developer]
REVOKE SELECT ON [${flyway:defaultSchema}].[vwOrderConcessions] FROM [cdp_Integration]
REVOKE SELECT ON [${flyway:defaultSchema}].[vwOrderConcessions] FROM [cdp_UI]
GRANT SELECT ON [${flyway:defaultSchema}].[vwOrderConcessions] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for MJ_BizApps_Orders: Order Concessions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Order Concessions
-- Item: spCreateOrderConcession
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR OrderConcession
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateOrderConcession]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateOrderConcession];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateOrderConcession]
    @ID uniqueidentifier = NULL,
    @OrderHeaderID uniqueidentifier,
    @OrderLineID_Clear bit = 0,
    @OrderLineID uniqueidentifier = NULL,
    @SubscriptionTermID_Clear bit = 0,
    @SubscriptionTermID uniqueidentifier = NULL,
    @DeliveryForm nvarchar(20),
    @ReasonCategory nvarchar(20),
    @Reason nvarchar(MAX),
    @AddedDays_Clear bit = 0,
    @AddedDays int = NULL,
    @AddedQuantity_Clear bit = 0,
    @AddedQuantity decimal(18, 4) = NULL,
    @ComputedValue decimal(18, 2),
    @OrderNetTotal_Clear bit = 0,
    @OrderNetTotal decimal(18, 2) = NULL,
    @CumulativeShare_Clear bit = 0,
    @CumulativeShare decimal(9, 4) = NULL,
    @Status nvarchar(20) = NULL,
    @RequestedByUserID uniqueidentifier,
    @AuthorizedBySalesAuthorityID_Clear bit = 0,
    @AuthorizedBySalesAuthorityID uniqueidentifier = NULL,
    @SalesRuleID_Clear bit = 0,
    @SalesRuleID uniqueidentifier = NULL,
    @DecidedByUserID_Clear bit = 0,
    @DecidedByUserID uniqueidentifier = NULL,
    @DecidedAt_Clear bit = 0,
    @DecidedAt datetimeoffset = NULL,
    @DecisionNotes_Clear bit = 0,
    @DecisionNotes nvarchar(MAX) = NULL,
    @PriorPaymentTermsTypeID_Clear bit = 0,
    @PriorPaymentTermsTypeID uniqueidentifier = NULL,
    @NewPaymentTermsTypeID_Clear bit = 0,
    @NewPaymentTermsTypeID uniqueidentifier = NULL,
    @SignedAmendmentReference_Clear bit = 0,
    @SignedAmendmentReference nvarchar(500) = NULL,
    @ReferralProgramID_Clear bit = 0,
    @ReferralProgramID uniqueidentifier = NULL,
    @PriorStartDate_Clear bit = 0,
    @PriorStartDate date = NULL,
    @PriorEndDate_Clear bit = 0,
    @PriorEndDate date = NULL,
    @NewStartDate_Clear bit = 0,
    @NewStartDate date = NULL,
    @NewEndDate_Clear bit = 0,
    @NewEndDate date = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)

    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[OrderConcession]
            (
                [ID],
                [OrderHeaderID],
                [OrderLineID],
                [SubscriptionTermID],
                [DeliveryForm],
                [ReasonCategory],
                [Reason],
                [AddedDays],
                [AddedQuantity],
                [ComputedValue],
                [OrderNetTotal],
                [CumulativeShare],
                [Status],
                [RequestedByUserID],
                [AuthorizedBySalesAuthorityID],
                [SalesRuleID],
                [DecidedByUserID],
                [DecidedAt],
                [DecisionNotes],
                [PriorPaymentTermsTypeID],
                [NewPaymentTermsTypeID],
                [SignedAmendmentReference],
                [ReferralProgramID],
                [PriorStartDate],
                [PriorEndDate],
                [NewStartDate],
                [NewEndDate]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @OrderHeaderID,
                CASE WHEN @OrderLineID_Clear = 1 THEN NULL ELSE ISNULL(@OrderLineID, NULL) END,
                CASE WHEN @SubscriptionTermID_Clear = 1 THEN NULL ELSE ISNULL(@SubscriptionTermID, NULL) END,
                @DeliveryForm,
                @ReasonCategory,
                @Reason,
                CASE WHEN @AddedDays_Clear = 1 THEN NULL ELSE ISNULL(@AddedDays, NULL) END,
                CASE WHEN @AddedQuantity_Clear = 1 THEN NULL ELSE ISNULL(@AddedQuantity, NULL) END,
                @ComputedValue,
                CASE WHEN @OrderNetTotal_Clear = 1 THEN NULL ELSE ISNULL(@OrderNetTotal, NULL) END,
                CASE WHEN @CumulativeShare_Clear = 1 THEN NULL ELSE ISNULL(@CumulativeShare, NULL) END,
                ISNULL(@Status, 'Pending'),
                @RequestedByUserID,
                CASE WHEN @AuthorizedBySalesAuthorityID_Clear = 1 THEN NULL ELSE ISNULL(@AuthorizedBySalesAuthorityID, NULL) END,
                CASE WHEN @SalesRuleID_Clear = 1 THEN NULL ELSE ISNULL(@SalesRuleID, NULL) END,
                CASE WHEN @DecidedByUserID_Clear = 1 THEN NULL ELSE ISNULL(@DecidedByUserID, NULL) END,
                CASE WHEN @DecidedAt_Clear = 1 THEN NULL ELSE ISNULL(@DecidedAt, NULL) END,
                CASE WHEN @DecisionNotes_Clear = 1 THEN NULL ELSE ISNULL(@DecisionNotes, NULL) END,
                CASE WHEN @PriorPaymentTermsTypeID_Clear = 1 THEN NULL ELSE ISNULL(@PriorPaymentTermsTypeID, NULL) END,
                CASE WHEN @NewPaymentTermsTypeID_Clear = 1 THEN NULL ELSE ISNULL(@NewPaymentTermsTypeID, NULL) END,
                CASE WHEN @SignedAmendmentReference_Clear = 1 THEN NULL ELSE ISNULL(@SignedAmendmentReference, NULL) END,
                CASE WHEN @ReferralProgramID_Clear = 1 THEN NULL ELSE ISNULL(@ReferralProgramID, NULL) END,
                CASE WHEN @PriorStartDate_Clear = 1 THEN NULL ELSE ISNULL(@PriorStartDate, NULL) END,
                CASE WHEN @PriorEndDate_Clear = 1 THEN NULL ELSE ISNULL(@PriorEndDate, NULL) END,
                CASE WHEN @NewStartDate_Clear = 1 THEN NULL ELSE ISNULL(@NewStartDate, NULL) END,
                CASE WHEN @NewEndDate_Clear = 1 THEN NULL ELSE ISNULL(@NewEndDate, NULL) END
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[OrderConcession]
            (
                [OrderHeaderID],
                [OrderLineID],
                [SubscriptionTermID],
                [DeliveryForm],
                [ReasonCategory],
                [Reason],
                [AddedDays],
                [AddedQuantity],
                [ComputedValue],
                [OrderNetTotal],
                [CumulativeShare],
                [Status],
                [RequestedByUserID],
                [AuthorizedBySalesAuthorityID],
                [SalesRuleID],
                [DecidedByUserID],
                [DecidedAt],
                [DecisionNotes],
                [PriorPaymentTermsTypeID],
                [NewPaymentTermsTypeID],
                [SignedAmendmentReference],
                [ReferralProgramID],
                [PriorStartDate],
                [PriorEndDate],
                [NewStartDate],
                [NewEndDate]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @OrderHeaderID,
                CASE WHEN @OrderLineID_Clear = 1 THEN NULL ELSE ISNULL(@OrderLineID, NULL) END,
                CASE WHEN @SubscriptionTermID_Clear = 1 THEN NULL ELSE ISNULL(@SubscriptionTermID, NULL) END,
                @DeliveryForm,
                @ReasonCategory,
                @Reason,
                CASE WHEN @AddedDays_Clear = 1 THEN NULL ELSE ISNULL(@AddedDays, NULL) END,
                CASE WHEN @AddedQuantity_Clear = 1 THEN NULL ELSE ISNULL(@AddedQuantity, NULL) END,
                @ComputedValue,
                CASE WHEN @OrderNetTotal_Clear = 1 THEN NULL ELSE ISNULL(@OrderNetTotal, NULL) END,
                CASE WHEN @CumulativeShare_Clear = 1 THEN NULL ELSE ISNULL(@CumulativeShare, NULL) END,
                ISNULL(@Status, 'Pending'),
                @RequestedByUserID,
                CASE WHEN @AuthorizedBySalesAuthorityID_Clear = 1 THEN NULL ELSE ISNULL(@AuthorizedBySalesAuthorityID, NULL) END,
                CASE WHEN @SalesRuleID_Clear = 1 THEN NULL ELSE ISNULL(@SalesRuleID, NULL) END,
                CASE WHEN @DecidedByUserID_Clear = 1 THEN NULL ELSE ISNULL(@DecidedByUserID, NULL) END,
                CASE WHEN @DecidedAt_Clear = 1 THEN NULL ELSE ISNULL(@DecidedAt, NULL) END,
                CASE WHEN @DecisionNotes_Clear = 1 THEN NULL ELSE ISNULL(@DecisionNotes, NULL) END,
                CASE WHEN @PriorPaymentTermsTypeID_Clear = 1 THEN NULL ELSE ISNULL(@PriorPaymentTermsTypeID, NULL) END,
                CASE WHEN @NewPaymentTermsTypeID_Clear = 1 THEN NULL ELSE ISNULL(@NewPaymentTermsTypeID, NULL) END,
                CASE WHEN @SignedAmendmentReference_Clear = 1 THEN NULL ELSE ISNULL(@SignedAmendmentReference, NULL) END,
                CASE WHEN @ReferralProgramID_Clear = 1 THEN NULL ELSE ISNULL(@ReferralProgramID, NULL) END,
                CASE WHEN @PriorStartDate_Clear = 1 THEN NULL ELSE ISNULL(@PriorStartDate, NULL) END,
                CASE WHEN @PriorEndDate_Clear = 1 THEN NULL ELSE ISNULL(@PriorEndDate, NULL) END,
                CASE WHEN @NewStartDate_Clear = 1 THEN NULL ELSE ISNULL(@NewStartDate, NULL) END,
                CASE WHEN @NewEndDate_Clear = 1 THEN NULL ELSE ISNULL(@NewEndDate, NULL) END
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwOrderConcessions] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreateOrderConcession] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreateOrderConcession] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateOrderConcession] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ_BizApps_Orders: Order Concessions */

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreateOrderConcession] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreateOrderConcession] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateOrderConcession] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for MJ_BizApps_Orders: Order Concessions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Order Concessions
-- Item: spUpdateOrderConcession
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR OrderConcession
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateOrderConcession]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateOrderConcession];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateOrderConcession]
    @ID uniqueidentifier,
    @OrderHeaderID uniqueidentifier = NULL,
    @OrderLineID_Clear bit = 0,
    @OrderLineID uniqueidentifier = NULL,
    @SubscriptionTermID_Clear bit = 0,
    @SubscriptionTermID uniqueidentifier = NULL,
    @DeliveryForm nvarchar(20) = NULL,
    @ReasonCategory nvarchar(20) = NULL,
    @Reason nvarchar(MAX) = NULL,
    @AddedDays_Clear bit = 0,
    @AddedDays int = NULL,
    @AddedQuantity_Clear bit = 0,
    @AddedQuantity decimal(18, 4) = NULL,
    @ComputedValue decimal(18, 2) = NULL,
    @OrderNetTotal_Clear bit = 0,
    @OrderNetTotal decimal(18, 2) = NULL,
    @CumulativeShare_Clear bit = 0,
    @CumulativeShare decimal(9, 4) = NULL,
    @Status nvarchar(20) = NULL,
    @RequestedByUserID uniqueidentifier = NULL,
    @AuthorizedBySalesAuthorityID_Clear bit = 0,
    @AuthorizedBySalesAuthorityID uniqueidentifier = NULL,
    @SalesRuleID_Clear bit = 0,
    @SalesRuleID uniqueidentifier = NULL,
    @DecidedByUserID_Clear bit = 0,
    @DecidedByUserID uniqueidentifier = NULL,
    @DecidedAt_Clear bit = 0,
    @DecidedAt datetimeoffset = NULL,
    @DecisionNotes_Clear bit = 0,
    @DecisionNotes nvarchar(MAX) = NULL,
    @PriorPaymentTermsTypeID_Clear bit = 0,
    @PriorPaymentTermsTypeID uniqueidentifier = NULL,
    @NewPaymentTermsTypeID_Clear bit = 0,
    @NewPaymentTermsTypeID uniqueidentifier = NULL,
    @SignedAmendmentReference_Clear bit = 0,
    @SignedAmendmentReference nvarchar(500) = NULL,
    @ReferralProgramID_Clear bit = 0,
    @ReferralProgramID uniqueidentifier = NULL,
    @PriorStartDate_Clear bit = 0,
    @PriorStartDate date = NULL,
    @PriorEndDate_Clear bit = 0,
    @PriorEndDate date = NULL,
    @NewStartDate_Clear bit = 0,
    @NewStartDate date = NULL,
    @NewEndDate_Clear bit = 0,
    @NewEndDate date = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[OrderConcession]
    SET
        [OrderHeaderID] = ISNULL(@OrderHeaderID, [OrderHeaderID]),
        [OrderLineID] = CASE WHEN @OrderLineID_Clear = 1 THEN NULL ELSE ISNULL(@OrderLineID, [OrderLineID]) END,
        [SubscriptionTermID] = CASE WHEN @SubscriptionTermID_Clear = 1 THEN NULL ELSE ISNULL(@SubscriptionTermID, [SubscriptionTermID]) END,
        [DeliveryForm] = ISNULL(@DeliveryForm, [DeliveryForm]),
        [ReasonCategory] = ISNULL(@ReasonCategory, [ReasonCategory]),
        [Reason] = ISNULL(@Reason, [Reason]),
        [AddedDays] = CASE WHEN @AddedDays_Clear = 1 THEN NULL ELSE ISNULL(@AddedDays, [AddedDays]) END,
        [AddedQuantity] = CASE WHEN @AddedQuantity_Clear = 1 THEN NULL ELSE ISNULL(@AddedQuantity, [AddedQuantity]) END,
        [ComputedValue] = ISNULL(@ComputedValue, [ComputedValue]),
        [OrderNetTotal] = CASE WHEN @OrderNetTotal_Clear = 1 THEN NULL ELSE ISNULL(@OrderNetTotal, [OrderNetTotal]) END,
        [CumulativeShare] = CASE WHEN @CumulativeShare_Clear = 1 THEN NULL ELSE ISNULL(@CumulativeShare, [CumulativeShare]) END,
        [Status] = ISNULL(@Status, [Status]),
        [RequestedByUserID] = ISNULL(@RequestedByUserID, [RequestedByUserID]),
        [AuthorizedBySalesAuthorityID] = CASE WHEN @AuthorizedBySalesAuthorityID_Clear = 1 THEN NULL ELSE ISNULL(@AuthorizedBySalesAuthorityID, [AuthorizedBySalesAuthorityID]) END,
        [SalesRuleID] = CASE WHEN @SalesRuleID_Clear = 1 THEN NULL ELSE ISNULL(@SalesRuleID, [SalesRuleID]) END,
        [DecidedByUserID] = CASE WHEN @DecidedByUserID_Clear = 1 THEN NULL ELSE ISNULL(@DecidedByUserID, [DecidedByUserID]) END,
        [DecidedAt] = CASE WHEN @DecidedAt_Clear = 1 THEN NULL ELSE ISNULL(@DecidedAt, [DecidedAt]) END,
        [DecisionNotes] = CASE WHEN @DecisionNotes_Clear = 1 THEN NULL ELSE ISNULL(@DecisionNotes, [DecisionNotes]) END,
        [PriorPaymentTermsTypeID] = CASE WHEN @PriorPaymentTermsTypeID_Clear = 1 THEN NULL ELSE ISNULL(@PriorPaymentTermsTypeID, [PriorPaymentTermsTypeID]) END,
        [NewPaymentTermsTypeID] = CASE WHEN @NewPaymentTermsTypeID_Clear = 1 THEN NULL ELSE ISNULL(@NewPaymentTermsTypeID, [NewPaymentTermsTypeID]) END,
        [SignedAmendmentReference] = CASE WHEN @SignedAmendmentReference_Clear = 1 THEN NULL ELSE ISNULL(@SignedAmendmentReference, [SignedAmendmentReference]) END,
        [ReferralProgramID] = CASE WHEN @ReferralProgramID_Clear = 1 THEN NULL ELSE ISNULL(@ReferralProgramID, [ReferralProgramID]) END,
        [PriorStartDate] = CASE WHEN @PriorStartDate_Clear = 1 THEN NULL ELSE ISNULL(@PriorStartDate, [PriorStartDate]) END,
        [PriorEndDate] = CASE WHEN @PriorEndDate_Clear = 1 THEN NULL ELSE ISNULL(@PriorEndDate, [PriorEndDate]) END,
        [NewStartDate] = CASE WHEN @NewStartDate_Clear = 1 THEN NULL ELSE ISNULL(@NewStartDate, [NewStartDate]) END,
        [NewEndDate] = CASE WHEN @NewEndDate_Clear = 1 THEN NULL ELSE ISNULL(@NewEndDate, [NewEndDate]) END
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwOrderConcessions] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwOrderConcessions]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spUpdateOrderConcession] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spUpdateOrderConcession] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateOrderConcession] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the OrderConcession table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateOrderConcession]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateOrderConcession];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateOrderConcession
ON [${flyway:defaultSchema}].[OrderConcession]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[OrderConcession]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[OrderConcession] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for MJ_BizApps_Orders: Order Concessions */

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spUpdateOrderConcession] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spUpdateOrderConcession] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateOrderConcession] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for MJ_BizApps_Orders: Order Concessions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Order Concessions
-- Item: spDeleteOrderConcession
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR OrderConcession
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteOrderConcession]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteOrderConcession];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteOrderConcession]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[OrderConcession]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteOrderConcession] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteOrderConcession] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteOrderConcession] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for MJ_BizApps_Orders: Order Concessions */

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteOrderConcession] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteOrderConcession] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteOrderConcession] TO [cdp_Developer], [cdp_Integration];

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

-- Index for foreign key ConfirmedByUserID in table OrderHeader
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_OrderHeader_ConfirmedByUserID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[OrderHeader]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_OrderHeader_ConfirmedByUserID ON [${flyway:defaultSchema}].[OrderHeader] ([ConfirmedByUserID]);

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
    MJUser_ConfirmedByUserID.[Name] AS [ConfirmedByUser],
    ${mjSchema}_emb_BillToAddressID.[Latitude] AS [${mjSchema}_Latitude_BillToAddressID],
    ${mjSchema}_emb_BillToAddressID.[Longitude] AS [${mjSchema}_Longitude_BillToAddressID],
    ${mjSchema}_emb_ShipToAddressID.[Latitude] AS [${mjSchema}_Latitude_ShipToAddressID],
    ${mjSchema}_emb_ShipToAddressID.[Longitude] AS [${mjSchema}_Longitude_ShipToAddressID]
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
GO
IF OBJECT_ID('[${flyway:defaultSchema}].[vwOrderHeaders]', 'V') IS NOT NULL
BEGIN
    EXEC sp_executesql N'REVOKE SELECT ON [${flyway:defaultSchema}].[vwOrderHeaders] FROM [cdp_Developer]
REVOKE SELECT ON [${flyway:defaultSchema}].[vwOrderHeaders] FROM [cdp_Integration]
REVOKE SELECT ON [${flyway:defaultSchema}].[vwOrderHeaders] FROM [cdp_UI]
GRANT SELECT ON [${flyway:defaultSchema}].[vwOrderHeaders] TO [cdp_UI], [cdp_Developer], [cdp_Integration]';
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

/* Set field properties for entity */

               UPDATE [${mjSchema}].[EntityField]
               SET IsNameField = 1
               WHERE ID = '8662A268-9580-42FD-9D59-A91BE9237AE9'
               AND AutoUpdateIsNameField = 1;

/* Set categories for 4 fields */

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Order Headers.${mjSchema}_Latitude_BillToAddressID 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   DisplayName = 'Bill To Address Latitude',
   ExtendedType = 'GeoLatitude'
WHERE 
   ID = '09EBBE39-5E50-4390-9F85-D391A8180564';

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Order Headers.${mjSchema}_Longitude_BillToAddressID 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   DisplayName = 'Bill To Address Longitude',
   ExtendedType = 'GeoLongitude'
WHERE 
   ID = '93D40C53-AABA-4AD1-B4A3-D1FA4C5DBA32';

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Order Headers.${mjSchema}_Latitude_ShipToAddressID 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   DisplayName = 'Ship To Address Latitude',
   ExtendedType = 'GeoLatitude'
WHERE 
   ID = '1A494C12-70F6-4C02-B1FE-15461D79BAC8';

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Order Headers.${mjSchema}_Longitude_ShipToAddressID 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category',
   DisplayName = 'Ship To Address Longitude',
   ExtendedType = 'GeoLongitude'
WHERE 
   ID = '27E4DAFA-8E8D-420C-A298-7A4865061403';

/* Set categories for 12 fields */

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Order Concessions.ID 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'A20C25AA-D978-4CEF-8B27-95682245805C';

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Order Concessions.PriorStartDate 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'Concession Details',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'D6C1C5EE-A0BB-4071-90CF-AE36C1A73EF7';

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Order Concessions.PriorEndDate 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'Concession Details',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '701F65BB-05B0-405C-9606-43C860CA24C7';

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Order Concessions.NewStartDate 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'Concession Details',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '4D3B0414-AF91-454F-A2E1-222C14448DB8';

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Order Concessions.NewEndDate 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'Concession Details',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '964190F9-BDF5-43B6-85E3-7FC3A9179A75';

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Order Concessions.OrderHeader 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'Concession Details',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '6B9DF5C7-1467-416F-B88B-764034221FB0';

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Order Concessions.RequestedByUser 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'Approval',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '66800E4E-C4AC-49C0-8DCA-DA365B318AA0';

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Order Concessions.SalesRule 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'Value and Limits',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '1C4C2B3F-D471-425F-9E38-C52D243DB6F8';

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Order Concessions.DecidedByUser 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'Approval',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '20092E3B-3270-4C69-8D59-2A0967BC32B3';

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Order Concessions.PriorPaymentTermsType 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'Concession Details',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '163FD39E-C1A4-4BCC-AEAE-382967131C2A';

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Order Concessions.NewPaymentTermsType 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'Concession Details',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '170A0156-EDFA-452C-A627-95B51BDB832B';

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Order Concessions.ReferralProgram 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'Concession Details',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '7AB01FC9-B230-4E64-8682-633D1619BEF1';

/* Set entity icon to fa fa-hand-holding-usd */

               UPDATE [${mjSchema}].[Entity]
               SET [Icon] = 'fa fa-hand-holding-usd', [__mj_UpdatedAt] = GETUTCDATE()
               WHERE [ID] = '0E13E45B-0FF1-4B09-8919-CE576829E178';

/* Refresh custom base views for modified entities so schema changes are picked up */
EXEC sp_refreshview '${flyway:defaultSchema}.vwOrderHeadersGenerated';
IF OBJECT_ID('[${flyway:defaultSchema}].[vwOrderHeaders]', 'V') IS NOT NULL
BEGIN
    EXEC sp_executesql N'EXEC sp_refreshview ''${flyway:defaultSchema}.vwOrderHeaders'';';
END;

/* Generated Validation Functions for MJ_BizApps_Orders: Order Concessions */
-- CHECK constraint for MJ_BizApps_Orders: Order Concessions: Field: ComputedValue was newly set or modified since the last generation of the validation function, the code was regenerated and updating the GeneratedCode table with the new generated validation function
IF NOT EXISTS (
      SELECT 1 FROM [${mjSchema}].[GeneratedCode] WHERE [CategoryID] = (SELECT [ID] FROM [${mjSchema}].[vwGeneratedCodeCategories] WHERE [Name]='CodeGen: Validators') AND [LinkedEntityID] = 'DF238F34-2837-EF11-86D4-6045BDEE16E6' AND [LinkedRecordPrimaryKey] = '69EDF4F8-647F-439A-A1E6-78CEB645864F'
   )
   BEGIN
      INSERT INTO [${mjSchema}].[GeneratedCode] ([ID], [CategoryID], [GeneratedByModelID], [GeneratedAt], [Language], [Status], [Source], [Code], [Description], [Name], [LinkedEntityID], [LinkedRecordPrimaryKey])
VALUES ('97d510a2-fbf3-4e66-9a27-641bed07f338', (SELECT [ID] FROM [${mjSchema}].[vwGeneratedCodeCategories] WHERE [Name]='CodeGen: Validators'), 'C43229F6-4CC8-4838-9D04-03419A2DA191', GETUTCDATE(), 'TypeScript', 'Approved', '([ComputedValue]>=(0))', 'public ValidateComputedValueGreaterThanOrEqualToZero(result: ValidationResult) {
	if (this.ComputedValue != null && this.ComputedValue < 0) {
		result.Errors.push(new ValidationErrorInfo(
			"ComputedValue",
			"Computed value must be greater than or equal to 0.",
			this.ComputedValue,
			ValidationErrorType.Failure
		));
	}
}', 'Computed value must be greater than or equal to zero.', 'ValidateComputedValueGreaterThanOrEqualToZero', 'DF238F34-2837-EF11-86D4-6045BDEE16E6', '69EDF4F8-647F-439A-A1E6-78CEB645864F')
   END;

-- CHECK constraint for MJ_BizApps_Orders: Order Concessions: Field: CumulativeShare was newly set or modified since the last generation of the validation function, the code was regenerated and updating the GeneratedCode table with the new generated validation function
IF NOT EXISTS (
      SELECT 1 FROM [${mjSchema}].[GeneratedCode] WHERE [CategoryID] = (SELECT [ID] FROM [${mjSchema}].[vwGeneratedCodeCategories] WHERE [Name]='CodeGen: Validators') AND [LinkedEntityID] = 'DF238F34-2837-EF11-86D4-6045BDEE16E6' AND [LinkedRecordPrimaryKey] = '8E9B946E-A25F-4071-B8B7-1FBDC5290D04'
   )
   BEGIN
      INSERT INTO [${mjSchema}].[GeneratedCode] ([ID], [CategoryID], [GeneratedByModelID], [GeneratedAt], [Language], [Status], [Source], [Code], [Description], [Name], [LinkedEntityID], [LinkedRecordPrimaryKey])
VALUES ('309c3dd5-7e34-40b1-a193-cb2086ba5629', (SELECT [ID] FROM [${mjSchema}].[vwGeneratedCodeCategories] WHERE [Name]='CodeGen: Validators'), 'C43229F6-4CC8-4838-9D04-03419A2DA191', GETUTCDATE(), 'TypeScript', 'Approved', '([CumulativeShare]>=(0))', 'public ValidateCumulativeShareNonNegative(result: ValidationResult) {
	if (this.CumulativeShare != null && this.CumulativeShare < 0) {
		result.Errors.push(new ValidationErrorInfo(
			"CumulativeShare",
			"Cumulative share must be greater than or equal to 0.",
			this.CumulativeShare,
			ValidationErrorType.Failure
		));
	}
}', 'Cumulative share must be greater than or equal to zero to ensure positive or zero accumulation.', 'ValidateCumulativeShareNonNegative', 'DF238F34-2837-EF11-86D4-6045BDEE16E6', '8E9B946E-A25F-4071-B8B7-1FBDC5290D04')
   END;

-- CHECK constraint for MJ_BizApps_Orders: Order Concessions @ Table Level was newly set or modified since the last generation of the validation function, the code was regenerated and updating the GeneratedCode table with the new generated validation function
IF NOT EXISTS (
      SELECT 1 FROM [${mjSchema}].[GeneratedCode] WHERE [CategoryID] = (SELECT [ID] FROM [${mjSchema}].[vwGeneratedCodeCategories] WHERE [Name]='CodeGen: Validators') AND [LinkedEntityID] = 'E0238F34-2837-EF11-86D4-6045BDEE16E6' AND [LinkedRecordPrimaryKey] = '0E13E45B-0FF1-4B09-8919-CE576829E178'
   )
   BEGIN
      INSERT INTO [${mjSchema}].[GeneratedCode] ([ID], [CategoryID], [GeneratedByModelID], [GeneratedAt], [Language], [Status], [Source], [Code], [Description], [Name], [LinkedEntityID], [LinkedRecordPrimaryKey])
VALUES ('b69394b8-1c6d-421b-ba0b-7fb6546d7141', (SELECT [ID] FROM [${mjSchema}].[vwGeneratedCodeCategories] WHERE [Name]='CodeGen: Validators'), 'C43229F6-4CC8-4838-9D04-03419A2DA191', GETUTCDATE(), 'TypeScript', 'Approved', '([Status]=''Pending'' OR [DecidedByUserID] IS NOT NULL AND [DecidedAt] IS NOT NULL)', 'public ValidateDecisionInfoWhenNotPending(result: ValidationResult) {
	if (this.Status !== ''Pending'' && (this.DecidedByUserID == null || this.DecidedAt == null)) {
		result.Errors.push(new ValidationErrorInfo(
			"DecidedByUserID",
			"Both the deciding user and decision timestamp must be provided when status is not Pending.",
			this.DecidedByUserID,
			ValidationErrorType.Failure
		));
	}
}', 'When a record''s status is updated past ''Pending'', both the deciding user and the decision timestamp must be recorded.', 'ValidateDecisionInfoWhenNotPending', 'E0238F34-2837-EF11-86D4-6045BDEE16E6', '0E13E45B-0FF1-4B09-8919-CE576829E178')
   END;

-- CHECK constraint for MJ_BizApps_Orders: Order Concessions @ Table Level was newly set or modified since the last generation of the validation function, the code was regenerated and updating the GeneratedCode table with the new generated validation function
IF NOT EXISTS (
      SELECT 1 FROM [${mjSchema}].[GeneratedCode] WHERE [CategoryID] = (SELECT [ID] FROM [${mjSchema}].[vwGeneratedCodeCategories] WHERE [Name]='CodeGen: Validators') AND [LinkedEntityID] = 'E0238F34-2837-EF11-86D4-6045BDEE16E6' AND [LinkedRecordPrimaryKey] = '0E13E45B-0FF1-4B09-8919-CE576829E178'
   )
   BEGIN
      INSERT INTO [${mjSchema}].[GeneratedCode] ([ID], [CategoryID], [GeneratedByModelID], [GeneratedAt], [Language], [Status], [Source], [Code], [Description], [Name], [LinkedEntityID], [LinkedRecordPrimaryKey])
VALUES ('51d64ee0-540c-47dc-a088-44bcf4cbc449', (SELECT [ID] FROM [${mjSchema}].[vwGeneratedCodeCategories] WHERE [Name]='CodeGen: Validators'), 'C43229F6-4CC8-4838-9D04-03419A2DA191', GETUTCDATE(), 'TypeScript', 'Approved', '(NOT ([DeliveryForm]=''Shorten'' OR [DeliveryForm]=''Shift'') AND [PriorStartDate] IS NULL AND [PriorEndDate] IS NULL AND [NewStartDate] IS NULL AND [NewEndDate] IS NULL OR ([DeliveryForm]=''Shorten'' OR [DeliveryForm]=''Shift'') AND [SubscriptionTermID] IS NOT NULL AND [PriorStartDate] IS NOT NULL AND [PriorEndDate] IS NOT NULL AND [NewStartDate] IS NOT NULL AND [NewEndDate] IS NOT NULL AND [NewEndDate]>=[NewStartDate] AND [AddedQuantity] IS NULL AND [PriorPaymentTermsTypeID] IS NULL AND [NewPaymentTermsTypeID] IS NULL AND ([DeliveryForm]=''Shift'' AND datediff(day,[PriorStartDate],[NewStartDate])=datediff(day,[PriorEndDate],[NewEndDate]) AND [NewStartDate]<>[PriorStartDate] OR [DeliveryForm]=''Shorten'' AND [NewStartDate]>=[PriorStartDate] AND [NewEndDate]<=[PriorEndDate] AND ([NewStartDate]<>[PriorStartDate] OR [NewEndDate]<>[PriorEndDate])))', 'public ValidateDeliveryFormAndDateAdjustments(result: ValidationResult): void {
	const isShift = this.DeliveryForm === "Shift";
	const isShorten = this.DeliveryForm === "Shorten";

	if (!isShift && !isShorten) {
		if (this.PriorStartDate != null || this.PriorEndDate != null || this.NewStartDate != null || this.NewEndDate != null) {
			result.Errors.push(new ValidationErrorInfo(
				"DeliveryForm",
				"Start and end dates must be null when DeliveryForm is not ''Shift'' or ''Shorten''.",
				this.DeliveryForm,
				ValidationErrorType.Failure
			));
		}
	} else {
		if (this.SubscriptionTermID == null) {
			result.Errors.push(new ValidationErrorInfo(
				"SubscriptionTermID",
				"SubscriptionTermID is required when DeliveryForm is ''Shift'' or ''Shorten''.",
				this.SubscriptionTermID,
				ValidationErrorType.Failure
			));
		}
		if (this.PriorStartDate == null || this.PriorEndDate == null || this.NewStartDate == null || this.NewEndDate == null) {
			result.Errors.push(new ValidationErrorInfo(
				"DeliveryForm",
				"Prior and new start/end dates are required when DeliveryForm is ''Shift'' or ''Shorten''.",
				this.DeliveryForm,
				ValidationErrorType.Failure
			));
		}
		if (this.AddedQuantity != null) {
			result.Errors.push(new ValidationErrorInfo(
				"AddedQuantity",
				"AddedQuantity must be null when DeliveryForm is ''Shift'' or ''Shorten''.",
				this.AddedQuantity,
				ValidationErrorType.Failure
			));
		}
		if (this.PriorPaymentTermsTypeID != null) {
			result.Errors.push(new ValidationErrorInfo(
				"PriorPaymentTermsTypeID",
				"PriorPaymentTermsTypeID must be null when DeliveryForm is ''Shift'' or ''Shorten''.",
				this.PriorPaymentTermsTypeID,
				ValidationErrorType.Failure
			));
		}
		if (this.NewPaymentTermsTypeID != null) {
			result.Errors.push(new ValidationErrorInfo(
				"NewPaymentTermsTypeID",
				"NewPaymentTermsTypeID must be null when DeliveryForm is ''Shift'' or ''Shorten''.",
				this.NewPaymentTermsTypeID,
				ValidationErrorType.Failure
			));
		}

		if (this.PriorStartDate != null && this.PriorEndDate != null && this.NewStartDate != null && this.NewEndDate != null) {
			const priorStart = new Date(this.PriorStartDate).getTime();
			const priorEnd = new Date(this.PriorEndDate).getTime();
			const newStart = new Date(this.NewStartDate).getTime();
			const newEnd = new Date(this.NewEndDate).getTime();

			if (newEnd < newStart) {
				result.Errors.push(new ValidationErrorInfo(
					"NewEndDate",
					"New End Date must be greater than or equal to New Start Date.",
					this.NewEndDate,
					ValidationErrorType.Failure
				));
			}

			if (isShift) {
				const startDiffDays = Math.round((newStart - priorStart) / (1000 * 60 * 60 * 24));
				const endDiffDays = Math.round((newEnd - priorEnd) / (1000 * 60 * 60 * 24));

				if (newStart === priorStart) {
					result.Errors.push(new ValidationErrorInfo(
						"NewStartDate",
						"For ''Shift'' delivery form, New Start Date must differ from Prior Start Date.",
						this.NewStartDate,
						ValidationErrorType.Failure
					));
				}
				if (startDiffDays !== endDiffDays) {
					result.Errors.push(new ValidationErrorInfo(
						"DeliveryForm",
						"For ''Shift'' delivery form, the shift duration for start date and end date must be equal.",
						this.DeliveryForm,
						ValidationErrorType.Failure
					));
				}
			} else if (isShorten) {
				if (newStart < priorStart) {
					result.Errors.push(new ValidationErrorInfo(
						"NewStartDate",
						"For ''Shorten'' delivery form, New Start Date must be greater than or equal to Prior Start Date.",
						this.NewStartDate,
						ValidationErrorType.Failure
					));
				}
				if (newEnd > priorEnd) {
					result.Errors.push(new ValidationErrorInfo(
						"NewEndDate",
						"For ''Shorten'' delivery form, New End Date must be less than or equal to Prior End Date.",
						this.NewEndDate,
						ValidationErrorType.Failure
					));
				}
				if (newStart === priorStart && newEnd === priorEnd) {
					result.Errors.push(new ValidationErrorInfo(
						"DeliveryForm",
						"For ''Shorten'' delivery form, either New Start Date or New End Date must differ from prior dates.",
						this.DeliveryForm,
						ValidationErrorType.Failure
					));
				}
			}
		}
	}
}', 'Enforces date and field rules based on the delivery form. When the delivery form is neither ''Shift'' nor ''Shorten'', all start and end date fields must be null. When the delivery form is ''Shift'' or ''Shorten'', a subscription term is required, added quantities and payment terms must be omitted, and all start and end dates must be provided. For ''Shift'', the start date must change and both start and end dates must shift by the exact same number of days. For ''Shorten'', the new date range must fall within the prior date range and reduce the overall duration.', 'ValidateDeliveryFormAndDateAdjustments', 'E0238F34-2837-EF11-86D4-6045BDEE16E6', '0E13E45B-0FF1-4B09-8919-CE576829E178')
   END;

-- CHECK constraint for MJ_BizApps_Orders: Order Concessions @ Table Level was newly set or modified since the last generation of the validation function, the code was regenerated and updating the GeneratedCode table with the new generated validation function
IF NOT EXISTS (
      SELECT 1 FROM [${mjSchema}].[GeneratedCode] WHERE [CategoryID] = (SELECT [ID] FROM [${mjSchema}].[vwGeneratedCodeCategories] WHERE [Name]='CodeGen: Validators') AND [LinkedEntityID] = 'E0238F34-2837-EF11-86D4-6045BDEE16E6' AND [LinkedRecordPrimaryKey] = '0E13E45B-0FF1-4B09-8919-CE576829E178'
   )
   BEGIN
      INSERT INTO [${mjSchema}].[GeneratedCode] ([ID], [CategoryID], [GeneratedByModelID], [GeneratedAt], [Language], [Status], [Source], [Code], [Description], [Name], [LinkedEntityID], [LinkedRecordPrimaryKey])
VALUES ('6decc674-7999-48e6-becd-4a1d75027b42', (SELECT [ID] FROM [${mjSchema}].[vwGeneratedCodeCategories] WHERE [Name]='CodeGen: Validators'), 'C43229F6-4CC8-4838-9D04-03419A2DA191', GETUTCDATE(), 'TypeScript', 'Approved', '([DeliveryForm]<>''Duration'' OR [SubscriptionTermID] IS NOT NULL AND [AddedDays]>(0))', 'public ValidateDeliveryFormDurationRequirements(result: ValidationResult) {
	if (this.DeliveryForm === ''Duration'') {
		if (this.SubscriptionTermID == null || this.AddedDays == null || this.AddedDays <= 0) {
			result.Errors.push(new ValidationErrorInfo(
				"DeliveryForm",
				"When DeliveryForm is ''Duration'', a Subscription Term must be specified and Added Days must be greater than 0.",
				this.DeliveryForm,
				ValidationErrorType.Failure
			));
		}
	}
}', 'When the delivery form is set to Duration, a valid subscription term must be provided and added days must be greater than zero.', 'ValidateDeliveryFormDurationRequirements', 'E0238F34-2837-EF11-86D4-6045BDEE16E6', '0E13E45B-0FF1-4B09-8919-CE576829E178')
   END;

-- CHECK constraint for MJ_BizApps_Orders: Order Concessions @ Table Level was newly set or modified since the last generation of the validation function, the code was regenerated and updating the GeneratedCode table with the new generated validation function
IF NOT EXISTS (
      SELECT 1 FROM [${mjSchema}].[GeneratedCode] WHERE [CategoryID] = (SELECT [ID] FROM [${mjSchema}].[vwGeneratedCodeCategories] WHERE [Name]='CodeGen: Validators') AND [LinkedEntityID] = 'E0238F34-2837-EF11-86D4-6045BDEE16E6' AND [LinkedRecordPrimaryKey] = '0E13E45B-0FF1-4B09-8919-CE576829E178'
   )
   BEGIN
      INSERT INTO [${mjSchema}].[GeneratedCode] ([ID], [CategoryID], [GeneratedByModelID], [GeneratedAt], [Language], [Status], [Source], [Code], [Description], [Name], [LinkedEntityID], [LinkedRecordPrimaryKey])
VALUES ('e87801cd-ff04-4092-adfd-1d92e620add1', (SELECT [ID] FROM [${mjSchema}].[vwGeneratedCodeCategories] WHERE [Name]='CodeGen: Validators'), 'C43229F6-4CC8-4838-9D04-03419A2DA191', GETUTCDATE(), 'TypeScript', 'Approved', '([DeliveryForm]<>''Terms'' OR [NewPaymentTermsTypeID] IS NOT NULL AND ([PriorPaymentTermsTypeID] IS NULL OR [PriorPaymentTermsTypeID]<>[NewPaymentTermsTypeID]) AND [AddedDays] IS NOT NULL AND [OrderLineID] IS NULL AND [SubscriptionTermID] IS NULL AND [AddedQuantity] IS NULL)', 'public ValidateDeliveryFormTermsRequirements(result: ValidationResult) {
	if (this.DeliveryForm === ''Terms'') {
		const isNewPaymentTermsMissing = this.NewPaymentTermsTypeID == null;
		const isSamePaymentTerms = this.PriorPaymentTermsTypeID != null && this.NewPaymentTermsTypeID != null && this.PriorPaymentTermsTypeID === this.NewPaymentTermsTypeID;
		const isAddedDaysMissing = this.AddedDays == null;
		const hasOrderLineID = this.OrderLineID != null;
		const hasSubscriptionTermID = this.SubscriptionTermID != null;
		const hasAddedQuantity = this.AddedQuantity != null;

		if (isNewPaymentTermsMissing || isSamePaymentTerms || isAddedDaysMissing || hasOrderLineID || hasSubscriptionTermID || hasAddedQuantity) {
			result.Errors.push(new ValidationErrorInfo(
				"DeliveryForm",
				"When DeliveryForm is ''Terms'', new payment terms and added days are required, new payment terms must differ from prior payment terms, and OrderLineID, SubscriptionTermID, and AddedQuantity must be empty.",
				this.DeliveryForm,
				ValidationErrorType.Failure
			));
		}
	}
}', 'When delivery form is set to ''Terms'', new payment terms and added days must be specified, new payment terms must differ from prior payment terms, and order line, subscription term, and added quantity must be empty.', 'ValidateDeliveryFormTermsRequirements', 'E0238F34-2837-EF11-86D4-6045BDEE16E6', '0E13E45B-0FF1-4B09-8919-CE576829E178')
   END;

-- CHECK constraint for MJ_BizApps_Orders: Order Concessions @ Table Level was newly set or modified since the last generation of the validation function, the code was regenerated and updating the GeneratedCode table with the new generated validation function
IF NOT EXISTS (
      SELECT 1 FROM [${mjSchema}].[GeneratedCode] WHERE [CategoryID] = (SELECT [ID] FROM [${mjSchema}].[vwGeneratedCodeCategories] WHERE [Name]='CodeGen: Validators') AND [LinkedEntityID] = 'E0238F34-2837-EF11-86D4-6045BDEE16E6' AND [LinkedRecordPrimaryKey] = '0E13E45B-0FF1-4B09-8919-CE576829E178'
   )
   BEGIN
      INSERT INTO [${mjSchema}].[GeneratedCode] ([ID], [CategoryID], [GeneratedByModelID], [GeneratedAt], [Language], [Status], [Source], [Code], [Description], [Name], [LinkedEntityID], [LinkedRecordPrimaryKey])
VALUES ('706536d1-5310-4964-95ae-0cf3b563a4e4', (SELECT [ID] FROM [${mjSchema}].[vwGeneratedCodeCategories] WHERE [Name]='CodeGen: Validators'), 'C43229F6-4CC8-4838-9D04-03419A2DA191', GETUTCDATE(), 'TypeScript', 'Approved', '(NOT ([DeliveryForm]=''Scope'' OR [DeliveryForm]=''Price'') OR [OrderLineID] IS NOT NULL)', 'public ValidateOrderLineIDRequiredForDeliveryForm(result: ValidationResult) {
	if ((this.DeliveryForm === ''Scope'' || this.DeliveryForm === ''Price'') && this.OrderLineID == null) {
		result.Errors.push(new ValidationErrorInfo(
			"OrderLineID",
			"An Order Line must be specified when Delivery Form is ''Scope'' or ''Price''.",
			this.OrderLineID,
			ValidationErrorType.Failure
		));
	}
}', 'If the delivery form is ''Scope'' or ''Price'', an order line must be specified.', 'ValidateOrderLineIDRequiredForDeliveryForm', 'E0238F34-2837-EF11-86D4-6045BDEE16E6', '0E13E45B-0FF1-4B09-8919-CE576829E178')
   END;

-- CHECK constraint for MJ_BizApps_Orders: Order Concessions @ Table Level was newly set or modified since the last generation of the validation function, the code was regenerated and updating the GeneratedCode table with the new generated validation function
IF NOT EXISTS (
      SELECT 1 FROM [${mjSchema}].[GeneratedCode] WHERE [CategoryID] = (SELECT [ID] FROM [${mjSchema}].[vwGeneratedCodeCategories] WHERE [Name]='CodeGen: Validators') AND [LinkedEntityID] = 'E0238F34-2837-EF11-86D4-6045BDEE16E6' AND [LinkedRecordPrimaryKey] = '0E13E45B-0FF1-4B09-8919-CE576829E178'
   )
   BEGIN
      INSERT INTO [${mjSchema}].[GeneratedCode] ([ID], [CategoryID], [GeneratedByModelID], [GeneratedAt], [Language], [Status], [Source], [Code], [Description], [Name], [LinkedEntityID], [LinkedRecordPrimaryKey])
VALUES ('04355f90-94bc-44ba-adb3-df3cc2119659', (SELECT [ID] FROM [${mjSchema}].[vwGeneratedCodeCategories] WHERE [Name]='CodeGen: Validators'), 'C43229F6-4CC8-4838-9D04-03419A2DA191', GETUTCDATE(), 'TypeScript', 'Approved', '([DeliveryForm]=''Terms'' OR [PriorPaymentTermsTypeID] IS NULL AND [NewPaymentTermsTypeID] IS NULL)', 'public ValidatePaymentTermsTypesByDeliveryForm(result: ValidationResult) {
	if (this.DeliveryForm !== "Terms" && (this.PriorPaymentTermsTypeID != null || this.NewPaymentTermsTypeID != null)) {
		result.Errors.push(new ValidationErrorInfo(
			"DeliveryForm",
			"Payment terms types can only be specified when the delivery form is ''Terms''.",
			this.DeliveryForm,
			ValidationErrorType.Failure
		));
	}
}', 'Payment terms types (prior or new) can only be specified when the delivery form is set to ''Terms''.', 'ValidatePaymentTermsTypesByDeliveryForm', 'E0238F34-2837-EF11-86D4-6045BDEE16E6', '0E13E45B-0FF1-4B09-8919-CE576829E178')
   END;

-- CHECK constraint for MJ_BizApps_Orders: Order Concessions @ Table Level was newly set or modified since the last generation of the validation function, the code was regenerated and updating the GeneratedCode table with the new generated validation function
IF NOT EXISTS (
      SELECT 1 FROM [${mjSchema}].[GeneratedCode] WHERE [CategoryID] = (SELECT [ID] FROM [${mjSchema}].[vwGeneratedCodeCategories] WHERE [Name]='CodeGen: Validators') AND [LinkedEntityID] = 'E0238F34-2837-EF11-86D4-6045BDEE16E6' AND [LinkedRecordPrimaryKey] = '0E13E45B-0FF1-4B09-8919-CE576829E178'
   )
   BEGIN
      INSERT INTO [${mjSchema}].[GeneratedCode] ([ID], [CategoryID], [GeneratedByModelID], [GeneratedAt], [Language], [Status], [Source], [Code], [Description], [Name], [LinkedEntityID], [LinkedRecordPrimaryKey])
VALUES ('e11328e2-59dd-4db5-a22c-99c7610c1cfc', (SELECT [ID] FROM [${mjSchema}].[vwGeneratedCodeCategories] WHERE [Name]='CodeGen: Validators'), 'C43229F6-4CC8-4838-9D04-03419A2DA191', GETUTCDATE(), 'TypeScript', 'Approved', '([DeliveryForm]<>''Seats'' OR [OrderLineID] IS NOT NULL AND [AddedQuantity]>(0))', 'public ValidateSeatsDeliveryFormRequirements(result: ValidationResult) {
	if (this.DeliveryForm === "Seats") {
		if (this.OrderLineID == null || this.AddedQuantity == null || this.AddedQuantity <= 0) {
			result.Errors.push(new ValidationErrorInfo(
				"DeliveryForm",
				"When Delivery Form is ''Seats'', an Order Line must be associated and Added Quantity must be greater than 0.",
				this.DeliveryForm,
				ValidationErrorType.Failure
			));
		}
	}
}', 'When the delivery form is set to ''Seats'', an order line must be specified and the added quantity must be greater than zero.', 'ValidateSeatsDeliveryFormRequirements', 'E0238F34-2837-EF11-86D4-6045BDEE16E6', '0E13E45B-0FF1-4B09-8919-CE576829E178')
   END;


