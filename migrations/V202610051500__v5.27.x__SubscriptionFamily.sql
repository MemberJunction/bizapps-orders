-- =============================================================================
-- V202610051500 — Subscription families: the bands of one subscription offering
-- (bc-aidp-next-golive#276)
-- =============================================================================
-- Confirm looks for an existing subscription by (ProductID, holder). Two bands
-- of one offering are two Product rows, so a holder with live coverage under one
-- band who ordered another band found nothing, got a second subscription for the
-- same dates, and was billed and recognized twice. The catalog had no way to say
-- that two products are bands of the same offering.
--
-- What this file does:
--   1. SubscriptionFamily: one row per offering, owned by one selling company.
--      Code is unique within that company, so two companies can use the same
--      code without their families meeting.
--   2. Product.SubscriptionFamilyID: nullable. NULL means the product has no
--      other bands, which is how every product behaved before this migration.
--      That a product and its family belong to the same company is checked on
--      save, in the Product entity server.
--   3. OrderLine.AcknowledgesCoverageOverlap: set on a line meant to run
--      alongside coverage the holder already has in the same family.
--
-- A TABLE, NOT A TEXT CODE. A code on Product has no integrity (a typo turns the
-- guard off for that product), cannot be scoped to a company, and has nowhere
-- to hold the family-level settings the plan-change work will need.
-- =============================================================================

CREATE TABLE [${flyway:defaultSchema}].[SubscriptionFamily] (
    [ID] UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    [CompanyID] UNIQUEIDENTIFIER NOT NULL,
    [Code] NVARCHAR(40) NOT NULL,
    [Name] NVARCHAR(200) NOT NULL,
    [Description] NVARCHAR(MAX) NULL,
    [IsActive] BIT NOT NULL DEFAULT 1,
    CONSTRAINT PK_SubscriptionFamily PRIMARY KEY ([ID]),
    CONSTRAINT FK_SubscriptionFamily_Company FOREIGN KEY ([CompanyID]) REFERENCES [${mjSchema}].[Company]([ID]),
    CONSTRAINT UQ_SubscriptionFamily_Company_Code UNIQUE ([CompanyID], [Code]),
    CONSTRAINT CK_SubscriptionFamily_Code_NotBlank CHECK (LEN(LTRIM(RTRIM([Code]))) > 0),
    CONSTRAINT CK_SubscriptionFamily_Name_NotBlank CHECK (LEN(LTRIM(RTRIM([Name]))) > 0)
);
GO

ALTER TABLE [${flyway:defaultSchema}].[Product]
    ADD [SubscriptionFamilyID] UNIQUEIDENTIFIER NULL
            CONSTRAINT FK_Product_SubscriptionFamily
            FOREIGN KEY REFERENCES [${flyway:defaultSchema}].[SubscriptionFamily]([ID]);
GO

ALTER TABLE [${flyway:defaultSchema}].[OrderLine]
    ADD [AcknowledgesCoverageOverlap] BIT NOT NULL
            CONSTRAINT DF_OrderLine_AcknowledgesCoverageOverlap DEFAULT (0);
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The products that are bands of one subscription offering (for example a standard and a premium tier), within one selling company. At confirm, a line for one band is checked against the holder''s subscriptions to the family''s other bands, and overlapping coverage is refused or allowed according to the subscription types'' ConcurrencyMode.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'SubscriptionFamily';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The selling company that owns the family. Only that company''s products can belong to it.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'SubscriptionFamily',
    @level2type = N'COLUMN', @level2name = N'CompanyID';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Short code for the family, unique within its company.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'SubscriptionFamily',
    @level2type = N'COLUMN', @level2name = N'Code';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Display name of the offering the family''s bands belong to.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'SubscriptionFamily',
    @level2type = N'COLUMN', @level2name = N'Name';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Optional notes on the offering and its bands.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'SubscriptionFamily',
    @level2type = N'COLUMN', @level2name = N'Description';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'False retires the family from new product assignments. Products already in it keep it, and the overlap check still applies to them.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'SubscriptionFamily',
    @level2type = N'COLUMN', @level2name = N'IsActive';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The subscription family this product is a band of. At confirm, a line for this product is checked against the holder''s subscriptions to the family''s other products. NULL means the product has no other bands. Must belong to the product''s company.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'Product',
    @level2type = N'COLUMN', @level2name = N'SubscriptionFamilyID';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'True when this line is meant to run alongside coverage the holder already has for another band of the same subscription family. Under ExtendExisting, confirm refuses an overlapping line unless this is set. Ignored under AllowMultiple, which permits the overlap, and under RejectDuplicate, which refuses it regardless.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'OrderLine',
    @level2type = N'COLUMN', @level2name = N'AcknowledgesCoverageOverlap';
GO


















































-- =============================================================================
--
--   CODEGEN OUTPUT — GENERATED CODE BELOW THIS LINE (do not hand-edit)
--
--   Produced by MJ CodeGen 6.1.4 against a database built from migrations alone,
--   with the hand-authored DDL above applied. Contains the new
--   MJ_BizApps_Orders: Subscription Families entity (metadata, fields,
--   relationships, permissions, view, CRUD procs, FK index); the
--   SubscriptionFamilyID and AcknowledgesCoverageOverlap field registrations on
--   Products and Order Lines and their IS-A children Event Products and Event
--   Order Lines; and the rebuilt views, CRUD procs and grants for those four.
--
--   Left out, because this change does not touch them: the run's rebuild of the
--   Order Headers view and procs, value-list rows for External Invoices.Status,
--   External Payments.Disposition and Event Order Lines.AttendanceStatus, and
--   the unchanged Order Lines FK indexes and hierarchy functions. The run log
--   replaces the __mj prefix of the IS-A join alias with the core-schema
--   placeholder; it is __mj_isa_p1 here, as in the per-object output.
--
-- =============================================================================

/* SQL generated to create new entity MJ_BizApps_Orders: Subscription Families */

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
         '577d9989-a672-41f5-abb2-a44b3acac74f',
         'MJ_BizApps_Orders: Subscription Families',
         'Subscription Families',
         'The products that are bands of one subscription offering (for example a standard and a premium tier), within one selling company. At confirm, a line for one band is checked against the holder''s subscriptions to the family''s other bands, and overlapping coverage is refused or allowed according to the subscription types'' ConcurrencyMode.',
         NULL,
         'SubscriptionFamily',
         'vwSubscriptionFamilies',
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

/* SQL generated to add new entity MJ_BizApps_Orders: Subscription Families to application ID: 'FB80FEB4-5505-49D1-93CE-2E7BD030B478' */
INSERT INTO [${mjSchema}].[ApplicationEntity]
                                       ([ApplicationID], [EntityID], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                       ('FB80FEB4-5505-49D1-93CE-2E7BD030B478', '577d9989-a672-41f5-abb2-a44b3acac74f', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [${mjSchema}].[ApplicationEntity] WHERE [ApplicationID] = 'FB80FEB4-5505-49D1-93CE-2E7BD030B478'), GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ_BizApps_Orders: Subscription Families for role UI */
INSERT INTO [${mjSchema}].[EntityPermission]
                ([EntityID], [RoleID], [Type], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt])
              SELECT CAST('577d9989-a672-41f5-abb2-a44b3acac74f' AS uniqueidentifier), CAST('E0AFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier), 'Allow', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE()
              WHERE NOT EXISTS (
                SELECT 1 FROM [${mjSchema}].[EntityPermission]
                WHERE [EntityID] = CAST('577d9989-a672-41f5-abb2-a44b3acac74f' AS uniqueidentifier) AND [RoleID] = CAST('E0AFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier) AND [Type] = 'Allow'
              );

/* SQL generated to add new permission for entity MJ_BizApps_Orders: Subscription Families for role Developer */
INSERT INTO [${mjSchema}].[EntityPermission]
                ([EntityID], [RoleID], [Type], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt])
              SELECT CAST('577d9989-a672-41f5-abb2-a44b3acac74f' AS uniqueidentifier), CAST('DEAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier), 'Allow', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE()
              WHERE NOT EXISTS (
                SELECT 1 FROM [${mjSchema}].[EntityPermission]
                WHERE [EntityID] = CAST('577d9989-a672-41f5-abb2-a44b3acac74f' AS uniqueidentifier) AND [RoleID] = CAST('DEAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier) AND [Type] = 'Allow'
              );

/* SQL generated to add new permission for entity MJ_BizApps_Orders: Subscription Families for role Integration */
INSERT INTO [${mjSchema}].[EntityPermission]
                ([EntityID], [RoleID], [Type], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt])
              SELECT CAST('577d9989-a672-41f5-abb2-a44b3acac74f' AS uniqueidentifier), CAST('DFAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier), 'Allow', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE()
              WHERE NOT EXISTS (
                SELECT 1 FROM [${mjSchema}].[EntityPermission]
                WHERE [EntityID] = CAST('577d9989-a672-41f5-abb2-a44b3acac74f' AS uniqueidentifier) AND [RoleID] = CAST('DFAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier) AND [Type] = 'Allow'
              );

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.SubscriptionFamily */
ALTER TABLE [${flyway:defaultSchema}].[SubscriptionFamily] ADD [__mj_CreatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.SubscriptionFamily */
UPDATE [${flyway:defaultSchema}].[SubscriptionFamily] SET [__mj_CreatedAt] = GETUTCDATE() WHERE [__mj_CreatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.SubscriptionFamily */
ALTER TABLE [${flyway:defaultSchema}].[SubscriptionFamily] ALTER COLUMN [__mj_CreatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.SubscriptionFamily */
ALTER TABLE [${flyway:defaultSchema}].[SubscriptionFamily] ADD CONSTRAINT [DF___mj_BizAppsOrders_SubscriptionFamily___mj_CreatedAt] DEFAULT GETUTCDATE() FOR [__mj_CreatedAt];
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.SubscriptionFamily */
ALTER TABLE [${flyway:defaultSchema}].[SubscriptionFamily] ADD [__mj_UpdatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.SubscriptionFamily */
UPDATE [${flyway:defaultSchema}].[SubscriptionFamily] SET [__mj_UpdatedAt] = GETUTCDATE() WHERE [__mj_UpdatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.SubscriptionFamily */
ALTER TABLE [${flyway:defaultSchema}].[SubscriptionFamily] ALTER COLUMN [__mj_UpdatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.SubscriptionFamily */
ALTER TABLE [${flyway:defaultSchema}].[SubscriptionFamily] ADD CONSTRAINT [DF___mj_BizAppsOrders_SubscriptionFamily___mj_UpdatedAt] DEFAULT GETUTCDATE() FOR [__mj_UpdatedAt];
GO

/* SQL text to insert 10 new entity field(s) */

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = 'ecf65818-a914-4c8e-b3ff-cf42a5e13381' OR (EntityID = 'B35DD5C3-9A6B-42D1-9049-297EE45ED2D5' AND Name = 'SubscriptionFamilyID')) BEGIN
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
            'ecf65818-a914-4c8e-b3ff-cf42a5e13381',
            'B35DD5C3-9A6B-42D1-9049-297EE45ED2D5', -- Entity: MJ_BizApps_Orders: Products
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${mjSchema}].[EntityField] WHERE [EntityID] = 'B35DD5C3-9A6B-42D1-9049-297EE45ED2D5'),
            'SubscriptionFamilyID',
            'Subscription Family ID',
            'The subscription family this product is a band of. At confirm, a line for this product is checked against the holder''s subscriptions to the family''s other products. NULL means the product has no other bands. Must belong to the product''s company.',
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
            '577D9989-A672-41F5-ABB2-A44B3ACAC74F',
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = 'a48da968-82bb-45b8-b97e-64af21bbec7d' OR (EntityID = '66D82C24-9C9F-4CD6-B019-53C20274AB00' AND Name = 'AcknowledgesCoverageOverlap')) BEGIN
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
            'a48da968-82bb-45b8-b97e-64af21bbec7d',
            '66D82C24-9C9F-4CD6-B019-53C20274AB00', -- Entity: MJ_BizApps_Orders: Order Lines
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${mjSchema}].[EntityField] WHERE [EntityID] = '66D82C24-9C9F-4CD6-B019-53C20274AB00'),
            'AcknowledgesCoverageOverlap',
            'Acknowledges Coverage Overlap',
            'True when this line is meant to run alongside coverage the holder already has for another band of the same subscription family. Under ExtendExisting, confirm refuses an overlapping line unless this is set. Ignored under AllowMultiple, which permits the overlap, and under RejectDuplicate, which refuses it regardless.',
            'bit',
            1,
            1,
            0,
            0,
            '(0)',
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '1735e65b-9271-4c38-8db7-2a567f322439' OR (EntityID = '577D9989-A672-41F5-ABB2-A44B3ACAC74F' AND Name = 'ID')) BEGIN
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
            '1735e65b-9271-4c38-8db7-2a567f322439',
            '577D9989-A672-41F5-ABB2-A44B3ACAC74F', -- Entity: MJ_BizApps_Orders: Subscription Families
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${mjSchema}].[EntityField] WHERE [EntityID] = '577D9989-A672-41F5-ABB2-A44B3ACAC74F'),
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = 'f4884983-8bd4-444a-871d-750aa019aaa8' OR (EntityID = '577D9989-A672-41F5-ABB2-A44B3ACAC74F' AND Name = 'CompanyID')) BEGIN
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
            'f4884983-8bd4-444a-871d-750aa019aaa8',
            '577D9989-A672-41F5-ABB2-A44B3ACAC74F', -- Entity: MJ_BizApps_Orders: Subscription Families
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${mjSchema}].[EntityField] WHERE [EntityID] = '577D9989-A672-41F5-ABB2-A44B3ACAC74F'),
            'CompanyID',
            'Company ID',
            'The selling company that owns the family. Only that company''s products can belong to it.',
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
            'D4238F34-2837-EF11-86D4-6045BDEE16E6',
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '502f8c1a-3aad-4b69-815e-fc34a41b899d' OR (EntityID = '577D9989-A672-41F5-ABB2-A44B3ACAC74F' AND Name = 'Code')) BEGIN
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
            '502f8c1a-3aad-4b69-815e-fc34a41b899d',
            '577D9989-A672-41F5-ABB2-A44B3ACAC74F', -- Entity: MJ_BizApps_Orders: Subscription Families
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${mjSchema}].[EntityField] WHERE [EntityID] = '577D9989-A672-41F5-ABB2-A44B3ACAC74F'),
            'Code',
            'Code',
            'Short code for the family, unique within its company.',
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
            1,
            0,
            1,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '774cde66-b6fb-40e0-9bc2-5444c0d63a0c' OR (EntityID = '577D9989-A672-41F5-ABB2-A44B3ACAC74F' AND Name = 'Name')) BEGIN
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
            '774cde66-b6fb-40e0-9bc2-5444c0d63a0c',
            '577D9989-A672-41F5-ABB2-A44B3ACAC74F', -- Entity: MJ_BizApps_Orders: Subscription Families
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${mjSchema}].[EntityField] WHERE [EntityID] = '577D9989-A672-41F5-ABB2-A44B3ACAC74F'),
            'Name',
            'Name',
            'Display name of the offering the family''s bands belong to.',
            'nvarchar',
            400,
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
            1,
            1,
            0,
            1,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = 'd5ba10c9-7c3c-43f2-a2d7-5c4d683c25ca' OR (EntityID = '577D9989-A672-41F5-ABB2-A44B3ACAC74F' AND Name = 'Description')) BEGIN
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
            'd5ba10c9-7c3c-43f2-a2d7-5c4d683c25ca',
            '577D9989-A672-41F5-ABB2-A44B3ACAC74F', -- Entity: MJ_BizApps_Orders: Subscription Families
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${mjSchema}].[EntityField] WHERE [EntityID] = '577D9989-A672-41F5-ABB2-A44B3ACAC74F'),
            'Description',
            'Description',
            'Optional notes on the offering and its bands.',
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
            1,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '8d9444d5-fe4a-4585-9661-06818434d35d' OR (EntityID = '577D9989-A672-41F5-ABB2-A44B3ACAC74F' AND Name = 'IsActive')) BEGIN
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
            '8d9444d5-fe4a-4585-9661-06818434d35d',
            '577D9989-A672-41F5-ABB2-A44B3ACAC74F', -- Entity: MJ_BizApps_Orders: Subscription Families
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${mjSchema}].[EntityField] WHERE [EntityID] = '577D9989-A672-41F5-ABB2-A44B3ACAC74F'),
            'IsActive',
            'Is Active',
            'False retires the family from new product assignments. Products already in it keep it, and the overlap check still applies to them.',
            'bit',
            1,
            1,
            0,
            0,
            '(1)',
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '11121338-1c2c-41c3-9007-94d4bbc51df5' OR (EntityID = '577D9989-A672-41F5-ABB2-A44B3ACAC74F' AND Name = '__mj_CreatedAt')) BEGIN
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
            '11121338-1c2c-41c3-9007-94d4bbc51df5',
            '577D9989-A672-41F5-ABB2-A44B3ACAC74F', -- Entity: MJ_BizApps_Orders: Subscription Families
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${mjSchema}].[EntityField] WHERE [EntityID] = '577D9989-A672-41F5-ABB2-A44B3ACAC74F'),
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '96c35770-94ff-4422-a43e-c49053bff653' OR (EntityID = '577D9989-A672-41F5-ABB2-A44B3ACAC74F' AND Name = '__mj_UpdatedAt')) BEGIN
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
            '96c35770-94ff-4422-a43e-c49053bff653',
            '577D9989-A672-41F5-ABB2-A44B3ACAC74F', -- Entity: MJ_BizApps_Orders: Subscription Families
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${mjSchema}].[EntityField] WHERE [EntityID] = '577D9989-A672-41F5-ABB2-A44B3ACAC74F'),
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

/* Create IS-A parent field AcknowledgesCoverageOverlap on MJ_BizApps_Orders: Event Order Lines */
INSERT INTO [${mjSchema}].[EntityField] (
                  [ID], [EntityID], [Name], [Type], [AllowsNull],
                  [Length], [Precision], [Scale],
                  [Sequence], [IsVirtual], [AllowUpdateAPI],
                  [IsPrimaryKey], [IsUnique],
                  [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES (
                  '934f41f0-835c-4168-b763-88dd987a94c3', '90A1060F-35D6-44A7-9076-A9053BBF60E6', 'AcknowledgesCoverageOverlap',
                  'bit', 0,
                  1, 1, 0,
                  (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${mjSchema}].[EntityField] WHERE [EntityID] = '90A1060F-35D6-44A7-9076-A9053BBF60E6'), 1, 1, 0, 0,
                  GETUTCDATE(), GETUTCDATE());

/* Update entity timestamp for MJ_BizApps_Orders: Event Order Lines after IS-A field sync */
UPDATE [${mjSchema}].[Entity] SET [__mj_UpdatedAt]=GETUTCDATE() WHERE ID='90A1060F-35D6-44A7-9076-A9053BBF60E6';

/* Create IS-A parent field SubscriptionFamilyID on MJ_BizApps_Orders: Event Products */
INSERT INTO [${mjSchema}].[EntityField] (
                  [ID], [EntityID], [Name], [Type], [AllowsNull],
                  [Length], [Precision], [Scale],
                  [Sequence], [IsVirtual], [AllowUpdateAPI],
                  [IsPrimaryKey], [IsUnique],
                  [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES (
                  'e253820b-4d8b-4ff4-9782-2c5cc3972fee', 'B090A662-A97A-4748-B109-2FA716C14651', 'SubscriptionFamilyID',
                  'uniqueidentifier', 1,
                  16, 0, 0,
                  (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${mjSchema}].[EntityField] WHERE [EntityID] = 'B090A662-A97A-4748-B109-2FA716C14651'), 1, 1, 0, 0,
                  GETUTCDATE(), GETUTCDATE());

/* Update entity timestamp for MJ_BizApps_Orders: Event Products after IS-A field sync */
UPDATE [${mjSchema}].[Entity] SET [__mj_UpdatedAt]=GETUTCDATE() WHERE ID='B090A662-A97A-4748-B109-2FA716C14651';

/* SQL text to update display name for field SubscriptionFamilyID */
UPDATE [${mjSchema}].[EntityField] SET [__mj_UpdatedAt]=GETUTCDATE(), DisplayName = 'Subscription Family' WHERE ID = 'E253820B-4D8B-4FF4-9782-2C5CC3972FEE';

/* SQL text to update display name for field AcknowledgesCoverageOverlap */
UPDATE [${mjSchema}].[EntityField] SET [__mj_UpdatedAt]=GETUTCDATE(), DisplayName = 'Acknowledges Coverage Overlap' WHERE ID = '934F41F0-835C-4168-B763-88DD987A94C3';


/* Create Entity Relationship: MJ: Companies -> MJ_BizApps_Orders: Subscription Families (One To Many via CompanyID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${mjSchema}].[EntityRelationship] WHERE [ID] = '2b212f48-00e3-44b0-b303-3ed7d497f74d'
   )
   BEGIN
      INSERT INTO [${mjSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('2b212f48-00e3-44b0-b303-3ed7d497f74d', 'D4238F34-2837-EF11-86D4-6045BDEE16E6', '577D9989-A672-41F5-ABB2-A44B3ACAC74F', 'CompanyID', 'One To Many', 1, 1, 32, GETUTCDATE(), GETUTCDATE())
   END;


/* Create Entity Relationship: MJ_BizApps_Orders: Subscription Families -> MJ_BizApps_Orders: Products (One To Many via SubscriptionFamilyID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${mjSchema}].[EntityRelationship] WHERE [ID] = '4ed63e28-89a9-402c-81ee-0ea794802722'
   )
   BEGIN
      INSERT INTO [${mjSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('4ed63e28-89a9-402c-81ee-0ea794802722', '577D9989-A672-41F5-ABB2-A44B3ACAC74F', 'B35DD5C3-9A6B-42D1-9049-297EE45ED2D5', 'SubscriptionFamilyID', 'One To Many', 1, 1, 1, GETUTCDATE(), GETUTCDATE())
   END;

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
    __mj_isa_p1.[BilledToDate],
    __mj_isa_p1.[RecognizedToDate],
    __mj_isa_p1.[ShipToAddressSnapshot],
    __mj_isa_p1.[SubscriptionAction],
    __mj_isa_p1.[AcknowledgesCoverageOverlap],
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

/* Base View SQL for MJ_BizApps_Orders: Event Products */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Event Products
-- Item: vwEventProducts
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ_BizApps_Orders: Event Products
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  EventProduct
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwEventProducts]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwEventProducts];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwEventProducts]
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
    __mj_isa_p1.[SubscriptionFamilyID],
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
    [e].[VenueAddressID] = mjBizAppsCommonAddress_VenueAddressID.[ID]
GO
REVOKE SELECT ON [${flyway:defaultSchema}].[vwEventProducts] FROM [cdp_Developer]
REVOKE SELECT ON [${flyway:defaultSchema}].[vwEventProducts] FROM [cdp_Integration]
REVOKE SELECT ON [${flyway:defaultSchema}].[vwEventProducts] FROM [cdp_UI]
GRANT SELECT ON [${flyway:defaultSchema}].[vwEventProducts] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for MJ_BizApps_Orders: Event Products */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Event Products
-- Item: Permissions for vwEventProducts
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

REVOKE SELECT ON [${flyway:defaultSchema}].[vwEventProducts] FROM [cdp_Developer]
REVOKE SELECT ON [${flyway:defaultSchema}].[vwEventProducts] FROM [cdp_Integration]
REVOKE SELECT ON [${flyway:defaultSchema}].[vwEventProducts] FROM [cdp_UI]
GRANT SELECT ON [${flyway:defaultSchema}].[vwEventProducts] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for MJ_BizApps_Orders: Event Products */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Event Products
-- Item: spCreateEventProduct
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR EventProduct
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateEventProduct]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateEventProduct];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateEventProduct]
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
    @EventFormat nvarchar(20) = NULL,
    @VirtualMeetingUrl_Clear bit = 0,
    @VirtualMeetingUrl nvarchar(1000) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @ActualID UNIQUEIDENTIFIER = ISNULL(@ID, NEWID())
    INSERT INTO
    [${flyway:defaultSchema}].[EventProduct]
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
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwEventProducts] WHERE [ID] = @ActualID
END
GO
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreateEventProduct] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreateEventProduct] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateEventProduct] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ_BizApps_Orders: Event Products */

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreateEventProduct] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreateEventProduct] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateEventProduct] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for MJ_BizApps_Orders: Event Products */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Event Products
-- Item: spUpdateEventProduct
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR EventProduct
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateEventProduct]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateEventProduct];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateEventProduct]
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
    UPDATE
        [${flyway:defaultSchema}].[EventProduct]
    SET
        [EventStartsAt] = ISNULL(@EventStartsAt, [EventStartsAt]),
        [EventEndsAt] = CASE WHEN @EventEndsAt_Clear = 1 THEN NULL ELSE ISNULL(@EventEndsAt, [EventEndsAt]) END,
        [VenueName] = CASE WHEN @VenueName_Clear = 1 THEN NULL ELSE ISNULL(@VenueName, [VenueName]) END,
        [VenueAddressID] = CASE WHEN @VenueAddressID_Clear = 1 THEN NULL ELSE ISNULL(@VenueAddressID, [VenueAddressID]) END,
        [Capacity] = CASE WHEN @Capacity_Clear = 1 THEN NULL ELSE ISNULL(@Capacity, [Capacity]) END,
        [RequiresAttendeeInfo] = ISNULL(@RequiresAttendeeInfo, [RequiresAttendeeInfo]),
        [EventFormat] = ISNULL(@EventFormat, [EventFormat]),
        [VirtualMeetingUrl] = CASE WHEN @VirtualMeetingUrl_Clear = 1 THEN NULL ELSE ISNULL(@VirtualMeetingUrl, [VirtualMeetingUrl]) END
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwEventProducts] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwEventProducts]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spUpdateEventProduct] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spUpdateEventProduct] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateEventProduct] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the EventProduct table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateEventProduct]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateEventProduct];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateEventProduct
ON [${flyway:defaultSchema}].[EventProduct]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[EventProduct]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[EventProduct] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for MJ_BizApps_Orders: Event Products */

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spUpdateEventProduct] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spUpdateEventProduct] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateEventProduct] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for MJ_BizApps_Orders: Event Products */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Event Products
-- Item: spDeleteEventProduct
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR EventProduct
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteEventProduct]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteEventProduct];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteEventProduct]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[EventProduct]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteEventProduct] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteEventProduct] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteEventProduct] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for MJ_BizApps_Orders: Event Products */

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteEventProduct] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteEventProduct] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteEventProduct] TO [cdp_Developer], [cdp_Integration];

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
    @AcknowledgesCoverageOverlap bit = NULL
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
                [AcknowledgesCoverageOverlap]
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
                ISNULL(@AcknowledgesCoverageOverlap, 0)
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
                [AcknowledgesCoverageOverlap]
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
                ISNULL(@AcknowledgesCoverageOverlap, 0)
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
    @AcknowledgesCoverageOverlap bit = NULL
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
        [AcknowledgesCoverageOverlap] = ISNULL(@AcknowledgesCoverageOverlap, [AcknowledgesCoverageOverlap])
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

/* Index for Foreign Keys for Product */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Products
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key ProductTypeID in table Product
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_Product_ProductTypeID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[Product]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_Product_ProductTypeID ON [${flyway:defaultSchema}].[Product] ([ProductTypeID]);

-- Index for foreign key ProductCategoryID in table Product
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_Product_ProductCategoryID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[Product]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_Product_ProductCategoryID ON [${flyway:defaultSchema}].[Product] ([ProductCategoryID]);

-- Index for foreign key CompanyID in table Product
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_Product_CompanyID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[Product]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_Product_CompanyID ON [${flyway:defaultSchema}].[Product] ([CompanyID]);

-- Index for foreign key SuccessorProductID in table Product
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_Product_SuccessorProductID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[Product]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_Product_SuccessorProductID ON [${flyway:defaultSchema}].[Product] ([SuccessorProductID]);

-- Index for foreign key RevenueRecognitionTypeID in table Product
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_Product_RevenueRecognitionTypeID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[Product]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_Product_RevenueRecognitionTypeID ON [${flyway:defaultSchema}].[Product] ([RevenueRecognitionTypeID]);

-- Index for foreign key SubscriptionTypeID in table Product
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_Product_SubscriptionTypeID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[Product]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_Product_SubscriptionTypeID ON [${flyway:defaultSchema}].[Product] ([SubscriptionTypeID]);

-- Index for foreign key SubscriptionFamilyID in table Product
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_Product_SubscriptionFamilyID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[Product]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_Product_SubscriptionFamilyID ON [${flyway:defaultSchema}].[Product] ([SubscriptionFamilyID]);

/* SQL text to update entity field related entity name field map for entity field ID ECF65818-A914-4C8E-B3FF-CF42A5E13381 */
EXEC [${mjSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='ECF65818-A914-4C8E-B3FF-CF42A5E13381', @RelatedEntityNameFieldMap='SubscriptionFamily';

/* Base View SQL for MJ_BizApps_Orders: Products */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Products
-- Item: vwProducts
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ_BizApps_Orders: Products
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  Product
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwProducts]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwProducts];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwProducts]
AS
SELECT
    p.*,
    mjBizAppsOrdersProductType_ProductTypeID.[Name] AS [ProductType],
    mjBizAppsOrdersProductCategory_ProductCategoryID.[Name] AS [ProductCategory],
    MJCompany_CompanyID.[Name] AS [Company],
    mjBizAppsOrdersProduct_SuccessorProductID.[Name] AS [SuccessorProduct],
    mjBizAppsOrdersRevenueRecognitionType_RevenueRecognitionTypeID.[Name] AS [RevenueRecognitionType],
    mjBizAppsOrdersSubscriptionType_SubscriptionTypeID.[Name] AS [SubscriptionType],
    mjBizAppsOrdersSubscriptionFamily_SubscriptionFamilyID.[Name] AS [SubscriptionFamily]
FROM
    [${flyway:defaultSchema}].[Product] AS p
INNER JOIN
    [${flyway:defaultSchema}].[ProductType] AS mjBizAppsOrdersProductType_ProductTypeID
  ON
    [p].[ProductTypeID] = mjBizAppsOrdersProductType_ProductTypeID.[ID]
INNER JOIN
    [${flyway:defaultSchema}].[ProductCategory] AS mjBizAppsOrdersProductCategory_ProductCategoryID
  ON
    [p].[ProductCategoryID] = mjBizAppsOrdersProductCategory_ProductCategoryID.[ID]
INNER JOIN
    [${mjSchema}].[Company] AS MJCompany_CompanyID
  ON
    [p].[CompanyID] = MJCompany_CompanyID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[Product] AS mjBizAppsOrdersProduct_SuccessorProductID
  ON
    [p].[SuccessorProductID] = mjBizAppsOrdersProduct_SuccessorProductID.[ID]
INNER JOIN
    [${flyway:defaultSchema}].[RevenueRecognitionType] AS mjBizAppsOrdersRevenueRecognitionType_RevenueRecognitionTypeID
  ON
    [p].[RevenueRecognitionTypeID] = mjBizAppsOrdersRevenueRecognitionType_RevenueRecognitionTypeID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[SubscriptionType] AS mjBizAppsOrdersSubscriptionType_SubscriptionTypeID
  ON
    [p].[SubscriptionTypeID] = mjBizAppsOrdersSubscriptionType_SubscriptionTypeID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[SubscriptionFamily] AS mjBizAppsOrdersSubscriptionFamily_SubscriptionFamilyID
  ON
    [p].[SubscriptionFamilyID] = mjBizAppsOrdersSubscriptionFamily_SubscriptionFamilyID.[ID]
GO
REVOKE SELECT ON [${flyway:defaultSchema}].[vwProducts] FROM [cdp_Developer]
REVOKE SELECT ON [${flyway:defaultSchema}].[vwProducts] FROM [cdp_Integration]
REVOKE SELECT ON [${flyway:defaultSchema}].[vwProducts] FROM [cdp_UI]
GRANT SELECT ON [${flyway:defaultSchema}].[vwProducts] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for MJ_BizApps_Orders: Products */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Products
-- Item: Permissions for vwProducts
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

REVOKE SELECT ON [${flyway:defaultSchema}].[vwProducts] FROM [cdp_Developer]
REVOKE SELECT ON [${flyway:defaultSchema}].[vwProducts] FROM [cdp_Integration]
REVOKE SELECT ON [${flyway:defaultSchema}].[vwProducts] FROM [cdp_UI]
GRANT SELECT ON [${flyway:defaultSchema}].[vwProducts] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for MJ_BizApps_Orders: Products */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Products
-- Item: spCreateProduct
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR Product
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateProduct]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateProduct];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateProduct]
    @ID uniqueidentifier = NULL,
    @Name nvarchar(200),
    @SKU_Clear bit = 0,
    @SKU nvarchar(80) = NULL,
    @ProductTypeID uniqueidentifier,
    @ProductCategoryID uniqueidentifier,
    @CompanyID uniqueidentifier,
    @Status nvarchar(20) = NULL,
    @SuccessorProductID_Clear bit = 0,
    @SuccessorProductID uniqueidentifier = NULL,
    @AvailableFrom_Clear bit = 0,
    @AvailableFrom date = NULL,
    @AvailableTo_Clear bit = 0,
    @AvailableTo date = NULL,
    @RevenueRecognitionTypeID uniqueidentifier,
    @StandaloneSellingPrice_Clear bit = 0,
    @StandaloneSellingPrice decimal(19, 4) = NULL,
    @SubscriptionTypeID_Clear bit = 0,
    @SubscriptionTypeID uniqueidentifier = NULL,
    @IsTaxable_Clear bit = 0,
    @IsTaxable bit = NULL,
    @Description_Clear bit = 0,
    @Description nvarchar(MAX) = NULL,
    @TaxCategory_Clear bit = 0,
    @TaxCategory nvarchar(50) = NULL,
    @EntitlementGrantTiming_Clear bit = 0,
    @EntitlementGrantTiming nvarchar(20) = NULL,
    @EntitlementQuantityMode_Clear bit = 0,
    @EntitlementQuantityMode nvarchar(20) = NULL,
    @EntitlementValidityMode_Clear bit = 0,
    @EntitlementValidityMode nvarchar(20) = NULL,
    @PricingDriverClass_Clear bit = 0,
    @PricingDriverClass nvarchar(255) = NULL,
    @MaxQuantityPerLine_Clear bit = 0,
    @MaxQuantityPerLine decimal(18, 4) = NULL,
    @SubscriptionFamilyID_Clear bit = 0,
    @SubscriptionFamilyID uniqueidentifier = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)

    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[Product]
            (
                [ID],
                [Name],
                [SKU],
                [ProductTypeID],
                [ProductCategoryID],
                [CompanyID],
                [Status],
                [SuccessorProductID],
                [AvailableFrom],
                [AvailableTo],
                [RevenueRecognitionTypeID],
                [StandaloneSellingPrice],
                [SubscriptionTypeID],
                [IsTaxable],
                [Description],
                [TaxCategory],
                [EntitlementGrantTiming],
                [EntitlementQuantityMode],
                [EntitlementValidityMode],
                [PricingDriverClass],
                [MaxQuantityPerLine],
                [SubscriptionFamilyID]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @Name,
                CASE WHEN @SKU_Clear = 1 THEN NULL ELSE ISNULL(@SKU, NULL) END,
                @ProductTypeID,
                @ProductCategoryID,
                @CompanyID,
                ISNULL(@Status, 'Draft'),
                CASE WHEN @SuccessorProductID_Clear = 1 THEN NULL ELSE ISNULL(@SuccessorProductID, NULL) END,
                CASE WHEN @AvailableFrom_Clear = 1 THEN NULL ELSE ISNULL(@AvailableFrom, NULL) END,
                CASE WHEN @AvailableTo_Clear = 1 THEN NULL ELSE ISNULL(@AvailableTo, NULL) END,
                @RevenueRecognitionTypeID,
                CASE WHEN @StandaloneSellingPrice_Clear = 1 THEN NULL ELSE ISNULL(@StandaloneSellingPrice, NULL) END,
                CASE WHEN @SubscriptionTypeID_Clear = 1 THEN NULL ELSE ISNULL(@SubscriptionTypeID, NULL) END,
                CASE WHEN @IsTaxable_Clear = 1 THEN NULL ELSE ISNULL(@IsTaxable, NULL) END,
                CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, NULL) END,
                CASE WHEN @TaxCategory_Clear = 1 THEN NULL ELSE ISNULL(@TaxCategory, NULL) END,
                CASE WHEN @EntitlementGrantTiming_Clear = 1 THEN NULL ELSE ISNULL(@EntitlementGrantTiming, NULL) END,
                CASE WHEN @EntitlementQuantityMode_Clear = 1 THEN NULL ELSE ISNULL(@EntitlementQuantityMode, NULL) END,
                CASE WHEN @EntitlementValidityMode_Clear = 1 THEN NULL ELSE ISNULL(@EntitlementValidityMode, NULL) END,
                CASE WHEN @PricingDriverClass_Clear = 1 THEN NULL ELSE ISNULL(@PricingDriverClass, NULL) END,
                CASE WHEN @MaxQuantityPerLine_Clear = 1 THEN NULL ELSE ISNULL(@MaxQuantityPerLine, NULL) END,
                CASE WHEN @SubscriptionFamilyID_Clear = 1 THEN NULL ELSE ISNULL(@SubscriptionFamilyID, NULL) END
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[Product]
            (
                [Name],
                [SKU],
                [ProductTypeID],
                [ProductCategoryID],
                [CompanyID],
                [Status],
                [SuccessorProductID],
                [AvailableFrom],
                [AvailableTo],
                [RevenueRecognitionTypeID],
                [StandaloneSellingPrice],
                [SubscriptionTypeID],
                [IsTaxable],
                [Description],
                [TaxCategory],
                [EntitlementGrantTiming],
                [EntitlementQuantityMode],
                [EntitlementValidityMode],
                [PricingDriverClass],
                [MaxQuantityPerLine],
                [SubscriptionFamilyID]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @Name,
                CASE WHEN @SKU_Clear = 1 THEN NULL ELSE ISNULL(@SKU, NULL) END,
                @ProductTypeID,
                @ProductCategoryID,
                @CompanyID,
                ISNULL(@Status, 'Draft'),
                CASE WHEN @SuccessorProductID_Clear = 1 THEN NULL ELSE ISNULL(@SuccessorProductID, NULL) END,
                CASE WHEN @AvailableFrom_Clear = 1 THEN NULL ELSE ISNULL(@AvailableFrom, NULL) END,
                CASE WHEN @AvailableTo_Clear = 1 THEN NULL ELSE ISNULL(@AvailableTo, NULL) END,
                @RevenueRecognitionTypeID,
                CASE WHEN @StandaloneSellingPrice_Clear = 1 THEN NULL ELSE ISNULL(@StandaloneSellingPrice, NULL) END,
                CASE WHEN @SubscriptionTypeID_Clear = 1 THEN NULL ELSE ISNULL(@SubscriptionTypeID, NULL) END,
                CASE WHEN @IsTaxable_Clear = 1 THEN NULL ELSE ISNULL(@IsTaxable, NULL) END,
                CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, NULL) END,
                CASE WHEN @TaxCategory_Clear = 1 THEN NULL ELSE ISNULL(@TaxCategory, NULL) END,
                CASE WHEN @EntitlementGrantTiming_Clear = 1 THEN NULL ELSE ISNULL(@EntitlementGrantTiming, NULL) END,
                CASE WHEN @EntitlementQuantityMode_Clear = 1 THEN NULL ELSE ISNULL(@EntitlementQuantityMode, NULL) END,
                CASE WHEN @EntitlementValidityMode_Clear = 1 THEN NULL ELSE ISNULL(@EntitlementValidityMode, NULL) END,
                CASE WHEN @PricingDriverClass_Clear = 1 THEN NULL ELSE ISNULL(@PricingDriverClass, NULL) END,
                CASE WHEN @MaxQuantityPerLine_Clear = 1 THEN NULL ELSE ISNULL(@MaxQuantityPerLine, NULL) END,
                CASE WHEN @SubscriptionFamilyID_Clear = 1 THEN NULL ELSE ISNULL(@SubscriptionFamilyID, NULL) END
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwProducts] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreateProduct] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreateProduct] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateProduct] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ_BizApps_Orders: Products */

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreateProduct] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreateProduct] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateProduct] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for MJ_BizApps_Orders: Products */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Products
-- Item: spUpdateProduct
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR Product
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateProduct]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateProduct];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateProduct]
    @ID uniqueidentifier,
    @Name nvarchar(200) = NULL,
    @SKU_Clear bit = 0,
    @SKU nvarchar(80) = NULL,
    @ProductTypeID uniqueidentifier = NULL,
    @ProductCategoryID uniqueidentifier = NULL,
    @CompanyID uniqueidentifier = NULL,
    @Status nvarchar(20) = NULL,
    @SuccessorProductID_Clear bit = 0,
    @SuccessorProductID uniqueidentifier = NULL,
    @AvailableFrom_Clear bit = 0,
    @AvailableFrom date = NULL,
    @AvailableTo_Clear bit = 0,
    @AvailableTo date = NULL,
    @RevenueRecognitionTypeID uniqueidentifier = NULL,
    @StandaloneSellingPrice_Clear bit = 0,
    @StandaloneSellingPrice decimal(19, 4) = NULL,
    @SubscriptionTypeID_Clear bit = 0,
    @SubscriptionTypeID uniqueidentifier = NULL,
    @IsTaxable_Clear bit = 0,
    @IsTaxable bit = NULL,
    @Description_Clear bit = 0,
    @Description nvarchar(MAX) = NULL,
    @TaxCategory_Clear bit = 0,
    @TaxCategory nvarchar(50) = NULL,
    @EntitlementGrantTiming_Clear bit = 0,
    @EntitlementGrantTiming nvarchar(20) = NULL,
    @EntitlementQuantityMode_Clear bit = 0,
    @EntitlementQuantityMode nvarchar(20) = NULL,
    @EntitlementValidityMode_Clear bit = 0,
    @EntitlementValidityMode nvarchar(20) = NULL,
    @PricingDriverClass_Clear bit = 0,
    @PricingDriverClass nvarchar(255) = NULL,
    @MaxQuantityPerLine_Clear bit = 0,
    @MaxQuantityPerLine decimal(18, 4) = NULL,
    @SubscriptionFamilyID_Clear bit = 0,
    @SubscriptionFamilyID uniqueidentifier = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[Product]
    SET
        [Name] = ISNULL(@Name, [Name]),
        [SKU] = CASE WHEN @SKU_Clear = 1 THEN NULL ELSE ISNULL(@SKU, [SKU]) END,
        [ProductTypeID] = ISNULL(@ProductTypeID, [ProductTypeID]),
        [ProductCategoryID] = ISNULL(@ProductCategoryID, [ProductCategoryID]),
        [CompanyID] = ISNULL(@CompanyID, [CompanyID]),
        [Status] = ISNULL(@Status, [Status]),
        [SuccessorProductID] = CASE WHEN @SuccessorProductID_Clear = 1 THEN NULL ELSE ISNULL(@SuccessorProductID, [SuccessorProductID]) END,
        [AvailableFrom] = CASE WHEN @AvailableFrom_Clear = 1 THEN NULL ELSE ISNULL(@AvailableFrom, [AvailableFrom]) END,
        [AvailableTo] = CASE WHEN @AvailableTo_Clear = 1 THEN NULL ELSE ISNULL(@AvailableTo, [AvailableTo]) END,
        [RevenueRecognitionTypeID] = ISNULL(@RevenueRecognitionTypeID, [RevenueRecognitionTypeID]),
        [StandaloneSellingPrice] = CASE WHEN @StandaloneSellingPrice_Clear = 1 THEN NULL ELSE ISNULL(@StandaloneSellingPrice, [StandaloneSellingPrice]) END,
        [SubscriptionTypeID] = CASE WHEN @SubscriptionTypeID_Clear = 1 THEN NULL ELSE ISNULL(@SubscriptionTypeID, [SubscriptionTypeID]) END,
        [IsTaxable] = CASE WHEN @IsTaxable_Clear = 1 THEN NULL ELSE ISNULL(@IsTaxable, [IsTaxable]) END,
        [Description] = CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, [Description]) END,
        [TaxCategory] = CASE WHEN @TaxCategory_Clear = 1 THEN NULL ELSE ISNULL(@TaxCategory, [TaxCategory]) END,
        [EntitlementGrantTiming] = CASE WHEN @EntitlementGrantTiming_Clear = 1 THEN NULL ELSE ISNULL(@EntitlementGrantTiming, [EntitlementGrantTiming]) END,
        [EntitlementQuantityMode] = CASE WHEN @EntitlementQuantityMode_Clear = 1 THEN NULL ELSE ISNULL(@EntitlementQuantityMode, [EntitlementQuantityMode]) END,
        [EntitlementValidityMode] = CASE WHEN @EntitlementValidityMode_Clear = 1 THEN NULL ELSE ISNULL(@EntitlementValidityMode, [EntitlementValidityMode]) END,
        [PricingDriverClass] = CASE WHEN @PricingDriverClass_Clear = 1 THEN NULL ELSE ISNULL(@PricingDriverClass, [PricingDriverClass]) END,
        [MaxQuantityPerLine] = CASE WHEN @MaxQuantityPerLine_Clear = 1 THEN NULL ELSE ISNULL(@MaxQuantityPerLine, [MaxQuantityPerLine]) END,
        [SubscriptionFamilyID] = CASE WHEN @SubscriptionFamilyID_Clear = 1 THEN NULL ELSE ISNULL(@SubscriptionFamilyID, [SubscriptionFamilyID]) END
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwProducts] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwProducts]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spUpdateProduct] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spUpdateProduct] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateProduct] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the Product table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateProduct]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateProduct];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateProduct
ON [${flyway:defaultSchema}].[Product]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[Product]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[Product] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for MJ_BizApps_Orders: Products */

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spUpdateProduct] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spUpdateProduct] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateProduct] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for MJ_BizApps_Orders: Products */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Products
-- Item: spDeleteProduct
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR Product
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteProduct]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteProduct];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteProduct]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[Product]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteProduct] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteProduct] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteProduct] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for MJ_BizApps_Orders: Products */

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteProduct] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteProduct] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteProduct] TO [cdp_Developer], [cdp_Integration];

/* Index for Foreign Keys for SubscriptionFamily */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Subscription Families
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key CompanyID in table SubscriptionFamily
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_SubscriptionFamily_CompanyID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[SubscriptionFamily]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_SubscriptionFamily_CompanyID ON [${flyway:defaultSchema}].[SubscriptionFamily] ([CompanyID]);

/* SQL text to update entity field related entity name field map for entity field ID F4884983-8BD4-444A-871D-750AA019AAA8 */
EXEC [${mjSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='F4884983-8BD4-444A-871D-750AA019AAA8', @RelatedEntityNameFieldMap='Company';

/* Base View SQL for MJ_BizApps_Orders: Subscription Families */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Subscription Families
-- Item: vwSubscriptionFamilies
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ_BizApps_Orders: Subscription Families
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  SubscriptionFamily
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwSubscriptionFamilies]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwSubscriptionFamilies];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwSubscriptionFamilies]
AS
SELECT
    s.*,
    MJCompany_CompanyID.[Name] AS [Company]
FROM
    [${flyway:defaultSchema}].[SubscriptionFamily] AS s
INNER JOIN
    [${mjSchema}].[Company] AS MJCompany_CompanyID
  ON
    [s].[CompanyID] = MJCompany_CompanyID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwSubscriptionFamilies] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for MJ_BizApps_Orders: Subscription Families */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Subscription Families
-- Item: Permissions for vwSubscriptionFamilies
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwSubscriptionFamilies] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for MJ_BizApps_Orders: Subscription Families */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Subscription Families
-- Item: spCreateSubscriptionFamily
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR SubscriptionFamily
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateSubscriptionFamily]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateSubscriptionFamily];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateSubscriptionFamily]
    @ID uniqueidentifier = NULL,
    @CompanyID uniqueidentifier,
    @Code nvarchar(40),
    @Name nvarchar(200),
    @Description_Clear bit = 0,
    @Description nvarchar(MAX) = NULL,
    @IsActive bit = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)

    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[SubscriptionFamily]
            (
                [ID],
                [CompanyID],
                [Code],
                [Name],
                [Description],
                [IsActive]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @CompanyID,
                @Code,
                @Name,
                CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, NULL) END,
                ISNULL(@IsActive, 1)
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[SubscriptionFamily]
            (
                [CompanyID],
                [Code],
                [Name],
                [Description],
                [IsActive]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @CompanyID,
                @Code,
                @Name,
                CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, NULL) END,
                ISNULL(@IsActive, 1)
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwSubscriptionFamilies] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateSubscriptionFamily] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ_BizApps_Orders: Subscription Families */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateSubscriptionFamily] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for MJ_BizApps_Orders: Subscription Families */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Subscription Families
-- Item: spUpdateSubscriptionFamily
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR SubscriptionFamily
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateSubscriptionFamily]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateSubscriptionFamily];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateSubscriptionFamily]
    @ID uniqueidentifier,
    @CompanyID uniqueidentifier = NULL,
    @Code nvarchar(40) = NULL,
    @Name nvarchar(200) = NULL,
    @Description_Clear bit = 0,
    @Description nvarchar(MAX) = NULL,
    @IsActive bit = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[SubscriptionFamily]
    SET
        [CompanyID] = ISNULL(@CompanyID, [CompanyID]),
        [Code] = ISNULL(@Code, [Code]),
        [Name] = ISNULL(@Name, [Name]),
        [Description] = CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, [Description]) END,
        [IsActive] = ISNULL(@IsActive, [IsActive])
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwSubscriptionFamilies] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwSubscriptionFamilies]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateSubscriptionFamily] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the SubscriptionFamily table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateSubscriptionFamily]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateSubscriptionFamily];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateSubscriptionFamily
ON [${flyway:defaultSchema}].[SubscriptionFamily]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[SubscriptionFamily]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[SubscriptionFamily] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for MJ_BizApps_Orders: Subscription Families */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateSubscriptionFamily] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for MJ_BizApps_Orders: Subscription Families */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Subscription Families
-- Item: spDeleteSubscriptionFamily
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR SubscriptionFamily
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteSubscriptionFamily]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteSubscriptionFamily];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteSubscriptionFamily]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[SubscriptionFamily]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteSubscriptionFamily] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for MJ_BizApps_Orders: Subscription Families */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteSubscriptionFamily] TO [cdp_Developer], [cdp_Integration];

/* SQL text to insert 2 new entity field(s) */

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '19744ba4-2e43-4da1-b2cb-5c40dd122969' OR (EntityID = 'B35DD5C3-9A6B-42D1-9049-297EE45ED2D5' AND Name = 'SubscriptionFamily')) BEGIN
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
            '19744ba4-2e43-4da1-b2cb-5c40dd122969',
            'B35DD5C3-9A6B-42D1-9049-297EE45ED2D5', -- Entity: MJ_BizApps_Orders: Products
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${mjSchema}].[EntityField] WHERE [EntityID] = 'B35DD5C3-9A6B-42D1-9049-297EE45ED2D5'),
            'SubscriptionFamily',
            'Subscription Family',
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '7ca95512-7a87-452a-adb2-2e72d9c3bda2' OR (EntityID = '577D9989-A672-41F5-ABB2-A44B3ACAC74F' AND Name = 'Company')) BEGIN
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
            '7ca95512-7a87-452a-adb2-2e72d9c3bda2',
            '577D9989-A672-41F5-ABB2-A44B3ACAC74F', -- Entity: MJ_BizApps_Orders: Subscription Families
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${mjSchema}].[EntityField] WHERE [EntityID] = '577D9989-A672-41F5-ABB2-A44B3ACAC74F'),
            'Company',
            'Company',
            NULL,
            'nvarchar',
            100,
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
