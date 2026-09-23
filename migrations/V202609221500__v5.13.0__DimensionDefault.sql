-- DimensionDefault — where a line's GL dimension values come from when nobody types them.
--
-- An order line can now state ONE dimension tag by hand (OrderLine.DimensionID /
-- DimensionValueID, V202609191200). The chart-of-accounts design needs five axes on a revenue
-- line, and needs them without a human in the loop: Venture and Product follow from the product,
-- ARR-Type from whether the line starts or continues a subscription, Event and Vintage from the
-- event and its date. This table is the product half of that — the mapping the derivation reads.
--
-- POLYMORPHIC, AND DELIBERATELY THE SAME SHAPE AS GLAccountLink. EntityID + RecordID name a
-- Product, a ProductCategory, a ProductType or a Company, and the resolver walks
-- product -> its category -> that category's ancestors -> its product type -> the line's company,
-- exactly as GLAccountResolver already walks for accounts. That is what makes a venture settable
-- once on a category rather than copied onto every product, while a single product can still
-- override it. A flat ProductID table would force the copy and make adding a venture a migration
-- of its own.
--
-- DATE-EFFECTIVE, with no unique constraint on (EntityID, RecordID, DimensionID). Windows overlap
-- legitimately while a mapping is being moved, and the winner is chosen by the same
-- pickActiveLinkIndex the account walk uses. A unique constraint here would refuse the overlap
-- that makes a clean handover possible.
--
-- Foreign keys reach into __mj_BizAppsAccounting because accounting owns the dimension
-- vocabulary; OrderLineDimension and OrderLine already point at the same two tables.
--
-- RUN CODEGEN AFTER THIS. Its output is appended below the banner in this same file.

CREATE TABLE __mj_BizAppsOrders.DimensionDefault (
    ID UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    EntityID UNIQUEIDENTIFIER NOT NULL,
    RecordID NVARCHAR(400) NOT NULL,
    DimensionID UNIQUEIDENTIFIER NOT NULL,
    DimensionValueID UNIQUEIDENTIFIER NOT NULL,
    Status NVARCHAR(10) NOT NULL DEFAULT 'Active',
    StartedAt DATETIMEOFFSET NULL,
    EndedAt DATETIMEOFFSET NULL,
    Comments NVARCHAR(MAX) NULL,
    CONSTRAINT PK_DimensionDefault PRIMARY KEY (ID),
    CONSTRAINT CK_DimensionDefault_Status CHECK (Status IN ('Pending', 'Active', 'Disabled')),
    CONSTRAINT CK_DimensionDefault_Window CHECK (EndedAt IS NULL OR StartedAt IS NULL OR EndedAt > StartedAt),
    CONSTRAINT FK_DimensionDefault_Entity FOREIGN KEY (EntityID) REFERENCES __mj.Entity(ID),
    CONSTRAINT FK_DimensionDefault_Dimension FOREIGN KEY (DimensionID) REFERENCES __mj_BizAppsAccounting.Dimension(ID),
    CONSTRAINT FK_DimensionDefault_DimensionValue FOREIGN KEY (DimensionValueID) REFERENCES __mj_BizAppsAccounting.DimensionValue(ID)
);
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Default GL dimension values for order lines, resolved by the same precedence as GL account links: product, then its category and that category''s ancestors, then its product type, then the line''s company. Most specific wins, per dimension.',
    @level0type = N'SCHEMA', @level0name = N'__mj_BizAppsOrders',
    @level1type = N'TABLE',  @level1name = N'DimensionDefault';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The kind of record this default hangs off — MJ Entity id for Products, Product Categories, Product Types or Companies.',
    @level0type = N'SCHEMA', @level0name = N'__mj_BizAppsOrders',
    @level1type = N'TABLE',  @level1name = N'DimensionDefault',
    @level2type = N'COLUMN', @level2name = N'EntityID';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The record this default hangs off, within EntityID.',
    @level0type = N'SCHEMA', @level0name = N'__mj_BizAppsOrders',
    @level1type = N'TABLE',  @level1name = N'DimensionDefault',
    @level2type = N'COLUMN', @level2name = N'RecordID';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The analysis axis this default supplies, from __mj_BizAppsAccounting.Dimension.',
    @level0type = N'SCHEMA', @level0name = N'__mj_BizAppsOrders',
    @level1type = N'TABLE',  @level1name = N'DimensionDefault',
    @level2type = N'COLUMN', @level2name = N'DimensionID';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The value supplied for that axis, from __mj_BizAppsAccounting.DimensionValue.',
    @level0type = N'SCHEMA', @level0name = N'__mj_BizAppsOrders',
    @level1type = N'TABLE',  @level1name = N'DimensionDefault',
    @level2type = N'COLUMN', @level2name = N'DimensionValueID';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Pending, Active or Disabled. Only Active rows are considered, matching how GL account links are resolved.',
    @level0type = N'SCHEMA', @level0name = N'__mj_BizAppsOrders',
    @level1type = N'TABLE',  @level1name = N'DimensionDefault',
    @level2type = N'COLUMN', @level2name = N'Status';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Start of the window this default applies to. NULL is open-ended. Judged against the order date, not today, so a back-dated order resolves what was live when it was placed.',
    @level0type = N'SCHEMA', @level0name = N'__mj_BizAppsOrders',
    @level1type = N'TABLE',  @level1name = N'DimensionDefault',
    @level2type = N'COLUMN', @level2name = N'StartedAt';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'End of the window this default applies to. NULL is open-ended.',
    @level0type = N'SCHEMA', @level0name = N'__mj_BizAppsOrders',
    @level1type = N'TABLE',  @level1name = N'DimensionDefault',
    @level2type = N'COLUMN', @level2name = N'EndedAt';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Free-text note for why this default exists. Not read by anything.',
    @level0type = N'SCHEMA', @level0name = N'__mj_BizAppsOrders',
    @level1type = N'TABLE',  @level1name = N'DimensionDefault',
    @level2type = N'COLUMN', @level2name = N'Comments';
GO


















































-- =============================================================================
--
--   CODEGEN OUTPUT — GENERATED CODE BELOW THIS LINE (do not hand-edit)
--
--   Produced by MJ CodeGen against the hand-authored DDL above, with the
--   ${flyway:defaultSchema} / ${mjSchema} placeholders it already substitutes.
--
--   Registers MJ_BizApps_Orders: Dimension Defaults — the Entity row, its
--   application link and permissions, its EntityFields, the __mj_CreatedAt /
--   __mj_UpdatedAt plumbing and trigger, the foreign-key indexes, the base view
--   vwDimensionDefaults and the three CRUD procedures.
--
--   THIS HAS TO SHIP. A host's mj.config.cjs carries this app's schema in
--   `excludeSchemas`, so `mj codegen` there does not build the view, the
--   procedures or the indexes, and a new table would arrive with no entity
--   behind it at all.
--
--   Only the sections for this new entity are here. A CodeGen run against a
--   clean database re-emits every object in the schema; the rest would rewrite
--   objects this change never touched.
--
-- =============================================================================

/* SQL generated to create new entity MJ_BizApps_Orders: Dimension Defaults */

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
         'd80aaa3d-50f9-4410-96de-dc8a609dcadd',
         'MJ_BizApps_Orders: Dimension Defaults',
         'Dimension Defaults',
         'Default GL dimension values for order lines, resolved by the same precedence as GL account links: product, then its category and that category''s ancestors, then its product type, then the line''s company. Most specific wins, per dimension.',
         NULL,
         'DimensionDefault',
         'vwDimensionDefaults',
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

/* SQL generated to add new entity MJ_BizApps_Orders: Dimension Defaults to application ID: 'FB80FEB4-5505-49D1-93CE-2E7BD030B478' */
INSERT INTO [${mjSchema}].[ApplicationEntity]
                                       ([ApplicationID], [EntityID], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                       ('FB80FEB4-5505-49D1-93CE-2E7BD030B478', 'd80aaa3d-50f9-4410-96de-dc8a609dcadd', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [${mjSchema}].[ApplicationEntity] WHERE [ApplicationID] = 'FB80FEB4-5505-49D1-93CE-2E7BD030B478'), GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ_BizApps_Orders: Dimension Defaults for role UI */
INSERT INTO [${mjSchema}].[EntityPermission]
                ([EntityID], [RoleID], [Type], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt])
              SELECT CAST('d80aaa3d-50f9-4410-96de-dc8a609dcadd' AS uniqueidentifier), CAST('E0AFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier), 'Allow', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE()
              WHERE NOT EXISTS (
                SELECT 1 FROM [${mjSchema}].[EntityPermission]
                WHERE [EntityID] = CAST('d80aaa3d-50f9-4410-96de-dc8a609dcadd' AS uniqueidentifier) AND [RoleID] = CAST('E0AFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier) AND [Type] = 'Allow'
              );

/* SQL generated to add new permission for entity MJ_BizApps_Orders: Dimension Defaults for role Developer */
INSERT INTO [${mjSchema}].[EntityPermission]
                ([EntityID], [RoleID], [Type], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt])
              SELECT CAST('d80aaa3d-50f9-4410-96de-dc8a609dcadd' AS uniqueidentifier), CAST('DEAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier), 'Allow', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE()
              WHERE NOT EXISTS (
                SELECT 1 FROM [${mjSchema}].[EntityPermission]
                WHERE [EntityID] = CAST('d80aaa3d-50f9-4410-96de-dc8a609dcadd' AS uniqueidentifier) AND [RoleID] = CAST('DEAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier) AND [Type] = 'Allow'
              );

/* SQL generated to add new permission for entity MJ_BizApps_Orders: Dimension Defaults for role Integration */
INSERT INTO [${mjSchema}].[EntityPermission]
                ([EntityID], [RoleID], [Type], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt])
              SELECT CAST('d80aaa3d-50f9-4410-96de-dc8a609dcadd' AS uniqueidentifier), CAST('DFAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier), 'Allow', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE()
              WHERE NOT EXISTS (
                SELECT 1 FROM [${mjSchema}].[EntityPermission]
                WHERE [EntityID] = CAST('d80aaa3d-50f9-4410-96de-dc8a609dcadd' AS uniqueidentifier) AND [RoleID] = CAST('DFAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier) AND [Type] = 'Allow'
              );

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.DimensionDefault */
ALTER TABLE [${flyway:defaultSchema}].[DimensionDefault] ADD [__mj_CreatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.DimensionDefault */
UPDATE [${flyway:defaultSchema}].[DimensionDefault] SET [__mj_CreatedAt] = GETUTCDATE() WHERE [__mj_CreatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.DimensionDefault */
ALTER TABLE [${flyway:defaultSchema}].[DimensionDefault] ALTER COLUMN [__mj_CreatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.DimensionDefault */
ALTER TABLE [${flyway:defaultSchema}].[DimensionDefault] ADD CONSTRAINT [DF___mj_BizAppsOrders_DimensionDefault___mj_CreatedAt] DEFAULT GETUTCDATE() FOR [__mj_CreatedAt];
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.DimensionDefault */
ALTER TABLE [${flyway:defaultSchema}].[DimensionDefault] ADD [__mj_UpdatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.DimensionDefault */
UPDATE [${flyway:defaultSchema}].[DimensionDefault] SET [__mj_UpdatedAt] = GETUTCDATE() WHERE [__mj_UpdatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.DimensionDefault */
ALTER TABLE [${flyway:defaultSchema}].[DimensionDefault] ALTER COLUMN [__mj_UpdatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.DimensionDefault */
ALTER TABLE [${flyway:defaultSchema}].[DimensionDefault] ADD CONSTRAINT [DF___mj_BizAppsOrders_DimensionDefault___mj_UpdatedAt] DEFAULT GETUTCDATE() FOR [__mj_UpdatedAt];
GO

/* SQL text to insert 13 new entity field(s) */

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '1f242bc2-c395-47ab-bccd-38b75f1a2349' OR (EntityID = '66D82C24-9C9F-4CD6-B019-53C20274AB00' AND Name = 'Dimension')) BEGIN
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
            '1f242bc2-c395-47ab-bccd-38b75f1a2349',
            '66D82C24-9C9F-4CD6-B019-53C20274AB00', -- Entity: MJ_BizApps_Orders: Order Lines
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${mjSchema}].[EntityField] WHERE [EntityID] = '66D82C24-9C9F-4CD6-B019-53C20274AB00'),
            'Dimension',
            'Dimension',
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '27527f8b-b3f5-4c31-806f-ebde5bb4e871' OR (EntityID = '66D82C24-9C9F-4CD6-B019-53C20274AB00' AND Name = 'DimensionValue')) BEGIN
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
            '27527f8b-b3f5-4c31-806f-ebde5bb4e871',
            '66D82C24-9C9F-4CD6-B019-53C20274AB00', -- Entity: MJ_BizApps_Orders: Order Lines
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${mjSchema}].[EntityField] WHERE [EntityID] = '66D82C24-9C9F-4CD6-B019-53C20274AB00'),
            'DimensionValue',
            'Dimension Value',
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '95404c2e-113f-4b5e-b7c8-17d4e03c6272' OR (EntityID = 'D80AAA3D-50F9-4410-96DE-DC8A609DCADD' AND Name = 'ID')) BEGIN
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
            '95404c2e-113f-4b5e-b7c8-17d4e03c6272',
            'D80AAA3D-50F9-4410-96DE-DC8A609DCADD', -- Entity: MJ_BizApps_Orders: Dimension Defaults
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${mjSchema}].[EntityField] WHERE [EntityID] = 'D80AAA3D-50F9-4410-96DE-DC8A609DCADD'),
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '3bf83b4c-8251-44eb-8b02-391faf95cd63' OR (EntityID = 'D80AAA3D-50F9-4410-96DE-DC8A609DCADD' AND Name = 'EntityID')) BEGIN
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
            '3bf83b4c-8251-44eb-8b02-391faf95cd63',
            'D80AAA3D-50F9-4410-96DE-DC8A609DCADD', -- Entity: MJ_BizApps_Orders: Dimension Defaults
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${mjSchema}].[EntityField] WHERE [EntityID] = 'D80AAA3D-50F9-4410-96DE-DC8A609DCADD'),
            'EntityID',
            'Entity ID',
            'The kind of record this default hangs off — MJ Entity id for Products, Product Categories, Product Types or Companies.',
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '658e8609-5834-45ac-94ea-8bc22d94f703' OR (EntityID = 'D80AAA3D-50F9-4410-96DE-DC8A609DCADD' AND Name = 'RecordID')) BEGIN
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
            '658e8609-5834-45ac-94ea-8bc22d94f703',
            'D80AAA3D-50F9-4410-96DE-DC8A609DCADD', -- Entity: MJ_BizApps_Orders: Dimension Defaults
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${mjSchema}].[EntityField] WHERE [EntityID] = 'D80AAA3D-50F9-4410-96DE-DC8A609DCADD'),
            'RecordID',
            'Record ID',
            'The record this default hangs off, within EntityID.',
            'nvarchar',
            800,
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
            1,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '73c0d75f-386d-4954-b30d-4717ed6a745a' OR (EntityID = 'D80AAA3D-50F9-4410-96DE-DC8A609DCADD' AND Name = 'DimensionID')) BEGIN
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
            '73c0d75f-386d-4954-b30d-4717ed6a745a',
            'D80AAA3D-50F9-4410-96DE-DC8A609DCADD', -- Entity: MJ_BizApps_Orders: Dimension Defaults
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${mjSchema}].[EntityField] WHERE [EntityID] = 'D80AAA3D-50F9-4410-96DE-DC8A609DCADD'),
            'DimensionID',
            'Dimension ID',
            'The analysis axis this default supplies, from ${mjSchema}_BizAppsAccounting.Dimension.',
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
            'F15DE0FC-C7FC-4080-8F33-9308DECB0E46',
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = 'ecc33f95-9cc0-4bb9-953a-a1a922917015' OR (EntityID = 'D80AAA3D-50F9-4410-96DE-DC8A609DCADD' AND Name = 'DimensionValueID')) BEGIN
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
            'ecc33f95-9cc0-4bb9-953a-a1a922917015',
            'D80AAA3D-50F9-4410-96DE-DC8A609DCADD', -- Entity: MJ_BizApps_Orders: Dimension Defaults
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${mjSchema}].[EntityField] WHERE [EntityID] = 'D80AAA3D-50F9-4410-96DE-DC8A609DCADD'),
            'DimensionValueID',
            'Dimension Value ID',
            'The value supplied for that axis, from ${mjSchema}_BizAppsAccounting.DimensionValue.',
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
            'E382FFAB-748C-4EB6-BEA9-1E8DCB7DBC3F',
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '7857579e-5dd3-44db-9226-97855a09aa2d' OR (EntityID = 'D80AAA3D-50F9-4410-96DE-DC8A609DCADD' AND Name = 'Status')) BEGIN
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
            '7857579e-5dd3-44db-9226-97855a09aa2d',
            'D80AAA3D-50F9-4410-96DE-DC8A609DCADD', -- Entity: MJ_BizApps_Orders: Dimension Defaults
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${mjSchema}].[EntityField] WHERE [EntityID] = 'D80AAA3D-50F9-4410-96DE-DC8A609DCADD'),
            'Status',
            'Status',
            'Pending, Active or Disabled. Only Active rows are considered, matching how GL account links are resolved.',
            'nvarchar',
            20,
            0,
            0,
            0,
            'Active',
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = 'b6e07b13-0353-4610-8dd7-514ca74dd522' OR (EntityID = 'D80AAA3D-50F9-4410-96DE-DC8A609DCADD' AND Name = 'StartedAt')) BEGIN
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
            'b6e07b13-0353-4610-8dd7-514ca74dd522',
            'D80AAA3D-50F9-4410-96DE-DC8A609DCADD', -- Entity: MJ_BizApps_Orders: Dimension Defaults
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${mjSchema}].[EntityField] WHERE [EntityID] = 'D80AAA3D-50F9-4410-96DE-DC8A609DCADD'),
            'StartedAt',
            'Started At',
            'Start of the window this default applies to. NULL is open-ended. Judged against the order date, not today, so a back-dated order resolves what was live when it was placed.',
            'datetimeoffset',
            10,
            34,
            7,
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '41b6627a-bb6e-4f71-b0a9-266db3bdff16' OR (EntityID = 'D80AAA3D-50F9-4410-96DE-DC8A609DCADD' AND Name = 'EndedAt')) BEGIN
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
            '41b6627a-bb6e-4f71-b0a9-266db3bdff16',
            'D80AAA3D-50F9-4410-96DE-DC8A609DCADD', -- Entity: MJ_BizApps_Orders: Dimension Defaults
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${mjSchema}].[EntityField] WHERE [EntityID] = 'D80AAA3D-50F9-4410-96DE-DC8A609DCADD'),
            'EndedAt',
            'Ended At',
            'End of the window this default applies to. NULL is open-ended.',
            'datetimeoffset',
            10,
            34,
            7,
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '7d5ad6e8-bde0-4d93-bfee-291dfef8ccb9' OR (EntityID = 'D80AAA3D-50F9-4410-96DE-DC8A609DCADD' AND Name = 'Comments')) BEGIN
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
            '7d5ad6e8-bde0-4d93-bfee-291dfef8ccb9',
            'D80AAA3D-50F9-4410-96DE-DC8A609DCADD', -- Entity: MJ_BizApps_Orders: Dimension Defaults
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${mjSchema}].[EntityField] WHERE [EntityID] = 'D80AAA3D-50F9-4410-96DE-DC8A609DCADD'),
            'Comments',
            'Comments',
            'Free-text note for why this default exists. Not read by anything.',
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = 'ec9988f9-d1f4-4240-9120-e3c55c42eb42' OR (EntityID = 'D80AAA3D-50F9-4410-96DE-DC8A609DCADD' AND Name = '__mj_CreatedAt')) BEGIN
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
            'ec9988f9-d1f4-4240-9120-e3c55c42eb42',
            'D80AAA3D-50F9-4410-96DE-DC8A609DCADD', -- Entity: MJ_BizApps_Orders: Dimension Defaults
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${mjSchema}].[EntityField] WHERE [EntityID] = 'D80AAA3D-50F9-4410-96DE-DC8A609DCADD'),
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = 'dee1850e-c535-4a51-a913-33c30b91c43b' OR (EntityID = 'D80AAA3D-50F9-4410-96DE-DC8A609DCADD' AND Name = '__mj_UpdatedAt')) BEGIN
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
            'dee1850e-c535-4a51-a913-33c30b91c43b',
            'D80AAA3D-50F9-4410-96DE-DC8A609DCADD', -- Entity: MJ_BizApps_Orders: Dimension Defaults
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${mjSchema}].[EntityField] WHERE [EntityID] = 'D80AAA3D-50F9-4410-96DE-DC8A609DCADD'),
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


/* Fulfillment status value list for OrderLine.FulfillmentStatus.

   Resolved by NATURAL KEY, not by the authoring database's EntityField ID. CodeGen mints
   EntityField IDs per host, so 'F04330BA-4A37-4674-A2FE-237CE04E2C52' exists only on the
   database this file was generated from. Every other install fails here with

       The INSERT statement conflicted with the FOREIGN KEY constraint
       "FK_EntityFieldValue_EntityField"

   which aborts the whole migration -- on AIDP Next stage, at batch 19/30.

   This is a REGRESSION: the identical defect in V202609061900 was fixed in 5.11.0 by the
   block this one now mirrors. Regenerating this migration from the authoring database
   re-emitted the hardcoded ID. Any future CodeGen output touching EntityFieldValue needs the
   same treatment before it ships.

   Each value is guarded independently on (EntityFieldID, Value) so a host that already
   carries some of them -- including every host that ran the 5.11.0 fix, which seeded these
   same five values under its own row IDs -- keeps its rows untouched and gains only what is
   missing. */
DECLARE @FulfillmentStatusFieldID UNIQUEIDENTIFIER = (
    SELECT f.[ID]
      FROM [${mjSchema}].[EntityField] f
      JOIN [${mjSchema}].[Entity]      e ON e.[ID] = f.[EntityID]
     WHERE e.[SchemaName] = '${flyway:defaultSchema}'
       AND e.[BaseTable]  = 'OrderLine'
       AND f.[Name]       = 'FulfillmentStatus');

IF @FulfillmentStatusFieldID IS NULL
    THROW 50000, 'OrderLine.FulfillmentStatus EntityField not found - CodeGen must run before this migration.', 1;

INSERT INTO [${mjSchema}].[EntityFieldValue]
       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
SELECT CAST(v.[ID] AS UNIQUEIDENTIFIER), @FulfillmentStatusFieldID, v.[Sequence], v.[Value], v.[Value],
       GETUTCDATE(), GETUTCDATE()
  FROM (VALUES
            ('a88f282d-c98e-4e01-80f0-f1bd37dc94a0', 1, 'Fulfilled'),
            ('6646842a-6fac-4fd3-b768-c5071e9e1e1c', 2, 'NotApplicable'),
            ('aedb3c4b-ecf2-4e94-be1a-68fa958ba75d', 3, 'PartiallyFulfilled'),
            ('7c0ebe63-0088-4f8f-a32e-ce9e97c9b577', 4, 'Pending'),
            ('45402546-5241-4a96-94e3-a5f62d5c67ff', 5, 'Returned')
       ) AS v([ID], [Sequence], [Value])
 WHERE NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityFieldValue] x
                    WHERE x.[EntityFieldID] = @FulfillmentStatusFieldID AND x.[Value] = v.[Value])
   AND NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityFieldValue] x
                    WHERE x.[ID] = CAST(v.[ID] AS UNIQUEIDENTIFIER));

UPDATE [${mjSchema}].[EntityField] SET ValueListType = 'List' WHERE [ID] = @FulfillmentStatusFieldID;


/* SQL text to insert entity field value with ID 426bbdff-8c6b-46e7-b79e-d769ecb59e7d */
INSERT INTO [${mjSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('426bbdff-8c6b-46e7-b79e-d769ecb59e7d', '7857579E-5DD3-44DB-9226-97855A09AA2D', 1, 'Active', 'Active', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID e672f01c-eb62-4125-9ec3-2840a42ba88c */
INSERT INTO [${mjSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('e672f01c-eb62-4125-9ec3-2840a42ba88c', '7857579E-5DD3-44DB-9226-97855A09AA2D', 2, 'Disabled', 'Disabled', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 5c447cac-32b4-4f0d-b4d1-f54d4c141622 */
INSERT INTO [${mjSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('5c447cac-32b4-4f0d-b4d1-f54d4c141622', '7857579E-5DD3-44DB-9226-97855A09AA2D', 3, 'Pending', 'Pending', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID 7857579E-5DD3-44DB-9226-97855A09AA2D */
UPDATE [${mjSchema}].[EntityField] SET ValueListType='List' WHERE ID='7857579E-5DD3-44DB-9226-97855A09AA2D';

/* SQL text to delete entity field value ID 1CFD7B10-D9D0-4BA0-A4FB-DBC866065E58 */
DELETE FROM [${mjSchema}].[EntityFieldValue] WHERE ID='1CFD7B10-D9D0-4BA0-A4FB-DBC866065E58';

/* SQL text to delete entity field value ID 91085CA1-AD50-4305-BA85-5AECFFA5575B */
DELETE FROM [${mjSchema}].[EntityFieldValue] WHERE ID='91085CA1-AD50-4305-BA85-5AECFFA5575B';


/* Create Entity Relationship: MJ_BizApps_Accounting: Dimension Values -> MJ_BizApps_Orders: Order Lines (One To Many via DimensionValueID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${mjSchema}].[EntityRelationship] WHERE [ID] = 'e8cc3608-7549-4834-89d2-dd578468aad9'
   )
   BEGIN
      INSERT INTO [${mjSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('e8cc3608-7549-4834-89d2-dd578468aad9', 'E382FFAB-748C-4EB6-BEA9-1E8DCB7DBC3F', '66D82C24-9C9F-4CD6-B019-53C20274AB00', 'DimensionValueID', 'One To Many', 1, 1, 5, GETUTCDATE(), GETUTCDATE())
   END;


/* Create Entity Relationship: MJ_BizApps_Accounting: Dimension Values -> MJ_BizApps_Orders: Dimension Defaults (One To Many via DimensionValueID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${mjSchema}].[EntityRelationship] WHERE [ID] = '7718a80a-8858-4581-ba0e-af12b734b54a'
   )
   BEGIN
      INSERT INTO [${mjSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('7718a80a-8858-4581-ba0e-af12b734b54a', 'E382FFAB-748C-4EB6-BEA9-1E8DCB7DBC3F', 'D80AAA3D-50F9-4410-96DE-DC8A609DCADD', 'DimensionValueID', 'One To Many', 1, 1, 6, GETUTCDATE(), GETUTCDATE())
   END;


/* Create Entity Relationship: MJ: Entities -> MJ_BizApps_Orders: Dimension Defaults (One To Many via EntityID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${mjSchema}].[EntityRelationship] WHERE [ID] = '440e124e-432e-4154-b2d7-644182efa02e'
   )
   BEGIN
      INSERT INTO [${mjSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('440e124e-432e-4154-b2d7-644182efa02e', 'E0238F34-2837-EF11-86D4-6045BDEE16E6', 'D80AAA3D-50F9-4410-96DE-DC8A609DCADD', 'EntityID', 'One To Many', 1, 1, 86, GETUTCDATE(), GETUTCDATE())
   END;


/* Create Entity Relationship: MJ_BizApps_Accounting: Dimensions -> MJ_BizApps_Orders: Order Lines (One To Many via DimensionID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${mjSchema}].[EntityRelationship] WHERE [ID] = '7c8fc186-1011-41cc-b730-2645657a0c94'
   )
   BEGIN
      INSERT INTO [${mjSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('7c8fc186-1011-41cc-b730-2645657a0c94', 'F15DE0FC-C7FC-4080-8F33-9308DECB0E46', '66D82C24-9C9F-4CD6-B019-53C20274AB00', 'DimensionID', 'One To Many', 1, 1, 6, GETUTCDATE(), GETUTCDATE())
   END;
                    
/* Create Entity Relationship: MJ_BizApps_Accounting: Dimensions -> MJ_BizApps_Orders: Dimension Defaults (One To Many via DimensionID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${mjSchema}].[EntityRelationship] WHERE [ID] = 'bdf453fe-1050-49e9-8201-b87c4c8ee927'
   )
   BEGIN
      INSERT INTO [${mjSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('bdf453fe-1050-49e9-8201-b87c4c8ee927', 'F15DE0FC-C7FC-4080-8F33-9308DECB0E46', 'D80AAA3D-50F9-4410-96DE-DC8A609DCADD', 'DimensionID', 'One To Many', 1, 1, 7, GETUTCDATE(), GETUTCDATE())
   END;

/* Index for Foreign Keys for DimensionDefault */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Dimension Defaults
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key EntityID in table DimensionDefault
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_DimensionDefault_EntityID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[DimensionDefault]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_DimensionDefault_EntityID ON [${flyway:defaultSchema}].[DimensionDefault] ([EntityID]);

-- Index for foreign key DimensionID in table DimensionDefault
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_DimensionDefault_DimensionID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[DimensionDefault]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_DimensionDefault_DimensionID ON [${flyway:defaultSchema}].[DimensionDefault] ([DimensionID]);

-- Index for foreign key DimensionValueID in table DimensionDefault
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_DimensionDefault_DimensionValueID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[DimensionDefault]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_DimensionDefault_DimensionValueID ON [${flyway:defaultSchema}].[DimensionDefault] ([DimensionValueID]);

/* SQL text to update entity field related entity name field map for entity field ID 3BF83B4C-8251-44EB-8B02-391FAF95CD63 */
EXEC [${mjSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='3BF83B4C-8251-44EB-8B02-391FAF95CD63', @RelatedEntityNameFieldMap='Entity';

/* SQL text to update entity field related entity name field map for entity field ID 73C0D75F-386D-4954-B30D-4717ED6A745A */
EXEC [${mjSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='73C0D75F-386D-4954-B30D-4717ED6A745A', @RelatedEntityNameFieldMap='Dimension';

/* SQL text to update entity field related entity name field map for entity field ID ECC33F95-9CC0-4BB9-953A-A1A922917015 */
EXEC [${mjSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='ECC33F95-9CC0-4BB9-953A-A1A922917015', @RelatedEntityNameFieldMap='DimensionValue';

/* Base View SQL for MJ_BizApps_Orders: Dimension Defaults */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Dimension Defaults
-- Item: vwDimensionDefaults
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ_BizApps_Orders: Dimension Defaults
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  DimensionDefault
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwDimensionDefaults]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwDimensionDefaults];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwDimensionDefaults]
AS
SELECT
    d.*,
    MJEntity_EntityID.[Name] AS [Entity],
    mjBizAppsAccountingDimension_DimensionID.[Name] AS [Dimension],
    mjBizAppsAccountingDimensionValue_DimensionValueID.[Name] AS [DimensionValue]
FROM
    [${flyway:defaultSchema}].[DimensionDefault] AS d
INNER JOIN
    [${mjSchema}].[Entity] AS MJEntity_EntityID
  ON
    [d].[EntityID] = MJEntity_EntityID.[ID]
INNER JOIN
    [${mjSchema}_BizAppsAccounting].[Dimension] AS mjBizAppsAccountingDimension_DimensionID
  ON
    [d].[DimensionID] = mjBizAppsAccountingDimension_DimensionID.[ID]
INNER JOIN
    [${mjSchema}_BizAppsAccounting].[DimensionValue] AS mjBizAppsAccountingDimensionValue_DimensionValueID
  ON
    [d].[DimensionValueID] = mjBizAppsAccountingDimensionValue_DimensionValueID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwDimensionDefaults] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for MJ_BizApps_Orders: Dimension Defaults */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Dimension Defaults
-- Item: Permissions for vwDimensionDefaults
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwDimensionDefaults] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for MJ_BizApps_Orders: Dimension Defaults */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Dimension Defaults
-- Item: spCreateDimensionDefault
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR DimensionDefault
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateDimensionDefault]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateDimensionDefault];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateDimensionDefault]
    @ID uniqueidentifier = NULL,
    @EntityID uniqueidentifier,
    @RecordID nvarchar(400),
    @DimensionID uniqueidentifier,
    @DimensionValueID uniqueidentifier,
    @Status nvarchar(10) = NULL,
    @StartedAt_Clear bit = 0,
    @StartedAt datetimeoffset = NULL,
    @EndedAt_Clear bit = 0,
    @EndedAt datetimeoffset = NULL,
    @Comments_Clear bit = 0,
    @Comments nvarchar(MAX) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)

    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[DimensionDefault]
            (
                [ID],
                [EntityID],
                [RecordID],
                [DimensionID],
                [DimensionValueID],
                [Status],
                [StartedAt],
                [EndedAt],
                [Comments]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @EntityID,
                @RecordID,
                @DimensionID,
                @DimensionValueID,
                ISNULL(@Status, 'Active'),
                CASE WHEN @StartedAt_Clear = 1 THEN NULL ELSE ISNULL(@StartedAt, NULL) END,
                CASE WHEN @EndedAt_Clear = 1 THEN NULL ELSE ISNULL(@EndedAt, NULL) END,
                CASE WHEN @Comments_Clear = 1 THEN NULL ELSE ISNULL(@Comments, NULL) END
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[DimensionDefault]
            (
                [EntityID],
                [RecordID],
                [DimensionID],
                [DimensionValueID],
                [Status],
                [StartedAt],
                [EndedAt],
                [Comments]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @EntityID,
                @RecordID,
                @DimensionID,
                @DimensionValueID,
                ISNULL(@Status, 'Active'),
                CASE WHEN @StartedAt_Clear = 1 THEN NULL ELSE ISNULL(@StartedAt, NULL) END,
                CASE WHEN @EndedAt_Clear = 1 THEN NULL ELSE ISNULL(@EndedAt, NULL) END,
                CASE WHEN @Comments_Clear = 1 THEN NULL ELSE ISNULL(@Comments, NULL) END
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwDimensionDefaults] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateDimensionDefault] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ_BizApps_Orders: Dimension Defaults */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateDimensionDefault] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for MJ_BizApps_Orders: Dimension Defaults */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Dimension Defaults
-- Item: spUpdateDimensionDefault
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR DimensionDefault
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateDimensionDefault]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateDimensionDefault];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateDimensionDefault]
    @ID uniqueidentifier,
    @EntityID uniqueidentifier = NULL,
    @RecordID nvarchar(400) = NULL,
    @DimensionID uniqueidentifier = NULL,
    @DimensionValueID uniqueidentifier = NULL,
    @Status nvarchar(10) = NULL,
    @StartedAt_Clear bit = 0,
    @StartedAt datetimeoffset = NULL,
    @EndedAt_Clear bit = 0,
    @EndedAt datetimeoffset = NULL,
    @Comments_Clear bit = 0,
    @Comments nvarchar(MAX) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[DimensionDefault]
    SET
        [EntityID] = ISNULL(@EntityID, [EntityID]),
        [RecordID] = ISNULL(@RecordID, [RecordID]),
        [DimensionID] = ISNULL(@DimensionID, [DimensionID]),
        [DimensionValueID] = ISNULL(@DimensionValueID, [DimensionValueID]),
        [Status] = ISNULL(@Status, [Status]),
        [StartedAt] = CASE WHEN @StartedAt_Clear = 1 THEN NULL ELSE ISNULL(@StartedAt, [StartedAt]) END,
        [EndedAt] = CASE WHEN @EndedAt_Clear = 1 THEN NULL ELSE ISNULL(@EndedAt, [EndedAt]) END,
        [Comments] = CASE WHEN @Comments_Clear = 1 THEN NULL ELSE ISNULL(@Comments, [Comments]) END
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwDimensionDefaults] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwDimensionDefaults]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateDimensionDefault] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the DimensionDefault table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateDimensionDefault]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateDimensionDefault];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateDimensionDefault
ON [${flyway:defaultSchema}].[DimensionDefault]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[DimensionDefault]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[DimensionDefault] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for MJ_BizApps_Orders: Dimension Defaults */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateDimensionDefault] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for MJ_BizApps_Orders: Dimension Defaults */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Dimension Defaults
-- Item: spDeleteDimensionDefault
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR DimensionDefault
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteDimensionDefault]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteDimensionDefault];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteDimensionDefault]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[DimensionDefault]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteDimensionDefault] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for MJ_BizApps_Orders: Dimension Defaults */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteDimensionDefault] TO [cdp_Developer], [cdp_Integration];
