-- =============================================================================
-- V202611170400 — SalesAuthorityMixTier: a rep's share limit raised by the
--                 order's product mix (golive #281)
-- =============================================================================
-- A rep's SalesAuthority holds one limit on an order's concessions as a share of
-- its net total (MaxConcessionPctOfContract). The pricing policy lets some reps
-- grant more on a deal that spans several product families: for example 10% with
-- two and 15% with three. A product family is a ProductType.
--
-- Each row raises its authority's share limit on an order whose lines span at
-- least MinProductTypes distinct product types. The highest tier met applies; a
-- tier at or below the authority's own limit changes nothing, and an authority
-- with no share limit stays unlimited. Bundle components and reversals are not
-- counted. The count is taken when a concession is recorded and again at confirm.
--
-- RUN CODEGEN AFTER THIS so the new entity, its view, CRUD procs and subclass
-- are generated.
-- =============================================================================

CREATE TABLE [${flyway:defaultSchema}].[SalesAuthorityMixTier] (
    [ID] UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    [SalesAuthorityID] UNIQUEIDENTIFIER NOT NULL,
    [MinProductTypes] INT NOT NULL,
    [MaxConcessionPctOfContract] DECIMAL(7,4) NOT NULL,
    CONSTRAINT PK_SalesAuthorityMixTier PRIMARY KEY ([ID]),
    CONSTRAINT FK_SalesAuthorityMixTier_SalesAuthority FOREIGN KEY ([SalesAuthorityID])
        REFERENCES [${flyway:defaultSchema}].[SalesAuthority]([ID]),
    CONSTRAINT UQ_SalesAuthorityMixTier_Authority_MinProductTypes UNIQUE ([SalesAuthorityID], [MinProductTypes]),
    CONSTRAINT CK_SalesAuthorityMixTier_MinProductTypes CHECK ([MinProductTypes] >= 2),
    CONSTRAINT CK_SalesAuthorityMixTier_MaxConcessionPctOfContract CHECK ([MaxConcessionPctOfContract] >= 0 AND [MaxConcessionPctOfContract] <= 1)
);
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'A tier of a rep''s Sales Authority that raises its share limit (MaxConcessionPctOfContract) on an order whose lines span several product types, a product type being a product family. The highest tier the order meets applies. Bundle components and reversals are not counted.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'SalesAuthorityMixTier';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The Sales Authority whose share limit this tier raises.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'SalesAuthorityMixTier',
    @level2type = N'COLUMN', @level2name = N'SalesAuthorityID';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The fewest distinct product types the order''s lines must span for this tier to apply. Two or more, unique per authority.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'SalesAuthorityMixTier',
    @level2type = N'COLUMN', @level2name = N'MinProductTypes';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The share limit, as a fraction from 0 to 1, on an order that meets this tier: the order''s concessions as a share of its net total at or above it need approval, as for SalesAuthority.MaxConcessionPctOfContract. Only raises that limit; a value at or below it changes nothing.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'SalesAuthorityMixTier',
    @level2type = N'COLUMN', @level2name = N'MaxConcessionPctOfContract';
GO



















































-- =============================================================================
--
--   CODEGEN OUTPUT — GENERATED CODE BELOW THIS LINE (do not hand-edit)
--
--   Produced by MJ CodeGen 6.2.1 against a database built from migrations alone,
--   with the hand-authored DDL above applied. Contains the new
--   MJ_BizApps_Orders: Sales Authority Mix Tiers entity (metadata, fields,
--   relationship from Sales Authorities, view, CRUD procs, trigger, validators).
--   The same run also re-emitted SQL for entities this migration does not
--   touch; that output is left out.
--
-- =============================================================================


/* SQL generated to create new entity MJ_BizApps_Orders: Sales Authority Mix Tiers */

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
         'e49f94da-17ac-428c-8956-c3a760fc71d7',
         'MJ_BizApps_Orders: Sales Authority Mix Tiers',
         'Sales Authority Mix Tiers',
         'A tier of a rep''s Sales Authority that raises its share limit (MaxConcessionPctOfContract) on an order whose lines span several product types, a product type being a product family. The highest tier the order meets applies. Bundle components and reversals are not counted.',
         NULL,
         'SalesAuthorityMixTier',
         'vwSalesAuthorityMixTiers',
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

/* SQL generated to add entity MJ_BizApps_Orders: Sales Authority Mix Tiers to application ID: 'FB80FEB4-5505-49D1-93CE-2E7BD030B478' */
INSERT INTO [${mjSchema}].[ApplicationEntity]
                                    ([ApplicationID], [EntityID], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                    ('FB80FEB4-5505-49D1-93CE-2E7BD030B478', 'e49f94da-17ac-428c-8956-c3a760fc71d7', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [${mjSchema}].[ApplicationEntity] WHERE [ApplicationID] = 'FB80FEB4-5505-49D1-93CE-2E7BD030B478'), GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ_BizApps_Orders: Sales Authority Mix Tiers for role UI */
INSERT INTO [${mjSchema}].[EntityPermission]
                ([EntityID], [RoleID], [Type], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt])
              SELECT CAST('e49f94da-17ac-428c-8956-c3a760fc71d7' AS uniqueidentifier), CAST('E0AFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier), 'Allow', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE()
              WHERE NOT EXISTS (
                SELECT 1 FROM [${mjSchema}].[EntityPermission]
                WHERE [EntityID] = CAST('e49f94da-17ac-428c-8956-c3a760fc71d7' AS uniqueidentifier) AND [RoleID] = CAST('E0AFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier) AND [Type] = 'Allow'
              );

/* SQL generated to add new permission for entity MJ_BizApps_Orders: Sales Authority Mix Tiers for role Developer */
INSERT INTO [${mjSchema}].[EntityPermission]
                ([EntityID], [RoleID], [Type], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt])
              SELECT CAST('e49f94da-17ac-428c-8956-c3a760fc71d7' AS uniqueidentifier), CAST('DEAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier), 'Allow', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE()
              WHERE NOT EXISTS (
                SELECT 1 FROM [${mjSchema}].[EntityPermission]
                WHERE [EntityID] = CAST('e49f94da-17ac-428c-8956-c3a760fc71d7' AS uniqueidentifier) AND [RoleID] = CAST('DEAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier) AND [Type] = 'Allow'
              );

/* SQL generated to add new permission for entity MJ_BizApps_Orders: Sales Authority Mix Tiers for role Integration */
INSERT INTO [${mjSchema}].[EntityPermission]
                ([EntityID], [RoleID], [Type], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt])
              SELECT CAST('e49f94da-17ac-428c-8956-c3a760fc71d7' AS uniqueidentifier), CAST('DFAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier), 'Allow', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE()
              WHERE NOT EXISTS (
                SELECT 1 FROM [${mjSchema}].[EntityPermission]
                WHERE [EntityID] = CAST('e49f94da-17ac-428c-8956-c3a760fc71d7' AS uniqueidentifier) AND [RoleID] = CAST('DFAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier) AND [Type] = 'Allow'
              );

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.SalesAuthorityMixTier */
ALTER TABLE [${flyway:defaultSchema}].[SalesAuthorityMixTier] ADD [__mj_CreatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.SalesAuthorityMixTier */
UPDATE [${flyway:defaultSchema}].[SalesAuthorityMixTier] SET [__mj_CreatedAt] = GETUTCDATE() WHERE [__mj_CreatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.SalesAuthorityMixTier */
ALTER TABLE [${flyway:defaultSchema}].[SalesAuthorityMixTier] ALTER COLUMN [__mj_CreatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.SalesAuthorityMixTier */
ALTER TABLE [${flyway:defaultSchema}].[SalesAuthorityMixTier] ADD CONSTRAINT [DF___mj_BizAppsOrders_SalesAuthorityMixTier___mj_CreatedAt] DEFAULT GETUTCDATE() FOR [__mj_CreatedAt];
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.SalesAuthorityMixTier */
ALTER TABLE [${flyway:defaultSchema}].[SalesAuthorityMixTier] ADD [__mj_UpdatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.SalesAuthorityMixTier */
UPDATE [${flyway:defaultSchema}].[SalesAuthorityMixTier] SET [__mj_UpdatedAt] = GETUTCDATE() WHERE [__mj_UpdatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.SalesAuthorityMixTier */
ALTER TABLE [${flyway:defaultSchema}].[SalesAuthorityMixTier] ALTER COLUMN [__mj_UpdatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.SalesAuthorityMixTier */
ALTER TABLE [${flyway:defaultSchema}].[SalesAuthorityMixTier] ADD CONSTRAINT [DF___mj_BizAppsOrders_SalesAuthorityMixTier___mj_UpdatedAt] DEFAULT GETUTCDATE() FOR [__mj_UpdatedAt];
GO

/* SQL text to insert 6 new entity field(s) */

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '0dd392e9-972d-4b8b-b7e4-db40f21340fd' OR (EntityID = 'E49F94DA-17AC-428C-8956-C3A760FC71D7' AND Name = 'ID')) BEGIN
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
            '0dd392e9-972d-4b8b-b7e4-db40f21340fd',
            'E49F94DA-17AC-428C-8956-C3A760FC71D7', -- Entity: MJ_BizApps_Orders: Sales Authority Mix Tiers
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${mjSchema}].[EntityField] WHERE [EntityID] = 'E49F94DA-17AC-428C-8956-C3A760FC71D7'),
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = 'c2990e7c-ea73-402a-ab00-cdee47e1f2d0' OR (EntityID = 'E49F94DA-17AC-428C-8956-C3A760FC71D7' AND Name = 'SalesAuthorityID')) BEGIN
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
            'c2990e7c-ea73-402a-ab00-cdee47e1f2d0',
            'E49F94DA-17AC-428C-8956-C3A760FC71D7', -- Entity: MJ_BizApps_Orders: Sales Authority Mix Tiers
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${mjSchema}].[EntityField] WHERE [EntityID] = 'E49F94DA-17AC-428C-8956-C3A760FC71D7'),
            'SalesAuthorityID',
            'Sales Authority ID',
            'The Sales Authority whose share limit this tier raises.',
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
            '29E748BF-E356-4AC1-BCE5-71E05279BAF8',
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '23d7b025-7fa8-4966-8343-cb65f8fa97a3' OR (EntityID = 'E49F94DA-17AC-428C-8956-C3A760FC71D7' AND Name = 'MinProductTypes')) BEGIN
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
            '23d7b025-7fa8-4966-8343-cb65f8fa97a3',
            'E49F94DA-17AC-428C-8956-C3A760FC71D7', -- Entity: MJ_BizApps_Orders: Sales Authority Mix Tiers
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${mjSchema}].[EntityField] WHERE [EntityID] = 'E49F94DA-17AC-428C-8956-C3A760FC71D7'),
            'MinProductTypes',
            'Min Product Types',
            'The fewest distinct product types the order''s lines must span for this tier to apply. Two or more, unique per authority.',
            'int',
            4,
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
            1,
            0,
            1,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = 'e8ebcd08-ff4a-4a60-b3fb-2de98af8744f' OR (EntityID = 'E49F94DA-17AC-428C-8956-C3A760FC71D7' AND Name = 'MaxConcessionPctOfContract')) BEGIN
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
            'e8ebcd08-ff4a-4a60-b3fb-2de98af8744f',
            'E49F94DA-17AC-428C-8956-C3A760FC71D7', -- Entity: MJ_BizApps_Orders: Sales Authority Mix Tiers
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${mjSchema}].[EntityField] WHERE [EntityID] = 'E49F94DA-17AC-428C-8956-C3A760FC71D7'),
            'MaxConcessionPctOfContract',
            'Max Concession Pct Of Contract',
            'The share limit, as a fraction from 0 to 1, on an order that meets this tier: the order''s concessions as a share of its net total at or above it need approval, as for SalesAuthority.MaxConcessionPctOfContract. Only raises that limit; a value at or below it changes nothing.',
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
            1,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = 'e3cbb803-822c-4dd0-a9f3-542cce94360c' OR (EntityID = 'E49F94DA-17AC-428C-8956-C3A760FC71D7' AND Name = '__mj_CreatedAt')) BEGIN
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
            'e3cbb803-822c-4dd0-a9f3-542cce94360c',
            'E49F94DA-17AC-428C-8956-C3A760FC71D7', -- Entity: MJ_BizApps_Orders: Sales Authority Mix Tiers
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${mjSchema}].[EntityField] WHERE [EntityID] = 'E49F94DA-17AC-428C-8956-C3A760FC71D7'),
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
            1,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '7e632b65-c80d-47ea-9540-5c2d088f78b4' OR (EntityID = 'E49F94DA-17AC-428C-8956-C3A760FC71D7' AND Name = '__mj_UpdatedAt')) BEGIN
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
            '7e632b65-c80d-47ea-9540-5c2d088f78b4',
            'E49F94DA-17AC-428C-8956-C3A760FC71D7', -- Entity: MJ_BizApps_Orders: Sales Authority Mix Tiers
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${mjSchema}].[EntityField] WHERE [EntityID] = 'E49F94DA-17AC-428C-8956-C3A760FC71D7'),
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

/* Create Entity Relationship: MJ_BizApps_Orders: Sales Authorities -> MJ_BizApps_Orders: Sales Authority Mix Tiers (One To Many via SalesAuthorityID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${mjSchema}].[EntityRelationship] WHERE [ID] = 'a1abea7f-a61a-4121-ac08-76f00ec7cbb2' OR ([EntityID] = '29E748BF-E356-4AC1-BCE5-71E05279BAF8' AND [RelatedEntityID] = 'E49F94DA-17AC-428C-8956-C3A760FC71D7' AND [RelatedEntityJoinField] = 'SalesAuthorityID')
   )
   BEGIN
      INSERT INTO [${mjSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('a1abea7f-a61a-4121-ac08-76f00ec7cbb2', '29E748BF-E356-4AC1-BCE5-71E05279BAF8', 'E49F94DA-17AC-428C-8956-C3A760FC71D7', 'SalesAuthorityID', 'One To Many', 1, 1, 3, GETUTCDATE(), GETUTCDATE())
   END;

/* Index for Foreign Keys for SalesAuthorityMixTier */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Sales Authority Mix Tiers
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key SalesAuthorityID in table SalesAuthorityMixTier
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_SalesAuthorityMixTier_SalesAuthorityID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[SalesAuthorityMixTier]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_SalesAuthorityMixTier_SalesAuthorityID ON [${flyway:defaultSchema}].[SalesAuthorityMixTier] ([SalesAuthorityID]);

/* Base View SQL for MJ_BizApps_Orders: Sales Authority Mix Tiers */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Sales Authority Mix Tiers
-- Item: vwSalesAuthorityMixTiers
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ_BizApps_Orders: Sales Authority Mix Tiers
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  SalesAuthorityMixTier
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwSalesAuthorityMixTiers]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwSalesAuthorityMixTiers];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwSalesAuthorityMixTiers]
AS
SELECT
    s.*
FROM
    [${flyway:defaultSchema}].[SalesAuthorityMixTier] AS s
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwSalesAuthorityMixTiers] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for MJ_BizApps_Orders: Sales Authority Mix Tiers */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Sales Authority Mix Tiers
-- Item: Permissions for vwSalesAuthorityMixTiers
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwSalesAuthorityMixTiers] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for MJ_BizApps_Orders: Sales Authority Mix Tiers */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Sales Authority Mix Tiers
-- Item: spCreateSalesAuthorityMixTier
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR SalesAuthorityMixTier
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateSalesAuthorityMixTier]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateSalesAuthorityMixTier];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateSalesAuthorityMixTier]
    @ID uniqueidentifier = NULL,
    @SalesAuthorityID uniqueidentifier,
    @MinProductTypes int,
    @MaxConcessionPctOfContract decimal(7, 4)
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)

    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[SalesAuthorityMixTier]
            (
                [ID],
                [SalesAuthorityID],
                [MinProductTypes],
                [MaxConcessionPctOfContract]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @SalesAuthorityID,
                @MinProductTypes,
                @MaxConcessionPctOfContract
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[SalesAuthorityMixTier]
            (
                [SalesAuthorityID],
                [MinProductTypes],
                [MaxConcessionPctOfContract]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @SalesAuthorityID,
                @MinProductTypes,
                @MaxConcessionPctOfContract
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwSalesAuthorityMixTiers] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateSalesAuthorityMixTier] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ_BizApps_Orders: Sales Authority Mix Tiers */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateSalesAuthorityMixTier] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for MJ_BizApps_Orders: Sales Authority Mix Tiers */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Sales Authority Mix Tiers
-- Item: spUpdateSalesAuthorityMixTier
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR SalesAuthorityMixTier
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateSalesAuthorityMixTier]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateSalesAuthorityMixTier];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateSalesAuthorityMixTier]
    @ID uniqueidentifier,
    @SalesAuthorityID uniqueidentifier = NULL,
    @MinProductTypes int = NULL,
    @MaxConcessionPctOfContract decimal(7, 4) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[SalesAuthorityMixTier]
    SET
        [SalesAuthorityID] = ISNULL(@SalesAuthorityID, [SalesAuthorityID]),
        [MinProductTypes] = ISNULL(@MinProductTypes, [MinProductTypes]),
        [MaxConcessionPctOfContract] = ISNULL(@MaxConcessionPctOfContract, [MaxConcessionPctOfContract])
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwSalesAuthorityMixTiers] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwSalesAuthorityMixTiers]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateSalesAuthorityMixTier] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the SalesAuthorityMixTier table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateSalesAuthorityMixTier]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateSalesAuthorityMixTier];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateSalesAuthorityMixTier
ON [${flyway:defaultSchema}].[SalesAuthorityMixTier]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[SalesAuthorityMixTier]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[SalesAuthorityMixTier] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for MJ_BizApps_Orders: Sales Authority Mix Tiers */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateSalesAuthorityMixTier] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for MJ_BizApps_Orders: Sales Authority Mix Tiers */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Sales Authority Mix Tiers
-- Item: spDeleteSalesAuthorityMixTier
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR SalesAuthorityMixTier
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteSalesAuthorityMixTier]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteSalesAuthorityMixTier];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteSalesAuthorityMixTier]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[SalesAuthorityMixTier]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteSalesAuthorityMixTier] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for MJ_BizApps_Orders: Sales Authority Mix Tiers */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteSalesAuthorityMixTier] TO [cdp_Developer], [cdp_Integration];

/* Set field properties for entity */

               UPDATE [${mjSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'C2990E7C-EA73-402A-AB00-CDEE47E1F2D0'
               AND AutoUpdateDefaultInView = 1;

/* Set categories for 6 fields */

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Sales Authority Mix Tiers.ID 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '0DD392E9-972D-4B8B-B7E4-DB40F21340FD';

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Sales Authority Mix Tiers.SalesAuthorityID 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'Mix Tier Configuration',
   GeneratedFormSection = 'Category',
   DisplayName = 'Sales Authority'
WHERE 
   ID = 'C2990E7C-EA73-402A-AB00-CDEE47E1F2D0';

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Sales Authority Mix Tiers.MinProductTypes 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'Mix Tier Configuration',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '23D7B025-7FA8-4966-8343-CB65F8FA97A3';

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Sales Authority Mix Tiers.MaxConcessionPctOfContract 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'Mix Tier Configuration',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'E8EBCD08-FF4A-4A60-B3FB-2DE98AF8744F';

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Sales Authority Mix Tiers.__mj_CreatedAt 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'E3CBB803-822C-4DD0-A9F3-542CCE94360C';

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Sales Authority Mix Tiers.__mj_UpdatedAt 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '7E632B65-C80D-47EA-9540-5C2D088F78B4';

/* Set entity icon to fa fa-layer-group */

               UPDATE [${mjSchema}].[Entity]
               SET [Icon] = 'fa fa-layer-group', [__mj_UpdatedAt] = GETUTCDATE()
               WHERE [ID] = 'E49F94DA-17AC-428C-8956-C3A760FC71D7';

/* Insert FieldCategoryInfo setting for entity */
IF NOT EXISTS (
      SELECT 1 FROM [${mjSchema}].[EntitySetting] WHERE [EntityID] = 'E49F94DA-17AC-428C-8956-C3A760FC71D7' AND [Name] = 'FieldCategoryInfo'
   )
   BEGIN
      INSERT INTO [${mjSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('beceff75-c3de-5432-9cc3-d2b07401bd35', 'E49F94DA-17AC-428C-8956-C3A760FC71D7', 'FieldCategoryInfo', '{
  "Mix Tier Configuration": {
    "description": "Configuration settings defining product type spans and concession limits for sales authority mix tiers",
    "icon": "fa fa-sliders-h"
  },
  "System Metadata": {
    "description": "System-managed audit and tracking fields",
    "icon": "fa fa-cog"
  }
}', GETUTCDATE(), GETUTCDATE())
   END;

/* Insert FieldCategoryIcons setting (legacy) */
IF NOT EXISTS (
      SELECT 1 FROM [${mjSchema}].[EntitySetting] WHERE [EntityID] = 'E49F94DA-17AC-428C-8956-C3A760FC71D7' AND [Name] = 'FieldCategoryIcons'
   )
   BEGIN
      INSERT INTO [${mjSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('c5df98e6-c164-53f9-bb0e-b2257de119d0', 'E49F94DA-17AC-428C-8956-C3A760FC71D7', 'FieldCategoryIcons', '{
  "Mix Tier Configuration": "fa fa-sliders-h",
  "System Metadata": "fa fa-cog"
}', GETUTCDATE(), GETUTCDATE())
   END;

/* Set DefaultForNewUser=false for NEW entity (category: supporting, confidence: high) */

         UPDATE [${mjSchema}].[ApplicationEntity]
         SET [DefaultForNewUser] = 0, [__mj_UpdatedAt] = GETUTCDATE()
         WHERE [EntityID] = 'E49F94DA-17AC-428C-8956-C3A760FC71D7';

/* Generated Validation Functions for MJ_BizApps_Orders: Sales Authority Mix Tiers */
-- CHECK constraint for MJ_BizApps_Orders: Sales Authority Mix Tiers: Field: MaxConcessionPctOfContract was newly set or modified since the last generation of the validation function, the code was regenerated and updating the GeneratedCode table with the new generated validation function
IF NOT EXISTS (
      SELECT 1 FROM [${mjSchema}].[GeneratedCode] WHERE [CategoryID] = (SELECT [ID] FROM [${mjSchema}].[vwGeneratedCodeCategories] WHERE [Name]='CodeGen: Validators') AND [LinkedEntityID] = 'DF238F34-2837-EF11-86D4-6045BDEE16E6' AND [LinkedRecordPrimaryKey] = 'E8EBCD08-FF4A-4A60-B3FB-2DE98AF8744F'
   )
   BEGIN
      INSERT INTO [${mjSchema}].[GeneratedCode] ([ID], [CategoryID], [GeneratedByModelID], [GeneratedAt], [Language], [Status], [Source], [Code], [Description], [Name], [LinkedEntityID], [LinkedRecordPrimaryKey])
VALUES ('4f8e3890-9e46-43cf-9d4d-fba8f4bc8d46', (SELECT [ID] FROM [${mjSchema}].[vwGeneratedCodeCategories] WHERE [Name]='CodeGen: Validators'), '4B500A24-0259-4EFF-9E34-24E9F5EC9DAB', GETUTCDATE(), 'TypeScript', 'Approved', '([MaxConcessionPctOfContract]>=(0) AND [MaxConcessionPctOfContract]<=(1))', 'public ValidateMaxConcessionPctOfContractRange(result: ValidationResult) {
	if (this.MaxConcessionPctOfContract != null && (this.MaxConcessionPctOfContract < 0 || this.MaxConcessionPctOfContract > 1)) {
		result.Errors.push(new ValidationErrorInfo(
			"MaxConcessionPctOfContract",
			"Maximum concession percentage of contract must be between 0 and 1.",
			this.MaxConcessionPctOfContract,
			ValidationErrorType.Failure
		));
	}
}', 'Maximum concession percentage of contract must be between 0 and 1 (inclusive), representing a percentage from 0% to 100%.', 'ValidateMaxConcessionPctOfContractRange', 'DF238F34-2837-EF11-86D4-6045BDEE16E6', 'E8EBCD08-FF4A-4A60-B3FB-2DE98AF8744F')
   END;

-- CHECK constraint for MJ_BizApps_Orders: Sales Authority Mix Tiers: Field: MinProductTypes was newly set or modified since the last generation of the validation function, the code was regenerated and updating the GeneratedCode table with the new generated validation function
IF NOT EXISTS (
      SELECT 1 FROM [${mjSchema}].[GeneratedCode] WHERE [CategoryID] = (SELECT [ID] FROM [${mjSchema}].[vwGeneratedCodeCategories] WHERE [Name]='CodeGen: Validators') AND [LinkedEntityID] = 'DF238F34-2837-EF11-86D4-6045BDEE16E6' AND [LinkedRecordPrimaryKey] = '23D7B025-7FA8-4966-8343-CB65F8FA97A3'
   )
   BEGIN
      INSERT INTO [${mjSchema}].[GeneratedCode] ([ID], [CategoryID], [GeneratedByModelID], [GeneratedAt], [Language], [Status], [Source], [Code], [Description], [Name], [LinkedEntityID], [LinkedRecordPrimaryKey])
VALUES ('36c5f30f-8826-403c-92fa-4fe6ceb18bba', (SELECT [ID] FROM [${mjSchema}].[vwGeneratedCodeCategories] WHERE [Name]='CodeGen: Validators'), '4B500A24-0259-4EFF-9E34-24E9F5EC9DAB', GETUTCDATE(), 'TypeScript', 'Approved', '([MinProductTypes]>=(2))', 'public ValidateMinProductTypesMinimum(result: ValidationResult) {
	if (this.MinProductTypes != null && this.MinProductTypes < 2) {
		result.Errors.push(new ValidationErrorInfo(
			"MinProductTypes",
			"Minimum product types must be at least 2.",
			this.MinProductTypes,
			ValidationErrorType.Failure
		));
	}
}', 'Minimum product types must be at least 2.', 'ValidateMinProductTypesMinimum', 'DF238F34-2837-EF11-86D4-6045BDEE16E6', '23D7B025-7FA8-4966-8343-CB65F8FA97A3')
   END;


