-- =============================================================================
-- V202610131505 — PaymentProviderPrice: which Orders product a gateway price sells
-- (bizapps-orders#481)
-- =============================================================================
-- A card payment can reach the gateway with no order behind it: the buyer paid a
-- payment link or a hosted checkout nobody keyed an order for. Orders creates the
-- order from the payment, and the product it carries is chosen by the gateway
-- price the checkout sold. This table holds that choice, per payment provider.
--
-- A price with no row here is not guessed: the charge stays a finance exception
-- for a person to resolve. An empty table therefore creates no orders, which is
-- how a host turns the automatic path on: by mapping its prices.
--
-- ProviderPriceID is the gateway's own id (for Stripe, price_...). Unique per
-- provider; two providers can be two accounts with their own ids.
-- =============================================================================

CREATE TABLE [${flyway:defaultSchema}].[PaymentProviderPrice] (
    [ID] UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    [PaymentProviderID] UNIQUEIDENTIFIER NOT NULL,
    [ProviderPriceID] NVARCHAR(255) NOT NULL,
    [ProductID] UNIQUEIDENTIFIER NOT NULL,
    [Description] NVARCHAR(255) NULL,
    [IsActive] BIT NOT NULL DEFAULT 1,
    CONSTRAINT PK_PaymentProviderPrice PRIMARY KEY ([ID]),
    CONSTRAINT FK_PaymentProviderPrice_PaymentProvider FOREIGN KEY ([PaymentProviderID])
        REFERENCES [${flyway:defaultSchema}].[PaymentProvider]([ID]),
    CONSTRAINT FK_PaymentProviderPrice_Product FOREIGN KEY ([ProductID])
        REFERENCES [${flyway:defaultSchema}].[Product]([ID]),
    CONSTRAINT UQ_PaymentProviderPrice_Provider_Price UNIQUE ([PaymentProviderID], [ProviderPriceID])
);
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Which Orders product a payment gateway''s price sells, per payment provider. An order created from a charge that matched no order carries the product its checkout''s price maps to here; a price with no active row creates no order and stays a finance exception.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'PaymentProviderPrice';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The payment provider (gateway account) the price belongs to.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'PaymentProviderPrice',
    @level2type = N'COLUMN', @level2name = N'PaymentProviderID';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The gateway''s own price id (for Stripe, price_...). Unique per provider.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'PaymentProviderPrice',
    @level2type = N'COLUMN', @level2name = N'ProviderPriceID';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The Orders product an order created from a charge for this price carries.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'PaymentProviderPrice',
    @level2type = N'COLUMN', @level2name = N'ProductID';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'What the price is, in the gateway''s or finance''s words, for the people maintaining the map. Not read by code.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'PaymentProviderPrice',
    @level2type = N'COLUMN', @level2name = N'Description';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Whether the map is used. An inactive row creates no orders, as if the price were unmapped.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'PaymentProviderPrice',
    @level2type = N'COLUMN', @level2name = N'IsActive';
GO


















































-- =============================================================================
-- CODEGEN OUTPUT — GENERATED CODE BELOW THIS LINE. DO NOT EDIT BY HAND.
-- This app's own CodeGen SQL (the Payment Provider Prices entity, its fields and
-- relationships, the base view and CRUD procs) is folded here by scripts/append-codegen.sh.
-- =============================================================================


/* SQL generated to create new entity MJ_BizApps_Orders: Payment Provider Prices */

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
         'af2eaf51-4097-425f-baae-db3773f5ef03',
         'MJ_BizApps_Orders: Payment Provider Prices',
         'Payment Provider Prices',
         'Which Orders product a payment gateway''s price sells, per payment provider. An order created from a charge that matched no order carries the product its checkout''s price maps to here; a price with no active row creates no order and stays a finance exception.',
         NULL,
         'PaymentProviderPrice',
         'vwPaymentProviderPrices',
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

/* SQL generated to add new entity MJ_BizApps_Orders: Payment Provider Prices to application ID: 'FB80FEB4-5505-49D1-93CE-2E7BD030B478' */
INSERT INTO [${mjSchema}].[ApplicationEntity]
                                       ([ApplicationID], [EntityID], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                       ('FB80FEB4-5505-49D1-93CE-2E7BD030B478', 'af2eaf51-4097-425f-baae-db3773f5ef03', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [${mjSchema}].[ApplicationEntity] WHERE [ApplicationID] = 'FB80FEB4-5505-49D1-93CE-2E7BD030B478'), GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ_BizApps_Orders: Payment Provider Prices for role UI */
INSERT INTO [${mjSchema}].[EntityPermission]
                ([EntityID], [RoleID], [Type], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt])
              SELECT CAST('af2eaf51-4097-425f-baae-db3773f5ef03' AS uniqueidentifier), CAST('E0AFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier), 'Allow', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE()
              WHERE NOT EXISTS (
                SELECT 1 FROM [${mjSchema}].[EntityPermission]
                WHERE [EntityID] = CAST('af2eaf51-4097-425f-baae-db3773f5ef03' AS uniqueidentifier) AND [RoleID] = CAST('E0AFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier) AND [Type] = 'Allow'
              );

/* SQL generated to add new permission for entity MJ_BizApps_Orders: Payment Provider Prices for role Developer */
INSERT INTO [${mjSchema}].[EntityPermission]
                ([EntityID], [RoleID], [Type], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt])
              SELECT CAST('af2eaf51-4097-425f-baae-db3773f5ef03' AS uniqueidentifier), CAST('DEAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier), 'Allow', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE()
              WHERE NOT EXISTS (
                SELECT 1 FROM [${mjSchema}].[EntityPermission]
                WHERE [EntityID] = CAST('af2eaf51-4097-425f-baae-db3773f5ef03' AS uniqueidentifier) AND [RoleID] = CAST('DEAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier) AND [Type] = 'Allow'
              );

/* SQL generated to add new permission for entity MJ_BizApps_Orders: Payment Provider Prices for role Integration */
INSERT INTO [${mjSchema}].[EntityPermission]
                ([EntityID], [RoleID], [Type], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt])
              SELECT CAST('af2eaf51-4097-425f-baae-db3773f5ef03' AS uniqueidentifier), CAST('DFAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier), 'Allow', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE()
              WHERE NOT EXISTS (
                SELECT 1 FROM [${mjSchema}].[EntityPermission]
                WHERE [EntityID] = CAST('af2eaf51-4097-425f-baae-db3773f5ef03' AS uniqueidentifier) AND [RoleID] = CAST('DFAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier) AND [Type] = 'Allow'
              );

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.PaymentProviderPrice */
ALTER TABLE [${flyway:defaultSchema}].[PaymentProviderPrice] ADD [__mj_CreatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.PaymentProviderPrice */
UPDATE [${flyway:defaultSchema}].[PaymentProviderPrice] SET [__mj_CreatedAt] = GETUTCDATE() WHERE [__mj_CreatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.PaymentProviderPrice */
ALTER TABLE [${flyway:defaultSchema}].[PaymentProviderPrice] ALTER COLUMN [__mj_CreatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.PaymentProviderPrice */
ALTER TABLE [${flyway:defaultSchema}].[PaymentProviderPrice] ADD CONSTRAINT [DF___mj_BizAppsOrders_PaymentProviderPrice___mj_CreatedAt] DEFAULT GETUTCDATE() FOR [__mj_CreatedAt];
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.PaymentProviderPrice */
ALTER TABLE [${flyway:defaultSchema}].[PaymentProviderPrice] ADD [__mj_UpdatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.PaymentProviderPrice */
UPDATE [${flyway:defaultSchema}].[PaymentProviderPrice] SET [__mj_UpdatedAt] = GETUTCDATE() WHERE [__mj_UpdatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.PaymentProviderPrice */
ALTER TABLE [${flyway:defaultSchema}].[PaymentProviderPrice] ALTER COLUMN [__mj_UpdatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.PaymentProviderPrice */
ALTER TABLE [${flyway:defaultSchema}].[PaymentProviderPrice] ADD CONSTRAINT [DF___mj_BizAppsOrders_PaymentProviderPrice___mj_UpdatedAt] DEFAULT GETUTCDATE() FOR [__mj_UpdatedAt];
GO

/* SQL text to insert 8 new entity field(s) */

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '836ecb5f-95c1-4260-91e8-46cca6e08c8b' OR (EntityID = 'AF2EAF51-4097-425F-BAAE-DB3773F5EF03' AND Name = 'ID')) BEGIN
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
            '836ecb5f-95c1-4260-91e8-46cca6e08c8b',
            'AF2EAF51-4097-425F-BAAE-DB3773F5EF03', -- Entity: MJ_BizApps_Orders: Payment Provider Prices
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${mjSchema}].[EntityField] WHERE [EntityID] = 'AF2EAF51-4097-425F-BAAE-DB3773F5EF03'),
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = 'f595189a-d5cf-49a2-82c1-4fe3297464f2' OR (EntityID = 'AF2EAF51-4097-425F-BAAE-DB3773F5EF03' AND Name = 'PaymentProviderID')) BEGIN
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
            'f595189a-d5cf-49a2-82c1-4fe3297464f2',
            'AF2EAF51-4097-425F-BAAE-DB3773F5EF03', -- Entity: MJ_BizApps_Orders: Payment Provider Prices
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${mjSchema}].[EntityField] WHERE [EntityID] = 'AF2EAF51-4097-425F-BAAE-DB3773F5EF03'),
            'PaymentProviderID',
            'Payment Provider ID',
            'The payment provider (gateway account) the price belongs to.',
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
            'FDC49E63-B229-40BB-9ABC-F384D7750123',
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = 'aa927408-489b-430a-8ae8-721ba1580480' OR (EntityID = 'AF2EAF51-4097-425F-BAAE-DB3773F5EF03' AND Name = 'ProviderPriceID')) BEGIN
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
            'aa927408-489b-430a-8ae8-721ba1580480',
            'AF2EAF51-4097-425F-BAAE-DB3773F5EF03', -- Entity: MJ_BizApps_Orders: Payment Provider Prices
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${mjSchema}].[EntityField] WHERE [EntityID] = 'AF2EAF51-4097-425F-BAAE-DB3773F5EF03'),
            'ProviderPriceID',
            'Provider Price ID',
            'The gateway''s own price id (for Stripe, price_...). Unique per provider.',
            'nvarchar',
            510,
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = 'daaa6c0d-c1e9-47e8-9ae8-1f6be49ed1f6' OR (EntityID = 'AF2EAF51-4097-425F-BAAE-DB3773F5EF03' AND Name = 'ProductID')) BEGIN
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
            'daaa6c0d-c1e9-47e8-9ae8-1f6be49ed1f6',
            'AF2EAF51-4097-425F-BAAE-DB3773F5EF03', -- Entity: MJ_BizApps_Orders: Payment Provider Prices
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${mjSchema}].[EntityField] WHERE [EntityID] = 'AF2EAF51-4097-425F-BAAE-DB3773F5EF03'),
            'ProductID',
            'Product ID',
            'The Orders product an order created from a charge for this price carries.',
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
            'B35DD5C3-9A6B-42D1-9049-297EE45ED2D5',
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '8296bcb4-de8c-4cda-ae7b-0c0dd665f914' OR (EntityID = 'AF2EAF51-4097-425F-BAAE-DB3773F5EF03' AND Name = 'Description')) BEGIN
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
            '8296bcb4-de8c-4cda-ae7b-0c0dd665f914',
            'AF2EAF51-4097-425F-BAAE-DB3773F5EF03', -- Entity: MJ_BizApps_Orders: Payment Provider Prices
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${mjSchema}].[EntityField] WHERE [EntityID] = 'AF2EAF51-4097-425F-BAAE-DB3773F5EF03'),
            'Description',
            'Description',
            'What the price is, in the gateway''s or finance''s words, for the people maintaining the map. Not read by code.',
            'nvarchar',
            510,
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = 'ffe2e43c-2888-45ad-930f-c6755256cb6c' OR (EntityID = 'AF2EAF51-4097-425F-BAAE-DB3773F5EF03' AND Name = 'IsActive')) BEGIN
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
            'ffe2e43c-2888-45ad-930f-c6755256cb6c',
            'AF2EAF51-4097-425F-BAAE-DB3773F5EF03', -- Entity: MJ_BizApps_Orders: Payment Provider Prices
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${mjSchema}].[EntityField] WHERE [EntityID] = 'AF2EAF51-4097-425F-BAAE-DB3773F5EF03'),
            'IsActive',
            'Is Active',
            'Whether the map is used. An inactive row creates no orders, as if the price were unmapped.',
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '5c45488a-e027-47a7-971a-a6367ebe0229' OR (EntityID = 'AF2EAF51-4097-425F-BAAE-DB3773F5EF03' AND Name = '__mj_CreatedAt')) BEGIN
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
            '5c45488a-e027-47a7-971a-a6367ebe0229',
            'AF2EAF51-4097-425F-BAAE-DB3773F5EF03', -- Entity: MJ_BizApps_Orders: Payment Provider Prices
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${mjSchema}].[EntityField] WHERE [EntityID] = 'AF2EAF51-4097-425F-BAAE-DB3773F5EF03'),
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '6951e480-5ae9-4abc-a934-96d04622dc42' OR (EntityID = 'AF2EAF51-4097-425F-BAAE-DB3773F5EF03' AND Name = '__mj_UpdatedAt')) BEGIN
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
            '6951e480-5ae9-4abc-a934-96d04622dc42',
            'AF2EAF51-4097-425F-BAAE-DB3773F5EF03', -- Entity: MJ_BizApps_Orders: Payment Provider Prices
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${mjSchema}].[EntityField] WHERE [EntityID] = 'AF2EAF51-4097-425F-BAAE-DB3773F5EF03'),
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
/* Create Entity Relationship: MJ_BizApps_Orders: Products -> MJ_BizApps_Orders: Payment Provider Prices (One To Many via ProductID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${mjSchema}].[EntityRelationship] WHERE [ID] = 'de1ec163-4ff5-4582-8716-6e920a7fb704'
   )
   BEGIN
      INSERT INTO [${mjSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('de1ec163-4ff5-4582-8716-6e920a7fb704', 'B35DD5C3-9A6B-42D1-9049-297EE45ED2D5', 'AF2EAF51-4097-425F-BAAE-DB3773F5EF03', 'ProductID', 'One To Many', 1, 1, 11, GETUTCDATE(), GETUTCDATE())
   END;


/* Create Entity Relationship: MJ_BizApps_Orders: Payment Providers -> MJ_BizApps_Orders: Payment Provider Prices (One To Many via PaymentProviderID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${mjSchema}].[EntityRelationship] WHERE [ID] = '67f535c9-b9b4-4104-99d1-deab4c423e03'
   )
   BEGIN
      INSERT INTO [${mjSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('67f535c9-b9b4-4104-99d1-deab4c423e03', 'FDC49E63-B229-40BB-9ABC-F384D7750123', 'AF2EAF51-4097-425F-BAAE-DB3773F5EF03', 'PaymentProviderID', 'One To Many', 1, 1, 10, GETUTCDATE(), GETUTCDATE())
   END;

/* Index for Foreign Keys for PaymentProviderPrice */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Payment Provider Prices
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key PaymentProviderID in table PaymentProviderPrice
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_PaymentProviderPrice_PaymentProviderID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[PaymentProviderPrice]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_PaymentProviderPrice_PaymentProviderID ON [${flyway:defaultSchema}].[PaymentProviderPrice] ([PaymentProviderID]);

-- Index for foreign key ProductID in table PaymentProviderPrice
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_PaymentProviderPrice_ProductID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[PaymentProviderPrice]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_PaymentProviderPrice_ProductID ON [${flyway:defaultSchema}].[PaymentProviderPrice] ([ProductID]);

/* SQL text to update entity field related entity name field map for entity field ID F595189A-D5CF-49A2-82C1-4FE3297464F2 */
EXEC [${mjSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='F595189A-D5CF-49A2-82C1-4FE3297464F2', @RelatedEntityNameFieldMap='PaymentProvider';

/* SQL text to update entity field related entity name field map for entity field ID DAAA6C0D-C1E9-47E8-9AE8-1F6BE49ED1F6 */
EXEC [${mjSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='DAAA6C0D-C1E9-47E8-9AE8-1F6BE49ED1F6', @RelatedEntityNameFieldMap='Product';

/* Base View SQL for MJ_BizApps_Orders: Payment Provider Prices */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Payment Provider Prices
-- Item: vwPaymentProviderPrices
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ_BizApps_Orders: Payment Provider Prices
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  PaymentProviderPrice
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwPaymentProviderPrices]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwPaymentProviderPrices];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwPaymentProviderPrices]
AS
SELECT
    p.*,
    mjBizAppsOrdersPaymentProvider_PaymentProviderID.[Name] AS [PaymentProvider],
    mjBizAppsOrdersProduct_ProductID.[Name] AS [Product]
FROM
    [${flyway:defaultSchema}].[PaymentProviderPrice] AS p
INNER JOIN
    [${flyway:defaultSchema}].[PaymentProvider] AS mjBizAppsOrdersPaymentProvider_PaymentProviderID
  ON
    [p].[PaymentProviderID] = mjBizAppsOrdersPaymentProvider_PaymentProviderID.[ID]
INNER JOIN
    [${flyway:defaultSchema}].[Product] AS mjBizAppsOrdersProduct_ProductID
  ON
    [p].[ProductID] = mjBizAppsOrdersProduct_ProductID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwPaymentProviderPrices] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for MJ_BizApps_Orders: Payment Provider Prices */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Payment Provider Prices
-- Item: Permissions for vwPaymentProviderPrices
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwPaymentProviderPrices] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for MJ_BizApps_Orders: Payment Provider Prices */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Payment Provider Prices
-- Item: spCreatePaymentProviderPrice
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR PaymentProviderPrice
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreatePaymentProviderPrice]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreatePaymentProviderPrice];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreatePaymentProviderPrice]
    @ID uniqueidentifier = NULL,
    @PaymentProviderID uniqueidentifier,
    @ProviderPriceID nvarchar(255),
    @ProductID uniqueidentifier,
    @Description_Clear bit = 0,
    @Description nvarchar(255) = NULL,
    @IsActive bit = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)

    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[PaymentProviderPrice]
            (
                [ID],
                [PaymentProviderID],
                [ProviderPriceID],
                [ProductID],
                [Description],
                [IsActive]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @PaymentProviderID,
                @ProviderPriceID,
                @ProductID,
                CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, NULL) END,
                ISNULL(@IsActive, 1)
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[PaymentProviderPrice]
            (
                [PaymentProviderID],
                [ProviderPriceID],
                [ProductID],
                [Description],
                [IsActive]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @PaymentProviderID,
                @ProviderPriceID,
                @ProductID,
                CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, NULL) END,
                ISNULL(@IsActive, 1)
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwPaymentProviderPrices] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreatePaymentProviderPrice] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ_BizApps_Orders: Payment Provider Prices */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreatePaymentProviderPrice] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for MJ_BizApps_Orders: Payment Provider Prices */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Payment Provider Prices
-- Item: spUpdatePaymentProviderPrice
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR PaymentProviderPrice
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdatePaymentProviderPrice]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdatePaymentProviderPrice];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdatePaymentProviderPrice]
    @ID uniqueidentifier,
    @PaymentProviderID uniqueidentifier = NULL,
    @ProviderPriceID nvarchar(255) = NULL,
    @ProductID uniqueidentifier = NULL,
    @Description_Clear bit = 0,
    @Description nvarchar(255) = NULL,
    @IsActive bit = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[PaymentProviderPrice]
    SET
        [PaymentProviderID] = ISNULL(@PaymentProviderID, [PaymentProviderID]),
        [ProviderPriceID] = ISNULL(@ProviderPriceID, [ProviderPriceID]),
        [ProductID] = ISNULL(@ProductID, [ProductID]),
        [Description] = CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, [Description]) END,
        [IsActive] = ISNULL(@IsActive, [IsActive])
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwPaymentProviderPrices] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwPaymentProviderPrices]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdatePaymentProviderPrice] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the PaymentProviderPrice table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdatePaymentProviderPrice]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdatePaymentProviderPrice];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdatePaymentProviderPrice
ON [${flyway:defaultSchema}].[PaymentProviderPrice]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[PaymentProviderPrice]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[PaymentProviderPrice] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for MJ_BizApps_Orders: Payment Provider Prices */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdatePaymentProviderPrice] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for MJ_BizApps_Orders: Payment Provider Prices */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_Orders: Payment Provider Prices
-- Item: spDeletePaymentProviderPrice
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR PaymentProviderPrice
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeletePaymentProviderPrice]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeletePaymentProviderPrice];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeletePaymentProviderPrice]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[PaymentProviderPrice]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeletePaymentProviderPrice] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for MJ_BizApps_Orders: Payment Provider Prices */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeletePaymentProviderPrice] TO [cdp_Developer], [cdp_Integration];

/* SQL text to insert 2 new entity field(s) */

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '5c0d159d-f563-454b-b9ce-776e16487970' OR (EntityID = 'AF2EAF51-4097-425F-BAAE-DB3773F5EF03' AND Name = 'PaymentProvider')) BEGIN
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
            '5c0d159d-f563-454b-b9ce-776e16487970',
            'AF2EAF51-4097-425F-BAAE-DB3773F5EF03', -- Entity: MJ_BizApps_Orders: Payment Provider Prices
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${mjSchema}].[EntityField] WHERE [EntityID] = 'AF2EAF51-4097-425F-BAAE-DB3773F5EF03'),
            'PaymentProvider',
            'Payment Provider',
            NULL,
            'nvarchar',
            400,
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '4a8e2f8d-c3e6-4ae8-a942-0cc51e042308' OR (EntityID = 'AF2EAF51-4097-425F-BAAE-DB3773F5EF03' AND Name = 'Product')) BEGIN
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
            '4a8e2f8d-c3e6-4ae8-a942-0cc51e042308',
            'AF2EAF51-4097-425F-BAAE-DB3773F5EF03', -- Entity: MJ_BizApps_Orders: Payment Provider Prices
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${mjSchema}].[EntityField] WHERE [EntityID] = 'AF2EAF51-4097-425F-BAAE-DB3773F5EF03'),
            'Product',
            'Product',
            NULL,
            'nvarchar',
            400,
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

/* Set field properties for entity */

               UPDATE [${mjSchema}].[EntityField]
               SET IsNameField = 1
               WHERE ID = 'AA927408-489B-430A-8AE8-721BA1580480'
               AND AutoUpdateIsNameField = 1;

               UPDATE [${mjSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'FFE2E43C-2888-45AD-930F-C6755256CB6C'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${mjSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '5C0D159D-F563-454B-B9CE-776E16487970'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${mjSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '4A8E2F8D-C3E6-4AE8-A942-0CC51E042308'
               AND AutoUpdateDefaultInView = 1;

            UPDATE [${mjSchema}].[Entity]
            SET AllowUserSearchAPI = 0
            WHERE ID = 'AF2EAF51-4097-425F-BAAE-DB3773F5EF03'
            AND AutoUpdateAllowUserSearchAPI = 1;

/* Set categories for 9 fields */

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Payment Provider Prices.PaymentProviderID 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'Gateway Configuration',
   GeneratedFormSection = 'Category',
   DisplayName = 'Payment Provider'
WHERE 
   ID = 'F595189A-D5CF-49A2-82C1-4FE3297464F2';

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Payment Provider Prices.PaymentProvider 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'Gateway Configuration',
   GeneratedFormSection = 'Category',
   DisplayName = 'Payment Provider Name'
WHERE 
   ID = '5C0D159D-F563-454B-B9CE-776E16487970';

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Payment Provider Prices.ProviderPriceID 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'Gateway Configuration',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'AA927408-489B-430A-8AE8-721BA1580480';

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Payment Provider Prices.ProductID 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'Mapping Details',
   GeneratedFormSection = 'Category',
   DisplayName = 'Product'
WHERE 
   ID = 'DAAA6C0D-C1E9-47E8-9AE8-1F6BE49ED1F6';

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Payment Provider Prices.Product 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'Mapping Details',
   GeneratedFormSection = 'Category',
   DisplayName = 'Product Name'
WHERE 
   ID = '4A8E2F8D-C3E6-4AE8-A942-0CC51E042308';

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Payment Provider Prices.Description 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'Mapping Details',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '8296BCB4-DE8C-4CDA-AE7B-0C0DD665F914';

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Payment Provider Prices.IsActive 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'Mapping Details',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'FFE2E43C-2888-45AD-930F-C6755256CB6C';

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Payment Provider Prices.__mj_CreatedAt 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '5C45488A-E027-47A7-971A-A6367EBE0229';

-- UPDATE Entity Field Category Info MJ_BizApps_Orders: Payment Provider Prices.__mj_UpdatedAt 
UPDATE [${mjSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '6951E480-5AE9-4ABC-A934-96D04622DC42';

/* Set entity icon to fa fa-money-bill-wave */

               UPDATE [${mjSchema}].[Entity]
               SET [Icon] = 'fa fa-money-bill-wave', [__mj_UpdatedAt] = GETUTCDATE()
               WHERE [ID] = 'AF2EAF51-4097-425F-BAAE-DB3773F5EF03';

/* Insert FieldCategoryInfo setting for entity */
IF NOT EXISTS (
      SELECT 1 FROM [${mjSchema}].[EntitySetting] WHERE [EntityID] = 'AF2EAF51-4097-425F-BAAE-DB3773F5EF03' AND [Name] = 'FieldCategoryInfo'
   )
   BEGIN
      INSERT INTO [${mjSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('3a954a6e-9041-5def-b5a2-9e3f8f17fb84', 'AF2EAF51-4097-425F-BAAE-DB3773F5EF03', 'FieldCategoryInfo', '{
  "Gateway Configuration": {
    "description": "Settings related to the external payment gateway and price identifiers",
    "icon": "fa fa-credit-card"
  },
  "Mapping Details": {
    "description": "Configuration for mapping external gateway prices to internal products",
    "icon": "fa fa-exchange-alt"
  },
  "System Metadata": {
    "description": "System-managed audit and tracking fields",
    "icon": "fa fa-cog"
  }
}', GETUTCDATE(), GETUTCDATE())
   END;

/* Insert FieldCategoryIcons setting (legacy) */
IF NOT EXISTS (
      SELECT 1 FROM [${mjSchema}].[EntitySetting] WHERE [EntityID] = 'AF2EAF51-4097-425F-BAAE-DB3773F5EF03' AND [Name] = 'FieldCategoryIcons'
   )
   BEGIN
      INSERT INTO [${mjSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('b67c009f-beb8-57a2-92cf-021eaf244e20', 'AF2EAF51-4097-425F-BAAE-DB3773F5EF03', 'FieldCategoryIcons', '{
  "Gateway Configuration": "fa fa-credit-card",
  "Mapping Details": "fa fa-exchange-alt",
  "System Metadata": "fa fa-cog"
}', GETUTCDATE(), GETUTCDATE())
   END;

/* Set DefaultForNewUser=false for NEW entity (category: reference, confidence: high) */

         UPDATE [${mjSchema}].[ApplicationEntity]
         SET [DefaultForNewUser] = 0, [__mj_UpdatedAt] = GETUTCDATE()
         WHERE [EntityID] = 'AF2EAF51-4097-425F-BAAE-DB3773F5EF03';


