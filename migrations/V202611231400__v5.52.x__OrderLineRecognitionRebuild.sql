-- =============================================================================
-- V202611231400 — OrderLineRecognitionRebuild: a record of each time finance
--                 rebuilt a confirmed line's revenue recognition (golive #495)
-- =============================================================================
-- Confirm stages a line's recognition entries once, from its product's recognition
-- type at that moment. When finance changes the type, Orders.RebuildRecognition
-- voids the line's entries still Pending in no batch and stages a new schedule from
-- the product's current type, covering what the remaining entries have not
-- recognized. Each run is recorded here: who ran it, when, why, the type it
-- rebuilt to, and the entries it voided and created, so the before and after can
-- be read on the line.
--
-- RUN CODEGEN AFTER THIS so the new entity, its view, CRUD procs and subclass
-- are generated.
-- =============================================================================

CREATE TABLE [${flyway:defaultSchema}].[OrderLineRecognitionRebuild] (
    [ID] UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    [OrderLineID] UNIQUEIDENTIFIER NOT NULL,
    [RevenueRecognitionTypeID] UNIQUEIDENTIFIER NOT NULL,
    [RebuiltByUserID] UNIQUEIDENTIFIER NOT NULL,
    [RebuiltAt] DATETIMEOFFSET NOT NULL DEFAULT SYSDATETIMEOFFSET(),
    [Reason] NVARCHAR(1000) NOT NULL,
    [AmountReplaced] DECIMAL(18,2) NOT NULL,
    [VoidedEntries] NVARCHAR(MAX) NOT NULL,
    [CreatedEntries] NVARCHAR(MAX) NOT NULL,
    CONSTRAINT PK_OrderLineRecognitionRebuild PRIMARY KEY ([ID]),
    CONSTRAINT FK_OrderLineRecognitionRebuild_OrderLine FOREIGN KEY ([OrderLineID])
        REFERENCES [${flyway:defaultSchema}].[OrderLine]([ID]),
    CONSTRAINT FK_OrderLineRecognitionRebuild_RevenueRecognitionType FOREIGN KEY ([RevenueRecognitionTypeID])
        REFERENCES [${flyway:defaultSchema}].[RevenueRecognitionType]([ID]),
    CONSTRAINT FK_OrderLineRecognitionRebuild_RebuiltByUser FOREIGN KEY ([RebuiltByUserID])
        REFERENCES __mj.[User]([ID]),
    CONSTRAINT CK_OrderLineRecognitionRebuild_Reason CHECK (LEN(LTRIM(RTRIM([Reason]))) > 0),
    CONSTRAINT CK_OrderLineRecognitionRebuild_AmountReplaced CHECK ([AmountReplaced] >= 0),
    CONSTRAINT CK_OrderLineRecognitionRebuild_VoidedEntries CHECK (ISJSON([VoidedEntries]) = 1),
    CONSTRAINT CK_OrderLineRecognitionRebuild_CreatedEntries CHECK (ISJSON([CreatedEntries]) = 1)
);
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'One rebuild of a confirmed order line''s revenue recognition by Orders.RebuildRecognition: the entries still Pending in no batch were voided and a new schedule was staged from the product''s recognition type. Written by the operation only; never edited.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'OrderLineRecognitionRebuild';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The confirmed order line whose recognition was rebuilt.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'OrderLineRecognitionRebuild',
    @level2type = N'COLUMN', @level2name = N'OrderLineID';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The recognition type the new schedule was built from: the product''s type when the rebuild ran.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'OrderLineRecognitionRebuild',
    @level2type = N'COLUMN', @level2name = N'RevenueRecognitionTypeID';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The user who ran the rebuild.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'OrderLineRecognitionRebuild',
    @level2type = N'COLUMN', @level2name = N'RebuiltByUserID';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'When the rebuild ran.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'OrderLineRecognitionRebuild',
    @level2type = N'COLUMN', @level2name = N'RebuiltAt';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Why the schedule was rebuilt, as the user stated it. Also the reason recorded on each voided entry.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'OrderLineRecognitionRebuild',
    @level2type = N'COLUMN', @level2name = N'Reason';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'What the voided entries were going to recognize, and so what the new schedule recognizes.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'OrderLineRecognitionRebuild',
    @level2type = N'COLUMN', @level2name = N'AmountReplaced';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'JSON array of the entries voided: JournalEntryID, EntryNumber, EffectiveDate and Amount (what each released from Deferred Revenue).',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'OrderLineRecognitionRebuild',
    @level2type = N'COLUMN', @level2name = N'VoidedEntries';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'JSON array of the entries created: JournalEntryID, EntryNumber, EffectiveDate and Amount.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'OrderLineRecognitionRebuild',
    @level2type = N'COLUMN', @level2name = N'CreatedEntries';
GO
















































-- =============================================================================
--   CODEGEN OUTPUT — GENERATED CODE BELOW THIS LINE (do not hand-edit)
-- =============================================================================
/* SQL generated to create new entity MJ_BizApps_Orders: Order Line Recognition Rebuilds */

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
         [AllowCaching],
         [TrackRecordChanges],
         [AuditRecordAccess],
         [AuditViewRuns],
         [AllowAllRowsAPI],
         [AllowCreateAPI],
         [AllowUpdateAPI],
         [AllowDeleteAPI],
         [UserViewMaxRows]
         , [__mj_CreatedAt]
         , [__mj_UpdatedAt]
      )
      VALUES (
         'c3f9e190-2968-46ad-a045-539f885ab875',
         'MJ_BizApps_Orders: Order Line Recognition Rebuilds',
         'Order Line Recognition Rebuilds',
         'One rebuild of a confirmed order line''s revenue recognition by Orders.RebuildRecognition: the entries still Pending in no batch were voided and a new schedule was staged from the product''s recognition type. Written by the operation only; never edited.',
         NULL,
         'OrderLineRecognitionRebuild',
         'vwOrderLineRecognitionRebuilds',
         '${flyway:defaultSchema}',
         1,
         1,
         0,
         1,
         0,
         0,
         0,
         1,
         1,
         1,
         1000
         , GETUTCDATE()
         , GETUTCDATE()
      );

/* SQL generated to add entity MJ_BizApps_Orders: Order Line Recognition Rebuilds to application ID: 'FB80FEB4-5505-49D1-93CE-2E7BD030B478' */
INSERT INTO [${mjSchema}].[ApplicationEntity]
                                    ([ApplicationID], [EntityID], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                    ('FB80FEB4-5505-49D1-93CE-2E7BD030B478', 'c3f9e190-2968-46ad-a045-539f885ab875', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [${mjSchema}].[ApplicationEntity] WHERE [ApplicationID] = 'FB80FEB4-5505-49D1-93CE-2E7BD030B478'), GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ_BizApps_Orders: Order Line Recognition Rebuilds for role UI */
INSERT INTO [${mjSchema}].[EntityPermission]
                ([EntityID], [RoleID], [Type], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt])
              SELECT CAST('c3f9e190-2968-46ad-a045-539f885ab875' AS uniqueidentifier), CAST('E0AFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier), 'Allow', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE()
              WHERE NOT EXISTS (
                SELECT 1 FROM [${mjSchema}].[EntityPermission]
                WHERE [EntityID] = CAST('c3f9e190-2968-46ad-a045-539f885ab875' AS uniqueidentifier) AND [RoleID] = CAST('E0AFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier) AND [Type] = 'Allow'
              );

/* SQL generated to add new permission for entity MJ_BizApps_Orders: Order Line Recognition Rebuilds for role Developer */
INSERT INTO [${mjSchema}].[EntityPermission]
                ([EntityID], [RoleID], [Type], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt])
              SELECT CAST('c3f9e190-2968-46ad-a045-539f885ab875' AS uniqueidentifier), CAST('DEAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier), 'Allow', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE()
              WHERE NOT EXISTS (
                SELECT 1 FROM [${mjSchema}].[EntityPermission]
                WHERE [EntityID] = CAST('c3f9e190-2968-46ad-a045-539f885ab875' AS uniqueidentifier) AND [RoleID] = CAST('DEAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier) AND [Type] = 'Allow'
              );

/* SQL generated to add new permission for entity MJ_BizApps_Orders: Order Line Recognition Rebuilds for role Integration */
INSERT INTO [${mjSchema}].[EntityPermission]
                ([EntityID], [RoleID], [Type], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt])
              SELECT CAST('c3f9e190-2968-46ad-a045-539f885ab875' AS uniqueidentifier), CAST('DFAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier), 'Allow', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE()
              WHERE NOT EXISTS (
                SELECT 1 FROM [${mjSchema}].[EntityPermission]
                WHERE [EntityID] = CAST('c3f9e190-2968-46ad-a045-539f885ab875' AS uniqueidentifier) AND [RoleID] = CAST('DFAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier) AND [Type] = 'Allow'
              );

/* Seed Hierarchy.IsHierarchy on legacy self-referencing FK MJ_BizApps_Orders: Order Headers.ReversesOrderHeaderID */
UPDATE [${mjSchema}].[EntityField]
                         SET [Configuration] = '{"Hierarchy":{"IsHierarchy":true}}'
                         WHERE [ID] = 'BD321C1F-E9B0-461B-B8FE-EBCABDFE2B8B' AND ([Configuration] IS NULL OR [Configuration] = '');

/* Seed Hierarchy.IsHierarchy on legacy self-referencing FK MJ_BizApps_Orders: Products.SuccessorProductID */
UPDATE [${mjSchema}].[EntityField]
                         SET [Configuration] = '{"Hierarchy":{"IsHierarchy":true}}'
                         WHERE [ID] = '374CBCD0-42B9-489C-8CE4-65E0BB7EB526' AND ([Configuration] IS NULL OR [Configuration] = '');

/* Seed Hierarchy.IsHierarchy on legacy self-referencing FK MJ_BizApps_Orders: Order Lines.ReversesOrderLineID */
UPDATE [${mjSchema}].[EntityField]
                         SET [Configuration] = '{"Hierarchy":{"IsHierarchy":true}}'
                         WHERE [ID] = 'B0257954-BE16-442F-9B26-EA16F3748ABA' AND ([Configuration] IS NULL OR [Configuration] = '');

/* Seed Hierarchy.IsHierarchy on legacy self-referencing FK MJ_BizApps_Orders: Payment Headers.ReversesPaymentHeaderID */
UPDATE [${mjSchema}].[EntityField]
                         SET [Configuration] = '{"Hierarchy":{"IsHierarchy":true}}'
                         WHERE [ID] = '6442AF78-5005-4ED5-AB52-9D0F8A2DC782' AND ([Configuration] IS NULL OR [Configuration] = '');

/* Seed Hierarchy.IsHierarchy on legacy self-referencing FK MJ_BizApps_Orders: Subscriptions.MigratesFromSubscriptionID */
UPDATE [${mjSchema}].[EntityField]
                         SET [Configuration] = '{"Hierarchy":{"IsHierarchy":true}}'
                         WHERE [ID] = '0AE56005-B58D-4814-9018-21CAD598FB6C' AND ([Configuration] IS NULL OR [Configuration] = '');

/* Seed Hierarchy.IsHierarchy on legacy self-referencing FK MJ_BizApps_Orders: Subscriptions.MigratesToSubscriptionID */
UPDATE [${mjSchema}].[EntityField]
                         SET [Configuration] = '{"Hierarchy":{"IsHierarchy":true}}'
                         WHERE [ID] = '4CABB253-DA4B-4236-8F7E-A9B72F6230D9' AND ([Configuration] IS NULL OR [Configuration] = '');

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.OrderLineRecognitionRebuild */
ALTER TABLE [${flyway:defaultSchema}].[OrderLineRecognitionRebuild] ADD [__mj_CreatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.OrderLineRecognitionRebuild */
UPDATE [${flyway:defaultSchema}].[OrderLineRecognitionRebuild] SET [__mj_CreatedAt] = GETUTCDATE() WHERE [__mj_CreatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.OrderLineRecognitionRebuild */
ALTER TABLE [${flyway:defaultSchema}].[OrderLineRecognitionRebuild] ALTER COLUMN [__mj_CreatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.OrderLineRecognitionRebuild */
ALTER TABLE [${flyway:defaultSchema}].[OrderLineRecognitionRebuild] ADD CONSTRAINT [DF___mj_BizAppsOrders_OrderLineRecognitionRebuild___mj_CreatedAt] DEFAULT GETUTCDATE() FOR [__mj_CreatedAt];
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.OrderLineRecognitionRebuild */
ALTER TABLE [${flyway:defaultSchema}].[OrderLineRecognitionRebuild] ADD [__mj_UpdatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.OrderLineRecognitionRebuild */
UPDATE [${flyway:defaultSchema}].[OrderLineRecognitionRebuild] SET [__mj_UpdatedAt] = GETUTCDATE() WHERE [__mj_UpdatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.OrderLineRecognitionRebuild */
ALTER TABLE [${flyway:defaultSchema}].[OrderLineRecognitionRebuild] ALTER COLUMN [__mj_UpdatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.OrderLineRecognitionRebuild */
ALTER TABLE [${flyway:defaultSchema}].[OrderLineRecognitionRebuild] ADD CONSTRAINT [DF___mj_BizAppsOrders_OrderLineRecognitionRebuild___mj_UpdatedAt] DEFAULT GETUTCDATE() FOR [__mj_UpdatedAt];
GO

/* SQL text to insert 11 new entity field(s) */

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '87c4f32d-1b41-4681-8d2a-3199784efec6' OR (EntityID = 'C3F9E190-2968-46AD-A045-539F885AB875' AND Name = 'ID')) BEGIN
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
            '87c4f32d-1b41-4681-8d2a-3199784efec6',
            'C3F9E190-2968-46AD-A045-539F885AB875', -- Entity: MJ_BizApps_Orders: Order Line Recognition Rebuilds
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${mjSchema}].[EntityField] WHERE [EntityID] = 'C3F9E190-2968-46AD-A045-539F885AB875'),
            'ID',
            'ID',
            NULL,
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            'newsequentialid()',
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
            1,
            1,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '76939aa6-0d25-43e9-889e-156371b86e36' OR (EntityID = 'C3F9E190-2968-46AD-A045-539F885AB875' AND Name = 'OrderLineID')) BEGIN
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
            '76939aa6-0d25-43e9-889e-156371b86e36',
            'C3F9E190-2968-46AD-A045-539F885AB875', -- Entity: MJ_BizApps_Orders: Order Line Recognition Rebuilds
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${mjSchema}].[EntityField] WHERE [EntityID] = 'C3F9E190-2968-46AD-A045-539F885AB875'),
            'OrderLineID',
            'Order Line ID',
            'The confirmed order line whose recognition was rebuilt.',
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
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '653a9935-ef28-49be-991c-045faa28a39f' OR (EntityID = 'C3F9E190-2968-46AD-A045-539F885AB875' AND Name = 'RevenueRecognitionTypeID')) BEGIN
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
            '653a9935-ef28-49be-991c-045faa28a39f',
            'C3F9E190-2968-46AD-A045-539F885AB875', -- Entity: MJ_BizApps_Orders: Order Line Recognition Rebuilds
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${mjSchema}].[EntityField] WHERE [EntityID] = 'C3F9E190-2968-46AD-A045-539F885AB875'),
            'RevenueRecognitionTypeID',
            'Revenue Recognition Type ID',
            'The recognition type the new schedule was built from: the product''s type when the rebuild ran.',
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
            'B611425A-630F-4CF7-A639-02E5C938923A',
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '2ccab38a-316f-43ee-a0a3-671de637f7fa' OR (EntityID = 'C3F9E190-2968-46AD-A045-539F885AB875' AND Name = 'RebuiltByUserID')) BEGIN
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
            '2ccab38a-316f-43ee-a0a3-671de637f7fa',
            'C3F9E190-2968-46AD-A045-539F885AB875', -- Entity: MJ_BizApps_Orders: Order Line Recognition Rebuilds
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${mjSchema}].[EntityField] WHERE [EntityID] = 'C3F9E190-2968-46AD-A045-539F885AB875'),
            'RebuiltByUserID',
            'Rebuilt By User ID',
            'The user who ran the rebuild.',
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '4813f13f-c961-4e3d-b22f-b9fcfbbf8526' OR (EntityID = 'C3F9E190-2968-46AD-A045-539F885AB875' AND Name = 'RebuiltAt')) BEGIN
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
            '4813f13f-c961-4e3d-b22f-b9fcfbbf8526',
            'C3F9E190-2968-46AD-A045-539F885AB875', -- Entity: MJ_BizApps_Orders: Order Line Recognition Rebuilds
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${mjSchema}].[EntityField] WHERE [EntityID] = 'C3F9E190-2968-46AD-A045-539F885AB875'),
            'RebuiltAt',
            'Rebuilt At',
            'When the rebuild ran.',
            'datetimeoffset',
            10,
            34,
            7,
            0,
            'sysdatetimeoffset()',
            0,
            1,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            1,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '0eb0ae31-9b29-43ec-9195-3d659f8496bc' OR (EntityID = 'C3F9E190-2968-46AD-A045-539F885AB875' AND Name = 'Reason')) BEGIN
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
            '0eb0ae31-9b29-43ec-9195-3d659f8496bc',
            'C3F9E190-2968-46AD-A045-539F885AB875', -- Entity: MJ_BizApps_Orders: Order Line Recognition Rebuilds
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${mjSchema}].[EntityField] WHERE [EntityID] = 'C3F9E190-2968-46AD-A045-539F885AB875'),
            'Reason',
            'Reason',
            'Why the schedule was rebuilt, as the user stated it. Also the reason recorded on each voided entry.',
            'nvarchar',
            2000,
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '24b5fb89-d778-42d7-a9de-1da43795d8d0' OR (EntityID = 'C3F9E190-2968-46AD-A045-539F885AB875' AND Name = 'AmountReplaced')) BEGIN
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
            '24b5fb89-d778-42d7-a9de-1da43795d8d0',
            'C3F9E190-2968-46AD-A045-539F885AB875', -- Entity: MJ_BizApps_Orders: Order Line Recognition Rebuilds
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${mjSchema}].[EntityField] WHERE [EntityID] = 'C3F9E190-2968-46AD-A045-539F885AB875'),
            'AmountReplaced',
            'Amount Replaced',
            'What the voided entries were going to recognize, and so what the new schedule recognizes.',
            'decimal',
            9,
            18,
            2,
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '3ab9a473-5eb9-4dc0-995e-afc74c28e7b2' OR (EntityID = 'C3F9E190-2968-46AD-A045-539F885AB875' AND Name = 'VoidedEntries')) BEGIN
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
            '3ab9a473-5eb9-4dc0-995e-afc74c28e7b2',
            'C3F9E190-2968-46AD-A045-539F885AB875', -- Entity: MJ_BizApps_Orders: Order Line Recognition Rebuilds
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${mjSchema}].[EntityField] WHERE [EntityID] = 'C3F9E190-2968-46AD-A045-539F885AB875'),
            'VoidedEntries',
            'Voided Entries',
            'JSON array of the entries voided: JournalEntryID, EntryNumber, EffectiveDate and Amount (what each released from Deferred Revenue).',
            'nvarchar',
            -1,
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = 'b8182851-419c-455e-8058-afed38a3f7f0' OR (EntityID = 'C3F9E190-2968-46AD-A045-539F885AB875' AND Name = 'CreatedEntries')) BEGIN
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
            'b8182851-419c-455e-8058-afed38a3f7f0',
            'C3F9E190-2968-46AD-A045-539F885AB875', -- Entity: MJ_BizApps_Orders: Order Line Recognition Rebuilds
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${mjSchema}].[EntityField] WHERE [EntityID] = 'C3F9E190-2968-46AD-A045-539F885AB875'),
            'CreatedEntries',
            'Created Entries',
            'JSON array of the entries created: JournalEntryID, EntryNumber, EffectiveDate and Amount.',
            'nvarchar',
            -1,
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '76b1417b-5fff-46eb-8682-c6ef2ebabaef' OR (EntityID = 'C3F9E190-2968-46AD-A045-539F885AB875' AND Name = '__mj_CreatedAt')) BEGIN
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
            '76b1417b-5fff-46eb-8682-c6ef2ebabaef',
            'C3F9E190-2968-46AD-A045-539F885AB875', -- Entity: MJ_BizApps_Orders: Order Line Recognition Rebuilds
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${mjSchema}].[EntityField] WHERE [EntityID] = 'C3F9E190-2968-46AD-A045-539F885AB875'),
            '__mj_CreatedAt',
            'Created At',
            NULL,
            'datetimeoffset',
            10,
            34,
            7,
            0,
            'getutcdate()',
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '8adf842b-c4c1-4fb0-8d76-27bcbce816a0' OR (EntityID = 'C3F9E190-2968-46AD-A045-539F885AB875' AND Name = '__mj_UpdatedAt')) BEGIN
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
            '8adf842b-c4c1-4fb0-8d76-27bcbce816a0',
            'C3F9E190-2968-46AD-A045-539F885AB875', -- Entity: MJ_BizApps_Orders: Order Line Recognition Rebuilds
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${mjSchema}].[EntityField] WHERE [EntityID] = 'C3F9E190-2968-46AD-A045-539F885AB875'),
            '__mj_UpdatedAt',
            'Updated At',
            NULL,
            'datetimeoffset',
            10,
            34,
            7,
            0,
            'getutcdate()',
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

/* Create Entity Relationship: MJ_BizApps_Orders: Revenue Recognition Types -> MJ_BizApps_Orders: Order Line Recognition Rebuilds (One To Many via RevenueRecognitionTypeID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${mjSchema}].[EntityRelationship] WHERE [ID] = '27c2ab2c-74b6-486f-9eeb-a821dc8cf9ce' OR ([EntityID] = 'B611425A-630F-4CF7-A639-02E5C938923A' AND [RelatedEntityID] = 'C3F9E190-2968-46AD-A045-539F885AB875' AND [RelatedEntityJoinField] = 'RevenueRecognitionTypeID')
   )
   BEGIN
      INSERT INTO [${mjSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('27c2ab2c-74b6-486f-9eeb-a821dc8cf9ce', 'B611425A-630F-4CF7-A639-02E5C938923A', 'C3F9E190-2968-46AD-A045-539F885AB875', 'RevenueRecognitionTypeID', 'One To Many', 1, 1, 4, GETUTCDATE(), GETUTCDATE())
   END;


/* Create Entity Relationship: MJ_BizApps_Orders: Order Lines -> MJ_BizApps_Orders: Order Line Recognition Rebuilds (One To Many via OrderLineID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${mjSchema}].[EntityRelationship] WHERE [ID] = '5c043db2-b897-4e11-924e-277f3e7e9396' OR ([EntityID] = '66D82C24-9C9F-4CD6-B019-53C20274AB00' AND [RelatedEntityID] = 'C3F9E190-2968-46AD-A045-539F885AB875' AND [RelatedEntityJoinField] = 'OrderLineID')
   )
   BEGIN
      INSERT INTO [${mjSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('5c043db2-b897-4e11-924e-277f3e7e9396', '66D82C24-9C9F-4CD6-B019-53C20274AB00', 'C3F9E190-2968-46AD-A045-539F885AB875', 'OrderLineID', 'One To Many', 1, 1, 18, GETUTCDATE(), GETUTCDATE())
   END;


/* Create Entity Relationship: MJ: Users -> MJ_BizApps_Orders: Order Line Recognition Rebuilds (One To Many via RebuiltByUserID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${mjSchema}].[EntityRelationship] WHERE [ID] = '1f0f0c88-cdd7-4880-a4e3-126aa617b339' OR ([EntityID] = 'E1238F34-2837-EF11-86D4-6045BDEE16E6' AND [RelatedEntityID] = 'C3F9E190-2968-46AD-A045-539F885AB875' AND [RelatedEntityJoinField] = 'RebuiltByUserID')
   )
   BEGIN
      INSERT INTO [${mjSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('1f0f0c88-cdd7-4880-a4e3-126aa617b339', 'E1238F34-2837-EF11-86D4-6045BDEE16E6', 'C3F9E190-2968-46AD-A045-539F885AB875', 'RebuiltByUserID', 'One To Many', 1, 1, 166, GETUTCDATE(), GETUTCDATE())
   END;

/* Index for Foreign Keys for OrderLineRecognitionRebuild */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Order Line Recognition Rebuilds
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key OrderLineID in table OrderLineRecognitionRebuild
-- Skipped when the index exists or another unfiltered index already leads with the column.
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_OrderLineRecognitionRebuild_OrderLineID'
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[OrderLineRecognitionRebuild]')
    UNION ALL
    SELECT 1
    FROM sys.indexes i
    WHERE i.object_id = OBJECT_ID('[${flyway:defaultSchema}].[OrderLineRecognitionRebuild]')
    AND i.has_filter = 0
    AND i.is_disabled = 0
    AND i.is_hypothetical = 0
    AND (
        SELECT COUNT(*)
        FROM sys.index_columns ic
        WHERE ic.object_id = i.object_id
        AND ic.index_id = i.index_id
        AND ic.is_included_column = 0
        AND ((ic.key_ordinal = 1 AND COL_NAME(ic.object_id, ic.column_id) = 'OrderLineID'))
    ) = 1
)
CREATE INDEX IDX_AUTO_MJ_FKEY_OrderLineRecognitionRebuild_OrderLineID ON [${flyway:defaultSchema}].[OrderLineRecognitionRebuild] ([OrderLineID]);

-- Index for foreign key RevenueRecognitionTypeID in table OrderLineRecognitionRebuild
-- Skipped when the index exists or another unfiltered index already leads with the column.
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_OrderLineRecognitionRebuild_RevenueRecognitionTypeID'
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[OrderLineRecognitionRebuild]')
    UNION ALL
    SELECT 1
    FROM sys.indexes i
    WHERE i.object_id = OBJECT_ID('[${flyway:defaultSchema}].[OrderLineRecognitionRebuild]')
    AND i.has_filter = 0
    AND i.is_disabled = 0
    AND i.is_hypothetical = 0
    AND (
        SELECT COUNT(*)
        FROM sys.index_columns ic
        WHERE ic.object_id = i.object_id
        AND ic.index_id = i.index_id
        AND ic.is_included_column = 0
        AND ((ic.key_ordinal = 1 AND COL_NAME(ic.object_id, ic.column_id) = 'RevenueRecognitionTypeID'))
    ) = 1
)
CREATE INDEX IDX_AUTO_MJ_FKEY_OrderLineRecognitionRebuild_RevenueRecognitionTypeID ON [${flyway:defaultSchema}].[OrderLineRecognitionRebuild] ([RevenueRecognitionTypeID]);

-- Index for foreign key RebuiltByUserID in table OrderLineRecognitionRebuild
-- Skipped when the index exists or another unfiltered index already leads with the column.
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_OrderLineRecognitionRebuild_RebuiltByUserID'
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[OrderLineRecognitionRebuild]')
    UNION ALL
    SELECT 1
    FROM sys.indexes i
    WHERE i.object_id = OBJECT_ID('[${flyway:defaultSchema}].[OrderLineRecognitionRebuild]')
    AND i.has_filter = 0
    AND i.is_disabled = 0
    AND i.is_hypothetical = 0
    AND (
        SELECT COUNT(*)
        FROM sys.index_columns ic
        WHERE ic.object_id = i.object_id
        AND ic.index_id = i.index_id
        AND ic.is_included_column = 0
        AND ((ic.key_ordinal = 1 AND COL_NAME(ic.object_id, ic.column_id) = 'RebuiltByUserID'))
    ) = 1
)
CREATE INDEX IDX_AUTO_MJ_FKEY_OrderLineRecognitionRebuild_RebuiltByUserID ON [${flyway:defaultSchema}].[OrderLineRecognitionRebuild] ([RebuiltByUserID]);

/* Base View SQL for MJ_BizApps_Orders: Order Line Recognition Rebuilds */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Order Line Recognition Rebuilds
-- Item: vwOrderLineRecognitionRebuilds
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ_BizApps_Orders: Order Line Recognition Rebuilds
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  OrderLineRecognitionRebuild
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwOrderLineRecognitionRebuilds]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwOrderLineRecognitionRebuilds];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwOrderLineRecognitionRebuilds]
AS
SELECT
    o.*,
    mjBizAppsOrdersRevenueRecognitionType_RevenueRecognitionTypeID.[Name] AS [RevenueRecognitionType],
    MJUser_RebuiltByUserID.[Name] AS [RebuiltByUser]
FROM
    [${flyway:defaultSchema}].[OrderLineRecognitionRebuild] AS o
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[RevenueRecognitionType] AS mjBizAppsOrdersRevenueRecognitionType_RevenueRecognitionTypeID
  ON
    [o].[RevenueRecognitionTypeID] = mjBizAppsOrdersRevenueRecognitionType_RevenueRecognitionTypeID.[ID]
LEFT OUTER JOIN
    [${mjSchema}].[User] AS MJUser_RebuiltByUserID
  ON
    [o].[RebuiltByUserID] = MJUser_RebuiltByUserID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwOrderLineRecognitionRebuilds] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for MJ_BizApps_Orders: Order Line Recognition Rebuilds */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Order Line Recognition Rebuilds
-- Item: Permissions for vwOrderLineRecognitionRebuilds
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwOrderLineRecognitionRebuilds] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for MJ_BizApps_Orders: Order Line Recognition Rebuilds */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Order Line Recognition Rebuilds
-- Item: spCreateOrderLineRecognitionRebuild
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR OrderLineRecognitionRebuild
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateOrderLineRecognitionRebuild]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateOrderLineRecognitionRebuild];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateOrderLineRecognitionRebuild]
    @ID uniqueidentifier = NULL,
    @OrderLineID uniqueidentifier,
    @RevenueRecognitionTypeID uniqueidentifier,
    @RebuiltByUserID uniqueidentifier,
    @RebuiltAt datetimeoffset = NULL,
    @Reason nvarchar(1000),
    @AmountReplaced decimal(18, 2),
    @VoidedEntries nvarchar(MAX),
    @CreatedEntries nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)

    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[OrderLineRecognitionRebuild]
            (
                [ID],
                [OrderLineID],
                [RevenueRecognitionTypeID],
                [RebuiltByUserID],
                [RebuiltAt],
                [Reason],
                [AmountReplaced],
                [VoidedEntries],
                [CreatedEntries]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @OrderLineID,
                @RevenueRecognitionTypeID,
                @RebuiltByUserID,
                ISNULL(@RebuiltAt, sysdatetimeoffset()),
                @Reason,
                @AmountReplaced,
                @VoidedEntries,
                @CreatedEntries
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[OrderLineRecognitionRebuild]
            (
                [OrderLineID],
                [RevenueRecognitionTypeID],
                [RebuiltByUserID],
                [RebuiltAt],
                [Reason],
                [AmountReplaced],
                [VoidedEntries],
                [CreatedEntries]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @OrderLineID,
                @RevenueRecognitionTypeID,
                @RebuiltByUserID,
                ISNULL(@RebuiltAt, sysdatetimeoffset()),
                @Reason,
                @AmountReplaced,
                @VoidedEntries,
                @CreatedEntries
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwOrderLineRecognitionRebuilds] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateOrderLineRecognitionRebuild] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ_BizApps_Orders: Order Line Recognition Rebuilds */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateOrderLineRecognitionRebuild] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for MJ_BizApps_Orders: Order Line Recognition Rebuilds */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Order Line Recognition Rebuilds
-- Item: spUpdateOrderLineRecognitionRebuild
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR OrderLineRecognitionRebuild
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateOrderLineRecognitionRebuild]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateOrderLineRecognitionRebuild];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateOrderLineRecognitionRebuild]
    @ID uniqueidentifier,
    @OrderLineID uniqueidentifier = NULL,
    @RevenueRecognitionTypeID uniqueidentifier = NULL,
    @RebuiltByUserID uniqueidentifier = NULL,
    @RebuiltAt datetimeoffset = NULL,
    @Reason nvarchar(1000) = NULL,
    @AmountReplaced decimal(18, 2) = NULL,
    @VoidedEntries nvarchar(MAX) = NULL,
    @CreatedEntries nvarchar(MAX) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[OrderLineRecognitionRebuild]
    SET
        [OrderLineID] = ISNULL(@OrderLineID, [OrderLineID]),
        [RevenueRecognitionTypeID] = ISNULL(@RevenueRecognitionTypeID, [RevenueRecognitionTypeID]),
        [RebuiltByUserID] = ISNULL(@RebuiltByUserID, [RebuiltByUserID]),
        [RebuiltAt] = ISNULL(@RebuiltAt, [RebuiltAt]),
        [Reason] = ISNULL(@Reason, [Reason]),
        [AmountReplaced] = ISNULL(@AmountReplaced, [AmountReplaced]),
        [VoidedEntries] = ISNULL(@VoidedEntries, [VoidedEntries]),
        [CreatedEntries] = ISNULL(@CreatedEntries, [CreatedEntries]),
        [__mj_UpdatedAt] = GETUTCDATE()
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwOrderLineRecognitionRebuilds] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwOrderLineRecognitionRebuilds]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateOrderLineRecognitionRebuild] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the OrderLineRecognitionRebuild table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateOrderLineRecognitionRebuild]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateOrderLineRecognitionRebuild];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateOrderLineRecognitionRebuild
ON [${flyway:defaultSchema}].[OrderLineRecognitionRebuild]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    IF NOT UPDATE([__mj_UpdatedAt])
    BEGIN
        UPDATE
            [${flyway:defaultSchema}].[OrderLineRecognitionRebuild]
        SET
            __mj_UpdatedAt = GETUTCDATE()
        FROM
            [${flyway:defaultSchema}].[OrderLineRecognitionRebuild] AS _organicTable
        INNER JOIN
            INSERTED AS I ON
            _organicTable.[ID] = I.[ID];
    END
END;
GO

/* spUpdate Permissions for MJ_BizApps_Orders: Order Line Recognition Rebuilds */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateOrderLineRecognitionRebuild] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for MJ_BizApps_Orders: Order Line Recognition Rebuilds */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Order Line Recognition Rebuilds
-- Item: spDeleteOrderLineRecognitionRebuild
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR OrderLineRecognitionRebuild
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteOrderLineRecognitionRebuild]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteOrderLineRecognitionRebuild];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteOrderLineRecognitionRebuild]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[OrderLineRecognitionRebuild]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteOrderLineRecognitionRebuild] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for MJ_BizApps_Orders: Order Line Recognition Rebuilds */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteOrderLineRecognitionRebuild] TO [cdp_Developer], [cdp_Integration];

/* SQL text to insert 2 new entity field(s) */

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = 'de9bc1ba-a83e-437e-8d06-8f80db7d224f' OR (EntityID = 'C3F9E190-2968-46AD-A045-539F885AB875' AND Name = 'RevenueRecognitionType')) BEGIN
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
            'de9bc1ba-a83e-437e-8d06-8f80db7d224f',
            'C3F9E190-2968-46AD-A045-539F885AB875', -- Entity: MJ_BizApps_Orders: Order Line Recognition Rebuilds
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${mjSchema}].[EntityField] WHERE [EntityID] = 'C3F9E190-2968-46AD-A045-539F885AB875'),
            'RevenueRecognitionType',
            'Revenue Recognition Type',
            NULL,
            'nvarchar',
            400,
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '22d72278-b7e7-410f-8501-d705669badaa' OR (EntityID = 'C3F9E190-2968-46AD-A045-539F885AB875' AND Name = 'RebuiltByUser')) BEGIN
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
            '22d72278-b7e7-410f-8501-d705669badaa',
            'C3F9E190-2968-46AD-A045-539F885AB875', -- Entity: MJ_BizApps_Orders: Order Line Recognition Rebuilds
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${mjSchema}].[EntityField] WHERE [EntityID] = 'C3F9E190-2968-46AD-A045-539F885AB875'),
            'RebuiltByUser',
            'Rebuilt By User',
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

/* Set categories for 13 fields */

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Order Line Recognition Rebuilds.ID 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '87C4F32D-1B41-4681-8D2A-3199784EFEC6';

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Order Line Recognition Rebuilds.OrderLineID 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'Recognition Rebuild Details',
   GeneratedFormSection = 'Category',
   DisplayName = 'Order Line'
WHERE 
   ID = '76939AA6-0D25-43E9-889E-156371B86E36';

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Order Line Recognition Rebuilds.RevenueRecognitionTypeID 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'Recognition Rebuild Details',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '653A9935-EF28-49BE-991C-045FAA28A39F';

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Order Line Recognition Rebuilds.RebuiltByUserID 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'Recognition Rebuild Details',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '2CCAB38A-316F-43EE-A0A3-671DE637F7FA';

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Order Line Recognition Rebuilds.RebuiltAt 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'Recognition Rebuild Details',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '4813F13F-C961-4E3D-B22F-B9FCFBBF8526';

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Order Line Recognition Rebuilds.Reason 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'Recognition Rebuild Details',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '0EB0AE31-9B29-43EC-9195-3D659F8496BC';

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Order Line Recognition Rebuilds.AmountReplaced 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'Recognition Rebuild Details',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '24B5FB89-D778-42D7-A9DE-1DA43795D8D0';

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Order Line Recognition Rebuilds.VoidedEntries 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'Journal Entries',
   GeneratedFormSection = 'Category',
   ExtendedType = 'JSON'
WHERE 
   ID = '3AB9A473-5EB9-4DC0-995E-AFC74C28E7B2';

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Order Line Recognition Rebuilds.CreatedEntries 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'Journal Entries',
   GeneratedFormSection = 'Category',
   ExtendedType = 'JSON'
WHERE 
   ID = 'B8182851-419C-455E-8058-AFED38A3F7F0';

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Order Line Recognition Rebuilds.__mj_CreatedAt 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '76B1417B-5FFF-46EB-8682-C6EF2EBABAEF';

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Order Line Recognition Rebuilds.__mj_UpdatedAt 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '8ADF842B-C4C1-4FB0-8D76-27BCBCE816A0';

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Order Line Recognition Rebuilds.RevenueRecognitionType 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'Recognition Rebuild Details',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'DE9BC1BA-A83E-437E-8D06-8F80DB7D224F';

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Order Line Recognition Rebuilds.RebuiltByUser 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'Recognition Rebuild Details',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '22D72278-B7E7-410F-8501-D705669BADAA';

/* Set entity icon to fa fa-history */

               UPDATE [${mjSchema}].[Entity]
               SET [Icon] = 'fa fa-history', [__mj_UpdatedAt] = GETUTCDATE()
               WHERE [ID] = 'C3F9E190-2968-46AD-A045-539F885AB875';

/* Insert FieldCategoryInfo setting for entity */
IF NOT EXISTS (
      SELECT 1 FROM [${mjSchema}].[EntitySetting] WHERE [EntityID] = 'C3F9E190-2968-46AD-A045-539F885AB875' AND [Name] = 'FieldCategoryInfo'
   )
   BEGIN
      INSERT INTO [${mjSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('10bd4c87-ceb7-5c14-8cab-4671b8a67068', 'C3F9E190-2968-46AD-A045-539F885AB875', 'FieldCategoryInfo', '{
  "Journal Entries": {
    "description": "JSON data tracking voided and newly created journal entries",
    "icon": "fa fa-file-invoice-dollar"
  },
  "Recognition Rebuild Details": {
    "description": "Details regarding the order line revenue recognition rebuild process and user actions",
    "icon": "fa fa-redo"
  },
  "System Metadata": {
    "description": "System-managed audit and tracking fields",
    "icon": "fa fa-cog"
  }
}', GETUTCDATE(), GETUTCDATE())
   END;

/* Insert FieldCategoryIcons setting (legacy) */
IF NOT EXISTS (
      SELECT 1 FROM [${mjSchema}].[EntitySetting] WHERE [EntityID] = 'C3F9E190-2968-46AD-A045-539F885AB875' AND [Name] = 'FieldCategoryIcons'
   )
   BEGIN
      INSERT INTO [${mjSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('00e8bd85-6c48-509b-8a63-0b0b43eec7a7', 'C3F9E190-2968-46AD-A045-539F885AB875', 'FieldCategoryIcons', '{
  "Journal Entries": "fa fa-file-invoice-dollar",
  "Recognition Rebuild Details": "fa fa-redo",
  "System Metadata": "fa fa-cog"
}', GETUTCDATE(), GETUTCDATE())
   END;

/* Set DefaultForNewUser=false for NEW entity (category: supporting, confidence: high) */

         UPDATE [${mjSchema}].[ApplicationEntity]
         SET [DefaultForNewUser] = 0, [__mj_UpdatedAt] = GETUTCDATE()
         WHERE [EntityID] = 'C3F9E190-2968-46AD-A045-539F885AB875';

/* Generated Validation Functions for MJ_BizApps_Orders: Order Line Recognition Rebuilds */
-- CHECK constraint for MJ_BizApps_Orders: Order Line Recognition Rebuilds: Field: AmountReplaced was newly set or modified since the last generation of the validation function, the code was regenerated and updating the GeneratedCode table with the new generated validation function
IF NOT EXISTS (
      SELECT 1 FROM [${mjSchema}].[GeneratedCode] WHERE [CategoryID] = (SELECT [ID] FROM [${mjSchema}].[vwGeneratedCodeCategories] WHERE [Name]='CodeGen: Validators') AND [LinkedEntityID] = 'DF238F34-2837-EF11-86D4-6045BDEE16E6' AND [LinkedRecordPrimaryKey] = '24B5FB89-D778-42D7-A9DE-1DA43795D8D0'
   )
   BEGIN
      INSERT INTO [${mjSchema}].[GeneratedCode] ([ID], [CategoryID], [GeneratedByModelID], [GeneratedAt], [Language], [Status], [Source], [Code], [Description], [Name], [LinkedEntityID], [LinkedRecordPrimaryKey])
VALUES ('ff0aeac8-8291-4fa6-991c-68fa07f7c05b', (SELECT [ID] FROM [${mjSchema}].[vwGeneratedCodeCategories] WHERE [Name]='CodeGen: Validators'), '4B500A24-0259-4EFF-9E34-24E9F5EC9DAB', GETUTCDATE(), 'TypeScript', 'Approved', '([AmountReplaced]>=(0))', 'public ValidateAmountReplacedNonNegative(result: ValidationResult) {
	if (this.AmountReplaced != null && this.AmountReplaced < 0) {
		result.Errors.push(new ValidationErrorInfo(
			"AmountReplaced",
			"Amount replaced must be greater than or equal to zero.",
			this.AmountReplaced,
			ValidationErrorType.Failure
		));
	}
}', 'The replaced amount must be zero or greater.', 'ValidateAmountReplacedNonNegative', 'DF238F34-2837-EF11-86D4-6045BDEE16E6', '24B5FB89-D778-42D7-A9DE-1DA43795D8D0')
   END;

-- CHECK constraint for MJ_BizApps_Orders: Order Line Recognition Rebuilds: Field: CreatedEntries was newly set or modified since the last generation of the validation function, the code was regenerated and updating the GeneratedCode table with the new generated validation function
IF NOT EXISTS (
      SELECT 1 FROM [${mjSchema}].[GeneratedCode] WHERE [CategoryID] = (SELECT [ID] FROM [${mjSchema}].[vwGeneratedCodeCategories] WHERE [Name]='CodeGen: Validators') AND [LinkedEntityID] = 'DF238F34-2837-EF11-86D4-6045BDEE16E6' AND [LinkedRecordPrimaryKey] = 'B8182851-419C-455E-8058-AFED38A3F7F0'
   )
   BEGIN
      INSERT INTO [${mjSchema}].[GeneratedCode] ([ID], [CategoryID], [GeneratedByModelID], [GeneratedAt], [Language], [Status], [Source], [Code], [Description], [Name], [LinkedEntityID], [LinkedRecordPrimaryKey])
VALUES ('b9b4c5dc-50e1-4c0d-8de9-fc37feb1c355', (SELECT [ID] FROM [${mjSchema}].[vwGeneratedCodeCategories] WHERE [Name]='CodeGen: Validators'), '4B500A24-0259-4EFF-9E34-24E9F5EC9DAB', GETUTCDATE(), 'TypeScript', 'Approved', '(isjson([CreatedEntries])=(1))', 'public ValidateCreatedEntriesIsValidJson(result: ValidationResult) {
	if (this.CreatedEntries != null) {
		try {
			JSON.parse(this.CreatedEntries);
		} catch {
			result.Errors.push(new ValidationErrorInfo(
				"CreatedEntries",
				"Created entries must be a valid JSON string.",
				this.CreatedEntries,
				ValidationErrorType.Failure
			));
		}
	}
}', 'Created entries must contain valid JSON formatting to properly record generated audit or accounting transaction data.', 'ValidateCreatedEntriesIsValidJson', 'DF238F34-2837-EF11-86D4-6045BDEE16E6', 'B8182851-419C-455E-8058-AFED38A3F7F0')
   END;

-- CHECK constraint for MJ_BizApps_Orders: Order Line Recognition Rebuilds: Field: Reason was newly set or modified since the last generation of the validation function, the code was regenerated and updating the GeneratedCode table with the new generated validation function
IF NOT EXISTS (
      SELECT 1 FROM [${mjSchema}].[GeneratedCode] WHERE [CategoryID] = (SELECT [ID] FROM [${mjSchema}].[vwGeneratedCodeCategories] WHERE [Name]='CodeGen: Validators') AND [LinkedEntityID] = 'DF238F34-2837-EF11-86D4-6045BDEE16E6' AND [LinkedRecordPrimaryKey] = '0EB0AE31-9B29-43EC-9195-3D659F8496BC'
   )
   BEGIN
      INSERT INTO [${mjSchema}].[GeneratedCode] ([ID], [CategoryID], [GeneratedByModelID], [GeneratedAt], [Language], [Status], [Source], [Code], [Description], [Name], [LinkedEntityID], [LinkedRecordPrimaryKey])
VALUES ('9257b418-c42a-4d05-a7d9-855e58078edd', (SELECT [ID] FROM [${mjSchema}].[vwGeneratedCodeCategories] WHERE [Name]='CodeGen: Validators'), '4B500A24-0259-4EFF-9E34-24E9F5EC9DAB', GETUTCDATE(), 'TypeScript', 'Approved', '(len(ltrim(rtrim([Reason])))>(0))', 'public ValidateReasonNotEmpty(result: ValidationResult): void {
	if (this.Reason == null || this.Reason.trim().length === 0) {
		result.Errors.push(new ValidationErrorInfo(
			"Reason",
			"A reason must be provided and cannot be blank.",
			this.Reason,
			ValidationErrorType.Failure
		));
	}
}', 'A non-empty reason must be provided and cannot consist solely of whitespace.', 'ValidateReasonNotEmpty', 'DF238F34-2837-EF11-86D4-6045BDEE16E6', '0EB0AE31-9B29-43EC-9195-3D659F8496BC')
   END;

-- CHECK constraint for MJ_BizApps_Orders: Order Line Recognition Rebuilds: Field: VoidedEntries was newly set or modified since the last generation of the validation function, the code was regenerated and updating the GeneratedCode table with the new generated validation function
IF NOT EXISTS (
      SELECT 1 FROM [${mjSchema}].[GeneratedCode] WHERE [CategoryID] = (SELECT [ID] FROM [${mjSchema}].[vwGeneratedCodeCategories] WHERE [Name]='CodeGen: Validators') AND [LinkedEntityID] = 'DF238F34-2837-EF11-86D4-6045BDEE16E6' AND [LinkedRecordPrimaryKey] = '3AB9A473-5EB9-4DC0-995E-AFC74C28E7B2'
   )
   BEGIN
      INSERT INTO [${mjSchema}].[GeneratedCode] ([ID], [CategoryID], [GeneratedByModelID], [GeneratedAt], [Language], [Status], [Source], [Code], [Description], [Name], [LinkedEntityID], [LinkedRecordPrimaryKey])
VALUES ('e273ebcc-c284-4572-ab50-f5c338bc2fbb', (SELECT [ID] FROM [${mjSchema}].[vwGeneratedCodeCategories] WHERE [Name]='CodeGen: Validators'), '4B500A24-0259-4EFF-9E34-24E9F5EC9DAB', GETUTCDATE(), 'TypeScript', 'Approved', '(isjson([VoidedEntries])=(1))', 'public ValidateVoidedEntriesIsValidJson(result: ValidationResult) {
	if (this.VoidedEntries != null) {
		try {
			JSON.parse(this.VoidedEntries);
		} catch (e) {
			result.Errors.push(new ValidationErrorInfo(
				"VoidedEntries",
				"Voided entries must be a valid JSON string.",
				this.VoidedEntries,
				ValidationErrorType.Failure
			));
		}
	}
}', 'Voided entries must be stored as a valid JSON string.', 'ValidateVoidedEntriesIsValidJson', 'DF238F34-2837-EF11-86D4-6045BDEE16E6', '3AB9A473-5EB9-4DC0-995E-AFC74C28E7B2')
   END;
