-- Product.MaxQuantityPerLine: cap quantity on a single order line.
-- NULL = no cap. 1 = one unit per line (conference tickets: one attendee
-- per line; more people means more lines). RUN CODEGEN AFTER THIS.

IF COL_LENGTH('__mj_BizAppsOrders.Product', 'MaxQuantityPerLine') IS NULL
BEGIN
    ALTER TABLE [__mj_BizAppsOrders].[Product]
        ADD [MaxQuantityPerLine] DECIMAL(18, 4) NULL;
END
GO

IF NOT EXISTS (
    SELECT 1
    FROM sys.check_constraints
    WHERE name = 'CK_Product_MaxQuantityPerLine'
      AND parent_object_id = OBJECT_ID('[__mj_BizAppsOrders].[Product]')
)
BEGIN
    ALTER TABLE [__mj_BizAppsOrders].[Product]
        ADD CONSTRAINT CK_Product_MaxQuantityPerLine
        CHECK ([MaxQuantityPerLine] IS NULL OR [MaxQuantityPerLine] >= 1);
END
GO

-- Event products are one-attendee-per-line. Existing catalog rows get the cap.
UPDATE p
    SET p.[MaxQuantityPerLine] = 1
FROM [__mj_BizAppsOrders].[Product] AS p
INNER JOIN [__mj_BizAppsOrders].[ProductType] AS t
    ON t.[ID] = p.[ProductTypeID]
WHERE p.[MaxQuantityPerLine] IS NULL
  AND t.[OrderLineExtensionEntity] LIKE N'%Event Order Line%';
GO

IF NOT EXISTS (
    SELECT 1
    FROM sys.extended_properties
    WHERE major_id = OBJECT_ID('[__mj_BizAppsOrders].[Product]')
      AND minor_id = COLUMNPROPERTY(OBJECT_ID('[__mj_BizAppsOrders].[Product]'), 'MaxQuantityPerLine', 'ColumnId')
      AND name = 'MS_Description'
)
BEGIN
    EXEC sp_addextendedproperty
        @name = N'MS_Description',
        @value = N'Maximum quantity allowed on a single order line. NULL = no cap. Set to 1 for products that are one person / one unit per line (e.g. conference tickets).',
        @level0type = N'SCHEMA', @level0name = N'__mj_BizAppsOrders',
        @level1type = N'TABLE',  @level1name = N'Product',
        @level2type = N'COLUMN', @level2name = N'MaxQuantityPerLine';
END
GO
