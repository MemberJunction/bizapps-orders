-- =============================================================================
-- V202609291304 — Checkout question answers (bizapps-orders#322)
-- =============================================================================
-- A checkout widget can ask the buyer questions that are not columns on any
-- entity, such as "How did you hear about us?" chosen from a list, with a
-- free-text answer when the buyer picks "Other". The questions are defined in
-- the widget's Configuration.
--
-- OrderCheckoutAnswer records the buyer's answers on the order the checkout
-- confirmed: one row per order per question. The question's label is copied at
-- order time, so a later edit to the widget does not change what the buyer was
-- asked.
--
-- CodeGen output for this table is folded below the banner at the end of this file.
-- =============================================================================

CREATE TABLE [${flyway:defaultSchema}].[OrderCheckoutAnswer] (
    [ID]            UNIQUEIDENTIFIER NOT NULL CONSTRAINT [DF_OrderCheckoutAnswer_ID] DEFAULT (newsequentialid()),
    [OrderHeaderID] UNIQUEIDENTIFIER NOT NULL,
    [QuestionKey]   NVARCHAR(100)    NOT NULL,
    [QuestionLabel] NVARCHAR(500)    NOT NULL,
    [Answer]        NVARCHAR(1000)   NOT NULL,
    [OtherText]     NVARCHAR(1000)   NULL,

    CONSTRAINT [PK_OrderCheckoutAnswer] PRIMARY KEY CLUSTERED ([ID]),
    CONSTRAINT [FK_OrderCheckoutAnswer_OrderHeader] FOREIGN KEY ([OrderHeaderID])
        REFERENCES [${flyway:defaultSchema}].[OrderHeader]([ID]),
    CONSTRAINT [UQ_OrderCheckoutAnswer_Order_Question] UNIQUE ([OrderHeaderID], [QuestionKey])
);
GO

-- Descriptions: MS_Description is what CodeGen carries into EntityField.Description.
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The buyer''s answer to one question a checkout widget asked before payment, recorded on the order the checkout confirmed. The questions are defined in the widget''s Configuration.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'OrderCheckoutAnswer';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The order the checkout confirmed.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'OrderCheckoutAnswer',
    @level2type = N'COLUMN', @level2name = N'OrderHeaderID';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The question''s key in the widget''s Configuration. Stable across label edits, so answers to the same question can be reported together.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'OrderCheckoutAnswer',
    @level2type = N'COLUMN', @level2name = N'QuestionKey';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The question as the buyer saw it, copied at order time.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'OrderCheckoutAnswer',
    @level2type = N'COLUMN', @level2name = N'QuestionLabel';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The answer. For a select question, the value of the option the buyer chose; for a text question, the text entered.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'OrderCheckoutAnswer',
    @level2type = N'COLUMN', @level2name = N'Answer';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The free-text answer the buyer gave after choosing the question''s "Other" option. NULL for any other answer.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'OrderCheckoutAnswer',
    @level2type = N'COLUMN', @level2name = N'OtherText';
GO


















































-- =============================================================================
-- CODEGEN OUTPUT — GENERATED CODE BELOW THIS LINE. DO NOT EDIT BY HAND.
-- This app's own CodeGen SQL for the OrderCheckoutAnswer entity (its metadata,
-- relationship, view, CRUD procs and permissions) is folded here.
-- (Every Sequence is written as MAX + 1 rather than CodeGen's literal, so it cannot collide with UQ_EntityField_EntityID_Sequence on another database.)
-- =============================================================================

/* SQL generated to create new entity MJ_BizApps_Orders: Order Checkout Answers */

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
         '2719a581-1fe7-4728-9649-5b95175ae1f9',
         'MJ_BizApps_Orders: Order Checkout Answers',
         'Order Checkout Answers',
         'The buyer''s answer to one question a checkout widget asked before payment, recorded on the order the checkout confirmed. The questions are defined in the widget''s Configuration.',
         NULL,
         'OrderCheckoutAnswer',
         'vwOrderCheckoutAnswers',
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

/* SQL generated to add new entity MJ_BizApps_Orders: Order Checkout Answers to application ID: 'FB80FEB4-5505-49D1-93CE-2E7BD030B478' */
INSERT INTO [${mjSchema}].[ApplicationEntity]
                                       ([ApplicationID], [EntityID], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                       ('FB80FEB4-5505-49D1-93CE-2E7BD030B478', '2719a581-1fe7-4728-9649-5b95175ae1f9', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [${mjSchema}].[ApplicationEntity] WHERE [ApplicationID] = 'FB80FEB4-5505-49D1-93CE-2E7BD030B478'), GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ_BizApps_Orders: Order Checkout Answers for role UI */
INSERT INTO [${mjSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('2719a581-1fe7-4728-9649-5b95175ae1f9', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ_BizApps_Orders: Order Checkout Answers for role Developer */
INSERT INTO [${mjSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('2719a581-1fe7-4728-9649-5b95175ae1f9', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ_BizApps_Orders: Order Checkout Answers for role Integration */
INSERT INTO [${mjSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('2719a581-1fe7-4728-9649-5b95175ae1f9', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.OrderCheckoutAnswer */
ALTER TABLE [${flyway:defaultSchema}].[OrderCheckoutAnswer] ADD [__mj_CreatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.OrderCheckoutAnswer */
UPDATE [${flyway:defaultSchema}].[OrderCheckoutAnswer] SET [__mj_CreatedAt] = GETUTCDATE() WHERE [__mj_CreatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.OrderCheckoutAnswer */
ALTER TABLE [${flyway:defaultSchema}].[OrderCheckoutAnswer] ALTER COLUMN [__mj_CreatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.OrderCheckoutAnswer */
ALTER TABLE [${flyway:defaultSchema}].[OrderCheckoutAnswer] ADD CONSTRAINT [DF___mj_BizAppsOrders_OrderCheckoutAnswer___mj_CreatedAt] DEFAULT GETUTCDATE() FOR [__mj_CreatedAt];
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.OrderCheckoutAnswer */
ALTER TABLE [${flyway:defaultSchema}].[OrderCheckoutAnswer] ADD [__mj_UpdatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.OrderCheckoutAnswer */
UPDATE [${flyway:defaultSchema}].[OrderCheckoutAnswer] SET [__mj_UpdatedAt] = GETUTCDATE() WHERE [__mj_UpdatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.OrderCheckoutAnswer */
ALTER TABLE [${flyway:defaultSchema}].[OrderCheckoutAnswer] ALTER COLUMN [__mj_UpdatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.OrderCheckoutAnswer */
ALTER TABLE [${flyway:defaultSchema}].[OrderCheckoutAnswer] ADD CONSTRAINT [DF___mj_BizAppsOrders_OrderCheckoutAnswer___mj_UpdatedAt] DEFAULT GETUTCDATE() FOR [__mj_UpdatedAt];
GO

/* SQL text to insert 9 new entity field(s) */
UPDATE [${mjSchema}].[EntityField]
         SET [Sequence] = [Sequence] + 100000
       WHERE [EntityID] = '2719A581-1FE7-4728-9649-5B95175AE1F9'
         AND [Sequence] < 100000
         AND NOT EXISTS (
             SELECT 1 FROM [${mjSchema}].[EntityField]
              WHERE [EntityID] = '2719A581-1FE7-4728-9649-5B95175AE1F9'
                AND [Sequence] >= 100000
         );

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '51ecd776-bf24-485a-909b-c4a5dbc33307' OR (EntityID = '2719A581-1FE7-4728-9649-5B95175AE1F9' AND Name = 'ID')) BEGIN
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
            '51ecd776-bf24-485a-909b-c4a5dbc33307',
            '2719A581-1FE7-4728-9649-5B95175AE1F9', -- Entity: MJ_BizApps_Orders: Order Checkout Answers
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${mjSchema}].[EntityField] WHERE [EntityID] = '2719A581-1FE7-4728-9649-5B95175AE1F9') + 1,
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '0a41d5f2-7a44-4c88-b755-125270401cf8' OR (EntityID = '2719A581-1FE7-4728-9649-5B95175AE1F9' AND Name = 'OrderHeaderID')) BEGIN
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
            '0a41d5f2-7a44-4c88-b755-125270401cf8',
            '2719A581-1FE7-4728-9649-5B95175AE1F9', -- Entity: MJ_BizApps_Orders: Order Checkout Answers
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${mjSchema}].[EntityField] WHERE [EntityID] = '2719A581-1FE7-4728-9649-5B95175AE1F9') + 1,
            'OrderHeaderID',
            'Order Header ID',
            'The order the checkout confirmed.',
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
            'FC529BC8-FF09-44A9-B454-26EAFDAC791B',
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = 'c659521f-eb97-4cb7-af9e-1aea39e01e9f' OR (EntityID = '2719A581-1FE7-4728-9649-5B95175AE1F9' AND Name = 'QuestionKey')) BEGIN
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
            'c659521f-eb97-4cb7-af9e-1aea39e01e9f',
            '2719A581-1FE7-4728-9649-5B95175AE1F9', -- Entity: MJ_BizApps_Orders: Order Checkout Answers
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${mjSchema}].[EntityField] WHERE [EntityID] = '2719A581-1FE7-4728-9649-5B95175AE1F9') + 1,
            'QuestionKey',
            'Question Key',
            'The question''s key in the widget''s Configuration. Stable across label edits, so answers to the same question can be reported together.',
            'nvarchar',
            200,
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
            1,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = 'ff1512d4-6396-4ada-b7cc-d8ad6e200b1c' OR (EntityID = '2719A581-1FE7-4728-9649-5B95175AE1F9' AND Name = 'QuestionLabel')) BEGIN
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
            'ff1512d4-6396-4ada-b7cc-d8ad6e200b1c',
            '2719A581-1FE7-4728-9649-5B95175AE1F9', -- Entity: MJ_BizApps_Orders: Order Checkout Answers
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${mjSchema}].[EntityField] WHERE [EntityID] = '2719A581-1FE7-4728-9649-5B95175AE1F9') + 1,
            'QuestionLabel',
            'Question Label',
            'The question as the buyer saw it, copied at order time.',
            'nvarchar',
            1000,
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = 'f3e99c0e-60b9-4962-943a-fd248c4e17f6' OR (EntityID = '2719A581-1FE7-4728-9649-5B95175AE1F9' AND Name = 'Answer')) BEGIN
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
            'f3e99c0e-60b9-4962-943a-fd248c4e17f6',
            '2719A581-1FE7-4728-9649-5B95175AE1F9', -- Entity: MJ_BizApps_Orders: Order Checkout Answers
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${mjSchema}].[EntityField] WHERE [EntityID] = '2719A581-1FE7-4728-9649-5B95175AE1F9') + 1,
            'Answer',
            'Answer',
            'The answer. For a select question, the value of the option the buyer chose; for a text question, the text entered.',
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '0cc54a86-7d14-45d4-9921-759d5552bcb5' OR (EntityID = '2719A581-1FE7-4728-9649-5B95175AE1F9' AND Name = 'OtherText')) BEGIN
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
            '0cc54a86-7d14-45d4-9921-759d5552bcb5',
            '2719A581-1FE7-4728-9649-5B95175AE1F9', -- Entity: MJ_BizApps_Orders: Order Checkout Answers
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${mjSchema}].[EntityField] WHERE [EntityID] = '2719A581-1FE7-4728-9649-5B95175AE1F9') + 1,
            'OtherText',
            'Other Text',
            'The free-text answer the buyer gave after choosing the question''s "Other" option. NULL for any other answer.',
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = 'e49c810f-442f-4f25-ae0e-6fafc18777ac' OR (EntityID = '2719A581-1FE7-4728-9649-5B95175AE1F9' AND Name = '__mj_CreatedAt')) BEGIN
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
            'e49c810f-442f-4f25-ae0e-6fafc18777ac',
            '2719A581-1FE7-4728-9649-5B95175AE1F9', -- Entity: MJ_BizApps_Orders: Order Checkout Answers
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${mjSchema}].[EntityField] WHERE [EntityID] = '2719A581-1FE7-4728-9649-5B95175AE1F9') + 1,
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '1f0380c4-4965-4782-b427-c0792c7d8a8b' OR (EntityID = '2719A581-1FE7-4728-9649-5B95175AE1F9' AND Name = '__mj_UpdatedAt')) BEGIN
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
            '1f0380c4-4965-4782-b427-c0792c7d8a8b',
            '2719A581-1FE7-4728-9649-5B95175AE1F9', -- Entity: MJ_BizApps_Orders: Order Checkout Answers
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${mjSchema}].[EntityField] WHERE [EntityID] = '2719A581-1FE7-4728-9649-5B95175AE1F9') + 1,
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

/* Create Entity Relationship: MJ_BizApps_Orders: Order Headers -> MJ_BizApps_Orders: Order Checkout Answers (One To Many via OrderHeaderID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${mjSchema}].[EntityRelationship] WHERE [ID] = '7006e6c1-5258-45dd-bb43-22df9eb79809'
   )
   BEGIN
      INSERT INTO [${mjSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('7006e6c1-5258-45dd-bb43-22df9eb79809', 'FC529BC8-FF09-44A9-B454-26EAFDAC791B', '2719A581-1FE7-4728-9649-5B95175AE1F9', 'OrderHeaderID', 'One To Many', 1, 1, 12, GETUTCDATE(), GETUTCDATE())
   END;

/* Index for Foreign Keys for OrderCheckoutAnswer */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Order Checkout Answers
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key OrderHeaderID in table OrderCheckoutAnswer
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_OrderCheckoutAnswer_OrderHeaderID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[OrderCheckoutAnswer]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_OrderCheckoutAnswer_OrderHeaderID ON [${flyway:defaultSchema}].[OrderCheckoutAnswer] ([OrderHeaderID]);

/* SQL text to update entity field related entity name field map for entity field ID 0A41D5F2-7A44-4C88-B755-125270401CF8 */
EXEC [${mjSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='0A41D5F2-7A44-4C88-B755-125270401CF8', @RelatedEntityNameFieldMap='OrderHeader';

/* Base View SQL for MJ_BizApps_Orders: Order Checkout Answers */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Order Checkout Answers
-- Item: vwOrderCheckoutAnswers
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ_BizApps_Orders: Order Checkout Answers
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  OrderCheckoutAnswer
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwOrderCheckoutAnswers]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwOrderCheckoutAnswers];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwOrderCheckoutAnswers]
AS
SELECT
    o.*,
    mjBizAppsOrdersOrderHeader_OrderHeaderID.[OrderNumber] AS [OrderHeader]
FROM
    [${flyway:defaultSchema}].[OrderCheckoutAnswer] AS o
INNER JOIN
    [${flyway:defaultSchema}].[OrderHeader] AS mjBizAppsOrdersOrderHeader_OrderHeaderID
  ON
    [o].[OrderHeaderID] = mjBizAppsOrdersOrderHeader_OrderHeaderID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwOrderCheckoutAnswers] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for MJ_BizApps_Orders: Order Checkout Answers */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Order Checkout Answers
-- Item: Permissions for vwOrderCheckoutAnswers
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwOrderCheckoutAnswers] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for MJ_BizApps_Orders: Order Checkout Answers */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Order Checkout Answers
-- Item: spCreateOrderCheckoutAnswer
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR OrderCheckoutAnswer
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateOrderCheckoutAnswer]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateOrderCheckoutAnswer];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateOrderCheckoutAnswer]
    @ID uniqueidentifier = NULL,
    @OrderHeaderID uniqueidentifier,
    @QuestionKey nvarchar(100),
    @QuestionLabel nvarchar(500),
    @Answer nvarchar(1000),
    @OtherText_Clear bit = 0,
    @OtherText nvarchar(1000) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)

    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[OrderCheckoutAnswer]
            (
                [ID],
                [OrderHeaderID],
                [QuestionKey],
                [QuestionLabel],
                [Answer],
                [OtherText]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @OrderHeaderID,
                @QuestionKey,
                @QuestionLabel,
                @Answer,
                CASE WHEN @OtherText_Clear = 1 THEN NULL ELSE ISNULL(@OtherText, NULL) END
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[OrderCheckoutAnswer]
            (
                [OrderHeaderID],
                [QuestionKey],
                [QuestionLabel],
                [Answer],
                [OtherText]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @OrderHeaderID,
                @QuestionKey,
                @QuestionLabel,
                @Answer,
                CASE WHEN @OtherText_Clear = 1 THEN NULL ELSE ISNULL(@OtherText, NULL) END
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwOrderCheckoutAnswers] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateOrderCheckoutAnswer] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ_BizApps_Orders: Order Checkout Answers */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateOrderCheckoutAnswer] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for MJ_BizApps_Orders: Order Checkout Answers */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Order Checkout Answers
-- Item: spUpdateOrderCheckoutAnswer
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR OrderCheckoutAnswer
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateOrderCheckoutAnswer]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateOrderCheckoutAnswer];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateOrderCheckoutAnswer]
    @ID uniqueidentifier,
    @OrderHeaderID uniqueidentifier = NULL,
    @QuestionKey nvarchar(100) = NULL,
    @QuestionLabel nvarchar(500) = NULL,
    @Answer nvarchar(1000) = NULL,
    @OtherText_Clear bit = 0,
    @OtherText nvarchar(1000) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[OrderCheckoutAnswer]
    SET
        [OrderHeaderID] = ISNULL(@OrderHeaderID, [OrderHeaderID]),
        [QuestionKey] = ISNULL(@QuestionKey, [QuestionKey]),
        [QuestionLabel] = ISNULL(@QuestionLabel, [QuestionLabel]),
        [Answer] = ISNULL(@Answer, [Answer]),
        [OtherText] = CASE WHEN @OtherText_Clear = 1 THEN NULL ELSE ISNULL(@OtherText, [OtherText]) END
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwOrderCheckoutAnswers] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwOrderCheckoutAnswers]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateOrderCheckoutAnswer] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the OrderCheckoutAnswer table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateOrderCheckoutAnswer]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateOrderCheckoutAnswer];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateOrderCheckoutAnswer
ON [${flyway:defaultSchema}].[OrderCheckoutAnswer]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[OrderCheckoutAnswer]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[OrderCheckoutAnswer] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for MJ_BizApps_Orders: Order Checkout Answers */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateOrderCheckoutAnswer] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for MJ_BizApps_Orders: Order Checkout Answers */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Order Checkout Answers
-- Item: spDeleteOrderCheckoutAnswer
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR OrderCheckoutAnswer
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteOrderCheckoutAnswer]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteOrderCheckoutAnswer];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteOrderCheckoutAnswer]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[OrderCheckoutAnswer]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteOrderCheckoutAnswer] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for MJ_BizApps_Orders: Order Checkout Answers */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteOrderCheckoutAnswer] TO [cdp_Developer], [cdp_Integration];

/* SQL text to insert 2 new entity field(s) */
UPDATE [${mjSchema}].[EntityField]
         SET [Sequence] = [Sequence] + 100000
       WHERE [EntityID] = '2719A581-1FE7-4728-9649-5B95175AE1F9'
         AND [Sequence] < 100000
         AND NOT EXISTS (
             SELECT 1 FROM [${mjSchema}].[EntityField]
              WHERE [EntityID] = '2719A581-1FE7-4728-9649-5B95175AE1F9'
                AND [Sequence] >= 100000
         );

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '93090bf8-04dd-4410-9d9c-9c104426f35b' OR (EntityID = '2719A581-1FE7-4728-9649-5B95175AE1F9' AND Name = 'OrderHeader')) BEGIN
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
            '93090bf8-04dd-4410-9d9c-9c104426f35b',
            '2719A581-1FE7-4728-9649-5B95175AE1F9', -- Entity: MJ_BizApps_Orders: Order Checkout Answers
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${mjSchema}].[EntityField] WHERE [EntityID] = '2719A581-1FE7-4728-9649-5B95175AE1F9') + 1,
            'OrderHeader',
            'Order Header',
            NULL,
            'nvarchar',
            80,
            0,
            0,
            0,
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
