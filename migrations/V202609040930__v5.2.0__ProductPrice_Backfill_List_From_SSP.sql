-- One-time: products that only had StandaloneSellingPrice get a List ProductPrice.
-- Quoting reads ProductPrice. SSP on Product is deprecated (metadata), not dropped.

INSERT INTO [__mj_BizAppsOrders].[ProductPrice]
    ([ID], [ProductID], [Name], [PricingModel], [FeeType], [Amount], [EffectiveFrom], [Priority], [Status])
SELECT
    NEWID(),
    p.[ID],
    N'List',
    N'PerUnit',
    N'Standard',
    p.[StandaloneSellingPrice],
    '2020-01-01',
    0,
    N'Active'
FROM [__mj_BizAppsOrders].[Product] p
WHERE p.[StandaloneSellingPrice] IS NOT NULL
  AND p.[StandaloneSellingPrice] > 0
  AND NOT EXISTS (
      SELECT 1
      FROM [__mj_BizAppsOrders].[ProductPrice] pp
      WHERE pp.[ProductID] = p.[ID]
  );
GO
