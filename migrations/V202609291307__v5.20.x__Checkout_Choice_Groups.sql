-- =============================================================================
-- V202609291307 — Buyer-chosen options at checkout, choose N of M (bizapps-orders#291)
-- =============================================================================
-- Some products require the buyer to choose from a fixed list at checkout, such
-- as "choose exactly 2 of these 8 pathways", and the choice decides what the
-- buyer is entitled to. The choice groups are defined in the checkout widget's
-- Configuration.
--
-- OrderLineChoice records each option the buyer chose, on the line it was
-- chosen for: one row per line per group per option. It lives on the line, not
-- the order, because the line is what grants entitlements and what a renewal
-- copies. The group and option labels are copied at order time, so a later edit
-- to the widget does not change what the buyer chose from.
--
-- ProductEntitlement.ChoiceGroupKey and ChoiceOptionValue make a template
-- conditional: set, the template grants only on a line that carries that choice;
-- NULL, it grants on every line of the product, as before. They are set
-- together or not at all.
--
-- CodeGen output for these objects is folded below the banner at the end of this file.
-- =============================================================================
CREATE TABLE [${flyway:defaultSchema}].[OrderLineChoice] (
    [ID]          UNIQUEIDENTIFIER NOT NULL CONSTRAINT [DF_OrderLineChoice_ID] DEFAULT (newsequentialid()),
    [OrderLineID] UNIQUEIDENTIFIER NOT NULL,
    [GroupKey]    NVARCHAR(100)    NOT NULL,
    [GroupLabel]  NVARCHAR(500)    NOT NULL,
    [OptionValue] NVARCHAR(100)    NOT NULL,
    [OptionLabel] NVARCHAR(500)    NOT NULL,
    CONSTRAINT [PK_OrderLineChoice] PRIMARY KEY CLUSTERED ([ID]),
    CONSTRAINT [FK_OrderLineChoice_OrderLine] FOREIGN KEY ([OrderLineID])
        REFERENCES [${flyway:defaultSchema}].[OrderLine]([ID]),
    CONSTRAINT [UQ_OrderLineChoice_Line_Group_Option] UNIQUE ([OrderLineID], [GroupKey], [OptionValue])
);
GO

ALTER TABLE [${flyway:defaultSchema}].[ProductEntitlement] ADD
    [ChoiceGroupKey]    NVARCHAR(100) NULL,
    [ChoiceOptionValue] NVARCHAR(100) NULL,
    CONSTRAINT [CK_ProductEntitlement_ChoicePaired] CHECK (
        ([ChoiceGroupKey] IS NULL AND [ChoiceOptionValue] IS NULL)
        OR ([ChoiceGroupKey] IS NOT NULL AND [ChoiceOptionValue] IS NOT NULL));
GO

-- Descriptions: MS_Description is what CodeGen carries into EntityField.Description.
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'One option the buyer chose from a choice group at checkout, recorded on the order line it was chosen for. The choice groups are defined in the checkout widget''s Configuration. A renewal copies the choices onto its line, so conditional entitlements follow them.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'OrderLineChoice';
GO
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The order line the option was chosen for.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'OrderLineChoice',
    @level2type = N'COLUMN', @level2name = N'OrderLineID';
GO
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The choice group''s key in the widget''s Configuration. Matched by ProductEntitlement.ChoiceGroupKey.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'OrderLineChoice',
    @level2type = N'COLUMN', @level2name = N'GroupKey';
GO
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The choice group as the buyer saw it, copied at order time.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'OrderLineChoice',
    @level2type = N'COLUMN', @level2name = N'GroupLabel';
GO
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The value of the option chosen. Matched by ProductEntitlement.ChoiceOptionValue.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'OrderLineChoice',
    @level2type = N'COLUMN', @level2name = N'OptionValue';
GO
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The option as the buyer saw it, copied at order time.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'OrderLineChoice',
    @level2type = N'COLUMN', @level2name = N'OptionLabel';
GO
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'With ChoiceOptionValue, makes this entitlement conditional: it is granted only on an order line that carries this choice (an OrderLineChoice row with this GroupKey and OptionValue). NULL grants it on every line of the product.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'ProductEntitlement',
    @level2type = N'COLUMN', @level2name = N'ChoiceGroupKey';
GO
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The option value, within ChoiceGroupKey, that the line must carry for this entitlement to be granted. Set together with ChoiceGroupKey or not at all.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'ProductEntitlement',
    @level2type = N'COLUMN', @level2name = N'ChoiceOptionValue';
GO


















































-- =============================================================================
-- CODEGEN OUTPUT — GENERATED CODE BELOW THIS LINE. DO NOT EDIT BY HAND.
-- This app's own CodeGen SQL for the new Order Line Choices entity (its metadata, view,
-- CRUD procs and permissions) and the regenerated Product Entitlements view and procs is
-- folded here.
-- =============================================================================

/* SQL generated to create new entity MJ_BizApps_Orders: Order Line Choices */

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
         'e5fc8970-8d06-4d58-be59-ff8715f84890',
         'MJ_BizApps_Orders: Order Line Choices',
         'Order Line Choices',
         'One option the buyer chose from a choice group at checkout, recorded on the order line it was chosen for. The choice groups are defined in the checkout widget''s Configuration. A renewal copies the choices onto its line, so conditional entitlements follow them.',
         NULL,
         'OrderLineChoice',
         'vwOrderLineChoices',
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

/* SQL generated to add new entity MJ_BizApps_Orders: Order Line Choices to application ID: 'FB80FEB4-5505-49D1-93CE-2E7BD030B478' */
INSERT INTO [${mjSchema}].[ApplicationEntity]
                                       ([ApplicationID], [EntityID], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                       ('FB80FEB4-5505-49D1-93CE-2E7BD030B478', 'e5fc8970-8d06-4d58-be59-ff8715f84890', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [${mjSchema}].[ApplicationEntity] WHERE [ApplicationID] = 'FB80FEB4-5505-49D1-93CE-2E7BD030B478'), GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ_BizApps_Orders: Order Line Choices for role UI */
INSERT INTO [${mjSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('e5fc8970-8d06-4d58-be59-ff8715f84890', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ_BizApps_Orders: Order Line Choices for role Developer */
INSERT INTO [${mjSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('e5fc8970-8d06-4d58-be59-ff8715f84890', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ_BizApps_Orders: Order Line Choices for role Integration */
INSERT INTO [${mjSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('e5fc8970-8d06-4d58-be59-ff8715f84890', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.OrderLineChoice */
ALTER TABLE [${flyway:defaultSchema}].[OrderLineChoice] ADD [__mj_CreatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.OrderLineChoice */
UPDATE [${flyway:defaultSchema}].[OrderLineChoice] SET [__mj_CreatedAt] = GETUTCDATE() WHERE [__mj_CreatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.OrderLineChoice */
ALTER TABLE [${flyway:defaultSchema}].[OrderLineChoice] ALTER COLUMN [__mj_CreatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.OrderLineChoice */
ALTER TABLE [${flyway:defaultSchema}].[OrderLineChoice] ADD CONSTRAINT [DF___mj_BizAppsOrders_OrderLineChoice___mj_CreatedAt] DEFAULT GETUTCDATE() FOR [__mj_CreatedAt];
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.OrderLineChoice */
ALTER TABLE [${flyway:defaultSchema}].[OrderLineChoice] ADD [__mj_UpdatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.OrderLineChoice */
UPDATE [${flyway:defaultSchema}].[OrderLineChoice] SET [__mj_UpdatedAt] = GETUTCDATE() WHERE [__mj_UpdatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.OrderLineChoice */
ALTER TABLE [${flyway:defaultSchema}].[OrderLineChoice] ALTER COLUMN [__mj_UpdatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.OrderLineChoice */
ALTER TABLE [${flyway:defaultSchema}].[OrderLineChoice] ADD CONSTRAINT [DF___mj_BizAppsOrders_OrderLineChoice___mj_UpdatedAt] DEFAULT GETUTCDATE() FOR [__mj_UpdatedAt];
GO

/* SQL text to insert 12 new entity field(s) */
UPDATE [${mjSchema}].[EntityField]
         SET [Sequence] = [Sequence] + 100000
       WHERE [EntityID] = '9D092635-F655-4EB3-B462-85BEDDF6C7E5'
         AND [Sequence] < 100000
         AND NOT EXISTS (
             SELECT 1 FROM [${mjSchema}].[EntityField]
              WHERE [EntityID] = '9D092635-F655-4EB3-B462-85BEDDF6C7E5'
                AND [Sequence] >= 100000
         );

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '43e0e280-301b-4071-bd08-b34381b4d743' OR (EntityID = '9D092635-F655-4EB3-B462-85BEDDF6C7E5' AND Name = 'ChoiceGroupKey')) BEGIN
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
            '43e0e280-301b-4071-bd08-b34381b4d743',
            '9D092635-F655-4EB3-B462-85BEDDF6C7E5', -- Entity: MJ_BizApps_Orders: Product Entitlements
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${mjSchema}].[EntityField] WHERE [EntityID] = '9D092635-F655-4EB3-B462-85BEDDF6C7E5') + 1,
            'ChoiceGroupKey',
            'Choice Group Key',
            'With ChoiceOptionValue, makes this entitlement conditional: it is granted only on an order line that carries this choice (an OrderLineChoice row with this GroupKey and OptionValue). NULL grants it on every line of the product.',
            'nvarchar',
            200,
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '49e996b9-1958-4a81-8306-d99fdaef8595' OR (EntityID = '9D092635-F655-4EB3-B462-85BEDDF6C7E5' AND Name = 'ChoiceOptionValue')) BEGIN
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
            '49e996b9-1958-4a81-8306-d99fdaef8595',
            '9D092635-F655-4EB3-B462-85BEDDF6C7E5', -- Entity: MJ_BizApps_Orders: Product Entitlements
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${mjSchema}].[EntityField] WHERE [EntityID] = '9D092635-F655-4EB3-B462-85BEDDF6C7E5') + 1,
            'ChoiceOptionValue',
            'Choice Option Value',
            'The option value, within ChoiceGroupKey, that the line must carry for this entitlement to be granted. Set together with ChoiceGroupKey or not at all.',
            'nvarchar',
            200,
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
UPDATE [${mjSchema}].[EntityField]
         SET [Sequence] = [Sequence] + 100000
       WHERE [EntityID] = 'E5FC8970-8D06-4D58-BE59-FF8715F84890'
         AND [Sequence] < 100000
         AND NOT EXISTS (
             SELECT 1 FROM [${mjSchema}].[EntityField]
              WHERE [EntityID] = 'E5FC8970-8D06-4D58-BE59-FF8715F84890'
                AND [Sequence] >= 100000
         );

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '1cc35d14-9925-4ead-915e-529847a9e957' OR (EntityID = 'E5FC8970-8D06-4D58-BE59-FF8715F84890' AND Name = 'ID')) BEGIN
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
            '1cc35d14-9925-4ead-915e-529847a9e957',
            'E5FC8970-8D06-4D58-BE59-FF8715F84890', -- Entity: MJ_BizApps_Orders: Order Line Choices
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${mjSchema}].[EntityField] WHERE [EntityID] = 'E5FC8970-8D06-4D58-BE59-FF8715F84890') + 1,
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = 'a1fac3da-d346-4394-8fd5-16dfa47b8aff' OR (EntityID = 'E5FC8970-8D06-4D58-BE59-FF8715F84890' AND Name = 'OrderLineID')) BEGIN
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
            'a1fac3da-d346-4394-8fd5-16dfa47b8aff',
            'E5FC8970-8D06-4D58-BE59-FF8715F84890', -- Entity: MJ_BizApps_Orders: Order Line Choices
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${mjSchema}].[EntityField] WHERE [EntityID] = 'E5FC8970-8D06-4D58-BE59-FF8715F84890') + 1,
            'OrderLineID',
            'Order Line ID',
            'The order line the option was chosen for.',
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '8ffc3a58-04d2-442f-b9f7-6e76c68f4be5' OR (EntityID = 'E5FC8970-8D06-4D58-BE59-FF8715F84890' AND Name = 'GroupKey')) BEGIN
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
            '8ffc3a58-04d2-442f-b9f7-6e76c68f4be5',
            'E5FC8970-8D06-4D58-BE59-FF8715F84890', -- Entity: MJ_BizApps_Orders: Order Line Choices
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${mjSchema}].[EntityField] WHERE [EntityID] = 'E5FC8970-8D06-4D58-BE59-FF8715F84890') + 1,
            'GroupKey',
            'Group Key',
            'The choice group''s key in the widget''s Configuration. Matched by ProductEntitlement.ChoiceGroupKey.',
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '1c2ea292-22eb-4a50-adbb-fe49667fe7f3' OR (EntityID = 'E5FC8970-8D06-4D58-BE59-FF8715F84890' AND Name = 'GroupLabel')) BEGIN
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
            '1c2ea292-22eb-4a50-adbb-fe49667fe7f3',
            'E5FC8970-8D06-4D58-BE59-FF8715F84890', -- Entity: MJ_BizApps_Orders: Order Line Choices
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${mjSchema}].[EntityField] WHERE [EntityID] = 'E5FC8970-8D06-4D58-BE59-FF8715F84890') + 1,
            'GroupLabel',
            'Group Label',
            'The choice group as the buyer saw it, copied at order time.',
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '4dad408e-7ca6-4b16-8097-34cb8f56e4a2' OR (EntityID = 'E5FC8970-8D06-4D58-BE59-FF8715F84890' AND Name = 'OptionValue')) BEGIN
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
            '4dad408e-7ca6-4b16-8097-34cb8f56e4a2',
            'E5FC8970-8D06-4D58-BE59-FF8715F84890', -- Entity: MJ_BizApps_Orders: Order Line Choices
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${mjSchema}].[EntityField] WHERE [EntityID] = 'E5FC8970-8D06-4D58-BE59-FF8715F84890') + 1,
            'OptionValue',
            'Option Value',
            'The value of the option chosen. Matched by ProductEntitlement.ChoiceOptionValue.',
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '29c30557-45f7-4215-aad5-457abed6d6c3' OR (EntityID = 'E5FC8970-8D06-4D58-BE59-FF8715F84890' AND Name = 'OptionLabel')) BEGIN
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
            '29c30557-45f7-4215-aad5-457abed6d6c3',
            'E5FC8970-8D06-4D58-BE59-FF8715F84890', -- Entity: MJ_BizApps_Orders: Order Line Choices
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${mjSchema}].[EntityField] WHERE [EntityID] = 'E5FC8970-8D06-4D58-BE59-FF8715F84890') + 1,
            'OptionLabel',
            'Option Label',
            'The option as the buyer saw it, copied at order time.',
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '0edbbd97-760c-429b-9584-1eba4e17d60e' OR (EntityID = 'E5FC8970-8D06-4D58-BE59-FF8715F84890' AND Name = '__mj_CreatedAt')) BEGIN
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
            '0edbbd97-760c-429b-9584-1eba4e17d60e',
            'E5FC8970-8D06-4D58-BE59-FF8715F84890', -- Entity: MJ_BizApps_Orders: Order Line Choices
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${mjSchema}].[EntityField] WHERE [EntityID] = 'E5FC8970-8D06-4D58-BE59-FF8715F84890') + 1,
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '08a8549d-6e74-4283-9778-c52f15894719' OR (EntityID = 'E5FC8970-8D06-4D58-BE59-FF8715F84890' AND Name = '__mj_UpdatedAt')) BEGIN
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
            '08a8549d-6e74-4283-9778-c52f15894719',
            'E5FC8970-8D06-4D58-BE59-FF8715F84890', -- Entity: MJ_BizApps_Orders: Order Line Choices
            (SELECT COALESCE(MAX([Sequence]), 0) FROM [${mjSchema}].[EntityField] WHERE [EntityID] = 'E5FC8970-8D06-4D58-BE59-FF8715F84890') + 1,
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

/* Create Entity Relationship: MJ_BizApps_Orders: Order Lines -> MJ_BizApps_Orders: Order Line Choices (One To Many via OrderLineID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${mjSchema}].[EntityRelationship] WHERE [ID] = '13985820-6ae9-4ac0-a56d-7fe00b59ef97'
   )
   BEGIN
      INSERT INTO [${mjSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('13985820-6ae9-4ac0-a56d-7fe00b59ef97', '66D82C24-9C9F-4CD6-B019-53C20274AB00', 'E5FC8970-8D06-4D58-BE59-FF8715F84890', 'OrderLineID', 'One To Many', 1, 1, 15, GETUTCDATE(), GETUTCDATE())
   END;

/* Index for Foreign Keys for OrderLineChoice */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Order Line Choices
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key OrderLineID in table OrderLineChoice
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_OrderLineChoice_OrderLineID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[OrderLineChoice]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_OrderLineChoice_OrderLineID ON [${flyway:defaultSchema}].[OrderLineChoice] ([OrderLineID]);

/* Base View SQL for MJ_BizApps_Orders: Order Line Choices */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Order Line Choices
-- Item: vwOrderLineChoices
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ_BizApps_Orders: Order Line Choices
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  OrderLineChoice
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwOrderLineChoices]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwOrderLineChoices];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwOrderLineChoices]
AS
SELECT
    o.*
FROM
    [${flyway:defaultSchema}].[OrderLineChoice] AS o
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwOrderLineChoices] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for MJ_BizApps_Orders: Order Line Choices */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Order Line Choices
-- Item: Permissions for vwOrderLineChoices
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwOrderLineChoices] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for MJ_BizApps_Orders: Order Line Choices */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Order Line Choices
-- Item: spCreateOrderLineChoice
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR OrderLineChoice
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateOrderLineChoice]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateOrderLineChoice];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateOrderLineChoice]
    @ID uniqueidentifier = NULL,
    @OrderLineID uniqueidentifier,
    @GroupKey nvarchar(100),
    @GroupLabel nvarchar(500),
    @OptionValue nvarchar(100),
    @OptionLabel nvarchar(500)
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)

    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[OrderLineChoice]
            (
                [ID],
                [OrderLineID],
                [GroupKey],
                [GroupLabel],
                [OptionValue],
                [OptionLabel]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @OrderLineID,
                @GroupKey,
                @GroupLabel,
                @OptionValue,
                @OptionLabel
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[OrderLineChoice]
            (
                [OrderLineID],
                [GroupKey],
                [GroupLabel],
                [OptionValue],
                [OptionLabel]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @OrderLineID,
                @GroupKey,
                @GroupLabel,
                @OptionValue,
                @OptionLabel
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwOrderLineChoices] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateOrderLineChoice] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ_BizApps_Orders: Order Line Choices */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateOrderLineChoice] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for MJ_BizApps_Orders: Order Line Choices */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Order Line Choices
-- Item: spUpdateOrderLineChoice
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR OrderLineChoice
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateOrderLineChoice]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateOrderLineChoice];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateOrderLineChoice]
    @ID uniqueidentifier,
    @OrderLineID uniqueidentifier = NULL,
    @GroupKey nvarchar(100) = NULL,
    @GroupLabel nvarchar(500) = NULL,
    @OptionValue nvarchar(100) = NULL,
    @OptionLabel nvarchar(500) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[OrderLineChoice]
    SET
        [OrderLineID] = ISNULL(@OrderLineID, [OrderLineID]),
        [GroupKey] = ISNULL(@GroupKey, [GroupKey]),
        [GroupLabel] = ISNULL(@GroupLabel, [GroupLabel]),
        [OptionValue] = ISNULL(@OptionValue, [OptionValue]),
        [OptionLabel] = ISNULL(@OptionLabel, [OptionLabel])
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwOrderLineChoices] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwOrderLineChoices]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateOrderLineChoice] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the OrderLineChoice table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateOrderLineChoice]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateOrderLineChoice];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateOrderLineChoice
ON [${flyway:defaultSchema}].[OrderLineChoice]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[OrderLineChoice]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[OrderLineChoice] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for MJ_BizApps_Orders: Order Line Choices */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateOrderLineChoice] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for MJ_BizApps_Orders: Order Line Choices */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Order Line Choices
-- Item: spDeleteOrderLineChoice
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR OrderLineChoice
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteOrderLineChoice]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteOrderLineChoice];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteOrderLineChoice]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[OrderLineChoice]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteOrderLineChoice] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for MJ_BizApps_Orders: Order Line Choices */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteOrderLineChoice] TO [cdp_Developer], [cdp_Integration];

/* Index for Foreign Keys for ProductEntitlement */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Product Entitlements
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key ProductID in table ProductEntitlement
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_ProductEntitlement_ProductID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[ProductEntitlement]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_ProductEntitlement_ProductID ON [${flyway:defaultSchema}].[ProductEntitlement] ([ProductID]);

/* Base View SQL for MJ_BizApps_Orders: Product Entitlements */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Product Entitlements
-- Item: vwProductEntitlements
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ_BizApps_Orders: Product Entitlements
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  ProductEntitlement
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwProductEntitlements]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwProductEntitlements];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwProductEntitlements]
AS
SELECT
    p.*,
    mjBizAppsOrdersProduct_ProductID.[Name] AS [Product]
FROM
    [${flyway:defaultSchema}].[ProductEntitlement] AS p
INNER JOIN
    [${flyway:defaultSchema}].[Product] AS mjBizAppsOrdersProduct_ProductID
  ON
    [p].[ProductID] = mjBizAppsOrdersProduct_ProductID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwProductEntitlements] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for MJ_BizApps_Orders: Product Entitlements */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Product Entitlements
-- Item: Permissions for vwProductEntitlements
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwProductEntitlements] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for MJ_BizApps_Orders: Product Entitlements */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Product Entitlements
-- Item: spCreateProductEntitlement
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR ProductEntitlement
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateProductEntitlement]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateProductEntitlement];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateProductEntitlement]
    @ID uniqueidentifier = NULL,
    @ProductID uniqueidentifier,
    @EntitlementType nvarchar(40),
    @Code nvarchar(80),
    @Name_Clear bit = 0,
    @Name nvarchar(200) = NULL,
    @Quantity_Clear bit = 0,
    @Quantity decimal(18, 4) = NULL,
    @UnitOfMeasure_Clear bit = 0,
    @UnitOfMeasure nvarchar(40) = NULL,
    @IsActive bit = NULL,
    @ValidityMode_Clear bit = 0,
    @ValidityMode nvarchar(20) = NULL,
    @ValidityDurationDays_Clear bit = 0,
    @ValidityDurationDays int = NULL,
    @AccessLeadHours_Clear bit = 0,
    @AccessLeadHours int = NULL,
    @AccessLagHours_Clear bit = 0,
    @AccessLagHours int = NULL,
    @ChoiceGroupKey_Clear bit = 0,
    @ChoiceGroupKey nvarchar(100) = NULL,
    @ChoiceOptionValue_Clear bit = 0,
    @ChoiceOptionValue nvarchar(100) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)

    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[ProductEntitlement]
            (
                [ID],
                [ProductID],
                [EntitlementType],
                [Code],
                [Name],
                [Quantity],
                [UnitOfMeasure],
                [IsActive],
                [ValidityMode],
                [ValidityDurationDays],
                [AccessLeadHours],
                [AccessLagHours],
                [ChoiceGroupKey],
                [ChoiceOptionValue]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @ProductID,
                @EntitlementType,
                @Code,
                CASE WHEN @Name_Clear = 1 THEN NULL ELSE ISNULL(@Name, NULL) END,
                CASE WHEN @Quantity_Clear = 1 THEN NULL ELSE ISNULL(@Quantity, NULL) END,
                CASE WHEN @UnitOfMeasure_Clear = 1 THEN NULL ELSE ISNULL(@UnitOfMeasure, NULL) END,
                ISNULL(@IsActive, 1),
                CASE WHEN @ValidityMode_Clear = 1 THEN NULL ELSE ISNULL(@ValidityMode, NULL) END,
                CASE WHEN @ValidityDurationDays_Clear = 1 THEN NULL ELSE ISNULL(@ValidityDurationDays, NULL) END,
                CASE WHEN @AccessLeadHours_Clear = 1 THEN NULL ELSE ISNULL(@AccessLeadHours, NULL) END,
                CASE WHEN @AccessLagHours_Clear = 1 THEN NULL ELSE ISNULL(@AccessLagHours, NULL) END,
                CASE WHEN @ChoiceGroupKey_Clear = 1 THEN NULL ELSE ISNULL(@ChoiceGroupKey, NULL) END,
                CASE WHEN @ChoiceOptionValue_Clear = 1 THEN NULL ELSE ISNULL(@ChoiceOptionValue, NULL) END
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[ProductEntitlement]
            (
                [ProductID],
                [EntitlementType],
                [Code],
                [Name],
                [Quantity],
                [UnitOfMeasure],
                [IsActive],
                [ValidityMode],
                [ValidityDurationDays],
                [AccessLeadHours],
                [AccessLagHours],
                [ChoiceGroupKey],
                [ChoiceOptionValue]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ProductID,
                @EntitlementType,
                @Code,
                CASE WHEN @Name_Clear = 1 THEN NULL ELSE ISNULL(@Name, NULL) END,
                CASE WHEN @Quantity_Clear = 1 THEN NULL ELSE ISNULL(@Quantity, NULL) END,
                CASE WHEN @UnitOfMeasure_Clear = 1 THEN NULL ELSE ISNULL(@UnitOfMeasure, NULL) END,
                ISNULL(@IsActive, 1),
                CASE WHEN @ValidityMode_Clear = 1 THEN NULL ELSE ISNULL(@ValidityMode, NULL) END,
                CASE WHEN @ValidityDurationDays_Clear = 1 THEN NULL ELSE ISNULL(@ValidityDurationDays, NULL) END,
                CASE WHEN @AccessLeadHours_Clear = 1 THEN NULL ELSE ISNULL(@AccessLeadHours, NULL) END,
                CASE WHEN @AccessLagHours_Clear = 1 THEN NULL ELSE ISNULL(@AccessLagHours, NULL) END,
                CASE WHEN @ChoiceGroupKey_Clear = 1 THEN NULL ELSE ISNULL(@ChoiceGroupKey, NULL) END,
                CASE WHEN @ChoiceOptionValue_Clear = 1 THEN NULL ELSE ISNULL(@ChoiceOptionValue, NULL) END
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwProductEntitlements] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateProductEntitlement] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ_BizApps_Orders: Product Entitlements */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateProductEntitlement] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for MJ_BizApps_Orders: Product Entitlements */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Product Entitlements
-- Item: spUpdateProductEntitlement
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR ProductEntitlement
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateProductEntitlement]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateProductEntitlement];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateProductEntitlement]
    @ID uniqueidentifier,
    @ProductID uniqueidentifier = NULL,
    @EntitlementType nvarchar(40) = NULL,
    @Code nvarchar(80) = NULL,
    @Name_Clear bit = 0,
    @Name nvarchar(200) = NULL,
    @Quantity_Clear bit = 0,
    @Quantity decimal(18, 4) = NULL,
    @UnitOfMeasure_Clear bit = 0,
    @UnitOfMeasure nvarchar(40) = NULL,
    @IsActive bit = NULL,
    @ValidityMode_Clear bit = 0,
    @ValidityMode nvarchar(20) = NULL,
    @ValidityDurationDays_Clear bit = 0,
    @ValidityDurationDays int = NULL,
    @AccessLeadHours_Clear bit = 0,
    @AccessLeadHours int = NULL,
    @AccessLagHours_Clear bit = 0,
    @AccessLagHours int = NULL,
    @ChoiceGroupKey_Clear bit = 0,
    @ChoiceGroupKey nvarchar(100) = NULL,
    @ChoiceOptionValue_Clear bit = 0,
    @ChoiceOptionValue nvarchar(100) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[ProductEntitlement]
    SET
        [ProductID] = ISNULL(@ProductID, [ProductID]),
        [EntitlementType] = ISNULL(@EntitlementType, [EntitlementType]),
        [Code] = ISNULL(@Code, [Code]),
        [Name] = CASE WHEN @Name_Clear = 1 THEN NULL ELSE ISNULL(@Name, [Name]) END,
        [Quantity] = CASE WHEN @Quantity_Clear = 1 THEN NULL ELSE ISNULL(@Quantity, [Quantity]) END,
        [UnitOfMeasure] = CASE WHEN @UnitOfMeasure_Clear = 1 THEN NULL ELSE ISNULL(@UnitOfMeasure, [UnitOfMeasure]) END,
        [IsActive] = ISNULL(@IsActive, [IsActive]),
        [ValidityMode] = CASE WHEN @ValidityMode_Clear = 1 THEN NULL ELSE ISNULL(@ValidityMode, [ValidityMode]) END,
        [ValidityDurationDays] = CASE WHEN @ValidityDurationDays_Clear = 1 THEN NULL ELSE ISNULL(@ValidityDurationDays, [ValidityDurationDays]) END,
        [AccessLeadHours] = CASE WHEN @AccessLeadHours_Clear = 1 THEN NULL ELSE ISNULL(@AccessLeadHours, [AccessLeadHours]) END,
        [AccessLagHours] = CASE WHEN @AccessLagHours_Clear = 1 THEN NULL ELSE ISNULL(@AccessLagHours, [AccessLagHours]) END,
        [ChoiceGroupKey] = CASE WHEN @ChoiceGroupKey_Clear = 1 THEN NULL ELSE ISNULL(@ChoiceGroupKey, [ChoiceGroupKey]) END,
        [ChoiceOptionValue] = CASE WHEN @ChoiceOptionValue_Clear = 1 THEN NULL ELSE ISNULL(@ChoiceOptionValue, [ChoiceOptionValue]) END
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwProductEntitlements] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwProductEntitlements]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateProductEntitlement] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the ProductEntitlement table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateProductEntitlement]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateProductEntitlement];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateProductEntitlement
ON [${flyway:defaultSchema}].[ProductEntitlement]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[ProductEntitlement]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[ProductEntitlement] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for MJ_BizApps_Orders: Product Entitlements */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateProductEntitlement] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for MJ_BizApps_Orders: Product Entitlements */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Product Entitlements
-- Item: spDeleteProductEntitlement
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR ProductEntitlement
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteProductEntitlement]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteProductEntitlement];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteProductEntitlement]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[ProductEntitlement]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteProductEntitlement] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for MJ_BizApps_Orders: Product Entitlements */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteProductEntitlement] TO [cdp_Developer], [cdp_Integration];
