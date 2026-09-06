-- =============================================================================
-- ProductPrice.Name / ProductCategoryID / Applicability EntityField rows
-- =============================================================================
-- V202609031400 added the physical columns and regenerated ProductPrice SPs,
-- but the CodeGen tail did not INSERT the EntityField rows (they already
-- existed on the authoring DB). A blank install therefore has the columns and
-- the procs, and no metadata — mj sync push then fails looking up
-- Entity='MJ_BizApps_Orders: Product Prices' AND Name='Name'.
--
-- CAPTURE: mj codegen --skipfiles from bizapps-orders, 2026-09-06,
-- MJ_6_1_edge_5_fwd, includeSchemas=['__mj_BizAppsOrders'], forceRegeneration
-- on MJ_BizApps_Orders: Product Prices, advancedGeneration off.
-- Only the Product Prices EntityField inserts + the Product Categories
-- relationship are kept (the rest of that run's pending-field log is other
-- entities and is omitted).
-- =============================================================================

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '6be0aac7-48e4-4283-bfe6-15a7d77c061a' OR (EntityID = '58018ECE-83EF-4E05-A9D0-2F7E47F9AF25' AND Name = 'Name')) BEGIN
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
            '6be0aac7-48e4-4283-bfe6-15a7d77c061a',
            '58018ECE-83EF-4E05-A9D0-2F7E47F9AF25', -- Entity: MJ_BizApps_Orders: Product Prices
            24,
            'Name',
            'Name',
            'Staff-facing name of this price (Member, Non-member, Early bird). Unique per product or per category.',
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
            1,
            1,
            0,
            1,
            0,
            1,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '0dde4699-9abe-4f5d-8d08-b6e6b467c667' OR (EntityID = '58018ECE-83EF-4E05-A9D0-2F7E47F9AF25' AND Name = 'ProductCategoryID')) BEGIN
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
            '0dde4699-9abe-4f5d-8d08-b6e6b467c667',
            '58018ECE-83EF-4E05-A9D0-2F7E47F9AF25', -- Entity: MJ_BizApps_Orders: Product Prices
            25,
            'ProductCategoryID',
            'Product Category ID',
            'When set, this price hangs on a Product Category and is inherited by products in that tree unless a same-Name row exists on the product. Exactly one of ProductID or ProductCategoryID.',
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
            'B0FA90A6-6975-4C5E-ABC7-3AEA97700CC3',
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = 'ffabace6-7f1a-4162-a487-60e74c2f3394' OR (EntityID = '58018ECE-83EF-4E05-A9D0-2F7E47F9AF25' AND Name = 'Applicability')) BEGIN
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
            'ffabace6-7f1a-4162-a487-60e74c2f3394',
            '58018ECE-83EF-4E05-A9D0-2F7E47F9AF25', -- Entity: MJ_BizApps_Orders: Product Prices
            26,
            'Applicability',
            'Applicability',
            'CompositeFilterDescriptor JSON (Kendo / mj-filter-builder). Null = always applies. Field names are Source.Field (e.g. BillToOrganization.Type). Evaluated in memory against Order, Product, bill-to/ship-to Person/Organization/Address.',
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '9b368f84-c9b1-451a-bf36-91b4c07545b0' OR (EntityID = '58018ECE-83EF-4E05-A9D0-2F7E47F9AF25' AND Name = 'ProductCategory')) BEGIN
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
            '9b368f84-c9b1-451a-bf36-91b4c07545b0',
            '58018ECE-83EF-4E05-A9D0-2F7E47F9AF25', -- Entity: MJ_BizApps_Orders: Product Prices
            29,
            'ProductCategory',
            'Product Category',
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
GO

/* Create Entity Relationship: MJ_BizApps_Orders: Product Categories -> MJ_BizApps_Orders: Product Prices (One To Many via ProductCategoryID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${mjSchema}].[EntityRelationship] WHERE [ID] = '9291984d-3e75-48ce-8a56-87c281da4fa2'
   )
   BEGIN
      INSERT INTO [${mjSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('9291984d-3e75-48ce-8a56-87c281da4fa2', 'B0FA90A6-6975-4C5E-ABC7-3AEA97700CC3', '58018ECE-83EF-4E05-A9D0-2F7E47F9AF25', 'ProductCategoryID', 'One To Many', 1, 1, 4, GETUTCDATE(), GETUTCDATE())
   END;
GO
