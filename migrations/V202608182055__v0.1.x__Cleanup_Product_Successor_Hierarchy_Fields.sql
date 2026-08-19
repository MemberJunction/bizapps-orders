-- =============================================================================
-- Migration: Cleanup orphaned SuccessorProductID hierarchy fields on Products
-- =============================================================================
-- SuccessorProductID is a self-referencing foreign key for product retirement /
-- succession chains, not a recursive category/line hierarchy tree. Stale hierarchy
-- fields (RootSuccessorProductID, SuccessorProductIDChildCount, etc.) in EntityField
-- cause RunView queries against vwProducts to fail.
-- =============================================================================

DECLARE @ProductEntityID UNIQUEIDENTIFIER = (
    SELECT ID FROM [${mjSchema}].[Entity] WHERE [Name] = 'MJ_BizApps_Orders: Products'
);

IF @ProductEntityID IS NOT NULL
BEGIN
    DELETE FROM [${mjSchema}].[EntityField]
    WHERE [EntityID] = @ProductEntityID
      AND [Name] IN (
        'RootSuccessorProductID',
        'SuccessorProductIDChildCount',
        'SuccessorProductIDDepth',
        'SuccessorProductIDIsLeaf',
        'SuccessorProductIDPath'
      );
END
GO
