-- =============================================================================
-- V202610131516 — What each instalment invoice billed each line (#681)
-- =============================================================================
-- An instalment invoice slices its amount across the order's lines: each line's
-- net, whatever of its tax and charges no charge allocation covers, and each
-- charge type allocated to it. Only the net reached the database, as the line's
-- running BilledToDate, so the next invoice worked out what earlier invoices had
-- billed by slicing them again against the lines as they stand now. Once an
-- amount change or a return lowers a line, that re-slicing differs from what was
-- actually billed, and the remaining instalments bill each line the wrong share.
--
-- What this file does:
--   1. InstalmentLineBilling: one row per invoiced instalment, line and part,
--      holding the amount that invoice billed for it. Written in the same
--      transaction as the invoice's journal entry and BilledToDate.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. InstalmentLineBilling
-- -----------------------------------------------------------------------------
CREATE TABLE [${flyway:defaultSchema}].[InstalmentLineBilling] (
    [ID] UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    [OrderHeaderPaymentScheduleID] UNIQUEIDENTIFIER NOT NULL,
    [OrderLineID] UNIQUEIDENTIFIER NOT NULL,
    [Part] NVARCHAR(20) NOT NULL,
    [ChargeTypeID] UNIQUEIDENTIFIER NULL,
    [Amount] DECIMAL(18,2) NOT NULL,
    CONSTRAINT [PK_InstalmentLineBilling] PRIMARY KEY ([ID]),
    CONSTRAINT [FK_InstalmentLineBilling_OrderHeaderPaymentSchedule] FOREIGN KEY ([OrderHeaderPaymentScheduleID])
        REFERENCES [${flyway:defaultSchema}].[OrderHeaderPaymentSchedule]([ID]),
    CONSTRAINT [FK_InstalmentLineBilling_OrderLine] FOREIGN KEY ([OrderLineID])
        REFERENCES [${flyway:defaultSchema}].[OrderLine]([ID]),
    CONSTRAINT [FK_InstalmentLineBilling_ChargeType] FOREIGN KEY ([ChargeTypeID])
        REFERENCES [${flyway:defaultSchema}].[ChargeType]([ID]),
    CONSTRAINT [UQ_InstalmentLineBilling_Schedule_Line_Part_ChargeType]
        UNIQUE ([OrderHeaderPaymentScheduleID], [OrderLineID], [Part], [ChargeTypeID]),
    CONSTRAINT [CK_InstalmentLineBilling_Part] CHECK ([Part] IN (N'Net', N'Unallocated', N'Charge')),
    CONSTRAINT [CK_InstalmentLineBilling_ChargeType] CHECK (
        ([Part] = N'Charge' AND [ChargeTypeID] IS NOT NULL) OR ([Part] <> N'Charge' AND [ChargeTypeID] IS NULL)
    )
);
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'What one instalment invoice billed one order line, part by part: the line''s net, the tax and charges no charge allocation covers, and each allocated charge type. Written by the server when the instalment is invoiced, in the same transaction as its journal entry and the line''s BilledToDate, and never changed afterwards. Later invoices on the order read these rows as billed instead of slicing earlier instalments again.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'InstalmentLineBilling';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The invoiced instalment.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'InstalmentLineBilling',
    @level2type = N'COLUMN', @level2name = N'OrderHeaderPaymentScheduleID';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The line the instalment billed.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'InstalmentLineBilling',
    @level2type = N'COLUMN', @level2name = N'OrderLineID';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Which amount of the line: Net (before tax and charges), Unallocated (tax and charges no charge allocation covers) or Charge (one allocated charge type, named by ChargeTypeID). An instalment has at most one row per line and part.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'InstalmentLineBilling',
    @level2type = N'COLUMN', @level2name = N'Part';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'For a Charge part, the charge type billed. NULL for Net and Unallocated.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'InstalmentLineBilling',
    @level2type = N'COLUMN', @level2name = N'ChargeTypeID';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'What the instalment billed for this part, signed as the line is: negative on a line that reverses another.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'InstalmentLineBilling',
    @level2type = N'COLUMN', @level2name = N'Amount';
GO



















































-- =============================================================================
-- CODEGEN OUTPUT — GENERATED CODE BELOW THIS LINE. DO NOT EDIT BY HAND.
-- This app's own CodeGen SQL for the change above: the Instalment Line Billings
-- entity, its fields and relationships, FK indexes, its view, CRUD procs and
-- permissions.
-- =============================================================================


/* SQL generated to create new entity MJ_BizApps_Orders: Instalment Line Billings */

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
         '3ce400ff-48be-43cd-87cb-610e180e24e3',
         'MJ_BizApps_Orders: Instalment Line Billings',
         'Instalment Line Billings',
         'What one instalment invoice billed one order line, part by part: the line''s net, the tax and charges no charge allocation covers, and each allocated charge type. Written by the server when the instalment is invoiced, in the same transaction as its journal entry and the line''s BilledToDate, and never changed afterwards. Later invoices on the order read these rows as billed instead of slicing earlier instalments again.',
         NULL,
         'InstalmentLineBilling',
         'vwInstalmentLineBillings',
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

/* SQL generated to add new entity MJ_BizApps_Orders: Instalment Line Billings to application ID: 'FB80FEB4-5505-49D1-93CE-2E7BD030B478' */
INSERT INTO [${mjSchema}].[ApplicationEntity]
                                       ([ApplicationID], [EntityID], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                       ('FB80FEB4-5505-49D1-93CE-2E7BD030B478', '3ce400ff-48be-43cd-87cb-610e180e24e3', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [${mjSchema}].[ApplicationEntity] WHERE [ApplicationID] = 'FB80FEB4-5505-49D1-93CE-2E7BD030B478'), GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ_BizApps_Orders: Instalment Line Billings for role UI */
INSERT INTO [${mjSchema}].[EntityPermission]
                ([EntityID], [RoleID], [Type], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt])
              SELECT CAST('3ce400ff-48be-43cd-87cb-610e180e24e3' AS uniqueidentifier), CAST('E0AFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier), 'Allow', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE()
              WHERE NOT EXISTS (
                SELECT 1 FROM [${mjSchema}].[EntityPermission]
                WHERE [EntityID] = CAST('3ce400ff-48be-43cd-87cb-610e180e24e3' AS uniqueidentifier) AND [RoleID] = CAST('E0AFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier) AND [Type] = 'Allow'
              );

/* SQL generated to add new permission for entity MJ_BizApps_Orders: Instalment Line Billings for role Developer */
INSERT INTO [${mjSchema}].[EntityPermission]
                ([EntityID], [RoleID], [Type], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt])
              SELECT CAST('3ce400ff-48be-43cd-87cb-610e180e24e3' AS uniqueidentifier), CAST('DEAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier), 'Allow', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE()
              WHERE NOT EXISTS (
                SELECT 1 FROM [${mjSchema}].[EntityPermission]
                WHERE [EntityID] = CAST('3ce400ff-48be-43cd-87cb-610e180e24e3' AS uniqueidentifier) AND [RoleID] = CAST('DEAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier) AND [Type] = 'Allow'
              );

/* SQL generated to add new permission for entity MJ_BizApps_Orders: Instalment Line Billings for role Integration */
INSERT INTO [${mjSchema}].[EntityPermission]
                ([EntityID], [RoleID], [Type], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt])
              SELECT CAST('3ce400ff-48be-43cd-87cb-610e180e24e3' AS uniqueidentifier), CAST('DFAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier), 'Allow', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE()
              WHERE NOT EXISTS (
                SELECT 1 FROM [${mjSchema}].[EntityPermission]
                WHERE [EntityID] = CAST('3ce400ff-48be-43cd-87cb-610e180e24e3' AS uniqueidentifier) AND [RoleID] = CAST('DFAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier) AND [Type] = 'Allow'
              );

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.InstalmentLineBilling */
ALTER TABLE [${flyway:defaultSchema}].[InstalmentLineBilling] ADD [__mj_CreatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.InstalmentLineBilling */
UPDATE [${flyway:defaultSchema}].[InstalmentLineBilling] SET [__mj_CreatedAt] = GETUTCDATE() WHERE [__mj_CreatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.InstalmentLineBilling */
ALTER TABLE [${flyway:defaultSchema}].[InstalmentLineBilling] ALTER COLUMN [__mj_CreatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.InstalmentLineBilling */
ALTER TABLE [${flyway:defaultSchema}].[InstalmentLineBilling] ADD CONSTRAINT [DF___mj_BizAppsOrders_InstalmentLineBilling___mj_CreatedAt] DEFAULT GETUTCDATE() FOR [__mj_CreatedAt];
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.InstalmentLineBilling */
ALTER TABLE [${flyway:defaultSchema}].[InstalmentLineBilling] ADD [__mj_UpdatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.InstalmentLineBilling */
UPDATE [${flyway:defaultSchema}].[InstalmentLineBilling] SET [__mj_UpdatedAt] = GETUTCDATE() WHERE [__mj_UpdatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.InstalmentLineBilling */
ALTER TABLE [${flyway:defaultSchema}].[InstalmentLineBilling] ALTER COLUMN [__mj_UpdatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.InstalmentLineBilling */
ALTER TABLE [${flyway:defaultSchema}].[InstalmentLineBilling] ADD CONSTRAINT [DF___mj_BizAppsOrders_InstalmentLineBilling___mj_UpdatedAt] DEFAULT GETUTCDATE() FOR [__mj_UpdatedAt];
GO

/* SQL text to insert 8 new entity field(s) */

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = 'c6cbe13f-8990-4dde-8d96-6b5ef0ce4958' OR (EntityID = '3CE400FF-48BE-43CD-87CB-610E180E24E3' AND Name = 'ID')) BEGIN
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
            'c6cbe13f-8990-4dde-8d96-6b5ef0ce4958',
            '3CE400FF-48BE-43CD-87CB-610E180E24E3', -- Entity: MJ_BizApps_Orders: Instalment Line Billings
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${mjSchema}].[EntityField] WHERE [EntityID] = '3CE400FF-48BE-43CD-87CB-610E180E24E3'),
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = 'c214ddc8-090d-4efb-80ef-c34cd2d91f2d' OR (EntityID = '3CE400FF-48BE-43CD-87CB-610E180E24E3' AND Name = 'OrderHeaderPaymentScheduleID')) BEGIN
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
            'c214ddc8-090d-4efb-80ef-c34cd2d91f2d',
            '3CE400FF-48BE-43CD-87CB-610E180E24E3', -- Entity: MJ_BizApps_Orders: Instalment Line Billings
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${mjSchema}].[EntityField] WHERE [EntityID] = '3CE400FF-48BE-43CD-87CB-610E180E24E3'),
            'OrderHeaderPaymentScheduleID',
            'Order Header Payment Schedule ID',
            'The invoiced instalment.',
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
            'EBFF8EAF-1EDE-4988-B32D-92CDE85E5560',
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '6e442307-859a-4f0a-a8b6-23b9c94fa69d' OR (EntityID = '3CE400FF-48BE-43CD-87CB-610E180E24E3' AND Name = 'OrderLineID')) BEGIN
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
            '6e442307-859a-4f0a-a8b6-23b9c94fa69d',
            '3CE400FF-48BE-43CD-87CB-610E180E24E3', -- Entity: MJ_BizApps_Orders: Instalment Line Billings
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${mjSchema}].[EntityField] WHERE [EntityID] = '3CE400FF-48BE-43CD-87CB-610E180E24E3'),
            'OrderLineID',
            'Order Line ID',
            'The line the instalment billed.',
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = 'd3d719ce-8f97-4f8e-802f-1dd83ff868b2' OR (EntityID = '3CE400FF-48BE-43CD-87CB-610E180E24E3' AND Name = 'Part')) BEGIN
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
            'd3d719ce-8f97-4f8e-802f-1dd83ff868b2',
            '3CE400FF-48BE-43CD-87CB-610E180E24E3', -- Entity: MJ_BizApps_Orders: Instalment Line Billings
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${mjSchema}].[EntityField] WHERE [EntityID] = '3CE400FF-48BE-43CD-87CB-610E180E24E3'),
            'Part',
            'Part',
            'Which amount of the line: Net (before tax and charges), Unallocated (tax and charges no charge allocation covers) or Charge (one allocated charge type, named by ChargeTypeID). An instalment has at most one row per line and part.',
            'nvarchar',
            40,
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = 'b1b6feee-16b1-4b9d-a348-6bbef0d2c93c' OR (EntityID = '3CE400FF-48BE-43CD-87CB-610E180E24E3' AND Name = 'ChargeTypeID')) BEGIN
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
            'b1b6feee-16b1-4b9d-a348-6bbef0d2c93c',
            '3CE400FF-48BE-43CD-87CB-610E180E24E3', -- Entity: MJ_BizApps_Orders: Instalment Line Billings
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${mjSchema}].[EntityField] WHERE [EntityID] = '3CE400FF-48BE-43CD-87CB-610E180E24E3'),
            'ChargeTypeID',
            'Charge Type ID',
            'For a Charge part, the charge type billed. NULL for Net and Unallocated.',
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
            '0D654D66-FC8D-4690-BF29-B497EFC6CBEC',
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = 'af8fa0bb-b61b-49af-80c0-554cbb0445a6' OR (EntityID = '3CE400FF-48BE-43CD-87CB-610E180E24E3' AND Name = 'Amount')) BEGIN
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
            'af8fa0bb-b61b-49af-80c0-554cbb0445a6',
            '3CE400FF-48BE-43CD-87CB-610E180E24E3', -- Entity: MJ_BizApps_Orders: Instalment Line Billings
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${mjSchema}].[EntityField] WHERE [EntityID] = '3CE400FF-48BE-43CD-87CB-610E180E24E3'),
            'Amount',
            'Amount',
            'What the instalment billed for this part, signed as the line is: negative on a line that reverses another.',
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '5457e141-49ce-4ee9-9eb0-9976c838ee4b' OR (EntityID = '3CE400FF-48BE-43CD-87CB-610E180E24E3' AND Name = '__mj_CreatedAt')) BEGIN
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
            '5457e141-49ce-4ee9-9eb0-9976c838ee4b',
            '3CE400FF-48BE-43CD-87CB-610E180E24E3', -- Entity: MJ_BizApps_Orders: Instalment Line Billings
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${mjSchema}].[EntityField] WHERE [EntityID] = '3CE400FF-48BE-43CD-87CB-610E180E24E3'),
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '142e2fc3-f343-480e-9773-40d7f2ed6d30' OR (EntityID = '3CE400FF-48BE-43CD-87CB-610E180E24E3' AND Name = '__mj_UpdatedAt')) BEGIN
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
            '142e2fc3-f343-480e-9773-40d7f2ed6d30',
            '3CE400FF-48BE-43CD-87CB-610E180E24E3', -- Entity: MJ_BizApps_Orders: Instalment Line Billings
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${mjSchema}].[EntityField] WHERE [EntityID] = '3CE400FF-48BE-43CD-87CB-610E180E24E3'),
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

/* SQL text to insert entity field value with ID 9afef5df-5461-4693-af16-bab0f83de299 */
INSERT INTO [${mjSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('9afef5df-5461-4693-af16-bab0f83de299', 'D3D719CE-8F97-4F8E-802F-1DD83FF868B2', 1, 'Charge', 'Charge', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 8ade639c-3fc1-4d28-989f-eb281993aec3 */
INSERT INTO [${mjSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('8ade639c-3fc1-4d28-989f-eb281993aec3', 'D3D719CE-8F97-4F8E-802F-1DD83FF868B2', 2, 'Net', 'Net', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID fac8d102-756c-4362-af65-9adfe6e05257 */
INSERT INTO [${mjSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('fac8d102-756c-4362-af65-9adfe6e05257', 'D3D719CE-8F97-4F8E-802F-1DD83FF868B2', 3, 'Unallocated', 'Unallocated', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID D3D719CE-8F97-4F8E-802F-1DD83FF868B2 */
UPDATE [${mjSchema}].[EntityField] SET ValueListType='List' WHERE ID='D3D719CE-8F97-4F8E-802F-1DD83FF868B2';


/* Create Entity Relationship: MJ_BizApps_Orders: Order Lines -> MJ_BizApps_Orders: Instalment Line Billings (One To Many via OrderLineID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${mjSchema}].[EntityRelationship] WHERE [ID] = '3240a6c3-ae2d-4c6e-9243-6b8a4008c763'
   )
   BEGIN
      INSERT INTO [${mjSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('3240a6c3-ae2d-4c6e-9243-6b8a4008c763', '66D82C24-9C9F-4CD6-B019-53C20274AB00', '3CE400FF-48BE-43CD-87CB-610E180E24E3', 'OrderLineID', 'One To Many', 1, 1, 17, GETUTCDATE(), GETUTCDATE())
   END;


/* Create Entity Relationship: MJ_BizApps_Orders: Order Header Payment Schedules -> MJ_BizApps_Orders: Instalment Line Billings (One To Many via OrderHeaderPaymentScheduleID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${mjSchema}].[EntityRelationship] WHERE [ID] = 'dea07446-259c-46c2-a0f8-0ea7198f6565'
   )
   BEGIN
      INSERT INTO [${mjSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('dea07446-259c-46c2-a0f8-0ea7198f6565', 'EBFF8EAF-1EDE-4988-B32D-92CDE85E5560', '3CE400FF-48BE-43CD-87CB-610E180E24E3', 'OrderHeaderPaymentScheduleID', 'One To Many', 1, 1, 4, GETUTCDATE(), GETUTCDATE())
   END;


/* Create Entity Relationship: MJ_BizApps_Orders: Charge Types -> MJ_BizApps_Orders: Instalment Line Billings (One To Many via ChargeTypeID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${mjSchema}].[EntityRelationship] WHERE [ID] = '45b20c6b-895e-495a-a883-a461e3000115'
   )
   BEGIN
      INSERT INTO [${mjSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('45b20c6b-895e-495a-a883-a461e3000115', '0D654D66-FC8D-4690-BF29-B497EFC6CBEC', '3CE400FF-48BE-43CD-87CB-610E180E24E3', 'ChargeTypeID', 'One To Many', 1, 1, 2, GETUTCDATE(), GETUTCDATE())
   END;

/* Index for Foreign Keys for InstalmentLineBilling */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Instalment Line Billings
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key OrderHeaderPaymentScheduleID in table InstalmentLineBilling
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_InstalmentLineBilling_OrderHeaderPaymentScheduleID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[InstalmentLineBilling]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_InstalmentLineBilling_OrderHeaderPaymentScheduleID ON [${flyway:defaultSchema}].[InstalmentLineBilling] ([OrderHeaderPaymentScheduleID]);

-- Index for foreign key OrderLineID in table InstalmentLineBilling
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_InstalmentLineBilling_OrderLineID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[InstalmentLineBilling]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_InstalmentLineBilling_OrderLineID ON [${flyway:defaultSchema}].[InstalmentLineBilling] ([OrderLineID]);

-- Index for foreign key ChargeTypeID in table InstalmentLineBilling
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_InstalmentLineBilling_ChargeTypeID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[InstalmentLineBilling]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_InstalmentLineBilling_ChargeTypeID ON [${flyway:defaultSchema}].[InstalmentLineBilling] ([ChargeTypeID]);

/* SQL text to update entity field related entity name field map for entity field ID B1B6FEEE-16B1-4B9D-A348-6BBEF0D2C93C */
EXEC [${mjSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='B1B6FEEE-16B1-4B9D-A348-6BBEF0D2C93C', @RelatedEntityNameFieldMap='ChargeType';

/* Base View SQL for MJ_BizApps_Orders: Instalment Line Billings */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Instalment Line Billings
-- Item: vwInstalmentLineBillings
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ_BizApps_Orders: Instalment Line Billings
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  InstalmentLineBilling
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwInstalmentLineBillings]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwInstalmentLineBillings];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwInstalmentLineBillings]
AS
SELECT
    i.*,
    mjBizAppsOrdersChargeType_ChargeTypeID.[Name] AS [ChargeType]
FROM
    [${flyway:defaultSchema}].[InstalmentLineBilling] AS i
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[ChargeType] AS mjBizAppsOrdersChargeType_ChargeTypeID
  ON
    [i].[ChargeTypeID] = mjBizAppsOrdersChargeType_ChargeTypeID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwInstalmentLineBillings] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for MJ_BizApps_Orders: Instalment Line Billings */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Instalment Line Billings
-- Item: Permissions for vwInstalmentLineBillings
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwInstalmentLineBillings] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for MJ_BizApps_Orders: Instalment Line Billings */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Instalment Line Billings
-- Item: spCreateInstalmentLineBilling
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR InstalmentLineBilling
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateInstalmentLineBilling]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateInstalmentLineBilling];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateInstalmentLineBilling]
    @ID uniqueidentifier = NULL,
    @OrderHeaderPaymentScheduleID uniqueidentifier,
    @OrderLineID uniqueidentifier,
    @Part nvarchar(20),
    @ChargeTypeID_Clear bit = 0,
    @ChargeTypeID uniqueidentifier = NULL,
    @Amount decimal(18, 2)
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)

    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[InstalmentLineBilling]
            (
                [ID],
                [OrderHeaderPaymentScheduleID],
                [OrderLineID],
                [Part],
                [ChargeTypeID],
                [Amount]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @OrderHeaderPaymentScheduleID,
                @OrderLineID,
                @Part,
                CASE WHEN @ChargeTypeID_Clear = 1 THEN NULL ELSE ISNULL(@ChargeTypeID, NULL) END,
                @Amount
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[InstalmentLineBilling]
            (
                [OrderHeaderPaymentScheduleID],
                [OrderLineID],
                [Part],
                [ChargeTypeID],
                [Amount]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @OrderHeaderPaymentScheduleID,
                @OrderLineID,
                @Part,
                CASE WHEN @ChargeTypeID_Clear = 1 THEN NULL ELSE ISNULL(@ChargeTypeID, NULL) END,
                @Amount
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwInstalmentLineBillings] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateInstalmentLineBilling] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ_BizApps_Orders: Instalment Line Billings */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateInstalmentLineBilling] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for MJ_BizApps_Orders: Instalment Line Billings */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Instalment Line Billings
-- Item: spUpdateInstalmentLineBilling
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR InstalmentLineBilling
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateInstalmentLineBilling]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateInstalmentLineBilling];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateInstalmentLineBilling]
    @ID uniqueidentifier,
    @OrderHeaderPaymentScheduleID uniqueidentifier = NULL,
    @OrderLineID uniqueidentifier = NULL,
    @Part nvarchar(20) = NULL,
    @ChargeTypeID_Clear bit = 0,
    @ChargeTypeID uniqueidentifier = NULL,
    @Amount decimal(18, 2) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[InstalmentLineBilling]
    SET
        [OrderHeaderPaymentScheduleID] = ISNULL(@OrderHeaderPaymentScheduleID, [OrderHeaderPaymentScheduleID]),
        [OrderLineID] = ISNULL(@OrderLineID, [OrderLineID]),
        [Part] = ISNULL(@Part, [Part]),
        [ChargeTypeID] = CASE WHEN @ChargeTypeID_Clear = 1 THEN NULL ELSE ISNULL(@ChargeTypeID, [ChargeTypeID]) END,
        [Amount] = ISNULL(@Amount, [Amount])
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwInstalmentLineBillings] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwInstalmentLineBillings]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateInstalmentLineBilling] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the InstalmentLineBilling table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateInstalmentLineBilling]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateInstalmentLineBilling];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateInstalmentLineBilling
ON [${flyway:defaultSchema}].[InstalmentLineBilling]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[InstalmentLineBilling]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[InstalmentLineBilling] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for MJ_BizApps_Orders: Instalment Line Billings */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateInstalmentLineBilling] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for MJ_BizApps_Orders: Instalment Line Billings */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Instalment Line Billings
-- Item: spDeleteInstalmentLineBilling
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR InstalmentLineBilling
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteInstalmentLineBilling]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteInstalmentLineBilling];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteInstalmentLineBilling]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[InstalmentLineBilling]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteInstalmentLineBilling] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for MJ_BizApps_Orders: Instalment Line Billings */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteInstalmentLineBilling] TO [cdp_Developer], [cdp_Integration];

/* SQL text to insert 1 new entity field(s) */

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = 'da611380-baec-4964-95ea-3c745a708107' OR (EntityID = '3CE400FF-48BE-43CD-87CB-610E180E24E3' AND Name = 'ChargeType')) BEGIN
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
            'da611380-baec-4964-95ea-3c745a708107',
            '3CE400FF-48BE-43CD-87CB-610E180E24E3', -- Entity: MJ_BizApps_Orders: Instalment Line Billings
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${mjSchema}].[EntityField] WHERE [EntityID] = '3CE400FF-48BE-43CD-87CB-610E180E24E3'),
            'ChargeType',
            'Charge Type',
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


