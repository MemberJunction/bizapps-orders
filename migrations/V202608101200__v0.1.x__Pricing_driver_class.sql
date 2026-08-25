-- =====================================================================================================
-- `PricingDriverClass` — name the custom pricing plugin in METADATA, not only in code.
--
-- WHY THIS COLUMN EXISTS
--
-- `BasePriceResolver` plugins are registered by ClassFactory key alone:
--
--     @RegisterClass(BasePriceResolver, `Company:${someCompanyId}`)
--
-- Nothing in the database records that such a resolver exists. That has two consequences, and the
-- second is the one that matters:
--
--   1. Every integration run logs `ClassFactory: no registration found for base class
--      'BasePriceResolver' with key 'Company:...'` and falls back to the default. Noise, mostly.
--   2. A CLIENT cannot know whether a product prices normally. Pricing is moving to a shared class so
--      the browser can run the metadata-driven walk locally — instant, no server round trip — but it
--      must escalate to the server for anything a plugin decides. Without a flag in metadata the
--      client would quietly price with the DEFAULT resolver and show a number the booking then
--      disagrees with. A wrong price on screen that corrects itself at confirm is exactly the class
--      of failure this app spends its guard rails preventing.
--
-- WHERE IT HANGS, AND WHY FOUR PLACES
--
-- The same resolution shape `GLAccountResolver` already walks: the most specific answer wins.
--
--     Product  ->  ProductCategory (up the parent chain)  ->  ProductType  ->  OrderCompanyPolicy
--
-- A product may price specially on its own; a whole category may (event tickets); a type may
-- (usage-metered products); and a company may have a house resolver, which is where every plugin
-- registered today is keyed. All four are NULL by default, and all-NULL is what tells a client it may
-- price locally.
--
-- NULL means "no plugin", NOT "unknown". A column added to an existing table defaults to NULL, so
-- every product in every installed database becomes locally priceable the moment this applies — which
-- is correct: none of them had a plugin a moment ago either.
--
-- Idempotent. Adds no default and no constraint beyond the length: the value is a ClassFactory key,
-- and the set of legal keys lives in code, not in a CHECK that would go stale the first time somebody
-- registers a new resolver.
--
-- RUN CODEGEN AFTER THIS, as `docs/database-migrations.md` describes — the columns are plain DDL and
-- registering them as `EntityField` rows is CodeGen's job. The generated SQL is deliberately NOT
-- shipped alongside: `spUpdateExistingEntitiesFromSchema` creates those rows from the schema itself,
-- so replaying CodeGen's explicit inserts on a database that has already run it collides on the
-- primary key. Migrate, then generate.
-- =====================================================================================================

IF COL_LENGTH('__mj_BizAppsOrders.Product', 'PricingDriverClass') IS NULL
BEGIN
    ALTER TABLE [__mj_BizAppsOrders].[Product] ADD [PricingDriverClass] NVARCHAR(255) NULL;
END
GO

IF COL_LENGTH('__mj_BizAppsOrders.ProductCategory', 'PricingDriverClass') IS NULL
BEGIN
    ALTER TABLE [__mj_BizAppsOrders].[ProductCategory] ADD [PricingDriverClass] NVARCHAR(255) NULL;
END
GO

IF COL_LENGTH('__mj_BizAppsOrders.ProductType', 'PricingDriverClass') IS NULL
BEGIN
    ALTER TABLE [__mj_BizAppsOrders].[ProductType] ADD [PricingDriverClass] NVARCHAR(255) NULL;
END
GO

IF COL_LENGTH('__mj_BizAppsOrders.OrderCompanyPolicy', 'PricingDriverClass') IS NULL
BEGIN
    ALTER TABLE [__mj_BizAppsOrders].[OrderCompanyPolicy] ADD [PricingDriverClass] NVARCHAR(255) NULL;
END
GO

-- Descriptions, so the column explains itself in CodeGen output and in any schema browser.
DECLARE @desc SQL_VARIANT = N'ClassFactory key of a BasePriceResolver subclass that prices this, or NULL for the standard metadata-driven walk. Resolved most-specific-first: product, then up the category chain, then the type, then the company policy. A client may price LOCALLY only when every level is NULL; anything else escalates to the server, because a plugin''s answer cannot be reproduced from metadata.';

IF NOT EXISTS (SELECT 1 FROM sys.extended_properties WHERE major_id = OBJECT_ID('__mj_BizAppsOrders.Product') AND minor_id = COLUMNPROPERTY(OBJECT_ID('__mj_BizAppsOrders.Product'), 'PricingDriverClass', 'ColumnId') AND name = 'MS_Description')
    EXEC sp_addextendedproperty 'MS_Description', @desc, 'SCHEMA', '__mj_BizAppsOrders', 'TABLE', 'Product', 'COLUMN', 'PricingDriverClass';
GO

DECLARE @descCat SQL_VARIANT = N'ClassFactory key of a BasePriceResolver subclass for every product in this category (and, unless overridden, its child categories), or NULL. See Product.PricingDriverClass for the resolution order.';
IF NOT EXISTS (SELECT 1 FROM sys.extended_properties WHERE major_id = OBJECT_ID('__mj_BizAppsOrders.ProductCategory') AND minor_id = COLUMNPROPERTY(OBJECT_ID('__mj_BizAppsOrders.ProductCategory'), 'PricingDriverClass', 'ColumnId') AND name = 'MS_Description')
    EXEC sp_addextendedproperty 'MS_Description', @descCat, 'SCHEMA', '__mj_BizAppsOrders', 'TABLE', 'ProductCategory', 'COLUMN', 'PricingDriverClass';
GO

DECLARE @descType SQL_VARIANT = N'ClassFactory key of a BasePriceResolver subclass for every product of this type, or NULL. The natural home for behaviour-wide pricing such as usage metering.';
IF NOT EXISTS (SELECT 1 FROM sys.extended_properties WHERE major_id = OBJECT_ID('__mj_BizAppsOrders.ProductType') AND minor_id = COLUMNPROPERTY(OBJECT_ID('__mj_BizAppsOrders.ProductType'), 'PricingDriverClass', 'ColumnId') AND name = 'MS_Description')
    EXEC sp_addextendedproperty 'MS_Description', @descType, 'SCHEMA', '__mj_BizAppsOrders', 'TABLE', 'ProductType', 'COLUMN', 'PricingDriverClass';
GO

DECLARE @descCo SQL_VARIANT = N'ClassFactory key of this company''s house BasePriceResolver, or NULL. This is where every plugin registered before this column existed was keyed (Company:<id>), so it is the level that makes those visible to metadata.';
IF NOT EXISTS (SELECT 1 FROM sys.extended_properties WHERE major_id = OBJECT_ID('__mj_BizAppsOrders.OrderCompanyPolicy') AND minor_id = COLUMNPROPERTY(OBJECT_ID('__mj_BizAppsOrders.OrderCompanyPolicy'), 'PricingDriverClass', 'ColumnId') AND name = 'MS_Description')
    EXEC sp_addextendedproperty 'MS_Description', @descCo, 'SCHEMA', '__mj_BizAppsOrders', 'TABLE', 'OrderCompanyPolicy', 'COLUMN', 'PricingDriverClass';
GO




















































-- =============================================================================
-- REFRESH METADATA
-- =============================================================================

/* SQL text to recompile all views */
EXEC [__mj].spRecompileAllViews
GO

/* SQL text to update existing entities from schema */
EXEC [__mj].spUpdateExistingEntitiesFromSchema @ExcludedSchemaNames='sys,staging'
GO

/* SQL text to sync schema info from database schemas */
EXEC [__mj].spUpdateSchemaInfoFromDatabase @ExcludedSchemaNames='sys,staging'
GO

/* SQL text to delete unneeded entity fields */
EXEC [__mj].spDeleteUnneededEntityFields @ExcludedSchemaNames='sys,staging'
GO

/* SQL text to update existing entity fields from schema */
EXEC [__mj].spUpdateExistingEntityFieldsFromSchema @ExcludedSchemaNames='sys,staging'
GO

/* SQL text to set default column width where needed */
EXEC [__mj].spSetDefaultColumnWidthWhereNeeded @ExcludedSchemaNames='sys,staging'
GO

/* SQL text to recompile all stored procedures in dependency order */
EXEC [__mj].spRecompileAllProceduresInDependencyOrder @ExcludedSchemaNames='sys,staging', @LogOutput=0, @ContinueOnError=1
GO
