-- OrderLine.PriceOverridden + PriceOverrideReason.
-- Staff override of the engine unit price, with an optional why. RUN CODEGEN AFTER THIS
-- so vwOrderLines / CRUD procs / entity subclasses pick up the columns.

IF COL_LENGTH('__mj_BizAppsOrders.OrderLine', 'PriceOverridden') IS NULL
BEGIN
    ALTER TABLE [__mj_BizAppsOrders].[OrderLine]
        ADD [PriceOverridden] BIT NOT NULL
            CONSTRAINT [DF_OrderLine_PriceOverridden] DEFAULT (0);
END
GO

IF COL_LENGTH('__mj_BizAppsOrders.OrderLine', 'PriceOverrideReason') IS NULL
BEGIN
    ALTER TABLE [__mj_BizAppsOrders].[OrderLine]
        ADD [PriceOverrideReason] NVARCHAR(MAX) NULL;
END
GO

IF NOT EXISTS (
    SELECT 1
    FROM sys.extended_properties
    WHERE major_id = OBJECT_ID('[__mj_BizAppsOrders].[OrderLine]')
      AND minor_id = COLUMNPROPERTY(OBJECT_ID('[__mj_BizAppsOrders].[OrderLine]'), 'PriceOverridden', 'ColumnId')
      AND name = 'MS_Description'
)
BEGIN
    EXEC sp_addextendedproperty
        @name = N'MS_Description',
        @value = N'1 when UnitPrice was set by a staff override (named list pick or typed amount) rather than the pricing engine. 0 is the engine price.',
        @level0type = N'SCHEMA', @level0name = N'__mj_BizAppsOrders',
        @level1type = N'TABLE',  @level1name = N'OrderLine',
        @level2type = N'COLUMN', @level2name = N'PriceOverridden';
END
GO

IF NOT EXISTS (
    SELECT 1
    FROM sys.extended_properties
    WHERE major_id = OBJECT_ID('[__mj_BizAppsOrders].[OrderLine]')
      AND minor_id = COLUMNPROPERTY(OBJECT_ID('[__mj_BizAppsOrders].[OrderLine]'), 'PriceOverrideReason', 'ColumnId')
      AND name = 'MS_Description'
)
BEGIN
    EXEC sp_addextendedproperty
        @name = N'MS_Description',
        @value = N'Optional staff note for why the engine price was overridden. NULL when PriceOverridden = 0 or when no reason was given.',
        @level0type = N'SCHEMA', @level0name = N'__mj_BizAppsOrders',
        @level1type = N'TABLE',  @level1name = N'OrderLine',
        @level2type = N'COLUMN', @level2name = N'PriceOverrideReason';
END
GO
